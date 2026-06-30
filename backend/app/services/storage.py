"""Pluggable file storage for resume attachments.

Two backends, selected by `settings.storage_backend`:
- "local"    : writes under settings.storage_root (dev / single-host deploy)
- "supabase" : Supabase Storage REST API (serverless deploy)

Interface:
- save(filename_hint: str, data: bytes) -> str    # returns storage_path
- read(storage_path: str) -> bytes
- delete(storage_path: str) -> None
"""

from __future__ import annotations

import os
import uuid

import httpx

from app.core.config import settings


class StorageError(Exception):
    pass


def _ext(filename: str) -> str:
    return os.path.splitext(filename.lower())[1] or ".bin"


def save(filename_hint: str, data: bytes) -> str:
    backend = (settings.storage_backend or "local").lower()
    if backend == "local":
        return _save_local(filename_hint, data)
    if backend == "supabase":
        return _save_supabase(filename_hint, data)
    raise StorageError(f"unknown storage backend: {backend}")


def read(storage_path: str) -> bytes:
    backend = (settings.storage_backend or "local").lower()
    if backend == "local":
        return _read_local(storage_path)
    if backend == "supabase":
        return _read_supabase(storage_path)
    raise StorageError(f"unknown storage backend: {backend}")


def delete(storage_path: str) -> None:
    backend = (settings.storage_backend or "local").lower()
    try:
        if backend == "local":
            if os.path.exists(storage_path):
                os.remove(storage_path)
        elif backend == "supabase":
            _delete_supabase(storage_path)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Local backend
# ---------------------------------------------------------------------------


def _save_local(filename_hint: str, data: bytes) -> str:
    os.makedirs(settings.storage_root, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}{_ext(filename_hint)}"
    path = os.path.join(settings.storage_root, safe_name)
    with open(path, "wb") as f:
        f.write(data)
    return path


def _read_local(storage_path: str) -> bytes:
    with open(storage_path, "rb") as f:
        return f.read()


# ---------------------------------------------------------------------------
# Supabase Storage backend (REST)
# ---------------------------------------------------------------------------


def _supabase_check() -> tuple[str, str, str]:
    url = (settings.supabase_url or "").rstrip("/")
    key = settings.supabase_service_key
    bucket = settings.supabase_storage_bucket or "resumes"
    if not url or not key:
        raise StorageError("supabase_url / supabase_service_key not configured")
    return url, key, bucket


def _save_supabase(filename_hint: str, data: bytes) -> str:
    url, key, bucket = _supabase_check()
    object_key = f"{uuid.uuid4().hex}{_ext(filename_hint)}"
    endpoint = f"{url}/storage/v1/object/{bucket}/{object_key}"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/octet-stream",
        "x-upsert": "true",
    }
    try:
        with httpx.Client(timeout=60.0) as c:
            resp = c.post(endpoint, content=data, headers=headers)
            if resp.status_code >= 400:
                raise StorageError(
                    f"supabase upload failed: HTTP {resp.status_code} {resp.text[:300]}"
                )
    except httpx.HTTPError as e:
        raise StorageError(f"supabase upload error: {e}") from e
    return f"supabase://{bucket}/{object_key}"


def _parse_supabase_path(storage_path: str) -> tuple[str, str]:
    # accepts "supabase://<bucket>/<key>" or plain "<key>"
    if storage_path.startswith("supabase://"):
        rest = storage_path[len("supabase://") :]
        bucket, _, key = rest.partition("/")
        return bucket, key
    _, _, bucket_fallback = _supabase_check()
    return bucket_fallback, storage_path


def _read_supabase(storage_path: str) -> bytes:
    url, key, _ = _supabase_check()
    bucket, object_key = _parse_supabase_path(storage_path)
    endpoint = f"{url}/storage/v1/object/{bucket}/{object_key}"
    headers = {"Authorization": f"Bearer {key}"}
    try:
        with httpx.Client(timeout=60.0) as c:
            resp = c.get(endpoint, headers=headers)
            if resp.status_code >= 400:
                raise StorageError(
                    f"supabase download failed: HTTP {resp.status_code} {resp.text[:300]}"
                )
            return resp.content
    except httpx.HTTPError as e:
        raise StorageError(f"supabase download error: {e}") from e


def _delete_supabase(storage_path: str) -> None:
    url, key, _ = _supabase_check()
    bucket, object_key = _parse_supabase_path(storage_path)
    endpoint = f"{url}/storage/v1/object/{bucket}/{object_key}"
    headers = {"Authorization": f"Bearer {key}"}
    with httpx.Client(timeout=30.0) as c:
        c.delete(endpoint, headers=headers)
