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
  getUserCompletedCourses,
  upsertUserCompletedCourses,
  type UserCompletedCourseView,
} from "@/backend/data-access/pdf-parsing"

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

  const v = value as {
    student?: {
      name?: string
      student_id?: string
      degree?: string
      audit_date?: string
      degree_progress_pct?: number | null
    }
    completed_courses?: Array<{
      code?: string
      title?: string
      grade?: string
      credits?: number
      term?: string
      status?: "completed" | "in_progress"
      section?: string
    }>
    in_progress_courses?: Array<{
      code?: string
      title?: string
      grade?: string
      credits?: number
      term?: string
      status?: "completed" | "in_progress"
      section?: string
    }>
    all_courses?: Array<{
      code?: string
      title?: string
      grade?: string
      credits?: number
      term?: string
      status?: "completed" | "in_progress"
      section?: string
    }>
  }

  if (!v.student || !Array.isArray(v.all_courses)) {
    throw new Error("[pdf-parsing:parseDegreeWorksPdf] Invalid parser payload shape")
  }

  const mapCourse = (course: {
    code?: string
    title?: string
    grade?: string
    credits?: number
    term?: string
    status?: "completed" | "in_progress"
    section?: string
  }) => ({
    code: course.code ?? "",
    title: course.title ?? "",
    grade: course.grade ?? "",
    credits: course.credits ?? 0,
    term: course.term ?? "",
    status: course.status ?? "completed",
    section: course.section ?? "General",
  })

  return {
    student: {
      name: v.student.name ?? "Unknown",
      studentId: v.student.student_id ?? "Unknown",
      degree: v.student.degree ?? "Unknown",
      auditDate: v.student.audit_date ?? "Unknown",
      degreeProgressPct: v.student.degree_progress_pct ?? null,
    },
    completedCourses: (v.completed_courses ?? []).map(mapCourse),
    inProgressCourses: (v.in_progress_courses ?? []).map(mapCourse),
    allCourses: v.all_courses.map(mapCourse),
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
  return payload
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
