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
  GraduationGap,
  NeedsRetakeSlot,
  SemesterRemaining,
  ElectiveSlotOption,
  ConcentrationRequirement,
  ConcentrationRequirementsResult,
} from "@/shared/contracts"
import {
  getProgram,
  getCurriculumSlots,
  getCourseByCode,
  getCoursePrerequisites,
  getElectiveSlotsWithEligible,
  listPrograms,
  getConcentrations,
  getConcentrationSlots,
  searchConcentrationsByName,
  getAvailableGECourses,
} from "@/backend/data-access/curriculum"
import type { GECourseRow } from "@/backend/data-access/curriculum"
import { getUserCourseStatuses } from "@/backend/data-access/pdf-parsing"

// Names and GPA requirements verified from aamu.edu, April 2026.
// All AAMU scholarships require 30 credit hours per academic year to renew.
export const AAMU_SCHOLARSHIP_RULES: Record<string, { minGpa: number; minCreditsPerYear: number }> = {
  'AAMU Presidential Scholarship':         { minGpa: 3.50, minCreditsPerYear: 30 },
  'AAMU Merit Scholarship':                { minGpa: 3.10, minCreditsPerYear: 30 },
  'AAMU Transfer Merit Scholarship':       { minGpa: 3.10, minCreditsPerYear: 30 },
  'AAMU Academic Recognition Scholarship': { minGpa: 2.80, minCreditsPerYear: 30 },
  'AAMU Heritage Gold Scholarship':        { minGpa: 2.80, minCreditsPerYear: 30 },
  'AAMU Heritage Silver Scholarship':      { minGpa: 2.80, minCreditsPerYear: 30 },
  'AAMU Heritage Bronze Scholarship':      { minGpa: 2.50, minCreditsPerYear: 30 },
  'AAMU Normalite Scholarship':            { minGpa: 2.80, minCreditsPerYear: 30 },
}

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
  // Only treat an explicit year-range as a catalog year (e.g., "2024-2025" or "2023/2024").
  // A bare four-digit year like "fall 2026" or "spring 2025" is a semester reference, not a catalog year,
  // and must not override the session's bulletinYear.
  const rangeMatch = question.match(/\b(20\d{2})\s*[-/]\s*20\d{2}\b/)
  if (rangeMatch) {
    return Number(rangeMatch[1])
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

/**
 * Normalize a course code by stripping honors suffix so ENG 101H matches ENG 101.
 * Handles both "ENG 101H" and "ENG101H" formats.
 */
function normalizeHonorsCourseCode(code: string): string {
  return code.trim().toUpperCase().replace(/([A-Z]{2,5}\s*\d{3})H$/, "$1")
}

const GRADE_ARRAY = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"]

function gradeAtLeast(earned: string | null | undefined, required: string | null | undefined): boolean {
  if (!required) return true
  if (!earned || earned === "REG") return false
  const earnedIdx = GRADE_ARRAY.indexOf(earned.trim().toUpperCase())
  const requiredIdx = GRADE_ARRAY.indexOf(required.trim().toUpperCase())
  if (earnedIdx === -1 || requiredIdx === -1) return true
  return earnedIdx >= requiredIdx
}

function buildMissingGroups(
  prereq: PrerequisiteResult | null,
  completedCourseCodes: Set<string>,
  courseGrades?: Map<string, string | null>   // code → grade earned
): string[] {
  if (!prereq || prereq.groups.length === 0) {
    return []
  }

  const missing: string[] = []
  for (const group of prereq.groups) {
    const satisfied = group.options.some((option) => {
      const normalized = normalizeHonorsCourseCode(option.courseId)
      const raw = option.courseId.trim().toUpperCase()
      const found = completedCourseCodes.has(normalized) || completedCourseCodes.has(raw)
      if (!found) return false

      // Check minimum grade if specified
      if (option.minGrade && courseGrades) {
        const earned = courseGrades.get(normalized) ?? courseGrades.get(raw) ?? null
        return gradeAtLeast(earned, option.minGrade)
      }
      return true
    })

    if (!satisfied) {
      const label = group.options
        .map((o) => o.minGrade ? `${o.courseId} (min ${o.minGrade})` : o.courseId)
        .join(" OR ")
      missing.push(label)
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
  hypotheticalCompleted?: string[] // simulate mode: treat these as completed
  upcomingRegisteredCodes?: Set<string> // pre-registered future-term codes — treated as planned, not blocking
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

  const completedCourseCodes = new Set<string>()
  const courseGrades = new Map<string, string | null>()

  for (const course of userCourses.filter((c) => c.status === "completed")) {
    const raw = course.code.trim().toUpperCase()
    const normalized = normalizeHonorsCourseCode(raw)
    completedCourseCodes.add(raw)
    completedCourseCodes.add(normalized)
    courseGrades.set(normalized, course.grade ?? null)
    if (raw !== normalized) courseGrades.set(raw, course.grade ?? null)
  }

  // Add hypothetical completions for simulate mode (no grade — treated as passing)
  if (params.hypotheticalCompleted) {
    for (const code of params.hypotheticalCompleted) {
      const raw = code.trim().toUpperCase()
      completedCourseCodes.add(raw)
      completedCourseCodes.add(normalizeHonorsCourseCode(raw))
    }
  }

  // Split in-progress into current-term and pre-registered (future-term)
  // Caller passes upcomingRegisteredCodes (course codes for future terms already locked in)
  const upcomingCodes = params.upcomingRegisteredCodes ?? new Set<string>()

  const currentTermCourseCodes = new Set<string>()
  const preRegisteredCourseCodes = new Set<string>()

  for (const course of userCourses.filter((c) => c.status === "in_progress")) {
    const raw = course.code.trim().toUpperCase()
    const normalized = normalizeHonorsCourseCode(raw)
    const codes = raw === normalized ? [raw] : [raw, normalized]
    if (upcomingCodes.has(raw) || upcomingCodes.has(normalized)) {
      codes.forEach((c) => preRegisteredCourseCodes.add(c))
    } else {
      codes.forEach((c) => currentTermCourseCodes.add(c))
    }
  }

  // All in-progress (both current and upcoming) for prerequisite satisfaction checks
  const inProgressCourseCodes = new Set([...currentTermCourseCodes, ...preRegisteredCourseCodes])

  // Courses that are in_progress count toward prerequisite satisfaction
  const takenCourseCodes = new Set([...completedCourseCodes, ...inProgressCourseCodes])

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
  const alreadyInProgress: (NextCourseOption & { slotOrder: number })[] = []  // current-term only
  const alreadyPlanned: (NextCourseOption & { slotOrder: number })[] = []     // pre-registered future-term
  const seen = new Set<string>()

  for (const slot of targetSlots) {
    const normalizedCourseId = normalizeHonorsCourseCode(slot.courseId)
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

    if (currentTermCourseCodes.has(normalizedCourseId)) {
      alreadyInProgress.push(base)
      continue
    }

    if (preRegisteredCourseCodes.has(normalizedCourseId)) {
      alreadyPlanned.push(base)
      continue
    }

    // Use takenCourseCodes (completed + in_progress) for prerequisite satisfaction; grades for min-grade checks
    const missingGroups = buildMissingGroups(prereqByCourse.get(slot.courseId) ?? null, takenCourseCodes, courseGrades)
    if (missingGroups.length === 0) {
      eligibleNow.push({
        ...base,
        reason: "All listed prerequisites are satisfied based on completed and in-progress courses.",
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
  alreadyPlanned.sort(sorter)

  // Compute credit totals for current-term and pre-registered courses from raw user data
  const currentTermCredits = userCourses
    .filter((c) => c.status === "in_progress" && !upcomingCodes.has(c.code.trim().toUpperCase()))
    .reduce((sum, c) => sum + (c.creditHours ?? 0), 0)

  const preRegisteredCredits = userCourses
    .filter((c) => c.status === "in_progress" && upcomingCodes.has(c.code.trim().toUpperCase()))
    .reduce((sum, c) => sum + (c.creditHours ?? 0), 0)

  return {
    programCode: program.code,
    catalogYear: program.catalog_year ?? null,
    completedCount: completedCourseCodes.size,
    currentTermCount: currentTermCourseCodes.size,
    preRegisteredCount: preRegisteredCourseCodes.size,
    currentTermCredits,
    preRegisteredCredits,
    semesterCreditCap: 19,
    eligibleNow: eligibleNow.slice(0, maxRecommendations).map(({ slotOrder: _slotOrder, ...course }) => course),
    blocked: blocked.slice(0, maxRecommendations).map(({ slotOrder: _slotOrder, ...course }) => course),
    alreadyInProgress: alreadyInProgress
      .slice(0, maxRecommendations)
      .map(({ slotOrder: _slotOrder, ...course }) => course),
    alreadyPlanned: alreadyPlanned
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

  // If we already know the student's program from their profile, don't override it
  // unless the question explicitly names a different program by name or code.
  // This prevents catalog-year boost from selecting a wrong program (e.g. URP instead of CS).
  if (normalizedFallback) {
    // Check if the question explicitly names a DIFFERENT program
    const explicitProgramMatch = uniquePrograms.find((program) => {
      if (program.code === normalizedFallback) return false // skip their own program
      const name = program.name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim()
      // Only count as explicit if the full program name or a distinctive 2-word phrase appears
      if (normalizedQuestion.includes(name)) return true
      const tokens = name.split(" ").filter((t) => t.length >= 4)
      for (let i = 0; i < tokens.length - 1; i++) {
        const phrase = `${tokens[i]} ${tokens[i + 1]}`
        if (phrase.length >= 8 && normalizedQuestion.includes(phrase)) return true
      }
      return false
    })
    if (explicitProgramMatch) return explicitProgramMatch.code
    return normalizedFallback
  }

  type Candidate = { code: string; score: number }
  const candidates: Candidate[] = []

  // No fallback — rank by phrase + token overlap only (no catalog-year boost to avoid false positives).
  for (const program of uniquePrograms) {
    const name = program.name.toLowerCase()
    const normalizedName = name.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
    const tokens = normalizedName
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 4) // require 4+ chars to reduce noise

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
      if (phrase.length >= 8 && normalizedQuestion.includes(phrase)) {
        score += 20
      }
    }

    if (score > 0) {
      candidates.push({ code: program.code, score })
    }
  }

  if (candidates.length > 0) {
    // Sort by score DESC, then by most recent catalog year DESC to break ties
    // (avoids returning old program codes like BSCS-BS when EECS-BSCS is the current one)
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const aMaxYear = Math.max(...(groupedPrograms.get(`${a.code}|${uniquePrograms.find(p => p.code === a.code)?.name ?? ""}`)?.years ?? [0]))
      const bMaxYear = Math.max(...(groupedPrograms.get(`${b.code}|${uniquePrograms.find(p => p.code === b.code)?.name ?? ""}`)?.years ?? [0]))
      return bMaxYear - aMaxYear
    })
    return candidates[0].code
  }

  return null
}

/**
 * Compute graduation gap — what's remaining by semester, mirroring DegreeWorks view.
 * Compares completed/in-progress courses against all curriculum slots.
 */
// Grade ordering for min_grade comparison: higher index = higher grade
const GRADE_ORDER: Record<string, number> = {
  "F": 0, "D-": 1, "D": 2, "D+": 3,
  "C-": 4, "C": 5, "C+": 6,
  "B-": 7, "B": 8, "B+": 9,
  "A-": 10, "A": 11, "A+": 12,
}

function gradeValue(grade: string): number {
  return GRADE_ORDER[grade.trim().toUpperCase()] ?? -1
}

function meetsMinGrade(earned: string | null, required: string | null): boolean {
  if (!required || !earned) return true  // no requirement or no grade recorded → assume OK
  const earnedVal = gradeValue(earned)
  const requiredVal = gradeValue(required)
  if (earnedVal < 0 || requiredVal < 0) return true  // unrecognized grade format → assume OK
  return earnedVal >= requiredVal
}

export async function computeGraduationGap(params: {
  userId: string
  programCode: string
  bulletinYear?: string | null
}): Promise<GraduationGap | null> {
  const programCode = params.programCode.trim().toUpperCase()
  const catalogYear = parseCatalogYear(params.bulletinYear)

  const program = await getProgram(programCode, catalogYear)
  if (!program) return null

  const [slots, userCourses, electiveSlots] = await Promise.all([
    getCurriculumSlots(program.id),
    getUserCourseStatuses(params.userId),
    getElectiveSlotsWithEligible(program.id),
  ])

  if (slots.length === 0) return null

  const completedCourseCodes = new Set(
    userCourses
      .filter((c) => c.status === "completed")
      .flatMap((c) => {
        const raw = c.code.trim().toUpperCase()
        const norm = normalizeHonorsCourseCode(raw)
        return raw === norm ? [raw] : [raw, norm]
      })
  )

  // Determine current term vs pre-registered using the same calendar logic as splitInProgressByTerm
  const now = new Date()
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth() + 1
  const nowSeason = nowMonth <= 5 ? 0 : nowMonth <= 7 ? 1 : 2 // 0=Spring,1=Summer,2=Fall

  function isUpcomingTerm(term: string | null): boolean {
    if (!term) return false
    const m = term.match(/^(Spring|Summer|Fall)\s+(\d{4})$/i)
    if (!m) return false
    const season = { spring: 0, summer: 1, fall: 2 }[m[1].toLowerCase()] ?? 0
    const year = parseInt(m[2])
    return year > nowYear || (year === nowYear && season > nowSeason)
  }

  const inProgressCourses = userCourses.filter((c) => c.status === "in_progress")
  const currentTermCourses = inProgressCourses.filter((c) => !isUpcomingTerm(c.term ?? null))
  const preRegisteredCourses = inProgressCourses.filter((c) => isUpcomingTerm(c.term ?? null))

  const inProgressCourseCodes = new Set(
    inProgressCourses.flatMap((c) => {
      const raw = c.code.trim().toUpperCase()
      const norm = normalizeHonorsCourseCode(raw)
      return raw === norm ? [raw] : [raw, norm]
    })
  )

  const creditsCompleted = userCourses
    .filter((c) => c.status === "completed")
    .reduce((sum, c) => sum + (c.creditHours ?? 0), 0)

  const creditsCurrentTerm = currentTermCourses.reduce((sum, c) => sum + (c.creditHours ?? 0), 0)
  const creditsPreRegistered = preRegisteredCourses.reduce((sum, c) => sum + (c.creditHours ?? 0), 0)
  const creditsInProgress = creditsCurrentTerm + creditsPreRegistered

  // Build elective slot eligible map: slot_id → eligible course ids
  const electiveEligibleMap = new Map<string, string[]>()
  for (const es of electiveSlots) {
    const eligible = Array.isArray(es.courses)
      ? es.courses.map((c: any) => `${c.course_id}: ${c.title}`)
      : []
    electiveEligibleMap.set(es.slot_id, eligible)
  }

  // Courses where student's grade didn't meet the min_grade requirement
  const needsRetake: NeedsRetakeSlot[] = []

  // Group remaining slots by semester
  const bySemester = new Map<number, SemesterRemaining>()

  for (const slot of slots) {
    const sem = slot.semester_number as number
    if (!bySemester.has(sem)) {
      bySemester.set(sem, {
        semesterNumber: sem,
        semesterLabel: SEMESTER_LABELS[sem] ?? `Semester ${sem}`,
        slots: [],
      })
    }

    if (slot.is_elective_slot) {
      // Elective slot — filter eligible courses to exclude already completed/in-progress ones
      const allEligible = electiveEligibleMap.get(slot.id) ?? []
      const eligible = allEligible.filter((entry) => {
        // entry format: "CS 214: Data Structures"
        const code = entry.split(":")[0].trim().toUpperCase()
        return !completedCourseCodes.has(code) && !inProgressCourseCodes.has(code)
      })
      bySemester.get(sem)!.slots.push({
        courseId: null,
        title: slot.slot_label,
        creditHours: slot.credit_hours,
        isElective: true,
        eligibleCourses: eligible.slice(0, 10),
      })
    } else {
      const courseRelation = slot.courses as
        | { course_id: string; title: string; credit_hours: number }
        | Array<{ course_id: string; title: string; credit_hours: number }>
        | null
      const course = Array.isArray(courseRelation) ? courseRelation[0] : courseRelation
      if (!course) continue

      const normalizedId = normalizeHonorsCourseCode(course.course_id)
      const isCompleted = completedCourseCodes.has(normalizedId)
      const isInProgress = inProgressCourseCodes.has(normalizedId)

      // Grade-aware completion: if the slot has a min_grade, verify the student's grade qualifies
      if (isCompleted && slot.min_grade) {
        const userCourse = userCourses.find(
          (c) => normalizeHonorsCourseCode(c.code.trim().toUpperCase()) === normalizedId && c.status === "completed"
        )
        if (userCourse && !meetsMinGrade(userCourse.grade, slot.min_grade)) {
          // Student completed the course but grade doesn't meet requirement — needs retake
          needsRetake.push({
            courseId: course.course_id,
            title: course.title,
            gradeEarned: userCourse.grade ?? "?",
            minGradeRequired: slot.min_grade,
            semesterLabel: SEMESTER_LABELS[sem] ?? `Semester ${sem}`,
          })
          // Still needs to be taken again — add to remaining
          bySemester.get(sem)!.slots.push({
            courseId: course.course_id,
            title: course.title,
            creditHours: course.credit_hours,
            isElective: false,
          })
          continue
        }
      }

      if (isCompleted || isInProgress) continue

      bySemester.get(sem)!.slots.push({
        courseId: course.course_id,
        title: course.title,
        creditHours: course.credit_hours,
        isElective: false,
      })
    }
  }

  // Remove semesters where all required courses are done (only show semesters with remaining work)
  const remainingBySemester = Array.from(bySemester.values())
    .filter((sem) => sem.slots.length > 0)
    .sort((a, b) => a.semesterNumber - b.semesterNumber)

  const electiveSlotsRemaining = remainingBySemester.reduce(
    (sum, sem) => sum + sem.slots.filter((s) => s.isElective).length,
    0
  )

  return {
    programCode: program.code,
    programName: program.name,
    creditsRequired: program.total_credit_hours,
    creditsCompleted,
    creditsCurrentTerm,
    creditsPreRegistered,
    creditsInProgress,
    creditsRemaining: Math.max(0, program.total_credit_hours - creditsCompleted - creditsInProgress),
    remainingBySemester,
    electiveSlotsRemaining,
    isOnTrack: remainingBySemester.length <= 2,
    needsRetake,
    graduationRequirements: program.graduation_requirements ?? [],
    capstoneRule: program.capstone_rule ?? null,
  }
}

/**
 * Fetch elective slot options for a program, surfacing what courses can fill each slot.
 */
export async function fetchElectiveOptions(params: {
  programCode: string
  bulletinYear?: string | null
  studentId?: string
}): Promise<ElectiveSlotOption[]> {
  const programCode = params.programCode.trim().toUpperCase()
  const catalogYear = parseCatalogYear(params.bulletinYear)

  const program = await getProgram(programCode, catalogYear)
  if (!program) return []

  const electiveSlots = await getElectiveSlotsWithEligible(program.id)

  // Build taken course codes set if studentId provided
  const takenCodes = new Set<string>()
  if (params.studentId) {
    const userCourses = await getUserCourseStatuses(params.studentId).catch(() => [])
    for (const c of userCourses) {
      const raw = c.code.trim().toUpperCase()
      takenCodes.add(raw)
      takenCodes.add(normalizeHonorsCourseCode(raw))
    }
  }

  return electiveSlots.map((slot) => {
    const courses = Array.isArray(slot.courses) ? slot.courses : slot.courses ? [slot.courses] : []
    const eligible = courses
      .filter((c: any) => !takenCodes.has(c.course_id.trim().toUpperCase()))
      .map((c: any) => ({ courseId: c.course_id, title: c.title }))
    return {
      semesterNumber: slot.semester_number,
      semesterLabel: SEMESTER_LABELS[slot.semester_number] ?? `Semester ${slot.semester_number}`,
      slotLabel: slot.slot_label,
      creditHours: slot.credit_hours,
      eligibleCourses: eligible,
    }
  })
}

/**
 * Format graduation gap for LLM — mirrors DegreeWorks semester-by-semester view.
 */
export function formatGraduationGapForLLM(gap: GraduationGap): string {
  const header = `Program: ${gap.programName} (${gap.programCode})
AAMU Semester Credit Cap: 19 credits per semester
Credits Required to Graduate: ${gap.creditsRequired}
Credits Completed: ${gap.creditsCompleted}
Credits Currently Enrolled (this term): ${gap.creditsCurrentTerm}
Credits Pre-Registered (future terms — NOT yet in progress): ${gap.creditsPreRegistered}
Credits Still Needed After All In-Progress: ${gap.creditsRemaining}
Elective Slots Remaining: ${gap.electiveSlotsRemaining}
Status: ${gap.isOnTrack ? "On track to graduate" : "More than 2 semesters of work remaining"}`

  // Graduation requirements (program-level rules)
  const gradReqBlock = gap.graduationRequirements.length > 0
    ? `\nProgram Graduation Rules:\n${gap.graduationRequirements.map((r) => `  - ${r}`).join("\n")}` +
      (gap.capstoneRule ? `\n  - Capstone: ${gap.capstoneRule}` : "")
    : ""

  // Grade warnings — courses that need to be retaken
  const retakeBlock = gap.needsRetake.length > 0
    ? `\n⚠ Courses Needing Retake (grade below minimum requirement):\n` +
      gap.needsRetake.map((r) =>
        `  - ${r.courseId}: ${r.title} — earned ${r.gradeEarned}, need ${r.minGradeRequired} (${r.semesterLabel} slot)`
      ).join("\n")
    : ""

  if (gap.remainingBySemester.length === 0 && gap.needsRetake.length === 0) {
    return `${header}${gradReqBlock}\n\nAll required courses are completed or in progress. Graduation requirements nearly met.`
  }

  const semesterBlocks = gap.remainingBySemester
    .map((sem) => {
      const termOffered = sem.semesterNumber % 2 === 1 ? "Fall" : "Spring"
      const lines = sem.slots.map((slot) => {
        if (slot.isElective) {
          const options = slot.eligibleCourses?.slice(0, 5).join(", ") ?? "see advisor"
          return `  - [Elective] ${slot.title} (${slot.creditHours} cr) — options: ${options}`
        }
        return `  - ${slot.courseId}: ${slot.title} (${slot.creditHours} cr)`
      })
      return `${sem.semesterLabel} [offered ${termOffered} semesters]:\n${lines.join("\n")}`
    })
    .join("\n\n")

  return `${header}${gradReqBlock}${retakeBlock}\n\nRemaining courses by semester:\n${semesterBlocks}`
}

/**
 * Format elective options for LLM.
 */
export function formatElectiveOptionsForLLM(options: ElectiveSlotOption[]): string {
  if (options.length === 0) {
    return "No elective slots found for this program."
  }

  const blocks = options.map((slot) => {
    const courses = slot.eligibleCourses.length
      ? slot.eligibleCourses.map((c) => `    • ${c.courseId}: ${c.title}`).join("\n")
      : "    • Contact advisor for eligible courses"
    return `${slot.semesterLabel} — ${slot.slotLabel} (${slot.creditHours} cr):\n${courses}`
  })

  return `Elective Slots:\n${blocks.join("\n\n")}`
}

/**
 * Extract a minor/concentration name from a natural language question.
 * e.g. "minor in finance" → "finance", "psychology minor" → "psychology"
 */
export function extractMinorNameFromQuestion(question: string): string | null {
  const q = question.trim()
  // "minor in X" / "concentration in X" / "major in X"
  const afterIn = q.match(/\b(?:minor|concentration|minor in|concentrate in|major in)\s+(?:in\s+)?([a-zA-Z\s]+?)(?:\s*\?|$|,|\band\b)/i)
  if (afterIn) return afterIn[1].trim()

  // "X minor" / "X concentration"
  const beforeLabel = q.match(/\b([a-zA-Z\s]+?)\s+(?:minor|concentration)\b/i)
  if (beforeLabel) {
    const candidate = beforeLabel[1].trim()
    // Filter out noise words
    if (!/^(a|the|my|this|that|double|second|another)$/i.test(candidate)) {
      return candidate
    }
  }

  return null
}

/**
 * Fetch concentration (and minor) requirements for a program.
 * Falls back to a global cross-program search if the student's program has no matching result.
 */
export async function fetchConcentrationRequirements(params: {
  programCode: string
  bulletinYear?: string | null
  fallbackSearchName?: string       // name to search globally if program has no concentrations
  completedCourseCodes?: Set<string> // for cross-referencing what the student has done
}): Promise<ConcentrationRequirementsResult | null> {
  const programCode = params.programCode.trim().toUpperCase()
  const catalogYear = parseCatalogYear(params.bulletinYear)

  const program = await getProgram(programCode, catalogYear)
  if (!program) return null

  const concentrations = await getConcentrations(program.id)

  // Filter to just the concentration/minor the student asked about if we have a search name
  const searchName = params.fallbackSearchName?.trim().toLowerCase()
  const matched = searchName
    ? concentrations.filter((c) => c.name.toLowerCase().includes(searchName))
    : concentrations

  // If we found something in the student's own program, use it
  if (matched.length > 0) {
    const withSlots = await buildConcentrationWithSlots(matched, params.completedCourseCodes)
    return { programCode: program.code, concentrations: withSlots }
  }

  // If student's program has no match AND we have a search name, try global search
  if (searchName) {
    const globalResults = await searchConcentrationsByName(searchName)
    if (globalResults.length > 0) {
      const withSlots = await buildConcentrationWithSlots(globalResults, params.completedCourseCodes)
      return {
        programCode: globalResults[0].program_code || program.code,
        concentrations: withSlots,
        crossProgram: true,
        sourceProgram: globalResults[0].program_name || globalResults[0].program_code,
      } as ConcentrationRequirementsResult & { crossProgram: boolean; sourceProgram: string }
    }
  }

  // Nothing found anywhere
  return { programCode: program.code, concentrations: [] }
}

async function buildConcentrationWithSlots(
  concentrations: Array<{ id: string; code: string; name: string; type: string; total_hours: number; min_grade: string | null }>,
  completedCourseCodes?: Set<string>
): Promise<ConcentrationRequirement[]> {
  return Promise.all(
    concentrations.map(async (c) => {
      const slots = await getConcentrationSlots(c.id)
      const mappedSlots = slots.map((s) => {
        const courseRaw = s.courses
        const course = Array.isArray(courseRaw) ? courseRaw[0] ?? null : courseRaw
        return {
          slotLabel: s.slot_label,
          isElective: s.is_elective_slot,
          levelRestriction: s.level_restriction,
          creditHours: s.credit_hours,
          courseId: course?.course_id ?? null,
          courseTitle: course?.title ?? null,
          completed: completedCourseCodes && course?.course_id
            ? completedCourseCodes.has(course.course_id.trim().toUpperCase())
            : false,
        }
      })
      return {
        code: c.code,
        name: c.name,
        type: c.type as "concentration" | "minor",
        totalHours: c.total_hours,
        slots: mappedSlots,
      }
    })
  )
}

/**
 * Format concentration requirements for LLM.
 */
export function formatConcentrationForLLM(
  result: ConcentrationRequirementsResult & { crossProgram?: boolean; sourceProgram?: string }
): string {
  if (result.concentrations.length === 0) {
    return `Program ${result.programCode} has no concentrations or minors on record. Please check the bulletin or contact your advisor.`
  }

  const crossProgramNote = result.crossProgram && result.sourceProgram
    ? `Note: These requirements come from the ${result.sourceProgram} program (not the student's primary program). The student should confirm eligibility and any additional requirements with their advisor.\n\n`
    : ""

  const blocks = result.concentrations.map((c) => {
    const header = `${c.type === "minor" ? "Minor" : "Concentration"}: ${c.name} (${c.code}) — ${c.totalHours} total hours required`

    const slotLines = c.slots.map((s: any) => {
      const doneTag = s.completed ? " ✓ (completed)" : ""
      if (s.isElective) {
        const restriction = s.levelRestriction ? ` [${s.levelRestriction}]` : ""
        return `  - [Elective${restriction}] ${s.slotLabel} (${s.creditHours} cr)${doneTag}`
      }
      return `  - ${s.courseId ?? s.slotLabel}: ${s.courseTitle ?? s.slotLabel} (${s.creditHours} cr)${doneTag}`
    })

    const completed = c.slots.filter((s: any) => s.completed).length
    const total = c.slots.filter((s: any) => !s.isElective).length
    const progress = total > 0 ? `\n  Progress: ${completed}/${total} required courses completed` : ""

    return `${header}${progress}\n${slotLines.join("\n")}`
  })

  return `${crossProgramNote}Concentrations & Minors:\n\n${blocks.join("\n\n")}`
}

/**
 * Extract a requested course count from a question ("I want 5 classes", "take 3 courses").
 */
export function extractRequestedCourseCount(question: string): number | null {
  const m1 = question.match(/\b([2-9]|1[0-2])\s*(class(?:es)?|course(?:s)?|subject(?:s)?)\b/i)
  if (m1) { const n = parseInt(m1[1], 10); return isNaN(n) ? null : n }
  const m2 = question.match(/\b(?:take|register for|enroll in)\s+([2-9]|1[0-2])\b/i)
  if (m2) { const n = parseInt(m2[1], 10); return isNaN(n) ? null : n }
  // "one more course", "add a course", "another course", "get me one more"
  if (/\b(?:one|a|an)\s+more\s+(?:course|class)\b/i.test(question)) return 1
  if (/\badd\s+(?:one|a|an)\s+(?:more\s+)?(?:course|class)\b/i.test(question)) return 1
  if (/\bone\s+more\b/i.test(question) && /\bcourse|class\b/i.test(question)) return 1
  return null
}

interface FreeElectiveContext {
  availableCourses: GECourseRow[]
  enrollmentRulesNote: string
}

/**
 * Fetch available General Education courses not yet completed or in-progress,
 * and build enrollment rules note based on international status and scholarship type.
 */
export async function fetchFreeElectiveOptions(params: {
  studentId: string
  isInternational?: boolean
  scholarshipType?: string
  scholarshipMinGpa?: number
  scholarshipMinCreditsPerYear?: number
}): Promise<FreeElectiveContext> {
  const userCourses = await getUserCourseStatuses(params.studentId)

  const completed = userCourses.filter((c) => c.status === "completed")
  const inProgress = userCourses.filter((c) => c.status === "in_progress")

  const takenCodes = new Set([
    ...completed.map((c) => c.code),
    ...inProgress.map((c) => c.code),
  ])

  const availableCourses = await getAvailableGECourses(takenCodes)

  // Build enrollment rules note
  const notes: string[] = []

  if (params.isInternational) {
    notes.push('International students: minimum 12 credits/semester (9 must be in-person). Summer minimum: 3 credits.')
  }

  if (params.scholarshipType) {
    const rule = params.scholarshipType === 'External Scholarship'
      ? params.scholarshipMinGpa || params.scholarshipMinCreditsPerYear
        ? {
            minGpa: params.scholarshipMinGpa,
            minCreditsPerYear: params.scholarshipMinCreditsPerYear,
          }
        : null
      : AAMU_SCHOLARSHIP_RULES[params.scholarshipType] ?? null

    if (rule) {
      const parts: string[] = [`${params.scholarshipType} requires:`]
      if (rule.minGpa) parts.push(`minimum ${rule.minGpa} GPA`)
      if (rule.minCreditsPerYear) parts.push(`${rule.minCreditsPerYear} credits per academic year`)
      notes.push(parts.join(' '))
    }
  }

  return {
    availableCourses,
    enrollmentRulesNote: notes.join(' | '),
  }
}

/**
 * Format free elective / GE course options for LLM processing.
 * Groups available courses by area and sub-area.
 */
export function formatFreeElectivesForLLM(ctx: FreeElectiveContext): string {
  if (ctx.availableCourses.length === 0) {
    return 'The student has completed all General Education requirements.'
  }

  // Group by area then sub_area
  const byArea: Record<string, Record<string, GECourseRow[]>> = {}
  for (const course of ctx.availableCourses) {
    if (!byArea[course.area_name]) byArea[course.area_name] = {}
    const sub = course.sub_area ?? 'General'
    if (!byArea[course.area_name][sub]) byArea[course.area_name][sub] = []
    byArea[course.area_name][sub].push(course)
  }

  const lines: string[] = ['Available General Education courses (not yet completed):']
  for (const [areaName, subs] of Object.entries(byArea)) {
    lines.push(`\n${areaName}:`)
    for (const [subName, courses] of Object.entries(subs)) {
      lines.push(`  ${subName}:`)
      for (const c of courses) {
        lines.push(`    - ${c.course_code}: ${c.course_title} (${c.credit_hours} cr)`)
      }
    }
  }

  if (ctx.enrollmentRulesNote) {
    lines.push(`\nEnrollment rules: ${ctx.enrollmentRulesNote}`)
  }

  return lines.join('\n')
}

export interface RoadmapSemester {
  label: string
  courses: Array<{ courseId: string; title: string; creditHours: number; tag: string }>
  totalCredits: number
}

export async function buildMultiSemesterRoadmap(params: {
  programCode: string
  bulletinYear?: string | null
  userId: string
  creditsRemaining: number
  creditsPerSemester?: number
}): Promise<RoadmapSemester[]> {
  const { programCode, bulletinYear, userId, creditsRemaining, creditsPerSemester = 15 } = params
  const catalogYear = parseCatalogYear(bulletinYear)

  const [program, userCourses, geData] = await Promise.all([
    getProgram(programCode, catalogYear),
    getUserCourseStatuses(userId).catch(() => []),
    getAvailableGECourses(new Set<string>()).catch(() => []),
  ])
  if (!program) return []

  const takenCodes = new Set(
    userCourses
      .filter((c) => c.status === "completed" || c.status === "in_progress")
      .flatMap((c) => [c.code.trim().toUpperCase(), normalizeHonorsCourseCode(c.code.trim().toUpperCase())])
  )

  const slots = await getCurriculumSlots(program.id)
  const allRequired = slots
    .filter((s) => !s.is_elective_slot)
    .sort((a, b) => a.semester_number - b.semester_number || a.slot_order - b.slot_order)
    .flatMap((s) => {
      const courses = Array.isArray(s.courses) ? s.courses : s.courses ? [s.courses] : []
      return (courses as Array<{ course_id: string; title: string; credit_hours?: number }>)
        .filter((c) => !takenCodes.has(c.course_id.trim().toUpperCase()))
        .map((c) => ({
          courseId: c.course_id as string,
          title: c.title as string,
          creditHours: (s.credit_hours ?? c.credit_hours ?? 3) as number,
          tag: SEMESTER_LABELS[s.semester_number] ?? `Semester ${s.semester_number}`,
        }))
    })

  const roadmap: RoadmapSemester[] = []
  let remainingRequired = [...allRequired]
  let remainingGe = geData.filter((ge) => !takenCodes.has(ge.course_code.trim().toUpperCase()))
  let creditsLeft = creditsRemaining

  const now = new Date()
  const month = now.getMonth() + 1
  let currentSeason = month <= 7 ? "Fall" : "Spring"
  let currentYear = month <= 7 ? now.getFullYear() : now.getFullYear() + 1

  const MAX_SEMESTERS = 10

  for (let i = 0; i < MAX_SEMESTERS && creditsLeft > 0; i++) {
    const semLabel = `${currentSeason} ${currentYear}`
    const selected: RoadmapSemester["courses"] = []
    let semCredits = 0
    const cap = Math.min(creditsPerSemester, 19)

    const stillNeeded: typeof remainingRequired = []
    for (const c of remainingRequired) {
      if (semCredits + c.creditHours <= cap) {
        selected.push(c)
        semCredits += c.creditHours
      } else {
        stillNeeded.push(c)
      }
    }
    remainingRequired = stillNeeded

    const stillNeededGe: typeof remainingGe = []
    for (const ge of remainingGe) {
      if (semCredits >= cap) { stillNeededGe.push(ge); continue }
      if (semCredits + ge.credit_hours <= cap) {
        selected.push({ courseId: ge.course_code, title: ge.course_title, creditHours: ge.credit_hours, tag: `GE – ${ge.area_name}` })
        semCredits += ge.credit_hours
      } else {
        stillNeededGe.push(ge)
      }
    }
    remainingGe = stillNeededGe

    if (selected.length > 0) {
      roadmap.push({ label: semLabel, courses: selected, totalCredits: semCredits })
      creditsLeft -= semCredits
    }

    if (currentSeason === "Fall") { currentSeason = "Spring" }
    else { currentSeason = "Fall"; currentYear++ }
  }

  return roadmap
}
