import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    const missing: string[] = []
    if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL")
    if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    throw new Error(`Missing Supabase environment variables: ${missing.join(", ")}`)
  }

  return createSupabaseClient(
    url,
    anonKey
  );
}