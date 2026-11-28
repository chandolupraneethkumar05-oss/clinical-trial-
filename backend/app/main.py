"""
ProtocolShield Enterprise Backend Entry Point
FastAPI Application, Life-cycle handlers, and Route Aggregator.
"""
import logging
import math
from contextlib import asynccontextmanager
from typing import Any
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.db.duckdb_client import db_client
from app.api.routes_protocol import router as protocol_router
from app.api.routes_cohort import router as cohort_router
from app.api.routes_benchmark import router as benchmark_router
from app.api.routes_optimizer import router as optimizer_router
from app.api.routes_auth import router as auth_router, seed_default_users_if_empty
from app.api.routes_patient import router as patient_router
from app.api.routes_audit import router as audit_router
from app.api.routes_assistant import router as assistant_router
from app.engine.public_overview import compute_public_overview
from app.engine.synthetic_data import seed_database_if_empty

# Configure application-level logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate secrets before accepting any requests (exits in production if insecure)
    settings.validate_production_secrets()
    # Startup: Ensure analytical DuckDB database is initialized and seeded
    total_records = seed_database_if_empty(total_patients=10000)
    seed_default_users_if_empty()
    logger.info("ProtocolShield initialized. DuckDB cohort verified with %d patient records.", total_records)
    yield
    # Shutdown logic if needed


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Autonomous Clinical Trial Protocol Feasibility & Patient Attrition Synthesizer",
    lifespan=lifespan
)


def _sanitize_validation_value(obj: Any) -> Any:
    """Converts non-finite floats, exceptions, and non-JSON scalars cleanly for HTTP 422 responses."""
    if isinstance(obj, float) and not math.isfinite(obj):
        return str(obj)
    if isinstance(obj, BaseException):
        return str(obj)
    if isinstance(obj, dict):
        return {k: _sanitize_validation_value(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_validation_value(v) for v in obj]
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    return str(obj)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": _sanitize_validation_value(exc.errors())},
    )

# CORS Middleware — restrict allowed origins, methods, and headers for security
# allow_origins is configured from BACKEND_CORS_ORIGINS and FRONTEND_URL environment variables
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(self), geolocation=()")
    if request.url.path.startswith(f"{settings.API_V1_STR}/auth") or request.url.path.startswith(
        f"{settings.API_V1_STR}/patient"
    ):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


# Include Routers
app.include_router(protocol_router, prefix=settings.API_V1_STR)
app.include_router(cohort_router, prefix=settings.API_V1_STR)
app.include_router(benchmark_router, prefix=settings.API_V1_STR)
app.include_router(optimizer_router, prefix=settings.API_V1_STR)
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(patient_router, prefix=settings.API_V1_STR)
app.include_router(audit_router, prefix=settings.API_V1_STR)
app.include_router(assistant_router, prefix=settings.API_V1_STR)


@app.get("/")
async def root():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "operational",
        "docs_url": "/docs"
    }


@app.get("/health")
async def health_check():
    """
    Lightweight application process liveness probe.
    Does not claim database readiness; use /ready for dependency & initialization checks.
    """
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
    }


@app.get("/ready")
@app.get(f"{settings.API_V1_STR}/system/ready")
async def readiness_check():
    """
    Readiness probe verifying DuckDB connectivity, required schema initialization, and cohort seeding.
    Returns HTTP 503 if critical dependencies are unavailable.
    Never exposes internal paths, configuration values, connection strings, or secrets.
    """
    try:
        db_ok, cohort_count = db_client.check_health(verify_tables=True)
    except Exception:
        db_ok, cohort_count = False, 0

    in_mem_prod = settings.is_production() and getattr(db_client, "_is_in_memory_fallback", False)
    cohort_loaded = cohort_count > 0
    is_ready = db_ok and cohort_loaded and not in_mem_prod

    if not is_ready:
        return JSONResponse(
            status_code=503,
            content={
                "status": "not_ready",
                "service": settings.PROJECT_NAME,
                "checks": {
                    "database": "connected" if db_ok else "unavailable",
                    "cohort_initialized": cohort_loaded,
                    "persistent_storage": not in_mem_prod,
                },
            },
        )

    return {
        "status": "ready",
        "service": settings.PROJECT_NAME,
        "checks": {
            "database": "connected",
            "cohort_initialized": True,
            "persistent_storage": True,
        },
    }


@app.get(f"{settings.API_V1_STR}/system/public-overview")
async def get_public_overview():
    """
    Returns live, non-PII aggregate telemetry computed from DuckDB and mathematical engines
    for the public Landing Page. Contains no personal records or fabricated static estimates.
    """
    try:
        return compute_public_overview()
    except Exception:
        logger.exception("Failed to compute live public overview telemetry.")
        return JSONResponse(
            status_code=503,
            content={"detail": "Live system telemetry is temporarily unavailable."},
        )
