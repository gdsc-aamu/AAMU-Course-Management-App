-- ============================================================
-- AAMU Course Management App — Initial Schema
-- Catalog Year: 2021
-- ============================================================


-- ------------------------------------------------------------
-- PROGRAMS
-- ------------------------------------------------------------
create table if not exists programs (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null,              -- e.g. 'BSCS'
  name               text not null,              -- e.g. 'Computer Science'
  catalog_year       int  not null,              -- e.g. 2021
  total_credit_hours int  not null,
  created_at         timestamptz default now(),
  unique (code, catalog_year)
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
  code        text not null,           -- e.g. 'CMP-CYB'
  name        text not null,
  type        text not null check (type in ('concentration', 'minor')),
  total_hours int  not null,
  min_grade   text,
  created_at  timestamptz default now(),
  unique (program_id, code)
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
-- HONORS COURSE EQUIVALENCY
-- Maps honors course codes to their standard equivalents so
-- ENG 101H is treated as satisfying ENG 101 requirements.
-- ------------------------------------------------------------
create table if not exists honors_equivalency (
  id              uuid primary key default gen_random_uuid(),
  honors_code     text not null unique,   -- e.g. 'ENG 101H'
  standard_code   text not null,          -- e.g. 'ENG 101'
  created_at      timestamptz default now()
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
  grade        text,        -- e.g. 'A', 'B+', 'C', 'REG' — from DegreeWorks
  term         text,        -- e.g. 'Fall 2023' — semester the course was taken
  unique (user_id, course_id)
);


-- ------------------------------------------------------------
-- USER ACADEMIC PROFILES
-- Stores user's major/program code and preferred bulletin year context.
-- ------------------------------------------------------------
create table if not exists user_academic_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  program_code  text,
  bulletin_year text,
  classification text,
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- USER PLANS
-- Stores course plans created by users
-- ============================================================
create table if not exists plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  semester   text not null,
  starred    bool not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PLAN COURSES
-- Courses associated with a specific plan
-- ============================================================
create table if not exists plan_courses (
  id        uuid primary key default gen_random_uuid(),
  plan_id   uuid not null references plans(id) on delete cascade,
  course_id text not null,
  unique (plan_id, course_id)
);

-- ============================================================
-- TRIGGERS
-- ============================================================
create or replace function public.create_user_profile()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_academic_profiles (user_id)
  values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_user_profile();

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

create index if not exists idx_user_academic_profiles_program
  on user_academic_profiles (program_code);

create index if not exists idx_plans_user
  on plans (user_id);

create index if not exists idx_plan_courses_plan
  on plan_courses (plan_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table plans enable row level security;
alter table plan_courses enable row level security;

-- Users can only access their own plans
create policy "Users can view their own plans"
  on plans for select using (auth.uid() = user_id);

create policy "Users can create their own plans"
  on plans for insert with check (auth.uid() = user_id);

create policy "Users can update their own plans"
  on plans for update using (auth.uid() = user_id);

create policy "Users can delete their own plans"
  on plans for delete using (auth.uid() = user_id);

-- Users can access plan_courses through their plans
create policy "Users can view plan courses"
  on plan_courses for select 
  using (plan_id in (select id from plans where user_id = auth.uid()));

create policy "Users can insert plan courses"
  on plan_courses for insert 
  with check (plan_id in (select id from plans where user_id = auth.uid()));

create policy "Users can delete plan courses"
  on plan_courses for delete 
  using (plan_id in (select id from plans where user_id = auth.uid()));


-- ============================================================
-- CHAT THREADS & MESSAGES
-- Chat history persistence for plan-specific conversations.
-- ============================================================
create table if not exists chat_threads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  plan_id    text not null,              -- links to user's plan (stored in localStorage)
  title      text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists chat_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references chat_threads(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz default now()
);

create index if not exists idx_chat_threads_user_plan
  on chat_threads (user_id, plan_id);

create index if not exists idx_chat_threads_user
  on chat_threads (user_id);

create index if not exists idx_chat_messages_thread
  on chat_messages (thread_id);

-- Enable RLS
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for chat_threads
CREATE POLICY "Users can view their own threads"
  ON chat_threads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own threads"
  ON chat_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own threads"
  ON chat_threads FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own threads"
  ON chat_threads FOR DELETE
  USING (auth.uid() = user_id);

-- Create RLS policies for chat_messages
CREATE POLICY "Users can view messages from their threads"
  ON chat_messages FOR SELECT
  USING (
    thread_id IN (
      SELECT id FROM chat_threads WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages to their threads"
  ON chat_messages FOR INSERT
  WITH CHECK (
    thread_id IN (
      SELECT id FROM chat_threads WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete messages from their threads"
  ON chat_messages FOR DELETE
  USING (
    thread_id IN (
      SELECT id FROM chat_threads WHERE user_id = auth.uid()
    )
  );

-- General Education Areas
create table if not exists general_education_areas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  min_hours int not null,
  notes text,
  bulletin_year text not null default '2025-2026',
  created_at timestamptz default now()
);

-- General Education Courses
create table if not exists general_education_courses (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references general_education_areas(id) on delete cascade,
  sub_area text,
  course_code text not null,
  course_title text not null,
  credit_hours int not null,
  notes text,
  created_at timestamptz default now(),
  unique (area_id, course_code)
);

create index if not exists idx_ge_courses_area on general_education_courses (area_id);
create index if not exists idx_ge_courses_code on general_education_courses (course_code);

-- Enrollment & scholarship flags on student profiles
alter table user_academic_profiles
  add column if not exists is_international boolean default false,
  add column if not exists scholarship_type text,
  add column if not exists scholarship_name text,
  add column if not exists scholarship_min_gpa numeric,
  add column if not exists scholarship_min_credits_per_year int;
