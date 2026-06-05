from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from decimal import Decimal

from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.dish import Dish
from app.models.ingredient import Ingredient
from app.models.menukaart import Menukaart
from app.models.menukaart_gerecht import MenukaartGerecht
from app.models.recipe_line import RecipeLine
from app.models.recipe_step import RecipeStep
from app.models.semi_finished_product import SemiFinishedProduct
from app.models.user import has_permission
from app.api.semi_finished_products import (
    _build_semi_finished_detail,
    _convert_quantity_to_unit,
    _extract_clean_allergens,
    _to_calculation_quantity,
)

router = APIRouter()
UPLOADS_DIR = settings.uploads_dir
UPLOADS_DISHES_DIR = UPLOADS_DIR / "dishes"
ACTIVE_MENU_STATUSES = {"active", "concept"}


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


def _format_blocking_names(names: list[str], max_items: int = 3) -> str:
    unique_names = [name for name in dict.fromkeys([str(name or "").strip() for name in names]) if name]
    if not unique_names:
        return ""
    visible = unique_names[:max_items]
    if len(unique_names) > max_items:
        return f"{', '.join(visible)} en meer"
    return ", ".join(visible)


def _get_dish_archive_block_reason(db: Session, dish_id: int) -> str | None:
    blocking_menu_names = [
        row.name
        for row in (
            db.query(Menukaart.name)
            .join(MenukaartGerecht, MenukaartGerecht.menukaart_id == Menukaart.id)
            .filter(
                MenukaartGerecht.gerecht_id == dish_id,
                Menukaart.is_archived.is_(False),
                Menukaart.status.in_(ACTIVE_MENU_STATUSES),
            )
            .order_by(Menukaart.name.asc())
            .all()
        )
    ]
    if not blocking_menu_names:
        return None
    return (
        "Kan gerecht niet archiveren, wordt gebruikt in: "
        f"{_format_blocking_names(blocking_menu_names)}"
    )


def _save_dish_photo(dish_id: int, uploaded_file: UploadFile) -> str:
    try:
        raw_bytes = uploaded_file.file.read()
        image = Image.open(BytesIO(raw_bytes))
        image = ImageOps.exif_transpose(image)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Ongeldig afbeeldingsbestand.") from exc

    image = image.convert("RGB")
    image.thumbnail((1200, 1200))

    UPLOADS_DISHES_DIR.mkdir(parents=True, exist_ok=True)
    target_path = UPLOADS_DISHES_DIR / f"dish_{dish_id}.jpg"
    image.save(target_path, format="JPEG", quality=82, optimize=True)
    return f"/uploads/dishes/{target_path.name}"


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

    serialized_lines: list[dict] = []
    estimated_cost_total_decimal = Decimal("0")
    has_any_line_cost = False
    allergens_parts: list[str] = []

    for line in lines:
        item_name = None
        item_brand = None
        allergens_summary = None
        serialized_line = {
            "id": line.id,
            "parent_type": line.parent_type,
            "parent_id": line.parent_id,
            "item_type": line.item_type,
            "item_id": line.item_id,
            "item_name": None,
            "item_brand": None,
            "quantity": float(line.quantity),
            "unit": line.unit,
            "sort_order": line.sort_order,
            "created_at": line.created_at.isoformat() if line.created_at is not None else None,
            "updated_at": line.updated_at.isoformat() if line.updated_at is not None else None,
            "line_cost": None,
            "line_cost_share_percent": None,
            "allergens_summary": None,
        }

        if line.item_type == "ingredient":
            ingredient = db.query(Ingredient).filter(Ingredient.id == line.item_id).first()
            if ingredient is not None:
                item_name = ingredient.supplier_product_name
                item_brand = ingredient.supplier_brand

                if (
                    ingredient.supplier_price_ex_vat is not None
                    and ingredient.calculation_quantity_per_package is not None
                    and Decimal(ingredient.calculation_quantity_per_package) != 0
                ):
                    quantity_for_cost = _to_calculation_quantity(line, ingredient)
                    line_cost_decimal = (
                        quantity_for_cost
                        * Decimal(ingredient.supplier_price_ex_vat)
                        / Decimal(ingredient.calculation_quantity_per_package)
                    )
                    serialized_line["line_cost"] = float(line_cost_decimal)
                    estimated_cost_total_decimal += line_cost_decimal
                    has_any_line_cost = True
                elif (
                    ingredient.supplier_price_ex_vat is not None
                    and ingredient.conversion_factor_to_base is not None
                    and Decimal(ingredient.conversion_factor_to_base) != 0
                ):
                    quantity_for_cost = _to_calculation_quantity(line, ingredient)
                    line_cost_decimal = (
                        quantity_for_cost
                        * Decimal(ingredient.supplier_price_ex_vat)
                        / Decimal(ingredient.conversion_factor_to_base)
                    )
                    serialized_line["line_cost"] = float(line_cost_decimal)
                    estimated_cost_total_decimal += line_cost_decimal
                    has_any_line_cost = True

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
                nested_detail = _build_semi_finished_detail(db, nested)
                nested_cost_total = nested_detail.get("estimated_cost_total")
                nested_final_yield_amount = nested_detail.get("final_yield_amount")
                nested_final_yield_unit = nested_detail.get("final_yield_unit")

                if (
                    nested_cost_total is not None
                    and nested_final_yield_amount is not None
                    and Decimal(str(nested_final_yield_amount)) > 0
                    and nested_final_yield_unit
                ):
                    converted_quantity = _convert_quantity_to_unit(
                        Decimal(line.quantity),
                        line.unit,
                        nested_final_yield_unit,
                    )
                    if converted_quantity is not None:
                        cost_per_final_unit = Decimal(str(nested_cost_total)) / Decimal(
                            str(nested_final_yield_amount)
                        )
                        line_cost_decimal = cost_per_final_unit * converted_quantity
                        serialized_line["line_cost"] = float(line_cost_decimal)
                        estimated_cost_total_decimal += line_cost_decimal
                        has_any_line_cost = True

                nested_allergens = _extract_clean_allergens(nested_detail.get("allergens_total"))
                if nested_allergens:
                    allergens_summary = " | ".join(nested_allergens)
                    allergens_parts.extend(nested_allergens)

        serialized_line["item_name"] = item_name
        serialized_line["item_brand"] = item_brand
        serialized_line["allergens_summary"] = allergens_summary

        serialized_lines.append(serialized_line)

    estimated_cost_total = float(estimated_cost_total_decimal) if has_any_line_cost else None
    allergens_total = " | ".join(dict.fromkeys([part for part in allergens_parts if part])) or None

    if estimated_cost_total and estimated_cost_total > 0:
        for serialized_line in serialized_lines:
            if serialized_line["line_cost"] is not None:
                serialized_line["line_cost_share_percent"] = round(
                    (serialized_line["line_cost"] / estimated_cost_total) * 100, 2
                )

    sale_price_excl_vat = None
    gross_profit = None
    gross_margin_percent = None
    food_cost_percent = None
    suggested_price_excl_vat = None
    suggested_price_incl_vat = None

    if estimated_cost_total is not None and item.vat_rate is not None:
        vat_multiplier = Decimal("1") + (Decimal(item.vat_rate) / Decimal("100"))
        if vat_multiplier != 0:
            suggested_price_excl_vat_decimal = estimated_cost_total_decimal / Decimal("0.30")
            suggested_price_excl_vat = float(suggested_price_excl_vat_decimal)
            suggested_price_incl_vat = float(suggested_price_excl_vat_decimal * vat_multiplier)

    if (
        estimated_cost_total is not None
        and item.sale_price_incl_vat is not None
        and item.vat_rate is not None
    ):
        vat_multiplier = Decimal("1") + (Decimal(item.vat_rate) / Decimal("100"))
        if vat_multiplier != 0:
            sale_price_excl_vat_decimal = Decimal(item.sale_price_incl_vat) / vat_multiplier
            sale_price_excl_vat = float(sale_price_excl_vat_decimal)

            gross_profit_decimal = sale_price_excl_vat_decimal - estimated_cost_total_decimal
            gross_profit = float(gross_profit_decimal)

            if sale_price_excl_vat_decimal != 0:
                gross_margin_percent = float(
                    (gross_profit_decimal / sale_price_excl_vat_decimal) * Decimal("100")
                )
                food_cost_percent = float(
                    (estimated_cost_total_decimal / sale_price_excl_vat_decimal) * Decimal("100")
                )

    response = _serialize_dish(item)
    response["recipe_lines"] = serialized_lines
    response["recipe_steps"] = _serialize_recipe_steps(steps)
    response["estimated_cost_total"] = estimated_cost_total
    response["allergens_total"] = allergens_total
    response["sale_price_excl_vat"] = sale_price_excl_vat
    response["gross_profit"] = gross_profit
    response["gross_margin_percent"] = gross_margin_percent
    response["food_cost_percent"] = food_cost_percent
    response["suggested_price_excl_vat"] = suggested_price_excl_vat
    response["suggested_price_incl_vat"] = suggested_price_incl_vat
    return response


@router.get("/api/dishes", tags=["dishes"])
def list_dishes(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> list[dict]:
    if not has_permission(current_user, "gerechten.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    items = db.query(Dish).filter(Dish.is_archived.is_(False)).order_by(Dish.name.asc()).all()
    return [_serialize_dish(item) for item in items]


@router.get("/api/dishes/archived", tags=["dishes"])
def list_archived_dishes(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> list[dict]:
    if not has_permission(current_user, "gerechten.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    items = db.query(Dish).filter(Dish.is_archived.is_(True)).order_by(Dish.name.asc()).all()
    return [_serialize_dish(item) for item in items]


@router.get("/api/dishes/search-with-details", tags=["dishes"])
def search_dishes_with_details(
    search: str | None = None,
    category_id: int | None = None,
    subcategory_id: int | None = None,
    archived: bool = False,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> list[dict]:
    if not has_permission(current_user, "gerechten.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    search_term = (search or "").strip()
    if not search_term and category_id is None and subcategory_id is None:
        return []

    query = db.query(Dish).filter(Dish.is_archived.is_(archived))
    if search_term:
        pattern = f"%{search_term}%"
        query = query.filter(Dish.name.ilike(pattern))
    if category_id is not None:
        query = query.filter(Dish.category_id == category_id)
    if subcategory_id is not None:
        query = query.filter(Dish.subcategory_id == subcategory_id)

    items = query.order_by(Dish.name.asc()).all()
    return [_build_dish_detail(db, item) for item in items]


@router.post("/api/dishes", tags=["dishes"])
def create_dish(
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "gerechten.aanmaken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    item = Dish(name="tmp")
    _apply_dish_payload(item, payload)

    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_dish(item)


@router.put("/api/dishes/{dish_id}", tags=["dishes"])
def update_dish(
    dish_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "gerechten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    item = db.query(Dish).filter(Dish.id == dish_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    _apply_dish_payload(item, payload)
    db.commit()
    db.refresh(item)
    return _serialize_dish(item)


@router.post("/api/dishes/{dish_id}/photo", tags=["dishes"])
def upload_dish_photo(
    dish_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "gerechten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    item = db.query(Dish).filter(Dish.id == dish_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Bestand moet een afbeelding zijn.")

    item.photo_path = _save_dish_photo(dish_id, file)
    db.commit()
    db.refresh(item)
    return _serialize_dish(item)


@router.post("/api/dishes/{dish_id}/recipe-lines", tags=["dishes"])
def add_dish_recipe_line(
    dish_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "gerechten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

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

    parent = db.query(Dish).filter(Dish.id == dish_id).first()
    if parent is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    recipe_line = RecipeLine(
        parent_type="dish",
        parent_id=dish_id,
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


@router.put("/api/dishes/{dish_id}/recipe-lines/{recipe_line_id}", tags=["dishes"])
def update_dish_recipe_line(
    dish_id: int,
    recipe_line_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "gerechten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    parent = db.query(Dish).filter(Dish.id == dish_id).first()
    if parent is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    line = (
        db.query(RecipeLine)
        .filter(
            RecipeLine.id == recipe_line_id,
            RecipeLine.parent_type == "dish",
            RecipeLine.parent_id == dish_id,
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


@router.delete("/api/dishes/{dish_id}/recipe-lines/{recipe_line_id}", tags=["dishes"])
def delete_dish_recipe_line(
    dish_id: int,
    recipe_line_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "gerechten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    parent = db.query(Dish).filter(Dish.id == dish_id).first()
    if parent is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    line = (
        db.query(RecipeLine)
        .filter(
            RecipeLine.id == recipe_line_id,
            RecipeLine.parent_type == "dish",
            RecipeLine.parent_id == dish_id,
        )
        .first()
    )
    if line is None:
        raise HTTPException(status_code=404, detail="Recipe line not found")

    db.delete(line)
    db.commit()
    return {"status": "deleted", "recipe_line_id": recipe_line_id}


@router.put("/api/dishes/{dish_id}/recipe-steps", tags=["dishes"])
def replace_dish_recipe_steps(
    dish_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "gerechten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    item = db.query(Dish).filter(Dish.id == dish_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    steps_payload = payload.get("steps")
    if not isinstance(steps_payload, list):
        raise HTTPException(status_code=400, detail="steps must be a list")

    (
        db.query(RecipeStep)
        .filter(
            RecipeStep.parent_type == "dish",
            RecipeStep.parent_id == dish_id,
        )
        .delete(synchronize_session=False)
    )

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
            parent_type="dish",
            parent_id=dish_id,
            step_number=step_number,
            instruction=instruction,
        )
        db.add(recipe_step)

    db.commit()

    refreshed_steps = (
        db.query(RecipeStep)
        .filter(
            RecipeStep.parent_type == "dish",
            RecipeStep.parent_id == dish_id,
        )
        .order_by(RecipeStep.step_number.asc(), RecipeStep.id.asc())
        .all()
    )
    return {"steps": _serialize_recipe_steps(refreshed_steps)}


@router.put("/api/dishes/{dish_id}/archive", tags=["dishes"])
def archive_dish(
    dish_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "gerechten.archiveren", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    item = db.query(Dish).filter(Dish.id == dish_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    reason = _get_dish_archive_block_reason(db, dish_id)
    if reason:
        raise HTTPException(status_code=400, detail=reason)

    item.is_archived = True
    db.commit()
    db.refresh(item)
    return _serialize_dish(item)


@router.get("/api/dishes/{dish_id}/archive-check", tags=["dishes"])
def get_dish_archive_check(
    dish_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    item = db.query(Dish).filter(Dish.id == dish_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    if not has_permission(current_user, "gerechten.archiveren", db):
        return {
            "can_archive": False,
            "reason": "Je hebt geen rechten om deze actie uit te voeren",
        }

    reason = _get_dish_archive_block_reason(db, dish_id)
    return {
        "can_archive": reason is None,
        "reason": reason,
    }


@router.put("/api/dishes/{dish_id}/restore", tags=["dishes"])
def restore_dish(
    dish_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "gerechten.herstellen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    item = db.query(Dish).filter(Dish.id == dish_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    item.is_archived = False
    db.commit()
    db.refresh(item)
    return _serialize_dish(item)


@router.post("/api/dishes/{dish_id}/duplicate", tags=["dishes"])
def duplicate_dish(
    dish_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "gerechten.dupliceren", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

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
def delete_dish(
    dish_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "gerechten.verwijderen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

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
def get_dish_detail(
    dish_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "gerechten.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    item = db.query(Dish).filter(Dish.id == dish_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    return _build_dish_detail(db, item)


@router.get("/api/dishes/{dish_id}/print", tags=["dishes"])
def get_dish_print_payload(
    dish_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "gerechten.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    item = db.query(Dish).filter(Dish.id == dish_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Dish not found")

    detail = _build_dish_detail(db, item)
    return {
        "name": detail["name"],
        "menu_name": detail["menu_name"],
        "category_id": detail["category_id"],
        "subcategory_id": detail["subcategory_id"],
        "photo_path": detail["photo_path"],
        "recipe_lines": detail["recipe_lines"],
        "recipe_steps": detail["recipe_steps"],
        "estimated_cost_total": detail["estimated_cost_total"],
        "allergens_total": detail["allergens_total"],
        "kitchen_note": detail["kitchen_note"],
        "plating_advice": detail["plating_advice"],
        "sale_price_incl_vat": detail["sale_price_incl_vat"],
        "sale_price_excl_vat": detail["sale_price_excl_vat"],
        "gross_profit": detail["gross_profit"],
        "gross_margin_percent": detail["gross_margin_percent"],
        "food_cost_percent": detail["food_cost_percent"],
    }
