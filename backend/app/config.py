from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # MongoDB
    mongo_url: str = "mongodb://localhost:27017/komart"
    mongo_db_name: str = "komart"

    # JWT
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # App
    app_env: str = "development"
    cors_origins: str = "http://localhost:5173"

    # Serverless: skip the full stock-sync on every cold start
    skip_stock_refresh_on_start: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        origins: list[str] = []
        for raw in self.cors_origins.split(","):
            origin = raw.strip().strip('"').strip("'").rstrip("/")
            if origin:
                origins.append(origin)
        return origins


settings = Settings()
