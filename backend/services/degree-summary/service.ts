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

export type AcademicStanding = "good" | "warning" | "probation" | "unknown"

export interface AcademicStandingResult {
  standing: AcademicStanding
  gpa: number | null
  creditsApplied: number | null
  semestersToResolve: number | null
  message: string
  appearsOnTranscript: boolean
}

export function computeAcademicStanding(summary: DegreeSummaryRow | null): AcademicStandingResult {
  if (!summary || summary.overall_gpa == null || summary.credits_applied == null) {
    return { standing: "unknown", gpa: null, creditsApplied: null, semestersToResolve: null, message: "Academic standing unknown — GPA data not available.", appearsOnTranscript: false }
  }

  const gpa = summary.overall_gpa
  const credits = summary.credits_applied

  if (gpa < 1.50 && credits < 24) {
    return {
      standing: "warning",
      gpa,
      creditsApplied: credits,
      semestersToResolve: 3,
      message: `⚠️ Academic Warning: Your GPA of ${gpa.toFixed(2)} is below 1.50. You have 3 semesters to return to good standing. This does NOT appear on your official transcript. Contact the Academic Recovery Program (256.372.8418) for support.`,
      appearsOnTranscript: false,
    }
  }

  if (gpa < 1.75 && credits >= 25 && credits <= 44) {
    return {
      standing: "probation",
      gpa,
      creditsApplied: credits,
      semestersToResolve: 2,
      message: `🚨 Academic Probation: Your GPA of ${gpa.toFixed(2)} is below 1.75. You have 2 semesters to reach good standing. This APPEARS on your official transcript. Contact the Academic Recovery Program immediately.`,
      appearsOnTranscript: true,
    }
  }

  if (gpa < 2.00 && credits >= 45) {
    return {
      standing: "probation",
      gpa,
      creditsApplied: credits,
      semestersToResolve: 2,
      message: `🚨 Academic Probation: Your GPA of ${gpa.toFixed(2)} is below the 2.00 minimum required for good standing. You have 2 semesters to recover. This appears on your official transcript.`,
      appearsOnTranscript: true,
    }
  }

  return {
    standing: "good",
    gpa,
    creditsApplied: credits,
    semestersToResolve: null,
    message: `Your GPA of ${gpa.toFixed(2)} is in good academic standing.`,
    appearsOnTranscript: false,
  }
}

export interface SapStatusResult {
  meetsGpa: boolean
  requiredGpa: number
  currentGpa: number | null
  gpaThreatMessage: string | null
}

export function computeSapStatus(summary: DegreeSummaryRow | null): SapStatusResult {
  if (!summary || summary.overall_gpa == null || summary.credits_applied == null) {
    return { meetsGpa: true, requiredGpa: 2.00, currentGpa: null, gpaThreatMessage: null }
  }

  const gpa = summary.overall_gpa
  const credits = summary.credits_applied

  let requiredGpa = 2.00
  if (credits <= 30) requiredGpa = 1.50
  else if (credits <= 63) requiredGpa = 1.75

  const meetsGpa = gpa >= requiredGpa

  const gpaThreatMessage = !meetsGpa
    ? `⚠️ Financial Aid Alert: Your GPA (${gpa.toFixed(2)}) is below the SAP minimum of ${requiredGpa.toFixed(2)} required at your credit level (${credits} credits applied). You may be at risk of losing federal financial aid. File a SAP appeal within 2 weeks of notification if aid is suspended.`
    : (gpa < requiredGpa + 0.20)
    ? `📌 Note: Your GPA (${gpa.toFixed(2)}) is close to the SAP minimum of ${requiredGpa.toFixed(2)} for financial aid eligibility. Maintain your grades this semester to stay eligible.`
    : null

  return { meetsGpa, requiredGpa, currentGpa: gpa, gpaThreatMessage }
}

export const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0, "A": 4.0, "A-": 3.7,
  "B+": 3.3, "B": 3.0, "B-": 2.7,
  "C+": 2.3, "C": 2.0, "C-": 1.7,
  "D+": 1.3, "D": 1.0, "D-": 0.7,
  "F": 0.0,
}

export interface GpaProjectionResult {
  currentGpa: number
  projectedGpa: number
  creditsAfter: number
  explanation: string
}

export function computeGpaProjection(
  summary: DegreeSummaryRow | null,
  newCourses: Array<{ credits: number; expectedGrade: string }>
): GpaProjectionResult | null {
  if (!summary || summary.overall_gpa == null || summary.credits_applied == null) return null

  const currentGpa = summary.overall_gpa
  const currentCredits = summary.credits_applied
  const currentQualityPoints = currentGpa * currentCredits

  let newQualityPoints = 0
  let newCredits = 0
  for (const c of newCourses) {
    const pts = GRADE_POINTS[c.expectedGrade.toUpperCase()] ?? null
    if (pts == null) continue
    newQualityPoints += c.credits * pts
    newCredits += c.credits
  }

  if (newCredits === 0) return null

  const creditsAfter = currentCredits + newCredits
  const projectedGpa = (currentQualityPoints + newQualityPoints) / creditsAfter

  return {
    currentGpa,
    projectedGpa: Math.round(projectedGpa * 100) / 100,
    creditsAfter,
    explanation: `Current GPA: ${currentGpa.toFixed(2)} over ${currentCredits} credits. Adding ${newCredits} credits with the given grades: projected GPA = ${projectedGpa.toFixed(2)} over ${creditsAfter} credits.`,
  }
}

export function computeNeededSemesterGpa(
  summary: DegreeSummaryRow | null,
  targetGpa: number,
  semesterCredits: number
): number | null {
  if (!summary || summary.overall_gpa == null || summary.credits_applied == null) return null
  const currentQualityPoints = summary.overall_gpa * summary.credits_applied
  const targetQualityPoints = targetGpa * (summary.credits_applied + semesterCredits)
  const neededThisSemester = (targetQualityPoints - currentQualityPoints) / semesterCredits
  return Math.round(neededThisSemester * 100) / 100
}

export interface GraduationTimelineResult {
  creditsRemaining: number
  semestersAtStandardLoad: number
  semestersAtAcceleratedLoad: number
  semestersAtMinimumLoad: number
  standardGradTerm: string
  acceleratedGradTerm: string
  minimumGradTerm: string
}

function addSemesters(startTerm: string, count: number): string {
  const m = startTerm.match(/^(Spring|Summer|Fall)\s+(\d{4})$/)
  if (!m) return "Unknown"
  let season = m[1] as "Spring" | "Summer" | "Fall"
  let year = parseInt(m[2])
  for (let i = 0; i < count; i++) {
    if (season === "Spring") { season = "Fall" }
    else { season = "Spring"; year++ }
  }
  return `${season} ${year}`
}

function currentTerm(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  if (month <= 5) return `Spring ${year}`
  if (month <= 7) return `Summer ${year}`
  return `Fall ${year}`
}

export function computeExpectedGraduation(summary: DegreeSummaryRow | null): GraduationTimelineResult | null {
  if (!summary || summary.credits_remaining == null || summary.credits_remaining <= 0) return null

  const remaining = summary.credits_remaining
  const semStandard = Math.ceil(remaining / 15)
  const semAccelerated = Math.ceil(remaining / 19)
  const semMinimum = Math.ceil(remaining / 12)
  const current = currentTerm()

  return {
    creditsRemaining: remaining,
    semestersAtStandardLoad: semStandard,
    semestersAtAcceleratedLoad: semAccelerated,
    semestersAtMinimumLoad: semMinimum,
    standardGradTerm: addSemesters(current, semStandard),
    acceleratedGradTerm: addSemesters(current, semAccelerated),
    minimumGradTerm: addSemesters(current, semMinimum),
  }
}

export function formatDegreeWorksNeeds(data: FullDegreeSummary): string {
  if (data.blocks.length === 0 && data.unmetRequirements.length === 0) return ""

  const lines: string[] = ["=== What You Still Need to Graduate (DegreeWorks) ==="]

  const incompleteBlocks = data.blocks.filter(
    (b) => b.status !== "complete" && b.credits_required != null
  )
  for (const block of incompleteBlocks) {
    const needed = (block.credits_required ?? 0) - (block.credits_applied ?? 0)
    if (needed > 0) {
      lines.push(`• ${block.block_name}: ${needed} more credits needed (${block.credits_applied ?? 0}/${block.credits_required} complete)`)
    }
  }

  if (data.unmetRequirements.length > 0) {
    lines.push("\nSpecific requirements not yet satisfied:")
    for (const req of data.unmetRequirements) {
      lines.push(`  - [${req.block_name}] ${req.description}`)
    }
  }

  return lines.join("\n")
}
