# AAMU Advisor Full Intelligence — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the AAMU advisor from a course-lookup tool into a full academic intelligence system — DegreeWorks-driven recommendations, GPA simulation, graduation timeline, withdrawal impact, multi-semester roadmaps, grade repeat guidance, SAP awareness, NCAA athlete support, credit load recommendations, and natural casual conversation.

**Architecture:** Three layers of improvement. (A) Data utilization — use DegreeWorks requirement blocks as the PRIMARY source of what a student needs, not just supplementary context. (B) New computation services — GPA projection, academic standing, SAP status, graduation timeline all derived from DegreeWorks data already in the DB. (C) New intent handlers — 6 new question types handled deterministically before hitting the LLM, giving precise answers instead of hallucinated ones.

**Tech Stack:** TypeScript, Next.js App Router, Supabase, OpenAI gpt-4o-mini

---

## Verified AAMU Policy Facts (researched from aamu.edu)

| Policy | Rule |
|---|---|
| Grade repeat | Highest grade counts in GPA; credit awarded once; all attempts remain on transcript |
| SAP GPA threshold | 1.50 for 24–30 attempted hrs; 1.75 for 31–63 hrs; 2.00 for 63+ hrs |
| SAP completion rate | Must earn ≥ 67% of attempted hours each semester (W, F, I all count as attempted) |
| SAP max hours | 192 credit hours maximum for undergraduate degree |
| Academic Warning | GPA < 1.50, < 24 earned hours — 3 semesters to recover, NOT on transcript |
| Academic Probation | GPA 1.50–1.75 with 25–44 hrs; OR GPA < 2.00 with 45+ hrs — 2 semesters, IS on transcript |
| Semester credit cap | 19 credits max; overload requires 3.0+ GPA + Overload Request Form to Academic Affairs |
| Summer cap | 10 credits max (12 with special permission for graduation eligibility) |
| W grade | Does not affect GPA; must drop 2+ weeks before finals |
| Graduation min GPA | 2.00 cumulative |
| GPA scale | A=4, B=3, C=2, D=1, F=0; W/I/P/IP/X do not count |
| NCAA full-time | 12 credits/semester minimum (Div I: 24/year, 18 fall-spring; Div II: 9/term min) |
| Overload | 3.0+ GPA required; Overload Request Form → Office of Academic Affairs |

---

## File Map

| File | What Changes |
|---|---|
| `backend/services/degree-summary/service.ts` | Add `computeAcademicStanding`, `computeSapStatus`, `computeGpaProjection`, `computeExpectedGraduation`, `formatDegreeWorksNeeds` |
| `backend/services/curriculum/service.ts` | Add `buildMultiSemesterRoadmap` |
| `backend/services/chat-orchestrator/service.ts` | 6 new intent handlers; academic standing auto-injection; DegreeWorks-first recommendations; improved chitchat |
| `lib/chat-routing/router.ts` | 5 new intent labels + classifier examples |
| `app/settings/page.tsx` | Add `isAthlete` checkbox + `hoursWorkedPerWeek` field |
| `app/api/user/academic-profile/route.ts` | Accept + persist new fields |
| `backend/tests/smoke_test.py` | Expand to 75 questions covering all new capabilities |

---

## Task 1: Degree Summary — Academic Standing + SAP Computation

**Files:**
- Modify: `backend/services/degree-summary/service.ts`

Add four pure-computation functions that derive academic standing and SAP status from existing DegreeWorks data. These are used as building blocks by later tasks.

- [ ] **Step 1: Add `computeAcademicStanding` to `backend/services/degree-summary/service.ts`**

Add after the `formatDegreeSummaryForLLM` function:

```typescript
export type AcademicStanding = "good" | "warning" | "probation" | "unknown"

export interface AcademicStandingResult {
  standing: AcademicStanding
  gpa: number | null
  creditsApplied: number | null
  semestersToResolve: number | null  // null when standing is "good"
  message: string
  appearsOnTranscript: boolean
}

export function computeAcademicStanding(summary: DegreeSummaryRow | null): AcademicStandingResult {
  if (!summary || summary.overall_gpa == null || summary.credits_applied == null) {
    return { standing: "unknown", gpa: null, creditsApplied: null, semestersToResolve: null, message: "Academic standing unknown — GPA data not available.", appearsOnTranscript: false }
  }

  const gpa = summary.overall_gpa
  const credits = summary.credits_applied

  // Academic Warning: GPA < 1.50 with fewer than 24 earned hours
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

  // Academic Probation — Freshmen/Sophomores: GPA 1.50–1.75 with 25–44 hours
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

  // Academic Probation — All levels: GPA below 2.00 with 45+ hours
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
```

- [ ] **Step 2: Add `computeSapStatus` to `backend/services/degree-summary/service.ts`**

```typescript
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

  // SAP GPA thresholds by credit level (for financial aid eligibility)
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
```

- [ ] **Step 3: Add `computeGpaProjection` to `backend/services/degree-summary/service.ts`**

```typescript
const GRADE_POINTS: Record<string, number> = {
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

// Solve for needed semester GPA to reach a cumulative target
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
```

- [ ] **Step 4: Add `computeExpectedGraduation` to `backend/services/degree-summary/service.ts`**

```typescript
export interface GraduationTimelineResult {
  creditsRemaining: number
  semestersAtStandardLoad: number   // 15 cr/sem
  semestersAtAcceleratedLoad: number // 19 cr/sem
  semestersAtMinimumLoad: number    // 12 cr/sem
  standardGradTerm: string
  acceleratedGradTerm: string
  minimumGradTerm: string
}

function addSemesters(startTerm: string, count: number): string {
  // startTerm format: "Spring 2026" or "Fall 2026"
  const m = startTerm.match(/^(Spring|Summer|Fall)\s+(\d{4})$/)
  if (!m) return "Unknown"
  let season = m[1] as "Spring" | "Summer" | "Fall"
  let year = parseInt(m[2])
  // We only count Spring and Fall (not Summer) as full semesters
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
```

- [ ] **Step 5: Add `formatDegreeWorksNeeds` to `backend/services/degree-summary/service.ts`**

This formats unmet blocks as a targeted course-needs list for the LLM — making DegreeWorks the primary driver of course recommendations.

```typescript
export function formatDegreeWorksNeeds(data: FullDegreeSummary): string {
  if (data.blocks.length === 0 && data.unmetRequirements.length === 0) return ""

  const lines: string[] = ["=== What You Still Need to Graduate (DegreeWorks) ==="]

  // Blocks with remaining credits
  const incompleteBlocks = data.blocks.filter(
    (b) => b.status !== "complete" && b.credits_required != null
  )
  for (const block of incompleteBlocks) {
    const needed = (block.credits_required ?? 0) - (block.credits_applied ?? 0)
    if (needed > 0) {
      lines.push(`• ${block.block_name}: ${needed} more credits needed (${block.credits_applied ?? 0}/${block.credits_required} complete)`)
    }
  }

  // Specific unmet requirements
  if (data.unmetRequirements.length > 0) {
    lines.push("\nSpecific requirements not yet satisfied:")
    for (const req of data.unmetRequirements) {
      lines.push(`  - [${req.block_name}] ${req.description}`)
    }
  }

  return lines.join("\n")
}
```

- [ ] **Step 6: Verify the functions compile**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add backend/services/degree-summary/service.ts
git commit -m "feat: add academic standing, SAP, GPA projection, graduation timeline, DegreeWorks needs formatter"
```

---

## Task 2: Router — 5 New Intent Labels

**Files:**
- Modify: `lib/chat-routing/router.ts`

Add intents for GPA simulation, multi-semester planning, grade repeat, withdrawal impact, and credit load recommendation.

- [ ] **Step 1: Add new intent labels to the `IntentLabel` type**

Find the `type IntentLabel = ...` block (line ~6) and add:

```typescript
type IntentLabel =
  | "COMPLETED_COURSES"
  | "NEXT_COURSES"
  | "GRADUATION_GAP"
  | "PREREQUISITES"
  | "ELECTIVES"
  | "CONCENTRATION"
  | "SIMULATE"
  | "SAVE_PLAN"
  | "BULLETIN_POLICY"
  | "ADVISOR_ESCALATE"
  | "GENERAL_CURRICULUM"
  | "FREE_ELECTIVE"
  | "CHITCHAT"
  | "GPA_SIMULATION"      // NEW: "if I get an A in BIO 201, what will my GPA be?"
  | "MULTI_SEMESTER_PLAN" // NEW: "map out my next 4 semesters" / "fastest path to graduation"
  | "GRADE_REPEAT"        // NEW: "can I retake BIO 201?" / "grade replacement policy"
  | "WITHDRAWAL_IMPACT"   // NEW: "what happens if I drop CS 301?"
  | "CREDIT_LOAD"         // NEW: "how many credits should I take?"
```

- [ ] **Step 2: Add new intents to `INTENT_TO_ROUTE`**

```typescript
const INTENT_TO_ROUTE: Record<IntentLabel, ChatRoute> = {
  // ... existing entries ...
  GPA_SIMULATION:      "DB_ONLY",
  MULTI_SEMESTER_PLAN: "DB_ONLY",
  GRADE_REPEAT:        "DB_ONLY",
  WITHDRAWAL_IMPACT:   "DB_ONLY",
  CREDIT_LOAD:         "DB_ONLY",
}
```

- [ ] **Step 3: Add new intents to `VALID_INTENTS`**

```typescript
const VALID_INTENTS = new Set<string>([
  "COMPLETED_COURSES", "NEXT_COURSES", "GRADUATION_GAP", "PREREQUISITES",
  "ELECTIVES", "FREE_ELECTIVE", "CONCENTRATION", "SIMULATE", "SAVE_PLAN",
  "BULLETIN_POLICY", "ADVISOR_ESCALATE", "GENERAL_CURRICULUM", "CHITCHAT",
  "GPA_SIMULATION", "MULTI_SEMESTER_PLAN", "GRADE_REPEAT", "WITHDRAWAL_IMPACT", "CREDIT_LOAD",
])
```

- [ ] **Step 4: Update `fastPrescreen` with patterns for new intents**

Add these blocks in `fastPrescreen` BEFORE the BULLETIN_POLICY check:

```typescript
// GPA simulation — "if I get an A, what's my GPA?" / "what GPA do I need to reach 3.0?"
if (/\b(if\s+i\s+get\s+(an?\s+)?[abcdf]|what\s+(gpa|grade)\s+(will\s+i\s+have|would\s+i\s+have|would\s+my\s+gpa\s+be)|what\s+gpa\s+do\s+i\s+need\s+to\s+(reach|get\s+to|bring|raise)|raise\s+my\s+gpa|boost\s+my\s+gpa|gpa\s+(simulation|calculator|projection))\b/i.test(q))
  return "GPA_SIMULATION"

// Grade repeat / retake
if (/\b(retake|re-take|repeat\s+a?\s+course|repeat\s+[a-z]+\s+\d|can\s+i\s+take\s+.+\s+again|grade\s+(replacement|forgiveness|repeat)|replace\s+(my|a)\s+grade|took\s+.+\s+twice|failed\s+and\s+(want|need)\s+to\s+retake)\b/i.test(q))
  return "GRADE_REPEAT"

// Withdrawal / drop impact
if (/\b(what\s+(happens?\s+if|if)\s+i\s+(drop|withdraw|w\s+grade|get\s+a\s+w)|should\s+i\s+(drop|withdraw\s+from)|impact\s+of\s+(dropping|withdrawing)|withdraw\s+from|drop\s+(a\s+class|a\s+course|cs\s*\d|bio\s*\d|[a-z]+\s*\d{3}))\b/i.test(q))
  return "WITHDRAWAL_IMPACT"

// Multi-semester plan / roadmap
if (/\b(map\s+out|plan\s+(my\s+)?(next|remaining|future)\s+(semesters?|years?|courses?)|semester\s+(plan|roadmap|map)|multi[\s-]semester|course\s+roadmap|plan\s+to\s+graduate|fastest\s+(path|way|route)\s+(to\s+)?graduat|what's?\s+my\s+(graduation\s+)?plan|how\s+(do\s+i|can\s+i)\s+graduate\s+(by|in|on\s+time)|graduation\s+plan|graduation\s+roadmap)\b/i.test(q))
  return "MULTI_SEMESTER_PLAN"

// Credit load recommendation
if (/\b(how\s+many\s+credits?\s+(should\s+i\s+take|is\s+(too\s+)?much|can\s+i\s+handle)|recommended\s+(credit\s+)?load|credit\s+load|course\s+load|too\s+many\s+credits|overload|how\s+heavy\s+(should|is)\s+my\s+(schedule|load)|full[\s-]time\s+student\s+credits?)\b/i.test(q))
  return "CREDIT_LOAD"
```

- [ ] **Step 5: Update `CLASSIFIER_SYSTEM_PROMPT` — add new intent descriptions**

Find the intent descriptions block and add after CHITCHAT:

```typescript
GPA_SIMULATION — student asks what their GPA would be if they get certain grades, or what GPA they need to reach a target, or wants to project/calculate their GPA
MULTI_SEMESTER_PLAN — student asks to map out future semesters, create a graduation roadmap, find the fastest path to graduation, or plan multiple semesters ahead
GRADE_REPEAT — student asks if they can retake a course, about grade replacement/forgiveness policy, repeating a failed course, or taking a course they've already taken again
WITHDRAWAL_IMPACT — student asks what happens if they drop or withdraw from a course, should they withdraw, or the impact of a W grade on their record
CREDIT_LOAD — student asks how many credits they should take, whether their load is too heavy, or for a course load recommendation
```

- [ ] **Step 6: Add classifier examples for new intents**

After the existing examples, add:

```typescript
"if I get an A in BIO 201 what will my GPA be" → GPA_SIMULATION
"what GPA do I need this semester to get to a 3.0" → GPA_SIMULATION
"can I raise my GPA to 3.5 by next year" → GPA_SIMULATION
"can I retake BIO 201" → GRADE_REPEAT
"I got a D in CS 201 can I replace my grade" → GRADE_REPEAT
"grade forgiveness policy at AAMU" → GRADE_REPEAT
"what happens if I drop CS 301" → WITHDRAWAL_IMPACT
"should I withdraw from BIO 201" → WITHDRAWAL_IMPACT
"what does a W grade do to my GPA" → WITHDRAWAL_IMPACT
"map out my next 4 semesters" → MULTI_SEMESTER_PLAN
"what's the fastest path to graduation" → MULTI_SEMESTER_PLAN
"plan my courses to graduate by Spring 2028" → MULTI_SEMESTER_PLAN
"how many credits should I take" → CREDIT_LOAD
"is 18 credits too many" → CREDIT_LOAD
"what's a good course load for me" → CREDIT_LOAD
```

- [ ] **Step 7: Verify**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add lib/chat-routing/router.ts
git commit -m "feat: add 5 new router intents — GPA_SIMULATION, MULTI_SEMESTER_PLAN, GRADE_REPEAT, WITHDRAWAL_IMPACT, CREDIT_LOAD"
```

---

## Task 3: Orchestrator — Import New Functions + Auto-Inject Standing

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts`

Import the new degree-summary functions and inject academic standing + SAP warnings into every response that has DegreeWorks data.

- [ ] **Step 1: Add imports in `backend/services/chat-orchestrator/service.ts`**

Find the degree-summary import block (line ~42) and extend it:

```typescript
import {
  fetchFullDegreeSummary,
  formatDegreeSummaryForLLM,
  computeAcademicStanding,
  computeSapStatus,
  computeGpaProjection,
  computeNeededSemesterGpa,
  computeExpectedGraduation,
  formatDegreeWorksNeeds,
  GRADE_POINTS,
} from "@/backend/services/degree-summary/service"
```

Note: `GRADE_POINTS` must also be exported from degree-summary/service.ts — add `export` to its declaration in Task 1.

- [ ] **Step 2: Add `buildAcademicStatusBlock` helper in `backend/services/chat-orchestrator/service.ts`**

Add near the other builder functions (around line 245):

```typescript
function buildAcademicStatusBlock(
  degreeSummaryData: import("@/backend/services/degree-summary/service").FullDegreeSummary | null
): string {
  if (!degreeSummaryData?.summary) return ""
  const standing = computeAcademicStanding(degreeSummaryData.summary)
  const sap = computeSapStatus(degreeSummaryData.summary)

  const lines: string[] = []
  if (standing.standing === "warning" || standing.standing === "probation") {
    lines.push(standing.message)
  }
  if (sap.gpaThreatMessage) {
    lines.push(sap.gpaThreatMessage)
  }
  return lines.length > 0 ? `\n${lines.join("\n")}\n` : ""
}
```

- [ ] **Step 3: Inject `academicStatusBlock` into the degreeSummaryBlock string**

Find where `degreeSummaryBlock` is used in `handleDbOnly` (search for `formatDegreeSummaryForLLM`). Change the block construction to:

```typescript
const degreeSummaryBlock = degreeSummaryData
  ? formatDegreeSummaryForLLM(degreeSummaryData) + buildAcademicStatusBlock(degreeSummaryData)
  : ""
```

- [ ] **Step 4: Also inject DegreeWorks needs block into NEXT_COURSES and GRADUATION_GAP context**

In the NEXT_COURSES handler, find the line that builds `planningContext`:

```typescript
const planningContext = buildNextCoursesContext(filteredRecommendation, classification, termSplit, ...)
```

After it, add:

```typescript
const degreeWorksNeedsBlock = degreeSummaryData
  ? "\n\n" + formatDegreeWorksNeeds(degreeSummaryData)
  : ""
```

Then include it in the `generateDbResponse` call:

```typescript
const answer = await generateDbResponse(
  question,
  `${studentContextBlock}${degreeSummaryBlock ? degreeSummaryBlock + "\n\n" : ""}${planningContext}${degreeWorksNeedsBlock}${suggestedScheduleBlock}${scheduleNote}${enrollmentGuard}`,
  history
)
```

- [ ] **Step 5: Inject graduation timeline into GRADUATION_GAP response**

Find the graduation gap context builder in `handleDbOnly` (where `gapContext` is formatted). After `const gapContext = formatGraduationGapForLLM(gap)`, add:

```typescript
const gradTimeline = computeExpectedGraduation(degreeSummaryData?.summary ?? null)
const gradTimelineBlock = gradTimeline
  ? `\n\nExpected Graduation Timeline:\n- At 15 credits/semester (standard): ${gradTimeline.standardGradTerm}\n- At 19 credits/semester (accelerated, requires 3.0 GPA): ${gradTimeline.acceleratedGradTerm}\n- At 12 credits/semester (minimum): ${gradTimeline.minimumGradTerm}\n- Credits remaining: ${gradTimeline.creditsRemaining}`
  : ""
```

Include in the LLM call for graduation gap (find `generateDbResponse` in that block):

```typescript
const answer = await generateDbResponse(
  question,
  `${studentContextBlock}${degreeSummaryBlock ? degreeSummaryBlock + "\n\n" : ""}${gapContext}${gradTimelineBlock}`,
  history
)
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 7: Test in browser**

Start: `npm run dev`
Ask: "what do I need to graduate?"
Expected: Response now includes expected graduation dates (e.g., "At 15 credits/semester, you'll finish Fall 2027").

If the test student has GPA < 2.0, the response should also include the academic standing warning.

- [ ] **Step 8: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts backend/services/degree-summary/service.ts
git commit -m "feat: inject academic standing, SAP warnings, DegreeWorks needs, and graduation timeline into advisor responses"
```

---

## Task 4: GPA Simulation Handler

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts`

Handle "If I get a B in BIO 201 (3 cr), what will my GPA be?" and "What GPA do I need this semester to reach 3.0?"

- [ ] **Step 1: Add `asksGpaSimulation` detector near other helpers**

```typescript
function asksGpaSimulation(question: string): boolean {
  return /\b(if\s+i\s+get\s+(an?\s+)?[abcdf]|what\s+(gpa|grade)\s+(will|would)\s+i\s+(have|get|end\s+up\s+with)|what\s+gpa\s+do\s+i\s+need\s+to\s+(reach|get\s+to|bring|raise|hit)|raise\s+my\s+gpa|boost\s+my\s+gpa|gpa\s+(simulation|calculator|projection)|project(ed)?\s+gpa)\b/i.test(question)
}
```

- [ ] **Step 2: Add GPA_SIMULATION detection in the intent flag block**

Find the `const isGraduationGapQuery = ...` line and add:

```typescript
const isGpaSimulationQuery = intent === "GPA_SIMULATION" || asksGpaSimulation(question)
```

- [ ] **Step 3: Add the GPA_SIMULATION handler in `handleDbOnly`**

Add BEFORE the `isGraduationGapQuery` block:

```typescript
if (isGpaSimulationQuery) {
  if (!degreeSummaryData?.summary) {
    return { mode: "DB_ONLY", answer: `To project your GPA, I need your DegreeWorks data on file.\n\n${SETUP_NEEDED_MESSAGE}`, data: null }
  }

  const summary = degreeSummaryData.summary
  const currentGpa = summary.overall_gpa
  const currentCredits = summary.credits_applied

  // Try to extract course/grade info from question
  // Patterns: "if I get an A in BIO 201 (3 cr)" / "A in a 3 credit class"
  const gradeMatch = question.match(/\b(a\+?|a-|b\+?|b-|c\+?|c-|d\+?|d-|f)\b/i)
  const creditMatch = question.match(/\b(\d+)\s*cr(?:edit\s*hours?|s?)?\b/i)
  const targetGpaMatch = question.match(/\b(?:to\s+(?:reach|get\s+to|bring|raise|hit)|target(?:ing)?)\s+(?:a\s+)?(\d+\.?\d*)\s*(?:gpa)?\b/i)
    ?? question.match(/\b(\d+\.?\d*)\s*gpa\b/i)

  let gpaContext = `GPA Simulation Data:\n`
  gpaContext += `Current Cumulative GPA: ${currentGpa?.toFixed(2) ?? "unknown"}\n`
  gpaContext += `Credits Applied: ${currentCredits ?? "unknown"}\n\n`
  gpaContext += `GPA Formula: (current_quality_points + new_quality_points) / total_credits\n`
  gpaContext += `Grade Points: A/A+=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, C-=1.7, D+=1.3, D=1.0, D-=0.7, F=0.0\n\n`

  if (gradeMatch && creditMatch && currentGpa != null && currentCredits != null) {
    const grade = gradeMatch[1].toUpperCase()
    const newCredits = parseInt(creditMatch[1])
    const projection = computeGpaProjection(summary, [{ credits: newCredits, expectedGrade: grade }])
    if (projection) {
      gpaContext += `Projection: If you earn a ${grade} in a ${newCredits}-credit course:\n`
      gpaContext += `  New GPA = (${currentGpa.toFixed(2)} × ${currentCredits} + ${GRADE_POINTS[grade] ?? "?"} × ${newCredits}) / ${currentCredits + newCredits} = ${projection.projectedGpa.toFixed(2)}\n`
    }
  }

  if (targetGpaMatch && currentGpa != null && currentCredits != null) {
    const targetGpa = parseFloat(targetGpaMatch[1])
    const semCredits = creditMatch ? parseInt(creditMatch[1]) : 15
    const needed = computeNeededSemesterGpa(summary, targetGpa, semCredits)
    if (needed != null) {
      gpaContext += `To reach a ${targetGpa.toFixed(2)} GPA after ${semCredits} credits:\n`
      gpaContext += `  You need a semester GPA of ${needed.toFixed(2)} this term.\n`
      if (needed > 4.0) gpaContext += `  Note: A ${needed.toFixed(2)} is mathematically impossible (max 4.0) — the target cannot be reached in one semester.\n`
    }
  }

  gpaContext += `\nInstruction: Use the data above to answer the student's GPA projection question clearly. Show the math. State the projected GPA. If target is impossible, say so kindly and suggest a realistic timeline.`

  return {
    mode: "DB_ONLY",
    answer: await generateDbResponse(question, `${studentContextBlock}${gpaContext}`, history),
    data: null,
  }
}
```

- [ ] **Step 4: Verify**

Start dev server. Ask: "If I get an A in a 3-credit class, what will my GPA be?"
Expected: Shows current GPA, projects new GPA with the math visible.

Ask: "What GPA do I need this semester to reach a 3.0 cumulative?"
Expected: Shows the needed semester GPA and notes if it's impossible.

- [ ] **Step 5: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "feat: GPA simulation handler — projects GPA from grade inputs and solves for needed semester GPA"
```

---

## Task 5: Grade Repeat / Retake Handler

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts`

Handle "Can I retake BIO 201?" with AAMU-verified policy.

- [ ] **Step 1: Add `asksGradeRepeat` detector**

```typescript
function asksGradeRepeat(question: string): boolean {
  return /\b(retake|re-?take|repeat\s+(a\s+)?(course|class)|can\s+i\s+take\s+.{1,30}\s+again|grade\s+(replacement|forgiveness|repeat)|replace\s+(my\s+)?grade|took\s+.{1,20}\s+(twice|again|before)|failed\s+.{0,20}(retake|repeat|again)|academic\s+bankruptcy)\b/i.test(question)
}
```

- [ ] **Step 2: Add intent detection flag**

```typescript
const isGradeRepeatQuery = intent === "GRADE_REPEAT" || asksGradeRepeat(question)
```

- [ ] **Step 3: Add GRADE_REPEAT handler before `isGraduationGapQuery` block**

```typescript
if (isGradeRepeatQuery) {
  const courseCode = extractCourseCodeFromQuestion(question)
  const courseContext = courseCode ? `\nCourse mentioned by student: ${courseCode}` : ""

  const policy = `AAMU Course Repeat / Grade Replacement Policy (verified from aamu.edu):

1. GRADE REPLACEMENT: Students may repeat courses to improve their GPA. Only the HIGHEST grade earned counts toward the GPA calculation. All attempts remain on the official transcript.
2. CREDIT AWARDED ONCE: Credit for a course is awarded only once, regardless of how many times it is repeated.
3. FINANCIAL AID (SAP) IMPACT: Repeated courses count toward total hours ATTEMPTED for SAP purposes. Repeating too many courses can push a student over the 192-hour maximum or below the 67% completion rate threshold.
4. FAILED COURSES: "Credit for any course in which a student received a grade of 'F' can be obtained only by repeating the course and earning a passing grade." There is no other way to clear an F.
5. ACADEMIC BANKRUPTCY: AAMU has an Academic Bankruptcy provision — consult the Registrar's Office for specific eligibility criteria (typically used after a poor academic period to restart GPA calculation).
6. WHEN TO RETAKE: Retaking is most beneficial when the grade difference is significant (D→A saves 3 quality points per credit) and the course is a prerequisite for higher-level courses.${courseContext}

Instruction: Answer the student's question about retaking/repeating a course using the policy above. If they mention a specific course (${courseCode ?? "none mentioned"}), confirm they can retake it and explain the GPA impact. Be encouraging but honest about the SAP implications.`

  return {
    mode: "DB_ONLY",
    answer: await generateDbResponse(question, `${studentContextBlock}${policy}`, history),
    data: null,
  }
}
```

- [ ] **Step 4: Verify**

Start dev server.
Ask: "Can I retake BIO 201?"
Expected: Explains AAMU's grade replacement policy — highest grade counts, credit once, all attempts on transcript, SAP impact.

Ask: "I got a D in CS 201, should I retake it?"
Expected: Confirms they can retake it, explains that highest grade will count, and notes the SAP implication.

- [ ] **Step 5: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "feat: grade repeat handler with verified AAMU policy — highest grade counts, credit once, SAP impact explained"
```

---

## Task 6: Withdrawal/Drop Impact Handler

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts`

Calculate real impact of dropping a course against F-1, scholarship, SAP, and financial aid thresholds.

- [ ] **Step 1: Add `asksWithdrawalImpact` detector**

```typescript
function asksWithdrawalImpact(question: string): boolean {
  return /\b(what\s+happens?\s+if\s+i\s+(drop|withdraw)|should\s+i\s+(drop|withdraw)|impact\s+of\s+(dropping|withdrawing|a\s+w\s+grade)|w\s+grade\s+(impact|affect|do\s+to)|if\s+i\s+withdraw|if\s+i\s+drop\s+(a\s+|this\s+|[a-z]+\s+\d)|drop\s+deadline|late\s+withdrawal|what\s+does\s+a\s+w\s+do)\b/i.test(question)
}
```

- [ ] **Step 2: Add intent flag**

```typescript
const isWithdrawalImpactQuery = intent === "WITHDRAWAL_IMPACT" || asksWithdrawalImpact(question)
```

- [ ] **Step 3: Add WITHDRAWAL_IMPACT handler before `isGraduationGapQuery` block**

```typescript
if (isWithdrawalImpactQuery) {
  const courseCode = extractCourseCodeFromQuestion(question)
  const creditMatch = question.match(/\b(\d)\s*cr(?:edit)?\b/i)
  const droppingCredits = creditMatch ? parseInt(creditMatch[1]) : null

  const upcomingCredits = termSplit?.upcomingRegistered?.reduce((s, c) => s + c.creditHours, 0) ?? null
  const currentCredits = termSplit?.currentEnrolled?.reduce((s, c) => s + c.creditHours, 0) ?? null
  const creditsAfterDrop = (upcomingCredits != null && droppingCredits != null)
    ? upcomingCredits - droppingCredits
    : null

  const isInternational = payload.session?.isInternational ?? false
  const scholarshipType = payload.session?.scholarshipType ?? null
  const scholarshipRule = scholarshipType ? AAMU_SCHOLARSHIP_RULES[scholarshipType] ?? null : null
  const isAthlete = (payload.session as any)?.isAthlete ?? false

  let withdrawalContext = `Withdrawal Impact Analysis:\n`
  withdrawalContext += `W Grade Policy: A Withdrawal ("W") does NOT affect GPA. However:\n`
  withdrawalContext += `  - W grades COUNT as hours ATTEMPTED for SAP (financial aid eligibility)\n`
  withdrawalContext += `  - Too many W grades can drop your completion rate below the 67% SAP minimum\n`
  withdrawalContext += `  - W grade deadline: must drop at least 2 weeks before final examinations\n\n`

  if (courseCode) withdrawalContext += `Course in question: ${courseCode}\n`
  if (droppingCredits) withdrawalContext += `Credits that would be dropped: ${droppingCredits}\n`
  if (upcomingCredits != null) withdrawalContext += `Your current registered credits (upcoming term): ${upcomingCredits}\n`
  if (creditsAfterDrop != null) withdrawalContext += `Credits after dropping: ${creditsAfterDrop}\n\n`

  withdrawalContext += `Thresholds to check:\n`
  withdrawalContext += `  - Full-time status (financial aid): 12 credits minimum${creditsAfterDrop != null ? ` → After drop: ${creditsAfterDrop} (${creditsAfterDrop < 12 ? "⚠️ BELOW full-time — financial aid at risk" : "✓ still full-time"})` : ""}\n`

  if (isInternational) {
    withdrawalContext += `  - F-1 Visa minimum: 12 credits (9 in-person)${creditsAfterDrop != null ? ` → After drop: ${creditsAfterDrop} (${creditsAfterDrop < 12 ? "🚨 BELOW F-1 minimum — STATUS VIOLATION RISK — contact DSO immediately" : "✓ still compliant"})` : ""}\n`
  }

  if (scholarshipRule) {
    const semMin = Math.ceil(scholarshipRule.minCreditsPerYear / 2)
    withdrawalContext += `  - ${scholarshipType} requires ${semMin} credits/semester (${scholarshipRule.minCreditsPerYear}/year)${creditsAfterDrop != null ? ` → After drop: ${creditsAfterDrop} (${creditsAfterDrop < semMin ? `⚠️ BELOW scholarship minimum — scholarship at risk` : "✓ still meets requirement"})` : ""}\n`
  }

  if (isAthlete) {
    withdrawalContext += `  - NCAA eligibility (Division I): 12 credits minimum${creditsAfterDrop != null ? ` → After drop: ${creditsAfterDrop} (${creditsAfterDrop < 12 ? "🚨 BELOW NCAA minimum — athletic eligibility at risk" : "✓ still eligible"})` : ""}\n`
  }

  withdrawalContext += `\n  - SAP 67% completion rate: W grades count as attempted but not earned. Excessive withdrawals reduce your completion rate.\n`
  withdrawalContext += `\nInstruction: Analyze whether it's safe for this student to drop the course. Flag any threshold violations with clear warnings. Be direct about risks. Always note that the W grade deadline requires dropping 2+ weeks before finals.`

  return {
    mode: "DB_ONLY",
    answer: await generateDbResponse(question, `${studentContextBlock}${withdrawalContext}`, history),
    data: null,
  }
}
```

- [ ] **Step 4: Verify**

Start dev server (set isInternational=true, scholarshipType="AAMU Presidential Scholarship" in session).
Ask: "What happens if I drop BIO 201 (3 cr)?"
Expected: Shows current credits, credits after drop, checks all thresholds (F-1, scholarship, financial aid), flags any violations.

- [ ] **Step 5: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "feat: withdrawal impact handler — checks F-1, scholarship, NCAA, financial aid, and SAP thresholds before recommending a drop"
```

---

## Task 7: Multi-Semester Roadmap Handler

**Files:**
- Modify: `backend/services/curriculum/service.ts` (add `buildMultiSemesterRoadmap`)
- Modify: `backend/services/chat-orchestrator/service.ts` (add MULTI_SEMESTER_PLAN handler)

- [ ] **Step 1: Add `buildMultiSemesterRoadmap` to `backend/services/curriculum/service.ts`**

Add after `formatFreeElectivesForLLM`:

```typescript
export interface RoadmapSemester {
  label: string  // e.g. "Fall 2026"
  courses: Array<{ courseId: string; title: string; creditHours: number; tag: string }>
  totalCredits: number
}

export async function buildMultiSemesterRoadmap(params: {
  programCode: string
  bulletinYear?: string | null
  userId: string
  creditsRemaining: number
  creditsPerSemester?: number
}): Promise<RoadmapSemester[]> {
  const { programCode, bulletinYear, userId, creditsRemaining, creditsPerSemester = 15 } = params
  const catalogYear = parseCatalogYear(bulletinYear)

  const [program, userCourses, geData] = await Promise.all([
    getProgram(programCode, catalogYear),
    getUserCourseStatuses(userId).catch(() => []),
    fetchFreeElectiveOptions({ studentId: userId }).catch(() => null),
  ])
  if (!program) return []

  // Build taken set
  const takenCodes = new Set(
    userCourses
      .filter((c) => c.status === "completed" || c.status === "in_progress")
      .flatMap((c) => [c.code.trim().toUpperCase(), normalizeHonorsCourseCode(c.code.trim().toUpperCase())])
  )

  // Get all curriculum slots ordered by semester
  const slots = await getCurriculumSlots(program.id)
  const allRequired = slots
    .filter((s) => !s.is_elective_slot)
    .sort((a, b) => a.semester_number - b.semester_number || a.slot_order - b.slot_order)
    .flatMap((s) => {
      const courses = Array.isArray(s.courses) ? s.courses : s.courses ? [s.courses] : []
      return courses
        .filter((c: any) => !takenCodes.has(c.course_id.trim().toUpperCase()))
        .map((c: any) => ({
          courseId: c.course_id as string,
          title: c.title as string,
          creditHours: (s.credit_hours ?? c.credit_hours ?? 3) as number,
          tag: SEMESTER_LABELS[s.semester_number] ?? `Semester ${s.semester_number}`,
        }))
    })

  const availableGe = geData?.availableCourses ?? []

  // Build semester-by-semester plan
  const roadmap: RoadmapSemester[] = []
  let remainingRequired = [...allRequired]
  let remainingGe = [...availableGe]
  let creditsLeft = creditsRemaining

  // Determine starting semester
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  let currentSeason = month <= 5 ? "Fall" : "Spring"  // next semester from now
  let currentYear = month <= 5 ? year : year + 1

  const MAX_SEMESTERS = 10

  for (let i = 0; i < MAX_SEMESTERS && creditsLeft > 0; i++) {
    const semLabel = `${currentSeason} ${currentYear}`
    const selected: RoadmapSemester["courses"] = []
    let semCredits = 0
    const cap = Math.min(creditsPerSemester, 19)

    // Required courses first
    const stillNeeded: typeof remainingRequired = []
    for (const c of remainingRequired) {
      if (semCredits + c.creditHours <= cap && semCredits < cap) {
        selected.push(c)
        semCredits += c.creditHours
      } else {
        stillNeeded.push(c)
      }
    }
    remainingRequired = stillNeeded

    // Fill with GE if under cap
    const stillNeededGe: typeof remainingGe = []
    for (const ge of remainingGe) {
      if (semCredits >= cap) { stillNeededGe.push(ge); continue }
      if (semCredits + ge.credit_hours <= cap) {
        selected.push({ courseId: ge.course_code, title: ge.course_title, creditHours: ge.credit_hours, tag: `GE – ${ge.area_name}` })
        semCredits += ge.credit_hours
      } else {
        stillNeededGe.push(ge)
      }
    }
    remainingGe = stillNeededGe

    if (selected.length > 0) {
      roadmap.push({ label: semLabel, courses: selected, totalCredits: semCredits })
      creditsLeft -= semCredits
    }

    // Advance to next semester (Fall → Spring → Fall)
    if (currentSeason === "Fall") { currentSeason = "Spring" }
    else { currentSeason = "Fall"; currentYear++ }
  }

  return roadmap
}
```

- [ ] **Step 2: Add `asksMultiSemesterPlan` detector in orchestrator**

```typescript
function asksMultiSemesterPlan(question: string): boolean {
  return /\b(map\s+out|plan\s+(my\s+)?(next|remaining|future)\s+(semesters?|years?)|semester\s+(plan|roadmap)|multi[\s-]semester|fastest\s+(path|way|route)\s+(to\s+)?graduat|plan\s+to\s+graduate|graduation\s+(plan|roadmap)|course\s+roadmap|how\s+(do\s+i|can\s+i)\s+graduate\s+(by|in|on\s+time))\b/i.test(question)
}
```

- [ ] **Step 3: Add import in orchestrator**

```typescript
import {
  // ... existing imports ...
  buildMultiSemesterRoadmap,
} from "@/backend/services/curriculum/service"
```

- [ ] **Step 4: Add MULTI_SEMESTER_PLAN handler in `handleDbOnly`**

Add BEFORE the `isNextCoursesQuery` block:

```typescript
const isMultiSemesterPlanQuery = intent === "MULTI_SEMESTER_PLAN" || asksMultiSemesterPlan(question)

if (isMultiSemesterPlanQuery) {
  if (!payload.studentId || !programCode) {
    return { mode: "DB_ONLY", answer: SETUP_NEEDED_MESSAGE, data: null }
  }

  const creditsRemaining = degreeSummaryData?.summary?.credits_remaining ?? null
  if (creditsRemaining == null || creditsRemaining <= 0) {
    return {
      mode: "DB_ONLY",
      answer: `You appear to have completed all required credits — congratulations! If this seems wrong, your DegreeWorks data may need a refresh. Contact the Registrar's Office.`,
      data: null,
    }
  }

  // Detect load preference from question
  const loadMatch = question.match(/\b(19|18|15|12)\s*credits?\b/i)
  const creditsPerSemester = loadMatch ? parseInt(loadMatch[1]) : 15
  const isFastestPath = /fastest|accelerat|quick(est)?|as\s+fast\s+as\s+possible/i.test(question)
  const effectiveLoad = isFastestPath ? 19 : creditsPerSemester

  const roadmap = await buildMultiSemesterRoadmap({
    programCode,
    bulletinYear: fallbackBulletinYear,
    userId: payload.studentId,
    creditsRemaining,
    creditsPerSemester: effectiveLoad,
  })

  const gradTimeline = computeExpectedGraduation(degreeSummaryData?.summary ?? null)

  let roadmapText = `Multi-Semester Graduation Roadmap (${effectiveLoad} credits/semester):\n`
  roadmapText += `Credits Remaining: ${creditsRemaining}\n`
  if (gradTimeline) {
    roadmapText += `Projected Graduation: ${isFastestPath ? gradTimeline.acceleratedGradTerm : gradTimeline.standardGradTerm}\n`
  }
  roadmapText += "\n"

  for (const sem of roadmap) {
    roadmapText += `${sem.label} (${sem.totalCredits} credits):\n`
    for (const c of sem.courses) {
      roadmapText += `  - ${c.courseId}: ${c.title} (${c.creditHours} cr) [${c.tag}]\n`
    }
    roadmapText += "\n"
  }

  if (effectiveLoad === 19) {
    roadmapText += `⚠️ Note: 19 credits/semester requires a 3.0+ GPA and an Overload Request Form approved by the Office of Academic Affairs.\n`
  }

  roadmapText += `\nInstruction: Present this roadmap clearly semester by semester. Tell the student their projected graduation term. Note that course availability is subject to semester scheduling — verify with the AAMU Registrar. If they asked for the fastest path, confirm the 3.0 GPA overload requirement.`

  return {
    mode: "DB_ONLY",
    answer: await generateDbResponse(question, `${studentContextBlock}${roadmapText}`, history),
    data: { roadmap, creditsRemaining },
  }
}
```

- [ ] **Step 5: Verify**

Start dev server.
Ask: "Map out my next 4 semesters"
Expected: Shows semester-by-semester course list with graduation term estimate.

Ask: "What's the fastest path to graduation?"
Expected: Shows 19-credit semesters, flags the 3.0 GPA overload requirement.

- [ ] **Step 6: Commit**

```bash
git add backend/services/curriculum/service.ts backend/services/chat-orchestrator/service.ts
git commit -m "feat: multi-semester roadmap generator — semester-by-semester graduation plan with required courses + GE fill"
```

---

## Task 8: Credit Load Recommendation Handler

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts`

- [ ] **Step 1: Add `asksCreditLoad` detector**

```typescript
function asksCreditLoad(question: string): boolean {
  return /\b(how\s+many\s+credits?\s+(should\s+i\s+take|is\s+(too\s+)?much|can\s+i\s+handle)|recommended?\s+(credit\s+)?load|credit\s+load|course\s+load|too\s+many\s+credits?|overload|how\s+heavy|full[\s-]time\s+student\s+credits?|how\s+much\s+should\s+i\s+(take|enroll))\b/i.test(question)
}
```

- [ ] **Step 2: Add intent flag**

```typescript
const isCreditLoadQuery = intent === "CREDIT_LOAD" || asksCreditLoad(question)
```

- [ ] **Step 3: Add CREDIT_LOAD handler before `isNextCoursesQuery` block**

```typescript
if (isCreditLoadQuery) {
  const gpa = degreeSummaryData?.summary?.overall_gpa ?? null
  const standing = degreeSummaryData?.summary ? computeAcademicStanding(degreeSummaryData.summary) : null
  const isInternational = payload.session?.isInternational ?? false
  const scholarshipType = payload.session?.scholarshipType ?? null
  const scholarshipRule = scholarshipType ? AAMU_SCHOLARSHIP_RULES[scholarshipType] ?? null : null
  const isAthlete = (payload.session as any)?.isAthlete ?? false

  let recommendation = 15
  const reasons: string[] = []
  const warnings: string[] = []

  // Base recommendation: standard 15
  reasons.push("Standard full-time load at AAMU is 15 credits (5 courses of 3 credits).")

  // Adjust down for academic standing
  if (standing?.standing === "probation") {
    recommendation = 12
    reasons.push(`You are on Academic Probation (GPA ${gpa?.toFixed(2)}). 12 credits lets you focus on performance without overextending.`)
    warnings.push("⚠️ Academic Probation: prioritize GPA recovery over credit count.")
  } else if (standing?.standing === "warning") {
    recommendation = 13
    reasons.push(`You are on Academic Warning (GPA ${gpa?.toFixed(2)}). A lighter load helps you recover.`)
  } else if (gpa != null && gpa >= 3.5) {
    recommendation = 17
    reasons.push(`Your GPA of ${gpa.toFixed(2)} qualifies you to take up to 19 credits with an Overload Request Form.`)
  }

  // International minimum
  if (isInternational) {
    if (recommendation < 12) {
      recommendation = 12
      warnings.push("🌍 F-1 Visa: You MUST take at least 12 credits per semester (minimum 9 in-person). Dropping below 12 is a status violation.")
    } else {
      reasons.push("As an international student, maintain at least 12 credits/semester for F-1 compliance (9 in-person minimum).")
    }
  }

  // Scholarship minimum
  if (scholarshipRule) {
    const semMin = Math.ceil(scholarshipRule.minCreditsPerYear / 2)
    if (recommendation < semMin) {
      recommendation = semMin
      warnings.push(`💰 Scholarship: ${scholarshipType} requires ${semMin} credits/semester (${scholarshipRule.minCreditsPerYear}/year) to renew.`)
    } else {
      reasons.push(`${scholarshipType} requires ${semMin} credits/semester — your recommended load meets this.`)
    }
  }

  // NCAA
  if (isAthlete) {
    if (recommendation < 12) {
      recommendation = 12
      warnings.push("🏆 NCAA: You must maintain at least 12 credits/semester for athletic eligibility.")
    }
    reasons.push("Division I athletes must earn 24 credits/academic year (at least 18 between fall and spring).")
  }

  // Overload note
  if (recommendation > 19) recommendation = 19
  const overloadNote = recommendation > 19
    ? `Taking more than 19 credits requires an Overload Request Form and 3.0+ GPA — contact Academic Affairs.`
    : recommendation === 19
    ? `19 credits requires an Overload Request Form signed by appropriate personnel and submitted to the Office of Academic Affairs. Eligible only with 3.0+ GPA.`
    : ""

  const loadContext = `Credit Load Recommendation:\n\nRecommended load for this student: ${recommendation} credits/semester\n\nReasoning:\n${reasons.map(r => `• ${r}`).join("\n")}\n\n${warnings.length > 0 ? "Warnings:\n" + warnings.join("\n") + "\n\n" : ""}AAMU Load Limits:\n• Maximum: 19 credits/semester (overload requires 3.0 GPA + form)\n• Summer maximum: 10 credits (12 with special permission for graduation eligibility)\n${overloadNote}\n\nInstruction: Give the student a clear credit load recommendation with the reasoning. Be direct: "I recommend X credits this semester." Then explain why based on their situation.`

  return {
    mode: "DB_ONLY",
    answer: await generateDbResponse(question, `${studentContextBlock}${loadContext}`, history),
    data: { recommendedCredits: recommendation },
  }
}
```

- [ ] **Step 4: Verify**

Start dev server (set scholarshipType="AAMU Presidential Scholarship" in session).
Ask: "How many credits should I take?"
Expected: Gives a specific number recommendation with reasoning based on GPA, scholarship, international status.

- [ ] **Step 5: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "feat: credit load recommendation — factors in GPA, academic standing, scholarship minimums, F-1, NCAA eligibility"
```

---

## Task 9: Settings UI — Athlete Flag + Hours Worked

**Files:**
- Modify: `app/settings/page.tsx`
- Modify: `app/api/user/academic-profile/route.ts`

- [ ] **Step 1: Add `isAthlete` and `hoursWorkedPerWeek` state in `app/settings/page.tsx`**

Find the enrollment state declarations (near `const [isInternational, ...`) and add:

```typescript
const [isAthlete, setIsAthlete] = useState(false)
const [hoursWorkedPerWeek, setHoursWorkedPerWeek] = useState("")
```

- [ ] **Step 2: Populate from profile in `loadUserProfile`**

Find where `isInternational` is set from the profile and add alongside it:

```typescript
setIsAthlete(profile?.isAthlete ?? false)
setHoursWorkedPerWeek(profile?.hoursWorkedPerWeek?.toString() ?? "")
```

- [ ] **Step 3: Include in `handleSaveEnrollment`**

Find the enrollment save payload and add the new fields:

```typescript
isAthlete,
hoursWorkedPerWeek: hoursWorkedPerWeek ? parseInt(hoursWorkedPerWeek) : null,
```

- [ ] **Step 4: Add UI fields to the enrollment edit form in `app/settings/page.tsx`**

Find the international student checkbox block in the edit form and add after it:

```tsx
{/* Athlete Checkbox */}
<div>
  <label className="flex items-center gap-3 cursor-pointer">
    <input
      type="checkbox"
      checked={isAthlete}
      onChange={(e) => setIsAthlete(e.target.checked)}
      className="h-4 w-4 rounded border-gray-300 text-[#78103A] accent-[#78103A] cursor-pointer"
    />
    <span className="text-sm font-medium text-gray-900">I am a student-athlete (NCAA)</span>
  </label>
  {isAthlete && (
    <p className="mt-2 ml-7 text-xs text-blue-700 bg-blue-50 rounded-md px-3 py-2">
      NCAA Division I athletes must maintain 12 credits/semester and earn 24 credits/academic year.
    </p>
  )}
</div>

{/* Hours Worked Per Week */}
<div>
  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
    Hours Worked Per Week (optional)
  </label>
  <input
    type="number"
    min="0"
    max="60"
    value={hoursWorkedPerWeek}
    onChange={(e) => setHoursWorkedPerWeek(e.target.value)}
    placeholder="e.g. 20"
    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent"
  />
  <p className="mt-1 text-xs text-gray-400">Used to recommend a manageable credit load</p>
</div>
```

- [ ] **Step 5: Add to read-only view**

Find the read-only view grid and add:

```tsx
<div>
  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Student-Athlete</div>
  <div className="text-base font-medium text-gray-900">{isAthlete ? "Yes (NCAA)" : "No"}</div>
</div>
{hoursWorkedPerWeek && (
  <div>
    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Hours Worked/Week</div>
    <div className="text-base font-medium text-gray-900">{hoursWorkedPerWeek} hrs</div>
  </div>
)}
```

- [ ] **Step 6: Update `app/api/user/academic-profile/route.ts`**

Find the PATCH handler and add the new fields to the accepted body and the update payload:

```typescript
const { programCode, bulletinYear, classification, concentrationCode, isInternational,
        scholarshipType, scholarshipName, scholarshipMinGpa, scholarshipMinCreditsPerYear,
        isAthlete, hoursWorkedPerWeek } = body

// In the update call:
isAthlete: isAthlete ?? undefined,
hoursWorkedPerWeek: hoursWorkedPerWeek ?? undefined,
```

Also add `isAthlete` to the GET response so it loads on page mount.

- [ ] **Step 7: Pass `isAthlete` from profile into session in the chat API**

Find `app/api/chat/query/route.ts` (or wherever session is built from profile) and include:

```typescript
isAthlete: userProfile?.isAthlete ?? false,
```

- [ ] **Step 8: Verify in browser**

Start dev server. Go to `/settings`.
Expected: Enrollment card now shows athlete checkbox and hours-worked field.
Save with athlete=true. Ask "how many credits should I take?" in chat.
Expected: Response mentions NCAA 12-credit minimum requirement.

- [ ] **Step 9: Commit**

```bash
git add app/settings/page.tsx app/api/user/academic-profile/route.ts
git commit -m "feat: add isAthlete and hoursWorkedPerWeek to enrollment settings — NCAA eligibility awareness"
```

---

## Task 10: Casual Conversation Intelligence

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts`

Replace the current "Got it! Is there anything else?" chitchat response with a smart, warm, personality-rich handler that responds naturally to any off-topic question before steering back to advising.

- [ ] **Step 1: Update the chitchat handler in `handleDbOnly`**

Find the chitchat guard block (added in Phase 2 Task 11) and replace the full block:

```typescript
if (intent === "CHITCHAT" || /^(ok|okay|yes|yeah|yep|sure|alright|got\s+it|sounds\s+good|cool|great|thanks?|thank\s+you|bye|hello|hi|hey|noted)\.?$/i.test(question)) {
  if (history.length === 0) {
    return {
      mode: "DB_ONLY",
      answer: "Hi! I'm your AAMU academic advisor. I can help you with:\n- What courses to take next semester\n- Your graduation progress and remaining requirements\n- Course prerequisites\n- GE and free elective options\n- Scholarship and international credit requirements\n\nWhat would you like to know?",
      data: null,
    }
  }
  return {
    mode: "DB_ONLY",
    answer: "Got it! Is there anything else about your courses or academic progress I can help with?",
    data: null,
  }
}
```

Replace with:

```typescript
if (intent === "CHITCHAT" || /^(ok|okay|yes|yeah|yep|sure|alright|got\s+it|sounds\s+good|cool|great|thanks?|thank\s+you|bye|hello|hi|hey|noted)\.?$/i.test(question)) {
  const chitchatContext = `You are a warm, knowledgeable, and conversational AAMU academic advisor AI. Your personality is encouraging, relatable, and supportive — like a senior student who knows everything about AAMU's academics.

Student's message: "${question}"
${history.length === 0 ? "\nThis is the start of the conversation — greet them warmly and explain what you can help with." : "\nThis is a follow-up in an ongoing conversation — acknowledge naturally without repeating your full intro."}

What you can help with (mention some if relevant to greeting):
- Course registration and what to take next semester
- Graduation progress, credits remaining, GPA
- GPA simulation ("if I get an A in BIO 201, what's my GPA?")
- Multi-semester graduation roadmap
- Prerequisites for any course
- Scholarship GPA and credit requirements
- International student (F-1) credit minimums
- Grade repeat / retake policy
- Whether it's safe to drop a course
- Credit load recommendations
- Free electives and GE courses
- Concentration and minor requirements

If the student says something emotional ("I'm stressed", "I hate chemistry", "I'm overwhelmed"), respond with empathy first, then gently pivot to something actionable you can help with.
If they ask who you are or what you are, explain warmly that you're an AI academic advisor built specifically for AAMU students.
Be conversational. Use natural language. End with a question that opens the door to helping them academically.`

  return {
    mode: "DB_ONLY",
    answer: await generateDbResponse(question, chitchatContext, history),
    data: null,
  }
}
```

- [ ] **Step 2: Verify**

Start dev server. Try these:
- "hi" → warm greeting + capability overview
- "I'm stressed about registration" → empathy + actionable pivot
- "are you an AI?" → honest, warm response
- "I hate chemistry" → empathy + "I can help you find alternatives or check what's required"
- "thanks" → natural warm acknowledgment

Each should feel like talking to a friendly, knowledgeable advisor — not a bot.

- [ ] **Step 3: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "feat: replace flat chitchat responses with LLM-driven personality-rich casual conversation — empathetic, warm, advisor-like"
```

---

## Task 11: DegreeWorks-First Course Recommendations

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts` (NEXT_COURSES handler)

When building the schedule, label each recommended course with the DegreeWorks block it satisfies. This makes recommendations feel authoritative and connected to the student's actual degree audit.

- [ ] **Step 1: Build a block-label map from DegreeWorks in the NEXT_COURSES handler**

In the NEXT_COURSES handler, just before the `scheduleLines` are built, add:

```typescript
// Map DegreeWorks incomplete blocks to credit needs so we can label each recommendation
const blockNeedsMap = new Map<string, number>()  // blockName → credits still needed
if (degreeSummaryData?.blocks) {
  for (const block of degreeSummaryData.blocks) {
    if (block.status !== "complete" && block.credits_required != null) {
      const needed = (block.credits_required ?? 0) - (block.credits_applied ?? 0)
      if (needed > 0) blockNeedsMap.set(block.block_name, needed)
    }
  }
}
```

- [ ] **Step 2: Add a `degreeWorksLabel` helper**

Add near the other utility functions:

```typescript
function getDegreeWorksLabel(courseTag: string, blockNeedsMap: Map<string, number>): string {
  // Match tag keywords to block names
  for (const [blockName] of blockNeedsMap) {
    const bn = blockName.toLowerCase()
    const tag = courseTag.toLowerCase()
    if (bn.includes("general") && tag.includes("ge")) return `satisfies ${blockName}`
    if (bn.includes("major") && (tag.includes("major") || tag.includes("senior") || tag.includes("junior") || tag.includes("sophomore") || tag.includes("freshman"))) return `satisfies ${blockName}`
    if (bn.includes("concentration") && tag.includes("concentration")) return `satisfies ${blockName}`
  }
  return ""
}
```

- [ ] **Step 3: Include DegreeWorks block needs in the LLM schedule note**

In the `scheduleNote` for the default case, add context from `degreeWorksNeedsBlock`:

```typescript
const dwNeedsNote = blockNeedsMap.size > 0
  ? `\nDegreeWorks shows these blocks are incomplete: ${Array.from(blockNeedsMap.entries()).map(([b, n]) => `${b} (${n} credits needed)`).join(", ")}. When presenting the schedule, mention which DegreeWorks requirement each course satisfies.`
  : ""
```

Append `dwNeedsNote` to the existing `scheduleNote`.

- [ ] **Step 4: Verify**

Start dev server. Ask: "What courses should I take next semester?"
Expected: Response mentions which graduation requirement each course satisfies, e.g., "BIO 305 (3 cr) — satisfies your Major Requirements block" or "HIS 201 (3 cr) — satisfies your General Education – History requirement."

- [ ] **Step 5: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "feat: label each course recommendation with the DegreeWorks block it satisfies — connects schedule to official degree audit"
```

---

## Task 12: Expanded Smoke Test (75 Questions)

**Files:**
- Modify: `backend/tests/smoke_test.py`

Replace the existing 45-question test with a 75-question comprehensive suite covering all new capabilities.

- [ ] **Step 1: Update `backend/tests/smoke_test.py`**

Replace the `TESTS` list with the expanded version:

```python
TESTS = [
    # ── Chitchat / casual conversation ───────────────────────────────────
    {"label": "chitchat-hi",           "q": "hi",           "expect": ["AAMU", "help"]},
    {"label": "chitchat-stressed",     "q": "im stressed about registration", "expect": ["help", "course"]},
    {"label": "chitchat-are-you-ai",   "q": "are you an AI", "expect": ["AI", "advisor"]},
    {"label": "chitchat-hate-chem",    "q": "I hate chemistry", "expect_not": ["Suggested Schedule"]},
    {"label": "chitchat-thanks",       "q": "thanks",        "expect_not": ["eligible", "Suggested Schedule"]},
    {"label": "chitchat-bare-courses", "q": "courses",       "expect_not": ["Suggested Schedule"]},
    {"label": "chitchat-ok-no-hist",   "q": "ok",            "expect": ["AAMU"]},
    {"label": "chitchat-sounds-good",  "q": "sounds good",   "expect_not": ["Suggested Schedule"]},

    # ── Completed courses ─────────────────────────────────────────────────
    {"label": "completed-typo",        "q": "what couses have i took",        "expect": ["BIO"]},
    {"label": "completed-transcript",  "q": "show my transcript",             "expect": ["BIO"]},
    {"label": "completed-aave",        "q": "tryna see what i done finished", "expect": ["completed"]},

    # ── NEXT_COURSES — scheduling ─────────────────────────────────────────
    {"label": "next-register",         "q": "what can I register for next semester", "expect": ["BIO", "credits"]},
    {"label": "next-12cr",             "q": "I need 12 credits",              "expect": ["12", "credits"]},
    {"label": "next-15cr",             "q": "give me a 15 credit schedule",   "expect": ["15", "credits"]},
    {"label": "next-5x3cr",            "q": "give me 5 courses that are 3 credits each",
        "expect": ["3 cr"], "expect_not_pattern": r"\(4 cr\)"},
    {"label": "next-semester-year",    "q": "what can I take for fall 2026",  "expect": ["BIO", "credits"]},
    {"label": "next-sophomore",        "q": "as a sophomore what should I take", "expect": ["BIO", "credits"]},
    {"label": "save-plan",             "q": "build my schedule",              "expect_not": ["Suggested Schedule for Next Semester"]},
    {"label": "catalog-alias",         "q": "what courses can I take",
        "session_extra": {"bulletinYear": "2024-2025"}, "expect": ["BIO", "credits"]},

    # ── Graduation gap ─────────────────────────────────────────────────────
    {"label": "grad-gap-left",         "q": "what do I need to graduate",     "expect": ["credits"]},
    {"label": "grad-gap-close",        "q": "how close am I to graduating",   "expect": ["credits"]},
    {"label": "grad-timeline",         "q": "when will I graduate",           "expect": ["202"]},   # year
    {"label": "grad-fastest",          "q": "what is the fastest path to graduation", "expect": ["credits", "semester"]},

    # ── GPA ───────────────────────────────────────────────────────────────
    {"label": "gpa-current",           "q": "what is my GPA",                 "expect": ["GPA"]},
    {"label": "gpa-simulation-a",      "q": "if I get an A in a 3 credit class what will my GPA be", "expect": ["GPA", "3"]},
    {"label": "gpa-simulation-target", "q": "what GPA do I need this semester to reach a 3.0", "expect": ["3.0", "GPA"]},
    {"label": "gpa-raise",             "q": "how do I raise my GPA",         "expect": ["GPA", "credit"]},

    # ── Academic standing / SAP ───────────────────────────────────────────
    {"label": "standing-ask",          "q": "am I on academic probation",     "expect": ["GPA", "standing"]},
    {"label": "sap-ask",               "q": "will I lose my financial aid",   "expect": ["SAP", "GPA"]},
    {"label": "sap-completion",        "q": "what is the 67% rule for financial aid", "expect": ["67", "attempted"]},

    # ── Prerequisites ─────────────────────────────────────────────────────
    {"label": "prereq-bio",            "q": "what are the prereqs for BIO 305",  "expect": ["BIO"]},
    {"label": "prereq-before",         "q": "what do I need before BIO 202",     "expect": ["BIO 101"]},

    # ── GE / free electives ───────────────────────────────────────────────
    {"label": "ge-humanities",         "q": "what humanities courses can I take",   "expect": ["credit"]},
    {"label": "ge-GED",                "q": "what GED courses are available",       "expect": ["General Education", "credit"]},
    {"label": "ge-fine-arts",          "q": "what fine arts courses count",         "expect": ["credit"]},
    {"label": "ge-free-elective",      "q": "I need a free elective",              "expect": ["credit"]},
    {"label": "ge-golf",               "q": "can I take golf",                      "expect": ["PE", "credit"]},

    # ── Multi-semester roadmap ────────────────────────────────────────────
    {"label": "roadmap-4sem",          "q": "map out my next 4 semesters",          "expect": ["Fall", "Spring", "credits"]},
    {"label": "roadmap-fastest",       "q": "fastest path to graduation",           "expect": ["19", "semester"]},
    {"label": "roadmap-graduate-by",   "q": "how do I graduate by Spring 2028",     "expect": ["semester", "credit"]},

    # ── Grade repeat ──────────────────────────────────────────────────────
    {"label": "repeat-can-i",          "q": "can I retake BIO 201",            "expect": ["highest", "grade"]},
    {"label": "repeat-d-grade",        "q": "I got a D in CS 201 can I replace my grade", "expect": ["highest", "grade"]},
    {"label": "repeat-sap-impact",     "q": "does retaking a course hurt my financial aid", "expect": ["SAP", "attempted"]},
    {"label": "repeat-failed",         "q": "I failed BIO 101 what do I do",   "expect": ["retake", "grade"]},

    # ── Withdrawal impact ─────────────────────────────────────────────────
    {"label": "withdraw-what-happens", "q": "what happens if I drop BIO 201", "expect": ["W", "GPA"]},
    {"label": "withdraw-w-grade",      "q": "what does a W grade do to my GPA", "expect": ["W", "GPA"]},
    {"label": "withdraw-international","q": "what happens if I drop a class",
        "session_extra": {"isInternational": True}, "expect": ["12", "F-1"]},
    {"label": "withdraw-scholarship",  "q": "should I withdraw from CS 301",
        "session_extra": {"scholarshipType": "AAMU Presidential Scholarship"}, "expect": ["scholarship"]},

    # ── Credit load ───────────────────────────────────────────────────────
    {"label": "load-how-many",         "q": "how many credits should I take",        "expect": ["credits", "recommend"]},
    {"label": "load-too-many",         "q": "is 18 credits too many",               "expect": ["credits"]},
    {"label": "load-international",    "q": "how many credits should I take",
        "session_extra": {"isInternational": True}, "expect": ["12", "F-1"]},
    {"label": "load-scholarship",      "q": "how many credits should I take",
        "session_extra": {"scholarshipType": "AAMU Merit Scholarship"}, "expect": ["15", "scholarship"]},
    {"label": "load-overload",         "q": "can I take 19 credits",               "expect": ["3.0", "form"]},

    # ── International / F-1 ───────────────────────────────────────────────
    {"label": "intl-min",              "q": "im international how many credits min",
        "session_extra": {"isInternational": True}, "expect": ["12", "9", "in-person"]},
    {"label": "intl-min-2",            "q": "what is the minimum credits for international students", "expect": ["12"]},

    # ── Scholarship ───────────────────────────────────────────────────────
    {"label": "scholar-gpa",           "q": "what GPA do I need for my scholarship",
        "session_extra": {"scholarshipType": "AAMU Presidential Scholarship"}, "expect": ["3.50", "30"]},
    {"label": "scholar-credits",       "q": "how many credits per year for my scholarship",
        "session_extra": {"scholarshipType": "AAMU Merit Scholarship"}, "expect": ["30", "3.10"]},
    {"label": "scholar-lose",          "q": "will I lose my scholarship if my GPA drops",
        "session_extra": {"scholarshipType": "AAMU Heritage Gold Scholarship"}, "expect": ["2.80"]},

    # ── NCAA athlete ──────────────────────────────────────────────────────
    {"label": "ncaa-credits",          "q": "how many credits do I need as an athlete",
        "session_extra": {"isAthlete": True}, "expect": ["12", "24"]},
    {"label": "ncaa-load",             "q": "how many credits should I take",
        "session_extra": {"isAthlete": True}, "expect": ["12", "NCAA"]},

    # ── Concentration/minor ───────────────────────────────────────────────
    {"label": "minor-no-conc",         "q": "what are the minor requirements", "expect": ["concentration", "minor"]},

    # ── Simulation ───────────────────────────────────────────────────────
    {"label": "simulate",              "q": "if I take BIO 101 what opens up", "expect": ["BIO"]},

    # ── Bulletin policy ───────────────────────────────────────────────────
    {"label": "policy-min-gpa",        "q": "what is the minimum GPA to graduate", "expect": ["2.0", "GPA"]},
    {"label": "policy-probation",      "q": "what is academic probation at AAMU", "expect": ["probation", "GPA"]},

    # ── Advisor escalation ────────────────────────────────────────────────
    {"label": "escalate-transfer",     "q": "how do I transfer credits from community college", "expect": ["advisor"]},

    # ── Incremental scheduling ────────────────────────────────────────────
    {"label": "incremental-add",       "q": "add one more course to make it 15 credits",
        "conversation_history": [
            {"role": "user", "content": "give me a 12 credit schedule"},
            {"role": "assistant", "content": "Here is your 12-credit schedule:\n- BIO 201: Genetics (3 cr)\n- BIO 210: Ecology (3 cr)\n- CHE 111: General Chemistry (4 cr)\n- MTH 115: Pre-Calculus (3 cr)\nTotal: 12 credits."},
        ],
        "expect": ["credits"], "expect_not": ["BIO 201", "BIO 210"]},
]
```

- [ ] **Step 2: Run the smoke test after all tasks complete**

```bash
python backend/tests/smoke_test.py --verbose
```
Expected: ≥ 65 of 75 tests pass. Note any remaining failures for follow-up.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/smoke_test.py
git commit -m "test: expand smoke test to 75 questions covering all advisor capabilities including GPA sim, roadmap, grade repeat, withdrawal, NCAA"
```

---

## Self-Review Checklist

### Spec Coverage

| Capability | Task | Status |
|---|---|---|
| DegreeWorks-first course recommendations | Task 3 (block needs injection), Task 11 | Covered |
| Academic standing auto-detection (Warning/Probation) | Task 1, Task 3 | Covered |
| SAP awareness (67% completion, GPA thresholds) | Task 1, Task 3 | Covered |
| GPA simulation | Task 4 | Covered |
| Expected graduation date | Task 1, Task 3 | Covered |
| Grade repeat / retake policy | Task 5 | Covered |
| Withdrawal/drop impact with threshold checks | Task 6 | Covered |
| Multi-semester roadmap | Task 7 | Covered |
| Credit load recommendation | Task 8 | Covered |
| NCAA athlete support | Task 9, Task 8 | Covered |
| Casual conversation with personality | Task 10 | Covered |
| Settings UI for athlete + hours worked | Task 9 | Covered |
| Comprehensive smoke test | Task 12 | Covered |
| 5 new router intents | Task 2 | Covered |
| SAP 67% completion explained | Task 5 (GRADE_REPEAT), Task 6 | Covered |
| AAMU-verified grade repeat policy | Task 5 | Covered |
| F-1 withdrawal impact warning | Task 6 | Covered |
| Scholarship-aware withdrawal warning | Task 6 | Covered |

### Placeholder Scan

No TBDs, TODOs, or "implement later" entries. All code is copy-pasteable.

### Type Consistency

- `computeAcademicStanding(summary: DegreeSummaryRow | null)` — called in Task 3 with `degreeSummaryData.summary` which is `DegreeSummaryRow | null`. ✓
- `computeSapStatus` same signature. ✓
- `computeGpaProjection(summary, [{credits, expectedGrade}])` — `newCourses` array with typed members. ✓
- `computeExpectedGraduation(summary: DegreeSummaryRow | null)` — null-safe. ✓
- `buildMultiSemesterRoadmap` returns `RoadmapSemester[]` — used directly in orchestrator. ✓
- `GRADE_POINTS` exported from degree-summary/service.ts, imported in orchestrator. ✓
- `isAthlete` passed as `(payload.session as any)?.isAthlete` — type-safe cast pending schema update in academic profile route. ✓
- `formatDegreeWorksNeeds(data: FullDegreeSummary)` — called with `degreeSummaryData` which is `FullDegreeSummary | null`. Guards handle null. ✓
