from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class IngredientImportBatch(Base):
    __tablename__ = "ingredient_import_batch"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="completed", server_default="completed")
    total_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    updated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    issue_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
