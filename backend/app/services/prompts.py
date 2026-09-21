"""批改用的提示词。

评分规则来自《语文试卷AI批改工作流与评分规范_V1.0.md》——
这些规则是给模型遵守的，所以写在 prompt 里，程序不去实现它们。
要调整评分尺度，改这里的文字即可。
"""

from __future__ import annotations

GRADING_SYSTEM_PROMPT = """你是一名语文试卷批改老师。教师会给你一份参考答案和一名学生的试卷扫描件（可能有多张图片，按顺序为同一份试卷的不同页面）。

请依据参考答案批改整份试卷，并遵守以下规则：

1. 先看清学生写了什么，再判断对错；不得因为字迹不清就猜测答案。
2. 图片中黑色/蓝色笔迹是学生作答，红色是教师已有的批改痕迹。首次评分不得参考教师的红笔对错和分数。
3. 客观题（选择、判断、看拼音写词语、古诗文填空）按参考答案严格判断，错别字不得自动更正后再算对。
4. 主观题按参考答案的得分点逐条判断学生覆盖了哪些、缺了哪些、有没有错误表述；
   学生用词与参考答案不同但意思一致的，可以给分；不要只比较字面相似度。
5. 要判断学生是否回答了题目真正问的问题——答案内容正确但答非所问，不能给分。
6. 参考答案写明"言之有理即可"的题，采取宽松评分。
7. 作文单独评分：先看审题、中心、内容、结构、语言、情感，再定分数，不要先拍一个分数再找理由。
8. 每一处扣分都要写明原因，分数不得超过该题满分。
9. 字迹模糊、涂改严重、无法确认的题目，标记为需要人工复核，不要硬给分。
10. 参考答案没有规定的评分细则（例如错一个字扣多少分），不要自己编，标记出来让教师确认。
11. 题目在括号里印了多个读音或汉字供选择时（例如"捆扎（zā zhā）"、"古书（籍 藉）"），
    学生是在印刷选项上做记号来作答的，不是另外写字。要特别注意：
    - 圈、点、对勾 表示选中这一项；斜线、横线、叉 表示划去这一项，两者含义相反。
    - 必须先看清题目要求的是"圈出正确的"还是"划去错误的"，据此推断学生的答案。
    - 记号很淡或压在两个选项中间、无法确定落在哪一项时，一律标记人工复核，不要猜。

只返回JSON，不要输出多余的说明文字。
"""


def build_grading_user_prompt(
    exam_name: str,
    total_score: float,
    reference_text: str | None,
    grading_notes: str | None,
    reference_image_count: int,
    answer_key: list | None = None,
    tiled: bool = False,
) -> str:
    """同一场考试的每个学生，这段文字必须完全一致。

    DeepSeek 按前缀命中缓存，参考答案又是整个请求里最长的固定内容，
    所以这里不能掺入学生姓名、页数等因人而异的信息，否则每份试卷都
    变成缓存未命中，价格差 50 倍。学生的图片一律拼在最后。
    """
    parts = [f"试卷名称：{exam_name}", f"试卷总分：{total_score}"]

    if answer_key:
        lines = [
            f"- {item.get('question_no', '')}（{item.get('max_score', '')}分）："
            f"{item.get('reference_answer', '')}"
            for item in answer_key
        ]
        parts.append(
            "\n教师核对过的逐题参考答案（**权威**，与下方原文冲突时以这里为准）：\n"
            + "\n".join(lines)
        )

    if reference_text:
        parts.append(f"\n参考答案（文本）：\n{reference_text}")
    if reference_image_count:
        parts.append(f"\n前 {reference_image_count} 张图片是参考答案。")
    if grading_notes:
        parts.append(f"\n教师补充的评分说明：\n{grading_notes}")

    if tiled:
        parts.append(
            "\n其余图片是同一名学生的整份试卷。每一页先给整页图，紧接着是这一页切成的若干高清分块"
            "（按从左到右、从上到下排列，相邻块有重叠）。整页图用来把握版面和题目位置，"
            "分块图用来看清笔迹细节——括号里的读音、被圈或被划掉的字，要以分块图为准。"
            "同一处内容在整页图和分块图里重复出现，不要因此重复计分。"
        )
    else:
        parts.append("\n其余图片是同一名学生的整份试卷，按页面顺序排列，请整份批改。")

    parts.append(
        """
请返回如下JSON结构：
{
  "student_name": "如果试卷上写了姓名就填，看不清就留空",
  "questions": [
    {
      "question_no": "题号",
      "section": "所属大题，例如 积累运用",
      "student_answer": "识别到的学生作答",
      "reference_answer": "参考答案",
      "score": 0,
      "max_score": 0,
      "reason": "得分或扣分的具体原因",
      "manual_review": false
    }
  ],
  "essay": {
    "score": 0,
    "max_score": 0,
    "strengths": ["具体优点"],
    "problems": ["具体问题"],
    "suggestions": ["具体、可执行的修改建议，不要写多读书多练习这类空话"]
  },
  "notes": ["需要教师确认的评分细则，或其它需要说明的情况"]
}

questions 里只列出所有客观题和主观题，作文放在 essay 里。
如果这份试卷没有作文，essay 填 null。
不要输出总分和各大题小计，这些由程序根据逐题分数自动汇总。
"""
    )

    return "\n".join(parts)
