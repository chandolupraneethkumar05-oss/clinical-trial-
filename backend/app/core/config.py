"""
ProtocolShield Configuration Module
Enterprise application settings and environment management.

IMPORTANT: Never commit a real .env file. Configure all secrets via environment variables.
Generate a secure JWT secret with: python -c "import secrets; print(secrets.token_urlsafe(48))"
"""
import json
import logging
import sys
from pathlib import Path
from typing import Any
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

_INSECURE_DEV_SECRETS = {
    "protocolshield_super_secure_jwt_secret_key_2026_dev_only",
    "secret",
    "changeme",
    "jwt_secret",
    "dev_secret",
    "your-secret-key",
    "replace-me",
    "",
}


def _parse_str_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(v).strip() for v in parsed if str(v).strip()]
            except ValueError:
                pass
        return [item.strip() for item in raw.split(",") if item.strip()]
    return []


class Settings(BaseSettings):
    PROJECT_NAME: str = "ProtocolShield"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # Security & JWT Token Configuration
    # In production, set JWT_SECRET_KEY to a long random value via environment variable.
    # Generate with: python -c "import secrets; print(secrets.token_urlsafe(48))"
    JWT_SECRET_KEY: str = "protocolshield_super_secure_jwt_secret_key_2026_dev_only"
    JWT_ALGORITHM: str = "HS256"
    JWT_ISSUER: str = "protocolshield-api"
    JWT_AUDIENCE: str = "protocolshield-client"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # 1 hour default; set lower in prod (15–30 min)
    PASSWORD_RESET_EXPIRE_MINUTES: int = 15  # 15 minutes, non-negotiable

    # Demo & Development Security Guardrails
    # Explicitly disabled in production; production startup fails closed if set to True.
    ENABLE_DEMO_SEEDING: bool = True  # Allowed ONLY in development/test environments
    EXPOSE_DEV_RESET_TOKEN: bool = False  # Development-only flag for local verification; never in prod

    # Anti-Spoofing & Trusted Reverse Proxies
    # Only requests from these IP addresses will have their X-Forwarded-For headers inspected.
    TRUSTED_PROXIES: list[str] = ["127.0.0.1", "::1"]

    # Google OAuth (optional — email/password login works without this)
    GOOGLE_CLIENT_ID: str = ""

    # Email delivery (for production password-reset emails)
    # Supported providers: "resend", "sendgrid", "mailgun", "smtp"
    EMAIL_PROVIDER: str = ""
    EMAIL_API_KEY: str = ""
    EMAIL_FROM: str = ""
    EMAIL_MAILGUN_DOMAIN: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True

    # Frontend URL (used for CORS and password-reset links)
    FRONTEND_URL: str = "http://localhost:5173"

    # Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    DB_PATH: Path = DATA_DIR / "protocolshield_cohort.duckdb"

    # ClinicalTrials.gov API v2
    CLINICAL_TRIALS_API_BASE: str = "https://clinicaltrials.gov/api/v2"

    # Burden Model Calibration (Tufts CSDD calibrated weights)
    WEIGHT_TEMPORAL: float = 0.35
    WEIGHT_INVASIVE: float = 0.45
    WEIGHT_COGNITIVE: float = 0.20

    # CORS — origins that the backend allows.
    # In production, set FRONTEND_URL and/or BACKEND_CORS_ORIGINS via environment variables.
    BACKEND_CORS_ORIGINS: list[str] = list(_DEFAULT_CORS_ORIGINS)

    @field_validator("BACKEND_CORS_ORIGINS", "TRUSTED_PROXIES", mode="before")
    @classmethod
    def parse_list_setting(cls, v: Any) -> list[str]:
        return _parse_str_list(v)

    model_config = SettingsConfigDict(
        env_file=(str(_REPO_ROOT / ".env"), ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower().strip() in {"production", "prod", "staging"}

    def get_cors_origins(self) -> list[str]:
        origins = [o.rstrip("/") for o in self.BACKEND_CORS_ORIGINS if o and o.strip()]
        frontend = (self.FRONTEND_URL or "").strip().rstrip("/")
        if frontend and frontend != "*" and frontend not in origins:
            origins.append(frontend)
        # In production, drop default localhost origins if an explicit non-local FRONTEND_URL is set
        # and BACKEND_CORS_ORIGINS was left at defaults
        if self.is_production() and frontend and "localhost" not in frontend and "127.0.0.1" not in frontend:
            if set(self.BACKEND_CORS_ORIGINS) == set(_DEFAULT_CORS_ORIGINS):
                origins = [frontend]
        return origins

    def validate_production_secrets(self) -> None:
        """
        Validates that production environments are not started with insecure
        default secrets. Called during application startup.
        Raises SystemExit in production when configuration is unsafe.
        """
        if self.is_production():
            if self.DEBUG:
                logger.critical("[STARTUP FAILURE] DEBUG must be False in production.")
                sys.exit(1)
            if self.ENABLE_DEMO_SEEDING:
                logger.critical(
                    "[STARTUP FAILURE] Insecure demo-seeding configuration detected: "
                    "ENABLE_DEMO_SEEDING must be False in production environments."
                )
                sys.exit(1)
            if self.EXPOSE_DEV_RESET_TOKEN:
                logger.critical(
                    "[STARTUP FAILURE] Insecure reset-token configuration detected: "
                    "EXPOSE_DEV_RESET_TOKEN must be False in production environments."
                )
                sys.exit(1)
            if "*" in self.TRUSTED_PROXIES:
                logger.critical(
                    "[STARTUP FAILURE] TRUSTED_PROXIES cannot contain wildcard '*' in production."
                )
                sys.exit(1)
            if "*" in self.BACKEND_CORS_ORIGINS:
                logger.critical(
                    "[STARTUP FAILURE] BACKEND_CORS_ORIGINS cannot contain wildcard '*' when credentials are enabled."
                )
                sys.exit(1)
            # Reject known weak, placeholder, or low-entropy JWT secrets
            secret_lower = self.JWT_SECRET_KEY.lower().strip()
            if secret_lower in _INSECURE_DEV_SECRETS:
                logger.critical(
                    "[STARTUP FAILURE] Production environment requires a strong JWT_SECRET_KEY. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )
                sys.exit(1)
            if len(self.JWT_SECRET_KEY) < 32 or len(set(self.JWT_SECRET_KEY)) < 8:
                logger.critical(
                    "[STARTUP FAILURE] JWT_SECRET_KEY is too short or low-entropy for production. "
                    "Use at least 32 random characters."
                )
                sys.exit(1)
            if not self.EMAIL_PROVIDER.strip():
                logger.warning(
                    "[CONFIG WARNING] EMAIL_PROVIDER is not configured in production; "
                    "self-service password reset emails will return HTTP 503 until configured."
                )
        else:
            if self.JWT_SECRET_KEY.lower().strip() in _INSECURE_DEV_SECRETS:
                logger.warning(
                    "[CONFIG WARNING] Using default development JWT_SECRET_KEY. "
                    "Set a strong JWT_SECRET_KEY in your .env file before deploying. "
                    "Generate: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )


settings = Settings()
