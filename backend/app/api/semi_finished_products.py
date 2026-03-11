from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.ingredient import Ingredient
from app.models.recipe_line import RecipeLine
from app.models.semi_finished_product import SemiFinishedProduct

router = APIRouter()


def _serialize_semi_finished_product(item: SemiFinishedProduct) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "yield_percent": float(item.yield_percent) if item.yield_percent is not None else None,
        "waste_percent": float(item.waste_percent) if item.waste_percent is not None else None,
        "shelf_life_days": item.shelf_life_days,
        "preparation_notes": item.preparation_notes,
        "created_at": item.created_at.isoformat() if item.created_at is not None else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at is not None else None,
    }


def _calculate_recipe_line_cost(line: RecipeLine, db: Session) -> float | None:
    if line.item_type == "ingredient":
        ingredient = db.query(Ingredient).filter(Ingredient.id == line.item_id).first()
        if (
            ingredient is None
            or ingredient.supplier_price_ex_vat is None
            or ingredient.conversion_factor_to_base is None
            or ingredient.conversion_factor_to_base == 0
        ):
            return None
        line_cost = (
            Decimal(line.quantity)
            * Decimal(ingredient.supplier_price_ex_vat)
            / Decimal(ingredient.conversion_factor_to_base)
        )
        return float(line_cost)
    return None


@router.get("/api/semi-finished-products", tags=["semi-finished-products"])
def list_semi_finished_products(db: Session = Depends(get_db)) -> list[dict]:
    items = db.query(SemiFinishedProduct).order_by(SemiFinishedProduct.name.asc()).all()
    return [_serialize_semi_finished_product(item) for item in items]


@router.post("/api/semi-finished-products", tags=["semi-finished-products"])
def create_semi_finished_product(payload: dict, db: Session = Depends(get_db)) -> dict:
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Missing required field: name")

    item = SemiFinishedProduct(
        name=name,
        description=payload.get("description"),
        yield_percent=payload.get("yield_percent"),
        waste_percent=payload.get("waste_percent"),
        shelf_life_days=payload.get("shelf_life_days"),
        preparation_notes=payload.get("preparation_notes"),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_semi_finished_product(item)


@router.post(
    "/api/semi-finished-products/{semi_finished_product_id}/recipe-lines",
    tags=["semi-finished-products"],
)
def add_semi_finished_product_recipe_line(
    semi_finished_product_id: int, payload: dict, db: Session = Depends(get_db)
) -> dict:
    item_type = (payload.get("item_type") or "").strip()
    if item_type not in {"ingredient", "semi_finished_product"}:
        raise HTTPException(
            status_code=400,
            detail="item_type must be 'ingredient' or 'semi_finished_product'",
        )

    required_fields = ["item_type", "item_id", "quantity", "unit"]
    missing_fields = [field for field in required_fields if payload.get(field) in (None, "")]
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing_fields)}",
        )

    parent = db.query(SemiFinishedProduct).filter(SemiFinishedProduct.id == semi_finished_product_id).first()
    if parent is None:
        raise HTTPException(status_code=404, detail="Semi finished product not found")

    recipe_line = RecipeLine(
        parent_type="semi_finished_product",
        parent_id=semi_finished_product_id,
        item_type=item_type,
        item_id=int(payload["item_id"]),
        quantity=payload["quantity"],
        unit=payload["unit"],
        sort_order=int(payload.get("sort_order", 0)),
    )
    db.add(recipe_line)
    db.commit()
    db.refresh(recipe_line)

    return {
        "id": recipe_line.id,
        "parent_type": recipe_line.parent_type,
        "parent_id": recipe_line.parent_id,
        "item_type": recipe_line.item_type,
        "item_id": recipe_line.item_id,
        "quantity": float(recipe_line.quantity),
        "unit": recipe_line.unit,
        "sort_order": recipe_line.sort_order,
        "created_at": recipe_line.created_at.isoformat() if recipe_line.created_at is not None else None,
        "updated_at": recipe_line.updated_at.isoformat() if recipe_line.updated_at is not None else None,
    }


@router.get("/api/semi-finished-products/{semi_finished_product_id}", tags=["semi-finished-products"])
def get_semi_finished_product_detail(semi_finished_product_id: int, db: Session = Depends(get_db)) -> dict:
    item = db.query(SemiFinishedProduct).filter(SemiFinishedProduct.id == semi_finished_product_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Semi finished product not found")

    recipe_lines = (
        db.query(RecipeLine)
        .filter(
            RecipeLine.parent_type == "semi_finished_product",
            RecipeLine.parent_id == semi_finished_product_id,
        )
        .order_by(RecipeLine.sort_order.asc(), RecipeLine.id.asc())
        .all()
    )

    estimated_cost_total = Decimal("0")
    has_cost_components = False
    serialized_lines: list[dict] = []

    for line in recipe_lines:
        line_cost = _calculate_recipe_line_cost(line, db)
        if line_cost is not None:
            estimated_cost_total += Decimal(str(line_cost))
            has_cost_components = True

        serialized_lines.append(
            {
                "id": line.id,
                "item_type": line.item_type,
                "item_id": line.item_id,
                "quantity": float(line.quantity),
                "unit": line.unit,
                "sort_order": line.sort_order,
            }
        )

    response = _serialize_semi_finished_product(item)
    response["recipe_lines"] = serialized_lines
    response["estimated_cost_total"] = float(estimated_cost_total) if has_cost_components else None
    return response
