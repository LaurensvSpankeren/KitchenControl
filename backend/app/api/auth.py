from datetime import datetime, timezone
import hashlib
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.activation_code import ActivationCode
from app.models.user import SUPERVISOR_ROLE, User
from app.models.user_session import UserSession
from app.services.auth_service import (
    authenticate_user,
    create_session_for_user,
    get_required_session,
    get_required_user,
    invalidate_session,
)
from app.services.user_security import hash_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _normalize_email(value: str | None) -> str:
    return str(value or "").strip().lower()


def _normalize_code(value: str | None) -> str:
    return str(value or "").strip().upper()


def _hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _is_activation_code_expired(item: ActivationCode) -> bool:
    expires_at = _ensure_aware(item.expires_at)
    if expires_at is None:
        return False
    return expires_at < _utcnow()


def _extract_bearer_token(authorization: str | None) -> str | None:
    value = str(authorization or "").strip()
    if not value:
        return None

    scheme, _, token = value.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
    }


def get_current_session(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> UserSession:
    return get_required_session(db, _extract_bearer_token(authorization))


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    return get_required_user(db, _extract_bearer_token(authorization))


def require_roles(*allowed_roles: str):
    allowed = {str(role).strip() for role in allowed_roles if str(role).strip()}

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return dependency


require_supervisor = require_roles(SUPERVISOR_ROLE)


@router.post("/login")
def login(payload: dict, db: Session = Depends(get_db)) -> dict:
    email = str(payload.get("email") or "").strip()
    password = str(payload.get("password") or "")
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    user = authenticate_user(db, email, password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_session_for_user(db, user)
    return {
        "token": token,
        "user": _serialize_user(user),
    }


@router.post("/signup-with-activation-code")
def signup_with_activation_code(payload: dict, db: Session = Depends(get_db)) -> dict:
    code = _normalize_code(payload.get("code"))
    first_name = str(payload.get("first_name") or "").strip()
    last_name = str(payload.get("last_name") or "").strip()
    email = _normalize_email(payload.get("email"))
    password = str(payload.get("password") or "")
    password_repeat = str(payload.get("password_repeat") or "")

    if not code:
        raise HTTPException(status_code=400, detail="Activation code is required")
    if not first_name:
        raise HTTPException(status_code=400, detail="First name is required")
    if not last_name:
        raise HTTPException(status_code=400, detail="Last name is required")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")
    if password != password_repeat:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    activation_code = (
        db.query(ActivationCode)
        .filter(ActivationCode.code == code)
        .with_for_update()
        .first()
    )
    if activation_code is None:
        raise HTTPException(status_code=400, detail="Activation code is invalid")
    if activation_code.is_used:
        raise HTTPException(status_code=400, detail="Activation code has already been used")
    if _is_activation_code_expired(activation_code):
        raise HTTPException(status_code=400, detail="Activation code has expired")

    existing_user = db.query(User.id).filter(User.email == email).first()
    if existing_user is not None:
        raise HTTPException(status_code=400, detail="Email already exists")

    name = f"{first_name} {last_name}".strip()

    try:
        user = User(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role=activation_code.role,
            is_active=True,
            deactivated_at=None,
        )
        db.add(user)
        db.flush()

        activation_code.is_used = True
        activation_code.used_at = _utcnow()
        activation_code.used_by_user_id = user.id
        db.add(activation_code)

        raw_token = secrets.token_urlsafe(32)
        session = UserSession(
            user_id=user.id,
            token_hash=_hash_session_token(raw_token),
            is_active=True,
            invalidated_at=None,
            last_activity_at=_utcnow(),
        )
        db.add(session)
        db.commit()
        db.refresh(user)
    except HTTPException:
        db.rollback()
        raise
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Email already exists") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Signup with activation code failed") from exc

    return {
        "token": raw_token,
        "user": _serialize_user(user),
    }


@router.post("/logout")
def logout(
    session: UserSession = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> dict:
    invalidate_session(db, session)
    db.commit()
    return {"status": "logged_out"}


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict:
    return _serialize_user(user)
