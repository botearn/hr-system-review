"""Embedding service with provider abstraction.

Providers (selected by `settings.embedding_provider`):
- "local"        : sentence-transformers (bge-m3), ~2GB model loaded in memory
- "zhipu"        : 智谱 embedding-3 REST API（免费，需要 LLM_API_KEY）
- "openai_compat": any OpenAI-compatible embeddings endpoint

All providers return L2-normalized 1024-dim vectors (matches pgvector column size).
When using Zhipu embedding-3 we explicitly pass dimensions=1024 so the output
matches the schema created by the alembic migration.
"""

from __future__ import annotations

import threading
from typing import Any

import httpx

from app.core.config import settings

VECTOR_SIZE = 1024

_model: Any = None
_lock = threading.Lock()

# Process-wide cache for embeddings keyed by raw text. The same capability
# name / skill string is embedded many times per matching call (once per
# candidate, plus position vectors); without this cache each batch costs an
# HTTP roundtrip to Zhipu. Keep a hard cap so long-running processes don't
# leak memory.
_TEXT_CACHE: dict[str, list[float]] = {}
_TEXT_CACHE_MAX = 4096
_CACHE_LOCK = threading.Lock()

_PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "zhipu": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "model": "embedding-3",
    },
}


class EmbeddingError(Exception):
    pass


def embed(texts: str | list[str]) -> list[list[float]]:
    """Return a list of 1024-dim L2-normalized vectors.

    Caches results per raw text in a process-wide dict; identical strings
    across calls (common for capability/skill names) skip the HTTP roundtrip.
    """
    one = isinstance(texts, str)
    batch = [texts] if one else list(texts)
    batch = [t if t and t.strip() else " " for t in batch]

    cached: dict[int, list[float]] = {}
    miss_indexes: list[int] = []
    miss_texts: list[str] = []
    with _CACHE_LOCK:
        for i, t in enumerate(batch):
            if t in _TEXT_CACHE:
                cached[i] = _TEXT_CACHE[t]
            else:
                miss_indexes.append(i)
                miss_texts.append(t)

    if miss_texts:
        provider = (settings.embedding_provider or "local").lower()
        if provider == "local":
            fresh = _embed_local(miss_texts)
        elif provider in ("zhipu", "openai_compat"):
            fresh = _embed_openai_compat(miss_texts, provider)
        else:
            raise EmbeddingError(f"unknown embedding provider: {provider}")
        with _CACHE_LOCK:
            for idx, text, vec in zip(miss_indexes, miss_texts, fresh, strict=False):
                cached[idx] = vec
                if len(_TEXT_CACHE) >= _TEXT_CACHE_MAX:
                    # Simple eviction: drop an arbitrary item (dict insertion
                    # order ≈ FIFO). Good enough for our workload.
                    _TEXT_CACHE.pop(next(iter(_TEXT_CACHE)))
                _TEXT_CACHE[text] = vec

    return [cached[i] for i in range(len(batch))]


def embed_one(text: str) -> list[float]:
    return embed(text)[0]


# ---------------------------------------------------------------------------
# local (sentence-transformers)
# ---------------------------------------------------------------------------


def _embed_local(batch: list[str]) -> list[list[float]]:
    model = _load_local_model()
    vectors = model.encode(batch, normalize_embeddings=True, show_progress_bar=False)
    return [v.tolist() for v in vectors]


def _load_local_model():
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is not None:
            return _model
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as e:
            raise EmbeddingError(
                "sentence-transformers not installed. Run "
                "`pip install -e '.[local-embed]'` or set EMBEDDING_PROVIDER=zhipu."
            ) from e
        _model = SentenceTransformer(settings.embedding_model, device="cpu")
    return _model


# ---------------------------------------------------------------------------
# OpenAI-compatible embeddings (zhipu / custom)
# ---------------------------------------------------------------------------


def _embed_openai_compat(batch: list[str], provider: str) -> list[list[float]]:
    defaults = _PROVIDER_DEFAULTS.get(provider, {})
    base_url = settings.embedding_base_url or defaults.get("base_url") or ""
    model = settings.embedding_model_name or defaults.get("model") or ""
    api_key = settings.embedding_api_key or settings.llm_api_key

    if not base_url:
        raise EmbeddingError(f"{provider} embedding base_url not configured")
    if not model:
        raise EmbeddingError(f"{provider} embedding model not configured")
    if not api_key:
        raise EmbeddingError(f"{provider} embedding api key not configured")

    url = base_url.rstrip("/") + "/embeddings"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    # Chunk to stay under provider per-request limits.
    out: list[list[float]] = []
    chunk_size = 32
    with httpx.Client(timeout=60.0) as c:
        for start in range(0, len(batch), chunk_size):
            chunk = batch[start : start + chunk_size]
            body: dict[str, Any] = {
                "model": model,
                "input": chunk,
                "dimensions": VECTOR_SIZE,
            }
            try:
                resp = c.post(url, json=body, headers=headers)
                if resp.status_code >= 400:
                    raise EmbeddingError(
                        f"{provider} embeddings HTTP {resp.status_code}: {resp.text[:300]}"
                    )
                data = resp.json()
            except httpx.HTTPError as e:
                raise EmbeddingError(f"{provider} embeddings request failed: {e}") from e

            items = data.get("data") or []
            items_sorted = sorted(items, key=lambda x: x.get("index", 0))
            for item in items_sorted:
                vec = item.get("embedding")
                if not vec:
                    raise EmbeddingError(f"{provider} returned item without embedding: {item}")
                out.append(_normalize(vec))
    return out


def _normalize(vec: list[float]) -> list[float]:
    s = sum(x * x for x in vec) ** 0.5
    if s <= 0:
        return vec
    return [x / s for x in vec]
