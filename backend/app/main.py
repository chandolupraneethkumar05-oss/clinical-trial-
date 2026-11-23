"""
ProtocolShield Enterprise Backend Entry Point
FastAPI Application, Life-cycle handlers, and Route Aggregator.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes_protocol import router as protocol_router
from app.api.routes_cohort import router as cohort_router
from app.api.routes_benchmark import router as benchmark_router
from app.api.routes_optimizer import router as optimizer_router
from app.api.routes_auth import router as auth_router
from app.api.routes_patient import router as patient_router
from app.api.routes_audit import router as audit_router
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
    logger.info("ProtocolShield initialized. DuckDB cohort verified with %d patient records.", total_records)
    yield
    # Shutdown logic if needed


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Autonomous Clinical Trial Protocol Feasibility & Patient Attrition Synthesizer",
    lifespan=lifespan
)

# CORS Middleware — restrict allowed origins, methods, and headers for security
# allow_origins is configured from BACKEND_CORS_ORIGINS environment variable
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)

# Include Routers
app.include_router(protocol_router, prefix=settings.API_V1_STR)
app.include_router(cohort_router, prefix=settings.API_V1_STR)
app.include_router(benchmark_router, prefix=settings.API_V1_STR)
app.include_router(optimizer_router, prefix=settings.API_V1_STR)
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(patient_router, prefix=settings.API_V1_STR)
app.include_router(audit_router, prefix=settings.API_V1_STR)


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
    return {"status": "healthy", "service": "ProtocolShield Intelligence Backend"}
