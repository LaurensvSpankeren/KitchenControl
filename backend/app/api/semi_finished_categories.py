from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.semi_finished_category import SemiFinishedCategory
from app.models.semi_finished_subcategory import SemiFinishedSubcategory

router = APIRouter()


def _normalize_name(value: str | None) -> str:
    return (value or "").strip()


@router.get("/api/semi-finished-categories", tags=["semi-finished-categories"])
def list_semi_finished_categories(db: Session = Depends(get_db)) -> list[dict]:
    categories = db.query(SemiFinishedCategory).order_by(SemiFinishedCategory.name.asc()).all()

    result: list[dict] = []
    for category in categories:
        subcategories = (
            db.query(SemiFinishedSubcategory)
            .filter(SemiFinishedSubcategory.category_id == category.id)
            .order_by(SemiFinishedSubcategory.name.asc())
            .all()
        )
        result.append(
            {
                "id": category.id,
                "name": category.name,
                "subcategories": [
                    {"id": subcategory.id, "name": subcategory.name}
                    for subcategory in subcategories
                ],
            }
        )

    return result


@router.post("/api/semi-finished-categories", tags=["semi-finished-categories"])
def create_semi_finished_category(payload: dict, db: Session = Depends(get_db)) -> dict:
    name = _normalize_name(payload.get("name"))
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")

    existing = (
        db.query(SemiFinishedCategory)
        .filter(func.lower(SemiFinishedCategory.name) == name.lower())
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=400, detail="Category already exists")

    category = SemiFinishedCategory(name=name)
    db.add(category)
    db.commit()
    db.refresh(category)

    return {"id": category.id, "name": category.name}


@router.post(
    "/api/semi-finished-categories/{category_id}/subcategories",
    tags=["semi-finished-categories"],
)
def create_semi_finished_subcategory(
    category_id: int, payload: dict, db: Session = Depends(get_db)
) -> dict:
    name = _normalize_name(payload.get("name"))
    if not name:
        raise HTTPException(status_code=400, detail="Subcategory name is required")

    category = db.query(SemiFinishedCategory).filter(SemiFinishedCategory.id == category_id).first()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")

    existing = (
        db.query(SemiFinishedSubcategory)
        .filter(
            SemiFinishedSubcategory.category_id == category_id,
            func.lower(SemiFinishedSubcategory.name) == name.lower(),
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=400, detail="Subcategory already exists for this category")

    subcategory = SemiFinishedSubcategory(category_id=category_id, name=name)
    db.add(subcategory)
    db.commit()
    db.refresh(subcategory)

    return {
        "id": subcategory.id,
        "category_id": subcategory.category_id,
        "name": subcategory.name,
    }
