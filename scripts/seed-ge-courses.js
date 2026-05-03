const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const GE_DATA = [
  {
    code: 'AREA_I',
    name: 'Area I – Written Composition',
    min_hours: 6,
    bulletin_year: '2025-2026',
    courses: [
      { course_code: 'ENG 101', course_title: 'English Composition I', credit_hours: 3, sub_area: null },
      { course_code: 'ENG 101E', course_title: 'English Composition I Enhanced', credit_hours: 3, sub_area: null },
      { course_code: 'ENG 101H', course_title: 'English Composition I Honors', credit_hours: 3, sub_area: null },
      { course_code: 'ENG 102', course_title: 'English Composition II', credit_hours: 3, sub_area: null },
      { course_code: 'ENG 102H', course_title: 'English Composition II Honors', credit_hours: 3, sub_area: null },
    ]
  },
  {
    code: 'AREA_II',
    name: 'Area II – Humanities and Fine Arts',
    min_hours: 12,
    bulletin_year: '2025-2026',
    courses: [
      // Fine Arts
      { course_code: 'ART 200', course_title: 'Art Appreciation', credit_hours: 3, sub_area: 'Fine Arts' },
      { course_code: 'MUS 200', course_title: 'Music Appreciation', credit_hours: 3, sub_area: 'Fine Arts' },
      { course_code: 'THE 200', course_title: 'Introduction to Theatre', credit_hours: 3, sub_area: 'Fine Arts' },
      { course_code: 'ART 101', course_title: 'Drawing I', credit_hours: 3, sub_area: 'Fine Arts' },
      { course_code: 'ART 102', course_title: 'Drawing II', credit_hours: 3, sub_area: 'Fine Arts' },
      { course_code: 'ART 111', course_title: 'Design I', credit_hours: 3, sub_area: 'Fine Arts' },
      // Literature
      { course_code: 'ENG 200', course_title: 'Introduction to Literature', credit_hours: 3, sub_area: 'Literature' },
      { course_code: 'ENG 201', course_title: 'World Literature I', credit_hours: 3, sub_area: 'Literature' },
      { course_code: 'ENG 202', course_title: 'World Literature II', credit_hours: 3, sub_area: 'Literature' },
      { course_code: 'ENG 203', course_title: 'American Literature I', credit_hours: 3, sub_area: 'Literature' },
      { course_code: 'ENG 203H', course_title: 'American Literature I Honors', credit_hours: 3, sub_area: 'Literature' },
      { course_code: 'ENG 204', course_title: 'American Literature II', credit_hours: 3, sub_area: 'Literature' },
      { course_code: 'ENG 204H', course_title: 'American Literature II Honors', credit_hours: 3, sub_area: 'Literature' },
      { course_code: 'ENG 205', course_title: 'African American Literature', credit_hours: 3, sub_area: 'Literature' },
      { course_code: 'ENG 205H', course_title: 'African American Literature Honors', credit_hours: 3, sub_area: 'Literature' },
      { course_code: 'ENG 206', course_title: 'British Literature I', credit_hours: 3, sub_area: 'Literature' },
      { course_code: 'ENG 207', course_title: 'British Literature II', credit_hours: 3, sub_area: 'Literature' },
      // Humanities
      { course_code: 'HUM 201', course_title: 'Introduction to Humanities I', credit_hours: 3, sub_area: 'Humanities' },
      { course_code: 'HUM 202', course_title: 'Introduction to Humanities II', credit_hours: 3, sub_area: 'Humanities' },
      { course_code: 'PHI 200', course_title: 'Introduction to Philosophy', credit_hours: 3, sub_area: 'Humanities' },
      { course_code: 'PHI 201', course_title: 'Introduction to Ethics', credit_hours: 3, sub_area: 'Humanities' },
      { course_code: 'REL 200', course_title: 'Introduction to Religion', credit_hours: 3, sub_area: 'Humanities' },
      { course_code: 'FRE 101', course_title: 'Elementary French I', credit_hours: 3, sub_area: 'Humanities' },
      { course_code: 'FRE 102', course_title: 'Elementary French II', credit_hours: 3, sub_area: 'Humanities' },
      { course_code: 'SPA 101', course_title: 'Elementary Spanish I', credit_hours: 3, sub_area: 'Humanities' },
      { course_code: 'SPA 102', course_title: 'Elementary Spanish II', credit_hours: 3, sub_area: 'Humanities' },
      { course_code: 'GER 101', course_title: 'Elementary German I', credit_hours: 3, sub_area: 'Humanities' },
      { course_code: 'GER 102', course_title: 'Elementary German II', credit_hours: 3, sub_area: 'Humanities' },
      { course_code: 'CHI 101', course_title: 'Elementary Chinese I', credit_hours: 3, sub_area: 'Humanities' },
      { course_code: 'CHI 102', course_title: 'Elementary Chinese II', credit_hours: 3, sub_area: 'Humanities' },
      { course_code: 'ARB 101', course_title: 'Elementary Arabic I', credit_hours: 3, sub_area: 'Humanities' },
    ]
  },
  {
    code: 'AREA_III',
    name: 'Area III – Natural Sciences and Mathematics',
    min_hours: 11,
    bulletin_year: '2025-2026',
    courses: [
      // Mathematics — AAMU uses MTH prefix (not MAT)
      { course_code: 'MTH 110', course_title: 'Finite Mathematics', credit_hours: 3, sub_area: 'Mathematics' },
      { course_code: 'MTH 112', course_title: 'Pre-Calculus Algebra', credit_hours: 3, sub_area: 'Mathematics' },
      { course_code: 'MTH 113', course_title: 'Pre-Calculus Trigonometry', credit_hours: 3, sub_area: 'Mathematics' },
      { course_code: 'MTH 115', course_title: 'Pre-Calculus', credit_hours: 3, sub_area: 'Mathematics' },
      { course_code: 'MTH 125', course_title: 'Calculus I', credit_hours: 4, sub_area: 'Mathematics' },
      { course_code: 'MTH 126', course_title: 'Calculus II', credit_hours: 4, sub_area: 'Mathematics' },
      { course_code: 'MTH 200', course_title: 'Introduction to Statistics', credit_hours: 3, sub_area: 'Mathematics' },
      { course_code: 'MTH 227', course_title: 'Calculus III', credit_hours: 4, sub_area: 'Mathematics' },
      // Natural Sciences
      { course_code: 'BIO 101', course_title: 'General Biology I', credit_hours: 3, sub_area: 'Natural Sciences' },
      { course_code: 'BIO 101H', course_title: 'General Biology I Honors', credit_hours: 3, sub_area: 'Natural Sciences' },
      { course_code: 'BIO 101L', course_title: 'General Biology I Lab', credit_hours: 1, sub_area: 'Natural Sciences' },
      { course_code: 'BIO 102', course_title: 'General Biology II', credit_hours: 3, sub_area: 'Natural Sciences' },
      { course_code: 'BIO 102L', course_title: 'General Biology II Lab', credit_hours: 1, sub_area: 'Natural Sciences' },
      { course_code: 'CHE 101', course_title: 'General Chemistry I', credit_hours: 3, sub_area: 'Natural Sciences' },
      { course_code: 'CHE 101H', course_title: 'General Chemistry I Honors', credit_hours: 3, sub_area: 'Natural Sciences' },
      { course_code: 'CHE 101L', course_title: 'General Chemistry I Lab', credit_hours: 1, sub_area: 'Natural Sciences' },
      { course_code: 'CHE 101HL', course_title: 'General Chemistry I Lab Honors', credit_hours: 1, sub_area: 'Natural Sciences' },
      { course_code: 'CHE 102', course_title: 'General Chemistry II', credit_hours: 3, sub_area: 'Natural Sciences' },
      { course_code: 'CHE 102H', course_title: 'General Chemistry II Honors', credit_hours: 3, sub_area: 'Natural Sciences' },
      { course_code: 'CHE 102L', course_title: 'General Chemistry II Lab', credit_hours: 1, sub_area: 'Natural Sciences' },
      { course_code: 'CHE 102HL', course_title: 'General Chemistry II Lab Honors', credit_hours: 1, sub_area: 'Natural Sciences' },
      { course_code: 'PHY 201', course_title: 'General Physics I', credit_hours: 3, sub_area: 'Natural Sciences' },
      { course_code: 'PHY 201L', course_title: 'General Physics I Lab', credit_hours: 1, sub_area: 'Natural Sciences' },
      { course_code: 'PHY 202', course_title: 'General Physics II', credit_hours: 3, sub_area: 'Natural Sciences' },
      { course_code: 'PHY 202L', course_title: 'General Physics II Lab', credit_hours: 1, sub_area: 'Natural Sciences' },
      { course_code: 'PHY 211', course_title: 'Engineering Physics I', credit_hours: 3, sub_area: 'Natural Sciences' },
      { course_code: 'PHY 211L', course_title: 'Engineering Physics I Lab', credit_hours: 1, sub_area: 'Natural Sciences' },
      { course_code: 'PHY 212', course_title: 'Engineering Physics II', credit_hours: 3, sub_area: 'Natural Sciences' },
      { course_code: 'PHY 212L', course_title: 'Engineering Physics II Lab', credit_hours: 1, sub_area: 'Natural Sciences' },
      // Physical Sciences
      { course_code: 'ESC 101', course_title: 'Earth Science', credit_hours: 3, sub_area: 'Physical Sciences' },
      { course_code: 'ESC 101L', course_title: 'Earth Science Lab', credit_hours: 1, sub_area: 'Physical Sciences' },
      { course_code: 'GEO 101', course_title: 'Physical Geography', credit_hours: 3, sub_area: 'Physical Sciences' },
      { course_code: 'ENV 100', course_title: 'Introduction to Environmental Science', credit_hours: 3, sub_area: 'Physical Sciences' },
      { course_code: 'ENV 100L', course_title: 'Introduction to Environmental Science Lab', credit_hours: 1, sub_area: 'Physical Sciences' },
      { course_code: 'AST 101', course_title: 'Introduction to Astronomy', credit_hours: 3, sub_area: 'Physical Sciences' },
      { course_code: 'AST 101L', course_title: 'Introduction to Astronomy Lab', credit_hours: 1, sub_area: 'Physical Sciences' },
    ]
  },
  {
    code: 'AREA_IV',
    name: 'Area IV – History, Social, and Behavioral Sciences',
    min_hours: 12,
    bulletin_year: '2025-2026',
    courses: [
      // History
      { course_code: 'HIS 101', course_title: 'World History I', credit_hours: 3, sub_area: 'History' },
      { course_code: 'HIS 101H', course_title: 'World History I Honors', credit_hours: 3, sub_area: 'History' },
      { course_code: 'HIS 102', course_title: 'World History II', credit_hours: 3, sub_area: 'History' },
      { course_code: 'HIS 102H', course_title: 'World History II Honors', credit_hours: 3, sub_area: 'History' },
      { course_code: 'HIS 201', course_title: 'American History I', credit_hours: 3, sub_area: 'History' },
      { course_code: 'HIS 202', course_title: 'American History II', credit_hours: 3, sub_area: 'History' },
      { course_code: 'HIS 211', course_title: 'African American History I', credit_hours: 3, sub_area: 'History' },
      { course_code: 'HIS 212', course_title: 'African American History II', credit_hours: 3, sub_area: 'History' },
      // Economics
      { course_code: 'ECO 201', course_title: 'Principles of Macroeconomics', credit_hours: 3, sub_area: 'Economics' },
      { course_code: 'ECO 202', course_title: 'Principles of Microeconomics', credit_hours: 3, sub_area: 'Economics' },
      // Other Social Sciences
      { course_code: 'GEO 200', course_title: 'Cultural Geography', credit_hours: 3, sub_area: 'Other Social Sciences' },
      { course_code: 'POL 200', course_title: 'American Government', credit_hours: 3, sub_area: 'Other Social Sciences' },
      { course_code: 'POL 201', course_title: 'Introduction to Political Science', credit_hours: 3, sub_area: 'Other Social Sciences' },
      { course_code: 'SOC 200', course_title: 'Introduction to Sociology', credit_hours: 3, sub_area: 'Behavioral Sciences' },
      { course_code: 'PSY 200', course_title: 'Introduction to Psychology', credit_hours: 3, sub_area: 'Behavioral Sciences' },
      { course_code: 'ANT 200', course_title: 'Introduction to Anthropology', credit_hours: 3, sub_area: 'Behavioral Sciences' },
      { course_code: 'CRJ 200', course_title: 'Introduction to Criminal Justice', credit_hours: 3, sub_area: 'Behavioral Sciences' },
      { course_code: 'SWK 200', course_title: 'Introduction to Social Work', credit_hours: 3, sub_area: 'Behavioral Sciences' },
      { course_code: 'FAM 201', course_title: 'Marriage and Family', credit_hours: 3, sub_area: 'Behavioral Sciences' },
    ]
  },
  {
    code: 'AREA_V',
    name: 'Area V – Pre-Professional, Physical Education, and Basic Skills',
    min_hours: 5,
    bulletin_year: '2025-2026',
    courses: [
      // Orientation
      { course_code: 'ORI 101', course_title: 'University Orientation', credit_hours: 1, sub_area: 'Orientation' },
      { course_code: 'ORI 101H', course_title: 'University Orientation Honors', credit_hours: 1, sub_area: 'Orientation' },
      // Health
      { course_code: 'HED 200', course_title: 'Health and Wellness', credit_hours: 2, sub_area: 'Health' },
      { course_code: 'HED 201', course_title: 'Personal Health', credit_hours: 2, sub_area: 'Health' },
      // Physical Education
      { course_code: 'PED 100', course_title: 'Physical Education Activity I', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 101', course_title: 'Beginning Swimming', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 102', course_title: 'Beginning Tennis', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 103', course_title: 'Beginning Golf', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 104', course_title: 'Beginning Bowling', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 105', course_title: 'Beginning Badminton', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 106', course_title: 'Beginning Aerobics', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 107', course_title: 'Beginning Basketball', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 108', course_title: 'Weight Training', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 109', course_title: 'Jogging and Fitness', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 110', course_title: 'Beginning Volleyball', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 111', course_title: 'Beginning Softball', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 112', course_title: 'Beginning Soccer', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 200', course_title: 'Advanced Swimming', credit_hours: 1, sub_area: 'Physical Education' },
      { course_code: 'PED 201', course_title: 'Advanced Tennis', credit_hours: 1, sub_area: 'Physical Education' },
      // Military Science
      { course_code: 'MIL 101', course_title: 'Introduction to Military Science', credit_hours: 1, sub_area: 'Military Science' },
      { course_code: 'MIL 102', course_title: 'Military Science II', credit_hours: 1, sub_area: 'Military Science' },
      // Computer Literacy
      { course_code: 'CSC 100', course_title: 'Computer Literacy', credit_hours: 3, sub_area: 'Computer Literacy' },
      { course_code: 'CSC 101', course_title: 'Introduction to Computing', credit_hours: 3, sub_area: 'Computer Literacy' },
      { course_code: 'BUS 100', course_title: 'Introduction to Business Computing', credit_hours: 3, sub_area: 'Computer Literacy' },
    ]
  }
]

async function seed() {
  for (const area of GE_DATA) {
    const { courses, ...areaData } = area

    // Upsert area
    const { data: areaRow, error: areaErr } = await supabase
      .from('general_education_areas')
      .upsert(areaData, { onConflict: 'code' })
      .select('id')
      .single()

    if (areaErr) {
      console.error(`Failed to upsert area ${area.code}:`, areaErr.message)
      process.exit(1)
    }

    // Upsert courses for this area
    const courseRows = courses.map(c => ({ ...c, area_id: areaRow.id }))
    const { error: courseErr } = await supabase
      .from('general_education_courses')
      .upsert(courseRows, { onConflict: 'area_id,course_code' })

    if (courseErr) {
      console.error(`Failed to upsert courses for ${area.code}:`, courseErr.message)
      process.exit(1)
    }

    console.log(`✓ ${area.name}: ${courses.length} courses`)
  }

  console.log('\nGE course seeding complete.')
}

seed()
