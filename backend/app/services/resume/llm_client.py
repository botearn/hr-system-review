"""LLM client with provider abstraction.

Supports:
- ollama          (local, GLM-4-9B or any ollama model)
- zhipu           (智谱 GLM-4-Flash, free tier, OpenAI-compatible)
- deepseek        (DeepSeek chat, OpenAI-compatible)
- openai_compat   (any OpenAI-compatible endpoint via llm_base_url)

All providers return a parsed JSON dict. JSON mode is forced when available.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.core.config import settings


class LLMError(Exception):
    pass


_PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "zhipu": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "model": "glm-4-flash",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "model": "deepseek-chat",
    },
    "openai_compat": {
        "base_url": "",
        "model": "",
    },
}


def chat_json(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.1,
    timeout: float | None = None,
) -> dict[str, Any]:
    """Chat-completion with forced JSON output. Raises LLMError on any failure."""
    provider = (settings.llm_provider or "zhipu").lower()
    timeout = timeout if timeout is not None else settings.llm_timeout_seconds

    if provider == "ollama":
        return _call_ollama(prompt, system, temperature, timeout)
    if provider in ("zhipu", "deepseek", "openai_compat"):
        return _call_openai_compat(provider, prompt, system, temperature, timeout)

    raise LLMError(f"unknown LLM provider: {provider}")


def chat_text(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.3,
    timeout: float | None = None,
) -> str:
    """Chat-completion returning raw text (no JSON mode). Raises LLMError on failure."""
    provider = (settings.llm_provider or "zhipu").lower()
    timeout = timeout if timeout is not None else settings.llm_timeout_seconds

    if provider == "ollama":
        return _call_ollama_text(prompt, system, temperature, timeout)
    if provider in ("zhipu", "deepseek", "openai_compat"):
        return _call_openai_compat_text(provider, prompt, system, temperature, timeout)

    raise LLMError(f"unknown LLM provider: {provider}")


# ---------------------------------------------------------------------------
# Ollama
# ---------------------------------------------------------------------------


def _call_ollama(
    prompt: str, system: str | None, temperature: float, timeout: float
) -> dict[str, Any]:
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    body = {
        "model": settings.ollama_model,
        "messages": messages,
        "format": "json",
        "stream": False,
        "options": {"temperature": temperature},
    }

    try:
        with httpx.Client(timeout=timeout) as c:
            resp = c.post(f"{settings.ollama_base_url}/api/chat", json=body)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        raise LLMError(f"ollama request failed: {e}") from e

    raw = (data.get("message") or {}).get("content", "")
    return _parse_json(raw, provider="ollama")


# ---------------------------------------------------------------------------
# OpenAI-compatible (zhipu / deepseek / custom)
# ---------------------------------------------------------------------------


def _call_openai_compat(
    provider: str, prompt: str, system: str | None, temperature: float, timeout: float
) -> dict[str, Any]:
    defaults = _PROVIDER_DEFAULTS.get(provider, {})
    base_url = settings.llm_base_url or defaults.get("base_url") or ""
    model = settings.llm_model or defaults.get("model") or ""
    api_key = settings.llm_api_key

    if not base_url:
        raise LLMError(f"{provider} base_url not configured (set LLM_BASE_URL)")
    if not model:
        raise LLMError(f"{provider} model not configured (set LLM_MODEL)")
    if not api_key:
        raise LLMError(f"{provider} api key not configured (set LLM_API_KEY)")

    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "stream": False,
    }

    url = base_url.rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        with httpx.Client(timeout=timeout) as c:
            resp = c.post(url, json=body, headers=headers)
            if resp.status_code >= 400:
                raise LLMError(f"{provider} HTTP {resp.status_code}: {resp.text[:500]}")
            data = resp.json()
    except httpx.HTTPError as e:
        raise LLMError(f"{provider} request failed: {e}") from e

    try:
        raw = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise LLMError(f"{provider} unexpected response shape: {data}") from e

    return _parse_json(raw, provider=provider)


# ---------------------------------------------------------------------------
# Text-mode implementations (no response_format constraint)
# ---------------------------------------------------------------------------


def _call_ollama_text(prompt: str, system: str | None, temperature: float, timeout: float) -> str:
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    body = {
        "model": settings.ollama_model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature},
    }

    try:
        with httpx.Client(timeout=timeout) as c:
            resp = c.post(f"{settings.ollama_base_url}/api/chat", json=body)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        raise LLMError(f"ollama request failed: {e}") from e

    return (data.get("message") or {}).get("content", "")


def _call_openai_compat_text(
    provider: str, prompt: str, system: str | None, temperature: float, timeout: float
) -> str:
    defaults = _PROVIDER_DEFAULTS.get(provider, {})
    base_url = settings.llm_base_url or defaults.get("base_url") or ""
    model = settings.llm_model or defaults.get("model") or ""
    api_key = settings.llm_api_key

    if not base_url:
        raise LLMError(f"{provider} base_url not configured")
    if not model:
        raise LLMError(f"{provider} model not configured")
    if not api_key:
        raise LLMError(f"{provider} api key not configured")

    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    body: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": False,
    }

    url = base_url.rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        with httpx.Client(timeout=timeout) as c:
            resp = c.post(url, json=body, headers=headers)
            if resp.status_code >= 400:
                raise LLMError(f"{provider} HTTP {resp.status_code}: {resp.text[:500]}")
            data = resp.json()
    except httpx.HTTPError as e:
        raise LLMError(f"{provider} request failed: {e}") from e

    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise LLMError(f"{provider} unexpected response shape: {data}") from e


# ---------------------------------------------------------------------------
# JSON parsing helper
# ---------------------------------------------------------------------------


def _parse_json(raw: str, *, provider: str) -> dict[str, Any]:
    if not raw:
        raise LLMError(f"{provider} empty response")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        cleaned = _strip_json_fence(raw)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            raise LLMError(f"{provider} JSON parse failed: {e}; raw[:500]={raw[:500]!r}") from e


def _strip_json_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        if t.endswith("```"):
            t = t.rsplit("```", 1)[0]
    i, j = t.find("{"), t.rfind("}")
    if i >= 0 and j > i:
        return t[i : j + 1]
    return t
