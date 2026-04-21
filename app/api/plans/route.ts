import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
  return createClient(url, key)
}

/**
 * POST /api/plans
 * Body: { name, semester, courseIds: string[], userId: string }
 * Creates a named plan with the given courses.
 */
export async function POST(req: Request) {
  let body: { name?: string; semester?: string; courseIds?: string[]; userId?: string }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { name, semester, courseIds, userId } = body

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Field 'name' is required" }, { status: 400 })
  }
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Field 'userId' is required" }, { status: 400 })
  }

  const resolvedSemester = semester || "Fall 2025"
  const resolvedCourseIds: string[] = Array.isArray(courseIds) ? courseIds : []

  const supabase = getSupabaseAdmin()

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .insert({
      user_id: userId,
      name: name.trim(),
      semester: resolvedSemester,
      starred: false,
    })
    .select()
    .single()

  if (planError || !plan) {
    return NextResponse.json(
      { error: planError?.message ?? "Failed to create plan" },
      { status: 500 }
    )
  }

  if (resolvedCourseIds.length > 0) {
    const rows = resolvedCourseIds.map((courseId) => ({
      plan_id: plan.id,
      course_id: courseId,
    }))
    const { error: coursesError } = await supabase.from("plan_courses").insert(rows)
    if (coursesError) {
      return NextResponse.json(
        { error: coursesError.message },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    success: true,
    plan: {
      id: plan.id,
      name: plan.name,
      semester: plan.semester,
      courseIds: resolvedCourseIds,
    },
  })
}
