"""Email + in-app notification service.

Persists notifications to MongoDB (or in-memory) so users can see them in the
notifications dropdown. If SMTP credentials are configured via environment
variables, an actual email is delivered; otherwise the email body is logged
to the server console (useful for development & demos).
"""
import os
import asyncio
from datetime import datetime
from bson import ObjectId

from database.connection import get_database
from services.ws_manager import ws_manager


SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or 587)
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "noreply@nexbank.local").strip()


async def _send_smtp_email(to_email: str, subject: str, body: str) -> bool:
    """Send email via SMTP if configured. Returns True on success."""
    if not (SMTP_HOST and SMTP_USER and SMTP_PASSWORD):
        return False
    try:
        import aiosmtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["From"] = SMTP_FROM
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.set_content(body)

        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER,
            password=SMTP_PASSWORD,
            start_tls=True,
            timeout=10,
        )
        return True
    except Exception as e:
        print(f"[email] SMTP send failed for {to_email}: {e}")
        return False


def _log_email(to_email: str, subject: str, body: str):
    """Pretty-print an email to the server console (dev fallback)."""
    line = "─" * 68
    print(
        f"\n┌─ EMAIL (dev log) {line[:48]}\n"
        f"│ To:      {to_email}\n"
        f"│ Subject: {subject}\n"
        f"│{line}\n"
        f"│ {body.replace(chr(10), chr(10) + '│ ')}\n"
        f"└{line}{line[:5]}\n",
        flush=True,
    )


async def send_notification(
    user_id: str,
    email: str,
    subject: str,
    body: str,
    category: str = "info",
    metadata: dict | None = None,
):
    """Persist + deliver a notification.

    1. Saves a record so the user can see it in their bell dropdown.
    2. Sends an SMTP email if configured, otherwise logs to console.
    3. Pushes a real-time WebSocket event to the user.
    """
    db = get_database()
    notification = {
        "_id": str(ObjectId()),
        "user_id": user_id,
        "email": email,
        "subject": subject,
        "body": body,
        "category": category,  # info | success | warning | danger
        "metadata": metadata or {},
        "is_read": False,
        "email_sent": False,
        "created_at": datetime.utcnow(),
    }

    # Try SMTP first; fall back to console log
    delivered = await _send_smtp_email(email, subject, body)
    if not delivered:
        _log_email(email, subject, body)
    notification["email_sent"] = delivered

    if isinstance(db, dict):
        db.setdefault("notifications", []).append(notification)
    else:
        try:
            await db.notifications.insert_one(notification.copy())
        except Exception as e:
            print(f"[notify] failed to persist notification: {e}")

    # Push real-time event to the user
    asyncio.create_task(ws_manager.send_to_user(user_id, "notification", {
        "id": notification["_id"],
        "subject": subject,
        "body": body,
        "category": category,
        "created_at": notification["created_at"].isoformat(),
    }))

    return notification


async def list_notifications(user_id: str, limit: int = 30) -> list[dict]:
    db = get_database()
    if isinstance(db, dict):
        items = [n for n in db.get("notifications", []) if n["user_id"] == user_id]
        items = sorted(items, key=lambda n: n["created_at"], reverse=True)[:limit]
    else:
        cursor = db.notifications.find({"user_id": user_id}).sort("created_at", -1).limit(limit)
        items = await cursor.to_list(limit)
    out = []
    for n in items:
        out.append({
            "id": str(n["_id"]),
            "subject": n["subject"],
            "body": n["body"],
            "category": n.get("category", "info"),
            "is_read": n.get("is_read", False),
            "email_sent": n.get("email_sent", False),
            "created_at": n["created_at"],
        })
    return out


async def mark_all_read(user_id: str) -> int:
    db = get_database()
    if isinstance(db, dict):
        count = 0
        for n in db.get("notifications", []):
            if n["user_id"] == user_id and not n.get("is_read"):
                n["is_read"] = True
                count += 1
        return count
    res = await db.notifications.update_many(
        {"user_id": user_id, "is_read": False},
        {"$set": {"is_read": True}},
    )
    return res.modified_count
