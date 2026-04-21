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
      .select("user_id, program_code, bulletin_year, classification, updated_at")
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

  const { data, error } = await supabase
    .from("user_academic_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select("user_id, program_code, bulletin_year, classification, updated_at")
    .single()

  if (error || !data) {
    throw new Error(`[data-access:upsertUserAcademicProfile] ${error?.message ?? "Unknown error"}`)
  }

  return data
}
