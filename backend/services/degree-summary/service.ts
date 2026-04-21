/**
 * Degree Summary Service
 *
 * Responsibility: Fetch and format structured DegreeWorks data for chat use.
 * Pulls from student_degree_summary, student_requirement_blocks, student_block_requirements.
 */

import {
  getDegreeSummary,
  getRequirementBlocks,
  getBlockRequirements,
  type DegreeSummaryRow,
  type RequirementBlockRow,
  type BlockRequirementRow,
} from "@/backend/data-access/degree-summary"

export interface FullDegreeSummary {
  summary: DegreeSummaryRow | null
  blocks: RequirementBlockRow[]
  unmetRequirements: BlockRequirementRow[]
}

export async function fetchFullDegreeSummary(userId: string): Promise<FullDegreeSummary> {
  const [summary, blocks, unmet] = await Promise.all([
    getDegreeSummary(userId).catch(() => null),
    getRequirementBlocks(userId).catch(() => []),
    getBlockRequirements(userId).catch(() => []),
  ])

  return {
    summary,
    blocks,
    unmetRequirements: unmet.filter((r) => !r.is_met),
  }
}

/**
 * Format full degree summary as a compact context string for the LLM.
 * Designed to give the model everything it needs without re-reading the PDF.
 */
export function formatDegreeSummaryForLLM(data: FullDegreeSummary): string {
  const { summary, blocks, unmetRequirements } = data

  if (!summary && blocks.length === 0) return ""

  const lines: string[] = []

  if (summary) {
    lines.push("=== Degree Progress Summary ===")
    if (summary.degree_progress_pct != null)
      lines.push(`Progress: ${summary.degree_progress_pct}%`)
    if (summary.overall_gpa != null)
      lines.push(`Overall GPA: ${summary.overall_gpa}`)
    if (summary.credits_required != null)
      lines.push(`Credits Required: ${summary.credits_required}`)
    if (summary.credits_applied != null)
      lines.push(`Credits Applied: ${summary.credits_applied}`)
    if (summary.credits_remaining != null)
      lines.push(`Credits Remaining: ${summary.credits_remaining}`)
    if (summary.catalog_year)
      lines.push(`Catalog Year: ${summary.catalog_year}`)
    if (summary.concentration)
      lines.push(`Concentration: ${summary.concentration}`)
    if (summary.audit_date)
      lines.push(`Audit Date: ${summary.audit_date}`)
  }

  if (blocks.length > 0) {
    lines.push("\n=== Requirement Blocks ===")
    for (const block of blocks) {
      const status = block.status === "complete"
        ? "✓ Complete"
        : block.status === "in_progress"
        ? "◑ In Progress"
        : "✗ Incomplete"
      const credits = block.credits_required != null
        ? ` | ${block.credits_applied ?? 0}/${block.credits_required} credits`
        : ""
      lines.push(`${block.block_name}: ${status}${credits}`)
    }
  }

  if (unmetRequirements.length > 0) {
    lines.push("\n=== Still Needed ===")
    for (const req of unmetRequirements) {
      lines.push(`[${req.block_name}] ${req.description}`)
    }
  }

  return lines.join("\n")
}
