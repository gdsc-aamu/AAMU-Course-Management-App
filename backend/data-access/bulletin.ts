/**
 * Data Access Layer — Bulletin
 * 
 * Responsibility: Raw Supabase queries for bulletin chunks, hybrid search
 * No response generation, no LLM calls — only database access
 * 
 * Current location: Extracted from /lib/rag/search.ts
 */

import { createClient } from "@supabase/supabase-js"
import type { BulletinChunk } from "@/shared/contracts"
import OpenAI from "openai"

interface HybridSearchRow {
  content: string | null
  title: string | null
  chunk_type: string | null
  section_hierarchy: string | null
  citation: string | null
  is_critical: boolean | null
  bulletin_year: string | null
}

function toDataAccessError(context: string, message: string): Error {
  return new Error(`[data-access:${context}] ${message}`)
}

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

/**
 * Generate embedding for a query using OpenAI
 */
export async function getQueryEmbedding(query: string): Promise<number[]> {
  const openai = getOpenAIClient()
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      dimensions: 1536,
    })
    return embeddingResponse.data[0].embedding
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown embedding error"
    throw toDataAccessError("getQueryEmbedding", message)
  }
}

/**
 * Run hybrid search (full-text + semantic) on bulletin chunks
 * Raw query — no type inference or response formatting
 */
export async function hybridSearchBulletin(
  queryText: string,
  queryEmbedding: number[],
  bulletinYear: string,
  matchCount: number = 5,
  filterChunkType?: string | null,
  boostCritical?: boolean
): Promise<BulletinChunk[]> {
  const supabase = getSupabaseClient()
  try {
    const { data, error } = await supabase.rpc("hybrid_search", {
      query_text: queryText,
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_year: bulletinYear,
      filter_chunk_type: filterChunkType ?? null,
      boost_critical: boostCritical ?? true,
      full_text_weight: 1,
      semantic_weight: 2,
    })

    if (error) {
      throw toDataAccessError("hybridSearchBulletin", error.message)
    }

    const rows = (data ?? []) as HybridSearchRow[]
    return rows.map((row) => ({
      content: row.content ?? "",
      title: row.title ?? "Untitled",
      chunkType: row.chunk_type ?? "unknown",
      sectionHierarchy: row.section_hierarchy ?? "",
      citation: row.citation ?? "",
      isCritical: row.is_critical ?? false,
      bulletinYear: row.bulletin_year ?? bulletinYear,
    }))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("[data-access:")) {
      throw error
    }

    const message = error instanceof Error ? error.message : "Unknown hybrid search error"
    throw toDataAccessError("hybridSearchBulletin", message)
  }
}
