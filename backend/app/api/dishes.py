from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.dish import Dish
from app.models.recipe_line import RecipeLine
from app.models.recipe_step import RecipeStep

router = APIRouter()


def _parse_optional_float(payload: dict, field_name: str) -> float | None:
    value = payload.get(field_name)
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid numeric value for field: {field_name}",
        ) from exc


def _parse_optional_int(payload: dict, field_name: str) -> int | None:
    value = payload.get(field_name)
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid integer value for field: {field_name}",
        ) from exc


def _serialize_recipe_steps(steps: list[RecipeStep]) -> list[dict]:
    return [
        {
            "id": step.id,
            "step_number": step.step_number,
            "instruction": step.instruction,
            "created_at": step.created_at.isoformat() if step.created_at is not None else None,
            "updated_at": step.updated_at.isoformat() if step.updated_at is not None else None,
        }
        for step in steps
    ]


def _serialize_recipe_lines(lines: list[RecipeLine]) -> list[dict]:
    return [
        {
            "id": line.id,
            "parent_type": line.parent_type,
            "parent_id": line.parent_id,
            "item_type": line.item_type,
            "item_id": line.item_id,
            "quantity": float(line.quantity),
            "unit": line.unit,
            "sort_order": line.sort_order,
            "created_at": line.created_at.isoformat() if line.created_at is not None else None,
            "updated_at": line.updated_at.isoformat() if line.updated_at is not None else None,
        }
        for line in lines
    ]


def _serialize_dish(item: Dish) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "menu_name": item.menu_name,
        "menu_description": item.menu_description,
        "category_id": item.category_id,
        "subcategory_id": item.subcategory_id,
        "photo_path": item.photo_path,
        "vat_rate": float(item.vat_rate) if item.vat_rate is not None else None,
        "sale_price_incl_vat": float(item.sale_price_incl_vat)
        if item.sale_price_incl_vat is not None
        else None,
        "kitchen_note": item.kitchen_note,
        "plating_advice": item.plating_advice,
        "is_archived": item.is_archived,
        "created_at": item.created_at.isoformat() if item.created_at is not None else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at is not None else None,
    }


def _apply_dish_payload(item: Dish, payload: dict) -> None:
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Missing required field: name")

    item.name = name
    item.menu_name = (payload.get("menu_name") or "").strip() or None
    item.menu_description = payload.get("menu_description") or None
    item.photo_path = payload.get("photo_path") or None
    item.kitchen_note = payload.get("kitchen_note") or None
    item.plating_advice = payload.get("plating_advice") or None

    item.category_id = _parse_optional_int(payload, "category_id")
    item.subcategory_id = _parse_optional_int(payload, "subcategory_id")
    item.vat_rate = _parse_optional_float(payload, "vat_rate")
    item.sale_price_incl_vat = _parse_optional_float(payload, "sale_price_incl_vat")


def _build_duplicate_name(db: Session, original_name: str) -> str:
    base_name = (original_name or "").strip() or "Gerecht"
    candidate = f"{base_name} kopie"
    exists = db.query(Dish.id).filter(Dish.name == candidate).first()
    if exists is None:
        return candidate

    index = 2
    while True:
        candidate = f"{base_name} kopie {index}"
        exists = db.query(Dish.id).filter(Dish.name == candidate).first()
        if exists is None:
            return candidate
        index += 1


def _build_dish_detail(db: Session, item: Dish) -> dict:
    lines = (
        db.query(RecipeLine)
        .filter(RecipeLine.parent_type == "dish", RecipeLine.parent_id == item.id)
        .order_by(RecipeLine.sort_order.asc(), RecipeLine.id.asc())
        .all()
    )
    steps = (
        db.query(RecipeStep)
        .filter(RecipeStep.parent_type == "dish", RecipeStep.parent_id == item.id)
        .order_by(RecipeStep.step_number.asc(), RecipeStep.id.asc())
        .all()
    )

    response = _serialize_dish(item)
    response["recipe_lines"] = _serialize_recipe_lines(lines)
    response["recipe_steps"] = _serialize_recipe_steps(steps)
    return response


@router.get("/api/dishes", tags=["dishes"])
def list_dishes(db: Session = Depends(get_db)) -> list[dict]:
    items = db.query(Dish).filter(Dish.is_archived.is_(False)).order_by(Dish.name.asc()).all()
    return [_serialize_dish(item) for item in items]


@router.get("/api/dishes/archived", tags=["dishes"])
def list_archived_dishes(db: Session = Depends(get_db)) -> list[dict]:
    items = db.query(Dish).filter(Dish.is_archived.is_(True)).order_by(Dish.name.asc()).all()
    return [_serialize_dish(item) for item in items]


@router.post("/api/dishes", tags=["dishes"])
def create_dish(payload: dict, db: Session = Depends(get_db)) -> dict:
    item = Dish(name="tmp")
    _apply_dish_payload(item, payload)

    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_dish(item)


@router.put("/api/dishes/{dish_id}", tags=["dishes"])
def update_dish(dish_id: int, payload: dict, db: Session = Depends(get_db)) -> dict:
    item = db.query(Dish).filter(Dish.id == dish_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    _apply_dish_payload(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_dish(item)


@router.put("/api/dishes/{dish_id}/archive", tags=["dishes"])
def archive_dish(dish_id: int, db: Session = Depends(get_db)) -> dict:
    item = db.query(Dish).filter(Dish.id == dish_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    item.is_archived = True
    db.commit()
    db.refresh(item)
    return _serialize_dish(item)


@router.put("/api/dishes/{dish_id}/restore", tags=["dishes"])
def restore_dish(dish_id: int, db: Session = Depends(get_db)) -> dict:
    item = db.query(Dish).filter(Dish.id == dish_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    item.is_archived = False
    db.commit()
    db.refresh(item)
    return _serialize_dish(item)


@router.post("/api/dishes/{dish_id}/duplicate", tags=["dishes"])
def duplicate_dish(dish_id: int, db: Session = Depends(get_db)) -> dict:
    original = db.query(Dish).filter(Dish.id == dish_id).first()
    if original is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    duplicate = Dish(
        name=_build_duplicate_name(db, original.name),
        menu_name=original.menu_name,
        menu_description=original.menu_description,
        category_id=original.category_id,
        subcategory_id=original.subcategory_id,
        photo_path=original.photo_path,
        vat_rate=original.vat_rate,
        sale_price_incl_vat=original.sale_price_incl_vat,
        kitchen_note=original.kitchen_note,
        plating_advice=original.plating_advice,
        is_archived=False,
    )
    db.add(duplicate)
    db.flush()

    original_lines = (
        db.query(RecipeLine)
        .filter(RecipeLine.parent_type == "dish", RecipeLine.parent_id == dish_id)
        .order_by(RecipeLine.sort_order.asc(), RecipeLine.id.asc())
        .all()
    )
    for line in original_lines:
        db.add(
            RecipeLine(
                parent_type="dish",
                parent_id=duplicate.id,
                item_type=line.item_type,
                item_id=line.item_id,
                quantity=line.quantity,
                unit=line.unit,
                sort_order=line.sort_order,
            )
        )

    original_steps = (
        db.query(RecipeStep)
        .filter(RecipeStep.parent_type == "dish", RecipeStep.parent_id == dish_id)
        .order_by(RecipeStep.step_number.asc(), RecipeStep.id.asc())
        .all()
    )
    for step in original_steps:
        db.add(
            RecipeStep(
                parent_type="dish",
                parent_id=duplicate.id,
                step_number=step.step_number,
                instruction=step.instruction,
            )
        )

    db.commit()
    db.refresh(duplicate)
    return _serialize_dish(duplicate)


@router.delete("/api/dishes/{dish_id}", tags=["dishes"])
def delete_dish(dish_id: int, db: Session = Depends(get_db)) -> dict:
    item = db.query(Dish).filter(Dish.id == dish_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    (
        db.query(RecipeLine)
        .filter(RecipeLine.parent_type == "dish", RecipeLine.parent_id == dish_id)
        .delete(synchronize_session=False)
    )
    (
        db.query(RecipeStep)
        .filter(RecipeStep.parent_type == "dish", RecipeStep.parent_id == dish_id)
        .delete(synchronize_session=False)
    )

    db.delete(item)
    db.commit()
    return {"status": "deleted", "dish_id": dish_id}


@router.get("/api/dishes/{dish_id}", tags=["dishes"])
def get_dish_detail(dish_id: int, db: Session = Depends(get_db)) -> dict:
    item = db.query(Dish).filter(Dish.id == dish_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    return _build_dish_detail(db, item)
