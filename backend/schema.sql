-- ============================================================
-- AAMU Course Management App — Initial Schema
-- Catalog Year: 2021
-- ============================================================


-- ------------------------------------------------------------
-- PROGRAMS
-- ------------------------------------------------------------
create table if not exists programs (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique not null,       -- e.g. 'BSCS'
  name               text not null,              -- e.g. 'Computer Science'
  catalog_year       int  not null,              -- e.g. 2021
  total_credit_hours int  not null,
  created_at         timestamptz default now()
);


-- ------------------------------------------------------------
-- COURSES  (master catalog — shared across programs)
-- ------------------------------------------------------------
create table if not exists courses (
  id           uuid primary key default gen_random_uuid(),
  course_id    text unique not null,   -- e.g. 'CS 102'
  title        text not null,
  credit_hours int  not null,
  is_capstone  bool not null default false,
  created_at   timestamptz default now()
);


-- ------------------------------------------------------------
-- COURSE PREREQUISITES
-- Adjacency list with OR-group support:
--   rows sharing the same (course_id, prereq_group) satisfy
--   the requirement as OR conditions.
--   Different prereq_group values are AND-ed together.
--
-- Example — "CS 215 requires (CS 109) AND (CS 206)":
--   (CS 215, CS 109, group 1)
--   (CS 215, CS 206, group 2)
--
-- Example — "MTH 453 slot accepts MTH 453 OR ST 453":
--   (target, MTH 453, group 1)
--   (target, ST  453, group 1)
-- ------------------------------------------------------------
create table if not exists course_prerequisites (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references courses(id) on delete cascade,
  prerequisite_id uuid not null references courses(id) on delete cascade,
  prereq_group    int  not null default 1,
  min_grade       text,
  unique (course_id, prerequisite_id)
);


-- ------------------------------------------------------------
-- CURRICULUM SLOTS
-- The ordered 4-year plan for a program.
--
-- semester_number encoding:
--   1 = freshman_fall     5 = junior_fall
--   2 = freshman_spring   6 = junior_spring
--   3 = sophomore_fall    7 = senior_fall
--   4 = sophomore_spring  8 = senior_spring
--
-- slot_order   : position within a semester (1-based)
-- course_id    : NULL for elective slots
-- ------------------------------------------------------------
create table if not exists curriculum_slots (
  id               uuid primary key default gen_random_uuid(),
  program_id       uuid not null references programs(id) on delete cascade,
  slot_label       text not null,
  semester_number  int  not null check (semester_number between 1 and 8),
  slot_order       int  not null,
  credit_hours     int  not null,
  is_elective_slot bool not null default false,
  course_id        uuid references courses(id) on delete set null,
  min_grade        text
);


-- ------------------------------------------------------------
-- ELECTIVE SLOT ELIGIBLE COURSES
-- Which courses may satisfy a given elective slot.
-- ------------------------------------------------------------
create table if not exists elective_slot_eligible_courses (
  id        uuid primary key default gen_random_uuid(),
  slot_id   uuid not null references curriculum_slots(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  unique (slot_id, course_id)
);


-- ------------------------------------------------------------
-- CONCENTRATIONS  (and minors)
-- ------------------------------------------------------------
create table if not exists concentrations (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references programs(id) on delete cascade,
  code        text unique not null,    -- e.g. 'CMP-CYB'
  name        text not null,
  type        text not null check (type in ('concentration', 'minor')),
  total_hours int  not null,
  min_grade   text,
  created_at  timestamptz default now()
);


-- ------------------------------------------------------------
-- CONCENTRATION SLOTS
-- Required and elective course slots within a concentration.
-- course_id is NULL for elective slots.
-- level_restriction: '3xx' | '4xx' | '3xx-4xx' | NULL
-- ------------------------------------------------------------
create table if not exists concentration_slots (
  id               uuid primary key default gen_random_uuid(),
  concentration_id uuid not null references concentrations(id) on delete cascade,
  slot_label       text not null,
  is_elective_slot bool not null default false,
  level_restriction text,
  credit_hours     int  not null,
  course_id        uuid references courses(id) on delete set null,
  min_grade        text
);


-- ------------------------------------------------------------
-- USER COMPLETED COURSES
-- Maps an application user to catalog courses with their latest status.
-- ------------------------------------------------------------
create table if not exists user_completed_courses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  course_id    uuid not null references courses(id) on delete cascade,
  status       text not null check (status in ('completed', 'in_progress')),
  unique (user_id, course_id)
);


-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_curriculum_slots_program_semester
  on curriculum_slots (program_id, semester_number, slot_order);

create index if not exists idx_course_prerequisites_course
  on course_prerequisites (course_id);

create index if not exists idx_course_prerequisites_prereq
  on course_prerequisites (prerequisite_id);

create index if not exists idx_elective_slot_eligible_slot
  on elective_slot_eligible_courses (slot_id);

create index if not exists idx_concentration_slots_concentration
  on concentration_slots (concentration_id);

create index if not exists idx_user_completed_courses_user
  on user_completed_courses (user_id);

create index if not exists idx_user_completed_courses_course
  on user_completed_courses (course_id);
