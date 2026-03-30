import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.auth import require_supervisor
from app.db.session import get_db
from app.models.app_setting import AppSetting
from app.models.user import DEFAULT_PERMISSIONS

router = APIRouter()


@router.get("/api/permissions", tags=["permissions"])
def get_permissions(
    db: Session = Depends(get_db),
    _current_user=Depends(require_supervisor),
) -> dict:
    setting = db.query(AppSetting).filter(AppSetting.key == "permissions").first()
    if setting is None:
        return {
            "permissions": DEFAULT_PERMISSIONS,
            "source": "default",
        }

    try:
        permissions = json.loads(setting.value_json)
    except (TypeError, ValueError):
        permissions = None

    if not isinstance(permissions, dict):
        return {
            "permissions": DEFAULT_PERMISSIONS,
            "source": "default",
        }

    return {
        "permissions": permissions,
        "source": "database",
    }
