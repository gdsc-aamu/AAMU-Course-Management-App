import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  fetchUserAcademicProfile,
  saveUserAcademicProfile,
} from "@/backend/services/user-profile/service"

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const [scheme, token] = authHeader.split(" ")
  if (scheme !== "Bearer" || !token) return null
  return token
}

async function getAuthenticatedUser(request: Request) {
  const token = getBearerToken(request.headers.get("authorization"))
  if (!token) return { userId: null, error: "Missing auth token", status: 401 }

  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user) {
    return { userId: null, error: "Unauthorized", status: 401 }
  }

  return { userId: authData.user.id, error: null, status: 200 }
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth.userId) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const profile = await fetchUserAcademicProfile(auth.userId)
    return NextResponse.json({ success: true, profile })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected profile read error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth.userId) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const payload = (await request.json()) as {
      programCode?: string | null
      bulletinYear?: string | null
      classification?: string | null
      isInternational?: boolean | null
      scholarshipType?: string | null
      scholarshipName?: string | null
      scholarshipMinGpa?: number | null
      scholarshipMinCreditsPerYear?: number | null
    }

    const isInternational = payload.isInternational as boolean | undefined
    const scholarshipType = payload.scholarshipType as string | undefined
    const scholarshipName = payload.scholarshipName as string | undefined
    const scholarshipMinGpa = payload.scholarshipMinGpa as number | undefined
    const scholarshipMinCreditsPerYear = payload.scholarshipMinCreditsPerYear as number | undefined

    const profile = await saveUserAcademicProfile({
      userId: auth.userId,
      programCode: payload.programCode ?? null,
      bulletinYear: payload.bulletinYear ?? null,
      classification: payload.classification ?? null,
      isInternational,
      scholarshipType,
      scholarshipName,
      scholarshipMinGpa,
      scholarshipMinCreditsPerYear,
    })

    return NextResponse.json({ success: true, profile })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected profile write error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
