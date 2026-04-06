import type { ChatQueryRequest, ChatRoute, MatchedRule, RoutingDecision } from "@/shared/contracts"

interface BucketScore {
  score: number
  rules: MatchedRule[]
}

const DB_TERMS = [
  /\b(transcript|credit|credits|gpa|grade|grades|completed|enrolled|schedule|prereq|prerequisite)\b/i,
  /\b(degree progress|remaining credits|what classes do i need)\b/i,
]

const RAG_TERMS = [
  /\b(policy|dismissal|probation|appeal|deadline|calendar|tuition|fee|payment|billing)\b/i,
  /\b(bulletin|handbook|catalog|academic policy|registration deadline)\b/i,
]

const STUDENT_SPECIFIC_TERMS = [
  /\b(my|me|i|mine)\b/i,
  /\b(am i|do i|can i)\b/i,
]

function addRule(bucket: BucketScore, id: string, weight: number, reason: string) {
  bucket.score += weight
  bucket.rules.push({ id, weight, reason })
}

function chooseRoute(db: BucketScore, rag: BucketScore, hybrid: BucketScore): ChatRoute {
  if (db.score === 0 && rag.score === 0 && hybrid.score === 0) {
    return "DB_ONLY"
  }

  if (hybrid.score >= db.score && hybrid.score >= rag.score) {
    return "HYBRID"
  }

  if (db.score === rag.score) {
    return db.score > 0 ? "HYBRID" : "DB_ONLY"
  }

  return db.score > rag.score ? "DB_ONLY" : "RAG_ONLY"
}

function normalizeConfidence(score: number): number {
  return Math.max(0.35, Math.min(0.99, 0.45 + score / 10))
}

export function decideRoute(input: ChatQueryRequest): RoutingDecision {
  const question = (input.question || "").trim()

  const db: BucketScore = { score: 0, rules: [] }
  const rag: BucketScore = { score: 0, rules: [] }
  const hybrid: BucketScore = { score: 0, rules: [] }

  if (!question) {
    return {
      route: "DB_ONLY",
      confidence: 0.35,
      matchedRules: [{ id: "empty-question-fallback", weight: 0, reason: "Question was empty; default fallback." }],
      missingContext: ["question"],
    }
  }

  for (const pattern of DB_TERMS) {
    if (pattern.test(question)) {
      addRule(db, "db-keyword", 3, `Matched DB pattern: ${pattern}`)
    }
  }

  for (const pattern of RAG_TERMS) {
    if (pattern.test(question)) {
      addRule(rag, "rag-keyword", 3, `Matched RAG pattern: ${pattern}`)
    }
  }

  const isStudentSpecific = STUDENT_SPECIFIC_TERMS.some((p) => p.test(question))
  if (isStudentSpecific) {
    addRule(hybrid, "student-specific-language", 2, "Question includes first-person/student-specific wording.")
  }

  if (db.score > 0 && rag.score > 0) {
    addRule(hybrid, "mixed-signal", 4, "Question references both structured progress and policy context.")
  }

  if (input.studentId && db.score > 0 && rag.score > 0) {
    addRule(hybrid, "has-student-id-for-hybrid", 1, "Student ID available for personalized policy decisions.")
  }

  const route = chooseRoute(db, rag, hybrid)
  const winningScore = route === "DB_ONLY" ? db.score : route === "RAG_ONLY" ? rag.score : hybrid.score
  const matchedRules = route === "DB_ONLY" ? db.rules : route === "RAG_ONLY" ? rag.rules : hybrid.rules

  const missingContext: string[] = []
  if ((route === "DB_ONLY" || route === "HYBRID") && !input.studentId) {
    missingContext.push("studentId")
  }
  if ((route === "RAG_ONLY" || route === "HYBRID") && !input.session?.bulletinYear) {
    missingContext.push("session.bulletinYear")
  }

  return {
    route,
    confidence: normalizeConfidence(winningScore),
    matchedRules,
    missingContext,
  }
}
