/**
 * Data Access Layer - PDF Parsing
 *
 * Responsibility: Persist user-to-completed-course mappings from DegreeWorks data.
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
}

interface UserCompletedCourseRow {
  completed_at: string
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
  completedAt: string
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars")
  return createClient(url, key)
}

/**
 * Upsert a user's completed course mappings based on the parsed DegreeWorks data.
 * Any missing completed courses are first upserted into the master courses table.
 */
export async function upsertUserCompletedCourses(
  userId: string,
  result: DegreeWorksResult
): Promise<CompletedCourseMappingResult> {
  const supabase = getSupabaseClient()
  const completedCourseMap = new Map<string, { title: string; credits: number }>()

  for (const course of result.completedCourses) {
    const normalizedCode = course.code.trim().toUpperCase()
    if (!normalizedCode) continue

    if (!completedCourseMap.has(normalizedCode)) {
      completedCourseMap.set(normalizedCode, {
        title: course.title.trim() || normalizedCode,
        credits: Number.isFinite(course.credits) ? Math.round(course.credits) : 0,
      })
    }
  }

  const completedCourseCodes = Array.from(completedCourseMap.keys())

  if (completedCourseCodes.length === 0) {
    return { mappedCount: 0, unmatchedCourseCodes: [] }
  }

  const catalogRows: CourseCatalogUpsert[] = completedCourseCodes.map((code) => {
    const course = completedCourseMap.get(code)
    return {
      course_id: code,
      title: course?.title ?? code,
      credit_hours: course?.credits ?? 0,
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
    .in("course_id", completedCourseCodes)

  if (courseLookupError) {
    throw new Error(`[data-access:upsertUserCompletedCourses] ${courseLookupError.message}`)
  }

  const resolvedRows = (courseRows ?? []) as CourseIdRow[]
  const byCode = new Map<string, string>()
  for (const row of resolvedRows) {
    byCode.set(row.course_id.trim().toUpperCase(), row.id)
  }

  const unmatchedCourseCodes = completedCourseCodes.filter((code) => !byCode.has(code))

  const rows: UserCompletedCourseInsert[] = completedCourseCodes
    .map((code) => byCode.get(code))
    .filter((courseId): courseId is string => Boolean(courseId))
    .map((courseId) => ({
      user_id: userId,
      course_id: courseId,
    }))

  if (rows.length === 0) {
    return { mappedCount: 0, unmatchedCourseCodes }
  }

  const { error } = await supabase
    .from("user_completed_courses")
    .upsert(rows, { onConflict: "user_id,course_id" })

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
    .select("completed_at, course:courses(course_id, title, credit_hours)")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })

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
        completedAt: row.completed_at,
      }
    })
    .filter((row): row is UserCompletedCourseView => Boolean(row))
}