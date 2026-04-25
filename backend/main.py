from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from core.config import settings
from database.connection import connect_to_mongo, close_mongo_connection
from routes import auth, accounts, admin, notifications, charts, ws
from services.cache_service import cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    await cache.connect()
    yield
    await cache.close()
    await close_mongo_connection()


app = FastAPI(
    title=settings.APP_NAME,
    description="NexBank — full-featured Bank & Transaction Management API "
                "with audit logs, fraud detection, caching, and real-time updates.",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(admin.router)
app.include_router(notifications.router)
app.include_router(charts.router)
app.include_router(ws.router)


@app.get("/", tags=["Health"])
async def root():
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "status": "running",
        "version": "2.0.0",
        "docs": "/docs",
        "cache_backend": cache.backend_name,
    }


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "cache": cache.backend_name}
