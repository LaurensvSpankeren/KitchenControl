from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import SUPERVISOR_ROLE, User
from app.models.user_session import UserSession
from app.services.auth_service import (
    authenticate_user,
    create_session_for_user,
    get_required_session,
    get_required_user,
    invalidate_session,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
