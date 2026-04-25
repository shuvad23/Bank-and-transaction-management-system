from fastapi import APIRouter, Depends, Query
from typing import Optional

from services.transaction_service import (
    get_all_transactions, get_all_users_admin, get_system_stats, get_chart_data,
)
from services.audit_service import list_logs, log_action
from services.ws_manager import ws_manager
from core.security import get_current_admin

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/stats")
async def system_stats(current_admin: dict = Depends(get_current_admin)):
    """Admin: cached system-wide statistics."""
    return await get_system_stats()


@router.get("/charts")
async def system_charts(
    days: int = Query(7, ge=1, le=90),
    current_admin: dict = Depends(get_current_admin),
):
    """Admin: chart data for the last N days (daily volume + breakdown)."""
    return await get_chart_data(days)


@router.get("/transactions")
async def all_transactions(
    limit: int = Query(100, ge=1, le=1000),
    skip: int = Query(0, ge=0),
    current_admin: dict = Depends(get_current_admin),
):
    """Admin: get all transactions across the entire system."""
    return await get_all_transactions(limit, skip)


@router.get("/users")
async def all_users(
    limit: int = Query(100, ge=1, le=1000),
    skip: int = Query(0, ge=0),
    current_admin: dict = Depends(get_current_admin),
):
    """Admin: get all registered users (passwords excluded)."""
    return await get_all_users_admin(limit, skip)


@router.get("/audit-logs")
async def audit_logs(
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    severity: Optional[str] = Query(None, pattern="^(info|warning|critical)$"),
    current_admin: dict = Depends(get_current_admin),
):
    """Admin: full audit trail of privileged actions."""
    await log_action(
        action="ADMIN_VIEW_AUDIT",
        user_id=current_admin.get("user_id"),
        details={"limit": limit, "skip": skip, "severity": severity},
    )
    return await list_logs(limit, skip, severity)


@router.get("/connections")
async def realtime_connections(current_admin: dict = Depends(get_current_admin)):
    """Admin: how many users / admins are currently connected via WebSocket."""
    return ws_manager.stats
