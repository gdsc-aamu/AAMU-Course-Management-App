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
} from "@/backend/services/curriculum/service"
import {
  fetchUserCompletedCourses,
  fetchUserInProgressCourses,
} from "@/backend/services/pdf-parsing/service"
import { fetchUserAcademicProfile } from "@/backend/services/user-profile/service"
import {
  fetchFullDegreeSummary,
  formatDegreeSummaryForLLM,
} from "@/backend/services/degree-summary/service"

function asksPrerequisiteQuestion(question: string): boolean {
  return /(prereq|pre-?req|pre requisite|pre-requisite|prerequisite|prerequisites|need before|required before|eligib(le|ility) for)/i.test(
    question
  )
}

function asksNextCoursesQuestion(question: string): boolean {
  return /(what\s+should\s+i\s+take\s+next|next\s+courses?|courses?\s+i\s+need\s+next|what\s+courses?\s+can\s+i\s+take|register\s+for\s+next|what\s+should\s+i\s+register|courses?\s+(for|to\s+take)\s+next\s+semester|next\s+semester|planning\s+my\s+schedule|what\s+(to\s+take|should\s+i\s+take)\s+(this|next)\s+(spring|fall|summer)|semester\s+plan|what\s+can\s+i\s+register)/i.test(
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

function asksFreeElectiveQuestion(question: string): boolean {
  return /\b(free elective|elective|GE course|general education|PE course|physical education|recreational|golf|swimming|tennis|bowling|badminton|what (should|can) I take|need.*credits?|credits? (left|remaining|needed))\b/i.test(question)
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

const CLASSIFICATION_MAX_SEMESTER: Record<string, number> = {
  freshman: 2, sophomore: 4, junior: 6, senior: 8,
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
  if (profile.isInternational) parts.push("International student: must maintain 12+ credits/semester (9 in-person)")
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
}): string {
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

  let classificationAdvisory = ""
  if (classification) {
    const classKey = classification.toLowerCase()
    const maxSem = CLASSIFICATION_MAX_SEMESTER[classKey]
    if (maxSem) {
      const beyondClass = rec.eligibleNow.filter((c) => (c.semesterNumber ?? 0) > maxSem)
      if (beyondClass.length > 0) {
        const beyondList = beyondClass.map((c) => `${c.courseId} (${c.semesterLabel})`).join(", ")
        classificationAdvisory = `\n\n⚠️ Classification Advisory: The student is a ${classification}. The following courses are in the eligible list but designated for a later semester than their current classification: ${beyondList}. Prerequisites are met, but do NOT recommend these as standard next-semester options. Instead, note that they are technically eligible but typically taken later, and suggest the student confirm with their advisor. Always prioritize GE courses and elective options before these.`
      }
    }
  }

  return `AAMU Semester Credit Cap: ${rec.semesterCreditCap} credits max per semester (dean approval required to exceed)
${classification ? `Student Classification: ${classification}\n` : ""}Program: ${rec.programCode} | Catalog Year: ${rec.catalogYear ?? "latest"}
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

/**
 * Handle DB_ONLY queries — curriculum and course prerequisites
 */
async function handleDbOnly(payload: ChatQueryRequest, intent = ""): Promise<Record<string, unknown>> {
  const history = payload.conversationHistory ?? []
  const question = payload.question.trim()

  // Fetch user profile and degree summary in parallel
  const [userProfile, degreeSummaryData] = await Promise.all([
    payload.studentId
      ? fetchUserAcademicProfile(payload.studentId).catch(() => null)
      : Promise.resolve(null),
    payload.studentId
      ? fetchFullDegreeSummary(payload.studentId).catch(() => null)
      : Promise.resolve(null),
  ])

  const degreeSummaryBlock = degreeSummaryData
    ? formatDegreeSummaryForLLM(degreeSummaryData)
    : ""

  const classification = payload.session?.classification ?? userProfile?.classification ?? null
  const fallbackBulletinYear = payload.session?.bulletinYear ?? userProfile?.bulletinYear ?? null
  const studentName = payload.session?.studentName ?? null
  const studentContextBlock = buildStudentContextBlock({
    programCode: payload.session?.programCode ?? userProfile?.programCode ?? null,
    bulletinYear: fallbackBulletinYear,
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
  const isGraduationGapQuery = intent === "GRADUATION_GAP"   || asksGraduationGapQuestion(question)
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

  // Greetings and small talk — respond directly unless it's an identity question
  if (intent === "CHITCHAT") {
    const isIdentityQuestion = /\b(my name|who am i|what.*my name|tell me.*my name)\b/i.test(question)
    if (!isIdentityQuestion) {
      const greeting = studentName ? `Hey ${studentName.split(" ")[0]}!` : "Hey!"
      return {
        mode: "DB_ONLY",
        answer: `${greeting} I'm your AAMU course advisor. Ask me anything about your courses, what you need to graduate, prerequisites, or what to register for next semester.`,
        data: null,
      }
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
    const degreeworksMissing = !degreeSummaryData?.summary

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
    const degreeworksNote = degreeSummaryBlock
      ? "\n\nInstruction: The Degree Progress Summary above is taken directly from the student's DegreeWorks audit. Lead with the degree_progress_pct percentage and credits_remaining figures when answering. Then list what courses are still needed by semester."
      : "\n\nInstruction: List what courses are still needed by semester, grouping by Fall vs Spring based on the [offered X] label on each course. Include credit totals."
    const answer = await generateDbResponse(
      question,
      `${studentContextBlock}${degreeSummaryBlock ? degreeSummaryBlock + "\n\n" : ""}${gapContext}${degreeworksNote}`,
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
      const notFoundMsg = minorName
        ? `I couldn't find a concentration or minor matching "${minorName}" in our database. Please check the AAMU bulletin or contact your academic advisor.`
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

${buildNextCoursesContext(recommendation, classification)}

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

    // Apply count filter — slice eligible list to what student asked for
    const filteredRecommendation = requestedCourseCount
      ? { ...recommendation, eligibleNow: recommendation.eligibleNow.slice(0, requestedCourseCount) }
      : recommendation

    const countNote = requestedCourseCount
      ? `\nStudent requested ${requestedCourseCount} courses. Show exactly that many from the eligible list, prioritized by semester order.`
      : ""

    const planningContext = buildNextCoursesContext(filteredRecommendation, classification, termSplit)

    // Fetch GE courses the student hasn't taken — always included alongside required courses
    let geContext = ""
    if (payload.studentId) {
      const geCtx = await fetchFreeElectiveOptions({
        studentId: payload.studentId,
        isInternational: payload.session?.isInternational,
        scholarshipType: payload.session?.scholarshipType,
        scholarshipMinGpa: payload.session?.scholarshipMinGpa,
        scholarshipMinCreditsPerYear: payload.session?.scholarshipMinCreditsPerYear,
      }).catch(() => null)
      if (geCtx && geCtx.availableCourses.length > 0) {
        geContext = "\n\nAvailable GE courses (student has not yet taken — listed for reference, do NOT dump all of them in the response; mention 1–2 relevant GE options if the student's schedule has room):\n" + formatFreeElectivesForLLM(geCtx)
      }
    }

    const answer = await generateDbResponse(
      question,
      `${studentContextBlock}${degreeSummaryBlock ? degreeSummaryBlock + "\n\n" : ""}${planningContext}${geContext}${countNote}`,
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
