import os
from pathlib import Path


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


class Settings:
    app_name: str = os.getenv('APP_NAME', 'KitchenControl API')
    database_url: str = _normalize_database_url(
        os.getenv("DATABASE_URL", "sqlite:///./kitchencontrol.db")
    )
    uploads_dir: Path = Path(os.getenv("UPLOADS_DIR", "uploads"))
    bootstrap_supervisor_name: str = os.getenv("BOOTSTRAP_SUPERVISOR_NAME", "").strip()
    bootstrap_supervisor_email: str = os.getenv("BOOTSTRAP_SUPERVISOR_EMAIL", "").strip()
    bootstrap_supervisor_password: str = os.getenv("BOOTSTRAP_SUPERVISOR_PASSWORD", "")


settings = Settings()
