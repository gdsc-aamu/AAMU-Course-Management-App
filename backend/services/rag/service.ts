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
  ConversationMessage,
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

// ~4 chars per token; keep history under 6k tokens (~24k chars) before summarizing
const MAX_HISTORY_CHARS = 24_000

/**
 * Extract pinned session facts from conversation history.
 * These are re-injected at the top of every prompt so the model never forgets
 * the student's identity even if older messages are trimmed.
 */
function extractSessionFacts(history: ConversationMessage[]): string {
  const facts: string[] = []
  const text = history.map((m) => m.content).join("\n").toLowerCase()

  // Program detection
  const programMatch = text.match(/\b(bsee|bscs|bsce|bsme|bsit|bsba|bsn|bsed|bsee-bs|bscs-bs)\b/i)
  if (programMatch) facts.push(`Student's program: ${programMatch[0].toUpperCase()}`)

  // Classification detection
  const classMatch = text.match(/\b(freshman|sophomore|junior|senior)\b/i)
  if (classMatch) facts.push(`Student's classification: ${classMatch[0]}`)

  // Completed courses mentioned in assistant turns
  const assistantText = history
    .filter((m) => m.role === "assistant")
    .map((m) => m.content)
    .join("\n")
  const courseMatches = assistantText.match(/\b[A-Z]{2,5}\s+\d{3}[A-Z]?\b/g)
  if (courseMatches && courseMatches.length > 0) {
    const unique = [...new Set(courseMatches)].slice(0, 30)
    facts.push(`Courses already discussed this session: ${unique.join(", ")}`)
  }

  if (facts.length === 0) return ""
  return `Pinned session facts (always authoritative — do not contradict these):\n${facts.join("\n")}\n\n`
}

/**
 * Trim history to stay within token budget.
 * Keeps the most recent messages; older ones are dropped.
 * The pinned session facts above compensate for what's lost.
 */
function trimHistory(history: ConversationMessage[]): ConversationMessage[] {
  let totalChars = 0
  const result: ConversationMessage[] = []

  for (let i = history.length - 1; i >= 0; i--) {
    totalChars += history[i].content.length
    if (totalChars > MAX_HISTORY_CHARS) break
    result.unshift(history[i])
  }

  return result
}

/**
 * Build the OpenAI messages array with pinned facts, trimmed history, then the current question.
 */
function buildMessages(
  systemPrompt: string,
  userPrompt: string,
  history: ConversationMessage[] = []
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const sessionFacts = extractSessionFacts(history)
  const trimmed = trimHistory(history)

  const system = sessionFacts
    ? `${systemPrompt}\n\n${sessionFacts}`
    : systemPrompt

  const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...trimmed.map((m) => ({ role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam)),
    { role: "user", content: userPrompt },
  ]

  return msgs
}

const SYSTEM_PROMPT = `You are a helpful academic advisor assistant for Alabama A&M University (AAMU).
You answer student questions strictly based on the provided context.
Always cite bulletin sources using the citation provided (e.g. "2025-2026 AAMU Bulletin, pp. 35-50").
If the context doesn't contain enough information to answer, say so clearly.
Be concise, friendly, and accurate.
Maintain full awareness of the entire conversation history — never forget what was said earlier in this chat.

Semantic equivalence rules — treat these as identical in meaning:
- "taken" = "completed" = "passed" = "finished" = "done with" = status: completed
- "in progress" = "currently taking" = "enrolled in" = "registered for" = status: in_progress
- "need" = "still need" = "haven't taken" = "remaining" = not yet completed
- An honors course (e.g. ENG 101H) satisfies the standard course requirement (e.g. ENG 101)`

/**
 * Generate a RAG response based on bulletin chunks
 */
export async function generateRagResponse(
  query: string,
  chunks: BulletinChunk[],
  studentContextBlock?: string,
  history: ConversationMessage[] = []
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

  const userPrompt = `Answer the following student question using only the context below.
${studentContextBlock ? `\n${studentContextBlock}` : ""}
Question: ${query}

Context:
${context}`

  const openai = getOpenAIClient()
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: buildMessages(SYSTEM_PROMPT, userPrompt, history),
  })

  return response.choices[0].message.content ?? ""
}

/**
 * Generate a hybrid response combining bulletin and curriculum context
 */
export async function generateHybridResponse(
  query: string,
  chunks: BulletinChunk[],
  curriculumContext: string | null,
  studentContextBlock?: string,
  history: ConversationMessage[] = []
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

  const userPrompt = `Answer the following student question using the two context sections below.
Use the curriculum data to address course-specific or program-specific aspects,
and use the bulletin sources to address policy, deadline, or requirement aspects.
${studentContextBlock ? `\n${studentContextBlock}` : ""}
Question: ${query}

--- Curriculum / Program Data ---
${curriculumSection}

--- Bulletin Sources ---
${bulletinSection}`

  const openai = getOpenAIClient()
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: buildMessages(SYSTEM_PROMPT, userPrompt, history),
  })

  return response.choices[0].message.content ?? ""
}

const DB_SYSTEM_PROMPT = `You are a helpful academic advisor assistant for Alabama A&M University (AAMU).
Answer student questions based strictly on the provided curriculum and program data.
Be concise, friendly, and accurate.
If the data doesn't fully answer the question, say so clearly.
Maintain full awareness of the entire conversation history — never forget what was said earlier in this chat.

AAMU Institutional Rules (always apply — never contradict these):
- Maximum credit hours per semester: 19. Students cannot register for more than 19 credits in a single term without explicit dean approval.
- "Currently enrolled" means courses in the student's CURRENT academic term only.
- "Pre-registered" means courses the student has locked in for a FUTURE term. They are NOT yet enrolled in those courses — do not say they are.
- When the data shows both a "current term" section and a "upcoming/pre-registered" section, count them separately. Never add them together to say "you are enrolled in X courses."
- Remaining credit capacity for a future term = 19 − credits already pre-registered for that term.
- If a student is at 19 pre-registered credits, tell them they have hit the cap and need dean approval to add more.

Semantic equivalence rules — treat these as identical in meaning:
- "taken" = "completed" = "passed" = "finished" = "done with" = status: completed
- "enrolled in this semester/term" = courses in the CURRENT term section only
- "registered for next semester" = pre-registered upcoming term courses (NOT currently enrolled)
- "need" = "still need" = "haven't taken" = "remaining" = not yet completed
- An honors course (e.g. ENG 101H) satisfies the standard course requirement (e.g. ENG 101)`

/**
 * Generate a response based on structured database/curriculum data
 * Converts database results to natural language using the LLM
 */
export async function generateDbResponse(
  query: string,
  dataContext: string,
  history: ConversationMessage[] = []
): Promise<string> {
  if (!dataContext || dataContext.trim().length === 0) {
    return "I couldn't find the information you were asking about in the structured curriculum database. Please try a different question or contact your academic advisor."
  }

  const userPrompt = `Answer the following student question using only the curriculum data below.

Question: ${query}

Curriculum Data:
${dataContext}`

  const openai = getOpenAIClient()
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: buildMessages(DB_SYSTEM_PROMPT, userPrompt, history),
  })

  return response.choices[0].message.content ?? ""
}
