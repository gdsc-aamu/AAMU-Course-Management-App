/**
 * Data Access Layer - PDF Parsing
 *
 * Responsibility: Persist user-to-course mappings and sync their latest status.
 */

import { createClient } from "@supabase/supabase-js"
import type { DegreeWorksResult } from "@/shared/contracts"

interface CourseIdRow {
  id: string
  course_id: string
}

interface CourseCatalogUpsert {
  course_id: string
  title: string
  credit_hours: number
  is_capstone: boolean
}

interface UserCompletedCourseInsert {
  user_id: string
  course_id: string
  status: "completed" | "in_progress"
  grade: string | null
  term: string | null
}

interface UserCompletedCourseRow {
  status: "completed" | "in_progress"
  grade: string | null
  term: string | null
  course: {
    course_id: string
    title: string
    credit_hours: number
  } | {
    course_id: string
    title: string
    credit_hours: number
  }[] | null
}

export interface CompletedCourseMappingResult {
  mappedCount: number
  unmatchedCourseCodes: string[]
}

export interface UserCompletedCourseView {
  code: string
  title: string
  creditHours: number
  grade: string | null
  term: string | null
}

export interface UserCourseStatusView {
  code: string
  title: string
  creditHours: number
  status: "completed" | "in_progress"
  grade: string | null
  term: string | null
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars")
  return createClient(url, key)
}

/**
 * Upsert a user's course mappings based on parsed DegreeWorks data.
 * Any missing courses are first upserted into the master courses table.
 * Status is synced per course and promoted to completed when present in the payload.
 */
export async function upsertUserCompletedCourses(
  userId: string,
  result: DegreeWorksResult
): Promise<CompletedCourseMappingResult> {
  const supabase = getSupabaseClient()
  const courseMap = new Map<
    string,
    { title: string; credits: number; status: "completed" | "in_progress"; grade: string | null; term: string | null }
  >()

  for (const course of result.allCourses) {
    const normalizedCode = course.code.trim().toUpperCase()
    if (!normalizedCode) continue

    const existing = courseMap.get(normalizedCode)
    if (!existing) {
      courseMap.set(normalizedCode, {
        title: course.title.trim() || normalizedCode,
        credits: Number.isFinite(course.credits) ? Math.round(course.credits) : 0,
        status: course.status,
        grade: course.grade || null,
        term: course.term || null,
      })
      continue
    }

    // If either record indicates completion, keep completed as the authoritative state.
    if (course.status === "completed" && existing.status !== "completed") {
      existing.status = "completed"
      existing.grade = course.grade || existing.grade
      existing.term = course.term || existing.term
    }
  }

  const courseCodes = Array.from(courseMap.keys())

  if (courseCodes.length === 0) {
    return { mappedCount: 0, unmatchedCourseCodes: [] }
  }

  const catalogRows: CourseCatalogUpsert[] = courseCodes.map((code) => {
    const c = courseMap.get(code)
    return {
      course_id: code,
      title: c?.title ?? code,
      credit_hours: c?.credits ?? 0,
      is_capstone: false,
    }
  })

  const { error: catalogUpsertError } = await supabase
    .from("courses")
    .upsert(catalogRows, { onConflict: "course_id", ignoreDuplicates: true })

  if (catalogUpsertError) {
    throw new Error(`[data-access:upsertUserCompletedCourses] ${catalogUpsertError.message}`)
  }

  const { data: courseRows, error: courseLookupError } = await supabase
    .from("courses")
    .select("id, course_id")
    .in("course_id", courseCodes)

  if (courseLookupError) {
    throw new Error(`[data-access:upsertUserCompletedCourses] ${courseLookupError.message}`)
  }

  const resolvedRows = (courseRows ?? []) as CourseIdRow[]
  const byCode = new Map<string, string>()
  for (const row of resolvedRows) {
    byCode.set(row.course_id.trim().toUpperCase(), row.id)
  }

  const unmatchedCourseCodes = courseCodes.filter((code) => !byCode.has(code))

  const rows: UserCompletedCourseInsert[] = courseCodes
    .map((code) => {
      const courseId = byCode.get(code)
      const course = courseMap.get(code)
      if (!courseId || !course) return null

      return {
        user_id: userId,
        course_id: courseId,
        status: course.status,
        grade: course.grade,
        term: course.term,
      }
    })
    .filter((row): row is UserCompletedCourseInsert => Boolean(row))

  if (rows.length === 0) {
    return { mappedCount: 0, unmatchedCourseCodes }
  }

  const { error } = await supabase
    .from("user_completed_courses")
    .upsert(rows, { onConflict: "user_id,course_id", ignoreDuplicates: false })

  if (error) {
    throw new Error(`[data-access:upsertUserCompletedCourses] ${error.message}`)
  }

  return {
    mappedCount: rows.length,
    unmatchedCourseCodes,
  }
}

/**
 * Get all completed courses for a user from the user-course mapping.
 */
export async function getUserCompletedCourses(userId: string): Promise<UserCompletedCourseView[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("user_completed_courses")
    .select("status, grade, term, course:courses(course_id, title, credit_hours)")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("term", { ascending: true })

  if (error) {
    throw new Error(`[data-access:getUserCompletedCourses] ${error.message}`)
  }

  const rows = (data ?? []) as UserCompletedCourseRow[]
  return rows
    .map((row) => {
      const course = Array.isArray(row.course) ? row.course[0] : row.course
      if (!course) return null

      return {
        code: course.course_id,
        title: course.title,
        creditHours: course.credit_hours,
        grade: row.grade,
        term: row.term,
      }
    })
    .filter((row): row is UserCompletedCourseView => Boolean(row))
}

/**
 * Get all mapped courses for a user, including status.
 */
export async function getUserCourseStatuses(userId: string): Promise<UserCourseStatusView[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("user_completed_courses")
    .select("status, grade, term, course:courses(course_id, title, credit_hours)")
    .eq("user_id", userId)
    .order("term", { ascending: true })

  if (error) {
    throw new Error(`[data-access:getUserCourseStatuses] ${error.message}`)
  }

  const rows = (data ?? []) as UserCompletedCourseRow[]
  return rows
    .map((row) => {
      const course = Array.isArray(row.course) ? row.course[0] : row.course
      if (!course) return null

      return {
        code: course.course_id,
        title: course.title,
        creditHours: course.credit_hours,
        status: row.status,
        grade: row.grade,
        term: row.term,
      }
    })
    .filter((row): row is UserCourseStatusView => Boolean(row))
}