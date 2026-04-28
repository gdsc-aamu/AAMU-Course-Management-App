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
  fetchConcentrationRequirements,
  formatConcentrationForLLM,
  fetchFreeElectiveOptions,
  formatFreeElectivesForLLM,
  AAMU_SCHOLARSHIP_RULES,
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

  return `AAMU Semester Credit Cap: ${rec.semesterCreditCap} credits max per semester (dean approval required to exceed)
Program: ${rec.programCode} | Catalog Year: ${rec.catalogYear ?? "latest"}${classification ? ` | Classification: ${classification}` : ""}
Completed Courses: ${rec.completedCount}

${enrolledSection}

— Eligible to Add (prerequisites met, not yet registered) —
${eligibleLines}

— Blocked (prerequisites not yet satisfied) —
${blockedLines}${classificationAdvisory}`
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
  const isFreeElectiveQuery = intent === "FREE_ELECTIVE"       || (asksFreeElectiveQuestion(question) && intent !== "ELECTIVES")
  const isElectiveQuery     = intent === "ELECTIVES"          || (asksElectiveQuestion(question) && intent !== "FREE_ELECTIVE")
  const isConcentrationQuery = intent === "CONCENTRATION"     || asksConcentrationQuestion(question)
  const isSimulateQuery     = intent === "SIMULATE"           || asksSimulateQuestion(question)
  const isSavePlanQuery     = intent === "SAVE_PLAN"          || asksSavePlanQuestion(question)
  const isLowConfidence     = intent === "ADVISOR_ESCALATE"   || isLowConfidenceQuestion(question)
  const requestedCourseCount = extractRequestedCourseCount(question)

  const SETUP_NEEDED_MESSAGE = `To answer questions about your specific courses and schedule, I need two things set up in your profile:

1. **Upload your DegreeWorks PDF** — Go to Settings → Degree Works Integration and upload your audit PDF. This syncs all your completed and in-progress courses automatically.
2. **Set your major and catalog year** — In Settings → Academic Profile, click "Edit Profile" to select your program and catalog year.

Once those are done, I can tell you exactly what courses to register for next, what you've completed, and how close you are to graduating.`

  // Greetings and small talk — respond directly unless it's an identity question or a follow-up reply
  if (intent === "CHITCHAT") {
    const isIdentityQuestion = /\b(my name|who am i|what.*my name|tell me.*my name)\b/i.test(question)

    // Short affirmative/negative/follow-up words should never hit the generic greeting —
    // always route them through the LLM so it can respond in context
    const isShortFollowUp = /^(yes|no|sure|ok|okay|yep|nope|yeah|nah|alright|of course|definitely|absolutely|correct|right|exactly|please|go ahead|tell me|show me|and|also|what about|so|then|more|more info|more details|why|how|when|what else|anything else|what now)[\s!?.]*$/i.test(question)

    if (!isIdentityQuestion && !isShortFollowUp) {
      const greeting = studentName ? `Hey ${studentName.split(" ")[0]}!` : "Hey!"
      return {
        mode: "DB_ONLY",
        answer: `${greeting} I'm your AAMU course advisor. Ask me anything about your courses, what you need to graduate, prerequisites, or what to register for next semester.`,
        data: null,
      }
    }
    if (isShortFollowUp) {
      // Use LLM to continue the conversation naturally from history context
      const answer = await generateDbResponse(question, studentContextBlock + degreeSummaryBlock, history)
      return { mode: "DB_ONLY", answer, data: null }
    }
    // Identity questions fall through to generateDbResponse with student context
  }

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
      scholarshipContext += `- ${name}: ${req.minGpa} GPA minimum, ${req.minCreditsPerYear} credits/year\n`
    }

    if (rule && scholarshipType) {
      scholarshipContext += `\nThis student's scholarship: ${scholarshipType}\nRenewal requirements: ${rule.minGpa} GPA minimum and ${rule.minCreditsPerYear} credit hours per academic year (at least 15 per semester).`
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

    const degreeworksNote = degreeSummaryBlock
      ? `\n\nInstruction: The Degree Progress Summary above is from the student's DegreeWorks audit — use it for the headline numbers (progress %, GPA, credits applied/remaining). For listing remaining courses, use ONLY the 'Remaining Curriculum' section below — it is live-computed and already excludes courses the student is currently enrolled in. Do NOT re-list courses from the 'Still Needed' block in the degree summary.${timelineLine} When the student asks about graduation timeline or whether they are on track: use the timeline math above to give a clear, encouraging, personalized answer. If avg credits needed ≤ 15 they are comfortably on track; if 15–19 they are on track but need to stay focused; if > 19 they may need summer courses or an extra semester. Be warm and specific — mention their actual numbers. If the question is only about GPA, answer just that without listing remaining courses. If the student hasn't confirmed a graduation target, ask: "Are you aiming to graduate in ${targetGradYear ?? "4 years"}?"`
      : `\n\nInstruction: List what courses are still needed by semester, grouping by Fall vs Spring based on the [offered X] label on each course. Include credit totals.${timelineLine}`
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
    const electivesText = formatFreeElectivesForLLM(ctx)
    const instructionNote = requestedCourseCount
      ? `\n\nInstruction: The student asked for ${requestedCourseCount} specific course suggestions. Choose exactly ${requestedCourseCount} from the available courses above — pick the best fit for this student's year and major. Do NOT list every available course. For each recommendation give one sentence explaining why it is a good choice. Use a numbered list. Include course code and credit hours. If scholarship or international rules apply, add a one-line note at the end.`
      : `\n\nInstruction: From the available courses above, recommend exactly 3–4 that are the best fit for this student's situation. Do NOT list every course or group by area — just pick the top options. For each, write one sentence explaining why it is a good pick (e.g. counts toward graduation, high-interest, manageable workload). Include course code and credit hours. If scholarship or international credit rules apply, add a brief note. End with: "Verify availability with the AAMU Registrar before registering."`
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
        ? `Available Concentrations/Minors for ${programCode}:\n${concList}\n\nInstruction: List the available concentrations/minors. Ask the student which one they are interested in. Tell them they can declare it in Settings → Academic Profile.`
        : `The student asked about concentration/minor requirements but has not declared one.\n\nInstruction: Acknowledge no concentration is declared. Ask which concentration or minor they are interested in. Tell them to set it in Settings → Academic Profile so the advisor can give personalized requirements.`
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
    const TARGET_CREDITS = requestedCreditTarget ?? 12
    const CREDIT_CAP = 19

    let scheduleLines: string[]
    let scheduleNote: string

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
          selected.push({ code: c.courseId, title: c.title, credits: c.creditHours, tag: c.semesterLabel })
        }
      }
      // Relax credit-size filter if still short — but honour explicit per-course credit constraint
      if (selected.length < requestedCourseCount) {
        for (const c of pool) {
          if (selected.length >= requestedCourseCount) break
          if (selected.find((s) => s.code === c.courseId)) continue
          // When student explicitly specified credits-per-course, keep that hard constraint
          if (perCreditMatch && c.creditHours !== preferredCredits) continue
          selected.push({ code: c.courseId, title: c.title, credits: c.creditHours, tag: c.semesterLabel })
        }
      }
      // Fill from GE courses if still short
      if (selected.length < requestedCourseCount && geCtx && geCtx.availableCourses.length > 0) {
        const geSorted = [...geCtx.availableCourses]
          .filter((ge) => !historyCodes.has(ge.course_code))
          .sort((a, b) =>
            effectivePreferred
              ? (a.credit_hours === effectivePreferred ? -1 : 1) - (b.credit_hours === effectivePreferred ? -1 : 1)
              : b.credit_hours - a.credit_hours
          )
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
      scheduleNote = isIncremental
        ? `\nIMPORTANT: The student is ADDING to an existing schedule. Their current pre-registered total is ${currentCredits} credits. Present ONLY the ${selected.length} new course(s) below — do NOT re-list courses already mentioned in this conversation. State the credit hours of the new course and confirm the new total: "This adds ${addedCredits} credits, bringing your total to ${currentCredits + addedCredits} credits." End with: "Verify availability with the AAMU Registrar before registering."`
        : `\nIMPORTANT: The student asked for exactly ${requestedCourseCount} courses${effectivePreferred ? ` (preferring ${effectivePreferred}-credit courses)` : ""}. Present EVERY course listed above — all ${selected.length}. List each with course code, title, and credit hours. Total credits: ${addedCredits} cr. End with: "Verify availability with the AAMU Registrar before registering."`
    } else {
      // Default: fill to TARGET_CREDITS using required courses first, then GE options
      const selected: Array<{ code: string; title: string; credits: number; tag: string }> = []
      let total = 0

      for (const c of recommendation.eligibleNow) {
        if (total >= TARGET_CREDITS) break
        if (total + c.creditHours <= CREDIT_CAP) {
          selected.push({ code: c.courseId, title: c.title, credits: c.creditHours, tag: c.semesterLabel })
          total += c.creditHours
        }
      }

      // Fill with GE courses if still under target
      if (total < TARGET_CREDITS && geCtx && geCtx.availableCourses.length > 0) {
        // Prefer 3-credit courses; sort descending by credit_hours then alphabetically
        const geSorted = [...geCtx.availableCourses].sort(
          (a, b) => b.credit_hours - a.credit_hours || a.course_code.localeCompare(b.course_code)
        )
        for (const ge of geSorted) {
          if (total >= TARGET_CREDITS) break
          if (total + ge.credit_hours <= CREDIT_CAP) {
            selected.push({ code: ge.course_code, title: ge.course_title, credits: ge.credit_hours, tag: `GE – ${ge.area_name}` })
            total += ge.credit_hours
          }
        }
      }

      scheduleLines = selected.map((c) => `- ${c.code}: ${c.title} (${c.credits} cr) [${c.tag}]`)
      const scheduleTotalCredits = selected.reduce((s, c) => s + c.credits, 0)
      scheduleNote = requestedCreditTarget
        ? `\nIMPORTANT: The student asked for a ${requestedCreditTarget}-credit schedule. This schedule totals ${scheduleTotalCredits} credits. Lead your response with: "Here is your ${scheduleTotalCredits}-credit schedule for next semester:" Present EVERY course listed — do not drop any. List each with course code, title, and credit hours. End with: "Verify availability with the AAMU Registrar before registering."`
        : `\nIMPORTANT: Present EVERY course listed in the "Suggested Schedule for Next Semester" section above — do not drop any of them. List each with its course code, title, and credit hours. Do NOT add courses not in that list. If the student wants more or fewer courses, acknowledge and adjust from the eligible list. End with: "Verify availability with the AAMU Registrar before registering."`
    }

    const filteredRecommendation = recommendation

    const enrollmentGuard = `\nCRITICAL: Any course in "Currently Enrolled" or "Pre-Registered" sections is already on the student's schedule — never recommend it. Only recommend courses from the Suggested Schedule below. If the degree summary says a course is "still needed" but it appears enrolled/pre-registered, the summary is stale — trust the enrolled list.`

    const planningContext = buildNextCoursesContext(filteredRecommendation, classification, termSplit, degreeSummaryData?.summary?.credits_applied ?? 0)
    const degreeWorksNeedsBlock = degreeSummaryData
      ? "\n\n" + formatDegreeWorksNeeds(degreeSummaryData)
      : ""

    const suggestedScheduleBlock = scheduleLines.length > 0
      ? `\n\n— Suggested Schedule for Next Semester —\n${scheduleLines.join("\n")}`
      : ""

    const answer = await generateDbResponse(
      question,
      `${studentContextBlock}${degreeSummaryBlock ? degreeSummaryBlock + "\n\n" : ""}${planningContext}${degreeWorksNeedsBlock}${suggestedScheduleBlock}${scheduleNote}${enrollmentGuard}`,
      history
    )

    return {
      mode: "DB_ONLY",
      answer,
      data: filteredRecommendation,
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

    // Format prerequisite data for the LLM
    const prereqContext = formatPrerequisiteForLLM(prereq)
    const answer = await generateDbResponse(question, prereqContext, history)

    return {
      mode: "DB_ONLY",
      answer,
      data: prereq,
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

  // Run bulletin search and curriculum fetch in parallel
  const [chunks, curriculum] = await Promise.all([
    searchBulletin(payload.question, { bulletinYear, classification, programCode }, { matchCount: 5 }),
    programCode ? fetchCurriculumContext(programCode, catalogYear) : Promise.resolve(null),
  ])

  const answer = await generateHybridResponse(
    payload.question,
    chunks,
    curriculum?.formattedText ?? null,
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
