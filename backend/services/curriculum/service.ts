/**
 * Curriculum Service
 * 
 * Responsibility: Provide curriculum data (programs, courses, prerequisites)
 * Handles formatting and business logic; delegates data access to data-access layer
 * 
 * Current location of implementation: /lib/db/curriculum.ts
 */

import type {
  BlockedNextCourseOption,
  CurriculumContext,
  EligibleNextCourseOption,
  NextCoursesRecommendation,
  NextCourseOption,
  ProgramOverview,
  PrerequisiteResult,
} from "@/shared/contracts"
import {
  getProgram,
  getCurriculumSlots,
  getCourseByCode,
  getCoursePrerequisites,
  listPrograms,
} from "@/backend/data-access/curriculum"
import { getUserCourseStatuses } from "@/backend/data-access/pdf-parsing"

const SEMESTER_LABELS: Record<number, string> = {
  1: "Freshman Fall",
  2: "Freshman Spring",
  3: "Sophomore Fall",
  4: "Sophomore Spring",
  5: "Junior Fall",
  6: "Junior Spring",
  7: "Senior Fall",
  8: "Senior Spring",
}

export function parseCatalogYear(value?: string | null): number | null {
  if (!value) return null
  const match = value.match(/(20\d{2})/)
  if (!match) return null
  return Number(match[1])
}

export function resolveCatalogYearFromQuestion(
  question: string,
  fallbackBulletinYear?: string | null
): number | null {
  // Prefer explicit year mention in the user's question, e.g. "2021" or "2023-2024".
  const questionMatch = question.match(/\b(20\d{2})(?:\s*[-/]\s*20\d{2})?\b/)
  if (questionMatch) {
    return Number(questionMatch[1])
  }

  return parseCatalogYear(fallbackBulletinYear)
}

interface SlotCourseSummary {
  courseId: string
  title: string
  creditHours: number
  semesterNumber: number
  semesterLabel: string
  slotOrder: number
}

function toSlotCourseSummary(slot: {
  semester_number: number
  slot_order: number
  courses: { course_id: string; title: string; credit_hours: number } | { course_id: string; title: string; credit_hours: number }[] | null
}): SlotCourseSummary | null {
  const relation = Array.isArray(slot.courses) ? slot.courses[0] : slot.courses
  if (!relation) return null

  const semesterNumber = slot.semester_number
  return {
    courseId: relation.course_id,
    title: relation.title,
    creditHours: relation.credit_hours,
    semesterNumber,
    semesterLabel: SEMESTER_LABELS[semesterNumber] ?? `Semester ${semesterNumber}`,
    slotOrder: slot.slot_order,
  }
}

function buildMissingGroups(
  prereq: PrerequisiteResult | null,
  completedCourseCodes: Set<string>
): string[] {
  if (!prereq || prereq.groups.length === 0) {
    return []
  }

  const missing: string[] = []
  for (const group of prereq.groups) {
    const satisfied = group.options.some((option) =>
      completedCourseCodes.has(option.courseId.trim().toUpperCase())
    )

    if (!satisfied) {
      missing.push(group.options.map((option) => option.courseId).join(" OR "))
    }
  }

  return missing
}

/**
 * Recommend next courses for a user based on completed/in-progress mappings
 * and prerequisite satisfaction in a target program year.
 */
export async function recommendNextCoursesForUser(params: {
  userId: string
  programCode: string
  bulletinYear?: string | null
  maxRecommendations?: number
}): Promise<NextCoursesRecommendation | null> {
  const userId = params.userId.trim()
  const programCode = params.programCode.trim().toUpperCase()
  if (!userId || !programCode) return null

  const catalogYear = parseCatalogYear(params.bulletinYear)
  const program = await getProgram(programCode, catalogYear)
  if (!program) return null

  const [slots, userCourses] = await Promise.all([
    getCurriculumSlots(program.id),
    getUserCourseStatuses(userId),
  ])

  if (slots.length === 0) return null

  const completedCourseCodes = new Set(
    userCourses
      .filter((course) => course.status === "completed")
      .map((course) => course.code.trim().toUpperCase())
  )

  const inProgressCourseCodes = new Set(
    userCourses
      .filter((course) => course.status === "in_progress")
      .map((course) => course.code.trim().toUpperCase())
  )

  const targetSlots = slots
    .filter((slot) => !slot.is_elective_slot)
    .map(toSlotCourseSummary)
    .filter((course): course is SlotCourseSummary => Boolean(course))

  const uniqueTargetCourseIds = Array.from(new Set(targetSlots.map((slot) => slot.courseId)))
  const prereqResults = await Promise.all(
    uniqueTargetCourseIds.map(async (courseId) => ({
      courseId,
      prereq: await fetchCoursePrerequisitesByCode(courseId),
    }))
  )

  const prereqByCourse = new Map(prereqResults.map((result) => [result.courseId, result.prereq]))

  const eligibleNow: (EligibleNextCourseOption & { slotOrder: number })[] = []
  const blocked: (BlockedNextCourseOption & { slotOrder: number })[] = []
  const alreadyInProgress: (NextCourseOption & { slotOrder: number })[] = []
  const seen = new Set<string>()

  for (const slot of targetSlots) {
    const normalizedCourseId = slot.courseId.trim().toUpperCase()
    if (seen.has(normalizedCourseId)) continue
    seen.add(normalizedCourseId)

    if (completedCourseCodes.has(normalizedCourseId)) {
      continue
    }

    const base: NextCourseOption & { slotOrder: number } = {
      courseId: slot.courseId,
      title: slot.title,
      creditHours: slot.creditHours,
      semesterNumber: slot.semesterNumber,
      semesterLabel: slot.semesterLabel,
      slotOrder: slot.slotOrder,
    }

    if (inProgressCourseCodes.has(normalizedCourseId)) {
      alreadyInProgress.push(base)
      continue
    }

    const missingGroups = buildMissingGroups(prereqByCourse.get(slot.courseId) ?? null, completedCourseCodes)
    if (missingGroups.length === 0) {
      eligibleNow.push({
        ...base,
        reason: "All listed prerequisites are satisfied based on completed courses.",
      })
      continue
    }

    blocked.push({
      ...base,
      missingPrerequisiteGroups: missingGroups,
    })
  }

  const sorter = <T extends { semesterNumber: number; slotOrder: number }>(a: T, b: T) => {
    if (a.semesterNumber !== b.semesterNumber) {
      return a.semesterNumber - b.semesterNumber
    }
    return a.slotOrder - b.slotOrder
  }

  const maxRecommendations = Math.max(1, params.maxRecommendations ?? 12)
  eligibleNow.sort(sorter)
  blocked.sort(sorter)
  alreadyInProgress.sort(sorter)

  return {
    programCode: program.code,
    catalogYear: program.catalog_year ?? null,
    completedCount: completedCourseCodes.size,
    inProgressCount: inProgressCourseCodes.size,
    eligibleNow: eligibleNow.slice(0, maxRecommendations).map(({ slotOrder: _slotOrder, ...course }) => course),
    blocked: blocked.slice(0, maxRecommendations).map(({ slotOrder: _slotOrder, ...course }) => course),
    alreadyInProgress: alreadyInProgress
      .slice(0, maxRecommendations)
      .map(({ slotOrder: _slotOrder, ...course }) => course),
  }
}

/**
 * Fetch full curriculum context for a program
 * Used by chat service to understand degree requirements
 */
export async function fetchCurriculumContext(
  programCode: string,
  catalogYear?: number | null
): Promise<CurriculumContext | null> {
  const program = await getProgram(programCode, catalogYear)
  if (!program) return null

  const slots = await getCurriculumSlots(program.id)
  if (slots.length === 0) return null

  // Group by semester and format as readable text
  const bySemester: Record<number, string[]> = {}

  for (const slot of slots) {
    const sem = slot.semester_number
    if (!bySemester[sem]) bySemester[sem] = []

    const courseRelation = slot.courses as
      | { course_id: string; title: string; credit_hours: number; is_capstone: boolean }
      | Array<{ course_id: string; title: string; credit_hours: number; is_capstone: boolean }>
      | null
    const course = Array.isArray(courseRelation) ? courseRelation[0] : courseRelation

    if (slot.is_elective_slot) {
      bySemester[sem].push(
        `  - [Elective] ${slot.slot_label} (${slot.credit_hours} cr)`
      )
    } else if (course) {
      const capstone = course.is_capstone ? " [CAPSTONE]" : ""
      const minGrade = slot.min_grade ? ` — min grade: ${slot.min_grade}` : ""
      bySemester[sem].push(
        `  - ${course.course_id}: ${course.title} (${course.credit_hours} cr)${capstone}${minGrade}`
      )
    }
  }

  const semesterBlocks = Object.entries(bySemester)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([sem, lines]) => {
      const label = SEMESTER_LABELS[Number(sem)] ?? `Semester ${sem}`
      return `${label}:\n${lines.join("\n")}`
    })
    .join("\n\n")

  const formattedText = `Program: ${program.name} (${program.code})
Total Credit Hours Required: ${program.total_credit_hours}

4-Year Curriculum Plan:
${semesterBlocks}`

  return {
    programCode: program.code,
    programName: program.name,
    totalCreditHours: program.total_credit_hours,
    formattedText,
  }
}

/**
 * Fetch program metadata and statistics
 */
export async function fetchProgramOverview(
  programCode: string,
  catalogYear?: number | null
): Promise<ProgramOverview | null> {
  const program = await getProgram(programCode, catalogYear)
  if (!program) return null

  const slots = await getCurriculumSlots(program.id)
  if (slots.length === 0) return null

  const semesters = new Set<number>()
  let electiveSlots = 0

  for (const slot of slots) {
    semesters.add(slot.semester_number as number)
    if (slot.is_elective_slot) electiveSlots += 1
  }

  return {
    programCode: program.code as string,
    programName: program.name as string,
    totalCreditHours: program.total_credit_hours as number,
    semesterCount: semesters.size,
    totalSlots: slots.length,
    electiveSlots,
  }
}

/**
 * Fetch course prerequisites by course code
 */
export async function fetchCoursePrerequisitesByCode(
  courseCode: string
): Promise<PrerequisiteResult | null> {
  const course = await getCourseByCode(courseCode)
  if (!course) return null

  const prereqs = await getCoursePrerequisites(course.id)
  if (prereqs.length === 0) {
    return {
      courseId: course.course_id as string,
      title: course.title as string,
      groups: [],
    }
  }

  const grouped = new Map<number, PrerequisiteResult["groups"][number]>()

  for (const row of prereqs as Array<{
    prereq_group: number
    min_grade: string | null
    prerequisite: { course_id: string; title: string } | { course_id: string; title: string }[] | null
  }>) {
    const groupId = row.prereq_group
    if (!grouped.has(groupId)) {
      grouped.set(groupId, { prereqGroup: groupId, options: [] })
    }

    const prereq = Array.isArray(row.prerequisite)
      ? row.prerequisite[0]
      : row.prerequisite

    if (!prereq) continue

    grouped.get(groupId)!.options.push({
      courseId: prereq.course_id,
      title: prereq.title,
      minGrade: row.min_grade,
    })
  }

  return {
    courseId: course.course_id as string,
    title: course.title as string,
    groups: Array.from(grouped.values()).sort((a, b) => a.prereqGroup - b.prereqGroup),
  }
}

/**
 * Format prerequisite data for LLM processing
 * Converts structured prerequisite data to natural text for generateDbResponse
 */
export function formatPrerequisiteForLLM(prereq: PrerequisiteResult): string {
  if (prereq.groups.length === 0) {
    return `Course: ${prereq.courseId} - ${prereq.title}
Prerequisites: No prerequisites required for this course.`
  }

  const groupTexts = prereq.groups.map((group) => {
    const options = group.options
      .map((opt) => {
        const gradeRequirement = opt.minGrade ? ` (minimum grade: ${opt.minGrade})` : ""
        return `${opt.courseId} - ${opt.title}${gradeRequirement}`
      })
      .join(" OR ")

    return `Group ${group.prereqGroup}: ${options}`
  })

  return `Course: ${prereq.courseId} - ${prereq.title}
Prerequisites:
${groupTexts.map((g) => `• ${g}`).join("\n")}`
}

/**
 * Format program/curriculum data for LLM processing
 * Converts curriculum data to natural text for generateDbResponse
 */
export function formatCurriculumForLLM(
  overview: ProgramOverview,
  curriculum: CurriculumContext
): string {
  return `Program: ${overview.programName} (${overview.programCode})
Total Credit Hours Required: ${overview.totalCreditHours}
Number of Semesters: ${overview.semesterCount}
Total Courses/Slots: ${overview.totalSlots}
Elective Slots: ${overview.electiveSlots}

Detailed Curriculum:
${curriculum.formattedText}`
}

/**
 * Resolve program code from natural-language question.
 * Falls back to session program code when no explicit program mention is found.
 */
export async function resolveProgramCodeFromQuestion(
  question: string,
  fallbackProgramCode?: string | null,
  catalogYear?: number | null
): Promise<string | null> {
  const normalizedQuestion = question.toLowerCase()
  const normalizedFallback = fallbackProgramCode?.trim().toUpperCase() ?? null

  const programs = await listPrograms()
  if (programs.length === 0) {
    return normalizedFallback
  }

  const groupedPrograms = new Map<string, { code: string; name: string; years: Set<number> }>()
  for (const program of programs) {
    const key = `${program.code}|${program.name}`
    if (!groupedPrograms.has(key)) {
      groupedPrograms.set(key, {
        code: program.code,
        name: program.name,
        years: new Set<number>(),
      })
    }
    groupedPrograms.get(key)!.years.add(program.catalog_year)
  }
  const uniquePrograms = Array.from(groupedPrograms.values())

  // Prefer explicit code mention (e.g., BSCS-BS).
  for (const program of uniquePrograms) {
    if (normalizedQuestion.includes(program.code.toLowerCase())) {
      return program.code
    }
  }

  type Candidate = { code: string; score: number }
  const candidates: Candidate[] = []

  // Rank by phrase + token overlap to avoid false positives (e.g., generic "science").
  for (const program of uniquePrograms) {
    const name = program.name.toLowerCase()
    const normalizedName = name.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
    const tokens = normalizedName
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)

    if (tokens.length === 0) continue

    let score = 0

    if (normalizedQuestion.includes(normalizedName)) {
      score += 100
    }

    const matchedTokens = tokens.filter((token) => normalizedQuestion.includes(token)).length
    score += matchedTokens * 10

    if (matchedTokens === tokens.length) {
      score += 30
    }

    // Reward common two-word phrase matches like "computer science".
    for (let i = 0; i < tokens.length - 1; i++) {
      const phrase = `${tokens[i]} ${tokens[i + 1]}`
      if (normalizedQuestion.includes(phrase)) {
        score += 20
      }
    }

    if (typeof catalogYear === "number") {
      if (program.years.has(catalogYear)) {
        score += 25
      } else if (program.years.has(catalogYear - 1) || program.years.has(catalogYear + 1)) {
        score += 10
      } else {
        score -= 5
      }
    }

    if (score > 0) {
      candidates.push({ code: program.code, score })
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score)
    return candidates[0].code
  }

  return normalizedFallback
}
