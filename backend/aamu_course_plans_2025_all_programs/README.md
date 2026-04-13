# AAMU Degree Plan Extraction — 2025-2026 Undergraduate Bulletin

## Source
- **PDF**: Alabama A&M University Undergraduate Bulletin 2025–2026 (365 pages)
- **Author**: Catharine Strother
- **Created**: March 4, 2026
- **Extraction Date**: March 28, 2026 (original 5 programs); April 10, 2026 (remaining 34 programs)

## Programs Extracted (39 Total)

### College of Agricultural, Life and Natural Sciences (CALNS) — 8 programs
| Program | File Prefix | Total Credit Hours |
|---------|------------|-------------------|
| Biology (BS) | `biology_bs` | 123 |
| Liberal Studies (BS) | `liberal_studies_bs` | 120 |
| Urban and Regional Planning (BS) | `urban_regional_planning_bs` | 123 |
| Family & Consumer Sciences (BS) | `family_consumer_sciences_bs` | 120 |
| Animal Bio-Health Sciences (BS) | `animal_biohealth_sciences_bs` | 124 |
| Food Science (BS) | `food_science_bs` | 126 |
| Environmental Science (BS) | `environmental_science_bs` | 121 |
| Forestry (BS) | `forestry_bs` | 136 |

### College of Business and Public Affairs (CBPA) — 12 programs
| Program | File Prefix | Total Credit Hours |
|---------|------------|-------------------|
| Accounting (BS) | `accounting_bs` | 120 |
| Finance (BS) | `finance_bs` | 120 |
| Business Administration (BS) | `business_administration_bs` | 120–123 |
| Entrepreneurship (BS) | `entrepreneurship_bs` | 120 |
| Logistics and Supply Chain Management (BS) | `logistics_supply_chain_management_bs` | 126 |
| Management (BS) | `management_bs` | 123 |
| Marketing (BS) | `marketing_bs` | 120 |
| Sport Management (BS) | `sport_management_bs` | 122 |
| Criminal Justice (BS) | `criminal_justice_bs` | 126 |
| Political Science (BS) | `political_science_bs` | 123 |
| Sociology (BS) | `sociology_bs` | 120 |

### College of Education, Humanities and Behavioral Sciences (CEHBS) — 13 programs
| Program | File Prefix | Total Credit Hours |
|---------|------------|-------------------|
| Early Childhood Education (P-3) – Teacher Cert | `early_childhood_education_p3_bs` | 128 |
| Elementary Education (K-6) – Teacher Cert | `elementary_education_k6_bs` | 128 |
| Special Education – Collaborative (K-6) | `special_education_k6_bs` | 125 |
| Special Education – Collaborative (6-12) | `special_education_6_12_bs` | 125 |
| English (BA) | `english_ba` | 120 |
| Communicative Sciences and Disorders (BS) | `communicative_sciences_disorders_bs` | 132 |
| Physical Education Teacher (P-12) | `physical_education_teacher_p12_bs` | 130 |
| Psychology (BS) | `psychology_bs` | 122 |
| Social Work (BSW) | `social_work_bsw` | 121 |
| Communications Media (BA) | `communications_media_ba` | 120 |
| Music (BA) | `music_ba` | 121 |
| Visual Art (BA) | `visual_art_ba` | 120 |

### College of Engineering, Technology and Physical Sciences (CETPS) — 8 programs
| Program | File Prefix | Total Credit Hours |
|---------|------------|-------------------|
| Computer Science (BSCS) | `computer_science_bscs` | 125 (131 5-yr) |
| Electrical Engineering (BSEE) | `electrical_engineering_bsee` | 130 |
| Civil Engineering (BSCE) | `civil_engineering_bsce` | 130 |
| Construction Management (BS) | `construction_management_bs` | 128 |
| Mechanical Engineering (BSME) | `mechanical_engineering_bsme` | 128 |
| Chemistry (BS) | `chemistry_bs` | 120–122 |
| Mathematics (BS) | `mathematics_bs` | 120 |
| Physics (BS) | `physics_bs` | 121 |

## Note on Military Science
Military Science (Department of Military Science) does not offer a standalone degree program. It offers only a Professional Leadership Minor (20 credit hours). This minor is captured where referenced by other programs.

## Deliverables
Each program has:
- **`.json`** — Full structured data per the On Track schema
- **`.csv`** — Flattened version for tabular use

## Validation Results
All 39 programs pass:
- ✅ **Credit hour sums match** stated totals on curriculum pages
- ✅ **No duplicate course_ids** within any baseline
- ✅ **Semester totals verified** against rasterized curriculum page images (pdftoppm at 150 DPI)

## Schema Notes
- **Fields NOT included** (per schema instructions): prerequisites, corequisites, per-course is_capstone flags, course descriptions, department narratives
- **`eligible_courses`**: Stored as arrays when specific course IDs are known, or as descriptive strings when the choice is broader
- **`min_grade`**: Program-level requirement for the slot, not the University-wide grade policy
- **Teacher Education programs**: Extracted following the same schema; these have unique structures with Professional Study and Internship blocks
- **Variable-hour programs** (Psychology, Mathematics, Chemistry): Baseline reflects the typical/minimum path; footnotes document the variability

## Methodology
1. `pdfinfo` for metadata and page count
2. `pdftotext` for TOC and all text sections (pp. 68–223)
3. `pdftoppm -jpeg -r 150` to rasterize all 149 curriculum pages for visual verification
4. Cross-referenced text extraction against rasterized images for every credit hour value
5. Decoded all footnotes from superscript references to plain English
6. Validated credit hour sums and semester totals programmatically
7. GenEd eligible course lists (pp. 68–70) applied consistently across all programs
