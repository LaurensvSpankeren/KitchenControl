from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class Menukaart(Base):
    __tablename__ = "menukaarten"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="concept", server_default="concept"
    )
    is_archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    secties = relationship(
        "MenukaartSectie",
        back_populates="menukaart",
        cascade="all, delete-orphan",
        order_by="MenukaartSectie.sort_order",
    )
    gerecht_links = relationship(
        "MenukaartGerecht",
        back_populates="menukaart",
        cascade="all, delete-orphan",
        order_by="MenukaartGerecht.sort_order",
    )
