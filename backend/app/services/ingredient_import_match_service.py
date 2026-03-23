from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.ingredient import Ingredient


UNIT_NORMALIZATION = {
    "gr": "gram",
    "g": "gram",
    "gram": "gram",
    "kg": "gram",
    "l": "ml",
    "lt": "ml",
    "liter": "ml",
    "ml": "ml",
    "stuk": "stuk",
    "st": "stuk",
    "stuks": "stuk",
    "pcs": "stuk",
    "pc": "stuk",
}


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(str(value).strip().lower().split())
    return cleaned or None


def _normalize_unit(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    if cleaned is None:
        return None
    return UNIT_NORMALIZATION.get(cleaned, cleaned)


def _product_names_look_similar(left: str | None, right: str | None) -> bool:
    left_clean = _clean_text(left)
    right_clean = _clean_text(right)
    if left_clean is None or right_clean is None:
        return False
    return left_clean in right_clean or right_clean in left_clean


def _strong_unit_match(manual_ingredient: Ingredient, import_ingredient: Ingredient) -> bool:
    manual_unit_code = _clean_text(manual_ingredient.supplier_sales_unit_code)
    manual_unit_name = _clean_text(manual_ingredient.supplier_sales_unit_name)
    import_unit_code = _clean_text(import_ingredient.supplier_sales_unit_code)
    import_unit_name = _clean_text(import_ingredient.supplier_sales_unit_name)

    code_matches = (
        manual_unit_code is not None
        and import_unit_code is not None
        and manual_unit_code == import_unit_code
    )
    name_matches = (
        manual_unit_name is not None
        and import_unit_name is not None
        and manual_unit_name == import_unit_name
    )
    return code_matches or name_matches


def _possible_unit_match(manual_ingredient: Ingredient, import_ingredient: Ingredient) -> bool:
    manual_supplier_unit = _clean_text(manual_ingredient.supplier_unit)
    import_sales_unit_name = _clean_text(import_ingredient.supplier_sales_unit_name)
    if (
        manual_supplier_unit is not None
        and import_sales_unit_name is not None
        and manual_supplier_unit == import_sales_unit_name
    ):
        return True

    manual_calc_unit = _normalize_unit(manual_ingredient.calculation_unit)
    import_calc_unit = _normalize_unit(import_ingredient.calculation_unit)
    return (
        manual_calc_unit is not None
        and import_calc_unit is not None
        and manual_calc_unit == import_calc_unit
    )


def detect_import_match_for_manual_ingredient(db: Session, manual_ingredient: Ingredient) -> dict:
    if manual_ingredient.source_type != "manual":
        return {"match_status": "none", "matched_import_ingredient_id": None}

    normalized_supplier_name = _clean_text(manual_ingredient.supplier_name)
    if normalized_supplier_name is None:
        return {"match_status": "none", "matched_import_ingredient_id": None}

    candidates = (
        db.query(Ingredient)
        .filter(
            Ingredient.source_type == "import",
            Ingredient.is_archived.is_(False),
            func.lower(func.trim(Ingredient.supplier_name)) == normalized_supplier_name,
        )
        .all()
    )
    if not candidates:
        return {"match_status": "none", "matched_import_ingredient_id": None}

    strong_matches = [
        ingredient
        for ingredient in candidates
        if ingredient.supplier_product_code == manual_ingredient.supplier_product_code
        and _strong_unit_match(manual_ingredient, ingredient)
    ]
    if len(strong_matches) == 1:
        return {
            "match_status": "strong",
            "matched_import_ingredient_id": strong_matches[0].id,
        }
    if len(strong_matches) > 1:
        return {"match_status": "possible", "matched_import_ingredient_id": None}

    possible_matches = []
    for ingredient in candidates:
        has_code_match = ingredient.supplier_product_code == manual_ingredient.supplier_product_code
        has_name_match = _product_names_look_similar(
            manual_ingredient.supplier_product_name,
            ingredient.supplier_product_name,
        )
        if not (has_code_match or has_name_match):
            continue
        if _possible_unit_match(manual_ingredient, ingredient):
            possible_matches.append(ingredient)

    if possible_matches:
        return {"match_status": "possible", "matched_import_ingredient_id": None}

    return {"match_status": "none", "matched_import_ingredient_id": None}
