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
}

const VALID_INTENTS = new Set<string>([
  "COMPLETED_COURSES", "NEXT_COURSES", "GRADUATION_GAP", "PREREQUISITES",
  "ELECTIVES", "FREE_ELECTIVE", "CONCENTRATION", "SIMULATE", "SAVE_PLAN",
  "BULLETIN_POLICY", "ADVISOR_ESCALATE", "GENERAL_CURRICULUM", "CHITCHAT",
])

const CLASSIFIER_SYSTEM_PROMPT = `You are an intent classifier for a university course advising chatbot used by AAMU (Alabama A&M University) students.

Classify the student's question into EXACTLY ONE of these intent labels. Reply with only the label — no explanation, no punctuation.

COMPLETED_COURSES — student asking what courses they have already taken, completed, passed, finished, knocked out, done, hit (includes typos like "couses", slang like "knocked out", AAVE like "what I done finished")
NEXT_COURSES — what to take next semester, what classes to register for, what's available to take
GRADUATION_GAP — what's left to graduate, how many credits remaining, am I on track, when will I finish
PREREQUISITES — what are the prereqs for a course, what do I need before taking X
ELECTIVES — elective options, what electives count, which electives can I pick
FREE_ELECTIVE — student asks about free elective options, what electives to take, recreational courses, GE courses, general education requirements (including any GE sub-area: humanities, fine arts, history, literature, social sciences, behavioral sciences, natural sciences, physical education), what courses count as free electives, or wants suggestions for easy/fun courses. Also: PE courses, physical education, specific activities like golf/swimming/tennis/bowling/badminton. NOTE: "GED" in an advising context means General Education requirements (not high school GED equivalency).
CONCENTRATION — concentration requirements, minor requirements, double major
SIMULATE — hypothetical "if I take X what opens up", what-if questions about completing courses
SAVE_PLAN — save this schedule/plan, create a plan from these courses
BULLETIN_POLICY — GPA requirements, academic probation, graduation policies, financial aid, deadlines, academic standing rules (anything in the student handbook/bulletin)
ADVISOR_ESCALATE — transfer credits, grade appeals, course waivers, exceptions, petitions, special permissions
GENERAL_CURRICULUM — what is a specific course, program overview, course descriptions, general questions about the CS program
CHITCHAT — greetings, thanks, small talk, anything that is not an academic question ("hi", "hello", "thanks", "ok", "cool", "got it", "bye")

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
"what gpa do i need" → BULLETIN_POLICY
"minimum gpa to graduate" → BULLETIN_POLICY
"if i take CS 101 what opens up" → SIMULATE
"what is CS 214" → GENERAL_CURRICULUM
"transfer my credits from community college" → ADVISOR_ESCALATE
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
"Give me some options for general education" → FREE_ELECTIVE`

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var")
  return new OpenAI({ apiKey })
}

// ─── Fast keyword pre-screen — skip LLM for unambiguous cases ───────────────
// Only catches the clearest cases; anything ambiguous goes to the LLM.

function fastPrescreen(question: string): IntentLabel | null {
  const q = question.toLowerCase()

  if (/\b(bulletin|handbook|catalog|academic policy|registration deadline|financial aid|scholarship|housing)\b/.test(q))
    return "BULLETIN_POLICY"
  if (/\b(transfer credit|appeal|waiver|petition|special permission|department head|dean approval)\b/.test(q))
    return "ADVISOR_ESCALATE"
  if (/\b(save (this|my|the)?\s*(plan|schedule)|create a plan)\b/.test(q))
    return "SAVE_PLAN"
  if (/\b(humanities|fine\s+arts?|social\s+science|natural\s+science|GED\s+course|general\s+ed(?:ucation)?(?:\s+requirement)?|history\s+(?:class|course)|literature\s+(?:class|course)|behavioral\s+science)\b/i.test(q))
    return "FREE_ELECTIVE"

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
