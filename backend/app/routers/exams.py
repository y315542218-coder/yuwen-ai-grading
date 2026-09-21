import shutil

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..database import get_db
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


@router.delete("/{exam_id}")
def delete_exam(exam_id: int, db: Session = Depends(get_db)):
    exam = db.get(models.Exam, exam_id)
    if exam is None:
        raise HTTPException(404, "试卷不存在")
    db.query(models.Submission).filter_by(exam_id=exam_id).delete()
    db.delete(exam)
    db.commit()
    return {"ok": True}
