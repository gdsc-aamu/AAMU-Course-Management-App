import { createClient } from "@supabase/supabase-js"

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars")
  return createClient(url, key)
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

export interface CurriculumContext {
  programCode: string
  programName: string
  totalCreditHours: number
  formattedText: string
}

export interface ProgramOverview {
  programCode: string
  programName: string
  totalCreditHours: number
  semesterCount: number
  totalSlots: number
  electiveSlots: number
}

export interface PrerequisiteResult {
  courseId: string
  title: string
  groups: Array<{
    prereqGroup: number
    options: Array<{
      courseId: string
      title: string
      minGrade: string | null
    }>
  }>
}

export async function fetchCurriculumContext(
  programCode: string
): Promise<CurriculumContext | null> {
  const supabase = getSupabaseClient()

  // Fetch program
  const { data: program, error: programError } = await supabase
    .from("programs")
    .select("id, code, name, total_credit_hours")
    .eq("code", programCode)
    .single()

  if (programError || !program) return null

  // Fetch curriculum slots with course details
  const { data: slots, error: slotsError } = await supabase
    .from("curriculum_slots")
    .select(`
      semester_number,
      slot_label,
      slot_order,
      credit_hours,
      is_elective_slot,
      min_grade,
      courses (
        course_id,
        title,
        credit_hours,
        is_capstone
      )
    `)
    .eq("program_id", program.id)
    .order("semester_number")
    .order("slot_order")

  if (slotsError || !slots) return null

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

export async function fetchProgramOverview(
  programCode: string
): Promise<ProgramOverview | null> {
  const supabase = getSupabaseClient()

  const { data: program, error: programError } = await supabase
    .from("programs")
    .select("id, code, name, total_credit_hours")
    .eq("code", programCode)
    .single()

  if (programError || !program) return null

  const { data: slots, error: slotsError } = await supabase
    .from("curriculum_slots")
    .select("semester_number, is_elective_slot")
    .eq("program_id", program.id)

  if (slotsError || !slots) return null

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

export async function fetchCoursePrerequisitesByCode(
  courseCode: string
): Promise<PrerequisiteResult | null> {
  const supabase = getSupabaseClient()

  const normalizedCode = courseCode.trim().toUpperCase()
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, course_id, title")
    .eq("course_id", normalizedCode)
    .single()

  if (courseError || !course) return null

  const { data: prereqs, error: prereqError } = await supabase
    .from("course_prerequisites")
    .select("prereq_group, min_grade, prerequisite:courses!course_prerequisites_prerequisite_id_fkey(course_id, title)")
    .eq("course_id", course.id)
    .order("prereq_group", { ascending: true })

  if (prereqError || !prereqs) return null

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