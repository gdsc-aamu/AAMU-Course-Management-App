from pydantic import BaseModel
from typing import Optional


class Course(BaseModel):
    code: str           # e.g. "ENG 101"
    title: str          # e.g. "Composition I Honors"
    grade: str          # e.g. "A", "REG"
    credits: float      # e.g. 3.0
    term: str           # e.g. "Fall 2023"
    status: str         # "completed" | "in_progress" | "registered"
    section: str        # e.g. "GenEd Requirements - CMP"
    is_registered: bool = False  # True when grade == REG (future semester)


class StudentInfo(BaseModel):
    name: str
    student_id: str
    degree: str
    audit_date: str
    degree_progress_pct: Optional[float]
    overall_gpa: Optional[float]
    classification: Optional[str]
    catalog_year: Optional[str]   # e.g. "2023-2024"
    concentration: Optional[str]  # e.g. "General Computer Science"
    credits_required: Optional[float]
    credits_applied: Optional[float]


class RequirementBlock(BaseModel):
    block_name: str      # e.g. "GenEd Requirements - CMP"
    status: str          # "complete" | "in_progress" | "incomplete"
    credits_required: Optional[float]
    credits_applied: Optional[float]


class BlockRequirement(BaseModel):
    block_name: str
    description: str     # e.g. "Still needed: 1 Class in CS 4@@"
    is_met: bool = False


class DegreeWorksResult(BaseModel):
    student: StudentInfo
    completed_courses: list[Course]
    in_progress_courses: list[Course]
    all_courses: list[Course]
    requirement_blocks: list[RequirementBlock] = []
    block_requirements: list[BlockRequirement] = []
