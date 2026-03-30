import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { readFileSync } from 'fs'


const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
console.log('Key starts with:', process.env.OPENAI_API_KEY?.slice(0, 15))
const chunks = JSON.parse(readFileSync('./rag_chunks_all_years.json', 'utf8'))

async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  })
  return response.data[0].embedding
}

async function ingestChunks(chunks, batchSize = 20) {
  const years = [...new Set(chunks.map((c) => c.bulletin_year))].join(', ')
  console.log(`\nIngesting ${chunks.length} chunks across: ${years}\n`)

  let inserted = 0
  let failed = 0

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const batchNum = Math.floor(i / batchSize) + 1
    const totalBatches = Math.ceil(chunks.length / batchSize)

    try {
      const records = await Promise.all(
        batch.map(async (chunk) => {
          const embedding = await generateEmbedding(chunk.content)
          return {
            chunk_id:              chunk.chunk_id,
            bulletin_year:         chunk.bulletin_year,
            chunk_type:            chunk.chunk_type,
            section_hierarchy:     chunk.section_hierarchy,
            college:               chunk.college       || null,
            department:            chunk.department    || null,
            program:               chunk.program       || null,
            title:                 chunk.title         || null,
            content:               chunk.content,
            page_numbers:          chunk.page_numbers?.length ? chunk.page_numbers : null,
            page_range_str:        chunk.page_range_str        || null,
            is_critical:           chunk.is_critical   ?? false,
            extraction_confidence: chunk.extraction_confidence || null,
            token_count:           chunk.token_count   || null,
            content_hash:          chunk.content_hash  || null,
            embedding,
          }
        })
      )

      const { error } = await supabase
        .from('bulletin_chunks')
        .upsert(records, { onConflict: 'chunk_id' })

      if (error) {
        console.error(`✗ Batch ${batchNum}/${totalBatches} failed:`, error.message)
        failed += batch.length
      } else {
        inserted += batch.length
        console.log(`✓ Batch ${batchNum}/${totalBatches} — ${inserted}/${chunks.length} chunks ingested`)
      }
    } catch (err) {
      console.error(`✗ Batch ${batchNum}/${totalBatches} error:`, err.message)
      failed += batch.length
    }

    // Pause between batches to respect OpenAI rate limits
    if (i + batchSize < chunks.length) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  console.log(`\n--- Ingestion complete ---`)
  console.log(`✓ Inserted/updated: ${inserted}`)
  if (failed > 0) console.log(`✗ Failed: ${failed}`)
}

// Temporary test - remove after
try {
  const test = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: 'test',
    dimensions: 1536,
  })
  console.log('✓ Embeddings API working, first value:', test.data[0].embedding[0])
} catch (err) {
  console.error('✗ Embeddings API failed:', err.status, err.message)
  process.exit(1)
}

ingestChunks(chunks)