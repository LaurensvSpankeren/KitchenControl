from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base


class SemiFinishedSubcategory(Base):
    __tablename__ = "semi_finished_subcategories"
    __table_args__ = (
        UniqueConstraint("category_id", "name", name="uq_semi_finished_subcategories_category_name"),
        Index("ix_semi_finished_subcategories_category_id", "category_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    category_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("semi_finished_categories.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
