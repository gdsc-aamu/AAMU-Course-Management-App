# Smart Advising Expansion — Design Spec
**Date:** 2026-04-22  
**Status:** Approved for implementation

---

## Overview

This spec covers four interconnected improvements to the AAMU Course Management AI advisor:

1. **GE Course Database** — Seed all General Education courses (Areas I–V, 2025-2026 bulletin) so the AI can answer "what can I still take?" with real data instead of "see your advisor"
2. **Honors Equivalency Seeding** — Populate the existing `honors_equivalency` table so honors courses (ENG 101H, etc.) are recognized as satisfying requirements
3. **Enrollment Flags in Settings** — Add international student status and scholarship type to the user profile so the AI always knows the student's registration rules without them having to repeat it
4. **FREE_ELECTIVE Chat Intent** — New chat handler that surfaces remaining available courses (GE + recreational + electives) filtered to exclude already completed/enrolled courses, with enrollment rule awareness

---

## Part 1 — General Education Database

### Problem
The `courses` table has a master catalog and `curriculum_slots` has the CS program plan, but there is no structured mapping of courses to AAMU GE Areas I–V. When a student asks "what golf or swimming course can I take?" or "what GE courses do I still need?", the AI has no GE-aware data and falls back to "contact your advisor."

### New Tables

#### `general_education_areas`
```sql
create table general_education_areas (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,        -- 'AREA_I', 'AREA_II', etc.
  name          text not null,               -- 'Written Composition'
  min_hours     int not null,                -- 6, 12, 11, 12, 19
  notes         text,                        -- e.g. CE/EE/ME exception note
  bulletin_year text not null default '2025-2026',
  created_at    timestamptz default now()
);
```

#### `general_education_courses`
```sql
create table general_education_courses (
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid not null references general_education_areas(id),
  sub_area    text,            -- 'Fine Arts', 'Literature', 'Humanities', 'Mathematics',
                               -- 'Natural/Physical Sciences', 'History', 'Economics',
                               -- 'Other Social Sciences', 'Behavioral Sciences',
                               -- 'Orientation', 'Health', 'Physical Ed', 'Military Sci',
                               -- 'Computer Lit', 'Pre-Professional'
  course_code text not null,   -- 'ENG 101', 'PED 137', 'BIO 101'
  course_title text not null,
  credit_hours int not null,
  notes       text,            -- e.g. 'paired with BIO 101L', 'lab required'
  created_at  timestamptz default now(),
  unique (area_id, course_code)
);
```

### Seed Data (from 2025-2026 AAMU Bulletin)

**Area I — Written Composition (6 hours min, grade C or better required)**
- ENG 101, ENG 101E, ENG 101H, ENG 102, ENG 102H

**Area II — Humanities and Fine Arts (12 hours min; 9 for CE/EE/ME)**

*Fine Arts (min 3 hrs):*
- ART 101, MUS 101, ART 220, ART 221, COMM 101, UPL 102

*Literature / also Humanities (min 3 hrs):*
- ENG 201, ENG 202, ENG 203, ENG 203H, ENG 204, ENG 204H, ENG 207, ENG 208

*Humanities:*
- CHN 101, CHN 102, CHN 201, CHN 202, ENG 205, ENG 205H
- FRE 101, FRE 102, FRE 201, FRE 202
- PHL 201, PHL 203, PHL 206
- SPA 101, SPA 102, SPA 201, SPA 202

**Area III — Natural/Physical Sciences and Mathematics (11 hours min)**

*Mathematics (min 3 hrs):*
- MTH 108, MTH 108E, MTH 110, MTH 111, MTH 112, MTH 112E, MTH 113,
  MTH 115, MTH 120, MTH 125, MTH 126, MTH 227, MTH 237, MTH 238

*Natural/Physical Sciences (min 8 hrs):*
- BIO 101/BIO 101L, BIO 101H, BIO 102/BIO 102L, BIO 103/BIO 103L, BIO 104/BIO 104L
- BIO 203/BIO 203L, BIO 204/BIO 204L
- CHE 101/CHE 101L, CHE 101H/CHE 101HL, CHE 102/CHE 102L, CHE 102H/CHE 102HL
- CHE 111/CHE 111L, CHE 112/CHE 112L, CHE 251/CHE 251L
- PHY 101/PHY 101L, PHY 102/PHY 102L, PHY 201, PHY 202, PHY 213, PHY 214, PHY 220/PHY 220L

**Area IV — History, Social, and Behavioral Sciences (12 hours min; 9 for CE/EE/ME)**

*History / also Social Science (min 3 hrs):*
- HIS 101, HIS 101E, HIS 101H, HIS 102, HIS 102H, HIS 201, HIS 202

*Economics / also Social Science (min 3 hrs):*
- ECO 200, ECO 230, ECO 231

*Other Social Sciences:*
- GEO 213, GEO 214, PSC 201, SOC 201, SOC 210, SOC 212, UPL 103

*Behavioral Sciences:*
- PSY 201, PSY 211, SOC 201, SOC 210, SOC 212

**Area V — Pre-Professional, Major, Electives (19–23 hours min)**

*Orientation (2 hrs):*
- ORI 101 (1 ch), ORI 101H (1 ch), ORI 102 (1 ch) — required for students entering with <30 college credits

*Health (2 hrs):*
- FAS 101, HED 101, NHM 104

*Physical Education (1 ch each — recreational courses):*
- PED 102, PED 107, PED 111, PED 114, PED 132, PED 133, PED 137

*Military Science:*
- MSC 101 (2 ch)

*Computer Literacy (3 hrs — one required):*
- ART 103, CMG 225, CS 101, CS 102, CS 104, EE 109, EGC 104, FED 215, ME 104, MIS 213, NRE 199

*Pre-Professional/Major (12–23 hrs):* program-specific 100-200 level courses

### Double-Counting Rule
A GE course that also appears in the student's `user_completed_courses` is already satisfied — do not resurface it. The AI cross-references both tables at query time.

---

## Part 2 — Honors Equivalency Seeding

### Problem
`honors_equivalency` table schema exists but has zero rows. Honors course codes (ENG 101H) are never matched to their standard equivalents, making it appear students are missing prerequisites they've already satisfied.

### Seed Data (from 2025-2026 bulletin)
| Honors Code | Standard Code |
|---|---|
| ENG 101H | ENG 101 |
| ENG 102H | ENG 102 |
| ENG 203H | ENG 203 |
| ENG 204H | ENG 204 |
| ENG 205H | ENG 205 |
| HIS 101H | HIS 101 |
| HIS 102H | HIS 102 |
| BIO 101H | BIO 101 |
| CHE 101H | CHE 101 |
| CHE 101HL | CHE 101L |
| CHE 102H | CHE 102 |
| CHE 102HL | CHE 102L |
| ORI 101H | ORI 101 |

### Implementation
Single seed script `scripts/seed-honors-equivalency.js` using upsert — idempotent, safe to re-run.

---

## Part 3 — Enrollment Flags in Settings

### Problem
International student status and scholarship type live nowhere in the system. The AI cannot give accurate registration advice without knowing whether a student has a 12-credit minimum (international) or a 30-credit/year scholarship requirement.

### DB Migration

Add columns to `user_academic_profiles`:
```sql
alter table user_academic_profiles
  add column if not exists is_international       boolean default false,
  add column if not exists scholarship_type       text,     -- see enum below
  add column if not exists scholarship_name       text,     -- free text for external
  add column if not exists scholarship_min_gpa    numeric,  -- for external scholarships
  add column if not exists scholarship_min_credits_per_year int; -- for external scholarships
```

**`scholarship_type` values:**
- `'presidential'` — renewal GPA 3.50, 30 credits/year
- `'merit'` — renewal GPA 3.10, 30 credits/year
- `'transfer_merit'` — renewal GPA 3.10, 30 credits/year
- `'normalite'` — renewal GPA 2.80, 30 credits/year
- `'academic_recognition'` — renewal GPA 2.80, 30 credits/year
- `'heritage_gold'` — renewal GPA 2.80, 30 credits/year
- `'heritage_silver'` — renewal GPA 2.80, 30 credits/year
- `'heritage_bronze'` — renewal GPA 2.50, 30 credits/year
- `'external'` — uses `scholarship_name`, `scholarship_min_gpa`, `scholarship_min_credits_per_year`
- `null` — no scholarship

### Settings UI Changes

**New section in Settings page: "Enrollment & Financial Aid"**

```
[ ] I am an international student
    ↳ (shown when checked): International students must maintain at least 12 credits
       per semester (minimum 9 in-person). Summer: minimum 3 credits unless on internship.

Scholarship:
[ Dropdown: None / Presidential / Merit / Transfer Merit / Normalite Opportunity /
            Academic Recognition / Heritage Gold / Heritage Silver / Heritage Bronze / External ]

(shown when External selected):
  Scholarship name: [text input]
  Minimum GPA required: [number input, e.g. 3.00]
  Minimum credits required per year: [number input, e.g. 30]
```

**Renewal GPA lookup table** (hardcoded in frontend/backend, not DB):
```typescript
const AAMU_SCHOLARSHIP_RULES: Record<string, { renewalGpa: number; minCreditsPerYear: number }> = {
  presidential:         { renewalGpa: 3.50, minCreditsPerYear: 30 },
  merit:                { renewalGpa: 3.10, minCreditsPerYear: 30 },
  transfer_merit:       { renewalGpa: 3.10, minCreditsPerYear: 30 },
  normalite:            { renewalGpa: 2.80, minCreditsPerYear: 30 },
  academic_recognition: { renewalGpa: 2.80, minCreditsPerYear: 30 },
  heritage_gold:        { renewalGpa: 2.80, minCreditsPerYear: 30 },
  heritage_silver:      { renewalGpa: 2.80, minCreditsPerYear: 30 },
  heritage_bronze:      { renewalGpa: 2.50, minCreditsPerYear: 30 },
}
```

### Session Context Extension

Add to `CachedSessionContext` and `ChatQueryRequest.session`:
```typescript
isInternational?: boolean
scholarshipType?: string
scholarshipMinGpa?: number
scholarshipMinCreditsPerYear?: number
```

These are loaded from `user_academic_profiles` on session start, cached via `sessionCache`, passed in every chat payload.

---

## Part 4 — FREE_ELECTIVE Chat Intent

### Problem
When a student asks "what courses can I add?", "any golf or swimming class?", "I need 4 more credits — what are my options?", the current orchestrator has no intent to handle this. `ELECTIVES` only covers curriculum elective slots, not GE/recreational courses. The AI returns "see your advisor."

### New Intent: `FREE_ELECTIVE`

**Detection regex** (in `lib/chat-routing/router.ts`):
```
/(free\s+elective|any\s+course|just\s+need\s+(more\s+)?credits?|fill\s+(up\s+)?credits?|
  reach\s+\d+\s+credits?|add\s+(a\s+)?course|golf|swimming|tennis|gym|physical\s+ed|
  recreational|what\s+can\s+i\s+(add|take)|not\s+required|fun\s+course|
  extra\s+credits?|remain(ing)?\s+credits?)/i
```

### Handler Logic (in `chat-orchestrator/service.ts`)

```
1. Fetch student's completed + in_progress course codes
2. Fetch all GE courses from general_education_courses table
3. Filter: remove any GE course code the student has completed or is enrolled in
4. Group remaining by Area and sub-area
5. Build enrollment rule context:
   - If is_international: note 12-credit minimum (9 in-person), 3 for summer
   - If scholarship: note 30-credit/year requirement, renewal GPA threshold
   - Note max 19 credits/semester (overload requires 3.0 GPA + Academic Affairs approval)
   - Note current registered credit count so AI can say "you have 4 credits left before max"
6. If degree progress >= 90%: also include a "fun/recreational" section
   highlighting PED courses (golf PED 137, swimming PED 132/133, tennis PED 111, etc.)
   and any Area II fine arts or humanities they haven't taken
7. Pass to generateDbResponse with student context + GE course list + enrollment rules
```

### Sample AI Output (target behavior)
```
You have 4 credits left before the 19-credit max this semester. Here are courses
you haven't taken yet that you can add:

**Physical Education (1 credit each)**
• PED 137 — Golf
• PED 111 — Tennis
• PED 132 — Beginning Swim/Aquatic Ed
• PED 133 — Intermediate Swimming
• PED 114 — Aerobics/Weight Training

**Fine Arts (3 credits)**
• ART 101 — Art Appreciation
• MUS 101 — Music Appreciation

**Social Sciences (3 credits)**
• PSY 201 — General Psychology
• GEO 213 — Principles of Geography

⚠️ International student reminder: Make sure at least 9 of your registered credits
are in-person courses to maintain your student status.

Remember to verify these are offered this semester in Banner before registering.
```

### Cross-Reference with Curriculum
Before showing GE courses, the handler also checks `recommendNextCoursesForUser` — if there are curriculum-required courses the student is still eligible for, those are shown first with a note: "You still have required courses available — consider these before adding electives."

---

## Part 5 — Academic Policy in RAG (Withdrawal, Grades, etc.)

The 2025-2026 Academic Policy Manual (Aug 2025) is already chunked for RAG but the key policies should be verified as indexed. Key policies the AI should be able to answer from RAG:

| Policy | Key Facts |
|---|---|
| Withdrawal | Deadline = last day of class; student gets W grade; discuss with advisor first |
| Incomplete (I) | Requires C average + 75% work completed; must resolve within 1 year or becomes F |
| Repeat courses | Highest grade counts in GPA; credit earned once |
| Credit overload | Max 19/semester; >19 requires 3.0 GPA + Academic Affairs form |
| Academic probation | Max 12 credits while on probation |
| Summer load | Max 10 credits (12 only for graduating seniors with permission) |
| Full-time status | 12+ credits/semester, 6+ in summer |
| Academic bankruptcy | Entire semester wiped (WB); granted once only; 1-year wait |
| Statute of limitations | Credits expire after 10 years |
| Minor requirement | 18-20 credit hours minimum; max 50% overlap with major |
| Concentration requirement | 21-23 credit hours minimum; max 50% overlap with major |

These are handled by the existing `BULLETIN_POLICY` intent + RAG — no new code needed, just verify the Aug 2025 policy manual is indexed.

---

## Files to Create / Modify

| File | Change |
|---|---|
| `backend/schema.sql` | Add `general_education_areas` + `general_education_courses` tables; migration for new `user_academic_profiles` columns |
| `scripts/seed-ge-courses.js` | NEW — seed all GE Areas I–V from 2025-2026 bulletin |
| `scripts/seed-honors-equivalency.js` | NEW — seed all honors→standard code mappings |
| `backend/data-access/curriculum.ts` | Add `getGECoursesForStudent(userId)` — fetches all GE courses, filters out completed/in_progress |
| `backend/services/curriculum/service.ts` | Add `fetchFreeElectiveOptions(params)` — GE courses + enrollment rule context |
| `backend/services/chat-orchestrator/service.ts` | Add `FREE_ELECTIVE` intent handler; enrich student context with `isInternational`, `scholarshipType` |
| `lib/chat-routing/router.ts` | Add FREE_ELECTIVE regex detection |
| `shared/contracts/index.ts` | Add `isInternational`, `scholarshipType`, `scholarshipMinGpa`, `scholarshipMinCreditsPerYear` to session |
| `lib/app-cache.ts` | Add enrollment flags to `CachedSessionContext` |
| `app/settings/page.tsx` | Add "Enrollment & Financial Aid" section with international toggle + scholarship selector + external scholarship form |
| `backend/data-access/user-profile.ts` | Add enrollment flag fields to profile read/write |

---

## Verification Checklist

1. Student asks "what golf course can I take?" → AI lists PED courses they haven't taken
2. Student asks "I need 4 more credits to hit 18 — what are my options?" → AI shows all untaken GE courses within 4 credits, groups by area
3. Student has ENG 101H on transcript → prerequisites for ENG 102 are satisfied (honors normalized)
4. Student is marked international → AI always appends "remember at least 9 in-person credits" to registration advice
5. Student has Presidential scholarship → AI notes "you need 30 credits this academic year; you have 15 registered for Fall, so Spring you'll need at least 15"
6. Student at 95% degree progress asks for courses → recreational PED courses are prominently offered
7. Student asks "what happens if I withdraw?" → RAG returns official W grade policy from 2025 manual
8. Student on academic probation (future) → AI knows max 12 credits applies
9. External scholarship holder → AI uses their custom GPA and credit requirements

---

## Out of Scope

- Live Banner section availability (requires authenticated Banner access — not feasible)
- Financial aid award amounts
- Advisor appointment scheduling
- Graduate course recommendations (500-level+)
