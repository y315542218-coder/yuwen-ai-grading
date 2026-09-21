"""单场考试的成绩统计。

纯计算，不调模型。难点在于逐题汇总：每份试卷是独立批改的，
模型给出的题号写法并不稳定（同一道题可能写成"二、1"或"二、选择题1"），
所以按题目在列表中的**位置**对齐，题号取该位置上出现最多的写法。
题目数量与多数人不一致的试卷会被排除在逐题统计之外，并如实报出来。
"""

from collections import Counter
from statistics import mean, median


def _score_band(rate: float) -> str:
    if rate >= 0.9:
        return "优秀(90%+)"
    if rate >= 0.8:
        return "良好(80-89%)"
    if rate >= 0.7:
        return "中等(70-79%)"
    if rate >= 0.6:
        return "及格(60-69%)"
    return "不及格(<60%)"


def build_statistics(exam, submissions: list) -> dict:
    graded = [s for s in submissions if s.status == "completed" and s.result]
    total_possible = float(exam.total_score or 0)

    if not graded:
        return {
            "exam_name": exam.name,
            "total_score": total_possible,
            "submission_count": len(submissions),
            "graded_count": 0,
            "questions": [],
            "students": [],
        }

    scores = [float(s.total_score or 0) for s in graded]

    # 逐题按位置对齐；只统计题数与多数人一致的试卷
    counts = Counter(len(s.result.get("questions") or []) for s in graded)
    common_count = counts.most_common(1)[0][0]
    comparable = [s for s in graded if len(s.result.get("questions") or []) == common_count]

    # 及格率等比例以"试卷实际满分"为分母：建考试时总分常留着默认的100，
    # 而小测验实际可能只有20分，用配置值算会得出及格率0%这种误导结论。
    actual_total = 0.0
    if comparable:
        sample = comparable[0].result
        actual_total = sum(
            float(q.get("max_score") or 0) for q in sample.get("questions") or []
        )
        actual_total += float((sample.get("essay") or {}).get("max_score") or 0)
    denominator = actual_total or total_possible
    total_mismatch = bool(actual_total and total_possible and actual_total != total_possible)

    bands = Counter(_score_band(sc / denominator if denominator else 0) for sc in scores)

    questions = []
    for i in range(common_count):
        items = [s.result["questions"][i] for s in comparable]
        max_score = max(float(q.get("max_score") or 0) for q in items)
        got = [float(q.get("score") or 0) for q in items]
        labels = Counter(q.get("question_no") or "" for q in items)
        sections = Counter(q.get("section") or "" for q in items)

        # 失分者的扣分原因，取最常见的几条，用来看共性问题
        reasons = [
            (q.get("reason") or "").strip()
            for q in items
            if float(q.get("score") or 0) < float(q.get("max_score") or 0)
        ]
        questions.append(
            {
                "index": i,
                "question_no": labels.most_common(1)[0][0],
                "section": sections.most_common(1)[0][0],
                "max_score": max_score,
                "avg_score": round(mean(got), 2),
                "score_rate": round(mean(got) / max_score, 3) if max_score else None,
                "full_marks": sum(1 for g in got if max_score and g >= max_score),
                "zero_marks": sum(1 for g in got if g == 0),
                "common_reasons": [r for r, _ in Counter(reasons).most_common(3) if r],
            }
        )

    essays = [s.result.get("essay") for s in graded if s.result.get("essay")]
    essay_stats = None
    if essays:
        e_scores = [float(e.get("score") or 0) for e in essays]
        e_max = max(float(e.get("max_score") or 0) for e in essays)
        problems = Counter(
            p.strip() for e in essays for p in (e.get("problems") or []) if p and p.strip()
        )
        essay_stats = {
            "avg_score": round(mean(e_scores), 2),
            "max_score": e_max,
            "score_rate": round(mean(e_scores) / e_max, 3) if e_max else None,
            "common_problems": [p for p, _ in problems.most_common(5)],
        }

    students = sorted(
        (
            {
                "submission_id": s.id,
                "name": s.student_name or f"#{s.id}",
                "score": float(s.total_score or 0),
                "rate": round(float(s.total_score or 0) / denominator, 3)
                if denominator
                else None,
            }
            for s in graded
        ),
        key=lambda x: x["score"],
        reverse=True,
    )

    pass_line = denominator * 0.6
    excellent_line = denominator * 0.9
    return {
        "exam_name": exam.name,
        # configured 是建考试时填的总分，actual 是从批改结果里实际加出来的满分
        "total_score": denominator,
        "configured_total": total_possible,
        "total_mismatch": total_mismatch,
        "submission_count": len(submissions),
        "graded_count": len(graded),
        "comparable_count": len(comparable),
        "avg_score": round(mean(scores), 2),
        "median_score": round(median(scores), 2),
        "max_score_got": max(scores),
        "min_score_got": min(scores),
        "pass_rate": round(sum(1 for s in scores if s >= pass_line) / len(scores), 3),
        "excellent_rate": round(sum(1 for s in scores if s >= excellent_line) / len(scores), 3),
        "bands": dict(bands),
        "questions": questions,
        "essay": essay_stats,
        "students": students,
    }
