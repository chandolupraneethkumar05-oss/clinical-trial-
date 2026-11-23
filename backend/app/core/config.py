"""
ProtocolShield Configuration Module
Enterprise application settings and environment management.

IMPORTANT: Never commit a real .env file. Configure all secrets via environment variables.
Generate a secure JWT secret with: python -c "import secrets; print(secrets.token_urlsafe(48))"
"""
import sys
import logging
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_INSECURE_DEV_SECRETS = {
    "protocolshield_super_secure_jwt_secret_key_2026_dev_only",
    "secret",
    "changeme",
    "jwt_secret",
    "dev_secret",
    "",
}


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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # 1 hour default; set lower in prod (15–30 min)
    PASSWORD_RESET_EXPIRE_MINUTES: int = 15  # 15 minutes, non-negotiable

    # Google OAuth (optional — email/password login works without this)
    GOOGLE_CLIENT_ID: str = ""

    # Email delivery (optional — provides password-reset email capability)
    EMAIL_PROVIDER: str = ""  # e.g. "sendgrid", "mailgun", "smtp"
    EMAIL_API_KEY: str = ""
    EMAIL_FROM: str = ""

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
    # In production, set FRONTEND_URL and add your deployed frontend here.
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    def validate_production_secrets(self) -> None:
        """
        Validates that production environments are not started with insecure
        default secrets. Called during application startup.
        Raises SystemExit in production when configuration is unsafe.
        """
        env = self.ENVIRONMENT.lower()
        is_production = env in {"production", "prod", "staging"}

        if is_production:
            # Reject known weak or placeholder JWT secrets
            if self.JWT_SECRET_KEY.lower() in _INSECURE_DEV_SECRETS:
                logger.critical(
                    "[STARTUP FAILURE] Production environment requires a strong JWT_SECRET_KEY. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )
                sys.exit(1)
            if len(self.JWT_SECRET_KEY) < 32:
                logger.critical(
                    "[STARTUP FAILURE] JWT_SECRET_KEY is too short for production. "
                    "Use at least 32 random characters."
                )
                sys.exit(1)
        else:
            # In development, warn if using the default insecure key
            if self.JWT_SECRET_KEY.lower() in _INSECURE_DEV_SECRETS:
                logger.warning(
                    "[CONFIG WARNING] Using default development JWT_SECRET_KEY. "
                    "Set a strong JWT_SECRET_KEY in your .env file before deploying. "
                    "Generate: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )


settings = Settings()
