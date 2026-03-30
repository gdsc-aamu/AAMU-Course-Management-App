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
import sys
from supabase import create_client, Client


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
                "credit_hours": credit_hours,
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
    for conc in data["concentrations_and_minors"]:
        for rc in conc["required_courses"]:
            add(rc["course_id"], rc["course_title"], rc["credit_hours"])

    return courses


# ── Seed ──────────────────────────────────────────────────────────────────────

def seed(client: Client, data: dict):

    meta = data["program_metadata"]

    # ── 1. Program ────────────────────────────────────────────────────────────
    print("Inserting program...")
    result = client.table("programs").insert({
        "code":               meta["degree_abbreviation"],   # "BSCS"
        "name":               meta["program_name"],          # "Computer Science"
        "catalog_year":       2021,
        "total_credit_hours": meta["total_credit_hours"],    # 125
    }).execute()
    program_id = result.data[0]["id"]
    print(f"  program_id: {program_id}")

    # ── 2. Courses ────────────────────────────────────────────────────────────
    print("\nInserting courses...")
    all_courses = collect_all_courses(data)
    result = client.table("courses").insert(list(all_courses.values())).execute()
    # Map course_id string (e.g. "CS 102") → uuid for FK resolution
    course_map: dict[str, str] = {r["course_id"]: r["id"] for r in result.data}
    print(f"  {len(course_map)} courses inserted")

    # ── 3. Curriculum slots ───────────────────────────────────────────────────
    print("\nInserting curriculum slots...")
    slot_id_by_index: dict[int, str] = {}
    sem_counters: dict[int, int] = {}

    for i, slot in enumerate(data["baseline_curriculum"]):
        sem_num = SEMESTER_MAP[slot["semester_suggested"]]
        sem_counters[sem_num] = sem_counters.get(sem_num, 0) + 1

        result = client.table("curriculum_slots").insert({
            "program_id":       program_id,
            "slot_label":       slot["course_title"],
            "semester_number":  sem_num,
            "slot_order":       sem_counters[sem_num],
            "credit_hours":     slot["credit_hours"],
            "is_elective_slot": slot["is_elective_slot"],
            "course_id":        course_map.get(slot["course_id"]) if slot["course_id"] else None,
            "min_grade":        slot.get("min_grade"),
        }).execute()

        slot_id_by_index[i] = result.data[0]["id"]

    print(f"  {len(slot_id_by_index)} slots inserted")

    # ── 4. Elective slot eligible courses ─────────────────────────────────────
    print("\nInserting elective slot eligible courses...")
    elective_rows = []
    for i, slot in enumerate(data["baseline_curriculum"]):
        if not slot["is_elective_slot"]:
            continue
        eligible = slot.get("eligible_courses")
        if not isinstance(eligible, list):
            continue  # skip open-ended descriptions like "Any CS course at 300-400 level"
        for cid in eligible:
            if cid in course_map:
                elective_rows.append({
                    "slot_id":   slot_id_by_index[i],
                    "course_id": course_map[cid],
                })

    if elective_rows:
        client.table("elective_slot_eligible_courses").insert(elective_rows).execute()
    print(f"  {len(elective_rows)} elective options inserted")

    # ── 5. Concentrations / minors ────────────────────────────────────────────
    print("\nInserting concentrations and minors...")
    for conc in data["concentrations_and_minors"]:
        result = client.table("concentrations").insert({
            "program_id":   program_id,
            "code":         conc["code"],
            "name":         conc["name"],
            "type":         conc["type"],
            "total_hours":  conc["total_hours"],
            "min_grade":    conc.get("min_grade"),
        }).execute()
        conc_id = result.data[0]["id"]

        # ── 6. Concentration slots ────────────────────────────────────────────
        conc_slots = []

        for rc in conc["required_courses"]:
            conc_slots.append({
                "concentration_id": conc_id,
                "slot_label":       rc["course_title"],
                "is_elective_slot": False,
                "level_restriction":None,
                "credit_hours":     rc["credit_hours"],
                "course_id":        course_map.get(rc["course_id"]),
                "min_grade":        conc.get("min_grade"),
            })

        for ep in conc["elective_pool"]:
            conc_slots.append({
                "concentration_id": conc_id,
                "slot_label":       ep["slot_name"],
                "is_elective_slot": True,
                "level_restriction":ep.get("level_restriction"),
                "credit_hours":     ep["credit_hours"],
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
    seed(client, data)
