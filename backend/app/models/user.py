from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.db.base_class import Base

USER_ROLES = (
    "Supervisor",
    "Chef",
    "Kok",
    "Keukenhulp",
    "Bediening",
)
SUPERVISOR_ROLE = "Supervisor"


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
