"""磁盘清理。

两类垃圾：
1. 切块图——高清识别模式下每页要切十几块，批改完就没用了，但每次重批都会重新生成。
2. 孤儿文件——删除试卷或清空图片时只动了数据库，磁盘上的图片留了下来。
   一份扫描件将近 10MB，反复上传几次就是几百 MB。
"""

import json
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings


def tile_dir(submission_id: int) -> Path:
    return get_settings().storage_dir / "tiles" / str(submission_id)


def remove_tiles(submission_id: int) -> None:
    """删掉某份试卷的切块图。批改结束后调用——它们只在调模型那一刻有用。"""
    shutil.rmtree(tile_dir(submission_id), ignore_errors=True)


def remove_files(paths: list[str]) -> int:
    """删除指定文件，返回释放的字节数。文件不在了也不报错。"""
    freed = 0
    for path in paths:
        p = Path(path)
        try:
            if p.is_file():
                freed += p.stat().st_size
                p.unlink()
        except OSError:
            # 文件被占用或权限不足时跳过，清理不该让主流程失败
            continue
    return freed


def _referenced_paths(db: Session) -> set[Path]:
    used: set[Path] = set()
    for (paths,) in db.query(models.Submission.image_paths).all():
        for p in paths or []:
            used.add(Path(p).resolve())
    for (images,) in db.query(models.Exam.reference_images).all():
        for p in images or []:
            used.add(Path(p).resolve())
    return used


def scan_orphans(db: Session) -> tuple[list[Path], int]:
    """找出磁盘上没有任何记录引用的文件，返回（文件列表，总字节数）。

    tiles 目录整体算可回收，不参与引用判断——它本来就是临时产物。
    """
    storage = get_settings().storage_dir
    used = _referenced_paths(db)

    orphans: list[Path] = []
    total = 0
    for path in storage.rglob("*"):
        if not path.is_file():
            continue
        resolved = path.resolve()
        if resolved in used:
            continue
        orphans.append(resolved)
        try:
            total += path.stat().st_size
        except OSError:
            pass
    return orphans, total


def storage_usage(db: Session) -> dict:
    orphans, orphan_bytes = scan_orphans(db)
    storage = get_settings().storage_dir
    total = sum(p.stat().st_size for p in storage.rglob("*") if p.is_file())
    return {
        "total_bytes": total,
        "orphan_bytes": orphan_bytes,
        "orphan_count": len(orphans),
    }
