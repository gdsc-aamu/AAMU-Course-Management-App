import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getThread, getThreadMessages, updateThreadTitle, deleteThread } from "@/backend/data-access/chat"

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
 * GET /api/chat/threads/[id]
 * Get a thread with all its messages
 *
 * Response: { thread: ChatThread, messages: ChatMessage[] } | error
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getUserIdFromAuth(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: threadId } = await params

    // Get thread
    const thread = await getThread(threadId)
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 })
    }

    // Verify user owns thread
    if (thread.user_id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get messages
    const messages = await getThreadMessages(threadId)

    return NextResponse.json({ thread, messages }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[api/chat/threads/[id] GET]", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PUT /api/chat/threads/[id]
 * Rename a thread
 *
 * Request: { title: string }
 * Response: { success: true } | error
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    let payload: { title: string }
    try {
      payload = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!payload?.title || typeof payload.title !== "string") {
      return NextResponse.json({ error: "Field 'title' is required" }, { status: 400 })
    }

    // Update title
    await updateThreadTitle(threadId, payload.title)

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[api/chat/threads/[id] PUT]", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/chat/threads/[id]
 * Delete a thread and all its messages
 *
 * Response: { success: true } | error
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // Delete thread
    await deleteThread(threadId)

    return NextResponse.json({ success: true, id: threadId }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[api/chat/threads/[id] DELETE]", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
