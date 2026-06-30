"""让 LLM 从岗位职责/要求中提炼 required_capabilities。

在岗位创建或 responsibilities/requirements 更新时由 BackgroundTasks 触发。
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.position import Position
from app.services.resume.llm_client import LLMError, chat_json

_SYSTEM = """你是一名资深AI猎头顾问。根据岗位职责和任职要求，提炼出该岗位需要候选人
具备的"能力"（capability）列表，区分"必须具备（must）"和"加分项（nice）"。

能力要具体、可验证：
- "大规模分布式训练（多机多卡）"  ✓
- "端到端CV推理pipeline部署（TensorRT）"  ✓
- "Python 编程"  ✗（这是技能，不是能力）

只输出 JSON。"""


def _prompt(title: str, responsibilities: str | None, requirements: str | None) -> str:
    return f"""岗位标题：{title}

【岗位职责】
{responsibilities or "（未填写）"}

【任职要求】
{requirements or "（未填写）"}

请提炼这个岗位需要的能力列表，按下面格式输出：

{{
  "capabilities": [
    {{"capability": "具体能力描述", "priority": "must"}},
    {{"capability": "另一项能力", "priority": "nice"}}
  ]
}}

priority 只能是 "must"（硬性要求）或 "nice"（加分项）。现在输出 JSON："""


def derive_for_position(position_id: int) -> None:
    db: Session = SessionLocal()
    try:
        pos = db.get(Position, position_id)
        if not pos:
            return
        if pos.responsibilities or pos.requirements:
            try:
                result = chat_json(
                    _prompt(pos.title, pos.responsibilities, pos.requirements),
                    system=_SYSTEM,
                )
                caps = result.get("capabilities") or []
                pos.required_capabilities = caps
                db.commit()
            except LLMError as e:
                print(f"[position_capability] position {position_id} LLM failed: {e}")

    finally:
        db.close()

    # capability 结果已写入（或降级），再同步向量化
    from app.services.vectorize import vectorize_position

    try:
        vectorize_position(position_id)
    except Exception as e:
        print(f"[position_capability] vectorize_position({position_id}) failed: {e}")
