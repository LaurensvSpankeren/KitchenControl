import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import require_supervisor
from app.db.session import get_db
from app.models.app_setting import AppSetting
from app.models.user import DEFAULT_PERMISSIONS, USER_ROLES

router = APIRouter()


def _validate_permissions_payload(payload: dict) -> dict:
    permissions = payload.get("permissions")
    if not isinstance(permissions, dict):
        raise HTTPException(status_code=400, detail="permissions must be an object")

    validated: dict[str, list[str]] = {}
    for key, roles in permissions.items():
        if not isinstance(key, str):
            raise HTTPException(status_code=400, detail="permission keys must be strings")
        if not isinstance(roles, list):
            raise HTTPException(status_code=400, detail=f"permission '{key}' must contain a list of roles")

        validated_roles: list[str] = []
        for role in roles:
            if not isinstance(role, str):
                raise HTTPException(status_code=400, detail=f"permission '{key}' contains an invalid role value")
            if role not in USER_ROLES:
                raise HTTPException(status_code=400, detail=f"permission '{key}' contains unknown role '{role}'")
            validated_roles.append(role)

        validated[key] = validated_roles

    return validated


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


@router.put("/api/permissions", tags=["permissions"])
def update_permissions(
    payload: dict,
    db: Session = Depends(get_db),
    _current_user=Depends(require_supervisor),
) -> dict:
    permissions = _validate_permissions_payload(payload)
    permissions_json = json.dumps(permissions)

    setting = db.query(AppSetting).filter(AppSetting.key == "permissions").first()
    if setting is None:
        setting = AppSetting(key="permissions", value_json=permissions_json)
        db.add(setting)
    else:
        setting.value_json = permissions_json

    db.commit()
    return {"success": True}
