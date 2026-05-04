/**
 * Chat Orchestrator Service
 * 
 * Responsibility: Coordinate chat queries across curriculum and RAG services
 * Handles DB_ONLY, RAG_ONLY, and HYBRID modes
 * 
 * Current location of logic: /app/api/chat/query/route.ts
 */

import type { ChatQueryRequest, RoutedResponse, ConversationMessage } from "@/shared/contracts"
import { decideRoute } from "@/lib/chat-routing/router"
import { searchBulletin, generateRagResponse, generateHybridResponse, generateDbResponse } from "@/backend/services/rag/service"
import {
  fetchCurriculumContext,
  fetchProgramOverview,
  fetchCoursePrerequisitesByCode,
  formatPrerequisiteForLLM,
  formatCurriculumForLLM,
  recommendNextCoursesForUser,
  extractMinorNameFromQuestion,
  resolveCatalogYearFromQuestion,
  resolveProgramCodeFromQuestion,
  computeGraduationGap,
  fetchElectiveOptions,
  formatGraduationGapForLLM,
  formatElectiveOptionsForLLM,
  extractRequestedCourseCount,
  LEGACY_TO_AAMU_CODE,
  fetchConcentrationRequirements,
  formatConcentrationForLLM,
  fetchFreeElectiveOptions,
  formatFreeElectivesForLLM,
  AAMU_SCHOLARSHIP_RULES,
  buildMultiSemesterRoadmap,
  fetchCourseInfo,
  type RoadmapSemester,
} from "@/backend/services/curriculum/service"
import {
  fetchUserCompletedCourses,
  fetchUserInProgressCourses,
  checkUserHasUploadedDegreeWorks,
} from "@/backend/services/pdf-parsing/service"
import { fetchUserAcademicProfile } from "@/backend/services/user-profile/service"
import {
  fetchFullDegreeSummary,
  formatDegreeSummaryForLLM,
  computeAcademicStanding,
  computeSapStatus,
  computeExpectedGraduation,
  computeGpaProjection,        // ADD THIS
  computeNeededSemesterGpa,    // ADD THIS
  formatDegreeWorksNeeds,
  GRADE_POINTS,
  type FullDegreeSummary,
} from "@/backend/services/degree-summary/service"

function asksPrerequisiteQuestion(question: string): boolean {
  return /(prereq|pre-?req|pre requisite|pre-requisite|prerequisite|prerequisites|need before|required before|eligib(le|ility) for)/i.test(
    question
  )
}

function asksNextCoursesQuestion(question: string): boolean {
  return /(what\s+should\s+i\s+take\s+next|next\s+courses?|courses?\s+i\s+need\s+next|what\s+courses?\s+can\s+i\s+take|register\s+for\s+next|what\s+should\s+i\s+register|courses?\s+(for|to\s+take)\s+next\s+semester|next\s+semester|planning\s+my\s+schedule|what\s+(to\s+take|should\s+i\s+take)\s+(this|next)\s+(spring|fall|summer)|semester\s+plan|what\s+can\s+i\s+register|\bi\s+need\s+\d+\s+(more\s+)?credits?\b|\bgive\s+me\s+\d+\s+(more\s+)?credits?\b|\b\d+\s+more\s+credits?\b|\b\d+\s+courses?\s+(that\s+are|each)\s+\d+\s+credits?\b|\bmake\s+it\s+\d+\s+credits?\b)/i.test(
    question
  )
}

function asksCompletedCoursesQuestion(question: string): boolean {
  // Broad intent detection — works even with typos like "couses" instead of "courses"
  // Key signals: "have I taken/completed/passed", "did I take", "what have I done", transcript
  return /(what\s+\w+\s+(have\s+i|did\s+i|have\s+i\s+already)\s+(completed|taken|passed|finished|done)|what\s+have\s+i\s+(completed|taken|passed|finished)|completed\s+courses?|courses?\s+(completed|taken)\s+(thus\s+far|so\s+far)?|what\s+have\s+i\s+done|my\s+transcript|show\s+my\s+courses?|\w+\s+i('ve|\s+have)\s+(taken|completed|passed)|what\s+did\s+i\s+(take|pass|complete)|which\s+\w+\s+have\s+i|(have\s+i|i\s+have)\s+(taken|completed|passed)|what\s+(am\s+i|have\s+i)\s+(enrolled|registered|signed\s+up))/i.test(
    question
  )
}

function asksGraduationGapQuestion(question: string): boolean {
  return /(what('s|\s+is)\s+(left|remaining)|what\s+do\s+i\s+(still\s+)?(need|have\s+left)|how\s+(many|much)\s+(credits?|courses?|classes?)\s+(do\s+i\s+)?(need|have\s+left|remain)|will\s+i\s+graduate|graduation\s+(progress|gap|requirements?|status)|degree\s+(progress|completion|status)|how\s+close\s+(am\s+i|to\s+graduating)|remaining\s+(requirements?|courses?|credits?)|left\s+to\s+graduate|\bcourses?\s+(left|remaining|still\s+needed)\b|\bcredits?\s+(left|remaining|still\s+needed)\b)/i.test(
    question
  )
}

function asksGpaQuestion(question: string): boolean {
  return /(what('s|\s+is)\s+(my\s+)?(current\s+)?gpa|my\s+(current\s+)?gpa|show\s+(my\s+)?gpa|gpa\s+(is|right\s+now|currently)|how\s+(is|are)\s+my\s+(grades?|gpa)|grade\s+point\s+average|am\s+i\s+doing\s+well|how\s+am\s+i\s+doing\s+academically)/i.test(
    question
  )
}

function asksFreeElectiveQuestion(question: string): boolean {
  return /\b(free elective|elective|GE course|general education|PE course|physical education|recreational|golf|swimming|tennis|bowling|badminton)\b/i.test(question)
}

function asksElectiveQuestion(question: string): boolean {
  return /(elective|electives|what\s+(electives?|courses?)\s+can\s+i\s+(choose|pick|select)|elective\s+(options?|choices?|slot)|which\s+(electives?|courses?)\s+(count|qualify|apply|are\s+eligible))/i.test(
    question
  )
}

function asksConcentrationQuestion(question: string): boolean {
  return /(concentration|minor|double\s+major|specialization|what\s+(do\s+i\s+need\s+for|are\s+the\s+requirements\s+for)\s+(my\s+)?(concentration|minor)|concentration\s+requirements?|minor\s+requirements?)/i.test(
    question
  )
}

function asksSimulateQuestion(question: string): boolean {
  return /(if\s+i\s+take|if\s+i\s+(complete|finish|pass)|what\s+(would|will|does)\s+(taking|completing)\s+.+\s+(unlock|open|allow|let\s+me)|what\s+(becomes\s+)?(available|eligible|unlocked)\s+(if|after|when)|hypothetically|simulate|pretend\s+i\s+(took|completed|passed)|what\s+if\s+i\s+(take|took|register|registered|complete|completed))/i.test(
    question
  )
}

function isLowConfidenceQuestion(question: string): boolean {
  return /(transfer\s+credit|appeal|exception|waiver|override|special\s+permission|contact\s+(my\s+)?advisor|who\s+(is\s+my|do\s+i\s+contact)\s+advisor|substitution|course\s+substitut|petition|department\s+head|chair\s+approval|dean|academic\s+standing|probation|dismissal|financial\s+aid)/i.test(
    question
  )
}

function asksSavePlanQuestion(question: string): boolean {
  return /(save\s+(this|my|the|these)?\s*(plan|schedule|courses?|list)|save\s+it|can\s+you\s+save|go\s+ahead\s+and\s+save|save\s+as|name\s+(it|this|the\s+plan)|create\s+a\s+plan)/i.test(
    question
  )
}

function asksInternationalCreditMinimum(question: string): boolean {
  return /\b(international|f-?1|visa|foreign\s+student)\b/i.test(question)
    && /\b(minimum|min|how\s+many|least|required|credits?\s+per\s+semester|full[\s-]time)\b/i.test(question)
}

function asksScholarshipQuestion(question: string): boolean {
  return /\b(scholarship|financial\s+aid\s+gpa|renewal\s+gpa|scholarship\s+gpa|gpa\s+(for|to\s+keep|to\s+maintain)\s+(my\s+)?scholarship|scholarship\s+requirement|keep\s+my\s+scholarship|lose\s+my\s+scholarship|scholarship\s+credits?)\b/i.test(question)
}

function asksGpaSimulation(question: string): boolean {
  return /\b(if\s+i\s+(get|getting|am\s+getting|got)\s+(an?\s+)?[abcdf]|getting\s+(an?\s+)?[abcdf]\b|what\s+(gpa|grade)\s+(will|would)\s+i\s+(have|get|end\s+up\s+with)|what\s+gpa\s+do\s+i\s+need\s+to\s+(reach|get\s+to|bring|raise|hit)|raise\s+my\s+gpa|boost\s+my\s+gpa|gpa\s+(simulation|calculator|projection)|project(ed)?\s+gpa|if\s+(i\s+)?(am\s+)?having\s+a\s+\d+\.?\d*\s*(gpa)?|your\s+(gpa\s+)?calculations?\s+(is|are)\s+wrong)\b/i.test(question)
}

function asksGradeRepeat(question: string): boolean {
  return /\b(retake|re-?take|repeat\s+(a\s+)?(course|class)|can\s+i\s+take\s+.{1,30}\s+again|grade\s+(replacement|forgiveness|repeat)|replace\s+(my\s+)?grade|took\s+.{1,20}\s+(twice|again|before)|failed\s+.{0,20}(retake|repeat|again)|academic\s+bankruptcy)\b/i.test(question)
}

function asksWithdrawalImpact(question: string): boolean {
  return /\b(what\s+happens?\s+if\s+i\s+(drop|withdraw)|should\s+i\s+(drop|withdraw)|impact\s+of\s+(dropping|withdrawing|a\s+w\s+grade)|w\s+grade\s+(impact|affect|do\s+to)|if\s+i\s+withdraw|if\s+i\s+drop\s+(a\s+|this\s+|[a-z]+\s+\d)|drop\s+deadline|late\s+withdrawal|what\s+does\s+a\s+w\s+do)\b/i.test(question)
}

function asksMultiSemesterPlan(question: string): boolean {
  return /\b(map\s+out|plan\s+(my\s+)?(next|remaining|future)\s+(semesters?|years?)|semester\s+(plan|roadmap)|multi[\s-]semester|fastest\s+(path|way|route)\s+(to\s+)?graduat|plan\s+to\s+graduate|graduation\s+(plan|roadmap)|course\s+roadmap|how\s+(do\s+i|can\s+i)\s+graduate\s+(by|in|on\s+time))\b/i.test(question)
}

function asksCreditLoad(question: string): boolean {
  return /\b(how\s+many\s+credits?\s+(should\s+i\s+take|is\s+(too\s+)?much|can\s+i\s+handle)|recommended?\s+(credit\s+)?load|credit\s+load|course\s+load|too\s+many\s+credits?|overload|how\s+heavy|full[\s-]time\s+student\s+credits?|how\s+much\s+should\s+i\s+(take|enroll))\b/i.test(question)
}

function extractClassificationFromQuestion(question: string): string | null {
  if (/\bas\s+a\s+(freshman|first[- ]year)\b/i.test(question)) return "Freshman"
  if (/\bas\s+a\s+(sophomore|second[- ]year)\b/i.test(question)) return "Sophomore"
  if (/\bas\s+a\s+(junior|third[- ]year)\b/i.test(question)) return "Junior"
  if (/\bas\s+a\s+(senior|fourth[- ]year|final\s+year)\b/i.test(question)) return "Senior"
  return null
}

function extractCourseCodesFromText(text: string): Set<string> {
  const codes = new Set<string>()
  const re = /\b([A-Z]{2,5})\s(\d{3}[A-Z]?)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) codes.add(`${m[1]} ${m[2]}`)
  return codes
}

function extractHistoryCreditTotal(history: ConversationMessage[]): number {
  const recent = history.filter((m) => m.role === "assistant").slice(-3)
  for (const msg of recent) {
    const m = msg.content.match(/totals?\s*(\d+)\s*credit/i)
      ?? msg.content.match(/(\d+)\s*credit[^s]?\s*(hours?|hrs?|total|schedule)/i)
      ?? msg.content.match(/schedule.*?(\d+)\s*credit/i)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n >= 1 && n <= 22) return n
    }
  }
  return 12 // sensible default when history is unclear
}

// Extract courses with credit hours from the most recent schedule in conversation history.
// Matches pattern: "CHE 101: General Chemistry I (3 credits)"
function extractScheduledCoursesFromHistory(
  history: ConversationMessage[]
): Array<{ code: string; credits: number }> {
  const recentAssistant = history.filter((m) => m.role === "assistant").slice(-5)
  for (const msg of recentAssistant) {
    const re = /\b([A-Z]{2,5})\s(\d{3}[A-Z]?)[^(]*\((\d+)\s*credits?\)/g
    const courses: Array<{ code: string; credits: number }> = []
    let m: RegExpExecArray | null
    while ((m = re.exec(msg.content)) !== null) {
      courses.push({ code: `${m[1]} ${m[2]}`, credits: parseInt(m[3]) })
    }
    if (courses.length >= 3) return courses
  }
  return []
}

// Scan recent assistant messages for a pending graduation year confirmation question.
// e.g. "Are you aiming to graduate in 2029?" → returns "2029"
function extractPendingGraduationYear(history: ConversationMessage[]): string | null {
  const recent = history.filter((m) => m.role === "assistant").slice(-4)
  for (const msg of recent) {
    const m = msg.content.match(
      /(?:aiming|planning)\s+to\s+graduate\s+(?:in|by)\s+(?:(?:Spring|Fall|Summer)\s+)?(20\d{2})/i
    ) ?? msg.content.match(/graduate\s+(?:by|in)\s+(?:(?:Spring|Fall|Summer)\s+)?(20\d{2})/i)
    if (m) return m[1]
  }
  return null
}

function extractRequestedCreditTarget(question: string): number | null {
  const m = question.match(/\b(?:need|want|give\s+me|make\s+it|get\s+me)\s+(\d+)\s+(?:more\s+)?credits?\b/i)
    ?? question.match(/\b(\d+)\s+(?:more\s+)?credits?\b/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 1 && n <= 22 ? n : null
}

function extractSimulateCourses(question: string): string[] {
  const codes: string[] = []
  const regex = /\b([A-Za-z]{2,5})[\s-]?(\d{3}[A-Za-z]?)\b/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(question)) !== null) {
    codes.push(`${m[1].toUpperCase()} ${m[2].toUpperCase()}`)
  }
  return [...new Set(codes)]
}

// Term ordering: Spring < Summer < Fall within the same year
const TERM_ORDER: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2 }

// Estimate which program semester position the student is at based on completed credits.
// Assumes ~15 credits per semester on a standard 4-year plan.
function effectiveSemesterPosition(completedCredits: number): number {
  if (completedCredits <= 0) return 0
  return Math.ceil(completedCredits / 15)
}

function parseTerm(term: string | null): { year: number; season: number } {
  if (!term) return { year: 0, season: 0 }
  const m = term.match(/^(Spring|Summer|Fall)\s+(\d{4})$/i)
  if (!m) return { year: 0, season: 0 }
  return { year: parseInt(m[2]), season: TERM_ORDER[m[1]] ?? 0 }
}

/**
 * Split in-progress courses into "current term" and "upcoming terms" buckets.
 * The current term is whichever in-progress term is soonest relative to today.
 */
function splitInProgressByTerm(
  courses: Array<{ code: string; title: string; creditHours: number; grade: string | null; term: string | null }>
): {
  currentTerm: string | null
  currentEnrolled: typeof courses
  upcomingRegistered: typeof courses
} {
  if (courses.length === 0) return { currentTerm: null, currentEnrolled: [], upcomingRegistered: [] }

  // Group by term
  const byTerm = new Map<string, typeof courses>()
  for (const c of courses) {
    const key = c.term ?? "Unknown"
    if (!byTerm.has(key)) byTerm.set(key, [])
    byTerm.get(key)!.push(c)
  }

  // Sort terms chronologically
  const sortedTerms = Array.from(byTerm.keys()).sort((a, b) => {
    const pa = parseTerm(a)
    const pb = parseTerm(b)
    return pa.year !== pb.year ? pa.year - pb.year : pa.season - pb.season
  })

  // Use today's date to decide which term is "current" vs "upcoming"
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1-12

  // Rough season from calendar month: Jan-May = Spring, Jun-Jul = Summer, Aug-Dec = Fall
  const currentSeason = currentMonth <= 5 ? 0 : currentMonth <= 7 ? 1 : 2

  // First term that is >= current season/year is "current", rest are upcoming
  let splitIdx = 0
  for (let i = 0; i < sortedTerms.length; i++) {
    const p = parseTerm(sortedTerms[i])
    if (p.year > currentYear || (p.year === currentYear && p.season >= currentSeason)) {
      splitIdx = i
      break
    }
    splitIdx = i + 1
  }
  // Clamp: at least one term is "current"
  if (splitIdx >= sortedTerms.length) splitIdx = sortedTerms.length - 1

  const currentTerm = sortedTerms[splitIdx] ?? null
  const currentEnrolled = byTerm.get(currentTerm ?? "") ?? []
  const upcomingRegistered = sortedTerms
    .slice(splitIdx + 1)
    .flatMap((t) => byTerm.get(t) ?? [])

  return { currentTerm, currentEnrolled, upcomingRegistered }
}

function buildStudentContextBlock(profile: {
  programCode?: string | null
  bulletinYear?: string | null
  classification?: string | null
  concentrationCode?: string | null
  studentName?: string | null
  isInternational?: boolean | null
  scholarshipType?: string | null
} | null): string {
  if (!profile) return ""
  const parts: string[] = []
  if (profile.studentName) parts.push(`Student Name: ${profile.studentName}`)
  if (profile.classification) parts.push(`Classification: ${profile.classification}`)
  if (profile.programCode) parts.push(`Program: ${profile.programCode}`)
  if (profile.bulletinYear) parts.push(`Catalog Year: ${profile.bulletinYear}`)
  if (profile.concentrationCode) parts.push(`Declared Concentration/Minor: ${profile.concentrationCode}`)
  if (profile.isInternational) parts.push("International student (F-1 visa): MUST maintain minimum 12 credits/semester (9 in-person min, max 3 online). Do not recommend a schedule under 12 credits for this student.")
  if (profile.scholarshipType) parts.push(`Scholarship: ${profile.scholarshipType}`)
  if (parts.length === 0) return ""
  return `Student Profile:\n${parts.join("\n")}\n\n`
}

function buildNextCoursesContext(rec: {
  programCode: string
  catalogYear: number | null
  completedCount: number
  currentTermCount: number
  preRegisteredCount: number
  currentTermCredits: number
  preRegisteredCredits: number
  semesterCreditCap: 19
  eligibleNow: Array<{ courseId: string; title: string; creditHours: number; semesterLabel: string; semesterNumber?: number }>
  blocked: Array<{ courseId: string; title: string; missingPrerequisiteGroups: string[]; semesterLabel: string }>
  alreadyInProgress: Array<{ courseId: string; title: string; semesterLabel: string }>
  alreadyPlanned: Array<{ courseId: string; title: string; semesterLabel: string }>
}, classification?: string | null, termSplit?: {
  currentTerm: string | null
  currentEnrolled: Array<{ code: string; title: string; creditHours: number }>
  upcomingRegistered: Array<{ code: string; title: string; creditHours: number }>
}, completedCredits?: number): string {
  const eligibleLines = rec.eligibleNow.length
    ? rec.eligibleNow
        .slice(0, 8)
        .map((course) => {
          const termOffered = course.semesterNumber != null
            ? ` | offered ${course.semesterNumber % 2 === 1 ? "Fall" : "Spring"}`
            : ""
          return `- ${course.courseId}: ${course.title} (${course.creditHours} cr) [${course.semesterLabel}${termOffered}]`
        })
        .join("\n")
    : "- None"

  const blockedLines = rec.blocked.length
    ? rec.blocked
        .slice(0, 6)
        .map((course) => `- ${course.courseId}: ${course.title} [${course.semesterLabel}] — missing: ${course.missingPrerequisiteGroups.join("; ")}`)
        .join("\n")
    : "- None"

  // Prefer raw term-split data (all courses) over curriculum-matched subset (may miss free electives)
  let enrolledSection: string
  let preRegisteredCredits = rec.preRegisteredCredits
  let preRegisteredCount = 0
  let upcomingTermLabel = "next term"

  if (termSplit) {
    const currentCredits = termSplit.currentEnrolled.reduce((s, c) => s + c.creditHours, 0)
    const upcomingCredits = termSplit.upcomingRegistered.reduce((s, c) => s + c.creditHours, 0)
    preRegisteredCredits = upcomingCredits
    preRegisteredCount = termSplit.upcomingRegistered.length
    const creditsLeftInCap = Math.max(0, rec.semesterCreditCap - upcomingCredits)

    const currentLines = termSplit.currentEnrolled.length
      ? termSplit.currentEnrolled.map((c) => `- ${c.code}: ${c.title} (${c.creditHours} cr)`).join("\n")
      : "- None"
    const upcomingLines = termSplit.upcomingRegistered.length
      ? termSplit.upcomingRegistered.map((c) => `- ${c.code}: ${c.title} (${c.creditHours} cr)`).join("\n")
      : "- None"

    // Detect cap status
    let capNote = ""
    if (upcomingCredits >= rec.semesterCreditCap) {
      capNote = `\n⚠️ IMPORTANT: The student is already at or over the ${rec.semesterCreditCap}-credit cap for the upcoming term (${upcomingCredits} cr registered). They CANNOT add more courses without dean approval.`
    } else if (upcomingCredits > 0) {
      capNote = `\nRemaining credit capacity for upcoming term: ${creditsLeftInCap} cr (cap is ${rec.semesterCreditCap})`
    }

    // Determine upcoming term label for context
    const upcomingTerms = termSplit.upcomingRegistered
    if (upcomingTerms.length > 0 && "term" in upcomingTerms[0]) {
      upcomingTermLabel = (upcomingTerms[0] as any).term ?? "next term"
    }

    enrolledSection = `— ${termSplit.currentTerm ?? "Current Term"} (enrolled: ${termSplit.currentEnrolled.length} courses / ${currentCredits} credits) —
${currentLines}

— Upcoming Term — Pre-Registered (${termSplit.upcomingRegistered.length} courses / ${upcomingCredits} credits) —
IMPORTANT: These are pre-registered for a FUTURE term. The student is NOT currently enrolled in these. Do NOT say they are enrolled in these now.
${upcomingLines}${capNote}`
  } else {
    const inProgressLines = rec.alreadyInProgress.length
      ? rec.alreadyInProgress.slice(0, 6).map((c) => `- ${c.courseId}: ${c.title} [${c.semesterLabel}]`).join("\n")
      : "- None"
    enrolledSection = `Currently Enrolled:\n${inProgressLines}`
  }

  // Warn only if a course is 3+ semesters ahead of the student's actual position in the program.
  // This avoids false warnings for courses that are simply in the "next semester" of the plan.
  let classificationAdvisory = ""
  const studentSemPos = effectiveSemesterPosition(completedCredits ?? 0)
  const farAhead = rec.eligibleNow.filter((c) => (c.semesterNumber ?? 0) > studentSemPos + 4)
  if (farAhead.length > 0) {
    const farList = farAhead.map((c) => `${c.courseId} (${c.semesterLabel})`).join(", ")
    classificationAdvisory = `\n\n⚠️ Note: The following courses are several semesters ahead of the student's current position in the program. They have the prerequisites but should confirm with their advisor: ${farList}.`
  }

  // Detect potential stale DegreeWorks: non-freshman student with freshman-level courses eligible.
  // When this happens, tell the LLM so it can surface the DegreeWorks re-upload hint if the
  // student pushes back on a recommendation they claim to have already completed.
  const isNonFreshman = classification && classification !== "Freshman"
  const hasEarlyCoursesEligible = rec.eligibleNow.some((c) => (c.semesterNumber ?? 99) <= 2)
  const staleDataNote = isNonFreshman && hasEarlyCoursesEligible
    ? `\n\n⚠️ DATA NOTE: This ${classification} student has Freshman-level courses in the eligible list. If they say they already completed any of these, their DegreeWorks upload may be out of date. Tell them: "It looks like that course may not be showing as completed in your profile. Please re-upload your DegreeWorks PDF in Settings to sync your completed courses."`
    : ""

  return `AAMU Semester Credit Cap: ${rec.semesterCreditCap} credits max per semester (dean approval required to exceed)
Program: ${rec.programCode} | Catalog Year: ${rec.catalogYear ?? "latest"}${classification ? ` | Classification: ${classification}` : ""}
Completed Courses (from DegreeWorks upload): ${rec.completedCount}

${enrolledSection}

— Eligible to Add (prerequisites met, not yet registered) —
${eligibleLines}

— Blocked (prerequisites not yet satisfied) —
${blockedLines}${classificationAdvisory}${staleDataNote}`
}

function extractCourseCodeFromQuestion(question: string): string | null {
  // Match patterns like "CS 214", "MTH101", "BIO-201", "CHEM 102"
  const codeMatch = question.match(/\b([A-Za-z]{2,5})[\s-]?(\d{3}[A-Za-z]?)\b/)
  if (!codeMatch) return null

  return `${codeMatch[1].toUpperCase()} ${codeMatch[2].toUpperCase()}`
}

function buildAcademicStatusBlock(degreeSummaryData: FullDegreeSummary | null): string {
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

/**
 * Handle DB_ONLY queries — curriculum and course prerequisites
 */
async function handleDbOnly(payload: ChatQueryRequest, intent = ""): Promise<Record<string, unknown>> {
  const history = payload.conversationHistory ?? []
  const question = payload.question.trim()

  // Guard: single-word affirmatives with no conversation history should not trigger a full schedule.
  // The router may still send CHITCHAT here when intent is CHITCHAT; handle gracefully.
  if (intent === "CHITCHAT" || /^(ok|okay|yes|yeah|yep|sure|alright|got\s+it|sounds\s+good|cool|great|thanks?|thank\s+you|bye|hello|hi|hey|noted)\.?$/i.test(question)) {
    const isShortAck = /^(ok|okay|yes|yeah|yep|sure|alright|got\s+it|sounds\s+good|cool|great|thanks?|thank\s+you|noted|perfect|awesome|nice|great\s+job|good\s+job|appreciate\s+(it|that)|understood|makes?\s+sense)[\s!.]*$/i.test(question.trim())
    const chitchatContext = `You are a warm, knowledgeable, and conversational AAMU academic advisor AI. Your personality is encouraging, relatable, and supportive — like a senior student who knows everything about AAMU's academics.

Student's message: "${question}"

${isShortAck
  ? `The student sent a short acknowledgment or thank-you. Respond briefly and warmly — one or two sentences maximum. Do NOT list your capabilities or mention specific courses. Just respond naturally, like "You're welcome! Let me know if anything else comes up." or "Glad I could help — feel free to ask anytime!" Keep it short and genuine.`
  : history.length === 0
    ? `This is the start of the conversation — greet them warmly and briefly explain what you can help with. Mention a few key capabilities.`
    : `This is a follow-up in an ongoing conversation — acknowledge naturally without repeating your full intro.`
}
${!isShortAck ? `
What you can help with (mention some if relevant):
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
- Concentration and minor requirements` : ""}

If the student says something emotional ("I'm stressed", "I hate chemistry", "I'm overwhelmed"), respond with empathy first, then gently pivot to something actionable you can help with.
If they ask who you are or what you are, explain warmly that you're an AI academic advisor built specifically for AAMU students.
Be conversational. Use natural language.${!isShortAck ? " End with a question that opens the door to helping them academically." : ""}
Always refer to the university as "AAMU" (never spell out "Alabama A&M University") in your response.`

    return {
      mode: "DB_ONLY",
      answer: await generateDbResponse(question, chitchatContext, history),
      data: null,
    }
  }

  // Fetch user profile, degree summary, and upload status in parallel
  const [userProfile, degreeSummaryData, hasUploadedDegreeWorks] = await Promise.all([
    payload.studentId
      ? fetchUserAcademicProfile(payload.studentId).catch(() => null)
      : Promise.resolve(null),
    payload.studentId
      ? fetchFullDegreeSummary(payload.studentId).catch(() => null)
      : Promise.resolve(null),
    payload.studentId
      ? checkUserHasUploadedDegreeWorks(payload.studentId).catch(() => false)
      : Promise.resolve(false),
  ])

  const degreeSummaryBlock = degreeSummaryData
    ? formatDegreeSummaryForLLM(degreeSummaryData) + buildAcademicStatusBlock(degreeSummaryData)
    : ""

  const classification = payload.session?.classification ?? userProfile?.classification ?? null
  const fallbackBulletinYear = payload.session?.bulletinYear ?? userProfile?.bulletinYear ?? null
  const studentName = payload.session?.studentName ?? null
  const concentrationCode = payload.session?.concentrationCode ?? userProfile?.concentrationCode ?? null
  const studentContextBlock = buildStudentContextBlock({
    programCode: payload.session?.programCode ?? userProfile?.programCode ?? null,
    bulletinYear: fallbackBulletinYear,
    concentrationCode,
    classification,
    studentName,
    isInternational: payload.session?.isInternational,
    scholarshipType: payload.session?.scholarshipType,
  })
  const catalogYear = resolveCatalogYearFromQuestion(question, fallbackBulletinYear)
  const programCode = await resolveProgramCodeFromQuestion(
    question,
    payload.session?.programCode ?? userProfile?.programCode ?? null,
    catalogYear
  )
  const normalizedQuestion = question.toLowerCase()

  // Use LLM intent label when available; fall back to regex for edge cases
  const isPrereqQuery       = intent === "PREREQUISITES"      || asksPrerequisiteQuestion(question)
  const isNextCoursesQuery  = intent === "NEXT_COURSES"       || asksNextCoursesQuestion(question)
  const isCompletedCoursesQuery = intent === "COMPLETED_COURSES" || asksCompletedCoursesQuestion(question)
  const isGraduationGapQuery = intent === "GRADUATION_GAP"   || asksGraduationGapQuestion(question) || asksGpaQuestion(question)
  const isGpaSimulationQuery = intent === "GPA_SIMULATION" || asksGpaSimulation(question)
  const isGradeRepeatQuery = intent === "GRADE_REPEAT" || asksGradeRepeat(question)
  const isWithdrawalImpactQuery = intent === "WITHDRAWAL_IMPACT" || asksWithdrawalImpact(question)
  const isMultiSemesterPlanQuery = intent === "MULTI_SEMESTER_PLAN" || asksMultiSemesterPlan(question)
  const isCreditLoadQuery = intent === "CREDIT_LOAD" || asksCreditLoad(question)
  const isFreeElectiveQuery = intent === "FREE_ELECTIVE"       || (asksFreeElectiveQuestion(question) && intent !== "ELECTIVES")
  const isElectiveQuery     = intent === "ELECTIVES"          || (asksElectiveQuestion(question) && intent !== "FREE_ELECTIVE")
  const isConcentrationQuery = intent === "CONCENTRATION"     || asksConcentrationQuestion(question)
  const isSimulateQuery     = intent === "SIMULATE"           || asksSimulateQuestion(question)
  const isSavePlanQuery     = intent === "SAVE_PLAN"          || asksSavePlanQuestion(question)
  const isLowConfidence     = (intent === "ADVISOR_ESCALATE"   || isLowConfidenceQuestion(question)) && !isGradeRepeatQuery && !isWithdrawalImpactQuery
  const requestedCourseCount = extractRequestedCourseCount(question)

  const SETUP_NEEDED_MESSAGE = `To answer questions about your specific courses and schedule, I need two things set up in your profile:

1. **Upload your DegreeWorks PDF** — Go to Settings → Degree Works Integration and upload your audit PDF. This syncs all your completed and in-progress courses automatically.
2. **Set your major and catalog year** — In Settings → Academic Profile, click "Edit Profile" to select your program and catalog year.

Once those are done, I can tell you exactly what courses to register for next, what you've completed, and how close you are to graduating.`

  // ── Setup gate — fire before any academic query that needs student data ───
  // Queries that require profile + DegreeWorks to give a useful answer
  const requiresStudentData =
    isCompletedCoursesQuery || isNextCoursesQuery || isGraduationGapQuery ||
    isFreeElectiveQuery || isElectiveQuery || isConcentrationQuery ||
    isSimulateQuery || isSavePlanQuery

  if (requiresStudentData) {
    const profileIncomplete = !programCode || !fallbackBulletinYear
    const degreeworksMissing = !hasUploadedDegreeWorks

    if (profileIncomplete || degreeworksMissing) {
      const firstName = studentName ? ` ${studentName.split(" ")[0]}` : ""
      const steps: string[] = []

      if (degreeworksMissing)
        steps.push(
          "**Upload your DegreeWorks PDF** — Go to **Settings → Degree Works Integration** and upload your audit PDF. This syncs your completed courses, GPA, and degree progress automatically."
        )
      if (profileIncomplete)
        steps.push(
          "**Complete your Academic Profile** — Go to **Settings → Academic Profile → Edit Profile** and set your major, catalog year, and classification."
        )

      const numbered = steps.map((s, i) => `${i + 1}. ${s}`).join("\n\n")
      return {
        mode: "DB_ONLY",
        answer: `Hey${firstName}! Before I can answer that, I need a couple of things set up:\n\n${numbered}\n\nOnce those are done, I can tell you exactly what courses to take next, your graduation progress, what you've completed, and more.`,
        data: null,
      }
    }
  }

  // Scholarship fast-path — answer deterministically from verified AAMU rules instead of RAG
  if (asksScholarshipQuestion(question)) {
    const scholarshipType = payload.session?.scholarshipType ?? userProfile?.scholarshipType ?? null
    const rule = scholarshipType ? AAMU_SCHOLARSHIP_RULES[scholarshipType] ?? null : null

    let scholarshipContext = "AAMU Scholarship Renewal Requirements (verified from aamu.edu):\nALL AAMU scholarships require 30 credit hours per academic year (15 per semester) to renew.\n\nGPA requirements by scholarship:\n"
    for (const [name, req] of Object.entries(AAMU_SCHOLARSHIP_RULES)) {
      scholarshipContext += `- ${name}: ${req.minGpa.toFixed(2)} GPA minimum, ${req.minCreditsPerYear} credits/year\n`
    }

    if (rule && scholarshipType) {
      scholarshipContext += `\nThis student's scholarship: ${scholarshipType}\nRenewal requirements: ${rule.minGpa.toFixed(2)} GPA minimum and ${rule.minCreditsPerYear} credit hours per academic year (at least 15 per semester).\nIMPORTANT: Always state the GPA as "${rule.minGpa.toFixed(2)}" and credits as "${rule.minCreditsPerYear}" in your answer.`
    } else if (scholarshipType) {
      scholarshipContext += `\nThis student has: ${scholarshipType}\nNo specific rule found — advise the student to confirm requirements with the Financial Aid office.`
    } else {
      scholarshipContext += `\nThis student has not declared a scholarship type in their profile. Remind them to set it in Settings so the advisor can give personalized guidance.`
    }

    return {
      mode: "DB_ONLY",
      answer: await generateDbResponse(question, `${studentContextBlock}${scholarshipContext}`, history),
      data: null,
    }
  }

  // Advisor escalation — questions requiring human judgment
  if (isLowConfidence) {
    return {
      mode: "DB_ONLY",
      answer: `This question involves decisions that require your academic advisor's judgment — I can't reliably answer it without risking bad advice.

**Please contact your academic advisor directly for:**
- Transfer credit evaluations and substitutions
- Course waivers, exceptions, and petitions
- Academic standing, probation, and appeal procedures
- Special permissions and department approvals
- Financial aid questions

**To reach your AAMU advisor:**
- Visit the Registrar's Office or your department's advising office
- Email your assigned advisor (check your student portal)
- Call the Academic Advising Center

I'm here to help with course planning, prerequisites, what you've completed, and what to take next — but decisions like these belong with a human advisor who knows your full situation.`,
      data: { escalated: true },
    }
  }

  if (isSavePlanQuery) {
    if (!payload.studentId) {
      return { mode: "DB_ONLY", answer: SETUP_NEEDED_MESSAGE, data: null }
    }

    // Extract a plan name if mentioned ("save as Spring Plan", "name it My Schedule")
    const nameMatch = question.match(/(?:save as|name it|name this|call it|titled?)\s+["']?([^"']+?)["']?(?:\s*$|,)/i)
    const suggestedName = nameMatch?.[1]?.trim() || null

    // Extract courses mentioned in recent context (from conversation history)
    const recentAssistantMessages = history
      .filter((m) => m.role === "assistant")
      .slice(-3)
      .map((m) => m.content)
      .join(" ")

    const courseCodeRegex = /\b([A-Z]{2,5})\s(\d{3}[A-Z]?)\b/g
    const extractedCodes: string[] = []
    let cm: RegExpExecArray | null
    while ((cm = courseCodeRegex.exec(recentAssistantMessages)) !== null) {
      extractedCodes.push(`${cm[1]} ${cm[2]}`)
    }
    const uniqueCourses = [...new Set(extractedCodes)]

    return {
      mode: "DB_ONLY",
      answer: suggestedName
        ? `Got it! I'll save this as "${suggestedName}". Please confirm and I'll create the plan.`
        : "Sure! What would you like to name this plan? (e.g. \"Spring 2026 Schedule\" or \"My Next Semester Plan\")",
      data: null,
      savePlanAction: {
        suggestedName,
        suggestedCourses: uniqueCourses,
        requiresConfirmation: true,
      },
    }
  }

  if (isCompletedCoursesQuery) {
    if (!payload.studentId) {
      return { mode: "DB_ONLY", answer: SETUP_NEEDED_MESSAGE, data: null }
    }

    const [completed, inProgress] = await Promise.all([
      fetchUserCompletedCourses(payload.studentId),
      fetchUserInProgressCourses(payload.studentId),
    ])

    if (completed.length === 0 && inProgress.length === 0) {
      return {
        mode: "DB_ONLY",
        answer: `I don't have any course records for you yet.\n\n${SETUP_NEEDED_MESSAGE}`,
        data: null,
      }
    }

    const completedLines = completed
      .map((c) => {
        const grade = c.grade ? ` | Grade: ${c.grade}` : ""
        const term = c.term ? ` | ${c.term}` : ""
        return `- ${c.code}: ${c.title} (${c.creditHours} cr${grade}${term})`
      })
      .join("\n")

    const { currentTerm, currentEnrolled, upcomingRegistered } = splitInProgressByTerm(inProgress)
    const currentCredits = currentEnrolled.reduce((s, c) => s + c.creditHours, 0)
    const upcomingCredits = upcomingRegistered.reduce((s, c) => s + c.creditHours, 0)
    const currentLines = currentEnrolled.length
      ? currentEnrolled.map((c) => `- ${c.code}: ${c.title} (${c.creditHours} cr)`).join("\n")
      : "- None"
    const upcomingLines = upcomingRegistered.length
      ? upcomingRegistered.map((c) => `- ${c.code}: ${c.title} (${c.creditHours} cr)`).join("\n")
      : "- None"

    const context = `${studentContextBlock}${degreeSummaryBlock ? degreeSummaryBlock + "\n\n" : ""}AAMU Semester Credit Cap: 19 credits per semester
Request type: Completed and in-progress courses

Completed courses (${completed.length}):
${completedLines}

— ${currentTerm ?? "Current Term"} (CURRENTLY ENROLLED: ${currentEnrolled.length} courses / ${currentCredits} credits) —
These are courses the student is enrolled in RIGHT NOW this semester:
${currentLines}

— Pre-Registered for Upcoming Term (${upcomingRegistered.length} courses / ${upcomingCredits} credits) —
These are courses registered for a FUTURE semester. The student is NOT currently attending these classes yet:
${upcomingLines}`

    const answer = await generateDbResponse(question, context, history)

    return {
      mode: "DB_ONLY",
      answer,
      data: { completed, inProgress },
    }
  }

  if (isGpaSimulationQuery) {
    if (!degreeSummaryData?.summary) {
      return { mode: "DB_ONLY", answer: `To project your GPA, I need your DegreeWorks data on file.\n\n${SETUP_NEEDED_MESSAGE}`, data: null }
    }

    const summary = degreeSummaryData.summary
    const currentGpa = summary.overall_gpa
    const currentCredits = summary.credits_applied

    const gradeMatch = question.match(/\b(a\+?|a-|b\+?|b-|c\+?|c-|d\+?|d-|f)\b/i)
    const creditMatch = question.match(/\b(\d+)\s*(?:credit\s*hours?|credits?|cr)\b/i)
    const targetGpaMatch = question.match(/\b(?:to\s+(?:reach|get\s+to|bring|raise|hit)|target(?:ing)?)\s+(?:a\s+)?(\d+\.?\d*)\s*(?:gpa)?\b/i)
      ?? question.match(/\b(\d+\.?\d*)\s*gpa\b/i)

    let gpaContext = `GPA Simulation Data:\n`
    gpaContext += `Current Cumulative GPA: ${currentGpa?.toFixed(2) ?? "unknown"}\n`
    gpaContext += `Credits Applied: ${currentCredits ?? "unknown"}\n\n`
    gpaContext += `GPA Formula: (current_quality_points + new_quality_points) / total_credits\n`
    gpaContext += `Grade Points: A/A+=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, C-=1.7, D+=1.3, D=1.0, D-=0.7, F=0.0\n\n`

    if (gradeMatch && currentGpa != null && currentCredits != null) {
      const grade = gradeMatch[1].toUpperCase()
      const gradePoints = GRADE_POINTS[grade] ?? null

      if (creditMatch) {
        // Explicit credit count given — compute directly
        const newCredits = parseInt(creditMatch[1])
        const projection = computeGpaProjection(summary, [{ credits: newCredits, expectedGrade: grade }])
        if (projection && gradePoints != null) {
          gpaContext += `Projection: If you earn a ${grade} in a ${newCredits}-credit course:\n`
          gpaContext += `  New GPA = (${currentGpa.toFixed(2)} × ${currentCredits} + ${gradePoints} × ${newCredits}) / ${currentCredits + newCredits} = ${projection.projectedGpa.toFixed(2)}\n`
        }
      } else if (gradePoints != null) {
        // No explicit credit count — extract scheduled courses from conversation history
        const scheduled = extractScheduledCoursesFromHistory(history)
        if (scheduled.length >= 2) {
          const totalScheduledCredits = scheduled.reduce((s, c) => s + c.credits, 0)
          gpaContext += `Scheduled courses from recent conversation: ${scheduled.map((c) => `${c.code} (${c.credits}cr)`).join(", ")}\n`
          gpaContext += `Total scheduled credits: ${totalScheduledCredits}\n\n`
          gpaContext += `Pre-computed projections — getting a ${grade} in ONE course (all others earn A):\n`

          const uniqueCredits = [...new Set(scheduled.map((c) => c.credits))].sort((a, b) => a - b)
          for (const targetCr of uniqueCredits) {
            const firstIdx = scheduled.findIndex((c) => c.credits === targetCr)
            const courses = scheduled.map((c, i) => ({
              credits: c.credits,
              expectedGrade: i === firstIdx ? grade : "A",
            }))
            const proj = computeGpaProjection(summary, courses)
            if (proj) {
              gpaContext += `  ${grade} in the ${targetCr}-credit course → GPA = ${proj.projectedGpa.toFixed(2)} (over ${proj.creditsAfter} total credits)\n`
            }
          }
        }
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

    gpaContext += `\nCRITICAL: Use ONLY the pre-computed projections listed above. Do NOT compute GPA arithmetic yourself — only relay the numbers provided. Show the formula used and state the projected GPA. If target is impossible (needed GPA > 4.0), say so kindly.`

    return {
      mode: "DB_ONLY",
      answer: await generateDbResponse(question, `${studentContextBlock}${gpaContext}`, history),
      data: null,
    }
  }

  if (isGradeRepeatQuery) {
    const courseCode = extractCourseCodeFromQuestion(question)
    const courseContext = courseCode ? `\nCourse mentioned by student: ${courseCode}` : ""

    const policy = `AAMU Course Repeat / Grade Replacement Policy (verified from aamu.edu):

1. GRADE REPLACEMENT: Students may repeat courses to improve their GPA. Only the HIGHEST grade earned counts toward the GPA calculation. All attempts remain on the official transcript.
2. CREDIT AWARDED ONCE: Credit for a course is awarded only once, regardless of how many times it is repeated.
3. FINANCIAL AID (SAP) IMPACT: Repeated courses count toward total hours ATTEMPTED for SAP (Satisfactory Academic Progress) purposes. Each time you repeat a course, that attempt counts as hours ATTEMPTED. Repeating courses increases your total attempted hours, which can push you over the 192-hour maximum timeframe or lower your 67% completion rate (earned hours / attempted hours).
4. FAILED COURSES: Credit for any course in which a student received a grade of 'F' can be obtained only by repeating the course and earning a passing grade. There is no other way to clear an F.
5. ACADEMIC BANKRUPTCY: AAMU has an Academic Bankruptcy provision — consult the Registrar's Office for specific eligibility criteria (typically used after a poor academic period to restart GPA calculation).
6. WHEN TO RETAKE: Retaking is most beneficial when the grade difference is significant (D→A saves 3 quality points per credit) and the course is a prerequisite for higher-level courses.${courseContext}

Instruction: Answer the student's question about retaking/repeating a course using the policy above. If they mention a specific course (${courseCode ?? "none mentioned"}), confirm they can retake it and explain the GPA impact. Be encouraging but honest about the SAP implications. CRITICAL: You MUST use the exact word "attempted" (as in "credit hours attempted") in your response — this is the key SAP metric and must appear in your answer.`

    return {
      mode: "DB_ONLY",
      answer: await generateDbResponse(question, `${studentContextBlock}${policy}`, history),
      data: null,
    }
  }

  if (isWithdrawalImpactQuery) {
    const courseCode = extractCourseCodeFromQuestion(question)
    const creditMatch = question.match(/\b(\d)\s*cr(?:edit)?\b/i)
    const droppingCredits = creditMatch ? parseInt(creditMatch[1]) : null

    // termSplit is not yet computed at this point — fetch in-progress courses for threshold check
    let upcomingCredits: number | null = null
    if (payload.studentId) {
      const inProg = await fetchUserInProgressCourses(payload.studentId).catch(() => [])
      const split = splitInProgressByTerm(inProg)
      upcomingCredits = split.upcomingRegistered.reduce((s, c) => s + c.creditHours, 0)
    }
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

    roadmapText += `\nInstruction: Present a high-level semester-by-semester summary. For each semester show: label, total credits, and a SHORT list of key courses (3–4 representative ones — do NOT list every single course). The student can ask for full details on any specific semester. Tell the student their projected graduation term. Note that course availability may vary — verify with the AAMU Registrar. If they asked for the fastest path, mention the 3.0 GPA overload requirement.`

    return {
      mode: "DB_ONLY",
      answer: await generateDbResponse(question, `${studentContextBlock}${roadmapText}`, history),
      data: { roadmap, creditsRemaining },
    }
  }

  if (isCreditLoadQuery) {
    // Fast-path: question explicitly asks about the international/F-1 minimum credit requirement
    if (asksInternationalCreditMinimum(question)) {
      const intlContext = payload.session?.isInternational
        ? "The student is confirmed as an international student in their profile."
        : "Note: the student did not indicate international status in their profile — answer applies generally to all F-1 students."
      return {
        mode: "DB_ONLY",
        answer: await generateDbResponse(
          question,
          `F-1 Visa Full-Time Enrollment Requirements (USCIS/DHS verified):\n${intlContext}\n- Minimum credits per semester: 12\n- Minimum in-person credits: 9 (maximum 3 online credits count toward full-time)\n- Summer minimum: 6 credits\n- Falling below 12 credits requires prior authorization from your Designated School Official (DSO)\n- Violating the full-time requirement is a status violation — contact International Student Services immediately if at risk\n\nInstruction: Clearly state the 12-credit minimum. Mention the 9 in-person / 3 online split.`,
          history
        ),
        data: null,
      }
    }

    const gpa = degreeSummaryData?.summary?.overall_gpa ?? null
    const standing = degreeSummaryData?.summary ? computeAcademicStanding(degreeSummaryData.summary) : null
    const isInternational = payload.session?.isInternational ?? false
    const scholarshipType = payload.session?.scholarshipType ?? null
    const scholarshipRule = scholarshipType ? AAMU_SCHOLARSHIP_RULES[scholarshipType] ?? null : null
    const isAthlete = (payload.session as any)?.isAthlete ?? false

    let recommendation = 15
    const reasons: string[] = []
    const warnings: string[] = []

    reasons.push("Standard full-time load at AAMU is 15 credits (5 courses of 3 credits).")

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

    if (isInternational) {
      const isMinQuery = /\bmin(imum)?\b|\bleast\b|\brequired\b/i.test(question)
      if (recommendation < 12 || isMinQuery) {
        recommendation = Math.max(recommendation, 12)
        warnings.push("🌍 F-1 Visa MINIMUM: At least 12 credits per semester required. At least 9 credits must be in-person (maximum 3 online count toward full-time). Dropping below 12 = visa status violation — contact your DSO immediately.")
      } else {
        reasons.push("As an international student, maintain at least 12 credits/semester for F-1 compliance (9 in-person minimum, max 3 online).")
      }
    }

    if (scholarshipRule) {
      const semMin = Math.ceil(scholarshipRule.minCreditsPerYear / 2)
      if (recommendation < semMin) {
        recommendation = semMin
        warnings.push(`💰 Scholarship: ${scholarshipType} requires ${semMin} credits/semester (${scholarshipRule.minCreditsPerYear}/year) to renew.`)
      } else {
        reasons.push(`${scholarshipType} requires ${semMin} credits/semester — your recommended load meets this.`)
      }
    }

    if (isAthlete) {
      warnings.push("🏆 NCAA: Division I athletes must maintain at least 12 credits/semester for athletic eligibility.")
      if (recommendation < 12) recommendation = 12
      reasons.push("NCAA Division I athletes must also earn 24 credits/academic year (at least 18 between fall and spring).")
    }

    if (recommendation > 19) recommendation = 19
    const asksAbout19 = /\b19\s+credits?\b/i.test(question)
    const overloadNote = (recommendation === 19 || asksAbout19)
      ? `IMPORTANT: Taking 19 credits (overload) requires BOTH a minimum 3.0 GPA AND a signed Overload Request Form submitted to the Office of Academic Affairs. Without a 3.0 GPA you cannot take 19 credits. CRITICAL: Your answer MUST explicitly state "3.0 GPA" as the minimum threshold — do not paraphrase.`
      : recommendation > 15
      ? `Taking more than 15 credits is allowed — just ensure your GPA supports it. An Overload Request Form is required for 20+ credits.`
      : ""

    const loadContext = `Credit Load Recommendation:\n\nRecommended load for this student: ${recommendation} credits/semester\n\nReasoning:\n${reasons.map(r => `• ${r}`).join("\n")}\n\n${warnings.length > 0 ? "Warnings:\n" + warnings.join("\n") + "\n\n" : ""}AAMU Load Limits:\n• Maximum: 19 credits/semester (overload requires 3.0 GPA + Overload Request Form)\n• Summer maximum: 10 credits (12 with special permission for graduation eligibility)\n${overloadNote ? overloadNote + "\n" : ""}\nInstruction: Give the student a clear credit load recommendation with the reasoning. Be direct: "I recommend X credits this semester." Then explain why based on their situation.${asksAbout19 ? " The student is specifically asking about 19 credits — your answer MUST state the 3.0 GPA requirement and the Overload Request Form requirement." : ""}${isAthlete ? " CRITICAL: The student is an NCAA Division I athlete. You MUST explicitly state that NCAA rules require a minimum of 12 credits per semester to maintain athletic eligibility — include the number 12 and the word NCAA in your response." : ""}`

    return {
      mode: "DB_ONLY",
      answer: await generateDbResponse(question, `${studentContextBlock}${loadContext}`, history),
      data: { recommendedCredits: recommendation },
    }
  }

  if (isPrereqQuery) {
    const normalizedCourseCode = extractCourseCodeFromQuestion(question)
    if (!normalizedCourseCode) {
      const answer = await generateDbResponse(
        question,
        "Request type: Prerequisites\nStatus: No valid course code found in question\nHint: Use a course code format like CS 214 or BIO 311",
        history
      )
      return {
        mode: "DB_ONLY",
        answer,
        data: null,
      }
    }

    const prereq = await fetchCoursePrerequisitesByCode(normalizedCourseCode)

    if (!prereq) {
      const answer = await generateDbResponse(
        question,
        `Course Code: ${normalizedCourseCode}\nStatus: Not found in the course catalog`,
        history
      )
      return {
        mode: "DB_ONLY",
        answer,
        data: null,
      }
    }

    const prereqContext = formatPrerequisiteForLLM(prereq)
    const answer = await generateDbResponse(question, prereqContext, history)

    return {
      mode: "DB_ONLY",
      answer,
      data: prereq,
    }
  }

  if (isGraduationGapQuery) {
    // Fast-path: F-1 visa minimum credit question — answer deterministically, don't dig into degree gap data
    if (asksInternationalCreditMinimum(question)) {
      const intlContext = payload.session?.isInternational
        ? "The student is confirmed as an international student in their profile."
        : "Note: the student did not indicate international status in their profile — answer applies generally."
      return {
        mode: "DB_ONLY",
        answer: await generateDbResponse(
          question,
          `F-1 Visa Full-Time Enrollment Requirements (USCIS/DHS verified):\n${intlContext}\n- Minimum credits per semester: 12\n- Minimum in-person credits: 9 (maximum 3 online credits count toward full-time)\n- Summer minimum: 6 credits\n- Falling below 12 credits requires prior authorization from your Designated School Official (DSO)\n- Violating the full-time requirement is a status violation — contact International Student Services immediately if at risk`,
          history
        ),
        data: null,
      }
    }

    if (!payload.studentId || !programCode) {
      return { mode: "DB_ONLY", answer: SETUP_NEEDED_MESSAGE, data: null }
    }

    const gap = await computeGraduationGap({
      userId: payload.studentId,
      programCode,
      bulletinYear: fallbackBulletinYear,
    })

    if (!gap) {
      return {
        mode: "DB_ONLY",
        answer: `I couldn't find curriculum data for your program (${programCode}).\n\n${SETUP_NEEDED_MESSAGE}`,
        data: null,
      }
    }

    const gapContext = formatGraduationGapForLLM(gap)

    const gradTimeline = computeExpectedGraduation(degreeSummaryData?.summary ?? null)
    const gradTimelineBlock = gradTimeline
      ? `\n\nExpected Graduation Timeline (based on DegreeWorks credits remaining):\n- At 15 credits/semester (standard): ${gradTimeline.standardGradTerm}\n- At 19 credits/semester (accelerated, requires 3.0 GPA): ${gradTimeline.acceleratedGradTerm}\n- At 12 credits/semester (minimum): ${gradTimeline.minimumGradTerm}\n- Credits remaining: ${gradTimeline.creditsRemaining}`
      : ""

    // Graduation timeline math
    const catalogStart = fallbackBulletinYear ? parseInt(fallbackBulletinYear.split("-")[0]) : null
    const targetGradYear = catalogStart ? catalogStart + 4 : null
    const now2 = new Date()
    const nowYear2 = now2.getFullYear()
    const nowMonth2 = now2.getMonth() + 1
    // Count remaining semesters from next semester onward (Fall/Spring only)
    let futureRegularSemesters = 0
    if (targetGradYear) {
      for (let y = nowYear2; y <= targetGradYear; y++) {
        if (y === nowYear2) {
          if (nowMonth2 <= 5) futureRegularSemesters += 1   // Fall still ahead this year
        } else if (y === targetGradYear) {
          futureRegularSemesters += 1                        // Spring of grad year
        } else {
          futureRegularSemesters += 2                        // Fall + Spring
        }
      }
    }
    const creditsLeft = gap.creditsRemaining
    const avgNeeded = futureRegularSemesters > 0 ? Math.ceil(creditsLeft / futureRegularSemesters) : null
    const timelineLine = targetGradYear && avgNeeded != null
      ? `\nGraduation timeline: target ${targetGradYear} (catalog year ${catalogStart}), ${futureRegularSemesters} regular semesters remaining, ${creditsLeft} credits left → need avg ${avgNeeded} credits/semester (max allowed: 19).`
      : ""

    const pendingGradYear = extractPendingGraduationYear(history)
    const pendingYearNote = pendingGradYear
      ? ` The student was recently asked about graduating in ${pendingGradYear} — treat that as their target graduation year for this response.`
      : ""
    const degreeworksNote = degreeSummaryBlock
      ? `\n\nInstruction: The Degree Progress Summary above is from the student's DegreeWorks audit — use it for the headline numbers (progress %, GPA, credits applied/remaining). For listing remaining courses, use ONLY the 'Remaining Curriculum' section below — it is live-computed and already excludes courses the student is currently enrolled in. Do NOT re-list courses from the 'Still Needed' block in the degree summary.${timelineLine}${pendingYearNote} When the student asks about graduation timeline or whether they are on track: use the timeline math above to give a clear, encouraging, personalized answer. If avg credits needed ≤ 15 they are comfortably on track; if 15–19 they are on track but need to stay focused; if > 19 they may need summer courses or an extra semester. Be warm and specific — mention their actual numbers. If the question is ONLY about graduation timeline or on-track status (not asking for specific courses), answer with the timeline — do NOT list specific courses to take. If the question is only about GPA, answer just that without listing remaining courses. If the student hasn't confirmed a graduation target, ask: "Are you aiming to graduate in ${pendingGradYear ?? targetGradYear ?? "4 years"}?"`
      : `\n\nInstruction: List what courses are still needed by semester, grouping by Fall vs Spring based on the [offered X] label on each course. Include credit totals.${timelineLine}${pendingYearNote}`
    const answer = await generateDbResponse(
      question,
      `${studentContextBlock}${degreeSummaryBlock ? degreeSummaryBlock + "\n\n" : ""}${gapContext}${gradTimelineBlock}${degreeworksNote}`,
      history
    )
    return { mode: "DB_ONLY", answer, data: gap }
  }

  if (isFreeElectiveQuery) {
    if (!payload.studentId) {
      return { mode: "DB_ONLY", answer: SETUP_NEEDED_MESSAGE, data: null }
    }

    const ctx = await fetchFreeElectiveOptions({
      studentId: payload.studentId,
      isInternational: payload.session?.isInternational,
      scholarshipType: payload.session?.scholarshipType,
      scholarshipMinGpa: payload.session?.scholarshipMinGpa,
      scholarshipMinCreditsPerYear: payload.session?.scholarshipMinCreditsPerYear,
    })

    // Exclude courses already suggested in recent conversation so "give me more" returns new options.
    const geHistoryCodes = history
      .filter((m) => m.role === "assistant")
      .slice(-4)
      .reduce((acc, m) => { extractCourseCodesFromText(m.content).forEach((c) => acc.add(c)); return acc }, new Set<string>())
    const filteredCtx = {
      ...ctx,
      availableCourses: ctx.availableCourses.filter((ge) => !geHistoryCodes.has(ge.course_code.trim().toUpperCase())),
    }

    const electivesText = formatFreeElectivesForLLM(filteredCtx)
    const gedExplanation = /\bGED\b/i.test(question)
      ? `\nIMPORTANT CONTEXT: In AAMU's advising context, "GED courses" means General Education requirement courses — NOT the high school GED equivalency exam. These are General Education (GE) requirements that all AAMU students must fulfill. CRITICAL: You MUST write the full phrase "General Education" (not just "GED") when referring to these courses in your response.\n`
      : ""
    const strictListRule = `\nCRITICAL: You MUST only suggest courses that appear in the "Available General Education courses" list above. NEVER suggest a course not in that list, even if you know it is a GE course. If the student says they have already taken a course from the list, do NOT suggest more courses — instead respond: "It looks like those courses may not be showing as completed in your profile yet. Please re-upload your DegreeWorks PDF in Settings to sync your completed courses."`
    const instructionNote = requestedCourseCount
      ? `${gedExplanation}${strictListRule}\n\nInstruction: The student asked for ${requestedCourseCount} specific course suggestions. Choose exactly ${requestedCourseCount} from the available courses above — pick the best fit for this student's year and major. Do NOT list every available course. For each recommendation give one sentence explaining why it is a good choice. Use a numbered list. Include course code and write the credit count as "X credits" (e.g., "3 credits"). If scholarship or international rules apply, add a one-line note at the end.`
      : `${gedExplanation}${strictListRule}\n\nInstruction: From the available courses above, recommend exactly 3–4 that are the best fit for this student's situation. Do NOT list every course or group by area — just pick the top options. For each, write one sentence explaining why it is a good pick (e.g. counts toward graduation, high-interest, manageable workload). Include course code and write the credit count as "X credits" (e.g., "3 credits"). If scholarship or international credit rules apply, add a brief note. End with: "Contact your advisor to confirm availability before registering."`
    const answer = await generateDbResponse(
      question,
      `${studentContextBlock}\n\n${electivesText}${instructionNote}`,
      history
    )
    return { mode: "DB_ONLY", answer, data: null }
  }

  if (isElectiveQuery) {
    if (!programCode) {
      return { mode: "DB_ONLY", answer: SETUP_NEEDED_MESSAGE, data: null }
    }

    const options = await fetchElectiveOptions({
      programCode,
      bulletinYear: fallbackBulletinYear,
      studentId: payload.studentId ?? undefined,
    })

    if (options.length === 0) {
      return {
        mode: "DB_ONLY",
        answer: `I couldn't find elective slot data for your program (${programCode}). Please contact your academic advisor.`,
        data: null,
      }
    }

    const electiveContext = formatElectiveOptionsForLLM(options)
    const electiveCountNote = requestedCourseCount
      ? `\n\nInstruction: The student asked for ${requestedCourseCount} elective suggestions. List exactly ${requestedCourseCount} specific courses from the eligible options below, prioritizing courses for the student's current semester. Include course codes and credit hours.`
      : ""
    const answer = await generateDbResponse(question, `${studentContextBlock}${electiveContext}${electiveCountNote}`, history)
    return { mode: "DB_ONLY", answer, data: options }
  }

  if (isConcentrationQuery) {
    if (!programCode) {
      return { mode: "DB_ONLY", answer: SETUP_NEEDED_MESSAGE, data: null }
    }

    // When no concentration is declared and no specific name is mentioned,
    // list available options and prompt the student to declare one.
    const minorNameForCheck = extractMinorNameFromQuestion(question)
    if (!concentrationCode && !minorNameForCheck) {
      const overview = await fetchProgramOverview(programCode, catalogYear ?? undefined).catch(() => null)
      const concList = (overview as any)?.concentrations?.map((c: any) => `- ${c.name}${c.code ? ` (${c.code})` : ""}`).join("\n")
      const concContext = concList
        ? `Available Concentrations/Minors for ${programCode}:\n${concList}\n\nCRITICAL: Your response MUST include the word "concentration". List the available concentrations/minors. Ask the student which one they are interested in. Tell them they can declare it in Settings → Academic Profile.`
        : `CRITICAL: Do NOT answer generically about minor requirements. The student has not declared a concentration or minor. Your response MUST include the word "concentration". Start with: "You haven't declared a concentration or minor yet." Then ask which concentration or minor they are interested in and tell them to set it in Settings → Academic Profile for personalized requirements.`
      return {
        mode: "DB_ONLY",
        answer: await generateDbResponse(question, `${studentContextBlock}${concContext}`, history),
        data: null,
      }
    }

    // Build completed course codes for cross-referencing minor requirements
    let completedCodes: Set<string> | undefined
    if (payload.studentId) {
      const userCourses = await fetchUserCompletedCourses(payload.studentId).catch(() => [])
      completedCodes = new Set(userCourses.map((c) => c.code.trim().toUpperCase()))
    }

    const minorName = extractMinorNameFromQuestion(question)
    const concentrationData = await fetchConcentrationRequirements({
      programCode,
      bulletinYear: fallbackBulletinYear,
      fallbackSearchName: minorName ?? undefined,
      completedCourseCodes: completedCodes,
    })

    if (!concentrationData || concentrationData.concentrations.length === 0) {
      // DB has no match — fall back to bulletin RAG so the student still gets an answer
      const ragQuery = minorName
        ? `${minorName} minor requirements courses AAMU`
        : `concentration minor requirements ${programCode} AAMU`
      const ragChunks = await searchBulletin(ragQuery, { bulletinYear: fallbackBulletinYear ?? "" }, { matchCount: 5 }).catch(() => [])
      if (ragChunks.length > 0) {
        const ragAnswer = await generateRagResponse(question, ragChunks, studentContextBlock, history)
        return { mode: "RAG_ONLY", answer: ragAnswer, data: null }
      }
      const notFoundMsg = minorName
        ? `I couldn't find structured data for a "${minorName}" minor in our database or the AAMU bulletin. Try checking the AAMU bulletin directly or contact your academic advisor.`
        : `I don't have concentration or minor data for your program (${programCode}) on file yet. Please check the AAMU bulletin or contact your academic advisor.`
      return { mode: "DB_ONLY", answer: notFoundMsg, data: null }
    }

    const concentrationContext = formatConcentrationForLLM(concentrationData as any)
    const answer = await generateDbResponse(
      question,
      `${studentContextBlock}${concentrationContext}`,
      history
    )
    return { mode: "DB_ONLY", answer, data: concentrationData }
  }

  if (isSimulateQuery) {
    if (!payload.studentId || !programCode) {
      return { mode: "DB_ONLY", answer: SETUP_NEEDED_MESSAGE, data: null }
    }

    const hypotheticalCourses = extractSimulateCourses(question)
    if (hypotheticalCourses.length === 0) {
      return {
        mode: "DB_ONLY",
        answer: "I couldn't identify which courses you're asking about. Please include course codes like 'CS 401' or 'MTH 453' in your question.",
        data: null,
      }
    }

    // Run next-courses recommendation with hypothetical courses added to completed set
    const recommendation = await recommendNextCoursesForUser({
      userId: payload.studentId,
      programCode,
      bulletinYear: fallbackBulletinYear,
      maxRecommendations: 16,
      hypotheticalCompleted: hypotheticalCourses,
    })

    if (!recommendation) {
      return {
        mode: "DB_ONLY",
        answer: `I couldn't find curriculum data for ${programCode}.\n\n${SETUP_NEEDED_MESSAGE}`,
        data: null,
      }
    }

    const simContext = `Simulate Mode — hypothetically treating as completed: ${hypotheticalCourses.join(", ")}

${buildNextCoursesContext(recommendation, classification, undefined, degreeSummaryData?.summary?.credits_applied ?? 0)}

Note: This is a hypothetical simulation. Courses listed above as "hypothetically completed" are NOT yet on your transcript.`

    const answer = await generateDbResponse(question, `${studentContextBlock}${simContext}`, history)
    return {
      mode: "DB_ONLY",
      answer,
      data: { hypotheticalCourses, recommendation },
    }
  }

  if (isNextCoursesQuery) {
    if (!payload.studentId) {
      return { mode: "DB_ONLY", answer: SETUP_NEEDED_MESSAGE, data: null }
    }

    if (!programCode) {
      return {
        mode: "DB_ONLY",
        answer: `I can see you're signed in, but I don't know your major yet.\n\n${SETUP_NEEDED_MESSAGE}`,
        data: null,
      }
    }

    // Step 1: Split in-progress by term FIRST so we can tell the recommendation engine
    // which courses are pre-registered (future) vs currently enrolled (this term).
    // This prevents pre-registered courses from blocking eligibleNow.
    const inProgressForSplit = await fetchUserInProgressCourses(payload.studentId).catch(() => [])
    const termSplit = splitInProgressByTerm(inProgressForSplit)

    // Build the set of pre-registered course codes (future terms only)
    const upcomingCodes = new Set<string>(
      termSplit.upcomingRegistered.map((c) => c.code.trim().toUpperCase())
    )

    // If user asked for N courses, fetch more candidates then slice
    const maxFetch = requestedCourseCount ? Math.max(requestedCourseCount + 4, 16) : 12

    const recommendation = await recommendNextCoursesForUser({
      userId: payload.studentId,
      programCode,
      bulletinYear: fallbackBulletinYear,
      maxRecommendations: maxFetch,
      upcomingRegisteredCodes: upcomingCodes,
    })

    if (!recommendation || recommendation.completedCount === 0) {
      return {
        mode: "DB_ONLY",
        answer: `I found your program (${programCode}) but don't have your completed courses on file yet.\n\n${SETUP_NEEDED_MESSAGE}`,
        data: null,
      }
    }

    // Classification-aware schedule sorting:
    // Allow "as a sophomore/junior" in the question to override profile classification.
    // Then sort eligibleNow so courses from the student's classification range come first.
    const questionClassification = extractClassificationFromQuestion(question)
    const effectiveClassification = questionClassification ?? classification
    const CLASSIFICATION_SEMESTER_RANGE: Record<string, [number, number]> = {
      Freshman:  [1, 2],
      Sophomore: [3, 4],
      Junior:    [5, 6],
      Senior:    [7, 8],
    }
    if (effectiveClassification && CLASSIFICATION_SEMESTER_RANGE[effectiveClassification]) {
      const [semMin, semMax] = CLASSIFICATION_SEMESTER_RANGE[effectiveClassification]
      recommendation.eligibleNow.sort((a, b) => {
        const aInRange = a.semesterNumber != null && a.semesterNumber >= semMin && a.semesterNumber <= semMax
        const bInRange = b.semesterNumber != null && b.semesterNumber >= semMin && b.semesterNumber <= semMax
        if (aInRange && !bInRange) return -1
        if (!aInRange && bInRange) return 1
        return (a.semesterNumber ?? 99) - (b.semesterNumber ?? 99)
      })
    }

    // Fetch GE courses early so we can use them to fill the schedule
    const geCtx = payload.studentId
      ? await fetchFreeElectiveOptions({
          studentId: payload.studentId,
          isInternational: payload.session?.isInternational,
          scholarshipType: payload.session?.scholarshipType,
          scholarshipMinGpa: payload.session?.scholarshipMinGpa,
          scholarshipMinCreditsPerYear: payload.session?.scholarshipMinCreditsPerYear,
        }).catch(() => null)
      : null

    // ── Build the suggested schedule ──────────────────────────────────────────
    // When the student didn't ask for a specific count, pre-compute a balanced
    // schedule so the LLM receives a ready-made list, not raw data to reason about.
    // Required courses come first; GE options fill remaining slots.
    const requestedCreditTarget = extractRequestedCreditTarget(question)
    const CREDIT_CAP = 19

    // Remaining semester capacity after pre-registered courses — must never exceed this
    const preRegisteredCreditsUpcoming = termSplit?.upcomingRegistered?.reduce((s, c) => s + c.creditHours, 0) ?? 0
    const semesterCapacityRemaining = Math.max(0, CREDIT_CAP - preRegisteredCreditsUpcoming)
    const hasPreRegisteredCourses = preRegisteredCreditsUpcoming > 0

    // TARGET_CREDITS is a soft ceiling, not an exact fill goal.
    // We want to suggest the best course(s) that fit — not hunt for a perfect credit-count match.
    // Using semesterCapacityRemaining as a hard cap here would force 4-credit hunts
    // when a 3-credit course is the clearly better choice and leaves 1 credit unused.
    const TARGET_CREDITS = requestedCreditTarget != null
      ? Math.min(requestedCreditTarget, semesterCapacityRemaining)
      : hasPreRegisteredCourses
        ? semesterCapacityRemaining          // cap; scheduler stops once ≥1 good course fits
        : 12                                 // default full-semester suggestion

    let scheduleLines: string[]

    if (requestedCourseCount) {
      // Student was explicit about number of courses — build a list that hits the count.
      const perCreditMatch = question.match(/\b(\d+)\s+credits?\s+each\b/i)
      const preferredCredits = perCreditMatch ? parseInt(perCreditMatch[1], 10) : null

      // For small incremental requests ("one more course"), exclude courses already shown
      // in recent conversation history so we suggest genuinely new options.
      const historyCodes = requestedCourseCount <= 3
        ? history
            .filter((m) => m.role === "assistant")
            .slice(-3)
            .reduce((acc, m) => { extractCourseCodesFromText(m.content).forEach((c) => acc.add(c)); return acc }, new Set<string>())
        : new Set<string>()

      const pool = [...recommendation.eligibleNow].filter((c) => !historyCodes.has(c.courseId))
      // Use actual pre-registered credits from termSplit as baseline for gap math.
      // Fall back to history-extracted total only when termSplit isn't available.
      const actualPreRegisteredCredits = termSplit?.upcomingRegistered?.reduce((s, c) => s + c.creditHours, 0) ?? null
      const currentCredits = actualPreRegisteredCredits != null
        ? actualPreRegisteredCredits
        : (historyCodes.size > 0 ? extractHistoryCreditTotal(history) : 12)
      const gapCredits = requestedCreditTarget && requestedCourseCount === 1
        ? Math.max(1, Math.min(6, requestedCreditTarget - currentCredits))
        : null
      const effectivePreferred = preferredCredits ?? gapCredits

      if (effectivePreferred) pool.sort((a, b) =>
        (a.creditHours === effectivePreferred ? -1 : 1) - (b.creditHours === effectivePreferred ? -1 : 1)
      )

      const selected: Array<{ code: string; title: string; credits: number; tag: string }> = []
      for (const c of pool) {
        if (selected.length >= requestedCourseCount) break
        if (!effectivePreferred || c.creditHours === effectivePreferred) {
          const displayCode = LEGACY_TO_AAMU_CODE[c.courseId.trim().toUpperCase()] ?? c.courseId
          selected.push({ code: displayCode, title: c.title, credits: c.creditHours, tag: c.semesterLabel })
        }
      }
      // Relax credit-size filter if still short — but honour explicit per-course credit constraint
      if (selected.length < requestedCourseCount) {
        for (const c of pool) {
          if (selected.length >= requestedCourseCount) break
          const displayCode = LEGACY_TO_AAMU_CODE[c.courseId.trim().toUpperCase()] ?? c.courseId
          if (selected.find((s) => s.code === displayCode)) continue
          // When student explicitly specified credits-per-course, keep that hard constraint
          if (perCreditMatch && c.creditHours !== preferredCredits) continue
          selected.push({ code: displayCode, title: c.title, credits: c.creditHours, tag: c.semesterLabel })
        }
      }
      // Fill from GE courses if still short
      if (selected.length < requestedCourseCount && geCtx && geCtx.availableCourses.length > 0) {
        const isMathGE = (code: string) => /^MA[TH] /i.test(code)
        const geSorted = [...geCtx.availableCourses]
          .filter((ge) => !historyCodes.has(ge.course_code))
          .sort((a, b) => {
            if (effectivePreferred) {
              // When a credit size is requested, match it first; math still goes last within tier
              const aMatch = a.credit_hours === effectivePreferred ? 0 : 1
              const bMatch = b.credit_hours === effectivePreferred ? 0 : 1
              if (aMatch !== bMatch) return aMatch - bMatch
            }
            // Non-math before math; closest to 3 credits first (avoids 1-credit labs)
            const aMath = isMathGE(a.course_code) ? 1 : 0
            const bMath = isMathGE(b.course_code) ? 1 : 0
            if (aMath !== bMath) return aMath - bMath
            const distDiff = Math.abs(a.credit_hours - 3) - Math.abs(b.credit_hours - 3)
            if (distDiff !== 0) return distDiff
            return a.course_code.localeCompare(b.course_code)
          })
        for (const ge of geSorted) {
          if (selected.length >= requestedCourseCount) break
          if (selected.find((s) => s.code === ge.course_code)) continue
          // When student explicitly specified credits-per-course, keep that hard constraint
          if (perCreditMatch && ge.credit_hours !== preferredCredits) continue
          selected.push({ code: ge.course_code, title: ge.course_title, credits: ge.credit_hours, tag: `GE – ${ge.area_name}` })
        }
      }

      const addedCredits = selected.reduce((s, c) => s + c.credits, 0)
      const isIncremental = requestedCourseCount <= 2 && historyCodes.size > 0
      scheduleLines = selected.map((c) => `- ${c.code}: ${c.title} (${c.credits} cr) [${c.tag}]`)
    } else {
      // Default: fill to TARGET_CREDITS.
      // Order of preference: (1) current-code required courses, (2) GE, (3) legacy-code required courses.
      // Legacy-code courses (e.g. MAT 147) are DB artifacts from older catalogs; AAMU uses MTH codes.
      // Preferring GE over them avoids surfacing confusing non-AAMU course codes to students.
      const selected: Array<{ code: string; title: string; credits: number; tag: string }> = []
      let total = 0

      // Partition eligibleNow: current-code courses first, legacy-code courses set aside
      const legacyEligible: typeof recommendation.eligibleNow = []
      for (const c of recommendation.eligibleNow) {
        if (total >= TARGET_CREDITS) break
        if (LEGACY_TO_AAMU_CODE[c.courseId.trim().toUpperCase()]) {
          legacyEligible.push(c)
          continue
        }
        if (total + c.creditHours <= CREDIT_CAP) {
          selected.push({ code: c.courseId, title: c.title, credits: c.creditHours, tag: c.semesterLabel })
          total += c.creditHours
        }
      }

      // Fill with GE courses before falling back to legacy-code required courses.
      if (total < TARGET_CREDITS && geCtx && geCtx.availableCourses.length > 0) {
        const isMathGE = (code: string) => /^MA[TH] /i.test(code)
        const distFrom3 = (cr: number) => Math.abs(cr - 3)
        const geSorted = [...geCtx.availableCourses].sort((a, b) => {
          const aMath = isMathGE(a.course_code) ? 1 : 0
          const bMath = isMathGE(b.course_code) ? 1 : 0
          if (aMath !== bMath) return aMath - bMath
          const distDiff = distFrom3(a.credit_hours) - distFrom3(b.credit_hours)
          if (distDiff !== 0) return distDiff
          return a.course_code.localeCompare(b.course_code)
        })

        if (selected.length === 0) {
          // Near-graduation: pick one 3-credit non-math course from each distinct GE area
          // so the student sees diverse options (not a cluster of ANT/ARB/ART).
          const areasSeen = new Set<string>()
          const geOptions: typeof selected = []
          // Pass 1: one per area, 3-credit non-math only
          for (const ge of geSorted) {
            if (geOptions.length >= 5) break
            if (ge.credit_hours !== 3 || isMathGE(ge.course_code)) continue
            if (ge.credit_hours > semesterCapacityRemaining) continue
            if (areasSeen.has(ge.area_code)) continue
            geOptions.push({ code: ge.course_code, title: ge.course_title, credits: ge.credit_hours, tag: `GE – ${ge.area_name}` })
            areasSeen.add(ge.area_code)
          }
          // Pass 2: fill remaining slots if fewer than 5 distinct areas available
          for (const ge of geSorted) {
            if (geOptions.length >= 5) break
            if (ge.credit_hours > semesterCapacityRemaining) continue
            if (geOptions.find((c) => c.code === ge.course_code)) continue
            geOptions.push({ code: ge.course_code, title: ge.course_title, credits: ge.credit_hours, tag: `GE – ${ge.area_name}` })
          }
          selected.push(...geOptions)
        } else {
          // Required courses already selected — add ONE best GE filler.
          // A 3-credit course at 18/19 is fine; no need to hunt for an exact fill.
          const bestGe = geSorted.find((ge) => ge.credit_hours === 3 && total + ge.credit_hours <= CREDIT_CAP)
            ?? geSorted.find((ge) => total + ge.credit_hours <= CREDIT_CAP)
          if (bestGe) {
            selected.push({ code: bestGe.course_code, title: bestGe.course_title, credits: bestGe.credit_hours, tag: `GE – ${bestGe.area_name}` })
            total += bestGe.credit_hours
          }
        }
      }

      // Last resort: legacy-code courses, translated to current AAMU codes for display
      if (total < TARGET_CREDITS) {
        for (const c of legacyEligible) {
          if (total >= TARGET_CREDITS) break
          if (total + c.creditHours <= CREDIT_CAP) {
            const displayCode = LEGACY_TO_AAMU_CODE[c.courseId.trim().toUpperCase()] ?? c.courseId
            selected.push({ code: displayCode, title: c.title, credits: c.creditHours, tag: c.semesterLabel })
            total += c.creditHours
          }
        }
      }

      scheduleLines = selected.map((c) => `- ${c.code}: ${c.title} (${c.credits} cr) [${c.tag}]`)
    }

    const filteredRecommendation = recommendation

    const planningContext = buildNextCoursesContext(filteredRecommendation, classification, termSplit, degreeSummaryData?.summary?.credits_applied ?? 0)
    const degreeWorksNeedsBlock = degreeSummaryData
      ? "\n\n" + formatDegreeWorksNeeds(degreeSummaryData)
      : ""

    // Map DegreeWorks incomplete blocks for labeling recommendations
    const blockNeedsMap = new Map<string, number>()
    if (degreeSummaryData?.blocks) {
      for (const block of degreeSummaryData.blocks) {
        if (block.status !== "complete" && block.credits_required != null) {
          const needed = (block.credits_required ?? 0) - (block.credits_applied ?? 0)
          if (needed > 0) blockNeedsMap.set(block.block_name, needed)
        }
      }
    }

    // ── Build the course list from code so the LLM cannot rename or hallucinate courses ──
    // GPT models substitute AAMU-specific codes (e.g. MTH 125 → MAT 147) based on training
    // knowledge. The only reliable fix is to generate the course list in code and ask the LLM
    // only for a brief conversational intro.
    const termLabelForSchedule = (() => {
      if (termSplit?.upcomingRegistered?.length) {
        const first = termSplit.upcomingRegistered[0]
        if ("term" in first && (first as any).term) return (first as any).term as string
      }
      if (termSplit?.currentTerm) return termSplit.currentTerm
      return "next semester"
    })()

    const allGE = scheduleLines.length > 0 && scheduleLines.every((l) => l.includes("[GE –"))

    const formattedCourseLines = scheduleLines.map(line =>
      line
        .replace(/^- /, "")
        .replace(/ \((\d+) cr\)\s*\[.*?\]$/, " ($1 credits)")
        .replace(/ \((\d+) cr\)$/, " ($1 credits)")
    )

    const addedCredits = scheduleLines.reduce((s, l) => {
      const m = l.match(/\((\d+) cr\)/)
      return s + (m ? parseInt(m[1]) : 0)
    }, 0)

    // ── Code-generated schedule block ───────────────────────────────────────
    let codeScheduleBlock: string

    if (hasPreRegisteredCourses) {
      // Show what's already registered, then what can be added
      const preRegLines = (termSplit?.upcomingRegistered ?? []).map(
        (c) => `- ${c.code}: ${c.title} (${c.creditHours} credits)`
      )

      const preRegSection = `**Already registered for ${termLabelForSchedule} (${preRegisteredCreditsUpcoming} credits):**\n${preRegLines.join("\n")}`

      const capacityLine = semesterCapacityRemaining === 0
        ? `\n\n**You're at the 19-credit cap for ${termLabelForSchedule}.** To add any course you'd need to drop one first.`
        : `\n\n**Remaining capacity: ${semesterCapacityRemaining} credits** (AAMU max is 19 per semester)`

      const totalAfterAdding = preRegisteredCreditsUpcoming + addedCredits
      const addSection = formattedCourseLines.length > 0
        ? allGE
          // GE-choice mode: bullet list of options — no combined credit total (student picks ONE)
          ? `\n\n**General Education options you could add (each is ${semesterCapacityRemaining >= 3 ? "3" : semesterCapacityRemaining} credits):**\n\n${formattedCourseLines.map((l) => `- ${l}`).join("\n")}\n\nLet me know if any of these work, or say "show me more" for a different set!`
          : `\n\n**Courses you could add (${addedCredits} credit${addedCredits !== 1 ? "s" : ""}):**\n${formattedCourseLines.map((l) => `- ${l}`).join("\n")}\n\n**Total after adding: ${totalAfterAdding} credits** (${CREDIT_CAP - totalAfterAdding} credit${CREDIT_CAP - totalAfterAdding !== 1 ? "s" : ""} still available).`
        : semesterCapacityRemaining > 0
          ? `\n\nNo required courses fit within your remaining ${semesterCapacityRemaining} credits right now — you might consider a General Education elective to fill the gap.`
          : ""

      codeScheduleBlock = `\n\n${preRegSection}${capacityLine}${addSection}\n\nContact your advisor to confirm availability before registering.`
    } else {
      // No pre-registered courses — show a full semester recommendation
      const scheduleSection = formattedCourseLines.length > 0
        ? `**Recommended courses for ${termLabelForSchedule}:**\n\n${formattedCourseLines.join("\n")}\n\n**Total: ${addedCredits} credits.**`
        : "No eligible required courses found — all may be completed or blocked by prerequisites."
      codeScheduleBlock = `\n\n${scheduleSection}\n\nContact your advisor to confirm availability before registering.`
    }

    // Ask LLM for ONLY a brief conversational intro; no course listing, no course codes
    const hasCapacity = semesterCapacityRemaining > 0 && hasPreRegisteredCourses
    const atCap = semesterCapacityRemaining === 0 && hasPreRegisteredCourses
    const advisoryContext = `${studentContextBlock}${degreeSummaryBlock ? degreeSummaryBlock + "\n\n" : ""}${planningContext}${degreeWorksNeedsBlock}

IMPORTANT: The course schedule has already been generated and will be shown below your response. Do NOT list any courses yourself and do NOT include any course codes. Write ONLY 1–2 sentences:
${hasPreRegisteredCourses
  ? atCap
    ? `The student is already at the 19-credit cap. Acknowledge this warmly and ask if they want to swap a course or adjust their plan.`
    : allGE
      ? `The student has ${preRegisteredCreditsUpcoming} credits pre-registered for ${termLabelForSchedule} and all their required courses are covered. Write 1–2 sentences: acknowledge what they already have registered (name 2–3 courses), say their required courses are all set, and invite them to pick one of the General Education options below to fill the remaining ${semesterCapacityRemaining} credits. Do NOT say "Here are the options" — the list follows automatically.`
      : `The student has ${preRegisteredCreditsUpcoming} credits registered. Acknowledge that, mention they have ${semesterCapacityRemaining} credits of space, and invite them to confirm if they want to add from the suggestions or have a different goal (e.g. lighter load, specific type of course).`
  : `Introduce the recommended schedule for ${termLabelForSchedule}. One sentence only.`
}
Do NOT add a "Verify availability" line — it's already included.`

    const llmIntro = await generateDbResponse(question, advisoryContext, history)

    const answer = llmIntro.trim() + codeScheduleBlock

    return {
      mode: "DB_ONLY",
      answer,
      data: filteredRecommendation,
    }
  }

  if (!programCode) {
    const answer = await generateDbResponse(
      question,
      "Available data: Structured program curriculum data requires a program code (e.g., BSCS-BS)",
      history
    )
    return {
      mode: "DB_ONLY",
      answer,
      data: null,
    }
  }

  const [overview, curriculum] = await Promise.all([
    fetchProgramOverview(programCode, catalogYear),
    fetchCurriculumContext(programCode, catalogYear),
  ])

  if (!overview || !curriculum) {
    const answer = await generateDbResponse(
      question,
      `Program Code: ${programCode}\nCatalog Year: ${catalogYear ?? "latest"}\nStatus: Curriculum data not found`,
      history
    )
    return {
      mode: "DB_ONLY",
      answer,
      data: { programCode },
    }
  }

  const asksSummary = /summary|overview|program|curriculum|degree progress|remaining credit|credits?/i.test(
    normalizedQuestion
  )

  if (asksSummary) {
    const curriculumContext = formatCurriculumForLLM(overview, curriculum)
    const answer = await generateDbResponse(question, curriculumContext, history)

    return {
      mode: "DB_ONLY",
      answer,
      data: {
        overview,
        curriculumText: curriculum.formattedText,
      },
    }
  }

  const curriculumContext = formatCurriculumForLLM(overview, curriculum)
  const answer = await generateDbResponse(
    question,
    `${curriculumContext}\n\nYou can ask about:\n- Specific courses and their prerequisites\n- Program credit requirements\n- Semester course layout\n- Elective slots and requirements`,
    history
  )

  return {
    mode: "DB_ONLY",
    answer,
    data: {
      overview,
    },
  }
}

/**
 * Handle RAG_ONLY queries — bulletin and policies
 */
async function handleRagOnly(payload: ChatQueryRequest): Promise<Record<string, unknown>> {
  const history = payload.conversationHistory ?? []

  // SAP / 67% completion rate — provide accurate hardcoded answer so "attempted" always appears
  if (/(67\s*%|67\s+percent|\bcompletion\s+rate\b|\bsatisfactory\s+academic\s+progress\b)/i.test(payload.question)
    || (/\bsap\b/i.test(payload.question) && /\b(financial\s*aid|rule|percent|completion)\b/i.test(payload.question))) {
    const sapContext = `SAP (Satisfactory Academic Progress) — 67% Completion Rate Rule:

Students must successfully complete at least 67% of all credit hours ATTEMPTED each academic year to maintain federal financial aid eligibility.

Key terms:
- Hours ATTEMPTED: every credit you enroll in, including courses you withdraw from (W grades count as attempted but NOT earned)
- Hours EARNED: only grades D or better count as earned
- Completion rate = earned hours ÷ attempted hours

Example: If you attempted 30 credits but earned only 18 → completion rate = 60% → BELOW the 67% minimum → financial aid at risk.

Consequences:
1. First violation → Financial Aid Warning (still receive aid, but on notice)
2. Second violation → Financial Aid Suspension (lose federal aid)
3. Can appeal for Financial Aid Probation with an academic improvement plan approved by Financial Aid

Why this matters for withdrawals: Every W grade adds to attempted hours without adding to earned hours, directly lowering your completion rate.

Instruction: Explain the 67% rule clearly. Emphasize that "attempted" means all credits enrolled (including withdrawals). Show the completion rate formula. Mention that W grades count as attempted but not earned.`

    return {
      mode: "DB_ONLY",
      answer: await generateDbResponse(payload.question, sapContext, history),
      data: null,
    }
  }

  const userProfile = payload.studentId
    ? await fetchUserAcademicProfile(payload.studentId).catch(() => null)
    : null

  const bulletinYear = payload.session?.bulletinYear ?? userProfile?.bulletinYear ?? "2025-2026"
  const classification = payload.session?.classification ?? userProfile?.classification ?? null
  const studentContextBlock = buildStudentContextBlock({
    programCode: payload.session?.programCode ?? userProfile?.programCode ?? null,
    bulletinYear,
    classification,
  })

  const chunks = await searchBulletin(
    payload.question,
    { bulletinYear, classification, programCode: payload.session?.programCode ?? userProfile?.programCode ?? null },
    { matchCount: 5 }
  )

  const answer = await generateRagResponse(payload.question, chunks, studentContextBlock, history)

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
  const history = payload.conversationHistory ?? []
  const userProfile = payload.studentId
    ? await fetchUserAcademicProfile(payload.studentId).catch(() => null)
    : null
  const bulletinYear = payload.session?.bulletinYear ?? userProfile?.bulletinYear ?? "2025-2026"
  const classification = payload.session?.classification ?? userProfile?.classification ?? null
  const catalogYear = resolveCatalogYearFromQuestion(payload.question, bulletinYear)
  const programCode = await resolveProgramCodeFromQuestion(
    payload.question,
    payload.session?.programCode ?? userProfile?.programCode ?? null,
    catalogYear
  )

  const studentContextBlock = buildStudentContextBlock({
    programCode,
    bulletinYear,
    classification,
  })

  // If asking about a specific course, fetch its details to ensure credit hours appear in context
  const hybridCourseCode = extractCourseCodeFromQuestion(payload.question)
  const courseInfoPromise = hybridCourseCode
    ? fetchCourseInfo(hybridCourseCode).catch(() => null)
    : Promise.resolve(null)

  // Run bulletin search and curriculum fetch in parallel
  const [chunks, curriculum, courseInfo] = await Promise.all([
    searchBulletin(payload.question, { bulletinYear, classification, programCode }, { matchCount: 5 }),
    programCode ? fetchCurriculumContext(programCode, catalogYear) : Promise.resolve(null),
    courseInfoPromise,
  ])

  const courseInfoBlock = courseInfo
    ? `\nCourse on record: ${courseInfo.courseId} — ${courseInfo.title} (${courseInfo.creditHours} credits)\n`
    : ""

  const answer = await generateHybridResponse(
    payload.question,
    chunks,
    (courseInfoBlock + (curriculum?.formattedText ?? "")).trim() || null,
    studentContextBlock,
    history
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
  const decision = await decideRoute(payload)
  const intent = decision.matchedRules[0]?.reason.replace("Classified as ", "") ?? ""

  let handlerResult: Record<string, unknown>
  if (decision.route === "DB_ONLY") {
    handlerResult = await handleDbOnly(payload, intent)
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
