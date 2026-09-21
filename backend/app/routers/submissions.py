import shutil
import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..database import get_db
from ..services.workflow import run_grading

router = APIRouter(prefix="/submissions", tags=["submissions"])


@router.post("", response_model=list[schemas.SubmissionOut])
def upload_submissions(
    exam_id: int,
    files: list[UploadFile],
    background_tasks: BackgroundTasks,
    pages_per_paper: int | None = None,
    db: Session = Depends(get_db),
):
    """批量上传扫描件。

    一份试卷可能有多页，按上传顺序每 pages_per_paper 张图片归为一份试卷；
    不传时用试卷本身配置的页数。
    """
    exam = db.get(models.Exam, exam_id)
    if exam is None:
        raise HTTPException(404, "试卷不存在，请先创建")

    per_paper = pages_per_paper or exam.pages_per_paper or 1
    if per_paper < 1:
        raise HTTPException(400, "每份试卷的页数必须大于0")
    if len(files) % per_paper != 0:
        raise HTTPException(
            400, f"上传了 {len(files)} 张图片，无法按每份 {per_paper} 页整除，请检查页数设置"
        )

    settings = get_settings()
    exam_dir = settings.storage_dir / "submissions" / str(exam_id)
    exam_dir.mkdir(parents=True, exist_ok=True)

    saved_paths: list[str] = []
    for file in files:
        dest = exam_dir / f"{int(time.time() * 1000)}_{file.filename}"
        with dest.open("wb") as f:
            shutil.copyfileobj(file.file, f)
        saved_paths.append(str(dest))

    created: list[models.Submission] = []
    for start in range(0, len(saved_paths), per_paper):
        submission = models.Submission(
            exam_id=exam_id,
            image_paths=saved_paths[start : start + per_paper],
            status="pending",
        )
        db.add(submission)
        created.append(submission)

    db.commit()
    for submission in created:
        db.refresh(submission)
        background_tasks.add_task(run_grading, submission.id)

    return created


@router.get("", response_model=list[schemas.SubmissionOut])
def list_submissions(exam_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Submission)
    if exam_id is not None:
        query = query.filter_by(exam_id=exam_id)
    return query.order_by(models.Submission.created_at.desc()).all()


@router.get("/{submission_id}", response_model=schemas.SubmissionDetailOut)
def get_submission(submission_id: int, db: Session = Depends(get_db)):
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")
    return submission


@router.get("/{submission_id}/images/{index}")
def get_submission_image(submission_id: int, index: int, db: Session = Depends(get_db)):
    """按下标取这份试卷的某一页，供教师边看原卷边复核。"""
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")
    paths = submission.image_paths or []
    if index < 0 or index >= len(paths):
        raise HTTPException(404, "页码不存在")
    return FileResponse(paths[index])


@router.post("/{submission_id}/regrade")
def regrade_submission(
    submission_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")

    submission.status = "pending"
    submission.total_score = None
    submission.result = None
    submission.error_message = None
    db.commit()

    background_tasks.add_task(run_grading, submission_id)
    return {"ok": True}


@router.delete("/{submission_id}")
def delete_submission(submission_id: int, db: Session = Depends(get_db)):
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")
    db.delete(submission)
    db.commit()
    return {"ok": True}
