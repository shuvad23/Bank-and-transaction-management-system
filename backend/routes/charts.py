from fastapi import APIRouter, Depends, Query
from core.security import get_current_user
from services.transaction_service import get_user_chart_data

router = APIRouter(prefix="/api/charts", tags=["Charts"])


@router.get("/me")
async def my_charts(
    days: int = Query(7, ge=1, le=90),
    current_user: dict = Depends(get_current_user),
):
    """Per-user dashboard chart data."""
    return await get_user_chart_data(current_user["user_id"], days)
