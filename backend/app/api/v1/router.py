from fastapi import APIRouter

# Explicit submodule imports (avoid broad package __init__ side effects
# and import-order issues seen in dev shell)
from app.api.v1.agent import router as agent_router
from app.api.v1.auth import router as auth_router
from app.api.v1.auth_register import router as auth_register_router
from app.api.v1.candidates import router as candidates_router
from app.api.v1.code_submissions import router as code_submissions_router
from app.api.v1.companies import router as companies_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.follow_ups import router as follow_ups_router
from app.api.v1.matches import router as matches_router
# pools temporarily disabled in this dev env due to fastapi 204 assert on delete routes
# from app.api.v1.pools import router as pools_router
from app.api.v1.positions import router as positions_router
# from app.api.v1.resumes import router as resumes_router  # disabled: 204 fastapi assert in current env
from app.api.v1.users import router as users_router

api_router = APIRouter(prefix="/api/v1")

# Auth
api_router.include_router(auth_router)
api_router.include_router(auth_register_router)

# Core HR modules (受角色限制)
api_router.include_router(candidates_router)
api_router.include_router(companies_router)
api_router.include_router(positions_router)
api_router.include_router(matches_router)
api_router.include_router(follow_ups_router)
# api_router.include_router(resumes_router)  # disabled: 204 fastapi assert in current env
api_router.include_router(dashboard_router)
api_router.include_router(agent_router)

# 用户管理（仅 admin）
api_router.include_router(users_router)

# 代码作品提交（面试平台专用 + 面试官评估）
api_router.include_router(code_submissions_router)
