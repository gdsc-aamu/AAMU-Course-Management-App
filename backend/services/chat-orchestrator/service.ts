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
  resolveCatalogYearFromQuestion,
  resolveProgramCodeFromQuestion,
} from "@/backend/services/curriculum/service"

function asksPrerequisiteQuestion(question: string): boolean {
  return /(prereq|pre-?req|pre requisite|pre-requisite|prerequisite|prerequisites|need before|required before|eligib(le|ility) for)/i.test(
    question
  )
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
  const catalogYear = resolveCatalogYearFromQuestion(question, payload.session?.bulletinYear)
  const programCode = await resolveProgramCodeFromQuestion(
    question,
    payload.session?.programCode,
    catalogYear
  )
  const normalizedQuestion = question.toLowerCase()
  const isPrereqQuery = asksPrerequisiteQuestion(question)

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
  const bulletinYear = payload.session?.bulletinYear ?? "2025-2026"
  const catalogYear = resolveCatalogYearFromQuestion(payload.question, bulletinYear)
  const programCode = await resolveProgramCodeFromQuestion(
    payload.question,
    payload.session?.programCode ?? null,
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
