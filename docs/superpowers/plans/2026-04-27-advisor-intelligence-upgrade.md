# Advisor Intelligence Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all broken and missing advisor behaviors identified from live conversation testing — cross-referencing taken courses, GE/humanities recognition, quantity requests, self-contradicting recommendations, prerequisite explanations, repetition, credit tracking, and the Enrollment card UI lock/unlock behavior.

**Architecture:** Two independent layers of fixes. (A) AI Intelligence: router intent classification, chat orchestrator context building, and curriculum service filtering. (B) Settings UI: enrollment card edit/view toggle. All AI fixes stay in the existing service layer — no new tables, no schema changes.

**Tech Stack:** TypeScript, Next.js App Router, Supabase, OpenAI gpt-4o-mini, React state

---

## File Map

| File | What Changes |
|---|---|
| `lib/chat-routing/router.ts` | Expand FREE_ELECTIVE examples + fastPrescreen synonyms |
| `backend/services/rag/service.ts` | Strengthen DB_SYSTEM_PROMPT (prereqs, repetition, classification, credits) |
| `backend/services/curriculum/service.ts` | `fetchElectiveOptions` accepts `studentId`, filters taken courses |
| `backend/services/chat-orchestrator/service.ts` | GE in NEXT_COURSES, classification advisory, quantity notes, elective cross-ref |
| `app/settings/page.tsx` | Enrollment card edit/view toggle |

---

## Task 1: Router — Expand FREE_ELECTIVE Intent to Cover GE Synonyms

**Files:**
- Modify: `lib/chat-routing/router.ts`

The LLM classifier does not know that "humanities", "history courses", "GED courses", "fine arts", "literature classes", "social sciences" are all GE synonyms. They fall through to GENERAL_CURRICULUM. The fast prescreen also has no entry for these terms.

- [ ] **Step 1: Write the failing test**

Create `scripts/routing-eval-ge-synonyms.cjs` (extend existing routing eval or create standalone):

```javascript
// Append to scripts/routing-eval.cjs test cases, OR run inline:
const testCases = [
  { q: "What humanities courses can I take next semester?", expected: "FREE_ELECTIVE" },
  { q: "What GED courses are available?", expected: "FREE_ELECTIVE" },
  { q: "What history courses can I take?", expected: "FREE_ELECTIVE" },
  { q: "What fine arts courses count for my degree?", expected: "FREE_ELECTIVE" },
  { q: "What literature classes haven't I taken?", expected: "FREE_ELECTIVE" },
  { q: "What social science courses do I still need?", expected: "FREE_ELECTIVE" },
  { q: "What science gen ed requirements do I have left?", expected: "FREE_ELECTIVE" },
  { q: "What are the humanities courses I can take next semester?", expected: "FREE_ELECTIVE" },
]
```

Run: The existing routing eval at `scripts/routing-eval.cjs` (adapt it) or add these to the integration test. Expected: all classify as FREE_ELECTIVE — they will FAIL before the fix.

- [ ] **Step 2: Update `fastPrescreen` in `lib/chat-routing/router.ts`**

Find the `fastPrescreen` function (lines ~93-104) and add a new branch before the `return null`:

```typescript
if (/\b(humanities|fine\s+arts?|social\s+science|natural\s+science|GED\s+course|general\s+ed(?:ucation)?(?:\s+requirement)?|history\s+(?:class|course)|literature\s+(?:class|course)|behavioral\s+science)\b/i.test(q))
  return "FREE_ELECTIVE"
```

- [ ] **Step 3: Update the `CLASSIFIER_SYSTEM_PROMPT` FREE_ELECTIVE description**

In `lib/chat-routing/router.ts`, find the line starting `FREE_ELECTIVE —` in the system prompt and replace it with:

```typescript
FREE_ELECTIVE — student asks about free elective options, what electives to take, recreational courses, GE courses, general education requirements (including any GE sub-area: humanities, fine arts, history, literature, social sciences, behavioral sciences, natural sciences, physical education), what courses count as free electives, or wants suggestions for easy/fun courses. Also: PE courses, physical education, specific activities like golf/swimming/tennis/bowling/badminton. NOTE: "GED" in an advising context means General Education requirements (not high school GED equivalency).
```

- [ ] **Step 4: Add GE synonym examples to the classifier system prompt**

In `lib/chat-routing/router.ts`, find the examples block in `CLASSIFIER_SYSTEM_PROMPT` and append these lines after the existing FREE_ELECTIVE examples:

```typescript
"what humanities courses can I take next semester?" → FREE_ELECTIVE
"what GED courses are available?" → FREE_ELECTIVE
"what history courses can I take?" → FREE_ELECTIVE
"what fine arts courses count for my degree?" → FREE_ELECTIVE
"what literature classes haven't I taken?" → FREE_ELECTIVE
"what social science courses do I still need?" → FREE_ELECTIVE
"what are the humanities courses I can take next semester?" → FREE_ELECTIVE
"What General education requirement courses can I take?" → FREE_ELECTIVE
"Give me some options for general education" → FREE_ELECTIVE
```

- [ ] **Step 5: Run routing eval to confirm all GE synonym queries now return FREE_ELECTIVE**

Run: `node scripts/routing-eval.cjs` (or the inline test)
Expected: all 9 new test cases → FREE_ELECTIVE PASS

- [ ] **Step 6: Commit**

```bash
git add lib/chat-routing/router.ts
git commit -m "feat: expand FREE_ELECTIVE intent to cover humanities/GED/history/fine arts synonyms"
```

---

## Task 2: RAG Service — Strengthen DB_SYSTEM_PROMPT

**Files:**
- Modify: `backend/services/rag/service.ts:255-274`

The current `DB_SYSTEM_PROMPT` has no rules about: (1) explaining WHY a course is blocked, (2) not repeating the same list, (3) classification-aware recommendations, (4) proactively mentioning credit totals.

- [ ] **Step 1: Update `DB_SYSTEM_PROMPT` in `backend/services/rag/service.ts`**

Find the `DB_SYSTEM_PROMPT` constant (line ~255) and replace the entire string with:

```typescript
const DB_SYSTEM_PROMPT = `You are a helpful academic advisor assistant for Alabama A&M University (AAMU).
Answer student questions based strictly on the provided curriculum and program data.
Be concise, friendly, and accurate.
If the data doesn't fully answer the question, say so clearly.
Maintain full awareness of the entire conversation history — never forget what was said earlier in this chat.

AAMU Institutional Rules (always apply — never contradict these):
- Maximum credit hours per semester: 19. Students cannot register for more than 19 credits in a single term without explicit dean approval.
- "Currently enrolled" means courses in the student's CURRENT academic term only.
- "Pre-registered" means courses the student has locked in for a FUTURE term. They are NOT yet enrolled in those courses — do not say they are.
- When the data shows both a "current term" section and a "upcoming/pre-registered" section, count them separately. Never add them together to say "you are enrolled in X courses."
- Remaining credit capacity for a future term = 19 − credits already pre-registered for that term.
- If a student is at 19 pre-registered credits, tell them they have hit the cap and need dean approval to add more.

Prerequisite transparency (MANDATORY):
- Whenever a course is blocked or the student cannot take it, you MUST state exactly which prerequisite(s) are missing by name and course code.
- Never say "you are not eligible" or "you cannot take this course" without explaining specifically which requirement is unmet.
- Format: "You need [COURSE CODE: Course Name] before you can register for [blocked course]."

Repetition rules:
- If conversation history shows you already answered a similar question with a course list and the student is asking again or rephrasing, do NOT repeat the same list verbatim.
- Instead: acknowledge the earlier answer, then either (a) offer additional courses not yet mentioned, (b) filter the list by a specific area the student might prefer, or (c) ask "Would you like me to narrow these down by area, credit hours, or time of day?"
- Treat follow-up questions as requests for MORE information, not a cue to repeat.

Classification-aware recommendations:
- Always prioritize courses from the student's current academic year (e.g., Junior Fall/Spring for a Junior student).
- If eligible required courses are designated for a higher classification than the student's current one (e.g., Senior Spring for a Junior), do NOT present them as normal next-semester picks. Note the designation: "This course is designated for Senior Spring — you meet the prerequisites, but confirm with your advisor before registering."
- Never present a list of only 2 courses as "the only options." If required curriculum options are few, always also mention available GE courses and electives from the same context.

Credit transparency:
- When listing course recommendations, include the total credit hours for all listed courses.
- If the context includes credits completed/remaining, proactively state: "You have completed X credits and need Y more to graduate."
- When a student asks for N courses, ensure the suggested list does not exceed the 19-credit semester cap when combined with already-registered credits.

Course availability note:
- Course sections are subject to semester scheduling. Always add: "Verify availability with the AAMU Registrar before registering."

Semantic equivalence rules — treat these as identical in meaning:
- "taken" = "completed" = "passed" = "finished" = "done with" = status: completed
- "enrolled in this semester/term" = courses in the CURRENT term section only
- "registered for next semester" = pre-registered upcoming term courses (NOT currently enrolled)
- "need" = "still need" = "haven't taken" = "remaining" = not yet completed
- An honors course (e.g. ENG 101H) satisfies the standard course requirement (e.g. ENG 101)
- "GED" in advising context = General Education requirements (not high school GED)`
```

- [ ] **Step 2: Start dev server and test a blocked course question**

Run: `npm run dev` in one terminal.
Test via chat: "Can I take CS 403?"
Expected: Response should now explicitly state what prerequisite(s) CS 403 requires, not just "you can't take it."

- [ ] **Step 3: Test repetition prevention**

In chat, ask "What courses can I take?" → get a list → then ask "What other courses can I take?" or "Give me more options."
Expected: Second response should not be word-for-word the same. Should offer more detail or ask for filtering preference.

- [ ] **Step 4: Commit**

```bash
git add backend/services/rag/service.ts
git commit -m "feat: strengthen DB_SYSTEM_PROMPT with prereq transparency, repetition rules, classification awareness, credit totals"
```

---

## Task 3: Curriculum Service — Filter Taken Courses in fetchElectiveOptions

**Files:**
- Modify: `backend/services/curriculum/service.ts:799-821`

`fetchElectiveOptions` currently returns ALL eligible courses for each elective slot regardless of what the student has completed. When a student asks "what electives can I take that I haven't already taken?", the response lists courses they've already passed.

- [ ] **Step 1: Add `studentId` param to `fetchElectiveOptions`**

Find `fetchElectiveOptions` in `backend/services/curriculum/service.ts` (line ~799) and update its signature and body:

```typescript
export async function fetchElectiveOptions(params: {
  programCode: string
  bulletinYear?: string | null
  studentId?: string
}): Promise<ElectiveSlotOption[]> {
  const programCode = params.programCode.trim().toUpperCase()
  const catalogYear = parseCatalogYear(params.bulletinYear)

  const program = await getProgram(programCode, catalogYear)
  if (!program) return []

  const electiveSlots = await getElectiveSlotsWithEligible(program.id)

  // Build taken course codes set if studentId provided
  let takenCodes = new Set<string>()
  if (params.studentId) {
    const userCourses = await getUserCourseStatuses(params.studentId).catch(() => [])
    for (const c of userCourses) {
      const raw = c.code.trim().toUpperCase()
      takenCodes.add(raw)
      takenCodes.add(normalizeHonorsCourseCode(raw))
    }
  }

  return electiveSlots.map((slot) => {
    const courses = Array.isArray(slot.courses) ? slot.courses : slot.courses ? [slot.courses] : []
    const eligible = courses
      .filter((c: any) => !takenCodes.has(c.course_id.trim().toUpperCase()))
      .map((c: any) => ({ courseId: c.course_id, title: c.title }))
    return {
      semesterNumber: slot.semester_number,
      semesterLabel: SEMESTER_LABELS[slot.semester_number] ?? `Semester ${slot.semester_number}`,
      slotLabel: slot.slot_label,
      creditHours: slot.credit_hours,
      eligibleCourses: eligible,
    }
  })
}
```

- [ ] **Step 2: Pass `studentId` from orchestrator to `fetchElectiveOptions`**

In `backend/services/chat-orchestrator/service.ts`, find the `isElectiveQuery` block (line ~545) and update the call:

```typescript
const options = await fetchElectiveOptions({
  programCode,
  bulletinYear: fallbackBulletinYear,
  studentId: payload.studentId ?? undefined,
})
```

- [ ] **Step 3: Verify the fix**

Start dev server. In chat, ask "What electives can I take that I haven't taken?"
Expected: The response should NOT include CS 102, CS 109, CS 203, CS 206, CS 381, CS 384, CS 488, CS 104 (which the test student already completed). Only untaken elective options should appear.

- [ ] **Step 4: Commit**

```bash
git add backend/services/curriculum/service.ts backend/services/chat-orchestrator/service.ts
git commit -m "fix: filter already-taken courses from fetchElectiveOptions when studentId is provided"
```

---

## Task 4: Orchestrator — Include GE Courses in NEXT_COURSES Responses

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts:646-710`

When a student asks "what courses can I take next semester?", the system ONLY checks required curriculum slots (CS required courses). It never surfaces GE courses (humanities, history, fine arts, etc.) even though the student always needs them. This is why the advisor said "only CS 403 and CS 405" — those were the only eligible required courses found, with no GE courses appended.

- [ ] **Step 1: Add GE context fetch in `isNextCoursesQuery` block**

In `backend/services/chat-orchestrator/service.ts`, find the `isNextCoursesQuery` block. After line ~692 (`const filteredRecommendation = ...`), insert:

```typescript
// Fetch GE courses the student hasn't taken — always included alongside required courses
let geContext = ""
if (payload.studentId) {
  const geCtx = await fetchFreeElectiveOptions({
    studentId: payload.studentId,
    isInternational: payload.session?.isInternational,
    scholarshipType: payload.session?.scholarshipType,
    scholarshipMinGpa: payload.session?.scholarshipMinGpa,
    scholarshipMinCreditsPerYear: payload.session?.scholarshipMinCreditsPerYear,
  }).catch(() => null)
  if (geCtx && geCtx.availableCourses.length > 0) {
    geContext = "\n\n" + formatFreeElectivesForLLM(geCtx)
  }
}
```

- [ ] **Step 2: Include `geContext` in the LLM call**

Find the `generateDbResponse` call in the `isNextCoursesQuery` block (line ~699) and update it:

```typescript
const answer = await generateDbResponse(
  question,
  `${studentContextBlock}${degreeSummaryBlock ? degreeSummaryBlock + "\n\n" : ""}${planningContext}${geContext}${countNote}`,
  history
)
```

- [ ] **Step 3: Verify**

Start dev server. Ask "What courses can I take next semester?" for the test student.
Expected: Response should now include BOTH eligible required CS courses AND GE courses the student hasn't completed (humanities, history, fine arts options), not just 2 CS courses.

Also ask: "Give me 5 courses I can take next semester."
Expected: Should be able to return 5 courses by combining required slots + GE options.

- [ ] **Step 4: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "feat: append available GE courses to NEXT_COURSES context so advisor recommends humanities/history/fine arts alongside CS requirements"
```

---

## Task 5: Orchestrator — Classification Advisory for Out-of-Semester Courses

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts:201-291` (buildNextCoursesContext)

When a Junior meets prerequisites for Senior Spring courses, the system shows them as "eligible" without warning. The LLM then contradicts itself: recommending them AND noting they're "for Senior Spring." Add a classification-aware advisory block to the context so the LLM has clear instruction.

- [ ] **Step 1: Add classification semester cap map and advisory to `buildNextCoursesContext`**

In `backend/services/chat-orchestrator/service.ts`, find `buildNextCoursesContext` (line ~201). Before the `return` statement, add:

```typescript
const CLASSIFICATION_MAX_SEMESTER: Record<string, number> = {
  freshman: 2, sophomore: 4, junior: 6, senior: 8,
}

let classificationAdvisory = ""
if (classification) {
  const classKey = classification.toLowerCase()
  const maxSem = CLASSIFICATION_MAX_SEMESTER[classKey]
  if (maxSem) {
    const beyondClass = rec.eligibleNow.filter((c) => c.semesterNumber > maxSem)
    if (beyondClass.length > 0) {
      const beyondList = beyondClass.map((c) => `${c.courseId} (${c.semesterLabel})`).join(", ")
      classificationAdvisory = `\n\n⚠️ Classification Advisory: The student is a ${classification}. The following courses are in the eligible list but designated for a later semester than their current classification: ${beyondList}. Prerequisites are met, but do NOT recommend these as standard next-semester options. Instead, note that they are technically eligible but typically taken later, and suggest the student confirm with their advisor. Always prioritize GE courses and elective options before these.`
    }
  }
}
```

- [ ] **Step 2: Append `classificationAdvisory` to the return string**

Find the `return \`AAMU Semester Credit Cap...` statement in `buildNextCoursesContext` and append `${classificationAdvisory}` at the end:

```typescript
return `AAMU Semester Credit Cap: ${rec.semesterCreditCap} credits max per semester (dean approval required to exceed)
${classification ? `Student Classification: ${classification}\n` : ""}Program: ${rec.programCode} | Catalog Year: ${rec.catalogYear ?? "latest"}
Completed Courses: ${rec.completedCount}

${enrolledSection}

— Eligible to Add (prerequisites met, not yet registered) —
${eligibleLines}

— Blocked (prerequisites not yet satisfied) —
${blockedLines}${classificationAdvisory}`
```

- [ ] **Step 3: Verify**

Start dev server. Ask "What courses can I take this semester?" for the Junior test student.
Expected: CS 403 and CS 405 should now be labeled with a clear note that they're Senior Spring courses, and the response should NOT say "these are the only 2 options." GE courses should be listed as primary options.

- [ ] **Step 4: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "fix: add classification advisory to prevent LLM from recommending out-of-classification courses as standard next-semester options"
```

---

## Task 6: Orchestrator — Quantity Note for Elective and GE Paths

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts` (isFreeElectiveQuery and isElectiveQuery blocks)

When a student says "Give me 5 courses I can take," the elective and GE paths don't pass `requestedCourseCount` to the LLM instruction. Only NEXT_COURSES does. Fix both paths.

- [ ] **Step 1: Update `isFreeElectiveQuery` handler**

Find the `isFreeElectiveQuery` block in `backend/services/chat-orchestrator/service.ts` (line ~523). Replace the `instructionNote` and `generateDbResponse` call:

```typescript
const instructionNote = requestedCourseCount
  ? `\n\nInstruction: The student asked for ${requestedCourseCount} course suggestions. Provide exactly ${requestedCourseCount} specific course recommendations grouped by GE area. Be direct and use a numbered list. Include course codes and credit hours. If international or scholarship rules apply, mention them briefly at the end.`
  : '\n\nInstruction: Suggest appropriate free elective or GE courses based on the student\'s situation. Group by area (Humanities, History, Fine Arts, Social Sciences, etc.). Be specific with course codes and credit hours. If they are international or have a scholarship, include the credit requirements. Always add: "Verify availability with the AAMU Registrar before registering."'

const answer = await generateDbResponse(
  question,
  `${studentContextBlock}\n\n${electivesText}${instructionNote}`,
  history
)
```

- [ ] **Step 2: Update `isElectiveQuery` handler**

Find the `isElectiveQuery` block (line ~545). After building `electiveContext`, add:

```typescript
const electiveCountNote = requestedCourseCount
  ? `\n\nInstruction: The student asked for ${requestedCourseCount} elective suggestions. List exactly ${requestedCourseCount} specific courses from the eligible options below, prioritizing courses for the student's current semester. Include course codes and credit hours.`
  : ""

const answer = await generateDbResponse(question, `${studentContextBlock}${electiveContext}${electiveCountNote}`, history)
```

- [ ] **Step 3: Verify**

Start dev server. Ask "Give me 5 courses I can take." 
Expected: Response provides exactly 5 (or as close as data allows) courses — not 2.

Ask "What elective courses can I take?" 
Expected: Response lists specific untaken electives (no already-completed courses).

- [ ] **Step 4: Commit**

```bash
git add backend/services/chat-orchestrator/service.ts
git commit -m "fix: pass requestedCourseCount instruction to FREE_ELECTIVE and ELECTIVES LLM context so quantity requests are honored"
```

---

## Task 7: Settings UI — Enrollment Card Edit/View Toggle

**Files:**
- Modify: `app/settings/page.tsx`

The Enrollment & Financial Aid card has always-editable fields. The Academic Profile card correctly uses an edit modal pattern (read-only → edit → save → read-only). The Enrollment card needs the same behavior.

- [ ] **Step 1: Add `isEditingEnrollment` state**

In `app/settings/page.tsx`, find the enrollment state declarations (line ~57-65) and add:

```typescript
const [isEditingEnrollment, setIsEditingEnrollment] = useState(false)
```

- [ ] **Step 2: Add cancel handler**

After `handleSaveEnrollment`, add:

```typescript
function handleCancelEnrollment() {
  // Revert to saved values from profile
  setIsInternational(false) // will be overwritten by next loadUserProfile
  setIsEditingEnrollment(false)
  setEnrollmentSaveError('')
  // Re-load from profile to restore original values
  void loadUserProfile()
}
```

- [ ] **Step 3: Update `handleSaveEnrollment` to exit edit mode on success**

In `handleSaveEnrollment`, after `setEnrollmentSaveSuccess(true)`, add:

```typescript
setIsEditingEnrollment(false)
```

- [ ] **Step 4: Replace the Enrollment card JSX with read-only/edit toggle**

Find the Enrollment & Financial Aid `<Card>` in the JSX (line ~461) and replace its content with:

```tsx
<Card className="shadow-sm border-gray-100">
  <CardContent className="p-6">
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Enrollment &amp; Financial Aid</h2>
        <p className="mt-1 text-sm text-gray-500">
          Used by your AI advisor to provide accurate credit and scholarship guidance.
        </p>
      </div>
      {!isEditingEnrollment && (
        <button
          onClick={() => setIsEditingEnrollment(true)}
          className="text-sm font-bold text-[#78103A] hover:underline cursor-pointer"
        >
          Edit
        </button>
      )}
    </div>

    {isEditingEnrollment ? (
      <div className="space-y-6">
        {/* International Student Checkbox */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isInternational}
              onChange={(e) => setIsInternational(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#78103A] accent-[#78103A] cursor-pointer"
            />
            <span className="text-sm font-medium text-gray-900">I am an international student</span>
          </label>
          {isInternational && (
            <p className="mt-2 ml-7 text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">
              International students must maintain at least 12 credits/semester (9 in-person). Summer minimum: 3 credits.
            </p>
          )}
        </div>

        {/* Scholarship Type */}
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
            Scholarship Type
          </label>
          <select
            value={scholarshipType}
            onChange={(e) => setScholarshipType(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent"
          >
            <option value="">None / Not applicable</option>
            <option value="AAMU Presidential Scholarship">AAMU Presidential Scholarship</option>
            <option value="AAMU Academic Excellence Scholarship">AAMU Academic Excellence Scholarship</option>
            <option value="AAMU Achievers Scholarship">AAMU Achievers Scholarship</option>
            <option value="AAMU Bulldog Scholarship">AAMU Bulldog Scholarship</option>
            <option value="AAMU Transfer Scholarship">AAMU Transfer Scholarship</option>
            <option value="AAMU STEM Scholarship">AAMU STEM Scholarship</option>
            <option value="AAMU Need-Based Grant">AAMU Need-Based Grant</option>
            <option value="AAMU Athletic Scholarship">AAMU Athletic Scholarship</option>
            <option value="External Scholarship">External Scholarship</option>
          </select>
        </div>

        {/* External Scholarship Fields */}
        {scholarshipType === 'External Scholarship' && (
          <div className="space-y-4 rounded-lg border border-gray-100 bg-gray-50/50 p-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                Scholarship Name
              </label>
              <input
                type="text"
                value={scholarshipName}
                onChange={(e) => setScholarshipName(e.target.value)}
                placeholder="e.g. Gates Scholarship"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                Minimum GPA Required
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="4"
                value={scholarshipMinGpa}
                onChange={(e) => setScholarshipMinGpa(e.target.value)}
                placeholder="e.g. 3.50"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                Minimum Credits Per Year
              </label>
              <input
                type="number"
                min="0"
                value={scholarshipMinCreditsPerYear}
                onChange={(e) => setScholarshipMinCreditsPerYear(e.target.value)}
                placeholder="e.g. 24"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#78103A] focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* Save / Cancel Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleCancelEnrollment}
            disabled={isSavingEnrollment}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveEnrollment}
            disabled={isSavingEnrollment}
            className="rounded-md bg-[#78103A] px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#600d2e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSavingEnrollment && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Enrollment Info
          </button>
        </div>
        {enrollmentSaveError && (
          <p className="text-sm font-semibold text-red-700">{enrollmentSaveError}</p>
        )}
      </div>
    ) : (
      /* Read-only view */
      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
        <div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">International Student</div>
          <div className="text-base font-medium text-gray-900">
            {isInternational ? "Yes" : "No"}
          </div>
          {isInternational && (
            <p className="mt-1 text-xs text-amber-700">
              Must maintain 12+ credits/semester (9 in-person)
            </p>
          )}
        </div>
        <div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Scholarship</div>
          <div className="text-base font-medium text-gray-900">
            {scholarshipType || "None"}
          </div>
          {scholarshipType === 'External Scholarship' && scholarshipName && (
            <div className="text-sm text-gray-500 mt-0.5">{scholarshipName}</div>
          )}
        </div>
        {scholarshipType === 'External Scholarship' && (scholarshipMinGpa || scholarshipMinCreditsPerYear) && (
          <>
            {scholarshipMinGpa && (
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Min GPA Required</div>
                <div className="text-base font-medium text-gray-900">{scholarshipMinGpa}</div>
              </div>
            )}
            {scholarshipMinCreditsPerYear && (
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Min Credits/Year</div>
                <div className="text-base font-medium text-gray-900">{scholarshipMinCreditsPerYear}</div>
              </div>
            )}
          </>
        )}
      </div>
    )}
    {enrollmentSaveSuccess && !isEditingEnrollment && (
      <p className="mt-4 text-sm font-semibold text-emerald-700">Enrollment info saved successfully!</p>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 5: Verify in browser**

Start dev server: `npm run dev`
Navigate to `/settings`.
Expected:
1. Enrollment card shows read-only values on load (International: No, Scholarship: None)
2. Clicking "Edit" shows the form fields
3. Saving updates values and returns to read-only view
4. Canceling restores original values and returns to read-only view
5. Saved values persist on page refresh

- [ ] **Step 6: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: add edit/view toggle to Enrollment & Financial Aid card — fields lock to read-only after save"
```

---

## Self-Review Checklist

### Spec Coverage

| Gap from Brutal Feedback | Task | Status |
|---|---|---|
| Cross-referencing taken courses (Broken) | Task 3 | Covered |
| GE course recognition (Broken) | Task 1 + Task 4 | Covered |
| Synonym/natural language handling (GED, humanities) | Task 1 | Covered |
| Quantity requests ("give me 5") | Task 6 | Covered |
| Graduation gap analysis (Missing) | Task 2 (LLM rules) | Partially — gap data exists; LLM now surfaced correctly |
| Course availability by semester (Missing) | Task 2 (disclaimer note) | Partially — added note to always verify with Registrar |
| Credit hour tracking (Missing) | Task 2 (LLM rules) | Covered via DB_SYSTEM_PROMPT rule |
| Prerequisite explanation (Missing) | Task 2 | Covered |
| Repetition handling (Broken) | Task 2 | Covered |
| Self-contradicting recommendations (Broken) | Task 5 | Covered |
| GE courses never shown in NEXT_COURSES | Task 4 | Covered |
| Enrollment card always-editable UI | Task 7 | Covered |

### Placeholder Scan

No TBDs, TODOs, or "implement later" entries in this plan. All code blocks are complete and copy-pasteable.

### Type Consistency

- `fetchElectiveOptions` signature updated in Task 3 Step 1 — caller in orchestrator updated in Task 3 Step 2 with matching `studentId?: string` optional param.
- `fetchFreeElectiveOptions` call in Task 4 matches existing function signature in `curriculum/service.ts` (all params optional except `studentId`).
- `classificationAdvisory` variable is a `string` — appended to existing `string` return in `buildNextCoursesContext`. No type mismatch.
- `isEditingEnrollment` is `boolean` state — JSX conditional renders are straightforward toggles.
