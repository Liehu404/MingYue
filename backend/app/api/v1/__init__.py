from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.colleges import router as colleges_router
from app.api.v1.partitions import router as partitions_router
from app.api.v1.teams import router as teams_router
from app.api.v1.users import router as users_router
from app.api.v1.resources import router as resources_router
from app.api.v1.reviews import router as reviews_router
from app.api.v1.stats import router as stats_router

router = APIRouter(prefix="/api/v1")
router.include_router(auth_router)
router.include_router(colleges_router)
router.include_router(partitions_router)
router.include_router(teams_router)
router.include_router(users_router)
router.include_router(resources_router)
router.include_router(reviews_router)
router.include_router(stats_router)
