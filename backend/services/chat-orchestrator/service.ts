/**
 * Chat Orchestrator Service
 * 
 * Responsibility: Coordinate chat queries across curriculum and RAG services
 * Handles DB_ONLY, RAG_ONLY, and HYBRID modes
 * 
 * Current location of logic: /app/api/chat/query/route.ts
 */

import type { ChatQueryRequest, RoutedResponse } from "@/shared/contracts"
import { decideRoute } from "@/lib/chat-routing/router"
import { searchBulletin, generateRagResponse, generateHybridResponse, generateDbResponse } from "@/backend/services/rag/service"
import {
  fetchCurriculumContext,
  fetchProgramOverview,
  fetchCoursePrerequisitesByCode,
  formatPrerequisiteForLLM,
  formatCurriculumForLLM,
  recommendNextCoursesForUser,
  resolveCatalogYearFromQuestion,
  resolveProgramCodeFromQuestion,
} from "@/backend/services/curriculum/service"
import {
  fetchUserCompletedCourses,
  fetchUserInProgressCourses,
} from "@/backend/services/pdf-parsing/service"
import { fetchUserAcademicProfile } from "@/backend/services/user-profile/service"

function asksPrerequisiteQuestion(question: string): boolean {
  return /(prereq|pre-?req|pre requisite|pre-requisite|prerequisite|prerequisites|need before|required before|eligib(le|ility) for)/i.test(
    question
  )
}

function asksNextCoursesQuestion(question: string): boolean {
  return /(what\s+should\s+i\s+take\s+next|next\s+courses?|courses?\s+i\s+need\s+next|what\s+courses?\s+can\s+i\s+take\s+next|what\s+courses?\s+can\s+i\s+take\??)/i.test(
    question
  )
}

function asksCompletedCoursesQuestion(question: string): boolean {
  return /(what\s+courses?\s+have\s+i\s+completed|what\s+have\s+i\s+completed|completed\s+courses?|courses?\s+completed\s+thus\s+far)/i.test(
    question
  )
}

function buildNextCoursesContext(rec: {
  programCode: string
  catalogYear: number | null
  completedCount: number
  inProgressCount: number
  eligibleNow: Array<{ courseId: string; title: string; creditHours: number; semesterLabel: string }>
  blocked: Array<{ courseId: string; title: string; missingPrerequisiteGroups: string[]; semesterLabel: string }>
  alreadyInProgress: Array<{ courseId: string; title: string; semesterLabel: string }>
}): string {
  const eligibleLines = rec.eligibleNow.length
    ? rec.eligibleNow
        .slice(0, 8)
        .map(
          (course) =>
            `- ${course.courseId}: ${course.title} (${course.creditHours} cr) [${course.semesterLabel}]`
        )
        .join("\n")
    : "- None"

  const blockedLines = rec.blocked.length
    ? rec.blocked
        .slice(0, 6)
        .map(
          (course) =>
            `- ${course.courseId}: ${course.title} [${course.semesterLabel}] — missing: ${course.missingPrerequisiteGroups.join(
              "; "
            )}`
        )
        .join("\n")
    : "- None"

  const inProgressLines = rec.alreadyInProgress.length
    ? rec.alreadyInProgress
        .slice(0, 6)
        .map((course) => `- ${course.courseId}: ${course.title} [${course.semesterLabel}]`)
        .join("\n")
    : "- None"

  return `Program: ${rec.programCode}
Catalog Year: ${rec.catalogYear ?? "latest"}
Completed Courses Count: ${rec.completedCount}
In Progress Courses Count: ${rec.inProgressCount}

Eligible To Take Next:
${eligibleLines}

Already In Progress:
${inProgressLines}

Blocked (Missing Prerequisites):
${blockedLines}`
}

function extractCourseCodeFromQuestion(question: string): string | null {
  // Match patterns like "CS 214", "MTH101", "BIO-201", "CHEM 102"
  const codeMatch = question.match(/\b([A-Za-z]{2,5})[\s-]?(\d{3}[A-Za-z]?)\b/)
  if (!codeMatch) return null

  return `${codeMatch[1].toUpperCase()} ${codeMatch[2].toUpperCase()}`
}

/**
 * Handle DB_ONLY queries — curriculum and course prerequisites
 */
async function handleDbOnly(payload: ChatQueryRequest): Promise<Record<string, unknown>> {
  const question = payload.question.trim()
  const userProfile = payload.studentId
    ? await fetchUserAcademicProfile(payload.studentId).catch(() => null)
    : null

  const fallbackBulletinYear = payload.session?.bulletinYear ?? userProfile?.bulletinYear ?? null
  const catalogYear = resolveCatalogYearFromQuestion(question, fallbackBulletinYear)
  const programCode = await resolveProgramCodeFromQuestion(
    question,
    payload.session?.programCode ?? userProfile?.programCode ?? null,
    catalogYear
  )
  const normalizedQuestion = question.toLowerCase()
  const isPrereqQuery = asksPrerequisiteQuestion(question)
  const isNextCoursesQuery = asksNextCoursesQuestion(question)
  const isCompletedCoursesQuery = asksCompletedCoursesQuestion(question)

  if (isCompletedCoursesQuery) {
    if (!payload.studentId) {
      const answer = await generateDbResponse(
        question,
        "Request type: Completed courses\nStatus: Missing studentId for user-specific records"
      )
      return {
        mode: "DB_ONLY",
        answer,
        data: null,
      }
    }

    const [completed, inProgress] = await Promise.all([
      fetchUserCompletedCourses(payload.studentId),
      fetchUserInProgressCourses(payload.studentId),
    ])

    const completedLines = completed.length
      ? completed.map((course) => `- ${course.code}: ${course.title} (${course.creditHours} cr)`).join("\n")
      : "- None"

    const inProgressLines = inProgress.length
      ? inProgress.map((course) => `- ${course.code}: ${course.title} (${course.creditHours} cr)`).join("\n")
      : "- None"

    const context = `Request type: Completed courses
Completed courses (${completed.length}):
${completedLines}

In-progress courses (${inProgress.length}):
${inProgressLines}`

    const answer = await generateDbResponse(question, context)

    return {
      mode: "DB_ONLY",
      answer,
      data: {
        completed,
        inProgress,
      },
    }
  }

  if (isNextCoursesQuery) {
    if (!payload.studentId) {
      const answer = await generateDbResponse(
        question,
        "Request type: Next courses recommendation\nStatus: Missing studentId for user-specific planning context"
      )
      return {
        mode: "DB_ONLY",
        answer,
        data: null,
      }
    }

    if (!programCode) {
      const answer = await generateDbResponse(
        question,
        "Request type: Next courses recommendation\nStatus: Missing or unresolved program code"
      )
      return {
        mode: "DB_ONLY",
        answer,
        data: null,
      }
    }

    const recommendation = await recommendNextCoursesForUser({
      userId: payload.studentId,
      programCode,
      bulletinYear: fallbackBulletinYear,
      maxRecommendations: 12,
    })

    if (!recommendation) {
      const answer = await generateDbResponse(
        question,
        `Program Code: ${programCode}\nCatalog Year: ${catalogYear ?? "latest"}\nStatus: No recommendation data available`
      )
      return {
        mode: "DB_ONLY",
        answer,
        data: null,
      }
    }

    const planningContext = buildNextCoursesContext(recommendation)
    const answer = await generateDbResponse(question, planningContext)

    return {
      mode: "DB_ONLY",
      answer,
      data: recommendation,
    }
  }

  if (isPrereqQuery) {
    const normalizedCourseCode = extractCourseCodeFromQuestion(question)
    if (!normalizedCourseCode) {
      const answer = await generateDbResponse(
        question,
        "Request type: Prerequisites\nStatus: No valid course code found in question\nHint: Use a course code format like CS 214 or BIO 311"
      )
      return {
        mode: "DB_ONLY",
        answer,
        data: null,
      }
    }

    const prereq = await fetchCoursePrerequisitesByCode(normalizedCourseCode)

    if (!prereq) {
      const answer = await generateDbResponse(
        question,
        `Course Code: ${normalizedCourseCode}\nStatus: Not found in the course catalog`
      )
      return {
        mode: "DB_ONLY",
        answer,
        data: null,
      }
    }

    // Format prerequisite data for the LLM
    const prereqContext = formatPrerequisiteForLLM(prereq)
    const answer = await generateDbResponse(question, prereqContext)

    return {
      mode: "DB_ONLY",
      answer,
      data: prereq,
    }
  }

  if (!programCode) {
    const answer = await generateDbResponse(
      question,
      "Available data: Structured program curriculum data requires a program code (e.g., BSCS-BS)"
    )
    return {
      mode: "DB_ONLY",
      answer,
      data: null,
    }
  }

  const [overview, curriculum] = await Promise.all([
    fetchProgramOverview(programCode, catalogYear),
    fetchCurriculumContext(programCode, catalogYear),
  ])

  if (!overview || !curriculum) {
    const answer = await generateDbResponse(
      question,
      `Program Code: ${programCode}\nCatalog Year: ${catalogYear ?? "latest"}\nStatus: Curriculum data not found`
    )
    return {
      mode: "DB_ONLY",
      answer,
      data: { programCode },
    }
  }

  const asksSummary = /summary|overview|program|curriculum|degree progress|remaining credit|credits?/i.test(
    normalizedQuestion
  )

  if (asksSummary) {
    const curriculumContext = formatCurriculumForLLM(overview, curriculum)
    const answer = await generateDbResponse(question, curriculumContext)

    return {
      mode: "DB_ONLY",
      answer,
      data: {
        overview,
        curriculumText: curriculum.formattedText,
      },
    }
  }

  const curriculumContext = formatCurriculumForLLM(overview, curriculum)
  const answer = await generateDbResponse(
    question,
    `${curriculumContext}\n\nYou can ask about:
- Specific courses and their prerequisites
- Program credit requirements
- Semester course layout
- Elective slots and requirements`
  )

  return {
    mode: "DB_ONLY",
    answer,
    data: {
      overview,
    },
  }
}

/**
 * Handle RAG_ONLY queries — bulletin and policies
 */
async function handleRagOnly(payload: ChatQueryRequest): Promise<Record<string, unknown>> {
  const bulletinYear = payload.session?.bulletinYear ?? "2025-2026"

  const chunks = await searchBulletin(
    payload.question,
    { bulletinYear },
    { matchCount: 5 }
  )

  const answer = await generateRagResponse(payload.question, chunks)

  return {
    mode: "RAG_ONLY",
    answer,
    sources: chunks.map((c) => ({
      title: c.title,
      citation: c.citation,
      chunkType: c.chunkType,
      isCritical: c.isCritical,
    })),
  }
}

/**
 * Handle HYBRID queries — both curriculum and bulletin
 */
async function handleHybrid(payload: ChatQueryRequest): Promise<Record<string, unknown>> {
  const userProfile = payload.studentId
    ? await fetchUserAcademicProfile(payload.studentId).catch(() => null)
    : null
  const bulletinYear = payload.session?.bulletinYear ?? userProfile?.bulletinYear ?? "2025-2026"
  const catalogYear = resolveCatalogYearFromQuestion(payload.question, bulletinYear)
  const programCode = await resolveProgramCodeFromQuestion(
    payload.question,
    payload.session?.programCode ?? userProfile?.programCode ?? null,
    catalogYear
  )

  // Run bulletin search and curriculum fetch in parallel
  const [chunks, curriculum] = await Promise.all([
    searchBulletin(payload.question, { bulletinYear }, { matchCount: 5 }),
    programCode ? fetchCurriculumContext(programCode, catalogYear) : Promise.resolve(null),
  ])

  const answer = await generateHybridResponse(
    payload.question,
    chunks,
    curriculum?.formattedText ?? null
  )

  return {
    mode: "HYBRID",
    answer,
    sources: chunks.map((c) => ({
      title: c.title,
      citation: c.citation,
      chunkType: c.chunkType,
      isCritical: c.isCritical,
    })),
    curriculum: curriculum
      ? { programCode: curriculum.programCode, programName: curriculum.programName }
      : null,
  }
}

/**
 * Process a chat query using intelligent routing
 */
export async function processChatQuery(payload: ChatQueryRequest): Promise<RoutedResponse> {
  const decision = decideRoute(payload)

  let handlerResult: Record<string, unknown>
  if (decision.route === "DB_ONLY") {
    handlerResult = await handleDbOnly(payload)
  } else if (decision.route === "RAG_ONLY") {
    handlerResult = await handleRagOnly(payload)
  } else {
    handlerResult = await handleHybrid(payload)
  }

  return {
    route: decision.route,
    confidence: decision.confidence,
    matchedRules: decision.matchedRules,
    missingContext: decision.missingContext,
    handlerResult,
  }
}
