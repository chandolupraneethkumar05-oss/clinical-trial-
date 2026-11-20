"""
ProtocolShield Configuration Module
Enterprise application settings and environment management.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "ProtocolShield"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False

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

    # CORS
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


settings = Settings()
