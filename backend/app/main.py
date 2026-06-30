from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings

app = FastAPI(
    title="HR System API",
    version="0.1.0",
    description="AI 人才管理系统后端",
)

_origins = [o.strip() for o in (settings.cors_origins or "").split(",") if o.strip()]
if not _origins:
    _origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "env": settings.env}
