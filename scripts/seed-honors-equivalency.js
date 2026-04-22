const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const mappings = [
  { honors_code: 'ENG 101H', standard_code: 'ENG 101' },
  { honors_code: 'ENG 102H', standard_code: 'ENG 102' },
  { honors_code: 'ENG 203H', standard_code: 'ENG 203' },
  { honors_code: 'ENG 204H', standard_code: 'ENG 204' },
  { honors_code: 'ENG 205H', standard_code: 'ENG 205' },
  { honors_code: 'HIS 101H', standard_code: 'HIS 101' },
  { honors_code: 'HIS 102H', standard_code: 'HIS 102' },
  { honors_code: 'BIO 101H', standard_code: 'BIO 101' },
  { honors_code: 'CHE 101H', standard_code: 'CHE 101' },
  { honors_code: 'CHE 101HL', standard_code: 'CHE 101L' },
  { honors_code: 'CHE 102H', standard_code: 'CHE 102' },
  { honors_code: 'CHE 102HL', standard_code: 'CHE 102L' },
  { honors_code: 'ORI 101H', standard_code: 'ORI 101' },
]

async function seed() {
  const { error } = await supabase
    .from('honors_equivalency')
    .upsert(mappings, { onConflict: 'honors_code' })

  if (error) {
    console.error('Seed failed:', error.message)
    process.exit(1)
  }
  console.log(`Seeded ${mappings.length} honors equivalency mappings.`)
}

seed()
