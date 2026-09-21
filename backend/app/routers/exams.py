import datetime as dt
import shutil
from urllib.parse import quote

from fastapi import APIRouter, Depends, Form, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..database import get_db
from ..services import pdf_utils
from ..services.model_provider import ModelProviderError
from ..services.prompts import ANALYSIS_SYSTEM_PROMPT, build_analysis_prompt
from ..services.excel_export import build_workbook
from ..services.statistics import build_statistics
from ..services.workflow import get_active_provider, parse_json_response
from ..services.reference_parser import extract_text

router = APIRouter(prefix="/exams", tags=["exams"])

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


@router.post("", response_model=schemas.ExamOut)
def create_exam(
    name: str = Form(...),
    total_score: float = Form(100),
    grading_notes: str | None = Form(None),
    files: list[UploadFile] = [],
    db: Session = Depends(get_db),
):
    """新建一场考试：上传参考答案（Word/文本会被提取成文字，图片直接作为参考图发给模型）。"""
    settings = get_settings()

    exam = models.Exam(
        name=name,
        total_score=total_score,
        grading_notes=grading_notes,
        reference_images=[],
    )
    db.add(exam)
    db.flush()

    exam_dir = settings.storage_dir / "reference" / str(exam.id)
    exam_dir.mkdir(parents=True, exist_ok=True)

    texts: list[str] = []
    images: list[str] = []
    for file in files:
        dest = exam_dir / file.filename
        with dest.open("wb") as f:
            shutil.copyfileobj(file.file, f)

        if dest.suffix.lower() in IMAGE_SUFFIXES:
            images.append(str(dest))
        elif pdf_utils.is_pdf(dest):
            # 有文字层就直接取字（省 token）；扫描版 PDF 没有文字层，只能转成图片
            if pdf_utils.has_text_layer(dest):
                texts.append(pdf_utils.extract_text(dest))
            else:
                images.extend(
                    str(p) for p in pdf_utils.render_to_images(dest, exam_dir, dest.stem)
                )
        else:
            try:
                texts.append(extract_text(dest))
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc

    exam.reference_text = "\n\n".join(texts) if texts else None
    exam.reference_images = images
    db.commit()
    db.refresh(exam)
    return exam


@router.get("", response_model=list[schemas.ExamOut])
def list_exams(db: Session = Depends(get_db)):
    return db.query(models.Exam).order_by(models.Exam.created_at.desc()).all()


@router.get("/{exam_id}", response_model=schemas.ExamOut)
def get_exam(exam_id: int, db: Session = Depends(get_db)):
    exam = db.get(models.Exam, exam_id)
    if exam is None:
        raise HTTPException(404, "试卷不存在")
    return exam


@router.patch("/{exam_id}", response_model=schemas.ExamOut)
def update_exam(exam_id: int, payload: schemas.ExamUpdateIn, db: Session = Depends(get_db)):
    """教师修改参考答案：改过之后的内容会作为权威答案参与后续批改。"""
    exam = db.get(models.Exam, exam_id)
    if exam is None:
        raise HTTPException(404, "考试不存在")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(exam, field, value)

    db.commit()
    db.refresh(exam)
    return exam


@router.post("/{exam_id}/answer-key/import", response_model=schemas.ExamOut)
def import_answer_key(exam_id: int, db: Session = Depends(get_db)):
    """从这场考试里任意一份已批改的试卷，提取逐题参考答案，供教师核对修改。"""
    exam = db.get(models.Exam, exam_id)
    if exam is None:
        raise HTTPException(404, "考试不存在")

    graded = (
        db.query(models.Submission)
        .filter_by(exam_id=exam_id, status="completed")
        .order_by(models.Submission.id)
        .first()
    )
    questions = (graded.result or {}).get("questions") if graded else None
    if not questions:
        raise HTTPException(400, "这场考试还没有批改完成的试卷，无法提取")

    exam.answer_key = [
        {
            "question_no": q.get("question_no", ""),
            "reference_answer": q.get("reference_answer", ""),
            "max_score": q.get("max_score", 0),
        }
        for q in questions
    ]
    db.commit()
    db.refresh(exam)
    return exam


@router.get("/{exam_id}/statistics")
def get_statistics(exam_id: int, db: Session = Depends(get_db)):
    """本场考试的成绩统计，纯计算不调模型。"""
    exam = db.get(models.Exam, exam_id)
    if exam is None:
        raise HTTPException(404, "考试不存在")

    submissions = db.query(models.Submission).filter_by(exam_id=exam_id).all()
    stats = build_statistics(exam, submissions)
    stats["analysis"] = exam.analysis
    return stats


@router.get("/{exam_id}/export")
def export_scores(exam_id: int, db: Session = Depends(get_db)):
    """导出成绩表 Excel：成绩表、逐题分析、总体情况三个工作表。"""
    exam = db.get(models.Exam, exam_id)
    if exam is None:
        raise HTTPException(404, "考试不存在")

    submissions = db.query(models.Submission).filter_by(exam_id=exam_id).all()
    stats = build_statistics(exam, submissions)
    if not stats.get("graded_count"):
        raise HTTPException(400, "还没有批改完成的试卷，无法导出")

    content = build_workbook(stats, submissions)
    filename = quote(f"{exam.name}_成绩表.xlsx")
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@router.post("/{exam_id}/analysis")
async def generate_analysis(exam_id: int, db: Session = Depends(get_db)):
    """把统计数据交给模型，生成学情评价和教学建议。"""
    exam = db.get(models.Exam, exam_id)
    if exam is None:
        raise HTTPException(404, "考试不存在")

    submissions = db.query(models.Submission).filter_by(exam_id=exam_id).all()
    stats = build_statistics(exam, submissions)
    if not stats.get("graded_count"):
        raise HTTPException(400, "还没有批改完成的试卷，无法分析")

    try:
        provider = get_active_provider(db)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc

    try:
        raw, _usage = await provider.chat(
            system_prompt=ANALYSIS_SYSTEM_PROMPT,
            user_text=build_analysis_prompt(stats),
        )
        analysis = parse_json_response(raw)
    except ModelProviderError as exc:
        raise HTTPException(400, str(exc)) from exc

    analysis["generated_at"] = dt.datetime.now().isoformat(timespec="seconds")
    analysis["based_on_count"] = stats["graded_count"]
    exam.analysis = analysis
    db.commit()
    return analysis


@router.delete("/{exam_id}")
def delete_exam(exam_id: int, db: Session = Depends(get_db)):
    exam = db.get(models.Exam, exam_id)
    if exam is None:
        raise HTTPException(404, "试卷不存在")
    db.query(models.Submission).filter_by(exam_id=exam_id).delete()
    db.delete(exam)
    db.commit()
    return {"ok": True}
