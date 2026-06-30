"""从企业官网 URL 或企业介绍 PDF 中提取企业信息（调 LLM）。

复用 resume 模块的 url_fetch（场景 A: 公开 PDF，场景 B: 静态 HTML）。
"""

from __future__ import annotations

from app.services.resume.llm_client import chat_json
from app.services.resume.url_fetch import URLFetchError, fetch_resume

_SYSTEM = """你是一名资深猎头顾问的助理，负责从企业官网或企业介绍资料中抽取标准化的企业信息。
只输出 JSON，不要 markdown 代码块，不要额外说明。未知字段填 null。"""


def _prompt(text: str, final_url: str) -> str:
    return f"""请从以下企业官网/介绍文本中抽取企业信息：

来源 URL：{final_url}

输出 JSON：
{{
  "name": "企业名称（中文优先）",
  "industry_tags": ["所属领域关键词数组，如：通用AI、AI医疗、大模型、自动驾驶、AI教育"],
  "scale": "企业规模，从 '<20' / '20-100' / '100-500' / '500+' 中选一个，未知填 null",
  "funding_stage": "融资阶段，从 seed/A/B/C/D+/IPO/self 中选一个",
  "address": "办公地址",
  "website": "官网 URL（一般就是来源）",
  "contact_name": "联系人",
  "contact_phone": "联系电话",
  "contact_email": "联系邮箱",
  "notes": "一句话总结企业的主营业务和差异化优势，约50字"
}}

【文本开始】
{text[:8000]}
【文本结束】

只输出 JSON："""


def extract_from_url(url: str) -> dict:
    """抓 URL → 调 LLM → 返回结构化 company 草稿。

    Raises:
        URLFetchError: 抓取失败或命中平台黑名单
        LLMError: LLM 调用或 JSON 解析失败
    """
    result = fetch_resume(url)  # 复用：支持 PDF + HTML，拦截招聘平台
    if len(result.text) < 100:
        raise URLFetchError(
            f"抓到的文本过短（{len(result.text)} 字符），可能需要登录或页面为动态渲染。"
            "可以尝试下载企业介绍 PDF 后走文件上传。"
        )
    data = chat_json(_prompt(result.text, result.final_url), system=_SYSTEM)

    # 清洗返回的字段（过滤掉非预期字段）
    allowed = {
        "name",
        "industry_tags",
        "scale",
        "funding_stage",
        "address",
        "website",
        "contact_name",
        "contact_phone",
        "contact_email",
        "notes",
    }
    cleaned = {k: v for k, v in data.items() if k in allowed}
    # website 兜底：用最终落地 URL
    cleaned.setdefault("website", result.final_url)
    if not cleaned.get("website"):
        cleaned["website"] = result.final_url
    # industry_tags 规范化
    tags = cleaned.get("industry_tags")
    if isinstance(tags, str):
        cleaned["industry_tags"] = [t.strip() for t in tags.split(",") if t.strip()]
    elif not isinstance(tags, list):
        cleaned["industry_tags"] = []
    return cleaned
