"""Redis-backed cache with in-memory fallback.

Used by the API to avoid recomputing expensive aggregations (admin stats,
chart data, account lookups). Falls back to a process-local dict with TTL
when REDIS_URL is missing or Redis is unreachable.
"""
import os
import json
import time
import asyncio
from typing import Any, Optional

try:
    import redis.asyncio as aioredis
    HAS_REDIS_LIB = True
except Exception:
    HAS_REDIS_LIB = False


class _MemoryCache:
    def __init__(self):
        self._store: dict[str, tuple[float, str]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[str]:
        async with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            expires_at, value = entry
            if expires_at and expires_at < time.time():
                self._store.pop(key, None)
                return None
            return value

    async def setex(self, key: str, ttl: int, value: str) -> None:
        async with self._lock:
            self._store[key] = (time.time() + ttl if ttl else 0, value)

    async def delete(self, *keys: str) -> None:
        async with self._lock:
            for k in keys:
                self._store.pop(k, None)

    async def keys(self, pattern: str) -> list[str]:
        prefix = pattern.replace("*", "")
        async with self._lock:
            return [k for k in self._store.keys() if k.startswith(prefix)]


class CacheService:
    def __init__(self):
        self._redis = None
        self._memory = _MemoryCache()
        self.backend_name = "memory"

    async def connect(self):
        url = os.getenv("REDIS_URL", "").strip()
        if not url or not HAS_REDIS_LIB:
            print(f"Cache: using in-memory backend (no REDIS_URL configured)")
            return
        try:
            client = aioredis.from_url(url, encoding="utf-8", decode_responses=True)
            await client.ping()
            self._redis = client
            self.backend_name = "redis"
            print(f"Cache: connected to Redis at {url}")
        except Exception as e:
            print(f"Cache: Redis unreachable ({e}). Falling back to in-memory.")
            self._redis = None

    async def close(self):
        if self._redis:
            try:
                await self._redis.close()
            except Exception:
                pass

    async def get_json(self, key: str) -> Any:
        try:
            raw = await (self._redis.get(key) if self._redis else self._memory.get(key))
        except Exception:
            raw = await self._memory.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return None

    async def set_json(self, key: str, value: Any, ttl: int = 30) -> None:
        raw = json.dumps(value, default=str)
        try:
            if self._redis:
                await self._redis.setex(key, ttl, raw)
            else:
                await self._memory.setex(key, ttl, raw)
        except Exception:
            await self._memory.setex(key, ttl, raw)

    async def invalidate(self, *patterns: str) -> None:
        for pattern in patterns:
            try:
                if self._redis:
                    keys = []
                    async for k in self._redis.scan_iter(match=pattern):
                        keys.append(k)
                    if keys:
                        await self._redis.delete(*keys)
                else:
                    keys = await self._memory.keys(pattern)
                    if keys:
                        await self._memory.delete(*keys)
            except Exception:
                keys = await self._memory.keys(pattern)
                if keys:
                    await self._memory.delete(*keys)


cache = CacheService()
