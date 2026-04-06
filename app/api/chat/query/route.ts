import { NextResponse } from "next/server"
import type { ChatQueryRequest } from "@/shared/contracts"
import { processChatQuery } from "@/backend/services/chat-orchestrator/service"

export const runtime = "nodejs"

/**
 * POST /api/chat/query
 * 
 * Thin HTTP controller — validates input and calls the orchestration service.
 * All business logic is in the service layer.
 */
export async function POST(req: Request) {
  let payload: ChatQueryRequest

  try {
    payload = (await req.json()) as ChatQueryRequest
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON body",
      },
      { status: 400 }
    )
  }

  if (!payload?.question || typeof payload.question !== "string") {
    return NextResponse.json(
      {
        error: "Field 'question' is required and must be a string.",
      },
      { status: 400 }
    )
  }

  // Delegate to orchestration service
  const result = await processChatQuery(payload)

  return NextResponse.json(result)
}