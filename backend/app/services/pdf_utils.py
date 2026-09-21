"""PDF 处理：提取文字、把页面渲染成图片。

模型识别学生作答必须用图片，所以扫描版 PDF 一律转成图片再发。
用 pypdfium2 是因为它自带 PDFium 二进制，pip 装完即用，
不需要另外安装 poppler 之类的外部程序——start.bat 一键启动才不会断。
"""

from pathlib import Path

import pypdfium2 as pdfium

# 渲染倍率：PDF 默认 72dpi，乘 2 约等于 144dpi，
# 手写字迹能看清，又不会让图片大到拖慢上传。
RENDER_SCALE = 2.0

# 低于这个字数就认为是扫描件（没有文字层），走图片路线
MIN_TEXT_CHARS = 50


def is_pdf(path: Path) -> bool:
    return path.suffix.lower() == ".pdf"


def extract_text(path: Path) -> str:
    """取出 PDF 的文字层；扫描件没有文字层，会返回很短的内容甚至空串。"""
    pdf = pdfium.PdfDocument(str(path))
    try:
        parts = []
        for page in pdf:
            textpage = page.get_textpage()
            parts.append(textpage.get_text_range())
        return "\n".join(p for p in parts if p.strip())
    finally:
        pdf.close()


def render_to_images(path: Path, out_dir: Path, prefix: str = "") -> list[Path]:
    """把每一页渲染成 PNG，返回按页序排列的文件路径。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = prefix or path.stem

    pdf = pdfium.PdfDocument(str(path))
    try:
        results: list[Path] = []
        for index, page in enumerate(pdf):
            image = page.render(scale=RENDER_SCALE).to_pil()
            dest = out_dir / f"{stem}_p{index + 1:03d}.png"
            image.save(dest)
            results.append(dest)
        return results
    finally:
        pdf.close()


def has_text_layer(path: Path) -> bool:
    """参考答案用：有文字层就直接取字，省得走图片浪费 token。"""
    return len(extract_text(path).strip()) >= MIN_TEXT_CHARS
