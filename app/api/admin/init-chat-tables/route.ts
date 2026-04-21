import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/**
 * POST /api/admin/init-chat-tables
 * Initialize chat tables (admin only - use with caution)
 *
 * This is a one-time setup endpoint to create the chat schema
 * In production, run migrations via Supabase CLI or dashboard
 */
export async function POST(req: Request) {
  try {
    // This endpoint should only be called with proper admin authentication
    // For now, we'll rely on the service role key being secret
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    )

    const SQL = `
-- Create chat_threads table
CREATE TABLE IF NOT EXISTS chat_threads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  plan_id    text not null,
  title      text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references chat_threads(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz default now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_plan ON chat_threads (user_id, plan_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_user ON chat_threads (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages (thread_id);
    `

    // Execute SQL via the service role client
    const { error } = await supabase.rpc("exec_sql", {
      sql: SQL,
    })

    if (error && error.message.includes("does not exist")) {
      // If exec_sql doesn't exist, try to create tables directly with raw query
      return NextResponse.json(
        {
          error:
            "Please run the migration manually via Supabase SQL Editor. Copy the SQL from backend/schema.sql.",
          sql: SQL,
        },
        { status: 500 }
      )
    }

    if (error) {
      throw error
    }

    return NextResponse.json(
      {
        success: true,
        message: "Chat tables initialized successfully",
      },
      { status: 200 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[admin/init-chat-tables]", message)
    return NextResponse.json(
      {
        error: message,
        hint: "Run migrations manually via Supabase dashboard SQL editor",
      },
      { status: 500 }
    )
  }
}
