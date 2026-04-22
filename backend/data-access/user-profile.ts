/**
 * Data Access Layer - User Academic Profile
 *
 * Responsibility: Read/write user major and bulletin year profile context.
 */

import { createClient } from "@supabase/supabase-js"

export interface UserAcademicProfileRow {
  user_id: string
  program_code: string | null
  bulletin_year: string | null
  classification: string | null
  is_international: boolean | null
  scholarship_type: string | null
  scholarship_name: string | null
  scholarship_min_gpa: number | null
  scholarship_min_credits_per_year: number | null
  updated_at: string
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars")
  return createClient(url, key)
}

export async function getUserAcademicProfile(userId: string): Promise<UserAcademicProfileRow | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("user_academic_profiles")
      .select("user_id, program_code, bulletin_year, classification, is_international, scholarship_type, scholarship_name, scholarship_min_gpa, scholarship_min_credits_per_year, updated_at")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    throw new Error(`[data-access:getUserAcademicProfile] ${error.message}`)
  }

  return data
}

export async function upsertUserAcademicProfile(params: {
  userId: string
  programCode?: string | null
  bulletinYear?: string | null
  classification?: string | null
  isInternational?: boolean | null
  scholarshipType?: string | null
  scholarshipName?: string | null
  scholarshipMinGpa?: number | null
  scholarshipMinCreditsPerYear?: number | null
}): Promise<UserAcademicProfileRow> {
  const supabase = getSupabaseClient()

  // Only include fields that were explicitly provided — never null out a field
  // the caller didn't mention (e.g. PDF upload sets bulletinYear but not programCode).
  const row: Record<string, unknown> = {
    user_id: params.userId,
    updated_at: new Date().toISOString(),
  }
  if (params.programCode !== undefined) {
    row.program_code = params.programCode?.trim().toUpperCase() ?? null
  }
  if (params.bulletinYear !== undefined) {
    row.bulletin_year = params.bulletinYear?.trim() ?? null
  }
  if (params.classification !== undefined) {
    row.classification = params.classification?.trim() ?? null
  }
  if (params.isInternational !== undefined) {
    row.is_international = params.isInternational
  }
  if (params.scholarshipType !== undefined) {
    row.scholarship_type = params.scholarshipType?.trim() ?? null
  }
  if (params.scholarshipName !== undefined) {
    row.scholarship_name = params.scholarshipName?.trim() ?? null
  }
  if (params.scholarshipMinGpa !== undefined) {
    row.scholarship_min_gpa = params.scholarshipMinGpa
  }
  if (params.scholarshipMinCreditsPerYear !== undefined) {
    row.scholarship_min_credits_per_year = params.scholarshipMinCreditsPerYear
  }

  const { data, error } = await supabase
    .from("user_academic_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select("user_id, program_code, bulletin_year, classification, is_international, scholarship_type, scholarship_name, scholarship_min_gpa, scholarship_min_credits_per_year, updated_at")
    .single()

  if (error || !data) {
    throw new Error(`[data-access:upsertUserAcademicProfile] ${error?.message ?? "Unknown error"}`)
  }

  return data
}
