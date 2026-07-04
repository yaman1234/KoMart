from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
_ROOT_DIR = _BASE_DIR.parent                                 # project root

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_BASE_DIR / ".env", _ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # MongoDB
    mongo_url: str = "mongodb://localhost:27017/komart"
    mongo_db_name: str = "komart"

    # JWT
    secret_key: str = ""
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # App
    app_env: str = "development"
    cors_origins: str = "http://localhost:5173"

<<<<<<< HEAD
    # Serverless: skip the full stock-sync on every cold start
    skip_stock_refresh_on_start: bool = False
=======
    @model_validator(mode="after")
    def _check_secret_key(self) -> "Settings":
        if not self.secret_key:
            raise ValueError(
                "SECRET_KEY env var is required. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
            )
        return self
>>>>>>> dev

    @property
    def cors_origins_list(self) -> list[str]:
        origins: list[str] = []
        for raw in self.cors_origins.split(","):
            origin = raw.strip().strip('"').strip("'").rstrip("/")
            if origin:
                origins.append(origin)
        return origins


settings = Settings()
