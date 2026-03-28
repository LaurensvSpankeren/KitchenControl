from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class MenukaartSectie(Base):
    __tablename__ = "menukaart_secties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    menukaart_id: Mapped[int] = mapped_column(ForeignKey("menukaarten.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    menukaart = relationship("Menukaart", back_populates="secties")
    gerechten = relationship(
        "MenukaartGerecht",
        back_populates="sectie",
        order_by="MenukaartGerecht.sort_order",
    )
