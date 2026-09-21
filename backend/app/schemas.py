from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class ModelConfigIn(BaseModel):
    provider: str
    base_url: str
    model_name: str
    api_key: str


class ModelConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    provider: str
    base_url: str
    model_name: str
    is_active: bool


class ExamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    total_score: float
    reference_text: Optional[str] = None
    reference_images: list = []
    grading_notes: Optional[str] = None
    pages_per_paper: int


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    exam_id: int
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    image_paths: list = []
    status: str
    total_score: Optional[float] = None
    error_message: Optional[str] = None
    created_at: dt.datetime


class SubmissionDetailOut(SubmissionOut):
    result: Optional[dict[str, Any]] = None


class ClassGroupIn(BaseModel):
    name: str


class ClassGroupOut(ClassGroupIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class StudentIn(BaseModel):
    name: str
    class_id: Optional[int] = None
    parent_contact: Optional[str] = None


class StudentOut(StudentIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
