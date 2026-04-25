"""WebSocket connection manager.

Tracks connected clients by user_id and role so the API can push real-time
events (new transactions, fraud alerts, notifications) to the right people.
"""
import json
import asyncio
from typing import Optional
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # user_id -> set of websockets
        self._user_conns: dict[str, set[WebSocket]] = {}
        # role -> set of websockets (for admins)
        self._role_conns: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket, user_id: str, role: str):
        await ws.accept()
        async with self._lock:
            self._user_conns.setdefault(user_id, set()).add(ws)
            self._role_conns.setdefault(role, set()).add(ws)

    async def disconnect(self, ws: WebSocket, user_id: str, role: str):
        async with self._lock:
            self._user_conns.get(user_id, set()).discard(ws)
            if not self._user_conns.get(user_id):
                self._user_conns.pop(user_id, None)
            self._role_conns.get(role, set()).discard(ws)
            if not self._role_conns.get(role):
                self._role_conns.pop(role, None)

    async def _send(self, ws: WebSocket, payload: dict):
        try:
            await ws.send_text(json.dumps(payload, default=str))
        except Exception:
            pass

    async def send_to_user(self, user_id: str, event: str, data: dict):
        payload = {"event": event, "data": data}
        targets = list(self._user_conns.get(user_id, set()))
        for ws in targets:
            await self._send(ws, payload)

    async def broadcast_to_role(self, role: str, event: str, data: dict):
        payload = {"event": event, "data": data}
        targets = list(self._role_conns.get(role, set()))
        for ws in targets:
            await self._send(ws, payload)

    async def broadcast_event(self, event: str, data: dict, user_id: Optional[str] = None):
        """Send to user (if given) and to all admins."""
        if user_id:
            await self.send_to_user(user_id, event, data)
        await self.broadcast_to_role("admin", event, data)

    @property
    def stats(self) -> dict:
        return {
            "connected_users": len(self._user_conns),
            "connected_admins": len(self._role_conns.get("admin", set())),
            "total_connections": sum(len(s) for s in self._user_conns.values()),
        }


ws_manager = ConnectionManager()
