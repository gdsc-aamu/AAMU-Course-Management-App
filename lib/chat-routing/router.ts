import type { ChatQueryRequest, ChatRoute, MatchedRule, RoutingDecision } from "@/shared/contracts"
import OpenAI from "openai"

// ─── Intent labels the classifier can return ────────────────────────────────

type IntentLabel =
  | "COMPLETED_COURSES"   // what have I taken, classes I knocked out, etc.
  | "NEXT_COURSES"        // what should I take next, what can I register for
  | "GRADUATION_GAP"      // what's left to graduate, how close am I
  | "PREREQUISITES"       // prereqs for a course, what do I need before X
  | "ELECTIVES"           // what electives can I pick, elective options
  | "CONCENTRATION"       // concentration/minor requirements
  | "SIMULATE"            // if I take X what opens up, hypothetically
  | "SAVE_PLAN"           // save this plan, create a schedule
  | "BULLETIN_POLICY"     // GPA requirements, academic standing, policies
  | "ADVISOR_ESCALATE"    // transfer credits, appeals, waivers, exceptions
  | "GENERAL_CURRICULUM"  // what is CS 214, program overview, course info
  | "FREE_ELECTIVE"       // free elective options, GE courses, recreational courses, what to take for fun/credits
  | "CHITCHAT"            // greetings, thanks, small talk — no academic query
  | "GPA_SIMULATION"      // "if I get an A in BIO 201, what will my GPA be?"
  | "MULTI_SEMESTER_PLAN" // "map out my next 4 semesters" / "fastest path to graduation"
  | "GRADE_REPEAT"        // "can I retake BIO 201?" / "grade replacement policy"
  | "WITHDRAWAL_IMPACT"   // "what happens if I drop CS 301?"
  | "CREDIT_LOAD"         // "how many credits should I take?"

const INTENT_TO_ROUTE: Record<IntentLabel, ChatRoute> = {
  COMPLETED_COURSES:  "DB_ONLY",
  NEXT_COURSES:       "DB_ONLY",
  GRADUATION_GAP:     "DB_ONLY",
  PREREQUISITES:      "DB_ONLY",
  ELECTIVES:          "DB_ONLY",
  FREE_ELECTIVE:      "DB_ONLY",
  CONCENTRATION:      "DB_ONLY",
  SIMULATE:           "DB_ONLY",
  SAVE_PLAN:          "DB_ONLY",
  BULLETIN_POLICY:    "RAG_ONLY",
  ADVISOR_ESCALATE:   "DB_ONLY",
  GENERAL_CURRICULUM: "HYBRID",
  CHITCHAT:           "DB_ONLY",
  GPA_SIMULATION:      "DB_ONLY",
  MULTI_SEMESTER_PLAN: "DB_ONLY",
  GRADE_REPEAT:        "DB_ONLY",
  WITHDRAWAL_IMPACT:   "DB_ONLY",
  CREDIT_LOAD:         "DB_ONLY",
}

const VALID_INTENTS = new Set<string>([
  "COMPLETED_COURSES", "NEXT_COURSES", "GRADUATION_GAP", "PREREQUISITES",
  "ELECTIVES", "FREE_ELECTIVE", "CONCENTRATION", "SIMULATE", "SAVE_PLAN",
  "BULLETIN_POLICY", "ADVISOR_ESCALATE", "GENERAL_CURRICULUM", "CHITCHAT",
  "GPA_SIMULATION", "MULTI_SEMESTER_PLAN", "GRADE_REPEAT", "WITHDRAWAL_IMPACT", "CREDIT_LOAD",
])

const CLASSIFIER_SYSTEM_PROMPT = `You are an intent classifier for a university course advising chatbot used by AAMU (Alabama A&M University) students.

Classify the student's question into EXACTLY ONE of these intent labels. Reply with only the label — no explanation, no punctuation.

COMPLETED_COURSES — student asking what courses they have already taken, completed, passed, finished, knocked out, done, hit (includes typos like "couses", slang like "knocked out", AAVE like "what I done finished")
NEXT_COURSES — what to take next semester, what classes to register for, what's available to take
GRADUATION_GAP — what's left to graduate, how many credits remaining, am I on track, when will I finish, what is MY current GPA (personal academic record questions)
PREREQUISITES — what are the prereqs for a course, what do I need before taking X
ELECTIVES — elective options, what electives count, which electives can I pick
FREE_ELECTIVE — student asks about free elective options, what electives to take, recreational courses, GE courses, general education requirements (including any GE sub-area: humanities, fine arts, history, literature, social sciences, behavioral sciences, natural sciences, physical education), what courses count as free electives, or wants suggestions for easy/fun courses. Also: PE courses, physical education, specific activities like golf/swimming/tennis/bowling/badminton. NOTE: "GED" in an advising context means General Education requirements (not high school GED equivalency).
CONCENTRATION — concentration requirements, minor requirements, double major
SIMULATE — hypothetical "if I take X what opens up", what-if questions about completing courses
SAVE_PLAN — save this schedule/plan, create a plan from these courses
BULLETIN_POLICY — minimum GPA requirements, academic probation rules, graduation policies, financial aid, deadlines, academic standing rules (anything about policy, not about the student's own records)
ADVISOR_ESCALATE — transfer credits, grade appeals, course waivers, exceptions, petitions, special permissions
GENERAL_CURRICULUM — what is a specific course, program overview, course descriptions, general questions about the CS program
CHITCHAT — greetings, thanks, small talk, anything that is not an academic question ("hi", "hello", "thanks", "ok", "cool", "got it", "bye")
GPA_SIMULATION — student asks what their GPA would be if they get certain grades, or what GPA they need to reach a target, or wants to project/calculate their GPA
MULTI_SEMESTER_PLAN — student asks to map out future semesters, create a graduation roadmap, find the fastest path to graduation, or plan multiple semesters ahead
GRADE_REPEAT — student asks if they can retake a course, about grade replacement/forgiveness policy, repeating a failed course, or taking a course they've already taken again
WITHDRAWAL_IMPACT — student asks what happens if they drop or withdraw from a course, should they withdraw, or the impact of a W grade on their record
CREDIT_LOAD — student asks how many credits they should take, whether their load is too heavy, or for a course load recommendation

Examples:
"hi" → CHITCHAT
"hello" → CHITCHAT
"thanks" → CHITCHAT
"ok got it" → CHITCHAT
"what couses have i took" → COMPLETED_COURSES
"aye what classes i already knocked out" → COMPLETED_COURSES
"tryna see what i done finished" → COMPLETED_COURSES
"what i need to graduate" → GRADUATION_GAP
"can i still graduate on time" → GRADUATION_GAP
"what is my current GPA" → GRADUATION_GAP
"what is my GPA" → GRADUATION_GAP
"show me my GPA" → GRADUATION_GAP
"how are my grades" → GRADUATION_GAP
"what gpa do i need to stay enrolled" → BULLETIN_POLICY
"minimum gpa to graduate" → BULLETIN_POLICY
"what is the minimum GPA required" → BULLETIN_POLICY
"if i take CS 101 what opens up" → SIMULATE
"what is CS 214" → GENERAL_CURRICULUM
"transfer my credits from community college" → ADVISOR_ESCALATE
"I need 12 credits" → NEXT_COURSES
"I need 3 more credits" → NEXT_COURSES
"give me 15 credits worth of courses" → NEXT_COURSES
"I need 5 courses that are 3 credits each" → NEXT_COURSES
"make it 15 credits" → NEXT_COURSES
"what electives should I take?" → FREE_ELECTIVE
"I need a free elective" → FREE_ELECTIVE
"what PE courses are available?" → FREE_ELECTIVE
"can I take golf?" → FREE_ELECTIVE
"I need 3 more credits what should I take?" → FREE_ELECTIVE
"any fun courses I can add?" → FREE_ELECTIVE
"what general education courses haven't I taken?" → FREE_ELECTIVE
"what humanities courses can I take next semester?" → FREE_ELECTIVE
"what GED courses are available?" → FREE_ELECTIVE
"what history courses can I take?" → FREE_ELECTIVE
"what fine arts courses count for my degree?" → FREE_ELECTIVE
"what literature classes haven't I taken?" → FREE_ELECTIVE
"what social science courses do I still need?" → FREE_ELECTIVE
"what are the humanities courses I can take next semester?" → FREE_ELECTIVE
"What General education requirement courses can I take?" → FREE_ELECTIVE
"Give me some options for general education" → FREE_ELECTIVE
"courses" → CHITCHAT
"classes" → CHITCHAT
"ok" → CHITCHAT
"yes" → CHITCHAT
"got it" → CHITCHAT
"sounds good" → CHITCHAT
"show my transcript" → COMPLETED_COURSES
"build my schedule" → SAVE_PLAN
"can you make me a schedule" → SAVE_PLAN
"create a schedule for me" → SAVE_PLAN
"make a schedule" → SAVE_PLAN
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
"what's a good course load for me" → CREDIT_LOAD`

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var")
  return new OpenAI({ apiKey })
}

// ─── Fast keyword pre-screen — skip LLM for unambiguous cases ───────────────
// Only catches the clearest cases; anything ambiguous goes to the LLM.

function fastPrescreen(question: string): IntentLabel | null {
  const q = question.toLowerCase()

  // Short single-word or common-phrase queries → CHITCHAT
  // Catches bare: "courses", "classes", "ok", "yes", "got it", "cool", etc.
  if (/^(courses?|classes?|ok|okay|yes|yeah|yep|no|nope|got\s+it|sure|sounds\s+good|cool|great|thanks?|thank\s+you|bye|hello|hi|hey|alright|noted)\.?$/i.test(question.trim()))
    return "CHITCHAT"

  // Transcript / course history → completed courses
  if (/\b(show|see|view|pull\s+up|display)\s+(my\s+)?(transcript|grades?|academic\s+record|course\s+history)\b/i.test(q))
    return "COMPLETED_COURSES"

  // Personal GPA/grade record questions → use student's own data, not bulletin policy
  if (/\b(my\s+(current\s+)?gpa|current\s+gpa|show\s+(my\s+)?gpa|(what|what's)\s+(is\s+)?(my\s+)?(current\s+)?gpa|how\s+(is|are)\s+my\s+(grades?|gpa)|grade\s+point\s+average|how\s+am\s+i\s+doing\s+academically|am\s+i\s+doing\s+well)\b/i.test(q))
    return "GRADUATION_GAP"
  // GPA simulation
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

  if (/\b(bulletin|handbook|catalog|academic policy|registration deadline|financial aid|scholarship|housing)\b/.test(q))
    return "BULLETIN_POLICY"
  if (/\b(transfer credit|appeal|waiver|petition|special permission|department head|dean approval)\b/.test(q))
    return "ADVISOR_ESCALATE"
  if (/\b(save\s+(this|my|the|these)?\s*(plan|schedule|courses?|list)|save\s+it|can\s+you\s+save|go\s+ahead\s+and\s+save|save\s+as|name\s+(it|this|the\s+plan)|create\s+a\s+plan|build\s+(my|a|me\s+a)\s+schedule|make\s+(me\s+a|a|my)\s+schedule|create\s+a\s+schedule(\s+for\s+me)?|put\s+(together|this)\s+(a|my)?\s*schedule)\b/i.test(q))
    return "SAVE_PLAN"
  if (/\b(humanities|fine\s+arts?|social\s+sciences?|natural\s+sciences?|GED\s+courses?|gen\s+ed|general\s+ed(?:ucation)?(?:\s+requirements?)?|history\s+(?:classes?|courses?)|literature\s+(?:classes?|courses?)|behavioral\s+sciences?)\b/i.test(q))
    return "FREE_ELECTIVE"
  // Credit-target schedule building → NEXT_COURSES (must come after FREE_ELECTIVE so GE area names win)
  if (/\b(i\s+need|give\s+me|i\s+want|make\s+it|add|get\s+me)\s+\d+\s+(more\s+)?credits?\b/i.test(q))
    return "NEXT_COURSES"
  if (/\b\d+\s+more\s+credits?\b/i.test(q))
    return "NEXT_COURSES"
  if (/\b\d+\s+courses?\s+(that\s+are|each|worth)\s+\d+\s+credits?\s*(each)?\b/i.test(q))
    return "NEXT_COURSES"
  if (/\b(need|want)\s+\d+\s+credits?\b/i.test(q))
    return "NEXT_COURSES"

  return null
}

// ─── LLM classifier ─────────────────────────────────────────────────────────

async function classifyIntent(question: string): Promise<IntentLabel> {
  // Fast path for unambiguous cases
  const prescreened = fastPrescreen(question)
  if (prescreened) return prescreened

  try {
    const openai = getOpenAIClient()
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
      max_tokens: 10,
      temperature: 0,
    })

    const label = response.choices[0]?.message?.content?.trim().toUpperCase() ?? ""
    if (VALID_INTENTS.has(label)) return label as IntentLabel

    // Fallback if model returns something unexpected
    console.warn(`[router] Unexpected intent label: "${label}", defaulting to GENERAL_CURRICULUM`)
    return "GENERAL_CURRICULUM"
  } catch (error) {
    console.error("[router] Intent classification failed, falling back to HYBRID:", error)
    return "GENERAL_CURRICULUM"
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function decideRoute(input: ChatQueryRequest): Promise<RoutingDecision> {
  const question = (input.question || "").trim()

  if (!question) {
    return {
      route: "DB_ONLY",
      confidence: 0.35,
      matchedRules: [{ id: "empty-question-fallback", weight: 0, reason: "Question was empty." }],
      missingContext: ["question"],
    }
  }

  const intent = await classifyIntent(question)
  const route = INTENT_TO_ROUTE[intent]

  const missingContext: string[] = []
  if ((route === "DB_ONLY" || route === "HYBRID") && !input.studentId) {
    missingContext.push("studentId")
  }
  if ((route === "RAG_ONLY" || route === "HYBRID") && !input.session?.bulletinYear) {
    missingContext.push("session.bulletinYear")
  }

  return {
    route,
    confidence: 0.92,
    matchedRules: [{ id: "llm-intent-classifier", weight: 10, reason: `Classified as ${intent}` }],
    missingContext,
  }
}
