import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { parseDegreeWorksPdf } from "@/backend/services/pdf-parsing/service"

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const [scheme, token] = authHeader.split(" ")
  if (scheme !== "Bearer" || !token) return null
  return token
}

export async function POST(request: Request) {
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

    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ success: false, error: "Only PDF files are accepted" }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const result = await parseDegreeWorksPdf(bytes, authData.user.id)

    return NextResponse.json({
      success: true,
      result,
      mappedCompletedCount: result.completedCourses.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected upload error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
