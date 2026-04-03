export type ChatRoute = "DB_ONLY" | "RAG_ONLY" | "HYBRID"

export interface ChatQueryRequest {
  question: string
  studentId?: string
  session?: {
    programCode?: string
    bulletinYear?: string
  }
}

export interface MatchedRule {
  id: string
  weight: number
  reason: string
}

export interface RoutingDecision {
  route: ChatRoute
  confidence: number
  matchedRules: MatchedRule[]
  missingContext: string[]
}

export interface RoutedResponse {
  route: ChatRoute
  confidence: number
  matchedRules: MatchedRule[]
  missingContext: string[]
  handlerResult: Record<string, unknown>
}
