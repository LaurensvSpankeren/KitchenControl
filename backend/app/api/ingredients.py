from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, require_supervisor
from app.db.session import get_db
from app.models.dish import Dish
from app.models.ingredient import Ingredient
from app.models.ingredient_import_issue import IngredientImportIssue
from app.models.recipe_line import RecipeLine
from app.models.semi_finished_product import SemiFinishedProduct
from app.models.user import has_permission
from app.services.ingredient_import_match_service import (
    build_import_match_debug_for_manual_ingredient,
    detect_import_match_for_manual_ingredient,
)
from app.services.manual_ingredient_link_service import link_manual_ingredient_to_import

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


def _parse_optional_bool(payload: dict, field_name: str) -> bool | None:
    if field_name not in payload:
        return None
    value = payload.get(field_name)
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes", "ja"}:
        return True
    if normalized in {"false", "0", "no", "nee"}:
        return False
    raise HTTPException(
        status_code=400,
        detail=f"Invalid boolean value for field: {field_name}",
    )


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


def _normalize_category_name(value: str | None) -> str:
    return str(value or "").strip()


def _derive_calculation_values(
    net_content_unit: str | None,
    net_content_amount: float | None,
    units_per_package: float | None,
) -> tuple[str | None, float | None]:
    unit = _normalize_unit(net_content_unit)

    if unit == "kg" and net_content_amount is not None:
        return "gram", net_content_amount * 1000
    if unit == "gram" and net_content_amount is not None:
        return "gram", net_content_amount
    if unit == "liter" and net_content_amount is not None:
        return "ml", net_content_amount * 1000
    if unit == "ml" and net_content_amount is not None:
        return "ml", net_content_amount
    if unit == "stuk":
        return "stuk", units_per_package if units_per_package else 1

    return None, None


def _parse_payload_values(payload: dict) -> dict:
    data: dict = {
        "supplier_name": payload["supplier_name"],
        "supplier_product_code": payload["supplier_product_code"],
        "supplier_product_name": payload["supplier_product_name"],
        "supplier_unit": payload["supplier_unit"],
        "base_unit": payload["base_unit"],
    }

    optional_string_fields = [
        "supplier_brand",
        "supplier_sales_unit_code",
        "supplier_sales_unit_name",
        "supplier_standard_unit_code",
        "supplier_standard_unit_name",
        "supplier_pack_description",
        "packaging_type",
        "net_content_unit",
        "package_weight_unit",
        "package_volume_unit",
        "calculation_unit",
        "preferred_unit",
        "secondary_unit",
        "category",
        "source_type",
        "manual_note",
        "internal_notes",
        "internal_allergens_extra",
        "cross_contamination_notes",
    ]
    for field in optional_string_fields:
        if field in payload:
            data[field] = payload.get(field) or None

    optional_numeric_fields = [
        "supplier_net_content",
        "supplier_sales_factor",
        "units_per_package",
        "net_content_amount",
        "package_weight_amount",
        "package_volume_amount",
        "calculation_quantity_per_package",
        "supplier_price_ex_vat",
        "supplier_vat_rate",
        "secondary_unit_factor",
        "conversion_factor_to_base",
        "yield_percent",
        "waste_percent",
    ]
    for field in optional_numeric_fields:
        if field in payload:
            data[field] = _parse_optional_float(payload, field)

    optional_boolean_fields = ["awaiting_import_match"]
    for field in optional_boolean_fields:
        value = _parse_optional_bool(payload, field)
        if value is not None:
            data[field] = value

    if "net_content_amount" not in data and data.get("supplier_net_content") is not None:
        data["net_content_amount"] = data["supplier_net_content"]

    if "packaging_type" not in data and payload.get("supplier_unit"):
        data["packaging_type"] = payload.get("supplier_unit")

    normalized_net_unit = _normalize_unit(data.get("net_content_unit"))
    if normalized_net_unit is not None:
        data["net_content_unit"] = normalized_net_unit

    manual_calc_unit = _normalize_unit(data.get("calculation_unit"))
    manual_calc_quantity = data.get("calculation_quantity_per_package")
    if manual_calc_unit is not None and manual_calc_quantity is not None:
        data["calculation_unit"] = manual_calc_unit
        data["calculation_quantity_per_package"] = manual_calc_quantity
        data["conversion_factor_to_base"] = manual_calc_quantity
    else:
        calc_unit, calc_quantity = _derive_calculation_values(
            data.get("net_content_unit"),
            data.get("net_content_amount"),
            data.get("units_per_package"),
        )
        if calc_unit is not None and calc_quantity is not None:
            data["calculation_unit"] = calc_unit
            data["calculation_quantity_per_package"] = calc_quantity
            data["conversion_factor_to_base"] = calc_quantity

    return data


def _serialize_ingredient(ingredient: Ingredient) -> dict:
    return {
        "id": ingredient.id,
        "supplier_name": ingredient.supplier_name,
        "supplier_product_code": ingredient.supplier_product_code,
        "supplier_product_name": ingredient.supplier_product_name,
        "supplier_brand": ingredient.supplier_brand,
        "supplier_sales_unit_code": ingredient.supplier_sales_unit_code,
        "supplier_sales_unit_name": ingredient.supplier_sales_unit_name,
        "supplier_standard_unit_code": ingredient.supplier_standard_unit_code,
        "supplier_standard_unit_name": ingredient.supplier_standard_unit_name,
        "supplier_sales_factor": float(ingredient.supplier_sales_factor)
        if ingredient.supplier_sales_factor is not None
        else None,
        "supplier_pack_description": ingredient.supplier_pack_description,
        "supplier_unit": ingredient.supplier_unit,
        "supplier_net_content": float(ingredient.supplier_net_content)
        if ingredient.supplier_net_content is not None
        else None,
        "packaging_type": ingredient.packaging_type,
        "units_per_package": float(ingredient.units_per_package)
        if ingredient.units_per_package is not None
        else None,
        "net_content_amount": float(ingredient.net_content_amount)
        if ingredient.net_content_amount is not None
        else None,
        "net_content_unit": ingredient.net_content_unit,
        "package_weight_amount": float(ingredient.package_weight_amount)
        if ingredient.package_weight_amount is not None
        else None,
        "package_weight_unit": ingredient.package_weight_unit,
        "package_volume_amount": float(ingredient.package_volume_amount)
        if ingredient.package_volume_amount is not None
        else None,
        "package_volume_unit": ingredient.package_volume_unit,
        "calculation_unit": ingredient.calculation_unit,
        "calculation_quantity_per_package": float(ingredient.calculation_quantity_per_package)
        if ingredient.calculation_quantity_per_package is not None
        else None,
        "preferred_unit": ingredient.preferred_unit,
        "secondary_unit": ingredient.secondary_unit,
        "secondary_unit_factor": float(ingredient.secondary_unit_factor)
        if ingredient.secondary_unit_factor is not None
        else None,
        "supplier_price_ex_vat": float(ingredient.supplier_price_ex_vat)
        if ingredient.supplier_price_ex_vat is not None
        else None,
        "supplier_vat_rate": float(ingredient.supplier_vat_rate)
        if ingredient.supplier_vat_rate is not None
        else None,
        "supplier_allergens_raw": ingredient.supplier_allergens_raw,
        "supplier_is_orderable": ingredient.supplier_is_orderable,
        "supplier_order_status_code": ingredient.supplier_order_status_code,
        "supplier_order_status_description": ingredient.supplier_order_status_description,
        "supplier_alternative_article_code": ingredient.supplier_alternative_article_code,
        "supplier_replaced_by_article_code": ingredient.supplier_replaced_by_article_code,
        "supplier_status_last_imported_at": ingredient.supplier_status_last_imported_at.isoformat()
        if ingredient.supplier_status_last_imported_at is not None
        else None,
        "supplier_last_imported_at": ingredient.supplier_last_imported_at.isoformat()
        if ingredient.supplier_last_imported_at is not None
        else None,
        "source_type": ingredient.source_type,
        "manual_created_at": ingredient.manual_created_at.isoformat()
        if ingredient.manual_created_at is not None
        else None,
        "last_manual_review_at": ingredient.last_manual_review_at.isoformat()
        if ingredient.last_manual_review_at is not None
        else None,
        "manual_note": ingredient.manual_note,
        "awaiting_import_match": ingredient.awaiting_import_match,
        "internal_name": ingredient.internal_name,
        "category": ingredient.category,
        "internal_notes": ingredient.internal_notes,
        "internal_allergens_extra": ingredient.internal_allergens_extra,
        "cross_contamination_notes": ingredient.cross_contamination_notes,
        "base_unit": ingredient.base_unit,
        "conversion_factor_to_base": float(ingredient.conversion_factor_to_base),
        "yield_percent": float(ingredient.yield_percent)
        if ingredient.yield_percent is not None
        else None,
        "waste_percent": float(ingredient.waste_percent)
        if ingredient.waste_percent is not None
        else None,
        "is_available": ingredient.is_available,
        "is_archived": ingredient.is_archived,
        "archived_at": ingredient.archived_at.isoformat()
        if ingredient.archived_at is not None
        else None,
        "created_at": ingredient.created_at.isoformat()
        if ingredient.created_at is not None
        else None,
        "updated_at": ingredient.updated_at.isoformat()
        if ingredient.updated_at is not None
        else None,
    }


def _serialize_ingredient_with_match(db: Session, ingredient: Ingredient) -> dict:
    data = _serialize_ingredient(ingredient)
    data.update({"match_status": "none", "matched_import_ingredient_id": None})
    if ingredient.source_type == "manual":
        data.update(detect_import_match_for_manual_ingredient(db, ingredient))
    return data


def _empty_ingredient_usage() -> dict:
    return {
        "dish_count": 0,
        "dishes": [],
        "semi_finished_product_count": 0,
        "semi_finished_products": [],
        "can_delete": True,
    }


def _build_ingredient_usage_map(db: Session, ingredient_ids: list[int]) -> dict[int, dict]:
    ingredient_ids = list(dict.fromkeys(ingredient_ids))
    usage_by_id = {ingredient_id: _empty_ingredient_usage() for ingredient_id in ingredient_ids}
    if not ingredient_ids:
        return usage_by_id

    dish_rows = (
        db.query(
            RecipeLine.item_id.label("ingredient_id"),
            Dish.id.label("dish_id"),
            Dish.name.label("dish_name"),
        )
        .join(Dish, RecipeLine.parent_id == Dish.id)
        .filter(
            RecipeLine.parent_type == "dish",
            RecipeLine.item_type == "ingredient",
            RecipeLine.item_id.in_(ingredient_ids),
            Dish.is_archived.is_(False),
        )
        .group_by(RecipeLine.item_id, Dish.id, Dish.name)
        .order_by(Dish.name.asc())
        .all()
    )
    for row in dish_rows:
        usage_by_id[row.ingredient_id]["dishes"].append({"id": row.dish_id, "name": row.dish_name})

    semi_finished_rows = (
        db.query(
            RecipeLine.item_id.label("ingredient_id"),
            SemiFinishedProduct.id.label("semi_finished_product_id"),
            SemiFinishedProduct.name.label("semi_finished_product_name"),
        )
        .join(SemiFinishedProduct, RecipeLine.parent_id == SemiFinishedProduct.id)
        .filter(
            RecipeLine.parent_type == "semi_finished_product",
            RecipeLine.item_type == "ingredient",
            RecipeLine.item_id.in_(ingredient_ids),
            SemiFinishedProduct.is_archived.is_(False),
        )
        .group_by(RecipeLine.item_id, SemiFinishedProduct.id, SemiFinishedProduct.name)
        .order_by(SemiFinishedProduct.name.asc())
        .all()
    )
    for row in semi_finished_rows:
        usage_by_id[row.ingredient_id]["semi_finished_products"].append(
            {"id": row.semi_finished_product_id, "name": row.semi_finished_product_name}
        )

    for usage in usage_by_id.values():
        usage["dish_count"] = len(usage["dishes"])
        usage["semi_finished_product_count"] = len(usage["semi_finished_products"])
        usage["can_delete"] = not usage["dishes"] and not usage["semi_finished_products"]

    return usage_by_id


def _build_ingredient_usage(db: Session, ingredient_id: int) -> dict:
    return _build_ingredient_usage_map(db, [ingredient_id])[ingredient_id]


IMPORT_STATUS_SIGNAL_MAP = {
    "uit assortiment": "out_of_assortment",
    "gesaneerd": "out_of_assortment",
    "niet beschikbaar": "temporarily_unavailable",
    "nog niet beschikbaar": "temporarily_unavailable",
    "beschikbaar - te saneren": "to_be_sanitized",
}
IMPORT_SIGNAL_LATEST_WINDOW = timedelta(minutes=10)


def _normalize_import_status_description(value: str | None) -> str | None:
    normalized = " ".join((value or "").strip().lower().split())
    return normalized or None


def _build_import_signals(ingredient: Ingredient) -> list[str]:
    signals = []
    if ingredient.supplier_is_orderable is False:
        signals.append("unavailable")

    status_description = _normalize_import_status_description(
        ingredient.supplier_order_status_description
    )
    status_signal = IMPORT_STATUS_SIGNAL_MAP.get(status_description)
    if status_signal is not None:
        signals.append(status_signal)

    return signals


def _serialize_import_signal(ingredient: Ingredient, usage: dict) -> dict:
    return {
        "id": ingredient.id,
        "name": ingredient.supplier_product_name,
        "article_code": ingredient.supplier_product_code,
        "supplier": ingredient.supplier_name,
        "signals": _build_import_signals(ingredient),
        "supplier_is_orderable": ingredient.supplier_is_orderable,
        "supplier_order_status_code": ingredient.supplier_order_status_code,
        "supplier_order_status_description": ingredient.supplier_order_status_description,
        "supplier_alternative_article_code": ingredient.supplier_alternative_article_code,
        "supplier_replaced_by_article_code": ingredient.supplier_replaced_by_article_code,
        "supplier_status_last_imported_at": ingredient.supplier_status_last_imported_at.isoformat()
        if ingredient.supplier_status_last_imported_at is not None
        else None,
        "supplier_signal_acknowledged_at": ingredient.supplier_signal_acknowledged_at.isoformat()
        if ingredient.supplier_signal_acknowledged_at is not None
        else None,
        "dish_count": usage["dish_count"],
        "dishes": usage["dishes"],
        "semi_finished_product_count": usage["semi_finished_product_count"],
        "semi_finished_products": usage["semi_finished_products"],
        "can_delete": usage["can_delete"],
    }


def _list_current_import_signal_ingredients(db: Session) -> list[Ingredient]:
    latest_status_imported_at = (
        db.query(func.max(Ingredient.supplier_status_last_imported_at))
        .filter(
            Ingredient.source_type == "import",
            Ingredient.supplier_status_last_imported_at.is_not(None),
        )
        .scalar()
    )
    if latest_status_imported_at is None:
        return []

    latest_window_start = latest_status_imported_at - IMPORT_SIGNAL_LATEST_WINDOW
    candidates = (
        db.query(Ingredient)
        .filter(
            Ingredient.source_type == "import",
            Ingredient.is_archived.is_(False),
            Ingredient.supplier_status_last_imported_at >= latest_window_start,
            Ingredient.supplier_status_last_imported_at <= latest_status_imported_at,
            or_(
                Ingredient.supplier_signal_acknowledged_at.is_(None),
                Ingredient.supplier_signal_acknowledged_at < Ingredient.supplier_status_last_imported_at,
            ),
            or_(
                Ingredient.supplier_is_orderable.is_(False),
                Ingredient.supplier_order_status_description.is_not(None),
            ),
        )
        .order_by(Ingredient.supplier_product_name.asc())
        .all()
    )
    return [ingredient for ingredient in candidates if _build_import_signals(ingredient)]


def _count_manual_import_matches(db: Session) -> int:
    ingredients = (
        db.query(Ingredient)
        .filter(
            Ingredient.source_type == "manual",
            Ingredient.is_archived.is_(False),
            Ingredient.awaiting_import_match.is_(True),
        )
        .all()
    )
    return sum(
        1
        for ingredient in ingredients
        if detect_import_match_for_manual_ingredient(db, ingredient).get("match_status")
        in {"possible", "strong"}
    )


def _count_manual_review_ingredients(db: Session) -> int:
    threshold = datetime.now(timezone.utc) - timedelta(days=45)
    return (
        db.query(Ingredient)
        .filter(
            Ingredient.source_type == "manual",
            Ingredient.is_archived.is_(False),
            Ingredient.awaiting_import_match.is_(True),
            or_(
                (Ingredient.last_manual_review_at.is_not(None) & (Ingredient.last_manual_review_at <= threshold)),
                (
                    Ingredient.last_manual_review_at.is_(None)
                    & Ingredient.manual_created_at.is_not(None)
                    & (Ingredient.manual_created_at <= threshold)
                ),
            ),
        )
        .count()
    )


def _count_stale_import_ingredients(db: Session) -> int:
    threshold = datetime.now(timezone.utc) - timedelta(days=45)
    return (
        db.query(Ingredient)
        .filter(
            Ingredient.source_type == "import",
            Ingredient.is_archived.is_(False),
            or_(
                Ingredient.supplier_last_imported_at.is_(None),
                Ingredient.supplier_last_imported_at <= threshold,
            ),
        )
        .count()
    )


def _soft_delete_ingredient(ingredient: Ingredient) -> None:
    ingredient.is_archived = True
    ingredient.archived_at = datetime.now(timezone.utc)
    ingredient.awaiting_import_match = False


@router.get("/api/ingredients", tags=["ingredients"])
def list_ingredients(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> list[dict]:
    if not has_permission(current_user, "ingredienten.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredients = (
        db.query(Ingredient)
        .filter(Ingredient.is_archived.is_(False))
        .order_by(Ingredient.supplier_product_name.asc())
        .all()
    )
    return [_serialize_ingredient(ingredient) for ingredient in ingredients]


@router.get("/api/ingredient-categories", tags=["ingredients"])
def list_ingredient_categories(
    db: Session = Depends(get_db),
    _current_user=Depends(require_supervisor),
) -> list[dict]:
    rows = (
        db.query(
            func.trim(Ingredient.category).label("name"),
            func.count(Ingredient.id).label("ingredient_count"),
        )
        .filter(Ingredient.is_archived.is_(False))
        .filter(Ingredient.category.is_not(None))
        .filter(func.trim(Ingredient.category) != "")
        .group_by(func.trim(Ingredient.category))
        .order_by(func.lower(func.trim(Ingredient.category)).asc())
        .all()
    )
    return [
        {"name": row.name, "ingredient_count": row.ingredient_count}
        for row in rows
    ]


@router.post("/api/ingredient-categories/rename", tags=["ingredients"])
def rename_ingredient_category(
    payload: dict,
    db: Session = Depends(get_db),
    _current_user=Depends(require_supervisor),
) -> dict:
    current_name = _normalize_category_name(payload.get("current_name"))
    next_name = _normalize_category_name(payload.get("name"))

    if not current_name or not next_name:
        raise HTTPException(status_code=400, detail="Current category name and new name are required")

    existing_rows = (
        db.query(Ingredient)
        .filter(func.trim(Ingredient.category) == current_name)
        .all()
    )
    if not existing_rows:
        raise HTTPException(status_code=404, detail="Ingredient category not found")

    duplicate_exists = (
        db.query(Ingredient.id)
        .filter(func.lower(func.trim(Ingredient.category)) == next_name.lower())
        .filter(func.lower(func.trim(Ingredient.category)) != current_name.lower())
        .first()
        is not None
    )
    if duplicate_exists:
        raise HTTPException(status_code=400, detail="Ingredient category already exists")

    for ingredient in existing_rows:
        ingredient.category = next_name
        db.add(ingredient)

    db.commit()
    return {"name": next_name, "ingredient_count": len(existing_rows)}


@router.get("/api/ingredients/{ingredient_id}", tags=["ingredients"])
def get_ingredient(
    ingredient_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "ingredienten.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredient = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    return _serialize_ingredient(ingredient)


@router.get("/api/manual-ingredients/{ingredient_id}/match-debug", tags=["ingredients"])
def get_manual_ingredient_match_debug(
    ingredient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")
    if not has_permission(current_user, "importbeheer.matchen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredient = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    if ingredient.source_type != "manual":
        raise HTTPException(status_code=400, detail="Only manual ingredients can be debugged via this endpoint")
    return build_import_match_debug_for_manual_ingredient(db, ingredient)


@router.post("/api/ingredients", tags=["ingredients"])
def create_ingredient(
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "ingredienten.aanmaken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    required_fields = [
        "supplier_name",
        "supplier_product_code",
        "supplier_product_name",
        "supplier_unit",
        "base_unit",
    ]
    missing_fields = [field for field in required_fields if not payload.get(field)]
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing_fields)}",
        )

    ingredient_data = _parse_payload_values(payload)

    ingredient = Ingredient(**ingredient_data)
    db.add(ingredient)
    db.commit()
    db.refresh(ingredient)

    return _serialize_ingredient(ingredient)


@router.put("/api/ingredients/{ingredient_id}", tags=["ingredients"])
def update_ingredient(
    ingredient_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "ingredienten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredient = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found")

    required_fields = [
        "supplier_name",
        "supplier_product_code",
        "supplier_product_name",
        "supplier_unit",
        "base_unit",
    ]
    missing_fields = [field for field in required_fields if not payload.get(field)]
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing_fields)}",
        )

    ingredient_data = _parse_payload_values(payload)
    for field, value in ingredient_data.items():
        setattr(ingredient, field, value)

    db.commit()
    db.refresh(ingredient)
    return _serialize_ingredient(ingredient)


@router.post("/api/manual-ingredients", tags=["ingredients"])
def create_manual_ingredient(
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "ingredienten.aanmaken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    required_fields = [
        "supplier_name",
        "supplier_product_name",
        "supplier_price_ex_vat",
        "supplier_unit",
        "calculation_unit",
        "calculation_quantity_per_package",
        "base_unit",
    ]
    missing_fields = [field for field in required_fields if payload.get(field) in (None, "")]
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing_fields)}",
        )

    now = datetime.now(timezone.utc)
    normalized_payload = dict(payload)
    if not normalized_payload.get("supplier_product_code"):
        normalized_payload["supplier_product_code"] = f"MANUAL-{now.strftime('%Y%m%d%H%M%S%f')}"
    normalized_payload["source_type"] = "manual"
    normalized_payload["awaiting_import_match"] = True

    ingredient_data = _parse_payload_values(normalized_payload)
    ingredient_data["source_type"] = "manual"
    ingredient_data["manual_created_at"] = now
    ingredient_data["awaiting_import_match"] = True

    ingredient = Ingredient(**ingredient_data)
    ingredient.source_type = "manual"
    ingredient.manual_created_at = now
    ingredient.awaiting_import_match = True
    db.add(ingredient)
    db.commit()
    db.refresh(ingredient)
    return _serialize_ingredient(ingredient)


@router.get("/api/manual-ingredients/review", tags=["ingredients"])
def list_manual_ingredients_for_review(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> list[dict]:
    if not has_permission(current_user, "importbeheer.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")
    if not has_permission(current_user, "importbeheer.matchen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    threshold = datetime.now(timezone.utc) - timedelta(days=45)
    ingredients = (
        db.query(Ingredient)
        .filter(
            Ingredient.source_type == "manual",
            Ingredient.is_archived.is_(False),
            Ingredient.awaiting_import_match.is_(True),
            or_(
                (Ingredient.last_manual_review_at.is_not(None) & (Ingredient.last_manual_review_at <= threshold)),
                (
                    Ingredient.last_manual_review_at.is_(None)
                    & Ingredient.manual_created_at.is_not(None)
                    & (Ingredient.manual_created_at <= threshold)
                ),
            ),
        )
        .order_by(
            Ingredient.last_manual_review_at.asc().nullsfirst(),
            Ingredient.manual_created_at.asc().nullsfirst(),
        )
        .all()
    )
    return [_serialize_ingredient_with_match(db, ingredient) for ingredient in ingredients]


@router.get("/api/manual-ingredients/matches", tags=["ingredients"])
def list_manual_ingredients_with_matches(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> list[dict]:
    if not has_permission(current_user, "importbeheer.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")
    if not has_permission(current_user, "importbeheer.matchen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredients = (
        db.query(Ingredient)
        .filter(
            Ingredient.source_type == "manual",
            Ingredient.is_archived.is_(False),
            Ingredient.awaiting_import_match.is_(True),
        )
        .order_by(Ingredient.supplier_name.asc(), Ingredient.supplier_product_name.asc())
        .all()
    )
    results = []
    for ingredient in ingredients:
        serialized = _serialize_ingredient_with_match(db, ingredient)
        if serialized.get("match_status") in {"possible", "strong"}:
            results.append(serialized)
    return results


@router.get("/api/import-ingredients/stale", tags=["ingredients"])
def list_stale_import_ingredients(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> list[dict]:
    if not has_permission(current_user, "importbeheer.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    threshold = datetime.now(timezone.utc) - timedelta(days=45)
    ingredients = (
        db.query(Ingredient)
        .filter(
            Ingredient.source_type == "import",
            Ingredient.is_archived.is_(False),
            or_(
                Ingredient.supplier_last_imported_at.is_(None),
                Ingredient.supplier_last_imported_at <= threshold,
            ),
        )
        .order_by(
            Ingredient.supplier_last_imported_at.asc().nullsfirst(),
            Ingredient.supplier_product_name.asc(),
        )
        .all()
    )
    return [_serialize_ingredient(ingredient) for ingredient in ingredients]


@router.get("/api/import-alerts/count", tags=["ingredients"])
def get_import_alert_count(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    manual_matches = _count_manual_import_matches(db)
    manual_review = _count_manual_review_ingredients(db)
    stale_import = _count_stale_import_ingredients(db)
    duplicate_issues = (
        db.query(IngredientImportIssue)
        .filter(
            IngredientImportIssue.status == "open",
            IngredientImportIssue.issue_type == "duplicate_conflict_in_file",
        )
        .count()
    )
    import_signals = len(_list_current_import_signal_ingredients(db))
    count = manual_matches + manual_review + stale_import + duplicate_issues + import_signals

    return {
        "count": count,
        "manual_matches": manual_matches,
        "manual_review": manual_review,
        "stale_import": stale_import,
        "duplicate_issues": duplicate_issues,
        "import_signals": import_signals,
    }


@router.get("/api/import-signals", tags=["ingredients"])
def list_import_signals(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> list[dict]:
    if not has_permission(current_user, "importbeheer.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredients = _list_current_import_signal_ingredients(db)
    usage_by_id = _build_ingredient_usage_map(db, [ingredient.id for ingredient in ingredients])
    return [
        _serialize_import_signal(ingredient, usage_by_id[ingredient.id])
        for ingredient in ingredients
    ]


@router.post("/api/import-signals/{ingredient_id}/acknowledge", tags=["ingredients"])
def acknowledge_import_signal(
    ingredient_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredient = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    if ingredient.source_type != "import":
        raise HTTPException(status_code=400, detail="Only import ingredients can be acknowledged via this endpoint")

    ingredient.supplier_signal_acknowledged_at = datetime.now(timezone.utc)
    db.commit()
    return {"success": True}


@router.get("/api/manual-ingredients/{ingredient_id}/usage-check", tags=["ingredients"])
def get_manual_ingredient_usage_check(
    ingredient_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.opschonen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredient = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    if ingredient.source_type != "manual":
        raise HTTPException(status_code=400, detail="Only manual ingredients can be checked via this endpoint")

    return _build_ingredient_usage(db, ingredient.id)


@router.get("/api/import-ingredients/{ingredient_id}/usage-check", tags=["ingredients"])
def get_import_ingredient_usage_check(
    ingredient_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.opschonen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredient = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    if ingredient.source_type != "import":
        raise HTTPException(status_code=400, detail="Only import ingredients can be checked via this endpoint")

    return _build_ingredient_usage(db, ingredient.id)


@router.delete("/api/manual-ingredients/{ingredient_id}", tags=["ingredients"])
def delete_manual_ingredient(
    ingredient_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.opschonen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredient = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    if ingredient.source_type != "manual":
        raise HTTPException(status_code=400, detail="Only manual ingredients can be deleted via this endpoint")

    usage = _build_ingredient_usage(db, ingredient.id)
    if not usage["can_delete"]:
        return JSONResponse(status_code=409, content=usage)

    _soft_delete_ingredient(ingredient)
    db.commit()
    return {"deleted": True, "ingredient_id": ingredient_id}


@router.delete("/api/import-ingredients/{ingredient_id}", tags=["ingredients"])
def delete_import_ingredient(
    ingredient_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.opschonen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredient = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    if ingredient.source_type != "import":
        raise HTTPException(status_code=400, detail="Only import ingredients can be deleted via this endpoint")

    usage = _build_ingredient_usage(db, ingredient.id)
    if not usage["can_delete"]:
        return JSONResponse(status_code=409, content=usage)

    _soft_delete_ingredient(ingredient)
    db.commit()
    return {"deleted": True, "ingredient_id": ingredient_id}


@router.post("/api/manual-ingredients/{ingredient_id}/archive", tags=["ingredients"])
def archive_manual_ingredient(
    ingredient_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.opschonen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredient = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    if ingredient.source_type != "manual":
        raise HTTPException(status_code=400, detail="Only manual ingredients can be archived via this endpoint")

    ingredient.is_archived = True
    ingredient.archived_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ingredient)
    return _serialize_ingredient_with_match(db, ingredient)


@router.post("/api/import-ingredients/{ingredient_id}/archive", tags=["ingredients"])
def archive_import_ingredient(
    ingredient_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.opschonen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredient = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    if ingredient.source_type != "import":
        raise HTTPException(status_code=400, detail="Only import ingredients can be archived via this endpoint")

    ingredient.is_archived = True
    ingredient.archived_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ingredient)
    return _serialize_ingredient(ingredient)


@router.post("/api/manual-ingredients/{ingredient_id}/review", tags=["ingredients"])
def review_manual_ingredient(
    ingredient_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.matchen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    ingredient = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    if ingredient.source_type != "manual":
        raise HTTPException(status_code=400, detail="Only manual ingredients can be reviewed via this endpoint")

    ingredient.awaiting_import_match = False
    ingredient.last_manual_review_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ingredient)
    return _serialize_ingredient_with_match(db, ingredient)


@router.post("/api/manual-ingredients/{ingredient_id}/link-import", tags=["ingredients"])
def link_manual_ingredient(
    ingredient_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.matchen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    try:
        return link_manual_ingredient_to_import(db, ingredient_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
