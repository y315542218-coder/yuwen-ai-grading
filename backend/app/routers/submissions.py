import shutil
import time

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..database import get_db
from ..services.workflow import run_grading

router = APIRouter(tags=["submissions"])

GRADABLE_STATUSES = {"draft", "pending", "failed"}


@router.post("/exams/{exam_id}/students", response_model=list[schemas.SubmissionOut])
def add_students_to_exam(
    exam_id: int, payload: schemas.AddStudentsIn, db: Session = Depends(get_db)
):
    """把已有学生加入这场考试，每人建一条待上传的试卷记录。"""
    exam = db.get(models.Exam, exam_id)
    if exam is None:
        raise HTTPException(404, "考试不存在")

    existing = {
        s.student_id
        for s in db.query(models.Submission).filter_by(exam_id=exam_id).all()
        if s.student_id is not None
    }

    created: list[models.Submission] = []
    for student_id in payload.student_ids:
        if student_id in existing:
            continue
        student = db.get(models.Student, student_id)
        if student is None:
            raise HTTPException(404, f"学生 {student_id} 不存在")
        submission = models.Submission(
            exam_id=exam_id,
            student_id=student_id,
            student_name=student.name,
            image_paths=[],
            status="draft",
        )
        db.add(submission)
        created.append(submission)

    db.commit()
    for s in created:
        db.refresh(s)
    return created


@router.post("/submissions/{submission_id}/images", response_model=schemas.SubmissionOut)
def upload_images(
    submission_id: int, files: list[UploadFile], db: Session = Depends(get_db)
):
    """给某个学生上传他自己的试卷图片，可以多页，重复上传会追加。"""
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")

    settings = get_settings()
    target_dir = settings.storage_dir / "submissions" / str(submission.exam_id) / str(submission.id)
    target_dir.mkdir(parents=True, exist_ok=True)

    paths = list(submission.image_paths or [])
    for file in files:
        dest = target_dir / f"{int(time.time() * 1000)}_{file.filename}"
        with dest.open("wb") as f:
            shutil.copyfileobj(file.file, f)
        paths.append(str(dest))

    submission.image_paths = paths
    if submission.status == "draft" and paths:
        submission.status = "pending"
    db.commit()
    db.refresh(submission)
    return submission


@router.delete("/submissions/{submission_id}/images")
def clear_images(submission_id: int, db: Session = Depends(get_db)):
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")
    submission.image_paths = []
    submission.status = "draft"
    submission.result = None
    submission.total_score = None
    db.commit()
    return {"ok": True}


@router.post("/exams/{exam_id}/grade-all")
def grade_all(exam_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """批量批改：把这场考试下所有已上传图片、尚未批改的试卷排队。

    每份试卷仍然是一次独立调用（互不干扰、失败可单独重试），
    参考答案部分靠 DeepSeek 的前缀缓存复用，不会按份重复计费。
    """
    exam = db.get(models.Exam, exam_id)
    if exam is None:
        raise HTTPException(404, "考试不存在")

    targets = [
        s
        for s in db.query(models.Submission).filter_by(exam_id=exam_id).all()
        if s.image_paths and s.status in GRADABLE_STATUSES
    ]
    for submission in targets:
        submission.status = "pending"
    db.commit()

    for submission in targets:
        background_tasks.add_task(run_grading, submission.id)

    return {"queued": len(targets)}


@router.get("/submissions", response_model=list[schemas.SubmissionOut])
def list_submissions(exam_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Submission)
    if exam_id is not None:
        query = query.filter_by(exam_id=exam_id)
    return query.order_by(models.Submission.id).all()


@router.get("/submissions/{submission_id}", response_model=schemas.SubmissionDetailOut)
def get_submission(submission_id: int, db: Session = Depends(get_db)):
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")
    return submission


@router.get("/submissions/{submission_id}/images/{index}")
def get_submission_image(submission_id: int, index: int, db: Session = Depends(get_db)):
    """按下标取这份试卷的某一页，供教师边看原卷边复核。"""
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")
    paths = submission.image_paths or []
    if index < 0 or index >= len(paths):
        raise HTTPException(404, "页码不存在")
    return FileResponse(paths[index])


@router.post("/submissions/{submission_id}/regrade")
def regrade_submission(
    submission_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")
    if not submission.image_paths:
        raise HTTPException(400, "这份试卷还没有上传图片")

    submission.status = "pending"
    submission.total_score = None
    submission.result = None
    submission.error_message = None
    db.commit()

    background_tasks.add_task(run_grading, submission_id)
    return {"ok": True}


@router.delete("/submissions/{submission_id}")
def delete_submission(submission_id: int, db: Session = Depends(get_db)):
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")
    db.delete(submission)
    db.commit()
    return {"ok": True}
