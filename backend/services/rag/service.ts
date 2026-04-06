/**
 * RAG Service
 * 
 * Responsibility: Bulletin search, response generation, hybrid chat
 * Handles inference and LLM calls; delegates data access to data-access layer
 * 
 * Current location of implementation: /lib/rag/search.ts
 */

import type {
  BulletinChunk,
  StudentProfile,
  SearchOptions,
} from "@/shared/contracts"
import { hybridSearchBulletin, getQueryEmbedding } from "@/backend/data-access/bulletin"
import OpenAI from "openai"

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var")
  return new OpenAI({ apiKey })
}

/**
 * Infer chunk type from query for filtering
 */
function inferChunkType(query: string): { type: string | null; hard: boolean } {
  const q = query.toLowerCase()

  if (/fee|cost|tuition|pay|payment|charge|bill/.test(q))
    return { type: "fee_schedule", hard: true }

  if (/deadline|calendar|registration date|semester date|schedule|add.drop/.test(q))
    return { type: "calendar", hard: true }

  if (/graduat|requirement|credit hour|gpa|degree plan|curriculum/.test(q))
    return { type: "requirement", hard: false }

  if (/program|major|department|college of/.test(q))
    return { type: "program_info", hard: false }

  if (/policy|appeal|dismiss|probation|conduct|suspend|academ/.test(q))
    return { type: "policy", hard: false }

  return { type: null, hard: false }
}

/**
 * Search the bulletin using hybrid semantic + full-text search
 */
export async function searchBulletin(
  query: string,
  studentProfile: StudentProfile,
  options: SearchOptions = {}
): Promise<BulletinChunk[]> {
  const { matchCount = 5 } = options
  const { bulletinYear } = studentProfile

  if (!bulletinYear) throw new Error("studentProfile must include bulletinYear")

  const { type: inferredType, hard: isHardFilter } = inferChunkType(query)

  const queryEmbedding = await getQueryEmbedding(query)

  return hybridSearchBulletin(
    query,
    queryEmbedding,
    bulletinYear,
    matchCount,
    isHardFilter ? inferredType : null,
    true
  )
}

const SYSTEM_PROMPT = `You are a helpful academic advisor assistant for Alabama A&M University (AAMU).
You answer student questions strictly based on the provided context.
Always cite bulletin sources using the citation provided (e.g. "2025-2026 AAMU Bulletin, pp. 35-50").
If the context doesn't contain enough information to answer, say so clearly.
Be concise, friendly, and accurate.`

/**
 * Generate a RAG response based on bulletin chunks
 */
export async function generateRagResponse(
  query: string,
  chunks: BulletinChunk[]
): Promise<string> {
  if (chunks.length === 0) {
    return "I couldn't find relevant information in the AAMU bulletin to answer your question. Please contact your academic advisor for assistance."
  }

  const context = chunks
    .map(
      (r, i) => `[Source ${i + 1}]
Title: ${r.title}
Citation: ${r.citation}
${r.isCritical ? "⚠️ This is a critical policy." : ""}
Content: ${r.content}`.trim()
    )
    .join("\n\n")

  const openai = getOpenAIClient()
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Answer the following student question using only the context below.

Question: ${query}

Context:
${context}`,
      },
    ],
  })

  return response.choices[0].message.content ?? ""
}

/**
 * Generate a hybrid response combining bulletin and curriculum context
 */
export async function generateHybridResponse(
  query: string,
  chunks: BulletinChunk[],
  curriculumContext: string | null
): Promise<string> {
  const bulletinSection =
    chunks.length > 0
      ? chunks
          .map(
            (r, i) => `[Bulletin Source ${i + 1}]
Title: ${r.title}
Citation: ${r.citation}
${r.isCritical ? "⚠️ This is a critical policy." : ""}
Content: ${r.content}`.trim()
          )
          .join("\n\n")
      : "No relevant bulletin sections found."

  const curriculumSection = curriculumContext
    ? curriculumContext
    : "No program curriculum data available."

  const openai = getOpenAIClient()
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Answer the following student question using the two context sections below.
Use the curriculum data to address course-specific or program-specific aspects,
and use the bulletin sources to address policy, deadline, or requirement aspects.

Question: ${query}

--- Curriculum / Program Data ---
${curriculumSection}

--- Bulletin Sources ---
${bulletinSection}`,
      },
    ],
  })

  return response.choices[0].message.content ?? ""
}

/**
 * Generate a response based on structured database/curriculum data
 * Converts database results to natural language using the LLM
 */
export async function generateDbResponse(
  query: string,
  dataContext: string
): Promise<string> {
  if (!dataContext || dataContext.trim().length === 0) {
    return "I couldn't find the information you were asking about in the structured curriculum database. Please try a different question or contact your academic advisor."
  }

  const openai = getOpenAIClient()
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You are a helpful academic advisor assistant for Alabama A&M University (AAMU).
Answer student questions based strictly on the provided curriculum and program data.
Be concise, friendly, and accurate.
If the data doesn't fully answer the question, say so clearly.`,
      },
      {
        role: "user",
        content: `Answer the following student question using only the curriculum data below.

Question: ${query}

Curriculum Data:
${dataContext}`,
      },
    ],
  })

  return response.choices[0].message.content ?? ""
}
