from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class IngredientPriceHistory(Base):
    __tablename__ = "ingredient_price_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ingredient_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("ingredients.id"), nullable=False, index=True
    )
    supplier_product_code: Mapped[str] = mapped_column(String(100), nullable=False)
    supplier_product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    supplier_price_ex_vat: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    base_price_per_unit_ex_vat: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    base_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    supplier_vat_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
