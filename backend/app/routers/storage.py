"""磁盘占用查看与清理。"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..services import cleanup

router = APIRouter(prefix="/storage", tags=["storage"])


@router.get("")
def usage(db: Session = Depends(get_db)):
    """当前占用，以及其中有多少是可回收的孤儿文件。"""
    return cleanup.storage_usage(db)


@router.post("/cleanup")
def run_cleanup(db: Session = Depends(get_db)):
    """删除所有没有被任何记录引用的文件。"""
    orphans, _ = cleanup.scan_orphans(db)
    freed = cleanup.remove_files([str(p) for p in orphans])
    return {"removed_count": len(orphans), "freed_bytes": freed}
