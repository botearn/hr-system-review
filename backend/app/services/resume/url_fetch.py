"""URL 简历抓取：支持场景 A（公开 PDF URL）、场景 B（静态 HTML 简历页）。

场景 C（招聘平台候选人主页：BOSS、拉勾、LinkedIn）因涉及登录态、爬虫反爬
和合规风险，不自动化处理。见 docs/04-platform-scraping.md。
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.services.resume import text_extract

_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

# 已知的招聘平台域名：遇到直接拒绝处理，走人工
_PLATFORM_BLOCKLIST = {
    "zhipin.com",  # BOSS直聘
    "lagou.com",  # 拉勾
    "liepin.com",  # 猎聘
    "51job.com",  # 前程无忧
    "zhaopin.com",  # 智联
    "linkedin.com",
    "www.linkedin.com",
}


@dataclass
class FetchResult:
    source_type: str  # "url_pdf" | "url_html"
    text: str
    raw_bytes: bytes | None  # PDF 原始字节保留，供后续归档
    final_url: str


class URLFetchError(Exception):
    pass


class PlatformNotSupportedError(URLFetchError):
    """用户试图从招聘平台候选人主页抓取简历（场景 C）。"""


def fetch_resume(url: str, timeout: float = 30.0) -> FetchResult:
    _check_platform(url)

    with httpx.Client(timeout=timeout, follow_redirects=True, headers={"User-Agent": _UA}) as c:
        resp = c.get(url)
        resp.raise_for_status()
        content_type = (resp.headers.get("content-type") or "").lower()
        final_url = str(resp.url)
        body = resp.content

    if (
        "application/pdf" in content_type
        or url.lower().endswith(".pdf")
        or body.startswith(b"%PDF")
    ):
        text = text_extract.extract_pdf(body)
        return FetchResult(source_type="url_pdf", text=text, raw_bytes=body, final_url=final_url)

    if "text/html" in content_type or "application/xhtml" in content_type:
        text = text_extract.extract_html(body)
        if len(text) < 100:
            raise URLFetchError(
                f"HTML extracted text too short ({len(text)} chars), may need login"
            )
        return FetchResult(source_type="url_html", text=text, raw_bytes=None, final_url=final_url)

    raise URLFetchError(f"unsupported content-type: {content_type}")


def _check_platform(url: str) -> None:
    from urllib.parse import urlparse

    host = (urlparse(url).hostname or "").lower().lstrip(".")
    if not host:
        raise URLFetchError("invalid url")
    for blocked in _PLATFORM_BLOCKLIST:
        if host == blocked or host.endswith("." + blocked):
            raise PlatformNotSupportedError(
                f"招聘平台（{host}）候选人主页不支持自动抓取，请参考 docs/04-platform-scraping.md，"
                f"改用 PDF 下载或手动录入。"
            )
