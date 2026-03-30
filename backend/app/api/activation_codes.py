from datetime import datetime, timezone
import secrets
import string

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import require_supervisor
from app.db.session import get_db
from app.models.activation_code import ActivationCode
from app.models.user import User

router = APIRouter(prefix="/api/activation-codes", tags=["activation-codes"])
auth_router = APIRouter(prefix="/api/auth", tags=["auth"])

CODE_ALPHABET = string.ascii_uppercase + string.digits
CODE_LENGTH = 12


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _normalize_code(value: str | None) -> str:
    return str(value or "").strip().upper()


def _parse_optional_datetime(value: str | None) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    try:
        return _ensure_aware(datetime.fromisoformat(normalized))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid expires_at datetime") from exc


def _generate_activation_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def _serialize_activation_code(item: ActivationCode) -> dict:
    return {
        "id": item.id,
        "code": item.code,
        "role": item.role,
        "is_used": item.is_used,
        "created_at": item.created_at.isoformat() if item.created_at is not None else None,
        "used_at": item.used_at.isoformat() if item.used_at is not None else None,
        "expires_at": item.expires_at.isoformat() if item.expires_at is not None else None,
    }


def _is_activation_code_expired(item: ActivationCode) -> bool:
    expires_at = _ensure_aware(item.expires_at)
    if expires_at is None:
        return False
    return expires_at < _utcnow()


@router.post("")
def create_activation_code(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_supervisor),
) -> dict:
    role = str(payload.get("role") or "").strip()
    expires_at = _parse_optional_datetime(payload.get("expires_at"))
    if not role:
        raise HTTPException(status_code=400, detail="Role is required")

    code = _generate_activation_code()
    while db.query(ActivationCode.id).filter(ActivationCode.code == code).first() is not None:
        code = _generate_activation_code()

    try:
        item = ActivationCode(
            code=code,
            role=role,
            is_used=False,
            used_at=None,
            expires_at=expires_at,
            created_by_user_id=current_user.id,
            used_by_user_id=None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "id": item.id,
        "code": item.code,
        "role": item.role,
        "expires_at": item.expires_at.isoformat() if item.expires_at is not None else None,
        "created_at": item.created_at.isoformat() if item.created_at is not None else None,
    }


@router.get("")
def list_activation_codes(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_supervisor),
) -> list[dict]:
    items = db.query(ActivationCode).order_by(ActivationCode.created_at.desc(), ActivationCode.id.desc()).all()
    return [_serialize_activation_code(item) for item in items]


@auth_router.post("/activation-codes/validate")
def validate_activation_code(
    payload: dict,
    db: Session = Depends(get_db),
) -> dict:
    code = _normalize_code(payload.get("code"))
    if not code:
        return {"valid": False, "role": None}

    item = db.query(ActivationCode).filter(ActivationCode.code == code).first()
    if item is None or item.is_used or _is_activation_code_expired(item):
        return {"valid": False, "role": None}

    return {
        "valid": True,
        "role": item.role,
    }
