/**
 * Curriculum Service
 * 
 * Responsibility: Provide curriculum data (programs, courses, prerequisites)
 * Handles formatting and business logic; delegates data access to data-access layer
 * 
 * Current location of implementation: /lib/db/curriculum.ts
 */

import type {
  CurriculumContext,
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
  fallbackProgramCode?: string | null
): Promise<string | null> {
  const normalizedQuestion = question.toLowerCase()
  const normalizedFallback = fallbackProgramCode?.trim().toUpperCase() ?? null

  const programs = await listPrograms()
  if (programs.length === 0) {
    return normalizedFallback
  }

  // Prefer explicit code mention (e.g., BSCS-BS).
  for (const program of programs) {
    if (normalizedQuestion.includes(program.code.toLowerCase())) {
      return program.code
    }
  }

  // Then match by program name phrase (e.g., "accounting").
  for (const program of programs) {
    const name = program.name.toLowerCase()
    if (normalizedQuestion.includes(name) || name.includes(normalizedQuestion)) {
      return program.code
    }
  }

  // Finally match any significant token from the program name.
  for (const program of programs) {
    const tokens = program.name
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]/g, ""))
      .filter((token) => token.length >= 4)

    if (tokens.some((token) => normalizedQuestion.includes(token))) {
      return program.code
    }
  }

  return normalizedFallback
}
