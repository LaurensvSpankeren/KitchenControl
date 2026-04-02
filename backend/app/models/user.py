import json
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, Session, mapped_column, validates

from app.db.base_class import Base
from app.models.app_setting import AppSetting

USER_ROLES = (
    "Supervisor",
    "Chef",
    "Kok",
    "Keukenhulp",
    "Bediening",
)
DEFAULT_PERMISSIONS = {
    "gerechten.bekijken": ["Supervisor", "Chef", "Kok", "Keukenhulp", "Bediening"],
    "gerechten.aanmaken": ["Supervisor", "Chef", "Kok"],
    "gerechten.wijzigen": ["Supervisor", "Chef", "Kok"],
    "gerechten.verwijderen": ["Supervisor"],
    "gerechten.archiveren": ["Supervisor"],
    "gerechten.dupliceren": ["Supervisor", "Chef", "Kok"],
    "gerechten.herstellen": ["Supervisor"],
    "ingredienten.bekijken": ["Supervisor", "Chef", "Kok", "Keukenhulp", "Bediening"],
    "ingredienten.aanmaken": ["Supervisor", "Chef", "Kok"],
    "ingredienten.wijzigen": ["Supervisor", "Chef", "Kok"],
    "ingredienten.archiveren": ["Supervisor"],
    "ingredienten.verwijderen": ["Supervisor"],
    "importbeheer.bekijken": ["Supervisor", "Chef", "Kok"],
    "importbeheer.importeren": ["Supervisor", "Chef"],
    "importbeheer.matchen": ["Supervisor", "Chef", "Kok"],
    "importbeheer.opschonen": ["Supervisor"],
    "importbeheer.samenvoegen": ["Supervisor"],
    "halffabricaten.verwijderen": ["Supervisor"],
    "halffabricaten.archiveren": ["Supervisor"],
    "halffabricaten.dupliceren": ["Supervisor", "Chef", "Kok"],
    "halffabricaten.herstellen": ["Supervisor"],
    "halffabricaten.bekijken": ["Supervisor", "Chef", "Kok", "Keukenhulp", "Bediening"],
    "halffabricaten.aanmaken": ["Supervisor", "Chef", "Kok"],
    "halffabricaten.wijzigen": ["Supervisor", "Chef", "Kok"],
    "menukaarten.verwijderen": ["Supervisor"],
    "menukaarten.archiveren": ["Supervisor"],
    "menukaarten.dupliceren": ["Supervisor", "Chef", "Kok"],
    "menukaarten.herstellen": ["Supervisor"],
    "menukaarten.bekijken": ["Supervisor", "Chef", "Kok", "Keukenhulp", "Bediening"],
    "menukaarten.aanmaken": ["Supervisor", "Chef", "Kok"],
    "menukaarten.wijzigen": ["Supervisor", "Chef", "Kok"],
}
PERMISSIONS = DEFAULT_PERMISSIONS
SUPERVISOR_ROLE = "Supervisor"


def get_permissions_from_db(db: Session) -> dict:
    setting = db.query(AppSetting).filter(AppSetting.key == "permissions").first()
    if setting is None:
        return DEFAULT_PERMISSIONS

    try:
        permissions = json.loads(setting.value_json)
    except (TypeError, ValueError):
        return DEFAULT_PERMISSIONS

    if not isinstance(permissions, dict):
        return DEFAULT_PERMISSIONS

    return permissions


def has_permission(user, permission_key: str, db: Session) -> bool:
    if not user:
        return False
    permissions = get_permissions_from_db(db)
    allowed_roles = permissions.get(permission_key, [])
    return user.role in allowed_roles


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @validates("email")
    def validate_email(self, _key: str, value: str) -> str:
        normalized = str(value or "").strip().lower()
        if not normalized:
            raise ValueError("Email is required")
        return normalized

    @validates("role")
    def validate_role(self, _key: str, value: str) -> str:
        normalized = str(value or "").strip()
        if normalized not in USER_ROLES:
            raise ValueError(f"Invalid role: {normalized}")
        return normalized
