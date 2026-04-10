import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { recommendNextCoursesForUser } from "@/backend/services/curriculum/service"

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

    const url = new URL(request.url)
    const programCode = (url.searchParams.get("programCode") ?? "").trim()
    const bulletinYear = (url.searchParams.get("bulletinYear") ?? "").trim() || null

    if (!programCode) {
      return NextResponse.json(
        { success: false, error: "Missing required query param: programCode" },
        { status: 400 }
      )
    }

    const recommendation = await recommendNextCoursesForUser({
      userId: authData.user.id,
      programCode,
      bulletinYear,
      maxRecommendations: 12,
    })

    if (!recommendation) {
      return NextResponse.json(
        { success: false, error: "No recommendation data found for this program context" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, recommendation })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected next-courses error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
