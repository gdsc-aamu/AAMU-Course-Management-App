/**
 * Data Access Layer — Bulletin
 * 
 * Responsibility: Raw Supabase queries for bulletin chunks, hybrid search
 * No response generation, no LLM calls — only database access
 * 
 * Current location: /lib/rag/search.ts
 * Status: To be extracted here
 */

import type { BulletinChunk, SearchOptions } from "@/shared/contracts";

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
  // TODO: Extract raw query call from /lib/rag/search.ts
  // Call supabase.rpc("hybrid_search", {...})
  throw new Error("Not yet migrated");
}
