/**
 * Data Access Layer — Curriculum
 * 
 * Responsibility: Raw Supabase queries for programs, courses, prerequisites
 * No formatting, no response generation — only database access
 * 
 * Current location: Extracted from /lib/db/curriculum.ts
 */

import { createClient } from "@supabase/supabase-js"

export interface ProgramRow {
  id: string
  code: string
  name: string
  catalog_year: number
  total_credit_hours: number
  graduation_requirements: string[]
  capstone_rule: string | null
}

export interface ProgramIdentityRow {
  code: string
  name: string
  catalog_year: number
}

export interface CourseRow {
  id: string
  course_id: string
  title: string
  credit_hours?: number
}

export interface CourseRelationRow {
  course_id: string
  title: string
  credit_hours: number
  is_capstone: boolean
}

export interface CurriculumSlotRow {
  id: string
  semester_number: number
  slot_label: string
  slot_order: number
  credit_hours: number
  is_elective_slot: boolean
  min_grade: string | null
  courses: CourseRelationRow | CourseRelationRow[] | null
}

export interface PrerequisiteRelationRow {
  course_id: string
  title: string
}

export interface CoursePrerequisiteRow {
  prereq_group: number
  min_grade: string | null
  prerequisite: PrerequisiteRelationRow | PrerequisiteRelationRow[] | null
}

// Maps display catalog years with no program data to the backend year that does have data.
// Add entries here when a new academic year should alias to an existing year.
const CATALOG_YEAR_ALIASES: Record<number, number> = {
  2024: 2025, // 2024-2025 students use 2025-2026 curriculum data
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars")
  return createClient(url, key)
}

/**
 * Fetch program by code
 */
export async function getProgram(code: string, catalogYear?: number | null): Promise<ProgramRow | null> {
  const supabase = getSupabaseClient()
  const normalizedCode = code.trim().toUpperCase()

  // Resolve alias before querying — e.g. 2024 → 2025
  const resolvedYear = (typeof catalogYear === "number" && CATALOG_YEAR_ALIASES[catalogYear] != null)
    ? CATALOG_YEAR_ALIASES[catalogYear]
    : catalogYear

  if (typeof resolvedYear === "number") {
    // Exact year first.
    const { data: exactData, error: exactError } = await supabase
      .from("programs")
      .select("id, code, name, catalog_year, total_credit_hours, graduation_requirements, capstone_rule")
      .eq("code", normalizedCode)
      .eq("catalog_year", resolvedYear)
      .limit(1)

    if (!exactError && exactData && exactData.length > 0) {
      return exactData[0]
    }

    // Fallback for academic-year ambiguity (e.g., 2023-2024 stored as 2024).
    const nearYears = [resolvedYear - 1, resolvedYear + 1]
    const { data: nearData, error: nearError } = await supabase
      .from("programs")
      .select("id, code, name, catalog_year, total_credit_hours, graduation_requirements, capstone_rule")
      .eq("code", normalizedCode)
      .in("catalog_year", nearYears)
      .order("catalog_year", { ascending: false })
      .limit(1)

    if (!nearError && nearData && nearData.length > 0) {
      return nearData[0]
    }

    return null
  }

  const { data, error } = await supabase
    .from("programs")
    .select("id, code, name, catalog_year, total_credit_hours, graduation_requirements, capstone_rule")
    .eq("code", normalizedCode)
    .order("catalog_year", { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return null
  return data[0]
}

/**
 * Fetch all program code/name pairs for intent resolution.
 */
export async function listPrograms(): Promise<ProgramIdentityRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("programs")
    .select("code, name, catalog_year")

  if (error || !data) return []
  return data
}

/**
 * Fetch curriculum slots for a program with course details
 */
export async function getCurriculumSlots(programId: string): Promise<CurriculumSlotRow[]> {
  const supabase = getSupabaseClient()
  const { data: slots, error } = await supabase
    .from("curriculum_slots")
    .select(`
      id,
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
    .eq("program_id", programId)
    .order("semester_number")
    .order("slot_order")

  if (error || !slots) return []
  return slots
}

/**
 * Fetch course by code with title
 */
export async function getCourseByCode(courseCode: string): Promise<CourseRow | null> {
  const supabase = getSupabaseClient()
  const normalizedCode = courseCode.trim().toUpperCase()
  const { data: course, error } = await supabase
    .from("courses")
    .select("id, course_id, title, credit_hours")
    .eq("course_id", normalizedCode)
    .single()

  if (error || !course) return null
  return course
}

export interface ElectiveEligibleRow {
  slot_id: string
  slot_label: string
  semester_number: number
  credit_hours: number
  courses: { course_id: string; title: string; credit_hours: number } | { course_id: string; title: string; credit_hours: number }[] | null
}

/**
 * Fetch elective slots with their eligible course lists for a program
 */
export async function getElectiveSlotsWithEligible(programId: string): Promise<ElectiveEligibleRow[]> {
  const supabase = getSupabaseClient()

  // First get elective slots
  const { data: slots, error: slotsError } = await supabase
    .from("curriculum_slots")
    .select("id, slot_label, semester_number, credit_hours")
    .eq("program_id", programId)
    .eq("is_elective_slot", true)
    .order("semester_number")
    .order("slot_order")

  if (slotsError || !slots || slots.length === 0) return []

  // For each slot, get eligible courses
  const results: ElectiveEligibleRow[] = []
  for (const slot of slots) {
    const { data: eligible } = await supabase
      .from("elective_slot_eligible_courses")
      .select("courses(course_id, title, credit_hours)")
      .eq("slot_id", slot.id)

    results.push({
      slot_id: slot.id,
      slot_label: slot.slot_label,
      semester_number: slot.semester_number,
      credit_hours: slot.credit_hours,
      courses: eligible?.map((e: any) => e.courses).flat() ?? [],
    })
  }

  return results
}

// ── Concentration / Minor ─────────────────────────────────────────────────────

export interface ConcentrationRow {
  id: string
  code: string
  name: string
  type: "concentration" | "minor"
  total_hours: number
  min_grade: string | null
}

export interface ConcentrationSlotRow {
  slot_label: string
  is_elective_slot: boolean
  level_restriction: string | null
  credit_hours: number
  courses: { course_id: string; title: string; credit_hours: number } | { course_id: string; title: string; credit_hours: number }[] | null
}

export interface ConcentrationWithProgramRow extends ConcentrationRow {
  program_code: string
  program_name: string
}

/**
 * Search concentrations/minors by name across ALL programs (global search).
 * Used when a student asks about a minor not in their own program (e.g. Finance minor).
 */
export async function searchConcentrationsByName(name: string): Promise<ConcentrationWithProgramRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("concentrations")
    .select("id, code, name, type, total_hours, min_grade, programs(code, name)")
    .ilike("name", `%${name.trim()}%`)
    .order("type")
    .order("name")

  if (error || !data) return []
  return data.map((row: any) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    total_hours: row.total_hours,
    min_grade: row.min_grade,
    program_code: Array.isArray(row.programs) ? (row.programs[0]?.code ?? "") : (row.programs?.code ?? ""),
    program_name: Array.isArray(row.programs) ? (row.programs[0]?.name ?? "") : (row.programs?.name ?? ""),
  }))
}

/**
 * List concentrations (and minors) for a program.
 */
export async function getConcentrations(programId: string): Promise<ConcentrationRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("concentrations")
    .select("id, code, name, type, total_hours, min_grade")
    .eq("program_id", programId)
    .order("type")
    .order("name")

  if (error || !data) return []
  return data
}

/**
 * Fetch slots for a specific concentration with course details.
 */
export async function getConcentrationSlots(concentrationId: string): Promise<ConcentrationSlotRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("concentration_slots")
    .select(`
      slot_label,
      is_elective_slot,
      level_restriction,
      credit_hours,
      courses (
        course_id,
        title,
        credit_hours
      )
    `)
    .eq("concentration_id", concentrationId)

  if (error || !data) return []
  return data
}

/**
 * Fetch prerequisites for a course by course ID
 */
export async function getCoursePrerequisites(courseId: string): Promise<CoursePrerequisiteRow[]> {
  const supabase = getSupabaseClient()
  const { data: prereqs, error } = await supabase
    .from("course_prerequisites")
    .select("prereq_group, min_grade, prerequisite:courses!course_prerequisites_prerequisite_id_fkey(course_id, title)")
    .eq("course_id", courseId)
    .order("prereq_group", { ascending: true })

  if (error || !prereqs) return []
  return prereqs
}

// ── General Education Courses ─────────────────────────────────────────────────

export interface GEAreaRow {
  id: string
  code: string
  name: string
  min_hours: number
  notes: string | null
  bulletin_year: string
}

export interface GECourseRow {
  id: string
  area_id: string
  sub_area: string | null
  course_code: string
  course_title: string
  credit_hours: number
  notes: string | null
  area_code: string
  area_name: string
}

/**
 * Fetch available General Education courses, excluding those already taken.
 */
export async function getAvailableGECourses(
  takenCourseCodes: Set<string>
): Promise<GECourseRow[]> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from("general_education_courses")
    .select(`
      id,
      area_id,
      sub_area,
      course_code,
      course_title,
      credit_hours,
      notes,
      general_education_areas!inner (
        code,
        name
      )
    `)
    .order("course_code")

  if (error) throw new Error(`getAvailableGECourses: ${error.message}`)

  return (data ?? [])
    .map((row: any) => ({
      id: row.id,
      area_id: row.area_id,
      sub_area: row.sub_area,
      course_code: row.course_code,
      course_title: row.course_title,
      credit_hours: row.credit_hours,
      notes: row.notes,
      area_code: row.general_education_areas.code,
      area_name: row.general_education_areas.name,
    }))
    .filter((c: GECourseRow) => !takenCourseCodes.has(c.course_code))
}
