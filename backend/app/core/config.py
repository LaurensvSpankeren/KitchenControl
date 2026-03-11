import os


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


class Settings:
    app_name: str = os.getenv('APP_NAME', 'KitchenControl API')
    database_url: str = _normalize_database_url(
        os.getenv("DATABASE_URL", "sqlite:///./kitchencontrol.db")
    )


settings = Settings()
