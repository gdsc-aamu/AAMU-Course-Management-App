import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getThread, appendMessage } from "@/backend/data-access/chat"

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

/**
 * POST /api/chat/threads/[id]/messages
 * Append a message to a thread
 *
 * Request: { role: 'user' | 'assistant', content: string }
 * Response: { message: ChatMessage } | error
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getUserIdFromAuth(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: threadId } = await params

    // Verify thread exists and user owns it
    const thread = await getThread(threadId)
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 })
    }

    if (thread.user_id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parse request body
    let payload: { role: string; content: string }
    try {
      payload = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    // Validate role
    if (!payload?.role || !["user", "assistant"].includes(payload.role)) {
      return NextResponse.json(
        { error: "Field 'role' must be 'user' or 'assistant'" },
        { status: 400 }
      )
    }

    // Validate content
    if (!payload?.content || typeof payload.content !== "string") {
      return NextResponse.json({ error: "Field 'content' is required" }, { status: 400 })
    }

    // Append message
    const message = await appendMessage(threadId, payload.role as "user" | "assistant", payload.content)

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[api/chat/threads/[id]/messages POST]", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
