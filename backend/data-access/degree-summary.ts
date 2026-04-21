/**
 * Data Access Layer — Degree Summary
 *
 * Responsibility: Persist and retrieve structured DegreeWorks data
 * (degree summary, requirement blocks, block requirements)
 */

import { createClient } from "@supabase/supabase-js"

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars")
  return createClient(url, key)
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface DegreeSummaryRow {
  user_id: string
  degree_progress_pct: number | null
  credits_required: number | null
  credits_applied: number | null
  credits_remaining: number | null
  overall_gpa: number | null
  catalog_year: string | null
  concentration: string | null
  audit_date: string | null
}

export interface RequirementBlockRow {
  user_id: string
  block_name: string
  status: "complete" | "in_progress" | "incomplete"
  credits_required: number | null
  credits_applied: number | null
  credits_remaining: number | null
}

export interface BlockRequirementRow {
  user_id: string
  block_name: string
  description: string
  is_met: boolean
}

// ── Upserts ──────────────────────────────────────────────────────────────────

export async function upsertDegreeSummary(row: Omit<DegreeSummaryRow, "credits_remaining">): Promise<void> {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from("student_degree_summary")
    .upsert(row, { onConflict: "user_id" })

  if (error) throw new Error(`[degree-summary:upsertDegreeSummary] ${error.message}`)
}

export async function upsertRequirementBlocks(
  userId: string,
  blocks: Array<Omit<RequirementBlockRow, "user_id" | "credits_remaining">>
): Promise<void> {
  if (blocks.length === 0) return
  const supabase = getSupabaseClient()

  const rows = blocks.map((b) => ({ ...b, user_id: userId }))
  const { error } = await supabase
    .from("student_requirement_blocks")
    .upsert(rows, { onConflict: "user_id,block_name" })

  if (error) throw new Error(`[degree-summary:upsertRequirementBlocks] ${error.message}`)
}

export async function replaceBlockRequirements(
  userId: string,
  requirements: Array<Omit<BlockRequirementRow, "user_id">>
): Promise<void> {
  const supabase = getSupabaseClient()

  // Delete existing then insert fresh — simpler than upsert on description text
  await supabase.from("student_block_requirements").delete().eq("user_id", userId)

  if (requirements.length === 0) return

  const rows = requirements.map((r) => ({ ...r, user_id: userId }))
  const { error } = await supabase.from("student_block_requirements").insert(rows)

  if (error) throw new Error(`[degree-summary:replaceBlockRequirements] ${error.message}`)
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function getDegreeSummary(userId: string): Promise<DegreeSummaryRow | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("student_degree_summary")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (error || !data) return null
  return data as DegreeSummaryRow
}

export async function getRequirementBlocks(userId: string): Promise<RequirementBlockRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("student_requirement_blocks")
    .select("*")
    .eq("user_id", userId)
    .order("block_name")

  if (error || !data) return []
  return data as RequirementBlockRow[]
}

export async function getBlockRequirements(userId: string): Promise<BlockRequirementRow[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("student_block_requirements")
    .select("*")
    .eq("user_id", userId)

  if (error || !data) return []
  return data as BlockRequirementRow[]
}
