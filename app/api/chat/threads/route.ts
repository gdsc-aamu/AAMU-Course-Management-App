import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createThread, listThreads } from "@/backend/data-access/chat"

export const runtime = "nodejs"

// Extract user ID from JWT token in Authorization header
async function getUserIdFromAuth(req: Request): Promise<string | null> {
  try {
    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) return null
    
    const token = authHeader.substring(7)
    const parts = token.split('.')
    if (parts.length !== 3) return null
    
    // Decode JWT payload (second part)
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString())
    return decoded.sub || null
  } catch (error) {
    console.error("[getUserIdFromAuth] Failed to decode token:", error)
    return null
  }
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

/**
 * POST /api/chat/threads
 * Create a new chat thread for a plan
 *
 * Request: { planId: string, title: string }
 * Response: { thread: ChatThread } | error
 */
export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromAuth(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parse request body
    let payload: { planId: string; title: string }
    try {
      payload = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    // Validate required fields
    if (!payload?.planId || typeof payload.planId !== "string") {
      return NextResponse.json({ error: "Field 'planId' is required" }, { status: 400 })
    }

    if (!payload?.title || typeof payload.title !== "string") {
      return NextResponse.json({ error: "Field 'title' is required" }, { status: 400 })
    }

    // Create thread
    const thread = await createThread(userId, payload.planId, payload.title)

    return NextResponse.json({ thread }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[api/chat/threads POST]", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/chat/threads?planId=<uuid>
 * List all threads for a plan
 *
 * Query: planId (required)
 * Response: { threads: ChatThread[] } | error
 */
export async function GET(req: Request) {
  try {
    const userId = await getUserIdFromAuth(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Extract query parameters
    const url = new URL(req.url)
    const planId = url.searchParams.get("planId")

    if (!planId) {
      return NextResponse.json({ error: "Query param 'planId' is required" }, { status: 400 })
    }

    // List threads
    const threads = await listThreads(userId, planId)

    return NextResponse.json({ threads }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[api/chat/threads GET]", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
