/**
 * PDF Parsing Service
 *
 * Responsibility: Parse DegreeWorks PDFs, extract student and course data
 *
 * Current location of implementation: /api/main.py, /api/parser.py, /api/models.py
 * Status: To be refactored as a service endpoint
 */

import { readFile } from "node:fs/promises"
import { basename } from "node:path"
import type { DegreeWorksResult } from "@/shared/contracts"
import {
  getUserCourseStatuses,
  getUserCompletedCourses,
  upsertUserCompletedCourses,
  hasUserUploadedCourses,
  type UserCompletedCourseView,
} from "@/backend/data-access/pdf-parsing"
import { upsertUserAcademicProfile } from "@/backend/data-access/user-profile"
import {
  upsertDegreeSummary,
  upsertRequirementBlocks,
  replaceBlockRequirements,
} from "@/backend/data-access/degree-summary"

const DEFAULT_PARSER_ENDPOINT = "http://127.0.0.1:8000/parse-degreeworks"

function getParserEndpoint(): string {
  return process.env.DEGREEWORKS_PARSER_URL ?? DEFAULT_PARSER_ENDPOINT
}

function isDegreeWorksResult(value: unknown): value is DegreeWorksResult {
  if (!value || typeof value !== "object") return false

  const v = value as Record<string, unknown>
  return (
    typeof v.student === "object" &&
    Array.isArray(v.completedCourses) &&
    Array.isArray(v.inProgressCourses) &&
    Array.isArray(v.allCourses)
  )
}

function normalizeDegreeWorksPayload(value: unknown): DegreeWorksResult {
  if (isDegreeWorksResult(value)) {
    return value
  }

  if (!value || typeof value !== "object") {
    throw new Error("[pdf-parsing:parseDegreeWorksPdf] Invalid parser payload shape")
  }

  type RawCourse = {
    code?: string
    title?: string
    grade?: string
    credits?: number
    term?: string
    status?: "completed" | "in_progress"
    section?: string
    is_registered?: boolean
  }

  type RawBlock = {
    block_name?: string
    status?: string
    credits_required?: number | null
    credits_applied?: number | null
  }

  type RawBlockReq = {
    block_name?: string
    description?: string
    is_met?: boolean
  }

  const v = value as {
    student?: {
      name?: string
      student_id?: string
      degree?: string
      audit_date?: string
      degree_progress_pct?: number | null
      overall_gpa?: number | null
      classification?: string | null
      catalog_year?: string | null
      concentration?: string | null
      credits_required?: number | null
      credits_applied?: number | null
    }
    completed_courses?: RawCourse[]
    in_progress_courses?: RawCourse[]
    all_courses?: RawCourse[]
    requirement_blocks?: RawBlock[]
    block_requirements?: RawBlockReq[]
  }

  if (!v.student || !Array.isArray(v.all_courses)) {
    throw new Error("[pdf-parsing:parseDegreeWorksPdf] Invalid parser payload shape")
  }

  const mapCourse = (course: RawCourse) => ({
    code: course.code ?? "",
    title: course.title ?? "",
    grade: course.grade ?? "",
    credits: course.credits ?? 0,
    term: course.term ?? "",
    status: course.status ?? "completed" as "completed" | "in_progress",
    section: course.section ?? "General",
  })

  const normalizeBlockStatus = (s?: string): "complete" | "in_progress" | "incomplete" => {
    if (s === "complete") return "complete"
    if (s === "in_progress") return "in_progress"
    return "incomplete"
  }

  return {
    student: {
      name: v.student.name ?? "Unknown",
      studentId: v.student.student_id ?? "Unknown",
      degree: v.student.degree ?? "Unknown",
      auditDate: v.student.audit_date ?? "Unknown",
      degreeProgressPct: v.student.degree_progress_pct ?? null,
      overallGpa: v.student.overall_gpa ?? null,
      classification: v.student.classification ?? null,
      catalogYear: v.student.catalog_year ?? null,
      concentration: v.student.concentration ?? null,
      creditsRequired: v.student.credits_required ?? null,
      creditsApplied: v.student.credits_applied ?? null,
    },
    completedCourses: (v.completed_courses ?? []).map(mapCourse),
    inProgressCourses: (v.in_progress_courses ?? []).map(mapCourse),
    allCourses: v.all_courses.map(mapCourse),
    requirementBlocks: (v.requirement_blocks ?? []).map((b) => ({
      blockName: b.block_name ?? "Unknown",
      status: normalizeBlockStatus(b.status),
      creditsRequired: b.credits_required ?? null,
      creditsApplied: b.credits_applied ?? null,
    })),
    blockRequirements: (v.block_requirements ?? []).map((r) => ({
      blockName: r.block_name ?? "Unknown",
      description: r.description ?? "",
      isMet: r.is_met ?? false,
    })),
  }
}

async function toPdfBuffer(input: string | Buffer): Promise<{ bytes: Buffer; filename: string }> {
  if (Buffer.isBuffer(input)) {
    return { bytes: input, filename: "degreeworks.pdf" }
  }

  const bytes = await readFile(input)
  return { bytes, filename: basename(input) }
}

/**
 * Parse a DegreeWorks PDF file
 * Returns structured student info and course history
 */
export async function parseDegreeWorksPdf(
  filePath: string | Buffer,
  userId: string
): Promise<DegreeWorksResult> {
  if (!userId.trim()) {
    throw new Error("[pdf-parsing:parseDegreeWorksPdf] userId is required")
  }

  const { bytes, filename } = await toPdfBuffer(filePath)
  const form = new FormData()
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), filename)
  const parserEndpoint = getParserEndpoint()

  let response: Response
  try {
    response = await fetch(parserEndpoint, {
      method: "POST",
      body: form,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error"
    throw new Error(
      `[pdf-parsing:parseDegreeWorksPdf] Cannot reach parser endpoint ${parserEndpoint}. ${message}. ` +
        "Start the Python parser service (api/main.py) or set DEGREEWORKS_PARSER_URL."
    )
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `[pdf-parsing:parseDegreeWorksPdf] Parser request failed with ${response.status}: ${body}`
    )
  }

  const payload = normalizeDegreeWorksPayload((await response.json()) as unknown)

  await upsertUserCompletedCourses(userId, payload)

  // Persist all structured DegreeWorks data in parallel (all non-fatal)
  await Promise.all([
    // Academic profile — classification, bulletin year, program
    upsertUserAcademicProfile({
      userId,
      classification: payload.student.classification ?? undefined,
      // Normalize em-dash/en-dash variants → regular hyphen to match DB format "YYYY-YYYY"
      bulletinYear: payload.student.catalogYear
        ? payload.student.catalogYear.replace(/[–—]/g, "-")
        : undefined,
    }).catch(() => null),

    // Degree summary — GPA, progress %, credits, concentration
    upsertDegreeSummary({
      user_id: userId,
      degree_progress_pct: payload.student.degreeProgressPct ?? null,
      credits_required: payload.student.creditsRequired ?? null,
      credits_applied: payload.student.creditsApplied ?? null,
      overall_gpa: payload.student.overallGpa ?? null,
      catalog_year: payload.student.catalogYear ?? null,
      concentration: payload.student.concentration ?? null,
      audit_date: payload.student.auditDate ?? null,
    }).catch(() => null),

    // Requirement blocks — GenEd, Major, Core, Concentration, etc.
    upsertRequirementBlocks(
      userId,
      payload.requirementBlocks.map((b) => ({
        block_name: b.blockName,
        status: b.status,
        credits_required: b.creditsRequired,
        credits_applied: b.creditsApplied,
      }))
    ).catch(() => null),

    // Still-needed / unmet requirements per block
    replaceBlockRequirements(
      userId,
      payload.blockRequirements.map((r) => ({
        block_name: r.blockName,
        description: r.description,
        is_met: r.isMet,
      }))
    ).catch(() => null),
  ])

  return payload
}

/**
 * Returns true if the student has uploaded at least one DegreeWorks PDF
 * (i.e. user_completed_courses has at least one row for this user).
 */
export async function checkUserHasUploadedDegreeWorks(userId: string): Promise<boolean> {
  if (!userId.trim()) return false
  return hasUserUploadedCourses(userId)
}

/**
 * Fetch completed courses mapped to a specific user.
 */
export async function fetchUserCompletedCourses(userId: string): Promise<UserCompletedCourseView[]> {
  if (!userId.trim()) {
    throw new Error("[pdf-parsing:fetchUserCompletedCourses] userId is required")
  }

  return getUserCompletedCourses(userId)
}

/**
 * Fetch in-progress courses mapped to a specific user.
 */
export async function fetchUserInProgressCourses(userId: string): Promise<UserCompletedCourseView[]> {
  if (!userId.trim()) {
    throw new Error("[pdf-parsing:fetchUserInProgressCourses] userId is required")
  }

  const all = await getUserCourseStatuses(userId)
  return all
    .filter((course) => course.status === "in_progress")
    .map((course) => ({
      code: course.code,
      title: course.title,
      creditHours: course.creditHours,
      grade: course.grade,
      term: course.term,
    }))
}
