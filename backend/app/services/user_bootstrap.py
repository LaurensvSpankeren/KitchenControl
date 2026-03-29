import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import SUPERVISOR_ROLE, User
from app.services.user_security import hash_password

logger = logging.getLogger(__name__)


def count_active_supervisors(db: Session) -> int:
    return (
        db.query(User)
        .filter(User.is_active.is_(True), User.role == SUPERVISOR_ROLE)
        .count()
    )


def ensure_not_last_active_supervisor(
    user: User,
    next_is_active: bool,
    next_role: str,
    db: Session,
) -> None:
    is_current_active_supervisor = user.is_active and user.role == SUPERVISOR_ROLE
    will_remain_active_supervisor = bool(next_is_active) and next_role == SUPERVISOR_ROLE

    if not is_current_active_supervisor or will_remain_active_supervisor:
        return

    if count_active_supervisors(db) <= 1:
        raise ValueError("At least one active Supervisor must remain.")


def apply_user_active_state(user: User, is_active: bool) -> None:
    user.is_active = bool(is_active)
    user.deactivated_at = None if user.is_active else datetime.now(timezone.utc)


def bootstrap_supervisor_if_needed(db: Session) -> bool:
    has_users = db.query(User.id).limit(1).first() is not None
    if has_users:
        return False

    name = settings.bootstrap_supervisor_name
    email = settings.bootstrap_supervisor_email
    password = settings.bootstrap_supervisor_password

    if not (name and email and password):
        logger.info("Supervisor bootstrap skipped: required environment variables are incomplete.")
        return False

    user = User(
        name=name.strip(),
        email=email.strip().lower(),
        password_hash=hash_password(password),
        role=SUPERVISOR_ROLE,
        is_active=True,
        deactivated_at=None,
    )
    db.add(user)
    db.commit()
    logger.info("Initial supervisor account bootstrapped.")
    return True
