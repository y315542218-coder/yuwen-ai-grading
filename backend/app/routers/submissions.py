import shutil
import time
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..database import get_db
from ..services import cleanup, image_utils, pdf_utils
from ..services.workflow import run_grading, summarize_sections

router = APIRouter(tags=["submissions"])

GRADABLE_STATUSES = {"draft", "pending", "failed"}


def _save_pages(file: UploadFile, target_dir: Path) -> list[str]:
    """保存一个上传文件，返回它对应的页面图片路径。

    学生作答是手写的，必须以图片交给模型，所以 PDF 一律按页渲染成图片。
    """
    target_dir.mkdir(parents=True, exist_ok=True)
    dest = target_dir / f"{int(time.time() * 1000)}_{file.filename}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    if pdf_utils.is_pdf(dest):
        pages = pdf_utils.render_to_images(dest, target_dir, dest.stem)
        if not pages:
            raise HTTPException(400, f"{file.filename} 里没有可用的页面")
        return [str(p) for p in pages]

    return [str(dest)]


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


@router.post("/exams/{exam_id}/bulk-upload", response_model=list[schemas.SubmissionOut])
def bulk_upload(exam_id: int, files: list[UploadFile], db: Session = Depends(get_db)):
    """批量导入：每张图片先各自成为一份试卷，之后可以拖拽合并、再挑学生。

    适合小测验这种"先扫一摞、回头再对人"的场景。
    """
    exam = db.get(models.Exam, exam_id)
    if exam is None:
        raise HTTPException(404, "考试不存在")

    settings = get_settings()
    created: list[models.Submission] = []
    for file in files:
        submission = models.Submission(exam_id=exam_id, image_paths=[], status="draft")
        db.add(submission)
        db.flush()

        target_dir = settings.storage_dir / "submissions" / str(exam_id) / str(submission.id)
        # 一个多页 PDF 视为同一份试卷；若其实是整班扫在一起，用"拆分"按钮拆开即可
        submission.image_paths = _save_pages(file, target_dir)
        submission.status = "pending"
        created.append(submission)

    db.commit()
    for s in created:
        db.refresh(s)
    return created


@router.post("/submissions/{submission_id}/merge", response_model=schemas.SubmissionOut)
def merge_submissions(
    submission_id: int, payload: schemas.MergeIn, db: Session = Depends(get_db)
):
    """把若干份试卷的图片并入这一份，按传入顺序追加到末尾，原记录随后删除。"""
    target = db.get(models.Submission, submission_id)
    if target is None:
        raise HTTPException(404, "记录不存在")

    paths = list(target.image_paths or [])
    for source_id in payload.source_ids:
        if source_id == submission_id:
            continue
        source = db.get(models.Submission, source_id)
        if source is None:
            raise HTTPException(404, f"记录 {source_id} 不存在")
        if source.exam_id != target.exam_id:
            raise HTTPException(400, "不能合并不同考试的试卷")
        paths.extend(source.image_paths or [])
        db.delete(source)

    target.image_paths = paths
    target.status = "pending" if paths else "draft"
    # 页数变了，之前的批改结果作废
    target.result = None
    target.total_score = None
    db.commit()
    db.refresh(target)
    return target


@router.post("/submissions/{submission_id}/split", response_model=list[schemas.SubmissionOut])
def split_submission(submission_id: int, db: Session = Depends(get_db)):
    """把一份多页试卷拆成每页一份。

    整班扫进同一个 PDF 时用得上：先拆开，再按学生拖拽合并。
    """
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")

    paths = list(submission.image_paths or [])
    if len(paths) < 2:
        raise HTTPException(400, "只有一页，无需拆分")

    submission.image_paths = [paths[0]]
    submission.result = None
    submission.total_score = None
    submission.status = "pending"

    created = [submission]
    for path in paths[1:]:
        extra = models.Submission(
            exam_id=submission.exam_id,
            image_paths=[path],
            status="pending",
        )
        db.add(extra)
        created.append(extra)

    db.commit()
    for s in created:
        db.refresh(s)
    return created


@router.patch("/submissions/{submission_id}", response_model=schemas.SubmissionOut)
def update_submission(
    submission_id: int, payload: schemas.SubmissionUpdateIn, db: Session = Depends(get_db)
):
    """指定或取消这份试卷对应的学生。"""
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")

    data = payload.model_dump(exclude_unset=True)
    if "student_id" in data:
        student_id = data["student_id"]
        if student_id is None:
            submission.student_id = None
            submission.student_name = None
        else:
            student = db.get(models.Student, student_id)
            if student is None:
                raise HTTPException(404, "学生不存在")
            submission.student_id = student_id
            submission.student_name = student.name
    if "student_name" in data and data.get("student_id") is None:
        submission.student_name = data["student_name"]

    db.commit()
    db.refresh(submission)
    return submission


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

    paths = list(submission.image_paths or [])
    for file in files:
        paths.extend(_save_pages(file, target_dir))

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
    freed = cleanup.remove_files(submission.image_paths or [])
    cleanup.remove_tiles(submission_id)
    submission.image_paths = []
    submission.status = "draft"
    submission.result = None
    submission.total_score = None
    db.commit()
    return {"ok": True, "freed_bytes": freed}


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
def get_submission_image(
    submission_id: int, index: int, thumb: bool = False, db: Session = Depends(get_db)
):
    """按下标取这份试卷的某一页，供教师边看原卷边复核。

    thumb=true 返回缩略图：列表页每张卡片直接加载原图会让页面卡住。
    """
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")
    paths = submission.image_paths or []
    if index < 0 or index >= len(paths):
        raise HTTPException(404, "页码不存在")

    if thumb:
        cache = get_settings().storage_dir / "thumbs" / str(submission_id)
        try:
            return FileResponse(image_utils.thumbnail(paths[index], cache))
        except OSError:
            # 原图损坏或缺失时退回原图，让浏览器自己报错，而不是整页500
            pass
    return FileResponse(paths[index])


@router.patch("/submissions/{submission_id}/score", response_model=schemas.SubmissionDetailOut)
def update_scores(
    submission_id: int, payload: schemas.ScoreUpdateIn, db: Session = Depends(get_db)
):
    """教师手动改分：覆盖AI给的分数，并重算总分。

    改过的题会标 manual_adjusted，方便事后区分哪些分是人工定的。
    """
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "记录不存在")
    result = dict(submission.result or {})
    if not result:
        raise HTTPException(400, "这份试卷还没有批改结果")

    questions = [dict(q) for q in result.get("questions") or []]
    for item in payload.questions:
        if item.index < 0 or item.index >= len(questions):
            raise HTTPException(400, f"题目下标 {item.index} 不存在")
        q = questions[item.index]
        max_score = float(q.get("max_score") or 0)
        if item.score < 0 or item.score > max_score:
            raise HTTPException(400, f"第 {item.index + 1} 题分数必须在 0~{max_score} 之间")
        q["score"] = item.score
        if item.reason is not None:
            q["reason"] = item.reason
        if item.reference_answer is not None:
            q["reference_answer"] = item.reference_answer
        q["manual_adjusted"] = True
        # 人工已经定分，不必再提示复核
        q["manual_review"] = False
    result["questions"] = questions

    essay = dict(result.get("essay") or {}) if result.get("essay") else None
    if payload.essay_score is not None:
        if essay is None:
            raise HTTPException(400, "这份试卷没有作文部分")
        essay_max = float(essay.get("max_score") or 0)
        if payload.essay_score < 0 or payload.essay_score > essay_max:
            raise HTTPException(400, f"作文分数必须在 0~{essay_max} 之间")
        essay["score"] = payload.essay_score
        essay["manual_adjusted"] = True
        result["essay"] = essay

    total = sum(float(q.get("score") or 0) for q in questions)
    if essay:
        total += float(essay.get("score") or 0)
    result["total_score"] = total
    result["sections"] = summarize_sections(questions, essay)

    submission.result = result
    submission.total_score = total
    db.commit()
    db.refresh(submission)
    return submission


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
    freed = cleanup.remove_files(submission.image_paths or [])
    cleanup.remove_tiles(submission_id)
    db.delete(submission)
    db.commit()
    return {"ok": True, "freed_bytes": freed}
