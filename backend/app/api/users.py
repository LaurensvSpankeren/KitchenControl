from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import require_supervisor
from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import invalidate_user_sessions
from app.services.user_bootstrap import (
    apply_user_active_state,
    ensure_not_last_active_supervisor,
)
from app.services.user_security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


def _normalize_email(email: str | None) -> str:
    return str(email or "").strip().lower()


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "deactivated_at": user.deactivated_at.isoformat() if user.deactivated_at is not None else None,
    }


@router.get("")
def list_users(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_supervisor),
) -> list[dict]:
    users = db.query(User).order_by(User.name.asc(), User.id.asc()).all()
    return [_serialize_user(user) for user in users]


@router.post("")
def create_user(
    payload: dict,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_supervisor),
) -> dict:
    name = str(payload.get("name") or "").strip()
    email = _normalize_email(payload.get("email"))
    password = str(payload.get("password") or "")
    role = str(payload.get("role") or "").strip()

    if not name or not email or not password or not role:
        raise HTTPException(status_code=400, detail="Name, email, password and role are required")

    existing_user = db.query(User.id).filter(User.email == email).first()
    if existing_user is not None:
        raise HTTPException(status_code=400, detail="Email already exists")

    try:
        user = User(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role=role,
            is_active=True,
            deactivated_at=None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.add(user)
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.put("/{user_id}")
def update_user(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_supervisor),
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    name = str(payload.get("name") or "").strip()
    email = _normalize_email(payload.get("email"))
    role = str(payload.get("role") or "").strip()

    if not name or not email or not role:
        raise HTTPException(status_code=400, detail="Name, email and role are required")

    existing_user = (
        db.query(User.id)
        .filter(User.email == email, User.id != user_id)
        .first()
    )
    if existing_user is not None:
        raise HTTPException(status_code=400, detail="Email already exists")

    try:
        ensure_not_last_active_supervisor(
            user=user,
            next_is_active=user.is_active,
            next_role=role,
            db=db,
        )
        user.name = name
        user.email = email
        user.role = role
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.add(user)
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.post("/{user_id}/password")
def update_user_password(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_supervisor),
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    password = str(payload.get("password") or "")
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")

    try:
        user.password_hash = hash_password(password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    invalidate_user_sessions(db, user.id)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.post("/{user_id}/deactivate")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_supervisor),
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="User is already inactive")

    try:
        ensure_not_last_active_supervisor(
            user=user,
            next_is_active=False,
            next_role=user.role,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    apply_user_active_state(user, False)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.post("/{user_id}/reactivate")
def reactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_supervisor),
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_active:
        raise HTTPException(status_code=400, detail="User is already active")

    apply_user_active_state(user, True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _serialize_user(user)
