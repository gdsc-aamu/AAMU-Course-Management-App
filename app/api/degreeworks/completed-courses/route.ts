import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { fetchUserCompletedCourses } from "@/backend/services/pdf-parsing/service"

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const [scheme, token] = authHeader.split(" ")
  if (scheme !== "Bearer" || !token) return null
  return token
}

export async function GET(request: Request) {
  try {
    const token = getBearerToken(request.headers.get("authorization"))
    if (!token) {
      return NextResponse.json({ success: false, error: "Missing auth token" }, { status: 401 })
    }

    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser(token)

    if (authError || !authData.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const courses = await fetchUserCompletedCourses(authData.user.id)
    return NextResponse.json({ success: true, courses })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected read error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
