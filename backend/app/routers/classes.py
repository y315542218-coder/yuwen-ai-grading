"""班级系统（中优先级 / P1）：先给最基础的班级、学生管理和试卷-学生绑定，
后续的成绩趋势、班级统计在此基础上扩展。
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(tags=["classes"])


@router.post("/class-groups", response_model=schemas.ClassGroupOut)
def create_class(payload: schemas.ClassGroupIn, db: Session = Depends(get_db)):
    group = models.ClassGroup(name=payload.name)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.get("/class-groups", response_model=list[schemas.ClassGroupOut])
def list_classes(db: Session = Depends(get_db)):
    return db.query(models.ClassGroup).all()


@router.post("/students", response_model=schemas.StudentOut)
def create_student(payload: schemas.StudentIn, db: Session = Depends(get_db)):
    student = models.Student(**payload.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@router.get("/students", response_model=list[schemas.StudentOut])
def list_students(class_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Student)
    if class_id is not None:
        query = query.filter_by(class_id=class_id)
    return query.all()


@router.post("/submissions/{submission_id}/assign-student")
def assign_student(submission_id: int, student_id: int, db: Session = Depends(get_db)):
    """教师把一份试卷和学生一一对应后，成绩就计入该学生的历史记录。"""
    submission = db.get(models.Submission, submission_id)
    if submission is None:
        raise HTTPException(404, "试卷记录不存在")
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(404, "学生不存在")

    submission.student_id = student_id
    db.commit()
    return {"ok": True}
