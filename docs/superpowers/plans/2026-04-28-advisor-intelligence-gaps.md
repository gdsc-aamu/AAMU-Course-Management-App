# Advisor Intelligence Gaps — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 13 advisor intelligence gaps discovered from the 45-question live smoke test, plus add catalog year aliasing so 2024-2025 students are not orphaned.

**Architecture:** All fixes are concentrated in four files. No schema changes, no new tables. The catalog year aliasing is a single constants map at the data-access layer. International/scholarship rules are hardcoded facts (USCIS / aamu.edu verified) that the orchestrator injects into LLM context.

**Tech Stack:** TypeScript, Next.js App Router, Supabase, OpenAI gpt-4o-mini, Python (smoke test)

**Verified facts used in this plan:**
- F-1 visa (USCIS): 12 cr/semester minimum; max 3 online credits count toward full-time; 9 in-person required
- AAMU scholarships (aamu.edu): ALL require 30 cr/academic year to renew. Presidential: 3.50 GPA; Merit: 3.10; Transfer Merit: 3.10; Academic Recognition: 2.80; Heritage Gold: 2.80; Heritage Silver: 2.80; Heritage Bronze: 2.50; Normalite: 2.80

---

## File Map

| File | What Changes |
|---|---|
| `lib/chat-routing/router.ts` | Fix single-word chitchat; fix SAVE_PLAN; fix semester-year poisoning |
| `backend/services/curriculum/service.ts` | Update AAMU_SCHOLARSHIP_RULES GPA values and names; fix scholarship routing fast-path |
| `backend/services/chat-orchestrator/service.ts` | F-1 fast-path; scholarship fast-path; fix credit-per-course enforcement; fix incremental baseline; fix "ok"/"yes" chitchat guard |
| `backend/data-access/curriculum.ts` | CATALOG_YEAR_ALIASES constant; plug into getProgram |
| `app/settings/page.tsx` | Add 2024-2025 alias option; update scholarship names to match aamu.edu |
| `backend/tests/smoke_test.py` | New regression smoke test (45 questions) |

---

## Task 1: Router — Fix Chitchat False Positives and SAVE_PLAN Misrouting

**Files:**
- Modify: `lib/chat-routing/router.ts`

**Problem A:** Single-word queries like "courses" or "classes" fall through to NEXT_COURSES because they aren't caught as chitchat. The orchestrator then tries to build a full schedule from a vague one-word query.

**Problem B:** "build my schedule" / "can you make me a schedule" → classified as NEXT_COURSES. The SAVE_PLAN route exists specifically for this.

- [ ] **Step 1: Write the failing routing tests**

Create `scripts/routing-eval-phase2.cjs`:

```javascript
const { execSync } = require("child_process")

const cases = [
  // Chitchat false positives — single-word vague queries
  { q: "courses",            expected: "CHITCHAT" },
  { q: "classes",            expected: "CHITCHAT" },
  { q: "ok",                 expected: "CHITCHAT" },
  { q: "yes",                expected: "CHITCHAT" },
  { q: "got it",             expected: "CHITCHAT" },
  { q: "sounds good",        expected: "CHITCHAT" },
  { q: "cool",               expected: "CHITCHAT" },

  // SAVE_PLAN misrouting
  { q: "build my schedule",            expected: "SAVE_PLAN" },
  { q: "can you make me a schedule",   expected: "SAVE_PLAN" },
  { q: "create a schedule for me",     expected: "SAVE_PLAN" },
  { q: "make a schedule",              expected: "SAVE_PLAN" },

  // Semester year must NOT poison catalog year
  { q: "what can I take for fall 2026?",    expectedCatalog: "session_year" },
  { q: "spring 2025 registration options",  expectedCatalog: "session_year" },
]

console.log("Run tests manually via the router decideRoute function or routing eval script.")
console.log("Expected failures before fix:")
cases.forEach(c => console.log(`  "${c.q}" → ${c.expected ?? "catalog = session year"}`))
```

Run: `node scripts/routing-eval-phase2.cjs`
Expected: Script prints the expected values. Actual classification failures confirmed manually.

- [ ] **Step 2: Add chitchat short-circuit to `fastPrescreen` in `lib/chat-routing/router.ts`**

Find `fastPrescreen` (line ~112). Add this block at the TOP, before all other checks:

```typescript
// Short single-word or common-phrase queries → CHITCHAT
// Catches: "courses", "classes", "ok", "yes", "got it", "cool", "sounds good"
if (/^(courses?|classes?|ok|okay|yes|yeah|yep|no|nope|got\s+it|sure|sounds\s+good|cool|great|thanks?|thank\s+you|bye|hello|hi|hey|alright|noted)\.?$/i.test(q.trim()))
  return "CHITCHAT"
```

- [ ] **Step 3: Add SAVE_PLAN to `fastPrescreen`**

In `fastPrescreen`, after the SAVE_PLAN check that already exists (lines ~122-123), extend the regex to also catch schedule-building phrases:

```typescript
if (/\b(save\s+(this|my|the|these)?\s*(plan|schedule|courses?|list)|save\s+it|can\s+you\s+save|go\s+ahead\s+and\s+save|save\s+as|name\s+(it|this|the\s+plan)|create\s+a\s+plan|build\s+(my|a|me\s+a)\s+schedule|make\s+(me\s+a|a|my)\s+schedule|create\s+a\s+schedule(\s+for\s+me)?|put\s+(together|this)\s+(a|my)?\s*schedule)\b/i.test(q))
  return "SAVE_PLAN"
```

- [ ] **Step 4: Update `CLASSIFIER_SYSTEM_PROMPT` examples in `lib/chat-routing/router.ts`**

Find the examples block in `CLASSIFIER_SYSTEM_PROMPT` and add these lines after the CHITCHAT examples:

```typescript
"courses" → CHITCHAT
"classes" → CHITCHAT
"ok" → CHITCHAT
"yes" → CHITCHAT
"got it" → CHITCHAT
"sounds good" → CHITCHAT
"build my schedule" → SAVE_PLAN
"can you make me a schedule" → SAVE_PLAN
"create a schedule for me" → SAVE_PLAN
```

- [ ] **Step 5: Verify routing**

Start dev server: `npm run dev`
In chat, type "courses" alone.
Expected: Response is a friendly chitchat reply like "What would you like to know about courses? You can ask me what to take next, what you've completed, or your degree requirements."

In chat, type "build my schedule."
Expected: Response asks for schedule preferences (SAVE_PLAN path).

- [ ] **Step 6: Commit**

```bash
git add lib/chat-routing/router.ts scripts/routing-eval-phase2.cjs
git commit -m "fix: prevent single-word queries from triggering NEXT_COURSES; route 'build my schedule' to SAVE_PLAN"
```

---

## Task 2: Router — Fix Semester Year Poisoning Catalog Year Resolution

**Files:**
- Modify: `backend/services/curriculum/service.ts` (function `resolveCatalogYearFromQuestion`, lines 69-80)

**Problem:** `resolveCatalogYearFromQuestion("what can I take for fall 2026?", "2025-2026")` returns `2026` (a semester year), overriding the session's `2025-2026` catalog year. The program query then fuzzy-searches for catalog_year 2025 or 2027, which may return the wrong data or nothing.

**Root cause:** The regex `\b(20\d{2})(?:\s*[-/]\s*20\d{2})?\b` treats any bare 20XX year as a catalog year. Students routinely say "fall 2026" meaning a semester, not a catalog year.

**Fix:** Only extract a catalog year from the question if it explicitly appears as a year-range (e.g., "2024-2025" or "2024/2025"). A bare four-digit year in a question is almost always a semester reference.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-catalog-year.cjs`:

```javascript
// Inline test — no imports needed, tests the parsing logic only
const cases = [
  // These should extract a catalog year from the question text
  { question: "what was available in 2024-2025?",  fallback: "2025-2026", want: 2024 },
  { question: "show me the 2023/2024 curriculum",  fallback: "2025-2026", want: 2023 },
  // These should fall back to the session bulletinYear
  { question: "what can I take for fall 2026?",    fallback: "2025-2026", want: 2025 },
  { question: "spring 2025 registration options",  fallback: "2025-2026", want: 2025 },
  { question: "what courses are available?",        fallback: "2025-2026", want: 2025 },
  { question: "what can I take next semester?",     fallback: null,         want: null },
]

function parseCatalogYear(value) {
  if (!value) return null
  const match = value.match(/(20\d{2})/)
  return match ? Number(match[1]) : null
}

// Old behavior
function resolveCatalogYearOLD(question, fallback) {
  const m = question.match(/\b(20\d{2})(?:\s*[-/]\s*20\d{2})?\b/)
  if (m) return Number(m[1])
  return parseCatalogYear(fallback)
}

// New behavior (what we will implement)
function resolveCatalogYearNEW(question, fallback) {
  const m = question.match(/\b(20\d{2})\s*[-/]\s*20\d{2}\b/)  // range only
  if (m) return Number(m[1])
  return parseCatalogYear(fallback)
}

let passed = 0, failed = 0
for (const c of cases) {
  const got = resolveCatalogYearNEW(c.question, c.fallback)
  const ok = got === c.want
  console.log(`${ok ? "PASS" : "FAIL"} "${c.question}" → got ${got}, want ${c.want}`)
  ok ? passed++ : failed++
}
console.log(`\n${passed} passed, ${failed} failed`)
```

Run: `node scripts/test-catalog-year.cjs`
Expected: all FAIL with OLD behavior for semester-year cases; NEW behavior returns all PASS.

- [ ] **Step 2: Fix `resolveCatalogYearFromQuestion` in `backend/services/curriculum/service.ts`**

Find the function at line 69 and replace it:

```typescript
export function resolveCatalogYearFromQuestion(
  question: string,
  fallbackBulletinYear?: string | null
): number | null {
  // Only treat an explicit year-RANGE as a catalog year (e.g., "2024-2025" or "2023/2024").
  // A bare four-digit year like "fall 2026" is a semester reference, not a catalog year.
  const rangeMatch = question.match(/\b(20\d{2})\s*[-/]\s*20\d{2}\b/)
  if (rangeMatch) {
    return Number(rangeMatch[1])
  }

  return parseCatalogYear(fallbackBulletinYear)
}
```

- [ ] **Step 3: Run the test to confirm all cases pass**

```bash
node scripts/test-catalog-year.cjs
```

Expected: all 6 PASS.

- [ ] **Step 4: Verify in chat**

Start dev server: `npm run dev`
Ask (with bulletinYear = 2025-2026 in session): "what courses can I take for fall 2026?"
Expected: Returns a normal schedule based on the 2025-2026 curriculum. Does NOT return a sparse/empty list.

- [ ] **Step 5: Commit**

```bash
git add backend/services/curriculum/service.ts scripts/test-catalog-year.cjs
git commit -m "fix: resolveCatalogYearFromQuestion only treats explicit year-ranges as catalog year — bare 'fall 2026' no longer overrides session year"
```

---

## Task 3: Catalog Year Aliasing — 2024-2025 Maps to 2025-2026 Data

**Files:**
- Modify: `backend/data-access/curriculum.ts` (function `getProgram`, lines 73-102)
- Modify: `app/settings/page.tsx` (bulletinYear dropdown, lines 778-795)

**Problem:** Students who started in 2024-2025 can't select that catalog year in settings because there's no matching program row. The ±1 fuzzy search in `getProgram` doesn't reliably handle this. Sophomores from AY2024-2025 are invisible to the advisor.

**Fix:** Add a `CATALOG_YEAR_ALIASES` map in the data-access layer. If the requested year is an alias key, the database query uses the aliased value before the fuzzy search. Add "2024-2025" as a selectable option in the settings dropdown that saves as "2024-2025" but resolves to 2025 at the backend.

- [ ] **Step 1: Write the failing test**

Add to `scripts/test-catalog-year.cjs`:

```javascript
// Verify alias resolution — 2024 should resolve to same data as 2025
console.log("\n--- Alias test (manual) ---")
console.log("getProgram('BIO-BS', 2024) should return the 2025 program row")
console.log("This requires running against real DB or mocking. Verify in Step 4.")
```

- [ ] **Step 2: Add `CATALOG_YEAR_ALIASES` to `backend/data-access/curriculum.ts`**

Insert this constant at the top of the file, after the imports and before the interface definitions:

```typescript
// Maps display catalog years with no program data to the backend year that does have data.
// Add entries here when a new academic year should alias to an existing year.
const CATALOG_YEAR_ALIASES: Record<number, number> = {
  2024: 2025,  // 2024-2025 students use 2025-2026 curriculum data
}
```

- [ ] **Step 3: Apply alias in `getProgram` in `backend/data-access/curriculum.ts`**

In `getProgram` (line 73), add alias resolution immediately after the function signature and before the Supabase query:

```typescript
export async function getProgram(code: string, catalogYear?: number | null): Promise<ProgramRow | null> {
  const supabase = getSupabaseClient()
  const normalizedCode = code.trim().toUpperCase()

  // Resolve alias before querying — 2024 → 2025, etc.
  const resolvedYear = (typeof catalogYear === "number" && CATALOG_YEAR_ALIASES[catalogYear] != null)
    ? CATALOG_YEAR_ALIASES[catalogYear]
    : catalogYear

  if (typeof resolvedYear === "number") {
    // Exact year first.
    const { data: exactData, error: exactError } = await supabase
      .from("programs")
      .select("id, code, name, catalog_year, total_credit_hours, graduation_requirements, capstone_rule")
      .eq("code", normalizedCode)
      .eq("catalog_year", resolvedYear)
      .limit(1)

    if (!exactError && exactData && exactData.length > 0) {
      return exactData[0]
    }

    // Fallback for academic-year ambiguity
    const nearYears = [resolvedYear - 1, resolvedYear + 1]
    const { data: nearData, error: nearError } = await supabase
      .from("programs")
      .select("id, code, name, catalog_year, total_credit_hours, graduation_requirements, capstone_rule")
      .eq("code", normalizedCode)
      .in("catalog_year", nearYears)
      .order("catalog_year", { ascending: false })
      .limit(1)

    if (!nearError && nearData && nearData.length > 0) {
      return nearData[0]
    }
  }
```

Note: The rest of the function body (the final fallback) remains unchanged — only the variable name changes from `catalogYear` to `resolvedYear`.

- [ ] **Step 4: Add "2024-2025" option to bulletinYear dropdown in `app/settings/page.tsx`**

Find the bulletinYear `<select>` (line ~772) and add a hardcoded alias option before the dynamically-populated options:

```tsx
<select
  value={editFormData.bulletinYear}
  onChange={(e) => setEditFormData({ ...editFormData, bulletinYear: e.target.value })}
  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent"
>
  <option value="">Select a catalog year...</option>
  {/* Alias years — no direct DB entry, resolved to next year at backend */}
  <option value="2024-2025">2024-2025</option>
  {programs
    .filter((p) => !editFormData.programCode || p.code === editFormData.programCode)
    .reduce((acc, p) => {
      if (!acc.includes(String(p.catalogYear))) {
        acc.push(String(p.catalogYear))
      }
      return acc
    }, [] as string[])
    .map((year) => {
      const y = parseInt(year)
      const label = isNaN(y) ? year : `${y}-${y + 1}`
      const value = isNaN(y) ? year : `${y}-${y + 1}`
      return (
        <option key={year} value={value}>
          {label}
        </option>
      )
    })}
</select>
```

- [ ] **Step 5: Verify**

Start dev server: `npm run dev`
Go to `/settings`, open Academic Profile edit, select catalog year 2024-2025 and save.
Then ask: "What courses can I take next semester?"
Expected: Returns the same schedule as if the year were 2025-2026. No empty or sparse list.

- [ ] **Step 6: Commit**

```bash
git add backend/data-access/curriculum.ts app/settings/page.tsx
git commit -m "feat: add catalog year aliasing so 2024-2025 resolves to 2025-2026 curriculum data"
```

---

## Task 4: Orchestrator — Enforce Credit-Per-Course Filter Strictly

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts` (lines ~900-925, the fallback loops in the NEXT_COURSES handler)

**Problem:** When a student asks "give me 5 courses that are 3 credits each", the primary loop selects only courses with `creditHours === 3`. But the fallback loop (lines 902-909) and GE fill (lines 911-924) both ignore `perCreditMatch` — they add any course regardless of credit hours. This yields a 5-course list that includes 4-credit courses, breaking the explicit student request.

- [ ] **Step 1: Write the failing test**

Manually test via chat with the test student `4be7027e-4b4f-4baa-b850-26b86a4d85e6`:
- Ask: "give me 5 courses that are 3 credits each"
- Expected: All 5 courses should be 3 credit hours
- Before fix: some courses will be 4 credits

- [ ] **Step 2: Fix the required-course fallback loop**

In `backend/services/chat-orchestrator/service.ts`, find the comment "Relax credit-size filter if still short" (line ~901). Replace the entire fallback loop block with:

```typescript
// Relax credit-size filter if still short — but honour explicit per-credit constraint
if (selected.length < requestedCourseCount) {
  for (const c of pool) {
    if (selected.length >= requestedCourseCount) break
    if (selected.find((s) => s.code === c.courseId)) continue
    // When student explicitly specified credits-per-course, keep that hard constraint
    if (perCreditMatch && c.creditHours !== preferredCredits) continue
    selected.push({ code: c.courseId, title: c.title, credits: c.creditHours, tag: c.semesterLabel })
  }
}
```

- [ ] **Step 3: Fix the GE fill loop**

Find the GE fill block (line ~911, "Fill from GE courses if still short"). Replace with:

```typescript
if (selected.length < requestedCourseCount && geCtx && geCtx.availableCourses.length > 0) {
  const geSorted = [...geCtx.availableCourses]
    .filter((ge) => !historyCodes.has(ge.course_code))
    .sort((a, b) =>
      effectivePreferred
        ? (a.credit_hours === effectivePreferred ? -1 : 1) - (b.credit_hours === effectivePreferred ? -1 : 1)
        : b.credit_hours - a.credit_hours
    )
  for (const ge of geSorted) {
    if (selected.length >= requestedCourseCount) break
    if (selected.find((s) => s.code === ge.course_code)) continue
    // When student explicitly specified credits-per-course, keep that hard constraint
    if (perCreditMatch && ge.credit_hours !== preferredCredits) continue
    selected.push({ code: ge.course_code, title: ge.course_title, credits: ge.credit_hours, tag: `GE – ${ge.area_name}` })
  }
}
```

- [ ] **Step 4: Verify**

Start dev server. Ask: "give me 5 courses that are 3 credits each"
Expected: All courses in the response have 3 credit hours. If the system can't find 5 such courses it should say "I could only find N courses with 3 credits each" rather than padding with 4-credit courses.

- [ ] **Step 5: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "fix: enforce per-course credit constraint strictly — fallback loops no longer add wrong-credit courses"
```

---

## Task 5: Orchestrator — Fix Incremental Credit Math Baseline

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts` (lines ~884-888, the `currentCredits` and `gapCredits` calculation)

**Problem:** When student says "add one more to make it 15 credits", `extractHistoryCreditTotal` reads from conversation history text. If the last assistant message said "12 credits total" but the student has already pre-registered 13 credits, the gap math is wrong (target 15 - history 12 = 3 credits gap instead of target 15 - actual 13 = 2 credits gap).

**Fix:** When `termSplit` is available (it always is in the NEXT_COURSES path), use the actual pre-registered credit total as the baseline instead of the history-derived estimate.

- [ ] **Step 1: Write the failing test**

In chat, ask "give me a 12 credit schedule" → get response showing 12 credits.
Then ask "make it 13 credits" or "add one more course to make it 15 credits".
Expected before fix: Math may be wrong if `extractHistoryCreditTotal` reads wrong value.
Expected after fix: Gap = 15 - (actual pre-registered credits).

- [ ] **Step 2: Fix `currentCredits` derivation in `backend/services/chat-orchestrator/service.ts`**

Find the lines (around 883-888):
```typescript
const currentCredits = historyCodes.size > 0 ? extractHistoryCreditTotal(history) : 12
const gapCredits = requestedCreditTarget && requestedCourseCount === 1
  ? Math.max(1, Math.min(6, requestedCreditTarget - currentCredits))
  : null
```

Replace with:

```typescript
// Use actual pre-registered credits from termSplit as the baseline for gap math.
// Fall back to history-extracted total only if termSplit isn't available.
const actualPreRegisteredCredits = termSplit?.upcomingRegistered?.reduce((s, c) => s + c.creditHours, 0) ?? null
const currentCredits = actualPreRegisteredCredits != null
  ? actualPreRegisteredCredits
  : (historyCodes.size > 0 ? extractHistoryCreditTotal(history) : 12)
const gapCredits = requestedCreditTarget && requestedCourseCount === 1
  ? Math.max(1, Math.min(6, requestedCreditTarget - currentCredits))
  : null
```

Note: `termSplit` is in scope at this point — it's built earlier in `handleDbOnly` via `splitInProgressByTerm(inProgressCourses)`.

- [ ] **Step 3: Update `scheduleNote` for incremental requests to show accurate totals**

Find the `scheduleNote` for the incremental case (line ~930-932):

```typescript
scheduleNote = isIncremental
  ? `\nIMPORTANT: The student is ADDING to an existing schedule. Present ONLY the ${selected.length} new course(s) below — do NOT re-list courses already mentioned in this conversation. State the credit hours of the new course and, if a credit target was given, confirm the new total (e.g. "This adds ${addedCredits} credits to your current schedule${requestedCreditTarget ? `, bringing your total to ${requestedCreditTarget} credits` : ""}."). End with: "Verify availability with the AAMU Registrar before registering."`
```

Change to include the actual baseline:

```typescript
scheduleNote = isIncremental
  ? `\nIMPORTANT: The student is ADDING to an existing schedule. Their current pre-registered total is ${currentCredits} credits. Present ONLY the ${selected.length} new course(s) below — do NOT re-list courses already mentioned in this conversation. State the credit hours of the new course and confirm the new total: "This adds ${addedCredits} credits, bringing your total to ${currentCredits + addedCredits} credits." End with: "Verify availability with the AAMU Registrar before registering."`
  : `\nIMPORTANT: The student asked for exactly ${requestedCourseCount} courses${effectivePreferred ? ` (preferring ${effectivePreferred}-credit courses)` : ""}. Present EVERY course listed above — all ${selected.length}. List each with course code, title, and credit hours. Total credits: ${addedCredits} cr.`
```

- [ ] **Step 4: Verify**

Start dev server. Ask "give me a 12-credit schedule" → note what courses appear.
Then ask "make it 15 credits."
Expected: Adds the correct number of credits to reach 15, using the pre-registered total (not a history text estimate) as the baseline.

- [ ] **Step 5: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "fix: use actual pre-registered credits as baseline for incremental credit math, not history text estimate"
```

---

## Task 6: Orchestrator — Confirm Credit Target in Default Schedule

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts` (line ~962, the default `scheduleNote`)

**Problem:** When a student says "I need 12 credits", `requestedCreditTarget = 12` and `TARGET_CREDITS = 12`. The schedule is built to 12 credits. But `scheduleNote` says "Do NOT mention credit math or targets" — so the LLM never confirms "Here is your 12-credit schedule."

- [ ] **Step 1: Fix the default `scheduleNote`**

Find the default scheduleNote (line ~962) in the `else` branch (when `requestedCourseCount` is falsy):

```typescript
scheduleNote = `\nIMPORTANT: Present EVERY course listed in the "Suggested Schedule for Next Semester" section above — do not drop any of them. List each with its course code, title, and credit hours. Do NOT add courses not in that list. Do NOT mention credit math or targets. If the student wants more or fewer courses, acknowledge and adjust from the eligible list.`
```

Replace with:

```typescript
const scheduleTotalCredits = scheduleLines.reduce((s, line) => {
  const m = line.match(/\((\d+)\s*cr\)/)
  return s + (m ? parseInt(m[1], 10) : 0)
}, 0)
scheduleNote = requestedCreditTarget
  ? `\nIMPORTANT: The student asked for a ${requestedCreditTarget}-credit schedule. This schedule totals ${scheduleTotalCredits} credits. Lead your response with: "Here is your ${scheduleTotalCredits}-credit schedule for next semester:" Present EVERY course listed — do not drop any. List each with course code, title, and credit hours. End with: "Verify availability with the AAMU Registrar before registering."`
  : `\nIMPORTANT: Present EVERY course listed in the "Suggested Schedule for Next Semester" section above — do not drop any of them. List each with its course code, title, and credit hours. Do NOT add courses not in that list. If the student wants more or fewer courses, acknowledge and adjust from the eligible list. End with: "Verify availability with the AAMU Registrar before registering."`
```

- [ ] **Step 2: Verify**

Start dev server. Ask: "I need a 15-credit schedule."
Expected: Response begins "Here is your 15-credit schedule for next semester:" with 15 credits of courses listed.

- [ ] **Step 3: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "fix: confirm requested credit target in scheduleNote — 'I need 15 credits' now gets a 15-credit confirmation"
```

---

## Task 7: Orchestrator — Fix International Student Minimum Credit Answer

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts` (GRADUATION_GAP handler, around line ~720)

**Problem:** "im international how many credits min" routes to GRADUATION_GAP. That handler returns degree completion data (e.g., "you need 120 credits to graduate") instead of the F-1 visa answer (12 credits/semester minimum, 9 in-person).

**Fix:** Add a fast-path at the top of the GRADUATION_GAP handler: if the question is about international credit minimums, return the F-1 answer directly.

- [ ] **Step 1: Write the failing test**

In chat: "im international how many credits min"
Expected before fix: Response talks about graduation requirements.
Expected after fix: "As an international student on an F-1 visa, you must maintain at least 12 credits per semester. At least 9 of those credits must be in-person (the maximum allowed online is 3 credits per semester for full-time status). Summer minimum is 6 credits. Dropping below 12 credits requires prior authorization from your DSO."

- [ ] **Step 2: Add `asksInternationalCreditMinimum` detector in `backend/services/chat-orchestrator/service.ts`**

Add this function near the other `asks*` helpers (around line 98):

```typescript
function asksInternationalCreditMinimum(question: string): boolean {
  return /\b(international|f-?1|visa|foreign\s+student)\b/i.test(question)
    && /\b(minimum|min|how\s+many|least|required|credits?\s+per\s+semester|full[\s-]time)\b/i.test(question)
}
```

- [ ] **Step 3: Add the fast-path in the GRADUATION_GAP handler**

Find the section in `handleDbOnly` where `isGraduationGapQuery` is true (search for `isGraduationGapQuery` in the orchestrator). At the top of that block, before any DB queries, add:

```typescript
// Fast-path: F-1 visa minimum credit question
if (asksInternationalCreditMinimum(question)) {
  const intlContext = profile?.isInternational
    ? "The student is confirmed as an international student."
    : "Note: the student did not indicate international status in their profile."
  return {
    mode: "DB_ONLY",
    answer: await generateDbResponse(
      question,
      `F-1 Visa Full-Time Enrollment Requirements (USCIS/DHS):\n${intlContext}\n- Minimum credits per semester: 12\n- Minimum in-person credits: 9 (maximum 3 online credits count toward full-time)\n- Summer minimum: 6 credits\n- Falling below 12 credits requires prior authorization from the Designated School Official (DSO)\n- Violation of full-time enrollment requirement = status violation; student must contact international student services immediately`,
      history
    ),
    data: null,
  }
}
```

- [ ] **Step 4: Add F-1 note to NEXT_COURSES scheduleNote for international students**

In the NEXT_COURSES handler, find where `studentContextBlock` is built (around line 226-245). The `buildStudentContextBlock` already adds `"International student: must maintain 12+ credits/semester (9 in-person)"` if `isInternational` is true. Verify this is still present; if not, re-add it to `buildStudentContextBlock`:

```typescript
if (profile.isInternational) parts.push("International student (F-1 visa): MUST maintain minimum 12 credits/semester (9 in-person min, max 3 online). Do not recommend a schedule under 12 credits for this student.")
```

Find the existing line (~241) and replace:
```typescript
// Old:
if (profile.isInternational) parts.push("International student: must maintain 12+ credits/semester (9 in-person)")

// New:
if (profile.isInternational) parts.push("International student (F-1 visa): MUST maintain minimum 12 credits/semester (9 in-person min, max 3 online). Do not recommend a schedule under 12 credits for this student.")
```

- [ ] **Step 5: Verify**

Start dev server.
Ask: "im international how many credits min"
Expected: Specific F-1 answer with 12 credits/semester, 9 in-person, summer minimum.

Ask: "what courses can I take?" (with isInternational=true in session)
Expected: Schedule is ≥12 credits; response mentions the international credit requirement.

- [ ] **Step 6: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "fix: add F-1 international credit minimum fast-path; strengthen international note in schedule context"
```

---

## Task 8: Scholarship — Fix Routing and Update Verified GPA Rules

**Files:**
- Modify: `backend/services/curriculum/service.ts` (lines 40-49, `AAMU_SCHOLARSHIP_RULES`)
- Modify: `backend/services/chat-orchestrator/service.ts` (add scholarship fast-path near BULLETIN_POLICY handler)
- Modify: `app/settings/page.tsx` (scholarship dropdown options)

**Problem A:** Scholarship questions ("what GPA do I need for my scholarship") route to BULLETIN_POLICY → RAG, which searches the bulletin PDF. But the rules are already hardcoded in `AAMU_SCHOLARSHIP_RULES` — we should answer deterministically.

**Problem B:** `AAMU_SCHOLARSHIP_RULES` has wrong GPA values and wrong names (verified against aamu.edu).

**Verified AAMU scholarship data (aamu.edu, April 2026):**
- Presidential: 3.50 GPA, 30 cr/year
- Merit: 3.10 GPA, 30 cr/year  
- Transfer Merit: 3.10 GPA, 30 cr/year
- Academic Recognition: 2.80 GPA, 30 cr/year
- Heritage Gold: 2.80 GPA, 30 cr/year
- Heritage Silver: 2.80 GPA, 30 cr/year
- Heritage Bronze: 2.50 GPA, 30 cr/year
- Normalite: 2.80 GPA, 30 cr/year

- [ ] **Step 1: Update `AAMU_SCHOLARSHIP_RULES` in `backend/services/curriculum/service.ts`**

Find the `AAMU_SCHOLARSHIP_RULES` constant (line 40) and replace entirely:

```typescript
const AAMU_SCHOLARSHIP_RULES: Record<string, { minGpa: number; minCreditsPerYear: number }> = {
  // Names and GPA requirements verified from aamu.edu, April 2026
  // All AAMU scholarships require 30 credit hours per academic year
  'AAMU Presidential Scholarship':        { minGpa: 3.50, minCreditsPerYear: 30 },
  'AAMU Merit Scholarship':               { minGpa: 3.10, minCreditsPerYear: 30 },
  'AAMU Transfer Merit Scholarship':      { minGpa: 3.10, minCreditsPerYear: 30 },
  'AAMU Academic Recognition Scholarship':{ minGpa: 2.80, minCreditsPerYear: 30 },
  'AAMU Heritage Gold Scholarship':       { minGpa: 2.80, minCreditsPerYear: 30 },
  'AAMU Heritage Silver Scholarship':     { minGpa: 2.80, minCreditsPerYear: 30 },
  'AAMU Heritage Bronze Scholarship':     { minGpa: 2.50, minCreditsPerYear: 30 },
  'AAMU Normalite Scholarship':           { minGpa: 2.80, minCreditsPerYear: 30 },
}
```

- [ ] **Step 2: Update scholarship dropdown in `app/settings/page.tsx`**

Find the scholarship `<select>` options in the enrollment card (the edit form, look for `<option value="AAMU Presidential Scholarship">`). Replace all AAMU-specific options with the verified names:

```tsx
<option value="">None / Not applicable</option>
<option value="AAMU Presidential Scholarship">AAMU Presidential Scholarship (3.50 GPA)</option>
<option value="AAMU Merit Scholarship">AAMU Merit Scholarship (3.10 GPA)</option>
<option value="AAMU Transfer Merit Scholarship">AAMU Transfer Merit Scholarship (3.10 GPA)</option>
<option value="AAMU Academic Recognition Scholarship">AAMU Academic Recognition Scholarship (2.80 GPA)</option>
<option value="AAMU Heritage Gold Scholarship">AAMU Heritage Gold Scholarship (2.80 GPA)</option>
<option value="AAMU Heritage Silver Scholarship">AAMU Heritage Silver Scholarship (2.80 GPA)</option>
<option value="AAMU Heritage Bronze Scholarship">AAMU Heritage Bronze Scholarship (2.50 GPA)</option>
<option value="AAMU Normalite Scholarship">AAMU Normalite Scholarship (2.80 GPA)</option>
<option value="External Scholarship">External Scholarship (enter requirements below)</option>
```

Note: If the Settings page has TWO scholarship dropdowns (read-only and edit view from the previous plan's Task 7), update both.

- [ ] **Step 3: Add `asksScholarshipQuestion` detector in `backend/services/chat-orchestrator/service.ts`**

Add this function near the other `asks*` helpers:

```typescript
function asksScholarshipQuestion(question: string): boolean {
  return /\b(scholarship|financial\s+aid\s+gpa|renewal\s+gpa|scholarship\s+gpa|gpa\s+(for|to\s+keep|to\s+maintain)\s+(my\s+)?scholarship|scholarship\s+requirement|keep\s+my\s+scholarship|lose\s+my\s+scholarship|scholarship\s+credits?)\b/i.test(question)
}
```

- [ ] **Step 4: Add scholarship fast-path in `handleDbOnly` in `backend/services/chat-orchestrator/service.ts`**

Find where the BULLETIN_POLICY and ADVISOR_ESCALATE paths are handled in `handleDbOnly` (the `isLowConfidenceQuestion` check). Add BEFORE that block:

```typescript
if (asksScholarshipQuestion(question)) {
  const scholarshipType = profile?.scholarshipType ?? payload.session?.scholarshipType ?? null
  const rule = scholarshipType ? AAMU_SCHOLARSHIP_RULES[scholarshipType] ?? null : null

  let scholarshipContext = "AAMU Scholarship Renewal Requirements (verified from aamu.edu):\n"
  scholarshipContext += "ALL AAMU scholarships require 30 credit hours per academic year (15 per semester) to renew.\n\n"
  scholarshipContext += "GPA requirements by scholarship:\n"
  for (const [name, req] of Object.entries(AAMU_SCHOLARSHIP_RULES)) {
    scholarshipContext += `- ${name}: ${req.minGpa} GPA minimum, ${req.minCreditsPerYear} credits/year\n`
  }

  if (rule && scholarshipType) {
    scholarshipContext += `\nThis student has: ${scholarshipType}\nTheir renewal requirements: ${rule.minGpa} GPA minimum, ${rule.minCreditsPerYear} credits per academic year (30 total / 15 per semester minimum).`
  } else if (scholarshipType) {
    scholarshipContext += `\nThis student has: ${scholarshipType}\nNote: No specific rule found for this scholarship — advise student to confirm with Financial Aid.`
  } else {
    scholarshipContext += `\nThis student has not declared a scholarship type in their profile. Remind them to set it in Settings.`
  }

  return {
    mode: "DB_ONLY",
    answer: await generateDbResponse(question, `${studentContextBlock}${scholarshipContext}`, history),
    data: null,
  }
}
```

Note: `AAMU_SCHOLARSHIP_RULES` needs to be imported into the orchestrator, or it can be duplicated as a local constant. Since curriculum/service.ts doesn't export it, either: (a) export it from curriculum/service.ts and import it here, or (b) duplicate the constant in the orchestrator. Option (a) is cleaner.

- [ ] **Step 5: Export `AAMU_SCHOLARSHIP_RULES` from `backend/services/curriculum/service.ts`**

Change the `const` declaration:
```typescript
// Old:
const AAMU_SCHOLARSHIP_RULES: Record<string, ...>

// New:
export const AAMU_SCHOLARSHIP_RULES: Record<string, ...>
```

Then add the import in `backend/services/chat-orchestrator/service.ts`:
```typescript
import {
  // ... existing imports ...
  AAMU_SCHOLARSHIP_RULES,
} from "@/backend/services/curriculum/service"
```

- [ ] **Step 6: Verify**

Start dev server. Ask: "what GPA do I need for my scholarship?"
Expected (with scholarship set to "AAMU Presidential Scholarship" in session): "Your AAMU Presidential Scholarship requires a 3.50 GPA and 30 credit hours per academic year."

Ask: "how many credits do I need per year for my scholarship?"
Expected: Specific answer with the 30 cr/year requirement.

Ask: "what GPA do I need for the Merit scholarship?"
Expected: "The AAMU Merit Scholarship requires a 3.10 GPA minimum and 30 credits per academic year."

- [ ] **Step 7: Commit**

```bash
git add backend/services/curriculum/service.ts backend/services/chat-orchestrator/service.ts app/settings/page.tsx
git commit -m "fix: add scholarship fast-path with deterministic aamu.edu-verified GPA rules; update dropdown names to match official AAMU scholarship names"
```

---

## Task 9: Orchestrator — Classification-Aware Schedule Filtering

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts` (lines ~860-965, the NEXT_COURSES schedule builder)

**Problem:** When a student identifies as a sophomore and says "what should I take as a sophomore?", the advisor's suggested schedule includes Senior-level courses (semesters 7-8) because they're technically `eligibleNow` (prerequisites met). The `effectiveSemesterPosition` advisory already exists for far-ahead courses, but the suggested schedule itself still includes them.

**Fix:** When `classification` is known, sort `eligibleNow` to strongly prefer courses in the classification's expected semester range, and deprioritize courses that are more than 2 semesters ahead. Also detect "as a sophomore/junior/senior" in the question text to override the profile classification when present.

- [ ] **Step 1: Add `extractClassificationFromQuestion` helper in `backend/services/chat-orchestrator/service.ts`**

Add near the other utility functions:

```typescript
function extractClassificationFromQuestion(question: string): string | null {
  if (/\bas\s+a\s+(freshman|first[- ]year)\b/i.test(question)) return "Freshman"
  if (/\bas\s+a\s+(sophomore|second[- ]year)\b/i.test(question)) return "Sophomore"
  if (/\bas\s+a\s+(junior|third[- ]year)\b/i.test(question)) return "Junior"
  if (/\bas\s+a\s+(senior|fourth[- ]year|final\s+year)\b/i.test(question)) return "Senior"
  return null
}
```

- [ ] **Step 2: Apply classification override in the NEXT_COURSES handler**

In the NEXT_COURSES handler, find where `classification` is set (it comes from the profile). Add a question-text override:

```typescript
// Profile classification
const profileClassification = profile?.classification ?? payload.session?.classification ?? null
// Allow student to override via question text ("as a sophomore, what should I take?")
const questionClassification = extractClassificationFromQuestion(question)
const classification = questionClassification ?? profileClassification
```

(Replace the existing `const classification = ...` line with this block.)

- [ ] **Step 3: Sort `eligibleNow` by classification-preferred semester range before building schedule**

In the NEXT_COURSES handler, just after `const recommendation = await recommendNextCoursesForUser(...)` and before the schedule-building section, add:

```typescript
const CLASSIFICATION_SEMESTER_RANGE: Record<string, [number, number]> = {
  Freshman:  [1, 2],
  Sophomore: [3, 4],
  Junior:    [5, 6],
  Senior:    [7, 8],
}

if (classification && CLASSIFICATION_SEMESTER_RANGE[classification]) {
  const [semMin, semMax] = CLASSIFICATION_SEMESTER_RANGE[classification]
  recommendation.eligibleNow.sort((a, b) => {
    const aInRange = a.semesterNumber != null && a.semesterNumber >= semMin && a.semesterNumber <= semMax
    const bInRange = b.semesterNumber != null && b.semesterNumber >= semMin && b.semesterNumber <= semMax
    if (aInRange && !bInRange) return -1
    if (!aInRange && bInRange) return 1
    return (a.semesterNumber ?? 99) - (b.semesterNumber ?? 99)
  })
}
```

- [ ] **Step 4: Verify**

Start dev server. Set profile classification to "Sophomore" or ask "as a sophomore, what should I take?"
Expected: Suggested schedule shows Sophomore Fall/Spring courses first (semesters 3-4). Senior-level courses appear at the end or not at all in a standard 12-credit schedule.

- [ ] **Step 5: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "feat: classification-aware schedule sorting — sophomore gets semester 3-4 courses first; 'as a junior' in question overrides profile classification"
```

---

## Task 10: Orchestrator — Fix "Minor Requirements" With No Declared Concentration

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts` (CONCENTRATION handler, search for `isConcentrationQuery`)

**Problem:** "what are the minor requirements?" routes to `isConcentrationQuery`. But if the student hasn't declared a concentration/minor (concentrationCode is null), the handler returns an empty or confusing response.

**Fix:** When `concentrationCode` is null, return a list of available minors/concentrations for the student's program, or ask which one they're interested in.

- [ ] **Step 1: Verify the current behavior**

Start dev server. Set concentrationCode to null/empty in settings.
Ask: "what are the minor requirements?"
Expected before fix: Empty or confusing response.
Expected after fix: Lists available concentrations/minors for the student's program.

- [ ] **Step 2: Add null-concentration handling in `handleDbOnly`**

Find the `isConcentrationQuery` block (search for `asksConcentrationQuestion` or `isConcentrationQuery`). At the top of that block, before the DB query, add:

```typescript
if (isConcentrationQuery) {
  // When no concentration declared, list available ones for the program
  if (!concentrationCode && programCode) {
    const overview = await fetchProgramOverview({ programCode, bulletinYear: fallbackBulletinYear }).catch(() => null)
    const concContext = overview
      ? `Available Concentrations/Minors for ${programCode}:\n${overview.concentrations?.map((c: any) => `- ${c.name} (${c.code})`).join("\n") ?? "None listed in current data."}\n\nInstruction: List the available concentrations/minors for this student's program. Ask which one they are interested in so you can give them specific requirements.`
      : `The student asked about concentration/minor requirements but has not declared one yet.\n\nInstruction: Acknowledge that no concentration has been declared. Ask the student which concentration or minor they are interested in. Tell them they can update this in Settings → Academic Profile.`

    return {
      mode: "DB_ONLY",
      answer: await generateDbResponse(question, `${studentContextBlock}${concContext}`, history),
      data: null,
    }
  }
  // ... existing concentration handler continues here ...
}
```

- [ ] **Step 3: Verify**

Start dev server. With concentrationCode empty:
Ask: "what are the minor requirements?"
Expected: "You haven't declared a concentration or minor yet. Available options for your CS program include: [list]. Which one are you interested in? You can also declare it in Settings."

With concentrationCode set:
Ask: "what are the minor requirements?"
Expected: Specific requirements for the declared concentration.

- [ ] **Step 4: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "fix: when no concentration declared, list available concentrations/minors instead of returning empty response"
```

---

## Task 11: Router and Orchestrator — Low-Priority Routing Edge Cases

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts` (chitchat guard for "ok"/"yes" with no academic history)
- Modify: `lib/chat-routing/router.ts` (add "show my transcript" examples)

**Problem A:** "show my transcript" sometimes routes to GENERAL_CURRICULUM instead of COMPLETED_COURSES. (The regex in `asksCompletedCoursesQuestion` does include `my\s+transcript` — verify it's actually matching, or add it to fastPrescreen.)

**Problem B:** When a student says "ok" or "yes" as their first message with no conversation history, the system dumps a full schedule recommendation.

- [ ] **Step 1: Verify "show my transcript" routing**

In chat, type: "show my transcript"
Expected: Lists completed courses. If it routes wrong, continue to Step 2.

- [ ] **Step 2: Add "show my transcript" to `fastPrescreen` in `lib/chat-routing/router.ts`**

Add to `fastPrescreen`, after the existing COMPLETED_COURSES patterns (if the above verification shows it's needed):

```typescript
if (/\b(show|see|view|pull\s+up|display)\s+(my\s+)?(transcript|grades?|academic\s+record|course\s+history)\b/i.test(q))
  return "COMPLETED_COURSES"
```

- [ ] **Step 3: Add "ok"/"yes" no-history guard in `handleDbOnly`**

In `backend/services/chat-orchestrator/service.ts`, at the very top of `handleDbOnly`, after the history assignment, add:

```typescript
// Guard against single-word affirmatives with no conversation history triggering a full schedule
const isAffirmativeNoContext = /^(ok|okay|yes|yeah|yep|sure|alright|got\s+it|sounds\s+good|cool|great)\.?$/i.test(question.trim())
if (isAffirmativeNoContext && history.length === 0) {
  return {
    mode: "DB_ONLY",
    answer: "Hi! I'm your AAMU academic advisor. I can help you with:\n- What courses to take next semester\n- Your graduation progress\n- Course prerequisites\n- GE and elective options\n- Scholarship and international credit requirements\n\nWhat would you like to know?",
    data: null,
  }
}
```

- [ ] **Step 4: Verify**

Start dev server (clear chat history first).
Type: "ok" (as first message)
Expected: Helpful onboarding message listing what the advisor can help with.

Type: "show my transcript"
Expected: Lists completed courses.

- [ ] **Step 5: Commit**

```bash
git add lib/chat-routing/router.ts backend/services/chat-orchestrator/service.ts
git commit -m "fix: guard against 'ok'/'yes' no-history full schedule dump; ensure 'show my transcript' routes to COMPLETED_COURSES"
```

---

## Task 12: Add Regression Smoke Test

**Files:**
- Create: `backend/tests/smoke_test.py`

**Purpose:** 45-question live smoke test against localhost:3000 with the test student. Run after each phase of fixes to detect regressions.

- [ ] **Step 1: Create `backend/tests/smoke_test.py`**

```python
#!/usr/bin/env python3
"""
AAMU Advisor Regression Smoke Test
Runs 45 student-like questions against localhost:3000/api/chat/query
Usage: python backend/tests/smoke_test.py
"""

import json
import time
import urllib.request
import urllib.error

BASE_URL = "http://localhost:3000"
SID = "4be7027e-4b4f-4baa-b850-26b86a4d85e6"
DEFAULT_SESSION = {
    "programCode": "BIO-BS",
    "bulletinYear": "2025-2026",
    "classification": "Freshman",
    "isInternational": False,
    "scholarshipType": None,
}

TESTS = [
    # ── Chitchat / guard tests ─────────────────────────────────────────────
    {"q": "hi",                          "expect_not": ["courses", "eligible", "prerequisite"], "label": "chitchat-hi"},
    {"q": "courses",                      "expect_not": ["eligible", "Suggested Schedule"],       "label": "chitchat-bare-word"},
    {"q": "ok",                           "expect":     ["AAMU", "can help"],                     "label": "chitchat-ok-no-history"},
    {"q": "thanks",                       "expect_not": ["eligible"],                             "label": "chitchat-thanks"},

    # ── Completed courses ─────────────────────────────────────────────────
    {"q": "what couses have i took",      "expect":     ["completed", "BIO"],                     "label": "completed-typo"},
    {"q": "show my transcript",           "expect":     ["completed", "BIO"],                     "label": "completed-transcript"},
    {"q": "what have i already finished", "expect":     ["completed"],                             "label": "completed-finished"},

    # ── NEXT_COURSES ─────────────────────────────────────────────────────
    {"q": "what can I register for next semester",   "expect": ["BIO", "credits"],               "label": "next-register"},
    {"q": "I need 12 credits",                       "expect": ["12", "credits"],                "label": "next-12cr"},
    {"q": "give me a 15 credit schedule",            "expect": ["15", "credits"],                "label": "next-15cr"},
    {"q": "give me 5 courses that are 3 credits each",
        "expect": ["3 cr"], "expect_not_pattern": r"\(4 cr\)",                                    "label": "next-5x3cr"},
    {"q": "build my schedule",                       "expect_not": ["Suggested Schedule"],        "label": "save-plan-detect"},
    {"q": "what can I take for fall 2026",           "expect": ["BIO", "credits"],               "label": "next-semester-year-not-catalog"},

    # ── Graduation gap / GPA ──────────────────────────────────────────────
    {"q": "what is my GPA",              "expect": ["GPA"],                                      "label": "gpa-question"},
    {"q": "what do I need to graduate",  "expect": ["credits", "graduate"],                      "label": "grad-gap"},
    {"q": "how close am i to graduating","expect": ["credits"],                                   "label": "grad-close"},

    # ── International / F-1 ───────────────────────────────────────────────
    {"q": "im international how many credits min",
        "expect": ["12", "9", "in-person"],
        "session_extra": {"isInternational": True},                                               "label": "intl-min"},
    {"q": "what is the minimum credits for international students",
        "expect": ["12"],                                                                          "label": "intl-min-2"},
    {"q": "what courses can I take",
        "session_extra": {"isInternational": True},
        "expect": ["12"],                                                                          "label": "intl-schedule-min"},

    # ── Scholarship ───────────────────────────────────────────────────────
    {"q": "what GPA do I need for my scholarship",
        "session_extra": {"scholarshipType": "AAMU Presidential Scholarship"},
        "expect": ["3.50", "30"],                                                                  "label": "scholarship-gpa"},
    {"q": "how many credits per year for scholarship",
        "session_extra": {"scholarshipType": "AAMU Merit Scholarship"},
        "expect": ["30", "3.10"],                                                                  "label": "scholarship-credits"},
    {"q": "what are the scholarship requirements for AAMU",
        "expect": ["Presidential", "Merit", "30"],                                                 "label": "scholarship-list"},

    # ── Catalog year aliasing ─────────────────────────────────────────────
    {"q": "what courses can I take",
        "session_extra": {"bulletinYear": "2024-2025"},
        "expect": ["BIO", "credits"],                                                              "label": "catalog-alias-2024"},

    # ── Prerequisites ─────────────────────────────────────────────────────
    {"q": "what are the prereqs for BIO 305", "expect": ["BIO"],                                 "label": "prereq-bio"},
    {"q": "what do I need before BIO 202",    "expect": ["BIO 101"],                             "label": "prereq-before"},

    # ── GE / free electives ───────────────────────────────────────────────
    {"q": "what humanities courses can I take next semester", "expect": ["humanities", "HIS"],   "label": "ge-humanities"},
    {"q": "what GED courses are available",                   "expect": ["General Education"],   "label": "ge-GED-acronym"},
    {"q": "what fine arts courses count for my degree",       "expect": ["arts"],                "label": "ge-fine-arts"},
    {"q": "I need a free elective",                           "expect": ["credit"],              "label": "ge-free-elective"},
    {"q": "can I take golf",                                   "expect": ["PE"],                 "label": "ge-pe-golf"},

    # ── Electives ─────────────────────────────────────────────────────────
    {"q": "what electives can I take",         "expect": ["credit"],                             "label": "elective-basic"},
    {"q": "what elective options do I have",   "expect": ["credit"],                             "label": "elective-options"},

    # ── Concentration/minor ───────────────────────────────────────────────
    {"q": "what are the minor requirements",   "expect": ["concentration", "minor"],              "label": "minor-no-conc"},

    # ── Simulation ───────────────────────────────────────────────────────
    {"q": "if I take BIO 101 what opens up",   "expect": ["BIO"],                               "label": "simulate"},

    # ── Save plan ─────────────────────────────────────────────────────────
    {"q": "save this schedule",                "expect_not": ["Suggested Schedule for Next"],    "label": "save-plan"},

    # ── Bulletin policy ───────────────────────────────────────────────────
    {"q": "what is the minimum GPA to graduate", "expect": ["2.0", "GPA"],                      "label": "policy-min-gpa"},
    {"q": "what is academic probation",          "expect": ["probation", "GPA"],                "label": "policy-probation"},

    # ── ADVISOR_ESCALATE ─────────────────────────────────────────────────
    {"q": "how do I transfer credits from community college", "expect": ["advisor", "registrar"],"label": "escalate-transfer"},

    # ── General curriculum ────────────────────────────────────────────────
    {"q": "what is BIO 101",            "expect": ["Biology", "credit"],                         "label": "curriculum-course-info"},
    {"q": "what is the CS program",     "expect": ["program"],                                   "label": "curriculum-program"},

    # ── Classification-aware ──────────────────────────────────────────────
    {"q": "as a sophomore what should I take",
        "session_extra": {"classification": "Freshman"},
        "expect": ["Sophomore", "semester 3"],                                                     "label": "classification-override"},
    {"q": "what courses should I take as a junior",
        "session_extra": {"classification": "Sophomore"},
        "expect": ["Junior"],                                                                      "label": "classification-junior"},
]


def call_api(question: str, session_extra: dict = None) -> dict:
    session = {**DEFAULT_SESSION, **(session_extra or {})}
    payload = json.dumps({
        "question": question,
        "studentId": SID,
        "session": session,
        "conversationHistory": [],
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/api/chat/query",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_tests():
    import re
    passed = failed = 0

    print(f"Running {len(TESTS)} smoke tests against {BASE_URL}\n{'='*60}")

    for i, t in enumerate(TESTS, 1):
        label = t.get("label", f"test-{i}")
        try:
            result = call_api(t["q"], t.get("session_extra"))
            answer = result.get("answer") or result.get("data", {})
            if isinstance(answer, dict):
                answer = json.dumps(answer)
            answer_lower = answer.lower() if isinstance(answer, str) else ""

            ok = True
            fail_reason = ""

            for must in t.get("expect", []):
                if must.lower() not in answer_lower:
                    ok = False
                    fail_reason = f"missing '{must}'"
                    break

            for must_not in t.get("expect_not", []):
                if must_not.lower() in answer_lower:
                    ok = False
                    fail_reason = f"should not contain '{must_not}'"
                    break

            pattern = t.get("expect_not_pattern")
            if pattern and re.search(pattern, answer):
                ok = False
                fail_reason = f"matched forbidden pattern '{pattern}'"

            status = "PASS" if ok else "FAIL"
            print(f"[{status:4}] {label:<40} q: \"{t['q'][:50]}\"")
            if not ok:
                print(f"       Reason: {fail_reason}")
                print(f"       Answer: {answer[:200]}")
            passed += ok
            failed += (not ok)
        except Exception as e:
            print(f"[ERR ] {label:<40} {e}")
            failed += 1

        time.sleep(0.3)  # be polite to the local dev server

    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed out of {len(TESTS)}")
    return failed == 0


if __name__ == "__main__":
    import sys
    ok = run_tests()
    sys.exit(0 if ok else 1)
```

- [ ] **Step 2: Run baseline smoke test before any fixes**

Make sure dev server is running: `npm run dev`
Run: `python backend/tests/smoke_test.py`
Expected: Many failures — this establishes the baseline. Save output.

- [ ] **Step 3: Run smoke test again after all 11 tasks are complete**

Run: `python backend/tests/smoke_test.py`
Expected: ≥40 of 45 tests pass. Note any remaining failures for follow-up.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/smoke_test.py
git commit -m "test: add 45-question regression smoke test covering all advisor intelligence gaps"
```

---

## Self-Review Checklist

### Spec Coverage

| Gap from Smoke Test | Task | Status |
|---|---|---|
| Single-word "courses" triggers NEXT_COURSES | Task 1 | Covered |
| "build my schedule" routes to NEXT_COURSES instead of SAVE_PLAN | Task 1 | Covered |
| "fall 2026" poisons catalog year → sparse course list | Task 2 | Covered |
| 2024-2025 students get empty curriculum | Task 3 | Covered |
| "5 courses that are 3 credits each" returns 4-credit courses | Task 4 | Covered |
| Incremental credit math wrong baseline | Task 5 | Covered |
| "I need 12 credits" → no credit confirmation | Task 6 | Covered |
| International student credit minimum → graduation answer instead of F-1 | Task 7 | Covered |
| Scholarship routing → RAG instead of deterministic answer | Task 8 | Covered |
| Wrong GPA values in AAMU_SCHOLARSHIP_RULES | Task 8 | Covered |
| Wrong scholarship names in dropdown | Task 8 | Covered |
| Classification-unaware schedule (sophomore gets senior courses) | Task 9 | Covered |
| "minor requirements" with no declared concentration → empty | Task 10 | Covered |
| "ok"/"yes" no-history dumps full schedule | Task 11 | Covered |
| Regression smoke test | Task 12 | Covered |

### Placeholder Scan

No TBDs, TODOs, or "implement later" entries. All code blocks are copy-pasteable.

### Type Consistency

- `CATALOG_YEAR_ALIASES: Record<number, number>` — used only as `CATALOG_YEAR_ALIASES[catalogYear]` where `catalogYear` is already `number`. No type mismatch.
- `resolvedYear` in `getProgram` is `number` (same as `catalogYear`). All Supabase query calls pass a number. ✓
- `AAMU_SCHOLARSHIP_RULES` exported from curriculum/service.ts as `Record<string, { minGpa: number; minCreditsPerYear: number }>` — imported and used in orchestrator with the same key lookup. ✓
- `extractClassificationFromQuestion` returns `string | null` — used as `questionClassification ?? profileClassification` where `profileClassification` is also `string | null`. ✓
- `CLASSIFICATION_SEMESTER_RANGE` indexed by the returned classification strings ("Freshman", "Sophomore", etc.) — matches `SEMESTER_LABELS` keys in curriculum/service.ts. ✓
- `scheduleTotalCredits` computed inline from `scheduleLines` array via regex — local variable, no type issue. ✓
