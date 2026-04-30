/**
 * User Profile Service
 *
 * Responsibility: Manage user academic profile context (major + bulletin year).
 */

import {
  getUserAcademicProfile,
  upsertUserAcademicProfile,
  type UserAcademicProfileRow,
} from "@/backend/data-access/user-profile"

export interface UserAcademicProfile {
  userId: string
  programCode: string | null
  bulletinYear: string | null
  classification: string | null
  concentrationCode: string | null
  isInternational: boolean | null
  scholarshipType: string | null
  scholarshipName: string | null
  scholarshipMinGpa: number | null
  scholarshipMinCreditsPerYear: number | null
  updatedAt: string
}

function mapRow(row: UserAcademicProfileRow): UserAcademicProfile {
  return {
    userId: row.user_id,
    programCode: row.program_code,
    bulletinYear: row.bulletin_year,
    classification: row.classification,
    concentrationCode: row.concentration_code,
    isInternational: row.is_international,
    scholarshipType: row.scholarship_type,
    scholarshipName: row.scholarship_name,
    scholarshipMinGpa: row.scholarship_min_gpa,
    scholarshipMinCreditsPerYear: row.scholarship_min_credits_per_year,
    updatedAt: row.updated_at,
  }
}

export async function fetchUserAcademicProfile(userId: string): Promise<UserAcademicProfile | null> {
  if (!userId.trim()) {
    throw new Error("[user-profile:fetchUserAcademicProfile] userId is required")
  }

  const row = await getUserAcademicProfile(userId)
  return row ? mapRow(row) : null
}

export async function saveUserAcademicProfile(params: {
  userId: string
  programCode?: string | null
  bulletinYear?: string | null
  classification?: string | null
  concentrationCode?: string | null
  isInternational?: boolean | null
  scholarshipType?: string | null
  scholarshipName?: string | null
  scholarshipMinGpa?: number | null
  scholarshipMinCreditsPerYear?: number | null
}): Promise<UserAcademicProfile> {
  if (!params.userId.trim()) {
    throw new Error("[user-profile:saveUserAcademicProfile] userId is required")
  }

  const row = await upsertUserAcademicProfile(params)
  return mapRow(row)
}
