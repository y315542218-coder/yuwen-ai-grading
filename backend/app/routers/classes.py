"""班级与学生管理：学生可以提前建好，之后直接添加进各场考试。"""

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


@router.delete("/class-groups/{class_id}")
def delete_class(class_id: int, db: Session = Depends(get_db)):
    group = db.get(models.ClassGroup, class_id)
    if group is None:
        raise HTTPException(404, "班级不存在")
    # 学生保留，只是脱离班级，避免误删掉已有成绩记录的学生
    db.query(models.Student).filter_by(class_id=class_id).update({"class_id": None})
    db.delete(group)
    db.commit()
    return {"ok": True}


@router.post("/students", response_model=schemas.StudentOut)
def create_student(payload: schemas.StudentIn, db: Session = Depends(get_db)):
    student = models.Student(**payload.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@router.post("/students/batch", response_model=list[schemas.StudentOut])
def create_students_batch(payload: schemas.StudentBatchIn, db: Session = Depends(get_db)):
    """一次录入一串姓名，方便直接粘贴班级名单。"""
    created = []
    for name in payload.names:
        name = name.strip()
        if not name:
            continue
        student = models.Student(name=name, class_id=payload.class_id)
        db.add(student)
        created.append(student)
    db.commit()
    for s in created:
        db.refresh(s)
    return created


@router.get("/students", response_model=list[schemas.StudentOut])
def list_students(class_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Student)
    if class_id is not None:
        query = query.filter_by(class_id=class_id)
    return query.order_by(models.Student.id).all()


@router.delete("/students/{student_id}")
def delete_student(student_id: int, db: Session = Depends(get_db)):
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(404, "学生不存在")
    db.delete(student)
    db.commit()
    return {"ok": True}
