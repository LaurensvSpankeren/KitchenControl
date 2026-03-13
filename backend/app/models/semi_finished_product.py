from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class SemiFinishedProduct(Base):
    __tablename__ = "semi_finished_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    subcategory: Mapped[str | None] = mapped_column(String(100), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    yield_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    waste_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    final_yield_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    final_yield_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    shelf_life_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shelf_life_after_preparation_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    storage_advice: Mapped[str | None] = mapped_column(Text, nullable=True)
    preparation_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
