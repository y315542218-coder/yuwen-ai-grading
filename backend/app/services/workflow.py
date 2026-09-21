"""批改流程：把一份试卷的所有图片 + 参考答案打包，调一次模型接口拿回结果。"""

from __future__ import annotations

import json
import logging
import time

from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..crypto import Cryptor
from ..database import SessionLocal
from . import cleanup
from .image_utils import split_for_vision
from .model_provider import ModelProvider, ModelProviderError
from .prompts import GRADING_SYSTEM_PROMPT, build_grading_user_prompt

logger = logging.getLogger(__name__)


def get_active_provider(db: Session) -> ModelProvider:
    settings = get_settings()
    config = db.query(models.ModelConfig).filter_by(is_active=True).first()
    if config is None:
        raise RuntimeError("尚未配置可用的AI模型，请先在“模型配置”页面填写并保存 API Key。")
    api_key = Cryptor(settings.secret_key).decrypt(config.api_key_encrypted)
    return ModelProvider(
        base_url=config.base_url,
        api_key=api_key,
        model_name=config.model_name,
        thinking_enabled=config.thinking_enabled,
        reasoning_effort=config.reasoning_effort,
    )


def parse_json_response(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        # 兼容模型偶尔用 ```json ... ``` 包裹输出
        text = text.strip("`")
        text = text.split("\n", 1)[-1] if "\n" in text else text
        text = text.rsplit("```", 1)[0].strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ModelProviderError(f"模型未返回合法JSON：{text[:300]}") from exc


def summarize_sections(questions: list, essay: dict | None = None) -> list:
    """按题目上标的 section 汇总各大题得分，保持题目出现的先后顺序。"""
    totals: dict[str, dict] = {}
    for q in questions:
        name = q.get("section") or "未分类"
        bucket = totals.setdefault(name, {"name": name, "score": 0.0, "total": 0.0})
        bucket["score"] += float(q.get("score") or 0)
        bucket["total"] += float(q.get("max_score") or 0)

    if essay:
        totals["作文"] = {
            "name": "作文",
            "score": float(essay.get("score") or 0),
            "total": float(essay.get("max_score") or 0),
        }
    return list(totals.values())


async def run_grading(submission_id: int) -> None:
    """后台任务入口：批改一份试卷。后台任务不能复用请求的DB会话，这里单开一个。"""
    db = SessionLocal()
    try:
        submission = db.get(models.Submission, submission_id)
        if submission is None:
            return

        submission.status = "processing"
        db.commit()

        try:
            provider = get_active_provider(db)
            exam = submission.exam

            reference_images = list(exam.reference_images or [])
            student_images = list(submission.image_paths or [])

            if not student_images:
                raise RuntimeError("这份试卷还没有上传图片")

            # 每页先给整页（把握版面），紧跟它切出的高清分块（看清笔迹细节）
            if exam.hires_tiles:
                tile_dir = cleanup.tile_dir(submission.id)
                expanded: list[str] = []
                for page in student_images:
                    expanded.append(page)
                    expanded.extend(str(t) for t in split_for_vision(page, tile_dir))
                student_images = expanded

            user_prompt = build_grading_user_prompt(
                exam_name=exam.name,
                total_score=exam.total_score,
                reference_text=exam.reference_text,
                grading_notes=exam.grading_notes,
                reference_image_count=len(reference_images),
                answer_key=exam.answer_key,
                tiled=exam.hires_tiles,
            )

            started = time.monotonic()
            raw, usage = await provider.chat(
                system_prompt=GRADING_SYSTEM_PROMPT,
                user_text=user_prompt,
                image_paths=reference_images + student_images,
            )
            elapsed = time.monotonic() - started
            result = parse_json_response(raw)

            submission.grading_meta = {
                "model": provider.model_name,
                "thinking": provider.thinking_enabled,
                "effort": provider.reasoning_effort if provider.thinking_enabled else None,
                "tiled": exam.hires_tiles,
                "images": len(reference_images) + len(student_images),
                "seconds": round(elapsed, 1),
            }

            # 首份批改完成后，把模型解析出的逐题参考答案回填到考试上，
            # 教师可以在考试管理里核对修改，之后的批改以修改后的为准。
            if not exam.answer_key and result.get("questions"):
                exam.answer_key = [
                    {
                        "question_no": q.get("question_no", ""),
                        "reference_answer": q.get("reference_answer", ""),
                        "max_score": q.get("max_score", 0),
                    }
                    for q in result["questions"]
                ]

            submission.token_usage = usage
            # 总分和各大题小计一律由逐题分数汇总得出，不采信模型自己报的数：
            # 实测非思考模式下模型的求和经常对不上（逐题合计89却报82）。
            questions = result.get("questions") or []
            essay = result.get("essay") or None
            result["model_reported_total"] = result.get("total_score")
            result["sections"] = summarize_sections(questions, essay)
            computed = sum(float(q.get("score") or 0) for q in questions)
            computed += float((essay or {}).get("score") or 0)
            result["total_score"] = computed

            submission.result = result
            submission.total_score = computed
            if not submission.student_name:
                submission.student_name = result.get("student_name") or None
            submission.status = "completed"
            submission.error_message = None
        except (ModelProviderError, RuntimeError) as exc:
            logger.exception("批改试卷 %s 失败", submission_id)
            submission.status = "failed"
            submission.error_message = str(exc)

        db.commit()
    finally:
        # 切块图只在调模型那一刻有用，批改结束（成功或失败）都该清掉，
        # 否则高清模式每批一次就多出几百MB
        cleanup.remove_tiles(submission_id)
        db.close()
