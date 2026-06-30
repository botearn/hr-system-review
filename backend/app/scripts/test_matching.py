"""自动化匹配测试：对每个开放岗位跑一次匹配，打印 TopN 并验证区分度。

预期（seed_demo 数据集）：
  1. 高级AI算法工程师（多模态大模型）  → 张三 (8yrs 多模态) 应该第一
  2. AI 产品经理                        → 李四 (AI PM) 应该第一
  3. 计算机视觉算法专家（自动驾驶）     → 王五 (BEV + 自动驾驶) 应该第一
  4. 医疗 NLP 高级算法工程师            → 赵六 (医疗 NLP 负责人) 应该第一
  5. 大模型推理优化工程师               → 孙八 (推理引擎优化) 应该第一

钱七（金融科技机器学习）应该在所有岗位里都不是最高分。

用法：
    cd backend
    python -m app.scripts.test_matching
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.position import Position
from app.services.matcher import DEFAULT_WEIGHTS, run_matching


def _bar(score: float, width: int = 20) -> str:
    n = int(round(score / 100 * width))
    return "█" * n + "·" * (width - n)


def run() -> None:
    db: Session = SessionLocal()
    try:
        positions = db.query(Position).filter(Position.status == "open").order_by(Position.id).all()
        if not positions:
            print("没有 open 的岗位。请先运行 python -m app.scripts.seed_demo")
            return

        for pos in positions:
            print(f"\n{'=' * 80}")
            print(
                f"岗位 #{pos.id}  {pos.title}  [{pos.city or '未填'} / {pos.min_years}-{pos.max_years}年 / {pos.salary_min}-{pos.salary_max}k]"
            )
            print("=" * 80)
            results = run_matching(db, pos.id, top_k=50, limit=10, weights=DEFAULT_WEIGHTS)
            if not results:
                print("  无匹配（候选人向量可能还没生成）")
                continue

            for i, r in enumerate(results, 1):
                bar = _bar(r.score)
                print(
                    f"  #{i}  {r.candidate_name:<6}  {r.score:>5.1f}  {bar}  "
                    f"(能力 {r.sub_scores.get('capability', 0):.0f} | "
                    f"技能 {r.sub_scores.get('skill', 0):.0f} | "
                    f"薪资 {r.sub_scores.get('salary', 0):.0f} | "
                    f"行业 {r.sub_scores.get('industry', 0):.0f})"
                )
                if r.matched_points:
                    print(f"         ✓ {r.matched_points[0]['detail']}")
                if r.gap_points:
                    print(f"         ✗ {r.gap_points[0]['detail']}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
