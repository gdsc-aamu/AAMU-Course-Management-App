import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars")
  return createClient(url, key)
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var")
  return new OpenAI({ apiKey })
}

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

export interface BulletinChunk {
  content: string
  title: string
  chunkType: string
  sectionHierarchy: string
  citation: string
  isCritical: boolean
  bulletinYear: string
}

export interface StudentProfile {
  bulletinYear: string
}

export interface SearchOptions {
  matchCount?: number
}

export async function searchBulletin(
  query: string,
  studentProfile: StudentProfile,
  options: SearchOptions = {}
): Promise<BulletinChunk[]> {
  const { matchCount = 5 } = options
  const { bulletinYear } = studentProfile

  if (!bulletinYear) throw new Error("studentProfile must include bulletinYear")

  const { type: inferredType, hard: isHardFilter } = inferChunkType(query)

  const openai = getOpenAIClient()
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
    dimensions: 1536,
  })
  const queryEmbedding = embeddingResponse.data[0].embedding

  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc("hybrid_search", {
    query_text: query,
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_year: bulletinYear,
    filter_chunk_type: isHardFilter ? inferredType : null,
    boost_critical: true,
    full_text_weight: 1,
    semantic_weight: 2,
  })

  if (error) throw new Error(error.message)

  return (data as Record<string, unknown>[]).map((row) => ({
    content: row.content as string,
    title: row.title as string,
    chunkType: row.chunk_type as string,
    sectionHierarchy: row.section_hierarchy as string,
    citation: row.citation as string,
    isCritical: row.is_critical as boolean,
    bulletinYear: row.bulletin_year as string,
  }))
}

const SYSTEM_PROMPT = `You are a helpful academic advisor assistant for Alabama A&M University (AAMU).
You answer student questions strictly based on the provided context.
Always cite bulletin sources using the citation provided (e.g. "2025-2026 AAMU Bulletin, pp. 35-50").
If the context doesn't contain enough information to answer, say so clearly.
Be concise, friendly, and accurate.`

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