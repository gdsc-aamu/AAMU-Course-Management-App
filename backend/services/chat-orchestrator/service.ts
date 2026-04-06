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
import { searchBulletin, generateRagResponse, generateHybridResponse } from "@/backend/services/rag/service"
import {
  fetchCurriculumContext,
  fetchProgramOverview,
  fetchCoursePrerequisitesByCode,
} from "@/backend/services/curriculum/service"

/**
 * Handle DB_ONLY queries — curriculum and course prerequisites
 */
async function handleDbOnly(payload: ChatQueryRequest): Promise<Record<string, unknown>> {
  const question = payload.question.trim()
  const programCode = payload.session?.programCode
  const normalizedQuestion = question.toLowerCase()

  // Match course patterns like "CS 214", "MTH101", "BIO-201".
  const courseCodeMatch = question.match(/\b([A-Za-z]{2,4})[\s-]?(\d{3})\b/)
  if (courseCodeMatch) {
    const normalizedCourseCode = `${courseCodeMatch[1].toUpperCase()} ${courseCodeMatch[2]}`
    const prereq = await fetchCoursePrerequisitesByCode(normalizedCourseCode)

    if (!prereq) {
      return {
        mode: "DB_ONLY",
        answer: `I couldn't find ${normalizedCourseCode} in the structured course catalog.`,
        data: null,
      }
    }

    if (prereq.groups.length === 0) {
      return {
        mode: "DB_ONLY",
        answer: `${prereq.courseId} (${prereq.title}) has no prerequisites in the catalog data.`,
        data: prereq,
      }
    }

    const prereqText = prereq.groups
      .map((group) => {
        const options = group.options.map((opt) => {
          const grade = opt.minGrade ? ` (min ${opt.minGrade})` : ""
          return `${opt.courseId}${grade}`
        })

        return `Group ${group.prereqGroup}: ${options.join(" OR ")}`
      })
      .join("; ")

    return {
      mode: "DB_ONLY",
      answer: `Prerequisites for ${prereq.courseId} (${prereq.title}): ${prereqText}`,
      data: prereq,
    }
  }

  if (!programCode) {
    return {
      mode: "DB_ONLY",
      answer:
        "I can answer structured program questions, but I need session.programCode (for example: BSCS-BS) to query the curriculum tables.",
      data: null,
    }
  }

  const [overview, curriculum] = await Promise.all([
    fetchProgramOverview(programCode),
    fetchCurriculumContext(programCode),
  ])

  if (!overview || !curriculum) {
    return {
      mode: "DB_ONLY",
      answer: `I couldn't find structured curriculum data for program code ${programCode}.`,
      data: { programCode },
    }
  }

  const asksSummary = /summary|overview|program|curriculum|degree progress|remaining credit|credits?/i.test(
    normalizedQuestion
  )

  if (asksSummary) {
    return {
      mode: "DB_ONLY",
      answer: `${overview.programName} (${overview.programCode}) requires ${overview.totalCreditHours} credits across ${overview.semesterCount} semesters. The curriculum currently has ${overview.totalSlots} slots, including ${overview.electiveSlots} elective slots.`,
      data: {
        overview,
        curriculumText: curriculum.formattedText,
      },
    }
  }

  return {
    mode: "DB_ONLY",
    answer: `I found structured curriculum data for ${overview.programCode}. Ask about course prerequisites (for example: 'What are the prerequisites for CS 214?') or program credits/semester layout.`,
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
  const programCode = payload.session?.programCode ?? null

  // Run bulletin search and curriculum fetch in parallel
  const [chunks, curriculum] = await Promise.all([
    searchBulletin(payload.question, { bulletinYear }, { matchCount: 5 }),
    programCode ? fetchCurriculumContext(programCode) : Promise.resolve(null),
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
