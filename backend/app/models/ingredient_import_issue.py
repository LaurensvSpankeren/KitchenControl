from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class IngredientImportIssue(Base):
    __tablename__ = "ingredient_import_issue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    import_batch_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("ingredient_import_batch.id"), nullable=False, index=True
    )
    ingredient_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("ingredients.id"), nullable=True, index=True
    )
    supplier_product_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    supplier_product_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    issue_type: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="open", server_default="open")
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution_action: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resolution_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
