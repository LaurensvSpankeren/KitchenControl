from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.ingredient import Ingredient

router = APIRouter()


@router.get("/api/ingredients", tags=["ingredients"])
def list_ingredients(db: Session = Depends(get_db)) -> list[dict]:
    ingredients = (
        db.query(Ingredient).order_by(Ingredient.supplier_product_name.asc()).all()
    )
    return [
        {
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
        for ingredient in ingredients
    ]


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

    ingredient = Ingredient(
        supplier_name=payload["supplier_name"],
        supplier_product_code=payload["supplier_product_code"],
        supplier_product_name=payload["supplier_product_name"],
        supplier_unit=payload["supplier_unit"],
        base_unit=payload["base_unit"],
    )
    db.add(ingredient)
    db.commit()
    db.refresh(ingredient)

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
