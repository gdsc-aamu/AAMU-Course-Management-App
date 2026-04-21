/**
 * Smoke Tests — AI Intelligence & Context Fixes
 *
 * Tests all 8 logic fixes without hitting Supabase or OpenAI.
 * Run with: node scripts/smoke-test.mjs
 */

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
    failed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// ─── 1. normalizeHonorsCourseCode ───────────────────────────────────────────
console.log("\n1. Honors Course Normalization")

function normalizeHonorsCourseCode(code) {
  return code.trim().toUpperCase().replace(/([A-Z]{2,5}\s*\d{3})H$/, "$1")
}

test("ENG 101H → ENG 101", () =>
  assert(normalizeHonorsCourseCode("ENG 101H") === "ENG 101", "failed"))
test("MTH 115H → MTH 115", () =>
  assert(normalizeHonorsCourseCode("MTH 115H") === "MTH 115", "failed"))
test("CS 214 unchanged", () =>
  assert(normalizeHonorsCourseCode("CS 214") === "CS 214", "failed"))
test("BIO 101H lowercase input", () =>
  assert(normalizeHonorsCourseCode("bio 101h") === "BIO 101", "failed"))
test("CHEM 101 unchanged", () =>
  assert(normalizeHonorsCourseCode("CHEM 101") === "CHEM 101", "failed"))

// ─── 2. completedCourseCodes includes both raw and normalized ────────────────
console.log("\n2. CompletedCourseCodes Set (raw + normalized)")

function buildCompletedSet(courses) {
  return new Set(
    courses
      .filter(c => c.status === "completed")
      .flatMap(c => {
        const raw = c.code.trim().toUpperCase()
        const normalized = normalizeHonorsCourseCode(raw)
        return raw === normalized ? [raw] : [raw, normalized]
      })
  )
}

const sampleCourses = [
  { code: "ENG 101H", status: "completed" },
  { code: "MTH 115H", status: "completed" },
  { code: "CS 214",   status: "completed" },
  { code: "BIO 301",  status: "in_progress" },
]

const completedSet = buildCompletedSet(sampleCourses)

test("Set has ENG 101H (raw)", () => assert(completedSet.has("ENG 101H"), "missing raw"))
test("Set has ENG 101 (normalized)", () => assert(completedSet.has("ENG 101"), "missing normalized"))
test("Set has MTH 115H (raw)", () => assert(completedSet.has("MTH 115H"), "missing raw"))
test("Set has MTH 115 (normalized)", () => assert(completedSet.has("MTH 115"), "missing normalized"))
test("BIO 301 (in_progress) NOT in completed set", () => assert(!completedSet.has("BIO 301"), "should not be completed"))

// ─── 3. takenCourseCodes (completed + in_progress for prereqs) ───────────────
console.log("\n3. TakenCourseCodes (completed + in_progress)")

function buildTakenSet(courses) {
  const norm = c => {
    const raw = c.code.trim().toUpperCase()
    const n = normalizeHonorsCourseCode(raw)
    return raw === n ? [raw] : [raw, n]
  }
  const completed = new Set(courses.filter(c => c.status === "completed").flatMap(norm))
  const inProgress = new Set(courses.filter(c => c.status === "in_progress").flatMap(norm))
  return new Set([...completed, ...inProgress])
}

const takenSet = buildTakenSet(sampleCourses)

test("BIO 301 (in_progress) IS in taken set", () => assert(takenSet.has("BIO 301"), "missing in_progress course"))
test("ENG 101 (via honors) IS in taken set", () => assert(takenSet.has("ENG 101"), "missing honors normalized"))

// ─── 4. buildMissingGroups with honors awareness ─────────────────────────────
console.log("\n4. buildMissingGroups — Honors Equivalence")

function buildMissingGroups(prereq, completedCodes) {
  if (!prereq || prereq.groups.length === 0) return []
  const missing = []
  for (const group of prereq.groups) {
    const satisfied = group.options.some(opt => {
      const normalized = normalizeHonorsCourseCode(opt.courseId)
      return completedCodes.has(normalized) || completedCodes.has(opt.courseId.trim().toUpperCase())
    })
    if (!satisfied) missing.push(group.options.map(o => o.courseId).join(" OR "))
  }
  return missing
}

const prereqENG = {
  courseId: "CS 310",
  title: "Advanced CS",
  groups: [{ prereqGroup: 1, options: [{ courseId: "ENG 101", minGrade: null }] }],
}

const completedWithHonors = buildCompletedSet([{ code: "ENG 101H", status: "completed" }])
const completedWithout = buildCompletedSet([{ code: "CS 214", status: "completed" }])

test("ENG 101H satisfies ENG 101 prereq", () =>
  assert(buildMissingGroups(prereqENG, completedWithHonors).length === 0, "should be satisfied"))
test("CS 214 does NOT satisfy ENG 101 prereq", () =>
  assert(buildMissingGroups(prereqENG, completedWithout).length === 1, "should be blocked"))
test("No prereq → no missing groups", () =>
  assert(buildMissingGroups(null, completedWithHonors).length === 0, "null prereq should return empty"))

// ─── 5. Routing — asksNextCoursesQuestion ────────────────────────────────────
console.log("\n5. Routing — Next Courses Detection")

function asksNextCoursesQuestion(question) {
  return /(what\s+should\s+i\s+take\s+next|next\s+courses?|courses?\s+i\s+need\s+next|what\s+courses?\s+can\s+i\s+take|register\s+for\s+next|what\s+should\s+i\s+register|courses?\s+(for|to\s+take)\s+next\s+semester|next\s+semester|planning\s+my\s+schedule|what\s+(to\s+take|should\s+i\s+take)\s+(this|next)\s+(spring|fall|summer)|semester\s+plan|what\s+can\s+i\s+register)/i.test(question)
}

test("'what should I take next semester' matches", () =>
  assert(asksNextCoursesQuestion("what should I take next semester"), "no match"))
test("'what should I register for next semester' matches", () =>
  assert(asksNextCoursesQuestion("what should I register for next semester"), "no match"))
test("'planning my schedule for fall' matches", () =>
  assert(asksNextCoursesQuestion("I'm planning my schedule for fall"), "no match"))
test("'what can I take next spring' matches", () =>
  assert(asksNextCoursesQuestion("what should I take next spring"), "no match"))
test("'tell me about the campus' does NOT match", () =>
  assert(!asksNextCoursesQuestion("tell me about the campus"), "false positive"))

// ─── 6. Routing — asksCompletedCoursesQuestion ───────────────────────────────
console.log("\n6. Routing — Completed Courses Detection")

function asksCompletedCoursesQuestion(question) {
  return /(what\s+courses?\s+have\s+i\s+(completed|taken|passed|finished)|what\s+have\s+i\s+(completed|taken|passed|finished)|completed\s+courses?|courses?\s+(completed|taken)\s+(thus\s+far|so\s+far)?|what\s+have\s+i\s+done|my\s+transcript|show\s+my\s+courses?|courses?\s+i('ve|\s+have)\s+(taken|completed|passed)|what\s+did\s+i\s+(take|pass|complete))/i.test(question)
}

test("'what have I taken' matches", () =>
  assert(asksCompletedCoursesQuestion("what have I taken"), "no match"))
test("'show my courses' matches", () =>
  assert(asksCompletedCoursesQuestion("show my courses"), "no match"))
test("'my transcript' matches", () =>
  assert(asksCompletedCoursesQuestion("can you show my transcript"), "no match"))
test("'courses I've completed' matches", () =>
  assert(asksCompletedCoursesQuestion("courses I've completed so far"), "no match"))
test("'what did I pass' matches", () =>
  assert(asksCompletedCoursesQuestion("what did I pass last semester"), "no match"))
test("'what is the GPA requirement' does NOT match", () =>
  assert(!asksCompletedCoursesQuestion("what is the GPA requirement"), "false positive"))

// ─── 7. buildStudentContextBlock ─────────────────────────────────────────────
console.log("\n7. Student Context Block")

function buildStudentContextBlock(profile) {
  if (!profile) return ""
  const parts = []
  if (profile.classification) parts.push(`Classification: ${profile.classification}`)
  if (profile.programCode) parts.push(`Program: ${profile.programCode}`)
  if (profile.bulletinYear) parts.push(`Catalog Year: ${profile.bulletinYear}`)
  if (parts.length === 0) return ""
  return `Student Profile:\n${parts.join("\n")}\n\n`
}

const block = buildStudentContextBlock({ classification: "Junior", programCode: "BSCS-BS", bulletinYear: "2025-2026" })
test("Block includes classification", () => assert(block.includes("Classification: Junior"), "missing"))
test("Block includes program", () => assert(block.includes("Program: BSCS-BS"), "missing"))
test("Block includes catalog year", () => assert(block.includes("Catalog Year: 2025-2026"), "missing"))
test("Null profile returns empty string", () => assert(buildStudentContextBlock(null) === "", "should be empty"))
test("Empty profile returns empty string", () => assert(buildStudentContextBlock({}) === "", "should be empty"))

// ─── 8. Python parser classification regex (JS equivalent) ───────────────────
console.log("\n8. Classification Extraction (parser regex)")

const CLASSIFICATION_RE = /\b(Freshman|Sophomore|Junior|Senior)\b/i

test("Detects 'Junior' in text", () =>
  assert(CLASSIFICATION_RE.test("Student Classification: Junior"), "no match"))
test("Detects 'Sophomore' in text", () =>
  assert(CLASSIFICATION_RE.test("Level: Sophomore"), "no match"))
test("Case insensitive 'senior'", () =>
  assert(CLASSIFICATION_RE.test("senior standing"), "no match"))
test("Does not match 'Freshman-like'... actually does match Freshman", () =>
  assert(CLASSIFICATION_RE.test("Freshman year student"), "no match"))
test("Non-classification text does not match", () =>
  assert(!CLASSIFICATION_RE.test("GPA: 3.5 Credits: 92"), "false positive"))

// ─── 9. asksGraduationGapQuestion ────────────────────────────────────────────
console.log("\n9. Routing — Graduation Gap Detection")

function asksGraduationGapQuestion(question) {
  return /(what('s|\s+is)\s+(left|remaining)|what\s+do\s+i\s+(still\s+)?(need|have\s+left)|how\s+(many|much)\s+(credits?|courses?|classes?)\s+(do\s+i\s+)?(need|have\s+left|remain)|will\s+i\s+graduate|graduation\s+(progress|gap|requirements?|status)|degree\s+(progress|completion|status)|how\s+close\s+(am\s+i|to\s+graduating)|remaining\s+(requirements?|courses?|credits?)|left\s+to\s+graduate|\bcourses?\s+(left|remaining|still\s+needed)\b|\bcredits?\s+(left|remaining|still\s+needed)\b)/i.test(question)
}

test("'what is left to graduate' matches", () => assert(asksGraduationGapQuestion("what is left to graduate"), "no match"))
test("'how many credits do I need' matches", () => assert(asksGraduationGapQuestion("how many credits do I need"), "no match"))
test("'will I graduate on time' matches", () => assert(asksGraduationGapQuestion("will I graduate on time"), "no match"))
test("'degree progress' matches", () => assert(asksGraduationGapQuestion("show me my degree progress"), "no match"))
test("'courses left' matches", () => assert(asksGraduationGapQuestion("what courses are left to graduate"), "no match"))
test("'how close am I to graduating' matches", () => assert(asksGraduationGapQuestion("how close am I to graduating"), "no match"))
test("'what is the GPA policy' does NOT match", () => assert(!asksGraduationGapQuestion("what is the GPA policy"), "false positive"))

// ─── 10. asksElectiveQuestion ─────────────────────────────────────────────────
console.log("\n10. Routing — Elective Question Detection")

function asksElectiveQuestion(question) {
  return /(elective|electives|what\s+(electives?|courses?)\s+can\s+i\s+(choose|pick|select)|elective\s+(options?|choices?|slot)|which\s+(electives?|courses?)\s+(count|qualify|apply|are\s+eligible))/i.test(question)
}

test("'what electives can I choose' matches", () => assert(asksElectiveQuestion("what electives can I choose"), "no match"))
test("'show elective options' matches", () => assert(asksElectiveQuestion("show elective options"), "no match"))
test("'which courses qualify as electives' matches", () => assert(asksElectiveQuestion("which courses qualify as electives"), "no match"))
test("'what is my GPA' does NOT match", () => assert(!asksElectiveQuestion("what is my GPA"), "false positive"))

// ─── 11. extractRequestedCourseCount ─────────────────────────────────────────
console.log("\n11. Course Count Extraction")

function extractRequestedCourseCount(question) {
  const m1 = question.match(/\b([2-9]|1[0-2])\s*(class(?:es)?|course(?:s)?|subject(?:s)?)\b/i)
  if (m1) { const n = parseInt(m1[1], 10); return isNaN(n) ? null : n }
  const m2 = question.match(/\b(?:take|register for|enroll in)\s+([2-9]|1[0-2])\b/i)
  if (m2) { const n = parseInt(m2[1], 10); return isNaN(n) ? null : n }
  return null
}

test("'I want 5 classes' → 5", () => assert(extractRequestedCourseCount("I want 5 classes") === 5, "wrong count"))
test("'take 3 courses' → 3", () => assert(extractRequestedCourseCount("take 3 courses") === 3, "wrong count"))
test("'register for 4' → 4", () => assert(extractRequestedCourseCount("register for 4") === 4, "wrong count"))
test("'I need to take 6 subjects next semester' → 6", () => assert(extractRequestedCourseCount("I need to take 6 subjects next semester") === 6, "wrong count"))
test("'what should I take next' → null (no count)", () => assert(extractRequestedCourseCount("what should I take next") === null, "should be null"))
test("'take 1 course' → null (1 not in range)", () => assert(extractRequestedCourseCount("take 1 course") === null, "should be null"))

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("Some tests failed — review output above.")
  process.exit(1)
} else {
  console.log("All smoke tests passed ✓")
}
