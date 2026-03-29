from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.user_session import UserSession
from app.services.user_security import verify_password

SESSION_TIMEOUT_MINUTES = 30


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(email: str | None) -> str:
    return str(email or "").strip().lower()


def _hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _ensure_aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def is_session_expired(session: UserSession, now: datetime | None = None) -> bool:
    reference = now or _utcnow()
    last_activity_at = _ensure_aware(session.last_activity_at)
    if last_activity_at is None:
        return True
    return last_activity_at + timedelta(minutes=SESSION_TIMEOUT_MINUTES) < reference


def invalidate_session(db: Session, session: UserSession) -> UserSession:
    if session.is_active:
        session.is_active = False
        session.invalidated_at = _utcnow()
        db.add(session)
    return session


def invalidate_user_sessions(db: Session, user_id: int) -> int:
    sessions = (
        db.query(UserSession)
        .filter(UserSession.user_id == user_id, UserSession.is_active.is_(True))
        .all()
    )
    for session in sessions:
        invalidate_session(db, session)
    return len(sessions)


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    normalized_email = _normalize_email(email)
    if not normalized_email or not password:
        return None

    user = db.query(User).filter(User.email == normalized_email).first()
    if user is None or not user.is_active:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user


def create_session_for_user(db: Session, user: User) -> str:
    invalidate_user_sessions(db, user.id)

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
    db.refresh(session)
    return raw_token


def get_session_from_bearer_token(db: Session, token: str | None) -> UserSession | None:
    normalized_token = str(token or "").strip()
    if not normalized_token:
        return None

    token_hash = _hash_session_token(normalized_token)
    session = (
        db.query(UserSession)
        .filter(UserSession.token_hash == token_hash, UserSession.is_active.is_(True))
        .first()
    )
    if session is None:
        return None

    if is_session_expired(session):
        invalidate_session(db, session)
        db.commit()
        return None

    session.last_activity_at = _utcnow()
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_user_from_bearer_token(db: Session, token: str | None) -> User | None:
    session = get_session_from_bearer_token(db, token)
    if session is None:
        return None

    user = db.query(User).filter(User.id == session.user_id).first()
    if user is None or not user.is_active:
        invalidate_session(db, session)
        db.commit()
        return None

    return user


def get_required_session(db: Session, token: str | None) -> UserSession:
    session = get_session_from_bearer_token(db, token)
    if session is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return session


def get_required_user(db: Session, token: str | None) -> User:
    user = get_user_from_bearer_token(db, token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user
