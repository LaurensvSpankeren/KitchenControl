from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base


class MenukaartGerecht(Base):
    __tablename__ = "menukaart_gerechten"
    __table_args__ = (
        UniqueConstraint("menukaart_id", "gerecht_id", name="uq_menukaart_gerechten_menu_dish"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    menukaart_id: Mapped[int] = mapped_column(ForeignKey("menukaarten.id"), nullable=False, index=True)
    gerecht_id: Mapped[int] = mapped_column(ForeignKey("dishes.id"), nullable=False, index=True)
    menukaart_sectie_id: Mapped[int | None] = mapped_column(
        ForeignKey("menukaart_secties.id"), nullable=True, index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    menukaart = relationship("Menukaart", back_populates="gerecht_links")
    gerecht = relationship("Dish", back_populates="menukaart_links")
    sectie = relationship("MenukaartSectie", back_populates="gerechten")
