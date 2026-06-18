import os
from pathlib import Path


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_nonnegative_int(name: str, default: int = 0) -> int:
    try:
        return max(0, int(os.getenv(name, str(default))))
    except ValueError:
        return default


class Settings:
    app_name: str = os.getenv('APP_NAME', 'KitchenControl API')
    database_url: str = _normalize_database_url(
        os.getenv("DATABASE_URL", "sqlite:///./kitchencontrol.db")
    )
    uploads_dir: Path = Path(os.getenv("UPLOADS_DIR", "uploads"))
    storage_backend: str = os.getenv("STORAGE_BACKEND", "local").strip().lower() or "local"
    r2_account_id: str = os.getenv("R2_ACCOUNT_ID", "").strip()
    r2_access_key_id: str = os.getenv("R2_ACCESS_KEY_ID", "").strip()
    r2_secret_access_key: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    r2_bucket_name: str = os.getenv("R2_BUCKET_NAME", "").strip()
    r2_public_base_url: str = os.getenv("R2_PUBLIC_BASE_URL", "").strip().rstrip("/")
    r2_endpoint_url: str = os.getenv("R2_ENDPOINT_URL", "").strip()
    google_drive_import_enabled: bool = _env_flag("GOOGLE_DRIVE_IMPORT_ENABLED")
    google_drive_folder_id: str = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "").strip()
    google_service_account_file: str = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()
    google_drive_min_file_age_seconds: int = _env_nonnegative_int(
        "GOOGLE_DRIVE_MIN_FILE_AGE_SECONDS"
    )
    bootstrap_supervisor_name: str = os.getenv("BOOTSTRAP_SUPERVISOR_NAME", "").strip()
    bootstrap_supervisor_email: str = os.getenv("BOOTSTRAP_SUPERVISOR_EMAIL", "").strip()
    bootstrap_supervisor_password: str = os.getenv("BOOTSTRAP_SUPERVISOR_PASSWORD", "")


settings = Settings()
