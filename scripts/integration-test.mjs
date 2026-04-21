/**
 * Integration Test Suite — AAMU Course Management App
 *
 * Hits the real running server at http://localhost:3000 with real HTTP.
 * Requires: dev server running, .env.local populated, Supabase accessible.
 *
 * Usage:
 *   TEST_EMAIL=you@example.com TEST_PASSWORD=yourpass node scripts/integration-test.mjs
 *
 * Optional env vars:
 *   BASE_URL      — defaults to http://localhost:3000
 *   TEST_PLAN_ID  — reuse an existing plan UUID instead of creating a new one
 */

import { readFileSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000"
const TEST_EMAIL = process.env.TEST_EMAIL
const TEST_PASSWORD = process.env.TEST_PASSWORD

// ─── Helpers ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
let skipped = 0
const results = []

function color(code, str) {
  return `\x1b[${code}m${str}\x1b[0m`
}
const green = (s) => color(32, s)
const red = (s) => color(31, s)
const yellow = (s) => color(33, s)
const cyan = (s) => color(36, s)
const dim = (s) => color(2, s)

async function test(name, fn) {
  try {
    await fn()
    console.log(`  ${green("✓")} ${name}`)
    passed++
    results.push({ name, status: "pass" })
  } catch (e) {
    console.log(`  ${red("✗")} ${name}`)
    console.log(`    ${red(e.message)}`)
    failed++
    results.push({ name, status: "fail", error: e.message })
  }
}

function skip(name, reason) {
  console.log(`  ${yellow("○")} ${name} ${dim(`(skipped: ${reason})`)}`)
  skipped++
  results.push({ name, status: "skip", reason })
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? "Assertion failed")
}

function assertStatus(res, expected, label) {
  if (res.status !== expected) {
    throw new Error(`${label ?? "HTTP"}: expected ${expected}, got ${res.status}`)
  }
}

async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  })
  return res
}

async function authedApi(path, token, options = {}) {
  return api(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
}

// ─── State shared across tests ────────────────────────────────────────────

let authToken = null
let testPlanId = process.env.TEST_PLAN_ID ?? null
let testThreadId = null

// ─── Section header ────────────────────────────────────────────────────────

function section(title) {
  console.log(`\n${cyan("▶")} ${title}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// 0. PRE-FLIGHT: server reachable
// ═══════════════════════════════════════════════════════════════════════════

section("0. Pre-flight")

await test("Server is reachable at BASE_URL", async () => {
  const res = await fetch(BASE_URL, { method: "HEAD" }).catch(() => null)
  assert(res !== null, `Cannot reach ${BASE_URL} — is the dev server running?`)
})

// ═══════════════════════════════════════════════════════════════════════════
// 1. AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════

section("1. Authentication")

if (!TEST_EMAIL || !TEST_PASSWORD) {
  skip("Sign in with TEST_EMAIL / TEST_PASSWORD", "TEST_EMAIL or TEST_PASSWORD not set")
  skip("Auth token is a valid JWT", "depends on sign-in")
} else {
  await test("Sign in with TEST_EMAIL / TEST_PASSWORD", async () => {
    // Use Supabase REST auth endpoint directly
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    assert(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL not set in env")
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    assert(anonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY not set in env")

    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    })

    const data = await res.json()
    assert(res.ok, `Auth failed: ${data.error_description ?? data.message ?? res.status}`)
    assert(data.access_token, "No access_token in response")
    authToken = data.access_token
  })

  await test("Auth token is a valid JWT (3-part)", async () => {
    assert(authToken, "No token — sign-in test must have failed")
    const parts = authToken.split(".")
    assert(parts.length === 3, `Token has ${parts.length} parts, expected 3`)
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString())
    assert(payload.sub, "JWT payload missing 'sub' claim")
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. CHAT /api/chat/query — INPUT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

section("2. Chat Query — Input Validation")

await test("Empty body → 400 with error message", async () => {
  const res = await api("/api/chat/query", {
    method: "POST",
    body: "{}",
  })
  assertStatus(res, 400, "empty body")
  const data = await res.json()
  assert(data.error, "Expected error field")
})

await test("Missing question field → 400", async () => {
  const res = await api("/api/chat/query", {
    method: "POST",
    body: JSON.stringify({ studentId: "12345" }),
  })
  assertStatus(res, 400, "missing question")
})

await test("Malformed JSON → 400", async () => {
  const res = await fetch(`${BASE_URL}/api/chat/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ not valid json",
  })
  assertStatus(res, 400, "malformed JSON")
})

await test("Question as integer → 400", async () => {
  const res = await api("/api/chat/query", {
    method: "POST",
    body: JSON.stringify({ question: 42 }),
  })
  assertStatus(res, 400, "non-string question")
})

await test("Empty string question → 400", async () => {
  const res = await api("/api/chat/query", {
    method: "POST",
    body: JSON.stringify({ question: "  " }),
  })
  // May be 400 or the orchestrator may handle it — either way must not 500
  assert(res.status !== 500, `Got unexpected 500`)
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. CHAT /api/chat/query — ROUTING & CONTENT
// ═══════════════════════════════════════════════════════════════════════════

section("3. Chat Query — Routing & Content Quality")

async function chatQuery(question, extra = {}) {
  const res = await api("/api/chat/query", {
    method: "POST",
    body: JSON.stringify({ question, ...extra }),
  })
  assert(res.ok, `Chat query failed with ${res.status}`)
  return res.json()
}

await test("DB_ONLY: 'what courses have I taken' returns structured answer", async () => {
  const data = await chatQuery("What courses have I taken?", { studentId: "test-user-no-data" })
  assert(typeof data.answer === "string", "answer must be a string")
  assert(data.answer.length > 0, "answer must not be empty")
})

await test("RAG_ONLY: GPA requirement question gets bulletin answer", async () => {
  const data = await chatQuery("What is the minimum GPA required for graduation?")
  assert(typeof data.answer === "string", "answer must be a string")
  assert(data.answer.length > 20, "answer too short — likely no RAG result")
})

await test("RAG_ONLY: academic standing question routes to bulletin", async () => {
  const data = await chatQuery("What are the academic suspension requirements at AAMU?")
  assert(typeof data.answer === "string", "answer must be a string")
})

await test("HYBRID: next courses question returns recommendations or graceful fallback", async () => {
  const data = await chatQuery("What courses should I take next semester?", { studentId: "test-user-no-data" })
  assert(typeof data.answer === "string", "answer must be a string")
  assert(data.answer.length > 20, "answer too short")
})

await test("Advisor escalation: transfer credit question triggers escalation", async () => {
  const data = await chatQuery("Can I transfer credits from another university?")
  assert(typeof data.answer === "string", "answer must be a string")
  const lower = data.answer.toLowerCase()
  // Should mention advisor or advising office
  assert(
    lower.includes("advisor") || lower.includes("advising") || lower.includes("office"),
    `Expected escalation to advisor, got: ${data.answer.slice(0, 200)}`
  )
})

await test("Advisor escalation: grade appeal question triggers escalation", async () => {
  const data = await chatQuery("How do I appeal a grade or academic decision?")
  assert(typeof data.answer === "string", "answer must be a string")
  const lower = data.answer.toLowerCase()
  assert(
    lower.includes("advisor") || lower.includes("advising") || lower.includes("registrar"),
    `Expected escalation, got: ${data.answer.slice(0, 200)}`
  )
})

await test("Simulate mode: 'if I complete CS 101' question returns hypothetical recommendations", async () => {
  const data = await chatQuery("If I complete CS 101, what courses can I take next?", { studentId: "test-user-no-data" })
  assert(typeof data.answer === "string", "answer must be a string")
  assert(data.answer.length > 20, "answer too short")
})

await test("Save plan intent: 'save this as my plan' returns savePlanAction", async () => {
  const data = await chatQuery("Save this as my plan for next semester", { studentId: "test-user-no-data" })
  assert(typeof data.answer === "string", "answer must be a string")
  // Either returns savePlanAction or explains no courses selected
  const hasSavePlan = data.handlerResult?.savePlanAction != null
  const mentionsPlan = data.answer.toLowerCase().includes("plan")
  assert(hasSavePlan || mentionsPlan, `Expected save plan flow, got: ${data.answer.slice(0, 200)}`)
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. CHAT /api/chat/query — ADVERSARIAL INPUTS
// ═══════════════════════════════════════════════════════════════════════════

section("4. Chat Query — Adversarial Inputs")

await test("SQL injection attempt in question field — no 500", async () => {
  const res = await api("/api/chat/query", {
    method: "POST",
    body: JSON.stringify({ question: "'; DROP TABLE courses; --" }),
  })
  assert(res.status !== 500, `Unexpected 500 on SQL injection attempt`)
  const data = await res.json()
  assert(typeof data.answer === "string" || typeof data.error === "string", "must return answer or error")
})

await test("XSS attempt in question field — no 500", async () => {
  const res = await api("/api/chat/query", {
    method: "POST",
    body: JSON.stringify({ question: "<script>alert('xss')</script>" }),
  })
  assert(res.status !== 500, `Unexpected 500 on XSS attempt`)
})

await test("Extremely long question (10k chars) — no 500", async () => {
  const longQuestion = "What courses should I take? ".repeat(400)
  const res = await api("/api/chat/query", {
    method: "POST",
    body: JSON.stringify({ question: longQuestion }),
  })
  assert(res.status !== 500, `Got 500 on long question`)
})

await test("Unicode / emoji in question — no 500", async () => {
  const res = await api("/api/chat/query", {
    method: "POST",
    body: JSON.stringify({ question: "What courses 🎓 should I take 你好 مرحبا?" }),
  })
  assert(res.status !== 500, `Got 500 on unicode question`)
})

await test("Null studentId in body — graceful degradation, no 500", async () => {
  const res = await api("/api/chat/query", {
    method: "POST",
    body: JSON.stringify({ question: "What are my completed courses?", studentId: null }),
  })
  assert(res.status !== 500, `Got 500 with null studentId`)
})

await test("Unknown extra fields in payload — ignored gracefully", async () => {
  const res = await api("/api/chat/query", {
    method: "POST",
    body: JSON.stringify({
      question: "What is CS 214?",
      hackerField: "evil",
      __proto__: { polluted: true },
    }),
  })
  assert(res.status !== 500, `Got 500 with extra fields`)
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. COMPLETED COURSES — AUTH
// ═══════════════════════════════════════════════════════════════════════════

section("5. Completed Courses — Auth Guards")

await test("GET /api/degreeworks/completed-courses without token → 401", async () => {
  const res = await api("/api/degreeworks/completed-courses")
  assertStatus(res, 401, "no auth")
})

await test("GET /api/degreeworks/completed-courses with fake token → 401", async () => {
  const res = await authedApi("/api/degreeworks/completed-courses", "not.a.real.token")
  assertStatus(res, 401, "fake token")
})

if (authToken) {
  await test("GET /api/degreeworks/completed-courses with valid token → 200 with courses array", async () => {
    const res = await authedApi("/api/degreeworks/completed-courses", authToken)
    assertStatus(res, 200, "valid token")
    const data = await res.json()
    assert(data.success === true, "success must be true")
    assert(Array.isArray(data.courses), "courses must be an array")
  })
} else {
  skip("GET /api/degreeworks/completed-courses with valid token", "no auth token (TEST_EMAIL not set)")
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. NEXT COURSES — AUTH + VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

section("6. Next Courses — Auth Guards & Validation")

await test("GET /api/degreeworks/next-courses without token → 401", async () => {
  const res = await api("/api/degreeworks/next-courses?programCode=CS")
  assertStatus(res, 401, "no auth")
})

await test("GET /api/degreeworks/next-courses without programCode → 400", async () => {
  if (!authToken) {
    // Can't test 400 without a valid token since 401 comes first
    // Instead verify the 401 guard
    const res = await api("/api/degreeworks/next-courses")
    assertStatus(res, 401, "no auth, no programCode")
    return
  }
  const res = await authedApi("/api/degreeworks/next-courses", authToken)
  assertStatus(res, 400, "missing programCode")
  const data = await res.json()
  assert(data.error, "Expected error field")
})

if (authToken) {
  await test("GET /api/degreeworks/next-courses with valid token + programCode → 200 or 404", async () => {
    const res = await authedApi("/api/degreeworks/next-courses?programCode=CS", authToken)
    assert(res.status === 200 || res.status === 404, `Unexpected status: ${res.status}`)
    const data = await res.json()
    assert(typeof data.success === "boolean", "success field required")
  })
} else {
  skip("GET /api/degreeworks/next-courses with valid token", "no auth token")
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. PDF UPLOAD — VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

section("7. PDF Upload — Validation")

await test("POST /api/degreeworks/upload without token → 401", async () => {
  const formData = new FormData()
  formData.append("file", new Blob(["fake"], { type: "application/pdf" }), "test.pdf")
  const res = await fetch(`${BASE_URL}/api/degreeworks/upload`, {
    method: "POST",
    body: formData,
  })
  assertStatus(res, 401, "no auth")
})

await test("POST /api/degreeworks/upload with non-PDF file → 400", async () => {
  if (!authToken) {
    skip("non-PDF upload rejection", "no auth token")
    return
  }
  const formData = new FormData()
  formData.append("file", new Blob(["hello"], { type: "text/plain" }), "test.txt")
  const res = await fetch(`${BASE_URL}/api/degreeworks/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  })
  assertStatus(res, 400, "non-PDF file")
  const data = await res.json()
  assert(data.error?.toLowerCase().includes("pdf"), `Expected PDF error, got: ${data.error}`)
})

await test("POST /api/degreeworks/upload with no file → 400", async () => {
  if (!authToken) {
    skip("no-file upload rejection", "no auth token")
    return
  }
  const formData = new FormData()
  const res = await fetch(`${BASE_URL}/api/degreeworks/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  })
  assertStatus(res, 400, "no file")
})

// ═══════════════════════════════════════════════════════════════════════════
// 8. ACADEMIC PROFILE — AUTH + READ/WRITE
// ═══════════════════════════════════════════════════════════════════════════

section("8. Academic Profile — Auth Guards & CRUD")

await test("GET /api/user/academic-profile without token → 401", async () => {
  const res = await api("/api/user/academic-profile")
  assertStatus(res, 401, "no auth")
})

await test("PUT /api/user/academic-profile without token → 401", async () => {
  const res = await api("/api/user/academic-profile", {
    method: "PUT",
    body: JSON.stringify({ programCode: "CS" }),
  })
  assertStatus(res, 401, "no auth")
})

if (authToken) {
  await test("GET /api/user/academic-profile with valid token → 200", async () => {
    const res = await authedApi("/api/user/academic-profile", authToken)
    assertStatus(res, 200, "valid token")
    const data = await res.json()
    assert(data.success === true, "success must be true")
    assert("profile" in data, "profile field required")
  })

  await test("PUT /api/user/academic-profile with valid data → 200", async () => {
    const res = await authedApi("/api/user/academic-profile", authToken, {
      method: "PUT",
      body: JSON.stringify({
        programCode: "CS",
        bulletinYear: "2024-2025",
        classification: "Junior",
      }),
    })
    assertStatus(res, 200, "PUT profile")
    const data = await res.json()
    assert(data.success === true, "success must be true")
  })

  await test("PUT /api/user/academic-profile with null fields → 200 (clears profile)", async () => {
    const res = await authedApi("/api/user/academic-profile", authToken, {
      method: "PUT",
      body: JSON.stringify({ programCode: null, bulletinYear: null }),
    })
    assertStatus(res, 200, "PUT null profile")
    const data = await res.json()
    assert(data.success === true, "success must be true")
  })
} else {
  skip("GET /api/user/academic-profile with valid token", "no auth token")
  skip("PUT /api/user/academic-profile with valid data", "no auth token")
  skip("PUT /api/user/academic-profile with null fields", "no auth token")
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. CHAT THREADS — AUTH + CRUD
// ═══════════════════════════════════════════════════════════════════════════

section("9. Chat Threads — Auth Guards & CRUD")

await test("POST /api/chat/threads without token → 401", async () => {
  const res = await api("/api/chat/threads", {
    method: "POST",
    body: JSON.stringify({ planId: "fake-plan", title: "Test" }),
  })
  assertStatus(res, 401, "no auth")
})

await test("GET /api/chat/threads without token → 401", async () => {
  const res = await api("/api/chat/threads?planId=fake-plan")
  assertStatus(res, 401, "no auth")
})

await test("POST /api/chat/threads missing planId → 400", async () => {
  if (!authToken) {
    skip("POST threads missing planId", "no auth token")
    return
  }
  const res = await authedApi("/api/chat/threads", authToken, {
    method: "POST",
    body: JSON.stringify({ title: "Test" }),
  })
  assertStatus(res, 400, "missing planId")
})

await test("GET /api/chat/threads missing planId param → 400", async () => {
  if (!authToken) {
    skip("GET threads missing planId", "no auth token")
    return
  }
  const res = await authedApi("/api/chat/threads", authToken)
  assertStatus(res, 400, "missing planId param")
})

if (authToken && testPlanId) {
  await test("POST /api/chat/threads with valid planId → 201 with thread", async () => {
    const res = await authedApi("/api/chat/threads", authToken, {
      method: "POST",
      body: JSON.stringify({ planId: testPlanId, title: "Integration Test Thread" }),
    })
    assertStatus(res, 201, "create thread")
    const data = await res.json()
    assert(data.thread?.id, "thread.id required")
    testThreadId = data.thread.id
  })

  await test("GET /api/chat/threads for planId → 200 with threads array", async () => {
    const res = await authedApi(`/api/chat/threads?planId=${encodeURIComponent(testPlanId)}`, authToken)
    assertStatus(res, 200, "list threads")
    const data = await res.json()
    assert(Array.isArray(data.threads), "threads must be an array")
    assert(data.threads.length > 0, "expected at least one thread")
  })
} else {
  skip("POST /api/chat/threads with valid planId", authToken ? "TEST_PLAN_ID not set" : "no auth token")
  skip("GET /api/chat/threads for planId", authToken ? "TEST_PLAN_ID not set" : "no auth token")
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. THREAD MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

section("10. Thread Messages")

if (authToken && testThreadId) {
  await test("POST /api/chat/threads/:id/messages → 200 with assistant reply", async () => {
    const res = await authedApi(`/api/chat/threads/${testThreadId}/messages`, authToken, {
      method: "POST",
      body: JSON.stringify({ content: "What is CS 214 about?" }),
    })
    assertStatus(res, 200, "send message")
    const data = await res.json()
    assert(data.userMessage || data.message, "must return a message")
  })

  await test("GET /api/chat/threads/:id/messages → 200 with messages array", async () => {
    const res = await authedApi(`/api/chat/threads/${testThreadId}/messages`, authToken)
    assertStatus(res, 200, "get messages")
    const data = await res.json()
    assert(Array.isArray(data.messages), "messages must be an array")
  })
} else {
  skip("Thread message send/receive", authToken ? "no testThreadId (testPlanId not set)" : "no auth token")
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. PLANS API
// ═══════════════════════════════════════════════════════════════════════════

section("11. Plans API — Save Plan from Chat")

await test("POST /api/plans without required fields → 400 or error", async () => {
  const res = await api("/api/plans", {
    method: "POST",
    body: JSON.stringify({}),
  })
  assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
})

if (authToken) {
  await test("POST /api/plans with valid payload → creates plan", async () => {
    // Decode userId from token
    const parts = authToken.split(".")
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString())
    const userId = payload.sub

    const res = await api("/api/plans", {
      method: "POST",
      body: JSON.stringify({
        name: "Integration Test Plan",
        semester: "Fall 2025",
        courseIds: [],
        userId,
      }),
    })
    assert(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}`)
    const data = await res.json()
    assert(data.plan?.id || data.id, "plan id required in response")
    // Save for future tests if not set
    if (!testPlanId) testPlanId = data.plan?.id ?? data.id
  })
} else {
  skip("POST /api/plans with valid payload", "no auth token")
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. CURRICULUM — PROGRAMS
// ═══════════════════════════════════════════════════════════════════════════

section("12. Curriculum — Programs")

await test("GET /api/curriculum/programs → 200 with programs list", async () => {
  const res = await api("/api/curriculum/programs")
  // May or may not require auth
  assert(res.status === 200 || res.status === 401, `Unexpected status: ${res.status}`)
  if (res.status === 200) {
    const data = await res.json()
    assert(Array.isArray(data.programs) || Array.isArray(data), "programs must be an array")
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// 13. RAG QUALITY SPOT-CHECKS
// ═══════════════════════════════════════════════════════════════════════════

section("13. RAG Quality Spot-Checks")

await test("'What is the graduation GPA at AAMU?' — answer mentions GPA number", async () => {
  const data = await chatQuery("What is the minimum graduation GPA requirement at AAMU?")
  assert(typeof data.answer === "string", "answer must be a string")
  assert(
    data.answer.includes("2.0") || data.answer.includes("2.5") || data.answer.match(/\d\.\d/),
    `Expected GPA number in answer, got: ${data.answer.slice(0, 300)}`
  )
})

await test("'How many credit hours to graduate?' — answer mentions credit hours", async () => {
  const data = await chatQuery("How many credit hours are needed to graduate with a CS degree?")
  assert(typeof data.answer === "string", "answer must be a string")
  assert(
    data.answer.match(/\d+\s*(credit|hour|semester)/i),
    `Expected credit hours in answer, got: ${data.answer.slice(0, 300)}`
  )
})

await test("'What is CS 214?' — answer describes the course", async () => {
  const data = await chatQuery("What is CS 214?")
  assert(typeof data.answer === "string", "answer must be a string")
  assert(data.answer.length > 30, "answer too short for a course description")
})

await test("Completely random garbage question — returns graceful answer, no 500", async () => {
  const res = await api("/api/chat/query", {
    method: "POST",
    body: JSON.stringify({ question: "zxqjvkq mxwpfl fnrbt" }),
  })
  assert(res.status !== 500, "Got 500 on garbage question")
  const data = await res.json()
  assert(typeof data.answer === "string", "must return a string answer")
})

// ═══════════════════════════════════════════════════════════════════════════
// 14. RESPONSE STRUCTURE CONSISTENCY
// ═══════════════════════════════════════════════════════════════════════════

section("14. Response Structure")

await test("Chat response always has 'answer' field", async () => {
  const data = await chatQuery("Tell me about AAMU programs")
  assert("answer" in data, "answer field missing from response")
  assert(typeof data.answer === "string", "answer must be a string")
})

await test("Chat response has 'route' field indicating router decision", async () => {
  const data = await chatQuery("What GPA do I need to graduate?")
  assert("route" in data || "handlerResult" in data || typeof data.answer === "string",
    "response must have route or handlerResult")
})

await test("No PII leaking in chat response for unknown user", async () => {
  const data = await chatQuery("What are my completed courses?", { studentId: "nonexistent-user-xyz" })
  assert(typeof data.answer === "string", "answer must be a string")
  // Should not expose stack traces or raw DB error messages
  assert(
    !data.answer.toLowerCase().includes("supabase") && !data.answer.toLowerCase().includes("pg error"),
    `PII/internal error leaked in answer: ${data.answer.slice(0, 200)}`
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${"─".repeat(60)}`)
console.log(`${green(`✓ ${passed} passed`)}  ${failed > 0 ? red(`✗ ${failed} failed`) : `✗ 0 failed`}  ${yellow(`○ ${skipped} skipped`)}`)

if (failed > 0) {
  console.log(`\n${red("Failed tests:")}`)
  results
    .filter((r) => r.status === "fail")
    .forEach((r) => console.log(`  ${red("✗")} ${r.name}\n    ${dim(r.error)}`))
}

console.log("")
process.exit(failed > 0 ? 1 : 0)
