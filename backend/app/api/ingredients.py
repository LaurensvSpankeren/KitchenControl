from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.ingredient import Ingredient

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
        "supplier_pack_description",
        "packaging_type",
        "net_content_unit",
        "preferred_unit",
        "secondary_unit",
        "category",
        "internal_notes",
        "internal_allergens_extra",
        "cross_contamination_notes",
    ]
    for field in optional_string_fields:
        if field in payload:
            data[field] = payload.get(field) or None

    optional_numeric_fields = [
        "supplier_net_content",
        "units_per_package",
        "net_content_amount",
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

    if "net_content_amount" not in data and data.get("supplier_net_content") is not None:
        data["net_content_amount"] = data["supplier_net_content"]

    if "packaging_type" not in data and payload.get("supplier_unit"):
        data["packaging_type"] = payload.get("supplier_unit")

    normalized_net_unit = _normalize_unit(data.get("net_content_unit"))
    if normalized_net_unit is not None:
        data["net_content_unit"] = normalized_net_unit

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
        "supplier_last_imported_at": ingredient.supplier_last_imported_at.isoformat()
        if ingredient.supplier_last_imported_at is not None
        else None,
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


@router.get("/api/ingredients", tags=["ingredients"])
def list_ingredients(db: Session = Depends(get_db)) -> list[dict]:
    ingredients = (
        db.query(Ingredient).order_by(Ingredient.supplier_product_name.asc()).all()
    )
    return [_serialize_ingredient(ingredient) for ingredient in ingredients]


@router.post("/api/ingredients", tags=["ingredients"])
def create_ingredient(payload: dict, db: Session = Depends(get_db)) -> dict:
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
def update_ingredient(ingredient_id: int, payload: dict, db: Session = Depends(get_db)) -> dict:
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
