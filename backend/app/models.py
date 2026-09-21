from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class TimestampMixin:
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow
    )


class ModelConfig(TimestampMixin, Base):
    """教师配置的多模态模型接入信息。"""

    __tablename__ = "model_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32))  # deepseek / doubao / qwen / custom
    base_url: Mapped[str] = mapped_column(String(255))
    model_name: Mapped[str] = mapped_column(String(128))
    api_key_encrypted: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 思考模式：开启时模型先输出推理链再给结论，判分更细但输出token会多出好几倍。
    # 只有 DeepSeek 等支持该参数的模型会用到，其它厂商忽略即可。
    thinking_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    reasoning_effort: Mapped[str] = mapped_column(String(16), default="high")


class ClassGroup(TimestampMixin, Base):
    __tablename__ = "class_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64))

    students: Mapped[list["Student"]] = relationship(back_populates="class_group")


class Student(TimestampMixin, Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    class_id: Mapped[Optional[int]] = mapped_column(ForeignKey("class_groups.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(64))
    parent_contact: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    class_group: Mapped[Optional[ClassGroup]] = relationship(back_populates="students")
    submissions: Mapped[list["Submission"]] = relationship(back_populates="student")


class Exam(TimestampMixin, Base):
    """一场考试 = 参考答案包（文本 + 可选的参考答案图片）。"""

    __tablename__ = "exams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    total_score: Mapped[float] = mapped_column(Float, default=100)
    reference_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reference_images: Mapped[list] = mapped_column(JSON, default=list)
    # 教师补充的评分说明，例如"古诗文每错一字扣0.5分"，会一并写进 prompt
    grading_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # 逐题参考答案：首份试卷批改完成后由模型的结果自动填充，之后以教师修改的为准，
    # 并作为权威答案写进后续批改的 prompt。结构：
    # [{"question_no": "...", "reference_answer": "...", "max_score": 0}]
    answer_key: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    # 高清识别模式：整页发给模型会被压到约1300x1300，括号里的拼音、圈划记号会糊掉。
    # 开启后每页切成小块，每块不被压缩，清晰度约提升3倍，代价是图片数和输入token变多。
    # 默认关闭（普通模式），密排试卷识别不准时再开。
    hires_tiles: Mapped[bool] = mapped_column(Boolean, default=False)

    submissions: Mapped[list["Submission"]] = relationship(back_populates="exam")


class Submission(TimestampMixin, Base):
    """一份学生试卷，可能由多张扫描图片组成，批改结果整体存在 result 里。"""

    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"))
    student_id: Mapped[Optional[int]] = mapped_column(ForeignKey("students.id"), nullable=True)
    student_name: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    image_paths: Mapped[list] = mapped_column(JSON, default=list)
    # draft(已建档待上传) -> pending -> processing -> completed / failed
    status: Mapped[str] = mapped_column(String(32), default="draft")
    total_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # 接口返回的 usage，含缓存命中/未命中 token 数，用来核对实际花费
    token_usage: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # 本次批改用的模型与参数，以及耗时，用来横向对比不同配置的效果
    # {"model": "...", "thinking": true, "effort": "high", "seconds": 42.1}
    grading_meta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    exam: Mapped[Exam] = relationship(back_populates="submissions")
    student: Mapped[Optional[Student]] = relationship(back_populates="submissions")
