/**
 * Data Access Layer — Curriculum
 * 
 * Responsibility: Raw Supabase queries for programs, courses, prerequisites
 * No formatting, no response generation — only database access
 * 
 * Current location: Extracted from /lib/db/curriculum.ts
 */

import { createClient } from "@supabase/supabase-js"

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars")
  return createClient(url, key)
}

/**
 * Fetch program by code
 */
export async function getProgram(code: string): Promise<any> {
  const supabase = getSupabaseClient()
  const { data: program, error } = await supabase
    .from("programs")
    .select("id, code, name, total_credit_hours")
    .eq("code", code)
    .single()

  if (error || !program) return null
  return program
}

/**
 * Fetch curriculum slots for a program with course details
 */
export async function getCurriculumSlots(programId: string): Promise<any[]> {
  const supabase = getSupabaseClient()
  const { data: slots, error } = await supabase
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
    .eq("program_id", programId)
    .order("semester_number")
    .order("slot_order")

  if (error || !slots) return []
  return slots
}

/**
 * Fetch course by code with title
 */
export async function getCourseByCode(courseCode: string): Promise<any> {
  const supabase = getSupabaseClient()
  const normalizedCode = courseCode.trim().toUpperCase()
  const { data: course, error } = await supabase
    .from("courses")
    .select("id, course_id, title")
    .eq("course_id", normalizedCode)
    .single()

  if (error || !course) return null
  return course
}

/**
 * Fetch prerequisites for a course by course ID
 */
export async function getCoursePrerequisites(courseId: string): Promise<any[]> {
  const supabase = getSupabaseClient()
  const { data: prereqs, error } = await supabase
    .from("course_prerequisites")
    .select("prereq_group, min_grade, prerequisite:courses!course_prerequisites_prerequisite_id_fkey(course_id, title)")
    .eq("course_id", courseId)
    .order("prereq_group", { ascending: true })

  if (error || !prereqs) return []
  return prereqs
}
