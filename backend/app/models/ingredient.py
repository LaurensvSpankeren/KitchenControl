from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class Ingredient(Base):
    __tablename__ = "ingredients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    supplier_name: Mapped[str] = mapped_column(String(255), nullable=False)
    supplier_product_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    supplier_product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    supplier_brand: Mapped[str | None] = mapped_column(String(255), nullable=True)
    supplier_pack_description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    supplier_unit: Mapped[str] = mapped_column(String(50), nullable=False)
    supplier_net_content: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    packaging_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    units_per_package: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    net_content_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    net_content_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    calculation_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    calculation_quantity_per_package: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    preferred_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    secondary_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    secondary_unit_factor: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    supplier_price_ex_vat: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    supplier_vat_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    supplier_allergens_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    supplier_last_imported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    internal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    internal_allergens_extra: Mapped[str | None] = mapped_column(Text, nullable=True)
    cross_contamination_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    base_unit: Mapped[str] = mapped_column(String(50), nullable=False)
    conversion_factor_to_base: Mapped[Decimal] = mapped_column(
        Numeric(12, 6), nullable=False, default=Decimal("1.0"), server_default="1.0"
    )
    yield_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    waste_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)

    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
