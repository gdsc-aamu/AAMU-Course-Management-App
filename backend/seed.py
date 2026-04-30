"""
Seed script — AAMU Course Management App
Populates Supabase with CS BSCS 2021 curriculum data.

Usage:
    python seed.py <path/to/computer_science_bscs.json>

Required environment variables:
    SUPABASE_URL        — your project URL
    SUPABASE_SERVICE_KEY — service role key (bypasses RLS)
"""

import json
import os
import re
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()


# ── Semester label → ordered integer ─────────────────────────────────────────
SEMESTER_MAP = {
    "freshman_fall":   1,
    "freshman_spring": 2,
    "sophomore_fall":  3,
    "sophomore_spring":4,
    "junior_fall":     5,
    "junior_spring":   6,
    "senior_fall":     7,
    "senior_spring":   8,
}

CAPSTONE_COURSES = {"CS 403"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_credit_hours(value) -> int:
    """
    Coerce credit_hours to int.
    Handles:
      - integers/floats
      - ranges like '2-4' or '3-4' (takes minimum)
      - descriptive strings like '18 + (3) overlap = 21 effective'
    """
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)

    s = str(value).strip()

    # Simple numeric string (e.g. "3" or "3.0")
    try:
        return int(float(s))
    except ValueError:
        pass

    # Range format (e.g. "2-4")
    if "-" in s:
        return int(s.split("-")[0])

    # Prefer explicit equation result when present (e.g. "= 21 effective")
    eq_match = re.search(r"=\s*(\d+)", s)
    if eq_match:
        return int(eq_match.group(1))

    # Fallback: extract all numbers and use the last one (most specific in notes)
    nums = re.findall(r"\d+(?:\.\d+)?", s)
    if nums:
        return int(float(nums[-1]))

    raise ValueError(f"Unable to parse credit hours from value: {value!r}")


def get_required_courses(conc: dict) -> list:
    """
    Return the required courses list for a concentration regardless of the key
    name used. Some programs (e.g. Teacher Ed) split required courses across
    required_courses_teaching_field and required_courses_professional_study
    instead of the standard required_courses key.
    """
    if "required_courses" in conc:
        return conc["required_courses"]
    combined = []
    for key, val in conc.items():
        if key.startswith("required_courses") and isinstance(val, list):
            combined.extend(val)
    return combined


def collect_all_courses(data: dict) -> dict:
    """
    Build a course_id -> record dict from baseline curriculum and
    concentrations/minors. Elective-eligible courses (e.g. HIS 101)
    that have no other details are given a credit_hours placeholder of 3
    and should be updated once the full catalog is scraped.
    """
    courses = {}

    def add(course_id, title, credit_hours, is_capstone=False):
        if course_id and course_id not in courses:
            courses[course_id] = {
                "course_id":    course_id,
                "title":        title,
                "credit_hours": parse_credit_hours(credit_hours),
                "is_capstone":  is_capstone,
            }

    # Baseline curriculum — fixed courses and elective-eligible options
    for slot in data["baseline_curriculum"]:
        if slot["course_id"]:
            add(
                slot["course_id"],
                slot["course_title"],
                slot["credit_hours"],
                slot["course_id"] in CAPSTONE_COURSES,
            )

        eligible = slot.get("eligible_courses")
        if isinstance(eligible, list):
            for cid in eligible:
                add(cid, cid, 3)   # placeholder title/hours — update from scraped data

    # Concentrations and minors — required courses
    # Some programs use alternate key names (e.g. Teacher Ed uses
    # required_courses_teaching_field / required_courses_professional_study)
    for conc in data["concentrations_and_minors"]:
        for rc in get_required_courses(conc):
            add(rc["course_id"], rc["course_title"], rc["credit_hours"])

    return courses


def resolve_catalog_year(data: dict, source_path: str | None = None) -> int:
        """
        Resolve catalog year from metadata when present, otherwise infer from file name
        patterns like *_2023_2024.json. Falls back to 2021 for legacy inputs.
        """
        meta = data.get("program_metadata", {})

        # Prefer explicit metadata fields if present.
        for key in ("catalog_year", "bulletin_year", "academic_year"):
            value = meta.get(key)
            if isinstance(value, int):
                return value
            if isinstance(value, str):
                year_match = re.search(r"(20\d{2})", value)
                if year_match:
                    return int(year_match.group(1))

        # Fallback to year encoded in source file name.
        if source_path:
            basename = os.path.basename(source_path)
            range_match = re.search(r"(20\d{2})[_-](20\d{2})", basename)
            if range_match:
                return int(range_match.group(1))

            single_match = re.search(r"(20\d{2})", basename)
            if single_match:
                return int(single_match.group(1))

        return 2021


# ── Seed ──────────────────────────────────────────────────────────────────────

def seed(client: Client, data: dict, source_path: str | None = None):

    meta = data["program_metadata"]
    catalog_year = resolve_catalog_year(data, source_path)

    # ── 1. Program (upsert on code + catalog_year) ───────────────────────────
    # Code is composed as "DEPT-DEGREE" (e.g. "BENV-BS", "BSCS") to ensure
    # uniqueness across programs that share the same degree abbreviation (e.g. "BS").
    program_code = f"{meta['department_code']}-{meta['degree_abbreviation']}"
    print("Upserting program...")
    result = client.table("programs").upsert({
        "code":                    program_code,
        "name":                    meta["program_name"],
        "catalog_year":            catalog_year,
        "total_credit_hours":      parse_credit_hours(meta["total_credit_hours"]),
        "graduation_requirements": meta.get("graduation_requirements") or [],
        "capstone_rule":           meta.get("capstone_rule"),
    }, on_conflict="code,catalog_year").execute()
    program_id = result.data[0]["id"]
    print(f"  program_id: {program_id} (code: {program_code}, catalog_year: {catalog_year})")

    # ── 2. Courses (upsert on course_id) ─────────────────────────────────────
    print("\nUpserting courses...")
    all_courses = collect_all_courses(data)
    result = client.table("courses").upsert(
        list(all_courses.values()), on_conflict="course_id"
    ).execute()
    # Re-fetch to get UUIDs for both new and pre-existing courses
    all_ids = client.table("courses").select("id, course_id").in_(
        "course_id", list(all_courses.keys())
    ).execute()
    course_map: dict[str, str] = {r["course_id"]: r["id"] for r in all_ids.data}
    print(f"  {len(course_map)} courses upserted")

    # ── 3. Curriculum slots (skip if already seeded for this program) ─────────
    print("\nInserting curriculum slots...")
    existing_slots = client.table("curriculum_slots").select("id").eq(
        "program_id", program_id
    ).limit(1).execute()

    slot_id_by_index: dict[int, str] = {}

    if existing_slots.data:
        print("  Slots already exist for this program — skipping.")
        # Re-fetch existing slot IDs in order so elective eligible courses can
        # reference them if this script is re-run after a partial failure.
        all_slots = client.table("curriculum_slots").select("id").eq(
            "program_id", program_id
        ).order("semester_number").order("slot_order").execute()
        for i, row in enumerate(all_slots.data):
            slot_id_by_index[i] = row["id"]
    else:
        sem_counters: dict[int, int] = {}
        for i, slot in enumerate(data["baseline_curriculum"]):
            sem_num = SEMESTER_MAP[slot["semester_suggested"]]
            sem_counters[sem_num] = sem_counters.get(sem_num, 0) + 1

            result = client.table("curriculum_slots").insert({
                "program_id":       program_id,
                "slot_label":       slot["course_title"],
                "semester_number":  sem_num,
                "slot_order":       sem_counters[sem_num],
                "credit_hours":     parse_credit_hours(slot["credit_hours"]),
                "is_elective_slot": slot["is_elective_slot"],
                "course_id":        course_map.get(slot["course_id"]) if slot["course_id"] else None,
                "min_grade":        slot.get("min_grade"),
            }).execute()
            slot_id_by_index[i] = result.data[0]["id"]

        print(f"  {len(slot_id_by_index)} slots inserted")

    # ── 4. Elective slot eligible courses (upsert on slot_id, course_id) ──────
    print("\nUpserting elective slot eligible courses...")
    elective_rows = []
    for i, slot in enumerate(data["baseline_curriculum"]):
        if not slot["is_elective_slot"]:
            continue
        eligible = slot.get("eligible_courses")
        if not isinstance(eligible, list):
            continue
        for cid in eligible:
            if cid in course_map and i in slot_id_by_index:
                elective_rows.append({
                    "slot_id":   slot_id_by_index[i],
                    "course_id": course_map[cid],
                })

    if elective_rows:
        client.table("elective_slot_eligible_courses").upsert(
            elective_rows, on_conflict="slot_id,course_id"
        ).execute()
    print(f"  {len(elective_rows)} elective options upserted")

    # ── 5. Concentrations (upsert on program_id + code) ──────────────────────
    print("\nUpserting concentrations and minors...")
    for conc in data["concentrations_and_minors"]:
        result = client.table("concentrations").upsert({
            "program_id":   program_id,
            "code":         conc["code"],
            "name":         conc["name"],
            "type":         conc["type"],
            "total_hours":  parse_credit_hours(conc["total_hours"]),
            "min_grade":    conc.get("min_grade"),
        }, on_conflict="program_id,code").execute()
        conc_id = result.data[0]["id"]

        # ── 6. Concentration slots (skip if already seeded) ───────────────────
        existing_conc_slots = client.table("concentration_slots").select("id").eq(
            "concentration_id", conc_id
        ).limit(1).execute()

        if existing_conc_slots.data:
            print(f"  {conc['name']}: slots already exist — skipping.")
            continue

        conc_slots = []
        for rc in get_required_courses(conc):
            conc_slots.append({
                "concentration_id": conc_id,
                "slot_label":       rc["course_title"],
                "is_elective_slot": False,
                "level_restriction":None,
                "credit_hours":     parse_credit_hours(rc["credit_hours"]),
                "course_id":        course_map.get(rc["course_id"]),
                "min_grade":        conc.get("min_grade"),
            })
        for ep in conc.get("elective_pool", []):
            conc_slots.append({
                "concentration_id": conc_id,
                "slot_label":       ep["slot_name"],
                "is_elective_slot": True,
                "level_restriction":ep.get("level_restriction"),
                "credit_hours":     parse_credit_hours(ep["credit_hours"]),
                "course_id":        None,
                "min_grade":        conc.get("min_grade"),
            })

        client.table("concentration_slots").insert(conc_slots).execute()
        print(f"  {conc['name']}: {len(conc_slots)} slots inserted")

    print("\nDone. Database seeded successfully.")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python seed.py <path/to/computer_science_bscs.json>")
        sys.exit(1)

    json_path = sys.argv[1]
    if not os.path.exists(json_path):
        print(f"File not found: {json_path}")
        sys.exit(1)

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        sys.exit(1)

    with open(json_path) as f:
        data = json.load(f)

    client = create_client(url, key)
    seed(client, data, json_path)
