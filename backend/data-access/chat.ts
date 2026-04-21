/**
 * Data Access Layer — Chat
 *
 * Responsibility: CRUD operations for chat threads and messages
 * No LLM calls, no response generation — only database access
 */

import { createClient } from "@supabase/supabase-js"
import type { ChatThread, ChatMessage } from "@/lib/types"

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars")
  return createClient(url, key)
}

function toDataAccessError(context: string, message: string): Error {
  return new Error(`[data-access:chat:${context}] ${message}`)
}

/**
 * Create a new chat thread for a user and plan
 * @param userId - Supabase user ID
 * @param planId - Plan identifier (localStorage-based)
 * @param title - Thread title (e.g., "Biology Study Help")
 * @returns The created thread
 */
export async function createThread(
  userId: string,
  planId: string,
  title: string
): Promise<ChatThread> {
  const supabase = getSupabaseClient()
  try {
    const { data, error } = await supabase
      .from("chat_threads")
      .insert({
        user_id: userId,
        plan_id: planId,
        title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    if (!data) throw new Error("No data returned from insert")
    return data as ChatThread
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    throw toDataAccessError("createThread", `Failed to create thread: ${message}`)
  }
}

/**
 * List all threads for a user and plan, ordered by most recent first
 * @param userId - Supabase user ID
 * @param planId - Plan identifier (localStorage-based)
 * @returns Array of threads sorted by updated_at DESC
 */
export async function listThreads(userId: string, planId: string): Promise<ChatThread[]> {
  const supabase = getSupabaseClient()
  try {
    const { data, error } = await supabase
      .from("chat_threads")
      .select()
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .order("updated_at", { ascending: false })

    if (error) throw error
    return (data || []) as ChatThread[]
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    throw toDataAccessError("listThreads", `Failed to list threads: ${message}`)
  }
}

/**
 * Get a single thread by ID (includes basic thread info, not messages)
 * @param threadId - Thread ID
 * @returns The thread, or null if not found
 */
export async function getThread(threadId: string): Promise<ChatThread | null> {
  const supabase = getSupabaseClient()
  try {
    const { data, error } = await supabase
      .from("chat_threads")
      .select()
      .eq("id", threadId)
      .single()

    if (error && error.code === "PGRST116") return null // Not found
    if (error) throw error
    return (data as ChatThread) || null
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    throw toDataAccessError("getThread", `Failed to get thread: ${message}`)
  }
}

/**
 * Get all messages for a thread
 * @param threadId - Thread ID
 * @returns Array of messages ordered by created_at ASC (oldest first)
 */
export async function getThreadMessages(threadId: string): Promise<ChatMessage[]> {
  const supabase = getSupabaseClient()
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .select()
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })

    if (error) throw error
    return (data || []) as ChatMessage[]
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    throw toDataAccessError("getThreadMessages", `Failed to get messages: ${message}`)
  }
}

/**
 * Append a message to a thread and update the thread's updated_at timestamp
 * @param threadId - Thread ID
 * @param role - Message role: 'user' or 'assistant'
 * @param content - Message content
 * @returns The created message
 */
export async function appendMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string
): Promise<ChatMessage> {
  const supabase = getSupabaseClient()
  try {
    // Insert the message
    const { data, error: insertError } = await supabase
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        role,
        content,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) throw insertError
    if (!data) throw new Error("No data returned from insert")

    // Update the thread's timestamp
    const { error: updateError } = await supabase
      .from("chat_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId)

    if (updateError) throw updateError

    return (data as ChatMessage) || null
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    throw toDataAccessError("appendMessage", `Failed to append message: ${message}`)
  }
}

/**
 * Update a thread's title
 * @param threadId - Thread ID
 * @param newTitle - New title
 */
export async function updateThreadTitle(threadId: string, newTitle: string): Promise<void> {
  const supabase = getSupabaseClient()
  try {
    const { error } = await supabase
      .from("chat_threads")
      .update({
        title: newTitle,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId)

    if (error) throw error
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    throw toDataAccessError("updateThreadTitle", `Failed to update title: ${message}`)
  }
}

/**
 * Delete a thread and all its messages (cascade)
 * @param threadId - Thread ID
 */
export async function deleteThread(threadId: string): Promise<void> {
  const supabase = getSupabaseClient()
  try {
    const { error } = await supabase.from("chat_threads").delete().eq("id", threadId)

    if (error) throw error
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    throw toDataAccessError("deleteThread", `Failed to delete thread: ${message}`)
  }
}
