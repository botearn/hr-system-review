"""简历解析三类 prompt：结构化抽取、能力提炼、质量评分。"""

from __future__ import annotations

EXTRACT_SYSTEM = """你是一名资深AI猎头顾问的助理，负责把候选人简历文本解析成严格的 JSON 结构。
只输出 JSON，不要任何额外说明、不要 markdown 代码块。
未知字段一律填 null，列表字段未知填 []。所有日期用 YYYY-MM-DD 或 YYYY-MM 格式。
薪资字段单位：k元/月（千元/月），12 表示 12k/月。"""


def extract_prompt(resume_text: str) -> str:
    return f"""请从以下简历文本中抽取结构化信息，按下面的 JSON schema 输出：

{{
  "name": "姓名",
  "phone": "手机号",
  "email": "邮箱",
  "wechat": "微信号",
  "city": "所在城市",
  "industry": "主要行业（如：通用AI、AI医疗、自动驾驶、AI教育等）",
  "years_of_experience": 工作年限整数,
  "education_level": "最高学历（高中/专科/本科/硕士/博士）",
  "current_salary_min": 当前薪资下限数字(单位k/月),
  "current_salary_max": 当前薪资上限数字,
  "expected_salary_min": 期望薪资下限数字,
  "expected_salary_max": 期望薪资上限数字,
  "skills": ["技能标签1", "技能标签2", ...],
  "experiences": [
    {{
      "company_name": "公司名",
      "position_title": "职位",
      "start_date": "2021-03",
      "end_date": "2024-06 或 null(至今)",
      "description": "工作内容描述"
    }}
  ],
  "projects": [
    {{
      "project_name": "项目名",
      "role": "角色",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "description": "项目描述",
      "tech_stack": ["技术1", "技术2"]
    }}
  ],
  "educations": [
    {{
      "school": "学校",
      "degree": "本科/硕士/博士",
      "major": "专业",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM"
    }}
  ]
}}

【简历文本开始】
{resume_text}
【简历文本结束】

现在输出 JSON："""


DERIVE_CAPABILITY_SYSTEM = """你是一名资深AI猎头顾问。你要从候选人的"工作经历"和"项目经历"中，
提炼出他真正具备的"能力"（capability），而不是简单罗列他声称的技能标签。

能力要具体、可验证，例子：
- "大规模分布式训练（多机多卡）"  ✓
- "多模态大模型的 SFT 和 RLHF 调优"  ✓
- "端到端CV推理pipeline设计与优化（TensorRT）"  ✓
- "Python"  ✗（这是技能，不是能力）

每条能力必须引用对应的经历/项目作为证据。只输出 JSON。"""


def derive_capability_prompt(experiences: list, projects: list) -> str:
    import json

    return f"""根据以下工作经历和项目经历，提炼出候选人的真实能力列表。

【工作经历】
{json.dumps(experiences, ensure_ascii=False, indent=2)}

【项目经历】
{json.dumps(projects, ensure_ascii=False, indent=2)}

输出格式：
{{
  "capabilities": [
    {{
      "capability": "具体能力描述",
      "evidence_ref": "e.g. 经历#1 / 项目#2",
      "evidence_detail": "这条能力体现在该经历/项目的哪个具体事实上"
    }}
  ]
}}

请尽量全面提炼，但每条都要有具体证据。现在输出 JSON："""


QUALITY_SYSTEM = """你是一名严格的简历审阅顾问。你需要对候选人简历的"书写质量"做客观评分，
三个维度各占三分之一权重：
  1. 描述详尽度（detail）：每段经历是否有项目背景、技术栈、具体产出
  2. 因果/动机说明（causality）：是否解释了为什么做这个选择、解决了什么问题
  3. 实例与量化（evidence）：是否有具体的成果数字（QPS/MAU/准确率/提升百分比等）

每个维度打 0-100 分。只输出 JSON。"""


def quality_prompt(resume_text: str) -> str:
    return f"""请对以下简历的书写质量进行三维评分，输出 JSON：

{{
  "dimensions": {{
    "detail":    {{"score": 0-100, "comment": "描述详尽度评语"}},
    "causality": {{"score": 0-100, "comment": "因果动机说明评语"}},
    "evidence":  {{"score": 0-100, "comment": "实例量化评语"}}
  }},
  "overall_comment": "整体评语（一句话）"
}}

最终 score 由后端取三维平均，不用你给。

【简历文本】
{resume_text}

现在输出 JSON："""
