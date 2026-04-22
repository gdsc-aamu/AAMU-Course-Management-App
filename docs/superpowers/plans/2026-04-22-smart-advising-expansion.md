# Smart Advising Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GE course awareness, honors equivalency seeding, enrollment flags (international/scholarship), and a FREE_ELECTIVE chat intent so the AI gives real course suggestions instead of "see your advisor."

**Architecture:** New DB tables (`general_education_areas`, `general_education_courses`) + DB migration on `user_academic_profiles` feed a new `getAvailableGECourses()` data-access function, a new `fetchFreeElectiveOptions()` curriculum service, and a new `FREE_ELECTIVE` intent handler in the chat orchestrator. Enrollment flags flow from Settings UI → DB → session context → every chat payload.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL), Supabase JS client, OpenAI gpt-4o-mini (intent routing)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/schema.sql` | Modify | Add GE tables + enrollment columns migration |
| `scripts/seed-ge-courses.js` | Create | Seed Areas I–V from 2025-2026 bulletin |
| `scripts/seed-honors-equivalency.js` | Create | Seed 13 honors→standard mappings |
| `backend/data-access/curriculum.ts` | Modify | Add `getAvailableGECourses()` |
| `backend/data-access/user-profile.ts` | Modify | Add enrollment flag fields to row type + upsert |
| `backend/services/curriculum/service.ts` | Modify | Add `fetchFreeElectiveOptions()` + `formatFreeElectivesForLLM()` |
| `backend/services/chat-orchestrator/service.ts` | Modify | Add `asksFreeElectiveQuestion()` + FREE_ELECTIVE handler |
| `lib/chat-routing/router.ts` | Modify | Add `FREE_ELECTIVE` to intent label union + classifier prompt |
| `shared/contracts/index.ts` | Modify | Add enrollment flags to `ChatQueryRequest.session` |
| `lib/app-cache.ts` | Modify | Add enrollment flags to `CachedSessionContext` |
| `components/editor/ai-suggestions.tsx` | Modify | Load + pass enrollment flags in session payload |
| `app/settings/page.tsx` | Modify | Add "Enrollment & Financial Aid" UI section |
| `app/api/user/academic-profile/route.ts` | Modify | Read/write new enrollment flag columns |

---

## Task 1: DB Schema — GE Tables

**Files:**
- Modify: `backend/schema.sql`

- [ ] **Step 1: Add GE tables to schema.sql**

Append to the end of `backend/schema.sql` (before the final comment block):

```sql
-- ============================================================
-- GENERAL EDUCATION AREAS
-- AAMU Areas I–V from the 2025-2026 bulletin
-- ============================================================
create table if not exists general_education_areas (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  min_hours     int  not null,
  notes         text,
  bulletin_year text not null default '2025-2026',
  created_at    timestamptz default now()
);

-- ============================================================
-- GENERAL EDUCATION COURSES
-- Course → area mappings (one course may appear in multiple sub-areas)
-- ============================================================
create table if not exists general_education_courses (
  id           uuid primary key default gen_random_uuid(),
  area_id      uuid not null references general_education_areas(id) on delete cascade,
  sub_area     text,
  course_code  text not null,
  course_title text not null,
  credit_hours int  not null,
  notes        text,
  created_at   timestamptz default now(),
  unique (area_id, course_code)
);

create index if not exists idx_ge_courses_area
  on general_education_courses (area_id);

create index if not exists idx_ge_courses_code
  on general_education_courses (course_code);
```

- [ ] **Step 2: Add enrollment flag columns migration**

Also append to `backend/schema.sql`:

```sql
-- ============================================================
-- ENROLLMENT FLAGS (migration — safe to re-run with IF NOT EXISTS)
-- ============================================================
alter table user_academic_profiles
  add column if not exists is_international              boolean default false,
  add column if not exists scholarship_type              text,
  add column if not exists scholarship_name              text,
  add column if not exists scholarship_min_gpa           numeric,
  add column if not exists scholarship_min_credits_per_year int;
```

- [ ] **Step 3: Run these SQL statements in Supabase SQL editor**

Open your Supabase project → SQL Editor → paste and run the two blocks above. Verify by checking Table Editor — `general_education_areas` and `general_education_courses` should appear. `user_academic_profiles` should now have the 5 new columns.

- [ ] **Step 4: Commit**

```bash
git add backend/schema.sql
git commit -m "feat: add GE tables and enrollment flag columns to schema"
```

---

## Task 2: Seed Honors Equivalency

**Files:**
- Create: `scripts/seed-honors-equivalency.js`

- [ ] **Step 1: Create the seed script**

```js
// scripts/seed-honors-equivalency.js
const { createClient } = require("@supabase/supabase-js")
require("dotenv").config({ path: ".env.local" })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const HONORS_MAPPINGS = [
  { honors_code: "ENG 101H",  standard_code: "ENG 101" },
  { honors_code: "ENG 102H",  standard_code: "ENG 102" },
  { honors_code: "ENG 203H",  standard_code: "ENG 203" },
  { honors_code: "ENG 204H",  standard_code: "ENG 204" },
  { honors_code: "ENG 205H",  standard_code: "ENG 205" },
  { honors_code: "HIS 101H",  standard_code: "HIS 101" },
  { honors_code: "HIS 102H",  standard_code: "HIS 102" },
  { honors_code: "BIO 101H",  standard_code: "BIO 101" },
  { honors_code: "CHE 101H",  standard_code: "CHE 101" },
  { honors_code: "CHE 101HL", standard_code: "CHE 101L" },
  { honors_code: "CHE 102H",  standard_code: "CHE 102" },
  { honors_code: "CHE 102HL", standard_code: "CHE 102L" },
  { honors_code: "ORI 101H",  standard_code: "ORI 101" },
]

async function main() {
  console.log("Seeding honors equivalency...")
  const { error } = await supabase
    .from("honors_equivalency")
    .upsert(HONORS_MAPPINGS, { onConflict: "honors_code" })

  if (error) {
    console.error("Error:", error.message)
    process.exit(1)
  }
  console.log(`✓ Upserted ${HONORS_MAPPINGS.length} honors mappings`)
}

main()
```

- [ ] **Step 2: Run the seed script**

```bash
node scripts/seed-honors-equivalency.js
```

Expected output:
```
Seeding honors equivalency...
✓ Upserted 13 honors mappings
```

- [ ] **Step 3: Verify in Supabase**

In Supabase Table Editor → `honors_equivalency` → should show 13 rows.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-honors-equivalency.js
git commit -m "feat: seed honors equivalency table with 13 AAMU honors course mappings"
```

---

## Task 3: Seed GE Courses (Areas I–V)

**Files:**
- Create: `scripts/seed-ge-courses.js`

- [ ] **Step 1: Create the seed script**

```js
// scripts/seed-ge-courses.js
const { createClient } = require("@supabase/supabase-js")
require("dotenv").config({ path: ".env.local" })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const AREAS = [
  { code: "AREA_I",   name: "Written Composition",                          min_hours: 6,  notes: "Grade of C or better required in each course." },
  { code: "AREA_II",  name: "Humanities and Fine Arts",                     min_hours: 12, notes: "CE, EE, ME majors only need 9 hours (3 hrs Humanities not required). Must complete 6-hour sequence in literature or history." },
  { code: "AREA_III", name: "Natural/Physical Sciences and Mathematics",     min_hours: 11, notes: "Minimum 3 hrs Mathematics, minimum 8 hrs Natural/Physical Sciences." },
  { code: "AREA_IV",  name: "History, Social, and Behavioral Sciences",     min_hours: 12, notes: "CE, EE, ME majors only need 9 hours. Must complete 6-hour sequence in literature or history." },
  { code: "AREA_V",   name: "Pre-Professional, Major, Electives",           min_hours: 19, notes: "19-23 hours minimum. Includes orientation, health, physical ed, computer literacy, and program-specific courses." },
]

// Area I courses
const AREA_I_COURSES = [
  { sub_area: "Written Composition", course_code: "ENG 101",  course_title: "Composition I",          credit_hours: 3 },
  { sub_area: "Written Composition", course_code: "ENG 101E", course_title: "Composition I w/ Lab",   credit_hours: 3 },
  { sub_area: "Written Composition", course_code: "ENG 101H", course_title: "Composition I Honors",   credit_hours: 3 },
  { sub_area: "Written Composition", course_code: "ENG 102",  course_title: "Composition II",         credit_hours: 3 },
  { sub_area: "Written Composition", course_code: "ENG 102H", course_title: "Composition II Honors",  credit_hours: 3 },
]

// Area II courses
const AREA_II_COURSES = [
  { sub_area: "Fine Arts",    course_code: "ART 101",   course_title: "Art Appreciation",             credit_hours: 3 },
  { sub_area: "Fine Arts",    course_code: "MUS 101",   course_title: "Music Appreciation",           credit_hours: 3 },
  { sub_area: "Fine Arts",    course_code: "ART 220",   course_title: "History of Art I",             credit_hours: 3 },
  { sub_area: "Fine Arts",    course_code: "ART 221",   course_title: "History of Art II",            credit_hours: 3 },
  { sub_area: "Fine Arts",    course_code: "COMM 101",  course_title: "Theater Appreciation",         credit_hours: 3 },
  { sub_area: "Fine Arts",    course_code: "UPL 102",   course_title: "Public Art in Cities",         credit_hours: 3 },
  { sub_area: "Literature",   course_code: "ENG 201",   course_title: "Survey of English Literature I",  credit_hours: 3 },
  { sub_area: "Literature",   course_code: "ENG 202",   course_title: "Survey of English Literature II", credit_hours: 3 },
  { sub_area: "Literature",   course_code: "ENG 203",   course_title: "World Literature I",           credit_hours: 3 },
  { sub_area: "Literature",   course_code: "ENG 203H",  course_title: "World Literature I Honors",   credit_hours: 3 },
  { sub_area: "Literature",   course_code: "ENG 204",   course_title: "World Literature II",          credit_hours: 3 },
  { sub_area: "Literature",   course_code: "ENG 204H",  course_title: "World Literature II Honors",  credit_hours: 3 },
  { sub_area: "Literature",   course_code: "ENG 207",   course_title: "American Literature I",        credit_hours: 3 },
  { sub_area: "Literature",   course_code: "ENG 208",   course_title: "American Literature II",       credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "CHN 101",   course_title: "Elementary Chinese I",         credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "CHN 102",   course_title: "Elementary Chinese II",        credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "CHN 201",   course_title: "Intermediate Chinese I",       credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "CHN 202",   course_title: "Intermediate Chinese II",      credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "ENG 205",   course_title: "General Speech",               credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "ENG 205H",  course_title: "General Speech Honors",        credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "FRE 101",   course_title: "Elementary French I",          credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "FRE 102",   course_title: "Elementary French II",         credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "FRE 201",   course_title: "Intermediate French I",        credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "FRE 202",   course_title: "Intermediate French II",       credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "PHL 201",   course_title: "Introduction to Philosophy",   credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "PHL 203",   course_title: "Logic & Philosophy of Science",credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "PHL 206",   course_title: "Ethics",                       credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "SPA 101",   course_title: "Elementary Spanish I",         credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "SPA 102",   course_title: "Elementary Spanish II",        credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "SPA 201",   course_title: "Intermediate Spanish I",       credit_hours: 3 },
  { sub_area: "Humanities",   course_code: "SPA 202",   course_title: "Intermediate Spanish II",      credit_hours: 3 },
]

// Area III courses
const AREA_III_COURSES = [
  { sub_area: "Mathematics", course_code: "MTH 108",  course_title: "Quantitative Reasoning",               credit_hours: 3 },
  { sub_area: "Mathematics", course_code: "MTH 108E", course_title: "Quantitative Reasoning w/ Lab",        credit_hours: 3 },
  { sub_area: "Mathematics", course_code: "MTH 110",  course_title: "Finite Mathematics",                   credit_hours: 3 },
  { sub_area: "Mathematics", course_code: "MTH 111",  course_title: "Elementary Statistics I",              credit_hours: 3 },
  { sub_area: "Mathematics", course_code: "MTH 112",  course_title: "Pre-Calculus Algebra",                 credit_hours: 3 },
  { sub_area: "Mathematics", course_code: "MTH 112E", course_title: "Pre-Calculus Algebra w/ Lab",          credit_hours: 3 },
  { sub_area: "Mathematics", course_code: "MTH 113",  course_title: "Pre-Calculus Trigonometry",            credit_hours: 3 },
  { sub_area: "Mathematics", course_code: "MTH 115",  course_title: "Pre-Calculus Algebra & Trigonometry",  credit_hours: 3 },
  { sub_area: "Mathematics", course_code: "MTH 120",  course_title: "Calculus and Its Applications",        credit_hours: 3 },
  { sub_area: "Mathematics", course_code: "MTH 125",  course_title: "Calculus I",                           credit_hours: 4 },
  { sub_area: "Mathematics", course_code: "MTH 126",  course_title: "Calculus II",                          credit_hours: 4 },
  { sub_area: "Mathematics", course_code: "MTH 227",  course_title: "Calculus III",                         credit_hours: 4 },
  { sub_area: "Mathematics", course_code: "MTH 237",  course_title: "Linear Algebra",                       credit_hours: 3 },
  { sub_area: "Mathematics", course_code: "MTH 238",  course_title: "Applied Differential Equations",       credit_hours: 3 },
  { sub_area: "Natural/Physical Sciences", course_code: "BIO 101",    course_title: "General Biology I",                   credit_hours: 3, notes: "Paired with BIO 101L" },
  { sub_area: "Natural/Physical Sciences", course_code: "BIO 101L",   course_title: "General Biology I Lab",               credit_hours: 1, notes: "Lab for BIO 101" },
  { sub_area: "Natural/Physical Sciences", course_code: "BIO 101H",   course_title: "General Biology & Lab Honors",        credit_hours: 4 },
  { sub_area: "Natural/Physical Sciences", course_code: "BIO 102",    course_title: "General Biology II",                  credit_hours: 3, notes: "Paired with BIO 102L" },
  { sub_area: "Natural/Physical Sciences", course_code: "BIO 102L",   course_title: "General Biology II Lab",              credit_hours: 1, notes: "Lab for BIO 102" },
  { sub_area: "Natural/Physical Sciences", course_code: "BIO 103",    course_title: "Principles of Biology I",             credit_hours: 3, notes: "Paired with BIO 103L" },
  { sub_area: "Natural/Physical Sciences", course_code: "BIO 103L",   course_title: "Principles of Biology I Lab",         credit_hours: 1 },
  { sub_area: "Natural/Physical Sciences", course_code: "BIO 104",    course_title: "Principles of Biology II",            credit_hours: 3, notes: "Paired with BIO 104L" },
  { sub_area: "Natural/Physical Sciences", course_code: "BIO 104L",   course_title: "Principles of Biology II Lab",        credit_hours: 1 },
  { sub_area: "Natural/Physical Sciences", course_code: "BIO 203",    course_title: "General Botany I",                    credit_hours: 3, notes: "Paired with BIO 203L" },
  { sub_area: "Natural/Physical Sciences", course_code: "BIO 203L",   course_title: "General Botany I Lab",                credit_hours: 1 },
  { sub_area: "Natural/Physical Sciences", course_code: "BIO 204",    course_title: "General Botany II",                   credit_hours: 3, notes: "Paired with BIO 204L" },
  { sub_area: "Natural/Physical Sciences", course_code: "BIO 204L",   course_title: "General Botany II Lab",               credit_hours: 1 },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 101",    course_title: "General Chemistry I",                 credit_hours: 3, notes: "Paired with CHE 101L" },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 101L",   course_title: "General Chemistry I Lab",             credit_hours: 1 },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 101H",   course_title: "General Chemistry I Honors",          credit_hours: 3, notes: "Paired with CHE 101HL" },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 101HL",  course_title: "General Chemistry I Lab Honors",      credit_hours: 1 },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 102",    course_title: "General Chemistry II",                credit_hours: 3, notes: "Paired with CHE 102L" },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 102L",   course_title: "General Chemistry II Lab",            credit_hours: 1 },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 102H",   course_title: "General Chemistry II Honors",         credit_hours: 3, notes: "Paired with CHE 102HL" },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 102HL",  course_title: "General Chemistry II Lab Honors",     credit_hours: 1 },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 111",    course_title: "Applied Chemistry I",                 credit_hours: 3, notes: "Paired with CHE 111L" },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 111L",   course_title: "Applied Chemistry I Lab",             credit_hours: 1 },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 112",    course_title: "Applied Chemistry II",                credit_hours: 3, notes: "Paired with CHE 112L" },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 112L",   course_title: "Applied Chemistry II Lab",            credit_hours: 1 },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 251",    course_title: "Organic Chemistry I",                 credit_hours: 3, notes: "Paired with CHE 251L" },
  { sub_area: "Natural/Physical Sciences", course_code: "CHE 251L",   course_title: "Organic Chemistry I Lab",             credit_hours: 1 },
  { sub_area: "Natural/Physical Sciences", course_code: "PHY 101",    course_title: "Physical Science I",                  credit_hours: 3, notes: "Paired with PHY 101L" },
  { sub_area: "Natural/Physical Sciences", course_code: "PHY 101L",   course_title: "Physical Science I Lab",              credit_hours: 1 },
  { sub_area: "Natural/Physical Sciences", course_code: "PHY 102",    course_title: "Physical Science II",                 credit_hours: 3, notes: "Paired with PHY 102L" },
  { sub_area: "Natural/Physical Sciences", course_code: "PHY 102L",   course_title: "Physical Science II Lab",             credit_hours: 1 },
  { sub_area: "Natural/Physical Sciences", course_code: "PHY 201",    course_title: "General Physics with Trigonometry I", credit_hours: 3 },
  { sub_area: "Natural/Physical Sciences", course_code: "PHY 202",    course_title: "General Physics with Trigonometry II",credit_hours: 3 },
  { sub_area: "Natural/Physical Sciences", course_code: "PHY 213",    course_title: "General Physics with Calculus I",     credit_hours: 3 },
  { sub_area: "Natural/Physical Sciences", course_code: "PHY 214",    course_title: "General Physics with Calculus II",    credit_hours: 3 },
  { sub_area: "Natural/Physical Sciences", course_code: "PHY 220",    course_title: "Introduction to Astronomy",           credit_hours: 3, notes: "Paired with PHY 220L" },
  { sub_area: "Natural/Physical Sciences", course_code: "PHY 220L",   course_title: "Introduction to Astronomy Lab",       credit_hours: 1 },
]

// Area IV courses
const AREA_IV_COURSES = [
  { sub_area: "History",             course_code: "HIS 101",  course_title: "World History I",                    credit_hours: 3 },
  { sub_area: "History",             course_code: "HIS 101E", course_title: "World History I Enriched",           credit_hours: 3 },
  { sub_area: "History",             course_code: "HIS 101H", course_title: "World History I Honors",             credit_hours: 3 },
  { sub_area: "History",             course_code: "HIS 102",  course_title: "World History II",                   credit_hours: 3 },
  { sub_area: "History",             course_code: "HIS 102H", course_title: "World History II Honors",            credit_hours: 3 },
  { sub_area: "History",             course_code: "HIS 201",  course_title: "American History I",                 credit_hours: 3 },
  { sub_area: "History",             course_code: "HIS 202",  course_title: "American History II",                credit_hours: 3 },
  { sub_area: "Economics",           course_code: "ECO 200",  course_title: "Basic Economics",                    credit_hours: 3 },
  { sub_area: "Economics",           course_code: "ECO 230",  course_title: "Principles of Microeconomics",       credit_hours: 3 },
  { sub_area: "Economics",           course_code: "ECO 231",  course_title: "Principles of Macroeconomics",       credit_hours: 3 },
  { sub_area: "Other Social Sciences", course_code: "GEO 213", course_title: "Principles of Geography",          credit_hours: 3 },
  { sub_area: "Other Social Sciences", course_code: "GEO 214", course_title: "World Regional Geography",         credit_hours: 3 },
  { sub_area: "Other Social Sciences", course_code: "PSC 201", course_title: "Introduction to Political Science",credit_hours: 3 },
  { sub_area: "Other Social Sciences", course_code: "SOC 201", course_title: "Introduction to Sociology",        credit_hours: 3 },
  { sub_area: "Other Social Sciences", course_code: "SOC 210", course_title: "Social Problems",                  credit_hours: 3 },
  { sub_area: "Other Social Sciences", course_code: "SOC 212", course_title: "Marriage and the Family",          credit_hours: 3 },
  { sub_area: "Other Social Sciences", course_code: "UPL 103", course_title: "Community and You",                credit_hours: 3 },
  { sub_area: "Behavioral Sciences", course_code: "PSY 201",  course_title: "General Psychology",               credit_hours: 3 },
  { sub_area: "Behavioral Sciences", course_code: "PSY 211",  course_title: "Child Growth & Development",       credit_hours: 3 },
]

// Area V courses
const AREA_V_COURSES = [
  { sub_area: "Orientation",    course_code: "ORI 101",  course_title: "First Year Experience",        credit_hours: 1, notes: "Required for students entering with <30 college credits" },
  { sub_area: "Orientation",    course_code: "ORI 101H", course_title: "First Year Experience Honors", credit_hours: 1, notes: "Required for students entering with <30 college credits" },
  { sub_area: "Orientation",    course_code: "ORI 102",  course_title: "First Year Experience",        credit_hours: 1, notes: "Required for students entering with <30 college credits" },
  { sub_area: "Health",         course_code: "FAS 101",  course_title: "Food & Survival of Man",       credit_hours: 2 },
  { sub_area: "Health",         course_code: "HED 101",  course_title: "Personal & Community Health",  credit_hours: 2 },
  { sub_area: "Health",         course_code: "NHM 104",  course_title: "Nutrition Today",              credit_hours: 2 },
  { sub_area: "Physical Ed",    course_code: "PED 102",  course_title: "Fitness for Life",             credit_hours: 1 },
  { sub_area: "Physical Ed",    course_code: "PED 107",  course_title: "Gymnastics",                   credit_hours: 1 },
  { sub_area: "Physical Ed",    course_code: "PED 111",  course_title: "Tennis",                       credit_hours: 1 },
  { sub_area: "Physical Ed",    course_code: "PED 114",  course_title: "Aerobics/Weight Training",     credit_hours: 1 },
  { sub_area: "Physical Ed",    course_code: "PED 132",  course_title: "Beginning Swim/Aquatic Ed",    credit_hours: 1 },
  { sub_area: "Physical Ed",    course_code: "PED 133",  course_title: "Intermediate Swimming",        credit_hours: 1 },
  { sub_area: "Physical Ed",    course_code: "PED 137",  course_title: "Golf",                         credit_hours: 1 },
  { sub_area: "Military Sci",   course_code: "MSC 101",  course_title: "Military Science I",           credit_hours: 2 },
  { sub_area: "Computer Lit",   course_code: "ART 103",  course_title: "Intro Comp Sys for Vis Artists",  credit_hours: 3, notes: "Computer literacy requirement" },
  { sub_area: "Computer Lit",   course_code: "CMG 225",  course_title: "Comp Appl for Construction",     credit_hours: 3, notes: "Computer literacy requirement" },
  { sub_area: "Computer Lit",   course_code: "CS 101",   course_title: "Fund of Comp & Info Systems",    credit_hours: 3, notes: "Computer literacy requirement" },
  { sub_area: "Computer Lit",   course_code: "CS 102",   course_title: "Introduction to Programming",    credit_hours: 3, notes: "Computer literacy requirement" },
  { sub_area: "Computer Lit",   course_code: "CS 104",   course_title: "Intro to Computers and Ethics",  credit_hours: 3, notes: "Computer literacy requirement" },
  { sub_area: "Computer Lit",   course_code: "EE 109",   course_title: "Engineering Computing",          credit_hours: 3, notes: "Computer literacy requirement" },
  { sub_area: "Computer Lit",   course_code: "EGC 104",  course_title: "Computer Programming",           credit_hours: 3, notes: "Computer literacy requirement" },
  { sub_area: "Computer Lit",   course_code: "FED 215",  course_title: "Instructional Technology",       credit_hours: 3, notes: "Computer literacy requirement" },
  { sub_area: "Computer Lit",   course_code: "ME 104",   course_title: "Engineering Programming I",      credit_hours: 3, notes: "Computer literacy requirement" },
  { sub_area: "Computer Lit",   course_code: "MIS 213",  course_title: "Computer Appl in Business",      credit_hours: 3, notes: "Computer literacy requirement" },
  { sub_area: "Computer Lit",   course_code: "NRE 199",  course_title: "Tech. in Agric & Biological Sci",credit_hours: 3, notes: "Computer literacy requirement" },
]

const COURSES_BY_AREA = {
  AREA_I:   AREA_I_COURSES,
  AREA_II:  AREA_II_COURSES,
  AREA_III: AREA_III_COURSES,
  AREA_IV:  AREA_IV_COURSES,
  AREA_V:   AREA_V_COURSES,
}

async function main() {
  console.log("Seeding GE areas...")
  const { data: areas, error: areaError } = await supabase
    .from("general_education_areas")
    .upsert(AREAS, { onConflict: "code" })
    .select("id, code")

  if (areaError || !areas) {
    console.error("Error seeding areas:", areaError?.message)
    process.exit(1)
  }
  console.log(`✓ Upserted ${areas.length} GE areas`)

  const areaIdByCode = Object.fromEntries(areas.map(a => [a.code, a.id]))

  let totalCourses = 0
  for (const [areaCode, courses] of Object.entries(COURSES_BY_AREA)) {
    const areaId = areaIdByCode[areaCode]
    if (!areaId) { console.warn(`Area not found: ${areaCode}`); continue }

    const rows = courses.map(c => ({ ...c, area_id: areaId }))
    const { error } = await supabase
      .from("general_education_courses")
      .upsert(rows, { onConflict: "area_id,course_code" })

    if (error) {
      console.error(`Error seeding ${areaCode}:`, error.message)
      process.exit(1)
    }
    totalCourses += rows.length
    console.log(`✓ ${areaCode}: ${rows.length} courses`)
  }
  console.log(`\n✓ Total: ${totalCourses} GE courses seeded`)
}

main()
```

- [ ] **Step 2: Run the seed script**

```bash
node scripts/seed-ge-courses.js
```

Expected output:
```
Seeding GE areas...
✓ Upserted 5 GE areas
✓ AREA_I: 5 courses
✓ AREA_II: 31 courses
✓ AREA_III: 51 courses
✓ AREA_IV: 19 courses
✓ AREA_V: 25 courses

✓ Total: 131 GE courses seeded
```

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-ge-courses.js
git commit -m "feat: seed GE courses for Areas I-V from 2025-2026 AAMU bulletin"
```

---

## Task 4: Data Access — GE Course Query

**Files:**
- Modify: `backend/data-access/curriculum.ts`

- [ ] **Step 1: Add GE row types and `getAvailableGECourses` function**

Append to the end of `backend/data-access/curriculum.ts`:

```typescript
// ── General Education ─────────────────────────────────────────────────────────

export interface GEAreaRow {
  id: string
  code: string
  name: string
  min_hours: number
  notes: string | null
}

export interface GECourseRow {
  area_id: string
  area_code: string
  area_name: string
  sub_area: string | null
  course_code: string
  course_title: string
  credit_hours: number
  notes: string | null
}

/**
 * Fetch all GE courses excluding those the student has completed or is enrolled in.
 * Returns courses grouped with area metadata for LLM formatting.
 */
export async function getAvailableGECourses(
  takenCourseCodes: Set<string>
): Promise<GECourseRow[]> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from("general_education_courses")
    .select(`
      area_id,
      sub_area,
      course_code,
      course_title,
      credit_hours,
      notes,
      general_education_areas (
        code,
        name
      )
    `)
    .order("area_id")
    .order("sub_area")
    .order("course_code")

  if (error || !data) return []

  return data
    .filter((row: any) => !takenCourseCodes.has(row.course_code.trim().toUpperCase()))
    .map((row: any) => ({
      area_id:     row.area_id,
      area_code:   Array.isArray(row.general_education_areas)
                     ? (row.general_education_areas[0]?.code ?? "")
                     : (row.general_education_areas?.code ?? ""),
      area_name:   Array.isArray(row.general_education_areas)
                     ? (row.general_education_areas[0]?.name ?? "")
                     : (row.general_education_areas?.name ?? ""),
      sub_area:    row.sub_area,
      course_code: row.course_code,
      course_title: row.course_title,
      credit_hours: row.credit_hours,
      notes:       row.notes,
    }))
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/data-access/curriculum.ts
git commit -m "feat: add getAvailableGECourses data-access function"
```

---

## Task 5: Data Access — Enrollment Flags on User Profile

**Files:**
- Modify: `backend/data-access/user-profile.ts`

- [ ] **Step 1: Update `UserAcademicProfileRow` and both functions**

Replace the entire content of `backend/data-access/user-profile.ts`:

```typescript
/**
 * Data Access Layer - User Academic Profile
 *
 * Responsibility: Read/write user major, bulletin year, and enrollment flags.
 */

import { createClient } from "@supabase/supabase-js"

export interface UserAcademicProfileRow {
  user_id: string
  program_code: string | null
  bulletin_year: string | null
  classification: string | null
  is_international: boolean
  scholarship_type: string | null
  scholarship_name: string | null
  scholarship_min_gpa: number | null
  scholarship_min_credits_per_year: number | null
  updated_at: string
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars")
  return createClient(url, key)
}

export async function getUserAcademicProfile(userId: string): Promise<UserAcademicProfileRow | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("user_academic_profiles")
    .select("user_id, program_code, bulletin_year, classification, is_international, scholarship_type, scholarship_name, scholarship_min_gpa, scholarship_min_credits_per_year, updated_at")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    throw new Error(`[data-access:getUserAcademicProfile] ${error.message}`)
  }

  return data
    ? {
        ...data,
        is_international: data.is_international ?? false,
      }
    : null
}

export async function upsertUserAcademicProfile(params: {
  userId: string
  programCode?: string | null
  bulletinYear?: string | null
  classification?: string | null
  isInternational?: boolean
  scholarshipType?: string | null
  scholarshipName?: string | null
  scholarshipMinGpa?: number | null
  scholarshipMinCreditsPerYear?: number | null
}): Promise<UserAcademicProfileRow> {
  const supabase = getSupabaseClient()

  const row: Record<string, unknown> = {
    user_id: params.userId,
    updated_at: new Date().toISOString(),
  }
  if (params.programCode !== undefined)              row.program_code = params.programCode?.trim().toUpperCase() ?? null
  if (params.bulletinYear !== undefined)             row.bulletin_year = params.bulletinYear?.trim() ?? null
  if (params.classification !== undefined)           row.classification = params.classification?.trim() ?? null
  if (params.isInternational !== undefined)          row.is_international = params.isInternational
  if (params.scholarshipType !== undefined)          row.scholarship_type = params.scholarshipType ?? null
  if (params.scholarshipName !== undefined)          row.scholarship_name = params.scholarshipName ?? null
  if (params.scholarshipMinGpa !== undefined)        row.scholarship_min_gpa = params.scholarshipMinGpa ?? null
  if (params.scholarshipMinCreditsPerYear !== undefined) row.scholarship_min_credits_per_year = params.scholarshipMinCreditsPerYear ?? null

  const { data, error } = await supabase
    .from("user_academic_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select("user_id, program_code, bulletin_year, classification, is_international, scholarship_type, scholarship_name, scholarship_min_gpa, scholarship_min_credits_per_year, updated_at")
    .single()

  if (error || !data) {
    throw new Error(`[data-access:upsertUserAcademicProfile] ${error?.message ?? "Unknown error"}`)
  }

  return { ...data, is_international: data.is_international ?? false }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/data-access/user-profile.ts
git commit -m "feat: add enrollment flag fields to user profile data access"
```

---

## Task 6: Shared Contracts — Session Enrollment Flags

**Files:**
- Modify: `shared/contracts/index.ts`

- [ ] **Step 1: Extend `ChatQueryRequest.session`**

In `shared/contracts/index.ts`, replace the `session` block inside `ChatQueryRequest` (lines 28–33):

```typescript
export interface ChatQueryRequest {
  question: string;
  studentId?: string;
  session?: {
    programCode?: string;
    bulletinYear?: string;
    classification?: string;
    studentName?: string;
    isInternational?: boolean;
    scholarshipType?: string;
    scholarshipMinGpa?: number;
    scholarshipMinCreditsPerYear?: number;
  };
  conversationHistory?: ConversationMessage[];
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/contracts/index.ts
git commit -m "feat: add enrollment flags to ChatQueryRequest session contract"
```

---

## Task 7: App Cache — Enrollment Flags in Session Context

**Files:**
- Modify: `lib/app-cache.ts`

- [ ] **Step 1: Extend `CachedSessionContext`**

In `lib/app-cache.ts`, replace the `CachedSessionContext` interface:

```typescript
export interface CachedSessionContext {
  programCode: string | undefined
  bulletinYear: string | undefined
  classification: string | undefined
  isInternational: boolean | undefined
  scholarshipType: string | undefined
  scholarshipMinGpa: number | undefined
  scholarshipMinCreditsPerYear: number | undefined
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/app-cache.ts
git commit -m "feat: add enrollment flags to CachedSessionContext"
```

---

## Task 8: API Route — Read/Write Enrollment Flags

**Files:**
- Modify: `app/api/user/academic-profile/route.ts`

- [ ] **Step 1: Read the current route file**

```bash
cat app/api/user/academic-profile/route.ts
```

- [ ] **Step 2: Add enrollment flags to GET response**

In the GET handler, wherever `getUserAcademicProfile` result is returned, include the new fields:

```typescript
return NextResponse.json({
  success: true,
  profile: {
    classification: profileData?.classification ?? null,
    programCode: profileData?.program_code ?? null,
    bulletinYear: profileData?.bulletin_year ?? null,
    isInternational: profileData?.is_international ?? false,
    scholarshipType: profileData?.scholarship_type ?? null,
    scholarshipName: profileData?.scholarship_name ?? null,
    scholarshipMinGpa: profileData?.scholarship_min_gpa ?? null,
    scholarshipMinCreditsPerYear: profileData?.scholarship_min_credits_per_year ?? null,
  },
})
```

- [ ] **Step 3: Add enrollment flags to POST/PUT handler**

In the write handler, extract and pass the new fields to `upsertUserAcademicProfile`:

```typescript
const {
  programCode,
  bulletinYear,
  classification,
  isInternational,
  scholarshipType,
  scholarshipName,
  scholarshipMinGpa,
  scholarshipMinCreditsPerYear,
} = await req.json()

await upsertUserAcademicProfile({
  userId: user.id,
  programCode,
  bulletinYear,
  classification,
  isInternational,
  scholarshipType,
  scholarshipName,
  scholarshipMinGpa,
  scholarshipMinCreditsPerYear,
})
```

- [ ] **Step 4: Commit**

```bash
git add app/api/user/academic-profile/route.ts
git commit -m "feat: expose enrollment flags through academic-profile API route"
```

---

## Task 9: Settings UI — Enrollment & Financial Aid Section

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Add enrollment state variables**

In `app/settings/page.tsx`, after the existing profile state variables (around line 54), add:

```typescript
// Enrollment flags state
const [isInternational, setIsInternational] = useState(false)
const [scholarshipType, setScholarshipType] = useState<string>("")
const [scholarshipName, setScholarshipName] = useState("")
const [scholarshipMinGpa, setScholarshipMinGpa] = useState("")
const [scholarshipMinCreditsPerYear, setScholarshipMinCreditsPerYear] = useState("")
const [isSavingEnrollment, setIsSavingEnrollment] = useState(false)
const [enrollmentSaveSuccess, setEnrollmentSaveSuccess] = useState<string | null>(null)
const [enrollmentSaveError, setEnrollmentSaveError] = useState<string | null>(null)
```

- [ ] **Step 2: Load enrollment flags in `loadUserProfile`**

In the `loadUserProfile` function, after setting profile state from the API response, add:

```typescript
setIsInternational(payload.profile?.isInternational ?? false)
setScholarshipType(payload.profile?.scholarshipType ?? "")
setScholarshipName(payload.profile?.scholarshipName ?? "")
setScholarshipMinGpa(payload.profile?.scholarshipMinGpa?.toString() ?? "")
setScholarshipMinCreditsPerYear(payload.profile?.scholarshipMinCreditsPerYear?.toString() ?? "")
```

- [ ] **Step 3: Add `handleSaveEnrollment` function**

Add this function before the return statement:

```typescript
async function handleSaveEnrollment() {
  setIsSavingEnrollment(true)
  setEnrollmentSaveError(null)
  setEnrollmentSaveSuccess(null)
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session) throw new Error("Not signed in")

    const body: Record<string, unknown> = { isInternational, scholarshipType: scholarshipType || null }
    if (scholarshipType === "external") {
      body.scholarshipName = scholarshipName || null
      body.scholarshipMinGpa = scholarshipMinGpa ? parseFloat(scholarshipMinGpa) : null
      body.scholarshipMinCreditsPerYear = scholarshipMinCreditsPerYear ? parseInt(scholarshipMinCreditsPerYear) : null
    } else {
      body.scholarshipName = null
      body.scholarshipMinGpa = null
      body.scholarshipMinCreditsPerYear = null
    }

    const response = await fetch("/api/user/academic-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify(body),
    })
    const payload = await response.json()
    if (!response.ok || !payload.success) throw new Error(payload.error ?? "Save failed")

    // Invalidate session cache so AI picks up new flags immediately
    const uid = data.session.user.id
    const { sessionCache } = await import("@/lib/app-cache")
    sessionCache.invalidate(uid)

    setEnrollmentSaveSuccess("Enrollment settings saved.")
  } catch (err: unknown) {
    setEnrollmentSaveError(err instanceof Error ? err.message : "Unknown error")
  } finally {
    setIsSavingEnrollment(false)
  }
}
```

- [ ] **Step 4: Add the UI section to the JSX**

Add this section after the existing profile card and before the closing `</main>` or `</div>`. Insert it in the JSX return where profile cards are rendered:

```tsx
{/* Enrollment & Financial Aid */}
<div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
  <h2 className="text-base font-semibold text-gray-900">Enrollment & Financial Aid</h2>

  {/* International student toggle */}
  <div className="flex items-start gap-3">
    <input
      type="checkbox"
      id="isInternational"
      checked={isInternational}
      onChange={(e) => setIsInternational(e.target.checked)}
      className="mt-1 h-4 w-4 rounded border-gray-300 accent-[#A0152A]"
    />
    <div>
      <label htmlFor="isInternational" className="text-sm font-medium text-gray-800 cursor-pointer">
        I am an international student
      </label>
      {isInternational && (
        <p className="text-xs text-gray-500 mt-1">
          International students must maintain at least 12 credits per semester (minimum 9 in-person). Summer: minimum 3 credits unless on a qualified internship.
        </p>
      )}
    </div>
  </div>

  {/* Scholarship selector */}
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-gray-800">Scholarship</label>
    <select
      value={scholarshipType}
      onChange={(e) => setScholarshipType(e.target.value)}
      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#A0152A]"
    >
      <option value="">None</option>
      <option value="presidential">Presidential (renewal GPA 3.50, 30 credits/year)</option>
      <option value="merit">Merit (renewal GPA 3.10, 30 credits/year)</option>
      <option value="transfer_merit">Transfer Merit (renewal GPA 3.10, 30 credits/year)</option>
      <option value="normalite">Normalite Opportunity (renewal GPA 2.80, 30 credits/year)</option>
      <option value="academic_recognition">Academic Recognition (renewal GPA 2.80, 30 credits/year)</option>
      <option value="heritage_gold">Heritage Gold (renewal GPA 2.80, 30 credits/year)</option>
      <option value="heritage_silver">Heritage Silver (renewal GPA 2.80, 30 credits/year)</option>
      <option value="heritage_bronze">Heritage Bronze (renewal GPA 2.50, 30 credits/year)</option>
      <option value="external">External / Other</option>
    </select>
  </div>

  {/* External scholarship fields */}
  {scholarshipType === "external" && (
    <div className="space-y-3 pl-1 border-l-2 border-[#A0152A]/20">
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Scholarship Name</label>
        <input
          type="text"
          value={scholarshipName}
          onChange={(e) => setScholarshipName(e.target.value)}
          placeholder="e.g. Thurgood Marshall Scholarship"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A0152A]"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">Minimum GPA Required</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="4"
            value={scholarshipMinGpa}
            onChange={(e) => setScholarshipMinGpa(e.target.value)}
            placeholder="e.g. 3.00"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A0152A]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">Min Credits / Year</label>
          <input
            type="number"
            min="0"
            max="60"
            value={scholarshipMinCreditsPerYear}
            onChange={(e) => setScholarshipMinCreditsPerYear(e.target.value)}
            placeholder="e.g. 30"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#A0152A]"
          />
        </div>
      </div>
    </div>
  )}

  {enrollmentSaveError && <p className="text-xs text-red-600">{enrollmentSaveError}</p>}
  {enrollmentSaveSuccess && <p className="text-xs text-green-600">{enrollmentSaveSuccess}</p>}

  <button
    onClick={handleSaveEnrollment}
    disabled={isSavingEnrollment}
    className="rounded-lg bg-[#A0152A] px-4 py-2 text-sm font-medium text-white hover:bg-[#8B0000] disabled:opacity-50 transition-colors"
  >
    {isSavingEnrollment ? "Saving…" : "Save Enrollment Settings"}
  </button>
</div>
```

- [ ] **Step 5: Verify in browser**

Start the dev server (`npm run dev`), navigate to `/settings`, confirm:
- International checkbox appears and shows the note when checked
- Scholarship dropdown shows all 9 options
- Selecting "External / Other" reveals the 3 extra fields
- Saving writes to DB (check Supabase `user_academic_profiles` table)

- [ ] **Step 6: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: add Enrollment & Financial Aid section to Settings"
```

---

## Task 10: Session Context — Load & Pass Enrollment Flags

**Files:**
- Modify: `components/editor/ai-suggestions.tsx`

- [ ] **Step 1: Read the session load effect**

Find the effect in `ai-suggestions.tsx` where `sessionContext` / `sessionCache` is read and populated (search for `sessionCache.read`). This is where `programCode`, `bulletinYear`, `classification` are loaded.

- [ ] **Step 2: Extend session context loading**

In the session load effect, after the existing `sessionCache.read()` call, extend the cache read and the DB fetch to include the new flags. Wherever the profile is fetched from the API or DB, also pull `isInternational`, `scholarshipType`, `scholarshipMinGpa`, `scholarshipMinCreditsPerYear` and store them in `sessionCache.write()`:

```typescript
// After fetching profile, build full session context including enrollment flags:
const ctx: CachedSessionContext = {
  programCode: profile.program_code ?? undefined,
  bulletinYear: profile.bulletin_year ?? undefined,
  classification: profile.classification ?? undefined,
  isInternational: profile.is_international ?? false,
  scholarshipType: profile.scholarship_type ?? undefined,
  scholarshipMinGpa: profile.scholarship_min_gpa ?? undefined,
  scholarshipMinCreditsPerYear: profile.scholarship_min_credits_per_year ?? undefined,
}
sessionCache.write(userId, ctx)
setSessionContext(ctx)
```

- [ ] **Step 3: Pass enrollment flags in chat payload**

Find where `ChatQueryRequest` is built (the `session: { ...sessionContext }` object passed to `/api/chat/query`). Add the new fields:

```typescript
session: {
  programCode: sessionContext?.programCode,
  bulletinYear: sessionContext?.bulletinYear,
  classification: sessionContext?.classification,
  studentName: studentName ?? undefined,
  isInternational: sessionContext?.isInternational,
  scholarshipType: sessionContext?.scholarshipType,
  scholarshipMinGpa: sessionContext?.scholarshipMinGpa,
  scholarshipMinCreditsPerYear: sessionContext?.scholarshipMinCreditsPerYear,
},
```

- [ ] **Step 4: Commit**

```bash
git add components/editor/ai-suggestions.tsx
git commit -m "feat: load and pass enrollment flags through session context to chat"
```

---

## Task 11: Curriculum Service — fetchFreeElectiveOptions

**Files:**
- Modify: `backend/services/curriculum/service.ts`

- [ ] **Step 1: Import getAvailableGECourses**

At the top of `backend/services/curriculum/service.ts`, add to the existing import from `@/backend/data-access/curriculum`:

```typescript
import {
  // ... existing imports ...
  getAvailableGECourses,
  type GECourseRow,
} from "@/backend/data-access/curriculum"
```

- [ ] **Step 2: Add scholarship rules lookup**

Append near the top of the service file (after imports):

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

- [ ] **Step 3: Add `fetchFreeElectiveOptions` function**

Append to the end of `backend/services/curriculum/service.ts`:

```typescript
export interface FreeElectiveContext {
  availableCourses: GECourseRow[]
  enrollmentRules: string
  creditsRegistered: number
  creditsRemaining: number
}

export async function fetchFreeElectiveOptions(params: {
  userId: string
  isInternational?: boolean
  scholarshipType?: string | null
  scholarshipMinGpa?: number | null
  scholarshipMinCreditsPerYear?: number | null
  preRegisteredCredits?: number
}): Promise<FreeElectiveContext> {
  const { userId, isInternational, scholarshipType, preRegisteredCredits = 0 } = params

  // Get all course codes the student has taken or is currently enrolled in
  const [completed, inProgress] = await Promise.all([
    fetchUserCompletedCourses(userId).catch(() => []),
    fetchUserInProgressCourses(userId).catch(() => []),
  ])

  const takenCodes = new Set<string>([
    ...completed.map((c) => c.code.trim().toUpperCase()),
    ...inProgress.map((c) => c.code.trim().toUpperCase()),
  ])

  const availableCourses = await getAvailableGECourses(takenCodes)

  // Build enrollment rules note
  const SEMESTER_CAP = 19
  const creditsRemaining = Math.max(0, SEMESTER_CAP - preRegisteredCredits)
  const rules: string[] = []

  rules.push(`Current pre-registered credits: ${preRegisteredCredits}. Semester maximum: ${SEMESTER_CAP}. Credits available to add: ${creditsRemaining}.`)

  if (isInternational) {
    rules.push("International student: must maintain at least 12 credits per semester (minimum 9 in-person). Summer minimum is 3 credits unless on a qualified internship.")
  }

  if (scholarshipType && scholarshipType !== "external") {
    const rule = AAMU_SCHOLARSHIP_RULES[scholarshipType]
    if (rule) {
      const semesterTarget = Math.ceil(rule.minCreditsPerYear / 2)
      rules.push(`${scholarshipType.replace(/_/g, " ")} scholarship: must maintain ${rule.renewalGpa} GPA and complete ${rule.minCreditsPerYear} credits per academic year (~${semesterTarget}/semester). Verify Fall + Spring total.`)
    }
  } else if (scholarshipType === "external") {
    const minCreds = params.scholarshipMinCreditsPerYear ?? null
    const minGpa   = params.scholarshipMinGpa ?? null
    const parts: string[] = []
    if (minGpa)   parts.push(`minimum GPA ${minGpa}`)
    if (minCreds) parts.push(`${minCreds} credits/year (~${Math.ceil(minCreds / 2)}/semester)`)
    if (parts.length > 0) rules.push(`External scholarship requirement: ${parts.join(", ")}.`)
  }

  rules.push("Reminder: verify course availability in Banner before registering. Not all courses listed may be offered this term.")

  return {
    availableCourses,
    enrollmentRules: rules.join("\n"),
    creditsRegistered: preRegisteredCredits,
    creditsRemaining,
  }
}

export function formatFreeElectivesForLLM(ctx: FreeElectiveContext): string {
  const lines: string[] = [
    "=== ENROLLMENT RULES ===",
    ctx.enrollmentRules,
    "",
    "=== AVAILABLE GE / ELECTIVE COURSES (not yet taken) ===",
  ]

  // Group by area
  const byArea = new Map<string, GECourseRow[]>()
  for (const c of ctx.availableCourses) {
    const key = `${c.area_code}: ${c.area_name}`
    if (!byArea.has(key)) byArea.set(key, [])
    byArea.get(key)!.push(c)
  }

  for (const [areaLabel, courses] of byArea.entries()) {
    lines.push(`\n${areaLabel}`)
    // Sub-group by sub_area
    const bySubArea = new Map<string, GECourseRow[]>()
    for (const c of courses) {
      const sub = c.sub_area ?? "General"
      if (!bySubArea.has(sub)) bySubArea.set(sub, [])
      bySubArea.get(sub)!.push(c)
    }
    for (const [sub, subCourses] of bySubArea.entries()) {
      lines.push(`  ${sub}:`)
      for (const c of subCourses) {
        lines.push(`    • ${c.course_code} — ${c.course_title} (${c.credit_hours} cr)${c.notes ? ` [${c.notes}]` : ""}`)
      }
    }
  }

  return lines.join("\n")
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/services/curriculum/service.ts
git commit -m "feat: add fetchFreeElectiveOptions and formatFreeElectivesForLLM to curriculum service"
```

---

## Task 12: Chat Orchestrator — FREE_ELECTIVE Intent Handler

**Files:**
- Modify: `backend/services/chat-orchestrator/service.ts`
- Modify: `lib/chat-routing/router.ts`

- [ ] **Step 1: Add intent type to router**

In `lib/chat-routing/router.ts`, add `"FREE_ELECTIVE"` to the `IntentLabel` union type:

```typescript
type IntentLabel =
  | "COMPLETED_COURSES"
  | "NEXT_COURSES"
  | "GRADUATION_GAP"
  | "PREREQUISITES"
  | "ELECTIVES"
  | "FREE_ELECTIVE"      // ← ADD THIS
  | "CONCENTRATION"
  | "SIMULATE"
  | "SAVE_PLAN"
  | "BULLETIN_POLICY"
  | "ADVISOR_ESCALATE"
  | "GENERAL_CURRICULUM"
  | "CHITCHAT"
```

- [ ] **Step 2: Add to intent→route map and valid intents set**

In `lib/chat-routing/router.ts`:

```typescript
const INTENT_TO_ROUTE: Record<IntentLabel, ChatRoute> = {
  // ... existing entries ...
  FREE_ELECTIVE: "DB_ONLY",   // ← ADD THIS
}

const VALID_INTENTS = new Set<string>([
  "COMPLETED_COURSES", "NEXT_COURSES", "GRADUATION_GAP", "PREREQUISITES",
  "ELECTIVES", "FREE_ELECTIVE", "CONCENTRATION", "SIMULATE", "SAVE_PLAN",   // ← ADD FREE_ELECTIVE
  "BULLETIN_POLICY", "ADVISOR_ESCALATE", "GENERAL_CURRICULUM", "CHITCHAT",
])
```

- [ ] **Step 3: Add FREE_ELECTIVE to classifier prompt**

In `CLASSIFIER_SYSTEM_PROMPT` in `lib/chat-routing/router.ts`, add this entry after the ELECTIVES line:

```
FREE_ELECTIVE — student wants to add any course to fill credits (golf, swimming, fun classes, any course to reach 18 credits, recreational, not required courses, just need credits)
```

And add classifier examples at the bottom of the examples list:

```
"can I take golf this semester" → FREE_ELECTIVE
"what courses can I add to hit 18 credits" → FREE_ELECTIVE
"any swimming class available" → FREE_ELECTIVE
"I want to take something fun this semester" → FREE_ELECTIVE
"what elective can I add just to stay full time" → FREE_ELECTIVE
```

- [ ] **Step 4: Add detection function in orchestrator**

In `backend/services/chat-orchestrator/service.ts`, add this function alongside the other `asks*` functions:

```typescript
function asksFreeElectiveQuestion(question: string): boolean {
  return /(free\s+elective|any\s+course|just\s+need\s+(more\s+)?credits?|fill\s+(up\s+)?credits?|reach\s+\d+\s+credits?|add\s+(a\s+)?course\s+(for|to)|golf|swimming|tennis|gym(nastics)?|physical\s+ed|recreational|what\s+can\s+i\s+(add|take\s+for\s+fun)|not\s+required\s+course|fun\s+course|extra\s+credits?|stay\s+full[\s-]time|something\s+fun)/i.test(question)
}
```

- [ ] **Step 5: Add FREE_ELECTIVE imports to orchestrator**

In `backend/services/chat-orchestrator/service.ts`, add to the existing curriculum service import:

```typescript
import {
  // ... existing imports ...
  fetchFreeElectiveOptions,
  formatFreeElectivesForLLM,
} from "@/backend/services/curriculum/service"
```

- [ ] **Step 6: Add the handler block in `processChatQuery`**

In `backend/services/chat-orchestrator/service.ts`, find the intent handling section (where `isElectiveQuery`, `isNextCoursesQuery`, etc. are checked). Add the FREE_ELECTIVE handler. Insert it before the ELECTIVES handler:

```typescript
// ── FREE_ELECTIVE ─────────────────────────────────────────────────────────────
const isFreeElectiveQuery = asksFreeElectiveQuestion(question) || intent === "FREE_ELECTIVE"

if (isFreeElectiveQuery) {
  if (!payload.studentId) {
    return { mode: "DB_ONLY", answer: SETUP_NEEDED_MESSAGE, data: null }
  }

  // Get pre-registered credit count from in-progress courses
  const inProgressForCount = await fetchUserInProgressCourses(payload.studentId).catch(() => [])
  const termSplit = splitInProgressByTerm(inProgressForCount)
  const preRegisteredCredits = termSplit.upcomingRegistered.reduce((sum, c) => sum + c.creditHours, 0)
  const currentTermCredits   = termSplit.currentEnrolled.reduce((sum, c) => sum + c.creditHours, 0)
  const totalInProgress      = preRegisteredCredits + currentTermCredits

  const ctx = await fetchFreeElectiveOptions({
    userId: payload.studentId,
    isInternational: payload.session?.isInternational,
    scholarshipType: payload.session?.scholarshipType,
    scholarshipMinGpa: payload.session?.scholarshipMinGpa,
    scholarshipMinCreditsPerYear: payload.session?.scholarshipMinCreditsPerYear,
    preRegisteredCredits: totalInProgress,
  })

  if (ctx.availableCourses.length === 0) {
    return {
      mode: "DB_ONLY",
      answer: "It looks like you've already taken all listed GE courses! Check with your advisor about additional elective options.",
      data: null,
    }
  }

  const electiveContext = formatFreeElectivesForLLM(ctx)
  const answer = await generateDbResponse(
    question,
    `${studentContextBlock}${electiveContext}`,
    history
  )
  return { mode: "DB_ONLY", answer, data: ctx.availableCourses }
}
```

- [ ] **Step 7: Also pass enrollment flags into `buildStudentContextBlock`**

In `buildStudentContextBlock`, add the enrollment flags so they appear in every DB response context:

```typescript
function buildStudentContextBlock(profile: {
  programCode?: string | null
  bulletinYear?: string | null
  classification?: string | null
  studentName?: string | null
  isInternational?: boolean | null
  scholarshipType?: string | null
} | null): string {
  if (!profile) return ""
  const parts: string[] = []
  if (profile.studentName)     parts.push(`Student Name: ${profile.studentName}`)
  if (profile.classification)  parts.push(`Classification: ${profile.classification}`)
  if (profile.programCode)     parts.push(`Program: ${profile.programCode}`)
  if (profile.bulletinYear)    parts.push(`Catalog Year: ${profile.bulletinYear}`)
  if (profile.isInternational) parts.push(`International Student: Yes (min 12 credits/semester, 9 in-person)`)
  if (profile.scholarshipType && profile.scholarshipType !== "external") {
    parts.push(`Scholarship: ${profile.scholarshipType.replace(/_/g, " ")} (30 credits/year required)`)
  } else if (profile.scholarshipType === "external") {
    parts.push(`Scholarship: External scholarship holder`)
  }
  if (parts.length === 0) return ""
  return `Student Profile:\n${parts.join("\n")}\n\n`
}
```

- [ ] **Step 8: Pass enrollment flags through to `buildStudentContextBlock` call**

Find where `studentContextBlock` is built by calling `buildStudentContextBlock(profile)` in `processChatQuery`. Update that call to include the new fields from `payload.session`:

```typescript
const studentContextBlock = buildStudentContextBlock({
  programCode:     payload.session?.programCode ?? dbProfile?.program_code,
  bulletinYear:    payload.session?.bulletinYear ?? dbProfile?.bulletin_year,
  classification:  payload.session?.classification ?? dbProfile?.classification,
  studentName:     payload.session?.studentName,
  isInternational: payload.session?.isInternational ?? false,
  scholarshipType: payload.session?.scholarshipType ?? null,
})
```

- [ ] **Step 9: Commit**

```bash
git add lib/chat-routing/router.ts backend/services/chat-orchestrator/service.ts
git commit -m "feat: add FREE_ELECTIVE intent with GE course suggestions and enrollment rule awareness"
```

---

## Task 13: Type Check & End-to-End Verification

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any type mismatches before continuing.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Verify honors normalization**

In Supabase SQL editor, run:
```sql
select * from honors_equivalency order by honors_code;
```
Expected: 13 rows.

- [ ] **Step 4: Verify GE data**

```sql
select a.code, a.name, count(c.id) as course_count
from general_education_areas a
left join general_education_courses c on c.area_id = a.id
group by a.id, a.code, a.name
order by a.code;
```
Expected: 5 rows, each with course_count > 0.

- [ ] **Step 5: Test FREE_ELECTIVE in chat**

Open the app, go to a plan's chat. Send:
- "what golf course can I take?" → should list PED courses
- "I have 15 credits registered, what can I add?" → should show available GE courses with enrollment context
- "any swimming class?" → should return PED 132, PED 133

- [ ] **Step 6: Test Settings enrollment flags**

Go to `/settings`, check "International student", select "Presidential" scholarship, save. Open chat, send "what can I register for?" — AI response should mention 12-credit minimum and 30-credit annual requirement.

- [ ] **Step 7: Test honors equivalency**

If a student has ENG 101H in their DegreeWorks, verify the orchestrator's prerequisite check treats it as ENG 101 satisfied. (The `normalizeHonorsCourseCode()` function queries `honors_equivalency` — with the table now seeded, it will return the standard code.)

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: smart advising expansion — GE courses, honors seeding, enrollment flags, FREE_ELECTIVE intent"
git push origin main
```
