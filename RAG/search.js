import dotenv from 'dotenv'
dotenv.config()

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function inferChunkType(query) {
  const q = query.toLowerCase()

  if (/fee|cost|tuition|pay|payment|charge|bill/.test(q))
    return { type: 'fee_schedule', hard: true }

  if (/deadline|calendar|registration date|semester date|schedule|add.drop/.test(q))
    return { type: 'calendar', hard: true }

  if (/graduat|requirement|credit hour|gpa|degree plan|curriculum/.test(q))
    return { type: 'requirement', hard: false }

  if (/program|major|department|college of/.test(q))
    return { type: 'program_info', hard: false }

  if (/policy|appeal|dismiss|probation|conduct|suspend|academ/.test(q))
    return { type: 'policy', hard: false }

  return { type: null, hard: false }
}

export async function searchBulletin(query, studentProfile, options = {}) {
  const { matchCount = 5 } = options
  const { bulletinYear } = studentProfile

  if (!bulletinYear) throw new Error('studentProfile must include bulletinYear')

  const { type: inferredType, hard: isHardFilter } = inferChunkType(query)

  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
    dimensions: 1536,
  })
  const queryEmbedding = embeddingResponse.data[0].embedding

  const { data, error } = await supabase.rpc('hybrid_search', {
    query_text:        query,
    query_embedding:   queryEmbedding,
    match_count:       matchCount,
    filter_year:       bulletinYear,
    filter_chunk_type: isHardFilter ? inferredType : null,
    boost_critical:    true,
    full_text_weight:  1,
    semantic_weight:   2,
  })

  if (error) throw new Error(error.message)

  return data.map((row) => ({
    content:          row.content,
    title:            row.title,
    chunkType:        row.chunk_type,
    sectionHierarchy: row.section_hierarchy,
    citation:         row.citation,
    isCritical:       row.is_critical,
    bulletinYear:     row.bulletin_year,
  }))
}

// ---------------------------------------------------------------------------
// Quick test — remove this when integrating into your app
// ---------------------------------------------------------------------------
const studentProfile = { bulletinYear: '2025-2026' }

const results = await searchBulletin(
  'what happens if my GPA falls below 2.0',
  studentProfile,
  { matchCount: 5 }
)

console.log(`\nQuery: "what happens if my GPA falls below 2.0"`)
console.log(`Bulletin year: ${studentProfile.bulletinYear}`)
console.log(`Results: ${results.length}\n`)

results.forEach((r, i) => {
  console.log(`--- Result ${i + 1} ---`)
  console.log(`Title:     ${r.title}`)
  console.log(`Type:      ${r.chunkType}`)
  console.log(`Critical:  ${r.isCritical}`)
  console.log(`Citation:  ${r.citation}`)
  console.log(`Content:   ${r.content.slice(0, 150)}...`)
  console.log()
})