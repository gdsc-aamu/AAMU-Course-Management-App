-- ============================================================
-- Freshman Biology Demo Seed
-- User: 4be7027e-4b4f-4baa-b850-26b86a4d85e6
-- Program: Biology BS (BIO-BS), Bulletin 2025-2026
-- Fall 2025: 5 courses completed (all A's, 11 cr)
-- Spring 2026: 6 courses in-progress (13 cr)
--
-- Run in Supabase SQL Editor → Database → SQL Editor → New query
-- ============================================================

DO $$
DECLARE
  v_user_id uuid := '4be7027e-4b4f-4baa-b850-26b86a4d85e6';
BEGIN

-- ──────────────────────────────────────────────────────────────
-- 1. Upsert courses into master catalog
-- ──────────────────────────────────────────────────────────────
INSERT INTO courses (course_id, title, credit_hours, is_capstone)
VALUES
  ('ORI 101',  'First Year Experience',           1, false),
  ('ENG 101',  'Composition I',                   3, false),
  ('BIO 103',  'Principles of Biology',           3, false),
  ('BIO 103L', 'Principles of Biology Lab',       1, false),
  ('HIS 101',  'World History I',                 3, false),
  ('ENG 102',  'Composition II',                  3, false),
  ('BIO 221',  'Human Anatomy/Physiology I',      3, false),
  ('BIO 221L', 'Human Anat/Phys Lab I',           1, false),
  ('MUS 101',  'Music Appreciation',              3, false),
  ('ORI 102',  'First Year Experience II',        1, false),
  ('HED 101',  'Personal Health',                 2, false)
ON CONFLICT (course_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 2. Upsert user course history
--    Resolve course_id text → UUID via subquery join
-- ──────────────────────────────────────────────────────────────
INSERT INTO user_completed_courses (user_id, course_id, status, grade, term)
SELECT
  v_user_id,
  c.id,
  v.status::text,
  v.grade,
  v.term
FROM (VALUES
  -- Fall 2025 completed
  ('ORI 101',  'completed',   'A',  'Fall 2025'),
  ('ENG 101',  'completed',   'A',  'Fall 2025'),
  ('BIO 103',  'completed',   'A',  'Fall 2025'),
  ('BIO 103L', 'completed',   'A',  'Fall 2025'),
  ('HIS 101',  'completed',   'A',  'Fall 2025'),
  -- Spring 2026 in-progress
  ('ENG 102',  'in_progress', NULL, 'Spring 2026'),
  ('BIO 221',  'in_progress', NULL, 'Spring 2026'),
  ('BIO 221L', 'in_progress', NULL, 'Spring 2026'),
  ('MUS 101',  'in_progress', NULL, 'Spring 2026'),
  ('ORI 102',  'in_progress', NULL, 'Spring 2026'),
  ('HED 101',  'in_progress', NULL, 'Spring 2026')
) AS v(code, status, grade, term)
JOIN courses c ON c.course_id = v.code
ON CONFLICT (user_id, course_id) DO UPDATE
  SET status = EXCLUDED.status,
      grade  = EXCLUDED.grade,
      term   = EXCLUDED.term;

-- ──────────────────────────────────────────────────────────────
-- 3. Academic profile — major, bulletin year, classification
-- ──────────────────────────────────────────────────────────────
INSERT INTO user_academic_profiles (user_id, program_code, bulletin_year, classification, updated_at)
VALUES (v_user_id, 'BIO-BS', '2025-2026', 'Freshman', now())
ON CONFLICT (user_id) DO UPDATE
  SET program_code   = 'BIO-BS',
      bulletin_year  = '2025-2026',
      classification = 'Freshman',
      updated_at     = now();

-- ──────────────────────────────────────────────────────────────
-- 4. Degree summary snapshot
--    11 completed + 13 in-progress = 24 cr applied / 123 ≈ 19.5%
-- ──────────────────────────────────────────────────────────────
INSERT INTO student_degree_summary (
  user_id, degree_progress_pct, credits_required, credits_applied,
  overall_gpa, catalog_year, concentration, audit_date, updated_at
)
VALUES (
  v_user_id, 19.5, 123, 24,
  4.0, '2025-2026', null, '04/27/2026', now()
)
ON CONFLICT (user_id) DO UPDATE
  SET degree_progress_pct = 19.5,
      credits_required    = 123,
      credits_applied     = 24,
      overall_gpa         = 4.0,
      catalog_year        = '2025-2026',
      concentration       = null,
      audit_date          = '04/27/2026',
      updated_at          = now();

-- ──────────────────────────────────────────────────────────────
-- 5. Requirement blocks
-- ──────────────────────────────────────────────────────────────
INSERT INTO student_requirement_blocks (user_id, block_name, status, credits_required, credits_applied)
VALUES
  -- GenEd: ORI 101(1)+ENG 101(3)+HIS 101(3)+ENG 102(3)+MUS 101(3)+ORI 102(1)+HED 101(2) = 16 cr
  (v_user_id, 'GenEd Requirements',  'in_progress', 35, 16),
  -- Major: BIO 103(3)+BIO 103L(1)+BIO 221(3)+BIO 221L(1) = 8 cr
  (v_user_id, 'Major in Biology',    'in_progress', 88, 8)
ON CONFLICT (user_id, block_name) DO UPDATE
  SET status           = EXCLUDED.status,
      credits_required = EXCLUDED.credits_required,
      credits_applied  = EXCLUDED.credits_applied;

-- ──────────────────────────────────────────────────────────────
-- 6. Still-needed line items per block
--    Delete stale rows first, then re-insert fresh
-- ──────────────────────────────────────────────────────────────
DELETE FROM student_block_requirements WHERE user_id = v_user_id;

INSERT INTO student_block_requirements (user_id, block_name, description, is_met)
VALUES
  -- GenEd still-needed
  (v_user_id, 'GenEd Requirements', 'Still needed: ENG 102 Composition II',                       false),
  (v_user_id, 'GenEd Requirements', 'Still needed: Fine Arts / Humanities elective (Area II)',     false),
  (v_user_id, 'GenEd Requirements', 'Still needed: Math/Science GenEd (Area III)',                 false),
  (v_user_id, 'GenEd Requirements', 'Still needed: Social/Behavioral Science elective (Area IV)',  false),
  (v_user_id, 'GenEd Requirements', 'Still needed: Computer Literacy (NRE 199 or CS 101)',         false),
  -- Major still-needed
  (v_user_id, 'Major in Biology',   'Still needed: BIO 221 / BIO 221L Human Anatomy & Physiology I',  false),
  (v_user_id, 'Major in Biology',   'Still needed: BIO 203 or BIO 204 General Botany',            false),
  (v_user_id, 'Major in Biology',   'Still needed: CHE 101 / CHE 101L General Chemistry I',       false),
  (v_user_id, 'Major in Biology',   'Still needed: CHE 102 / CHE 102L General Chemistry II',      false),
  (v_user_id, 'Major in Biology',   'Still needed: MTH 113 Pre-Calculus Trigonometry',            false),
  (v_user_id, 'Major in Biology',   'Still needed: BIO 311 / BIO 311L Genetics',                  false),
  (v_user_id, 'Major in Biology',   'Still needed: BIO 330 / BIO 330L Microbiology',              false),
  (v_user_id, 'Major in Biology',   'Still needed: CHE 251 / CHE 251L Organic Chemistry I',       false);

END $$;
