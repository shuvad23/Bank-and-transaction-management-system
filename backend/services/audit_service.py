"""Audit log writer + reader.

Every privileged action (login, account creation, money movement, fraud
detection, admin views) writes an audit row that admins can inspect.
"""
from datetime import datetime
from bson import ObjectId
from typing import Optional

from database.connection import get_database
from services.ws_manager import ws_manager
import asyncio


async def log_action(
    action: str,
    user_id: Optional[str] = None,
    actor_email: Optional[str] = None,
    target: Optional[str] = None,
    details: Optional[dict] = None,
    severity: str = "info",
    ip_address: Optional[str] = None,
):
    """Persist an audit log entry and broadcast it to admins in real time."""
    db = get_database()
    entry = {
        "_id": str(ObjectId()),
        "action": action,
        "user_id": user_id,
        "actor_email": actor_email,
        "target": target,
        "details": details or {},
        "severity": severity,  # info | warning | critical
        "ip_address": ip_address,
        "created_at": datetime.utcnow(),
    }
    if isinstance(db, dict):
        db.setdefault("audit_logs", []).append(entry)
    else:
        try:
            await db.audit_logs.insert_one(entry.copy())
        except Exception as e:
            print(f"[audit] persist failed: {e}")

    # Notify admin dashboards in real time
    asyncio.create_task(ws_manager.broadcast_to_role("admin", "audit", {
        "id": entry["_id"],
        "action": action,
        "actor_email": actor_email,
        "target": target,
        "severity": severity,
        "created_at": entry["created_at"].isoformat(),
    }))
    return entry


async def list_logs(limit: int = 100, skip: int = 0, severity: Optional[str] = None) -> list[dict]:
    db = get_database()
    if isinstance(db, dict):
        items = list(db.get("audit_logs", []))
        if severity:
            items = [e for e in items if e.get("severity") == severity]
        items = sorted(items, key=lambda e: e["created_at"], reverse=True)[skip:skip + limit]
    else:
        query = {"severity": severity} if severity else {}
        cursor = db.audit_logs.find(query).sort("created_at", -1).skip(skip).limit(limit)
        items = await cursor.to_list(limit)
    out = []
    for e in items:
        out.append({
            "id": str(e["_id"]),
            "action": e["action"],
            "user_id": e.get("user_id"),
            "actor_email": e.get("actor_email"),
            "target": e.get("target"),
            "details": e.get("details", {}),
            "severity": e.get("severity", "info"),
            "ip_address": e.get("ip_address"),
            "created_at": e["created_at"],
        })
    return out
