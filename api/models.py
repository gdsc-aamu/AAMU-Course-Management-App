from pydantic import BaseModel
from typing import Optional


class Course(BaseModel):
    code: str          # e.g. "ENG 101H"
    title: str         # e.g. "Composition I Honors"
    grade: str         # e.g. "A", "REG"
    credits: float     # e.g. 3.0
    term: str          # e.g. "Fall 2023"
    status: str        # "completed" | "in_progress"
    section: str       # e.g. "GenEd Requirements - EE"


class StudentInfo(BaseModel):
    name: str
    student_id: str
    degree: str
    audit_date: str
    degree_progress_pct: Optional[int]


class DegreeWorksResult(BaseModel):
    student: StudentInfo
    completed_courses: list[Course]
    in_progress_courses: list[Course]
    all_courses: list[Course]   # completed + in_progress combined
