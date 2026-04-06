"""
Seed script for course prerequisite graphs.

Usage:
    python backend/seed_prerequisites.py <path/to/prereq_graph_edges_2025-2026.json>

Environment variables:
    SUPABASE_URL
    SUPABASE_SERVICE_KEY

What it does:
    1. Reads a prerequisite edge graph with fields like:
         - source: prerequisite course code
         - target: dependent course code
         - logic: ALL_REQUIRED | ANY_OF | MIXED
         - min_grade: optional grade floor
    2. Ensures every course code referenced in the graph exists in courses.
       Missing courses are created with placeholder values.
    3. Inserts prerequisite rows into course_prerequisites using the current
       course ids.

Notes:
    - ALL_REQUIRED edges become separate prerequisite groups.
    - ANY_OF edges for the same target share one prereq_group.
    - MIXED edges for the same target are grouped together as a best-effort
      representation because the current schema cannot express nested
      prerequisite structures such as "(A and B) or (C and D)" directly.
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

BATCH_SIZE = 500
COURSE_PLACEHOLDER_CREDIT_HOURS = 3
VALID_LOGICS = {"ALL_REQUIRED", "ANY_OF", "MIXED"}


def normalize_course_id(value: Any) -> str:
    if value is None:
        raise ValueError("Course code cannot be null")

    code = str(value).strip().upper()
    code = re.sub(r"\s+", " ", code)
    return code


def chunked(items: list[Any], size: int) -> list[list[Any]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def load_edges(json_path: Path) -> list[dict[str, Any]]:
    with json_path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)

    if not isinstance(raw, list):
        raise ValueError("Prerequisite graph JSON must be a list of edge objects")

    edges: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ValueError(f"Edge at index {index} is not an object")

        source = normalize_course_id(item.get("source"))
        target = normalize_course_id(item.get("target"))
        logic = str(item.get("logic", "ALL_REQUIRED")).strip().upper()
        min_grade = item.get("min_grade")
        min_grade = str(min_grade).strip().upper() if min_grade not in (None, "") else None

        if logic not in VALID_LOGICS:
            raise ValueError(
                f"Unsupported logic '{logic}' at index {index}. Expected one of {sorted(VALID_LOGICS)}"
            )

        edges.append(
            {
                "source": source,
                "target": target,
                "logic": logic,
                "min_grade": min_grade,
            }
        )

    return edges


def get_supabase_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")

    return create_client(url, service_key)


def ensure_courses_exist(client: Client, course_codes: set[str]) -> dict[str, str]:
    existing_rows: list[dict[str, Any]] = []
    course_codes_list = sorted(course_codes)

    for batch in chunked(course_codes_list, 1000):
        response = client.table("courses").select("id, course_id").in_("course_id", batch).execute()
        if response.data:
            existing_rows.extend(response.data)

    existing_codes = {row["course_id"] for row in existing_rows}
    missing_codes = [code for code in course_codes_list if code not in existing_codes]

    if missing_codes:
        print(f"Creating {len(missing_codes)} missing course records...")
        missing_rows = [
            {
                "course_id": code,
                "title": code,
                "credit_hours": COURSE_PLACEHOLDER_CREDIT_HOURS,
                "is_capstone": False,
            }
            for code in missing_codes
        ]

        for batch in chunked(missing_rows, BATCH_SIZE):
            client.table("courses").insert(batch).execute()
    else:
        print("No missing course records found.")

    course_id_map: dict[str, str] = {}
    for batch in chunked(course_codes_list, 1000):
        response = client.table("courses").select("id, course_id").in_("course_id", batch).execute()
        if response.data:
            for row in response.data:
                course_id_map[row["course_id"]] = row["id"]

    missing_after_insert = sorted(code for code in course_codes_list if code not in course_id_map)
    if missing_after_insert:
        raise RuntimeError(f"Failed to resolve course ids for: {', '.join(missing_after_insert)}")

    return course_id_map


def build_prerequisite_rows(edges: list[dict[str, Any]], course_id_map: dict[str, str]) -> list[dict[str, Any]]:
    edges_by_target: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for edge in edges:
        edges_by_target[edge["target"]].append(edge)

    rows: list[dict[str, Any]] = []

    for target in sorted(edges_by_target):
        target_edges = edges_by_target[target]
        group_index = 1

        mixed_edges = [edge for edge in target_edges if edge["logic"] == "MIXED"]
        any_of_edges = [edge for edge in target_edges if edge["logic"] == "ANY_OF"]
        all_required_edges = [edge for edge in target_edges if edge["logic"] == "ALL_REQUIRED"]
        other_edges = [edge for edge in target_edges if edge["logic"] not in VALID_LOGICS]

        if mixed_edges:
            rows.extend(
                {
                    "course_id": course_id_map[target],
                    "prerequisite_id": course_id_map[edge["source"]],
                    "prereq_group": group_index,
                    "min_grade": edge["min_grade"],
                }
                for edge in sorted(mixed_edges, key=lambda item: item["source"])
            )
            group_index += 1

        if any_of_edges:
            rows.extend(
                {
                    "course_id": course_id_map[target],
                    "prerequisite_id": course_id_map[edge["source"]],
                    "prereq_group": group_index,
                    "min_grade": edge["min_grade"],
                }
                for edge in sorted(any_of_edges, key=lambda item: item["source"])
            )
            group_index += 1

        for edge in sorted(all_required_edges, key=lambda item: item["source"]):
            rows.append(
                {
                    "course_id": course_id_map[target],
                    "prerequisite_id": course_id_map[edge["source"]],
                    "prereq_group": group_index,
                    "min_grade": edge["min_grade"],
                }
            )
            group_index += 1

        if other_edges:
            # Treat unknown logic values as required edges rather than silently dropping them.
            for edge in sorted(other_edges, key=lambda item: item["source"]):
                rows.append(
                    {
                        "course_id": course_id_map[target],
                        "prerequisite_id": course_id_map[edge["source"]],
                        "prereq_group": group_index,
                        "min_grade": edge["min_grade"],
                    }
                )
                group_index += 1

    return rows


def seed_prerequisites(client: Client, edges: list[dict[str, Any]]) -> None:
    all_course_codes = set()
    for edge in edges:
        all_course_codes.add(edge["source"])
        all_course_codes.add(edge["target"])

    course_id_map = ensure_courses_exist(client, all_course_codes)
    prerequisite_rows = build_prerequisite_rows(edges, course_id_map)

    if not prerequisite_rows:
        print("No prerequisite rows to insert.")
        return

    print(f"Upserting {len(prerequisite_rows)} prerequisite rows...")
    for batch in chunked(prerequisite_rows, BATCH_SIZE):
        client.table("course_prerequisites").upsert(batch, on_conflict="course_id,prerequisite_id").execute()

    print("Prerequisite seed completed successfully.")


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python backend/seed_prerequisites.py <path/to/prereq_graph_edges_2025-2026.json>")
        return 1

    graph_path = Path(sys.argv[1])
    if not graph_path.exists():
        print(f"File not found: {graph_path}")
        return 1

    client = get_supabase_client()
    edges = load_edges(graph_path)

    print(f"Loaded {len(edges)} prerequisite edges from {graph_path.name}")
    seed_prerequisites(client, edges)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
