"""WebSocket endpoint for real-time push notifications.

The client connects to `/api/ws?token=<jwt>` and receives:
  - notification     (new in-app notification for the current user)
  - transaction.new  (any new transaction for the current user; or all for admin)
  - account.created  (a new account was opened)
  - fraud.alert      (admin only)
  - audit            (admin only)
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from jose import JWTError, jwt

from core.config import settings
from services.ws_manager import ws_manager

router = APIRouter()


@router.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(...)):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        role = payload.get("role", "user")
        if not user_id:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except JWTError:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await ws_manager.connect(ws, user_id, role)
    try:
        # Initial hello so the client knows it's alive.
        await ws.send_json({"event": "hello", "data": {"user_id": user_id, "role": role}})
        while True:
            # We don't expect client→server messages, but we await to keep the
            # socket open. If the client sends ping/pong text we just echo it.
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(ws, user_id, role)
