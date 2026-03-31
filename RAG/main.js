import dotenv from 'dotenv'
dotenv.config()

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { searchBulletin } from './search.js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const studentProfile = { bulletinYear: '2025-2026' }

const testQueries = [
  'what happens if my GPA falls below 2.0',
  'how much is tuition',
  'when is the registration deadline',
  'what are the computer science degree requirements',
  'what is the academic dismissal policy',
]

async function generateResponse(query, results) {
  // Build context from search results
  const context = results
    .map((r, i) => `
[Source ${i + 1}]
Title: ${r.title}
Citation: ${r.citation}
${r.isCritical ? '⚠️ This is a critical policy.' : ''}
Content: ${r.content}
    `.trim())
    .join('\n\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a helpful academic advisor assistant for Alabama A&M University (AAMU). 
You answer student questions strictly based on the provided bulletin context.
Always cite your sources using the citation provided (e.g. "2025-2026 AAMU Bulletin, pp. 35-50").
If the context doesn't contain enough information to answer, say so clearly.
Be concise, friendly, and accurate.`,
      },
      {
        role: 'user',
        content: `Answer the following student question using only the context below.

Question: ${query}

Context:
${context}`,
      },
    ],
    temperature: 0.2, // low temperature = more factual, less creative
  })

  return response.choices[0].message.content
}

console.log('=== Bulletin Search + RAG Response Test ===\n')

for (const query of testQueries) {
  console.log(`\nQuery: "${query}"`)
  console.log('─'.repeat(60))

  try {
    // Step 1 — search
    const results = await searchBulletin(query, studentProfile, { matchCount: 5 })

    // Step 2 — show search results summary
    console.log(`\nTop ${results.length} chunks retrieved:`)
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.chunkType}] ${r.title} — ${r.citation} ${r.isCritical ? '⚠️' : ''}`)
    })

    // Step 3 — generate response
    console.log('\nGenerated Response:')
    console.log('─'.repeat(60))
    const answer = await generateResponse(query, results)
    console.log(answer)

  } catch (err) {
    console.error(`Error: ${err.message}`)
  }

  console.log('\n' + '='.repeat(60))
}