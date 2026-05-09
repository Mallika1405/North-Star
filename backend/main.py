"""
Main FastAPI application entrypoint.
Business advisor for underserved small business owners.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from config import settings
from routers import auth, profile, chat, grants, calendar, compliance

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting business advisor API...")
    logger.info(f"Environment: {settings.environment}")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="Small Business Advisor API",
    description=(
        "AI-powered business advisor for underserved small business owners. "
        "Grant discovery, tax guidance, contract reading, and operational help — "
        "all sourced, transparent, and bilingual."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url="/redoc" if settings.environment == "development" else None,
)

# CORS — allow all origins in dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(chat.router)
app.include_router(grants.router)
app.include_router(calendar.router)
app.include_router(compliance.router)


@app.get("/health")
async def health():
    """Health check."""
    return {
        "status": "ok",
        "version": "1.0.0",
        "environment": settings.environment,
    }


@app.get("/")
async def root():
    return {
        "message": "Small Business Advisor API",
        "docs": "/docs",
        "health": "/health",
    }