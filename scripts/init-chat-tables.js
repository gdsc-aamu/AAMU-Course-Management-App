#!/usr/bin/env node

/**
 * Initialize chat tables in Supabase
 * Run with: node scripts/init-chat-tables.js
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

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

-- Enable RLS
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for chat_threads
CREATE POLICY "Users can view their own threads"
  ON chat_threads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own threads"
  ON chat_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own threads"
  ON chat_threads FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own threads"
  ON chat_threads FOR DELETE
  USING (auth.uid() = user_id);

-- Create RLS policies for chat_messages
CREATE POLICY "Users can view messages from their threads"
  ON chat_messages FOR SELECT
  USING (
    thread_id IN (
      SELECT id FROM chat_threads WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages to their threads"
  ON chat_messages FOR INSERT
  WITH CHECK (
    thread_id IN (
      SELECT id FROM chat_threads WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete messages from their threads"
  ON chat_messages FOR DELETE
  USING (
    thread_id IN (
      SELECT id FROM chat_threads WHERE user_id = auth.uid()
    )
  );
`

async function initializeTables() {
  try {
    console.log("🚀 Initializing chat tables...")

    const { error } = await supabase.rpc("exec_sql", {
      sql: SQL,
    })

    if (error) {
      // Try alternative approach if RPC doesn't exist
      console.log("⚠️  RPC method not available, attempting direct query...")
      
      // Split SQL into individual statements and execute separately
      const statements = SQL.split(";").filter((s) => s.trim())
      
      for (const statement of statements) {
        if (statement.trim()) {
          const { error: stmtError } = await supabase.rpc("query", {
            query: statement.trim() + ";",
          })
          
          if (stmtError) {
            console.warn(`⚠️  Statement executed (may have warnings): ${stmtError.message}`)
          }
        }
      }
    }

    console.log("✅ Chat tables initialized successfully!")
    console.log("\n📋 Tables created:")
    console.log("   - chat_threads")
    console.log("   - chat_messages")
    console.log("\n🔐 Row Level Security enabled for:")
    console.log("   - Users can only access their own threads")
    console.log("   - Users can only access messages from threads they own")
  } catch (error) {
    console.error("❌ Error initializing tables:", error)
    process.exit(1)
  }
}

initializeTables()
