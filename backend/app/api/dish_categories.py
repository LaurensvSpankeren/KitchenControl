from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.dish_category import DishCategory
from app.models.dish_subcategory import DishSubcategory

router = APIRouter()


def _normalize_name(value: str | None) -> str:
    return (value or "").strip()


@router.get("/api/dish-categories", tags=["dish-categories"])
def list_dish_categories(db: Session = Depends(get_db)) -> list[dict]:
    categories = db.query(DishCategory).order_by(DishCategory.name.asc()).all()

    result: list[dict] = []
    for category in categories:
        subcategories = (
            db.query(DishSubcategory)
            .filter(DishSubcategory.category_id == category.id)
            .order_by(DishSubcategory.name.asc())
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


@router.post("/api/dish-categories", tags=["dish-categories"])
def create_dish_category(payload: dict, db: Session = Depends(get_db)) -> dict:
    name = _normalize_name(payload.get("name"))
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")

    existing = (
        db.query(DishCategory)
        .filter(func.lower(DishCategory.name) == name.lower())
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=400, detail="Category already exists")

    category = DishCategory(name=name)
    db.add(category)
    db.commit()
    db.refresh(category)

    return {"id": category.id, "name": category.name}


@router.post("/api/dish-categories/{category_id}/subcategories", tags=["dish-categories"])
def create_dish_subcategory(
    category_id: int, payload: dict, db: Session = Depends(get_db)
) -> dict:
    name = _normalize_name(payload.get("name"))
    if not name:
        raise HTTPException(status_code=400, detail="Subcategory name is required")

    category = db.query(DishCategory).filter(DishCategory.id == category_id).first()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")

    existing = (
        db.query(DishSubcategory)
        .filter(
            DishSubcategory.category_id == category_id,
            func.lower(DishSubcategory.name) == name.lower(),
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=400, detail="Subcategory already exists for this category")

    subcategory = DishSubcategory(category_id=category_id, name=name)
    db.add(subcategory)
    db.commit()
    db.refresh(subcategory)

    return {
        "id": subcategory.id,
        "category_id": subcategory.category_id,
        "name": subcategory.name,
    }
