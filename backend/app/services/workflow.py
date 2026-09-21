"""批改流程：把一份试卷的所有图片 + 参考答案打包，调一次模型接口拿回结果。"""

from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..crypto import Cryptor
from ..database import SessionLocal
from .model_provider import ModelProvider, ModelProviderError
from .prompts import GRADING_SYSTEM_PROMPT, build_grading_user_prompt

logger = logging.getLogger(__name__)


def get_active_provider(db: Session) -> ModelProvider:
    settings = get_settings()
    config = db.query(models.ModelConfig).filter_by(is_active=True).first()
    if config is None:
        raise RuntimeError("尚未配置可用的AI模型，请先在“模型配置”页面填写并保存 API Key。")
    api_key = Cryptor(settings.secret_key).decrypt(config.api_key_encrypted)
    return ModelProvider(base_url=config.base_url, api_key=api_key, model_name=config.model_name)


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

            user_prompt = build_grading_user_prompt(
                exam_name=exam.name,
                total_score=exam.total_score,
                reference_text=exam.reference_text,
                grading_notes=exam.grading_notes,
                reference_image_count=len(reference_images),
                answer_key=exam.answer_key,
            )

            raw, usage = await provider.chat(
                system_prompt=GRADING_SYSTEM_PROMPT,
                user_text=user_prompt,
                image_paths=reference_images + student_images,
            )
            result = parse_json_response(raw)

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
            submission.result = result
            submission.total_score = result.get("total_score")
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
        db.close()
