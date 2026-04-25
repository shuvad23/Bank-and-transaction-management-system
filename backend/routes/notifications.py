from fastapi import APIRouter, Depends, Query
from core.security import get_current_user
from services.notification_service import list_notifications, mark_all_read

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("/")
async def my_notifications(
    limit: int = Query(30, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    return await list_notifications(current_user["user_id"], limit)


@router.post("/mark-read")
async def mark_read(current_user: dict = Depends(get_current_user)):
    count = await mark_all_read(current_user["user_id"])
    return {"marked_read": count}
