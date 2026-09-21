"""把整页扫描件切成小块，供模型高清识别。

多模态接口普遍会把大图压缩到一个像素上限（DeepSeek 约 1300x1300）。
一张 4491x3173 的试卷整页发过去会被缩到 34%，括号里的拼音、
被圈划的小字就糊了。按上限把页面切块后，每块都在上限之内不被压缩，
等于把有效分辨率提上去。
"""

from pathlib import Path

from PIL import Image

# DeepSeek 的图像像素上限（约 1300x1300）。留 5% 余量，避免边界情况仍被压缩。
MAX_PIXELS = int(1300 * 1300 * 0.95)

# 相邻块之间的重叠比例：一个圈或斜线正好压在切割线上时，
# 至少能在某一块里看到完整形状。
OVERLAP = 0.08


THUMB_WIDTH = 480


def thumbnail(image_path: str | Path, cache_dir: Path) -> Path:
    """生成并缓存缩略图。

    列表页每张卡片直接加载原图（一张扫描件近10MB），20份就是200MB，页面会卡住。
    缩略图按需生成一次，之后复用。
    """
    path = Path(image_path)
    cache_dir.mkdir(parents=True, exist_ok=True)
    dest = cache_dir / f"{path.stem}_thumb.jpg"

    # 原图更新过（重新上传同名文件）就重新生成
    if dest.exists() and dest.stat().st_mtime >= path.stat().st_mtime:
        return dest

    with Image.open(path) as im:
        im = im.convert("RGB")
        ratio = THUMB_WIDTH / im.width
        if ratio < 1:
            im = im.resize((THUMB_WIDTH, round(im.height * ratio)), Image.LANCZOS)
        im.save(dest, "JPEG", quality=80)
    return dest


def plan_grid(width: int, height: int, max_pixels: int = MAX_PIXELS) -> tuple[int, int]:
    """算出切成几列几行，使每块像素数不超过上限，且尽量接近正方形。"""
    cols = rows = 1
    while (width / cols) * (height / rows) > max_pixels:
        if width / cols >= height / rows:
            cols += 1
        else:
            rows += 1
    return cols, rows


def split_for_vision(
    image_path: str | Path, out_dir: Path, max_pixels: int = MAX_PIXELS
) -> list[Path]:
    """按阅读顺序（从左到右、从上到下）切块，返回各块图片路径。

    图片本身就小于上限时返回空列表——没必要切。
    """
    path = Path(image_path)
    with Image.open(path) as im:
        im = im.convert("RGB")
        width, height = im.size
        if width * height <= max_pixels:
            return []

        # 每块四周还要外扩 OVERLAP，面积会涨 (1+2*OVERLAP)^2 倍，
        # 规划网格时先把这部分预算扣掉，否则切完仍旧超限被压缩。
        growth = (1 + 2 * OVERLAP) ** 2
        cols, rows = plan_grid(width, height, int(max_pixels / growth))
        tile_w, tile_h = width / cols, height / rows
        pad_x, pad_y = tile_w * OVERLAP, tile_h * OVERLAP

        out_dir.mkdir(parents=True, exist_ok=True)
        results: list[Path] = []
        for r in range(rows):
            for c in range(cols):
                left = max(0, int(c * tile_w - pad_x))
                top = max(0, int(r * tile_h - pad_y))
                right = min(width, int((c + 1) * tile_w + pad_x))
                bottom = min(height, int((r + 1) * tile_h + pad_y))

                dest = out_dir / f"{path.stem}_r{r + 1}c{c + 1}.png"
                im.crop((left, top, right, bottom)).save(dest)
                results.append(dest)
        return results
