#!/usr/bin/env node

/**
 * Seed elective_slot_eligible_courses for "Concentration Course X" curriculum slots.
 *
 * The curriculum plan has slots like "Concentration Course 1" … "Concentration Course 7"
 * that are is_elective_slot=true but have NO eligible courses linked in
 * elective_slot_eligible_courses. The actual concentration course lists are already in
 * concentration_slots. This script bridges the gap:
 *
 *   For each program → for each catalog year →
 *     find curriculum_slots labeled "Concentration Course *" (is_elective_slot=true)
 *     find ALL courses in concentration_slots for that program
 *     insert elective_slot_eligible_courses rows linking each slot → each course
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/seed-concentration-elective-links.js
 *
 * Safe to re-run — uses upsert (unique constraint on slot_id, course_id).
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log("🔍 Fetching programs...")
  const { data: programs, error: programsError } = await supabase
    .from("programs")
    .select("id, code, name, catalog_year")
    .order("code")
    .order("catalog_year")

  if (programsError || !programs) {
    console.error("❌ Failed to fetch programs:", programsError)
    process.exit(1)
  }

  console.log(`   Found ${programs.length} programs\n`)

  let totalInserted = 0
  let totalSkipped = 0

  for (const program of programs) {
    console.log(`📘 ${program.code} (${program.name}) — catalog ${program.catalog_year}`)

    // 1. Find all "Concentration Course *" elective slots in the curriculum plan
    const { data: concSlots, error: concSlotsError } = await supabase
      .from("curriculum_slots")
      .select("id, slot_label")
      .eq("program_id", program.id)
      .eq("is_elective_slot", true)
      .ilike("slot_label", "Concentration Course%")

    if (concSlotsError) {
      console.error(`   ❌ Error fetching curriculum slots:`, concSlotsError)
      continue
    }

    if (!concSlots || concSlots.length === 0) {
      console.log(`   ⚪ No "Concentration Course" elective slots found — skipping`)
      continue
    }

    console.log(`   Found ${concSlots.length} concentration curriculum slots: ${concSlots.map(s => s.slot_label).join(", ")}`)

    // 2. Find all concentrations for this program
    const { data: concentrations, error: concError } = await supabase
      .from("concentrations")
      .select("id, code, name, type")
      .eq("program_id", program.id)

    if (concError || !concentrations || concentrations.length === 0) {
      console.log(`   ⚪ No concentrations found for this program — skipping`)
      continue
    }

    console.log(`   Found ${concentrations.length} concentrations: ${concentrations.map(c => c.name).join(", ")}`)

    // 3. Collect all course_ids from concentration_slots (non-elective, i.e. required courses)
    //    These are the actual required concentration courses students must pick from.
    const allCourseIds = new Set()

    for (const concentration of concentrations) {
      const { data: slots, error: slotsError } = await supabase
        .from("concentration_slots")
        .select("course_id, slot_label, is_elective_slot")
        .eq("concentration_id", concentration.id)
        .not("course_id", "is", null)

      if (slotsError || !slots) continue

      for (const slot of slots) {
        if (slot.course_id) allCourseIds.add(slot.course_id)
      }
    }

    if (allCourseIds.size === 0) {
      console.log(`   ⚪ No courses found in concentration_slots — skipping`)
      continue
    }

    console.log(`   Collected ${allCourseIds.size} unique concentration courses`)

    // 4. Build upsert rows: each curriculum concentration slot × each course
    const rows = []
    for (const currSlot of concSlots) {
      for (const courseId of allCourseIds) {
        rows.push({
          slot_id: currSlot.id,
          course_id: courseId,
        })
      }
    }

    console.log(`   Upserting ${rows.length} eligibility links...`)

    // Batch in chunks of 500 to stay within Supabase limits
    const CHUNK = 500
    let inserted = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error: upsertError, count } = await supabase
        .from("elective_slot_eligible_courses")
        .upsert(chunk, { onConflict: "slot_id,course_id", ignoreDuplicates: true })
        .select("id", { count: "exact", head: true })

      if (upsertError) {
        console.error(`   ❌ Upsert error (batch ${i}–${i + CHUNK}):`, upsertError)
      } else {
        inserted += chunk.length
      }
    }

    console.log(`   ✅ Done — ${inserted} rows processed\n`)
    totalInserted += inserted
  }

  console.log(`\n🎉 Complete! Processed ${totalInserted} eligibility link rows across all programs.`)

  // Verification pass
  console.log("\n🔍 Verification — checking a sample of concentration curriculum slots...")
  const { data: sample } = await supabase
    .from("curriculum_slots")
    .select("id, slot_label, program_id, programs(code, catalog_year)")
    .eq("is_elective_slot", true)
    .ilike("slot_label", "Concentration Course%")
    .limit(5)

  if (sample) {
    for (const slot of sample) {
      const { count } = await supabase
        .from("elective_slot_eligible_courses")
        .select("id", { count: "exact", head: true })
        .eq("slot_id", slot.id)

      const prog = slot.programs
      console.log(`   ${prog?.code ?? "?"} (${prog?.catalog_year ?? "?"}) — "${slot.slot_label}": ${count ?? 0} eligible courses`)
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
