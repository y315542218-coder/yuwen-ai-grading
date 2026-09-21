from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class ModelConfigIn(BaseModel):
    provider: str
    base_url: str
    model_name: str
    api_key: str
    thinking_enabled: bool = True
    reasoning_effort: str = "high"


class ModelConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    provider: str
    base_url: str
    model_name: str
    is_active: bool
    thinking_enabled: bool
    reasoning_effort: str


class ModelConfigUpdateIn(BaseModel):
    """只改批改参数，不用重新填 API Key。"""

    thinking_enabled: Optional[bool] = None
    reasoning_effort: Optional[str] = None


class ExamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    total_score: float
    reference_text: Optional[str] = None
    reference_images: list = []
    grading_notes: Optional[str] = None
    answer_key: Optional[list] = None
    hires_tiles: bool = False


class ExamUpdateIn(BaseModel):
    """全部可选，只改传上来的字段。"""

    name: Optional[str] = None
    total_score: Optional[float] = None
    reference_text: Optional[str] = None
    grading_notes: Optional[str] = None
    answer_key: Optional[list] = None
    hires_tiles: Optional[bool] = None


class QuestionScoreIn(BaseModel):
    index: int
    score: float
    reason: Optional[str] = None
    reference_answer: Optional[str] = None


class ScoreUpdateIn(BaseModel):
    questions: list[QuestionScoreIn] = []
    essay_score: Optional[float] = None


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
    token_usage: Optional[dict[str, Any]] = None
    grading_meta: Optional[dict[str, Any]] = None


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


class StudentBatchIn(BaseModel):
    names: list[str]
    class_id: Optional[int] = None


class AddStudentsIn(BaseModel):
    student_ids: list[int]


class MergeIn(BaseModel):
    source_ids: list[int]


class SubmissionUpdateIn(BaseModel):
    student_id: Optional[int] = None
    student_name: Optional[str] = None
