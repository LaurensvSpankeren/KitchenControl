from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.ingredient import Ingredient
from app.models.recipe_line import RecipeLine
from app.models.recipe_step import RecipeStep
from app.models.semi_finished_product import SemiFinishedProduct

router = APIRouter()

ALLERGEN_PLACEHOLDERS = {"-", "--", "nvt", "n.v.t.", "geen", "none", "null"}
KNOWN_ALLERGENS = {
    "ei",
    "melk",
    "gluten",
    "selderij",
    "mosterd",
    "sesam",
    "soja",
    "vis",
    "schaaldieren",
    "weekdieren",
    "lupine",
    "tarwe",
    "rogge",
    "gerst",
    "haver",
    "spelt",
    "kamut",
    "pinda",
    "hazelnoten",
    "walnoten",
    "pecannoten",
    "paranoten",
    "macadamianoten",
    "pistachenoten",
    "amandelen",
    "cashewnoten",
    "zwaveldioxide en sulfieten",
    "lactose",
    "boomnoten",
}


def _normalize_unit(value: str | None) -> str | None:
    if value is None:
        return None
    unit = str(value).strip().lower()
    if not unit:
        return None

    mapping = {
        "gr": "gram",
        "g": "gram",
        "gram": "gram",
        "kg": "kg",
        "l": "liter",
        "lt": "liter",
        "liter": "liter",
        "ml": "ml",
        "stuk": "stuk",
        "st": "stuk",
        "stuks": "stuk",
        "pcs": "stuk",
        "pc": "stuk",
    }
    return mapping.get(unit, unit)


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


def _extract_clean_allergens(value: str | None) -> list[str]:
    if not value:
        return []

    normalized_value = value.strip().lower()
    if not normalized_value or normalized_value in ALLERGEN_PLACEHOLDERS:
        return []

    raw_parts = [
        part.strip().lower()
        for part in normalized_value.replace("\n", "|").replace(",", "|").split("|")
    ]
    result: list[str] = []
    for part in raw_parts:
        if not part or part in ALLERGEN_PLACEHOLDERS:
            continue
        if part in KNOWN_ALLERGENS:
            result.append(part)

    # Fallback for free text: pick only explicitly known allergens found in the text.
    if not result:
        for allergen in sorted(KNOWN_ALLERGENS):
            if allergen in normalized_value:
                result.append(allergen)

    return list(dict.fromkeys(result))


def _serialize_semi_finished_product(item: SemiFinishedProduct) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "category": item.category,
        "subcategory": item.subcategory,
        "photo_url": item.photo_url,
        "yield_percent": float(item.yield_percent) if item.yield_percent is not None else None,
        "waste_percent": float(item.waste_percent) if item.waste_percent is not None else None,
        "final_yield_amount": float(item.final_yield_amount) if item.final_yield_amount is not None else None,
        "final_yield_unit": item.final_yield_unit,
        "shelf_life_days": item.shelf_life_days,
        "shelf_life_after_preparation_days": item.shelf_life_after_preparation_days,
        "storage_fridge_days": item.storage_fridge_days,
        "storage_freezer_days": item.storage_freezer_days,
        "storage_notes": item.storage_notes,
        "storage_advice": item.storage_advice,
        "preparation_notes": item.preparation_notes,
        "created_at": item.created_at.isoformat() if item.created_at is not None else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at is not None else None,
    }


def _apply_semi_finished_payload(item: SemiFinishedProduct, payload: dict) -> None:
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Missing required field: name")

    item.name = name
    item.description = payload.get("description") or None
    item.category = payload.get("category") or None
    item.subcategory = payload.get("subcategory") or None
    item.photo_url = payload.get("photo_url") or None
    item.final_yield_unit = payload.get("final_yield_unit") or None
    item.storage_notes = payload.get("storage_notes") or payload.get("storage_advice") or None
    item.storage_advice = payload.get("storage_advice") or payload.get("storage_notes") or None
    item.preparation_notes = payload.get("preparation_notes") or None

    item.yield_percent = _parse_optional_float(payload, "yield_percent")
    item.waste_percent = _parse_optional_float(payload, "waste_percent")
    item.final_yield_amount = _parse_optional_float(payload, "final_yield_amount")
    item.shelf_life_days = _parse_optional_int(payload, "shelf_life_days")
    item.shelf_life_after_preparation_days = _parse_optional_int(
        payload, "shelf_life_after_preparation_days"
    )
    item.storage_fridge_days = _parse_optional_int(payload, "storage_fridge_days")
    item.storage_freezer_days = _parse_optional_int(payload, "storage_freezer_days")


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


def _to_calculation_quantity(line: RecipeLine, ingredient: Ingredient) -> Decimal:
    quantity = Decimal(line.quantity)
    line_unit = _normalize_unit(line.unit)
    calculation_unit = _normalize_unit(ingredient.calculation_unit)

    if line_unit is None or calculation_unit is None or line_unit == calculation_unit:
        return quantity

    preferred_unit = _normalize_unit(ingredient.preferred_unit)
    secondary_unit = _normalize_unit(ingredient.secondary_unit)
    factor = ingredient.secondary_unit_factor

    if (
        preferred_unit is None
        or secondary_unit is None
        or factor is None
        or Decimal(factor) == 0
    ):
        return quantity

    factor_decimal = Decimal(factor)
    if line_unit == preferred_unit and calculation_unit == secondary_unit:
        return quantity * factor_decimal
    if line_unit == secondary_unit and calculation_unit == preferred_unit:
        return quantity / factor_decimal

    return quantity


def _build_recipe_lines_detail(db: Session, semi_finished_product_id: int) -> dict:
    recipe_lines = (
        db.query(RecipeLine)
        .filter(
            RecipeLine.parent_type == "semi_finished_product",
            RecipeLine.parent_id == semi_finished_product_id,
        )
        .order_by(RecipeLine.sort_order.asc(), RecipeLine.id.asc())
        .all()
    )

    serialized_lines: list[dict] = []
    cost_lines: list[dict] = []
    allergens_parts: list[str] = []

    for line in recipe_lines:
        item_name = None
        item_brand = None
        line_cost: float | None = None
        allergens_summary = None

        if line.item_type == "ingredient":
            ingredient = db.query(Ingredient).filter(Ingredient.id == line.item_id).first()
            if ingredient is not None:
                item_name = ingredient.supplier_product_name
                item_brand = ingredient.supplier_brand

                if (
                    ingredient.supplier_price_ex_vat is not None
                    and ingredient.calculation_quantity_per_package is not None
                    and ingredient.calculation_quantity_per_package != 0
                ):
                    quantity_for_cost = _to_calculation_quantity(line, ingredient)
                    cost = (
                        quantity_for_cost
                        * Decimal(ingredient.supplier_price_ex_vat)
                        / Decimal(ingredient.calculation_quantity_per_package)
                    )
                    line_cost = float(cost)
                elif (
                    ingredient.supplier_price_ex_vat is not None
                    and ingredient.conversion_factor_to_base is not None
                    and ingredient.conversion_factor_to_base != 0
                ):
                    # Backward compatibility voor oudere records zonder calculation fields.
                    quantity_for_cost = _to_calculation_quantity(line, ingredient)
                    cost = (
                        quantity_for_cost
                        * Decimal(ingredient.supplier_price_ex_vat)
                        / Decimal(ingredient.conversion_factor_to_base)
                    )
                    line_cost = float(cost)

                allergies: list[str] = []
                for value in [
                    (ingredient.supplier_allergens_raw or "").strip(),
                    (ingredient.internal_allergens_extra or "").strip(),
                    (ingredient.cross_contamination_notes or "").strip(),
                ]:
                    allergies.extend(_extract_clean_allergens(value))
                if allergies:
                    unique_allergies = list(dict.fromkeys(allergies))
                    allergens_summary = " | ".join(unique_allergies)
                    allergens_parts.extend(unique_allergies)
        elif line.item_type == "semi_finished_product":
            nested = db.query(SemiFinishedProduct).filter(SemiFinishedProduct.id == line.item_id).first()
            if nested is not None:
                item_name = nested.name

        serialized_lines.append(
            {
                "id": line.id,
                "item_type": line.item_type,
                "item_id": line.item_id,
                "item_name": item_name,
                "item_brand": item_brand,
                "quantity": float(line.quantity),
                "unit": line.unit,
                "sort_order": line.sort_order,
                "line_cost": line_cost,
                "line_cost_share_percent": None,
                "allergens_summary": allergens_summary,
            }
        )

        if line_cost is not None:
            cost_lines.append({"id": line.id, "line_cost": line_cost})

    estimated_cost_total = float(sum(Decimal(str(c["line_cost"])) for c in cost_lines)) if cost_lines else None

    if estimated_cost_total and estimated_cost_total > 0:
        for serialized in serialized_lines:
            if serialized["line_cost"] is not None:
                serialized["line_cost_share_percent"] = round(
                    (serialized["line_cost"] / estimated_cost_total) * 100, 2
                )

    allergens_total = " | ".join(dict.fromkeys([part for part in allergens_parts if part])) or None

    return {
        "recipe_lines": serialized_lines,
        "estimated_cost_total": estimated_cost_total,
        "allergens_total": allergens_total,
    }


def _build_semi_finished_detail(db: Session, item: SemiFinishedProduct) -> dict:
    lines_data = _build_recipe_lines_detail(db, item.id)
    steps = (
        db.query(RecipeStep)
        .filter(
            RecipeStep.parent_type == "semi_finished_product",
            RecipeStep.parent_id == item.id,
        )
        .order_by(RecipeStep.step_number.asc(), RecipeStep.id.asc())
        .all()
    )

    cost_per_final_unit = None
    if (
        lines_data["estimated_cost_total"] is not None
        and item.final_yield_amount is not None
        and Decimal(item.final_yield_amount) > 0
    ):
        cost_per_final_unit = float(
            Decimal(str(lines_data["estimated_cost_total"])) / Decimal(item.final_yield_amount)
        )

    response = _serialize_semi_finished_product(item)
    response["recipe_lines"] = lines_data["recipe_lines"]
    response["recipe_steps"] = _serialize_recipe_steps(steps)
    response["estimated_cost_total"] = lines_data["estimated_cost_total"]
    response["allergens_total"] = lines_data["allergens_total"]
    response["cost_per_final_unit"] = cost_per_final_unit
    response["totals"] = {
        "estimated_cost_total": lines_data["estimated_cost_total"],
        "allergens_total": lines_data["allergens_total"],
        "final_yield_amount": response["final_yield_amount"],
        "final_yield_unit": response["final_yield_unit"],
        "cost_per_final_unit": cost_per_final_unit,
    }
    return response


@router.get("/api/semi-finished-products", tags=["semi-finished-products"])
def list_semi_finished_products(db: Session = Depends(get_db)) -> list[dict]:
    items = db.query(SemiFinishedProduct).order_by(SemiFinishedProduct.name.asc()).all()

    result = []
    for item in items:
        serialized = _serialize_semi_finished_product(item)
        lines_data = _build_recipe_lines_detail(db, item.id)
        serialized["estimated_cost_total"] = lines_data["estimated_cost_total"]
        serialized["allergens_total"] = lines_data["allergens_total"]
        result.append(serialized)
    return result


@router.post("/api/semi-finished-products", tags=["semi-finished-products"])
def create_semi_finished_product(payload: dict, db: Session = Depends(get_db)) -> dict:
    item = SemiFinishedProduct(name="tmp")
    _apply_semi_finished_payload(item, payload)

    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_semi_finished_product(item)


@router.put("/api/semi-finished-products/{semi_finished_product_id}", tags=["semi-finished-products"])
def update_semi_finished_product(
    semi_finished_product_id: int, payload: dict, db: Session = Depends(get_db)
) -> dict:
    item = db.query(SemiFinishedProduct).filter(SemiFinishedProduct.id == semi_finished_product_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Semi finished product not found")

    _apply_semi_finished_payload(item, payload)
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


@router.put(
    "/api/semi-finished-products/{semi_finished_product_id}/recipe-lines/{recipe_line_id}",
    tags=["semi-finished-products"],
)
def update_semi_finished_product_recipe_line(
    semi_finished_product_id: int,
    recipe_line_id: int,
    payload: dict,
    db: Session = Depends(get_db),
) -> dict:
    parent = db.query(SemiFinishedProduct).filter(SemiFinishedProduct.id == semi_finished_product_id).first()
    if parent is None:
        raise HTTPException(status_code=404, detail="Semi finished product not found")

    line = (
        db.query(RecipeLine)
        .filter(
            RecipeLine.id == recipe_line_id,
            RecipeLine.parent_type == "semi_finished_product",
            RecipeLine.parent_id == semi_finished_product_id,
        )
        .first()
    )
    if line is None:
        raise HTTPException(status_code=404, detail="Recipe line not found")

    if payload.get("quantity") in (None, "") or not str(payload.get("unit", "")).strip():
        raise HTTPException(status_code=400, detail="quantity and unit are required")

    try:
        line.quantity = float(payload["quantity"])
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid quantity") from exc

    line.unit = str(payload["unit"]).strip()
    if "sort_order" in payload and payload.get("sort_order") not in (None, ""):
        try:
            line.sort_order = int(payload["sort_order"])
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Invalid sort_order") from exc

    db.commit()
    db.refresh(line)
    return {
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


@router.delete(
    "/api/semi-finished-products/{semi_finished_product_id}/recipe-lines/{recipe_line_id}",
    tags=["semi-finished-products"],
)
def delete_semi_finished_product_recipe_line(
    semi_finished_product_id: int,
    recipe_line_id: int,
    db: Session = Depends(get_db),
) -> dict:
    parent = db.query(SemiFinishedProduct).filter(SemiFinishedProduct.id == semi_finished_product_id).first()
    if parent is None:
        raise HTTPException(status_code=404, detail="Semi finished product not found")

    line = (
        db.query(RecipeLine)
        .filter(
            RecipeLine.id == recipe_line_id,
            RecipeLine.parent_type == "semi_finished_product",
            RecipeLine.parent_id == semi_finished_product_id,
        )
        .first()
    )
    if line is None:
        raise HTTPException(status_code=404, detail="Recipe line not found")

    db.delete(line)
    db.commit()
    return {"status": "deleted", "recipe_line_id": recipe_line_id}


@router.put("/api/semi-finished-products/{semi_finished_product_id}/recipe-steps", tags=["semi-finished-products"])
def replace_recipe_steps(
    semi_finished_product_id: int, payload: dict, db: Session = Depends(get_db)
) -> dict:
    item = db.query(SemiFinishedProduct).filter(SemiFinishedProduct.id == semi_finished_product_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Semi finished product not found")

    steps_payload = payload.get("steps")
    if not isinstance(steps_payload, list):
        raise HTTPException(status_code=400, detail="steps must be a list")

    (
        db.query(RecipeStep)
        .filter(
            RecipeStep.parent_type == "semi_finished_product",
            RecipeStep.parent_id == semi_finished_product_id,
        )
        .delete(synchronize_session=False)
    )

    created_steps: list[RecipeStep] = []
    for index, step in enumerate(steps_payload, start=1):
        if not isinstance(step, dict):
            continue
        instruction = str(step.get("instruction") or "").strip()
        if not instruction:
            continue

        step_number = step.get("step_number", index)
        try:
            step_number = int(step_number)
        except (TypeError, ValueError):
            step_number = index

        recipe_step = RecipeStep(
            parent_type="semi_finished_product",
            parent_id=semi_finished_product_id,
            step_number=step_number,
            instruction=instruction,
        )
        db.add(recipe_step)
        created_steps.append(recipe_step)

    db.commit()

    refreshed_steps = (
        db.query(RecipeStep)
        .filter(
            RecipeStep.parent_type == "semi_finished_product",
            RecipeStep.parent_id == semi_finished_product_id,
        )
        .order_by(RecipeStep.step_number.asc(), RecipeStep.id.asc())
        .all()
    )
    return {"steps": _serialize_recipe_steps(refreshed_steps)}


@router.get("/api/semi-finished-products/{semi_finished_product_id}", tags=["semi-finished-products"])
def get_semi_finished_product_detail(semi_finished_product_id: int, db: Session = Depends(get_db)) -> dict:
    item = db.query(SemiFinishedProduct).filter(SemiFinishedProduct.id == semi_finished_product_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Semi finished product not found")

    return _build_semi_finished_detail(db, item)


@router.get("/api/semi-finished-products/{semi_finished_product_id}/print", tags=["semi-finished-products"])
def get_semi_finished_product_print_payload(
    semi_finished_product_id: int, db: Session = Depends(get_db)
) -> dict:
    item = db.query(SemiFinishedProduct).filter(SemiFinishedProduct.id == semi_finished_product_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Semi finished product not found")

    detail = _build_semi_finished_detail(db, item)
    return {
        "name": detail["name"],
        "category": detail["category"],
        "subcategory": detail["subcategory"],
        "ingredients": detail["recipe_lines"],
        "recipe_steps": detail["recipe_steps"],
        "inslag_totaal": detail["estimated_cost_total"],
        "allergenen_totaal": detail["allergens_total"],
        "final_yield_amount": detail["final_yield_amount"],
        "final_yield_unit": detail["final_yield_unit"],
        "storage_advice": detail["storage_notes"] or detail["storage_advice"],
        "storage_fridge_days": detail["storage_fridge_days"],
        "storage_freezer_days": detail["storage_freezer_days"],
        "storage_notes": detail["storage_notes"],
        "shelf_life_after_preparation_days": detail["shelf_life_after_preparation_days"],
    }


@router.get("/api/semi-finished-products/{semi_finished_product_id}/label", tags=["semi-finished-products"])
def get_semi_finished_product_label_payload(
    semi_finished_product_id: int, db: Session = Depends(get_db)
) -> dict:
    item = db.query(SemiFinishedProduct).filter(SemiFinishedProduct.id == semi_finished_product_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Semi finished product not found")

    detail = _build_semi_finished_detail(db, item)

    production_date = date.today()
    expiry_date = None
    shelf_life_days = detail.get("shelf_life_after_preparation_days")
    if isinstance(shelf_life_days, int):
        expiry_date = (production_date + timedelta(days=shelf_life_days)).isoformat()

    return {
        "name": detail["name"],
        "production_date": production_date.isoformat(),
        "storage_advice": detail["storage_notes"] or detail["storage_advice"],
        "storage_fridge_days": detail["storage_fridge_days"],
        "storage_freezer_days": detail["storage_freezer_days"],
        "storage_notes": detail["storage_notes"],
        "shelf_life_after_preparation_days": shelf_life_days,
        "expiry_date": expiry_date,
        "allergens_short": detail["allergens_total"],
    }
