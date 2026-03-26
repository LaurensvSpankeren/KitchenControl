from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.ingredient import Ingredient

AMOUNT_MATCH_EPSILON = 1e-9


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


def _amounts_equal(left, right) -> bool:
    if left is None or right is None:
        return True
    return abs(float(left) - float(right)) <= AMOUNT_MATCH_EPSILON


def _strong_unit_match(manual_ingredient: Ingredient, import_ingredient: Ingredient) -> bool:
    manual_supplier_unit = _clean_text(manual_ingredient.supplier_unit)
    manual_unit_code = _clean_text(manual_ingredient.supplier_sales_unit_code)
    manual_unit_name = _clean_text(manual_ingredient.supplier_sales_unit_name)
    import_supplier_unit = _clean_text(import_ingredient.supplier_unit)
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
    supplier_name_matches = (
        manual_supplier_unit is not None
        and import_unit_name is not None
        and manual_supplier_unit == import_unit_name
    )
    supplier_unit_matches = (
        manual_supplier_unit is not None
        and import_supplier_unit is not None
        and manual_supplier_unit == import_supplier_unit
    )
    return code_matches or name_matches or supplier_name_matches or supplier_unit_matches


def _strong_calculation_match(manual_ingredient: Ingredient, import_ingredient: Ingredient) -> bool:
    manual_calc_unit = _normalize_unit(manual_ingredient.calculation_unit)
    import_calc_unit = _normalize_unit(import_ingredient.calculation_unit)
    if (
        manual_calc_unit is not None
        and import_calc_unit is not None
        and manual_calc_unit != import_calc_unit
    ):
        return False

    return _amounts_equal(
        manual_ingredient.calculation_quantity_per_package,
        import_ingredient.calculation_quantity_per_package,
    )


def _possible_calculation_match(manual_ingredient: Ingredient, import_ingredient: Ingredient) -> bool:
    manual_calc_unit = _normalize_unit(manual_ingredient.calculation_unit)
    import_calc_unit = _normalize_unit(import_ingredient.calculation_unit)
    unit_matches = (
        manual_calc_unit is not None
        and import_calc_unit is not None
        and manual_calc_unit == import_calc_unit
    )
    quantity_matches = (
        manual_ingredient.calculation_quantity_per_package is not None
        and import_ingredient.calculation_quantity_per_package is not None
        and _amounts_equal(
            manual_ingredient.calculation_quantity_per_package,
            import_ingredient.calculation_quantity_per_package,
        )
    )
    return unit_matches or quantity_matches


def _possible_unit_match(manual_ingredient: Ingredient, import_ingredient: Ingredient) -> bool:
    manual_supplier_unit = _clean_text(manual_ingredient.supplier_unit)
    import_supplier_unit = _clean_text(import_ingredient.supplier_unit)
    import_sales_unit_name = _clean_text(import_ingredient.supplier_sales_unit_name)
    if (
        manual_supplier_unit is not None
        and import_sales_unit_name is not None
        and manual_supplier_unit == import_sales_unit_name
    ):
        return True
    return (
        manual_supplier_unit is not None
        and import_supplier_unit is not None
        and manual_supplier_unit == import_supplier_unit
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
        and (
            _product_names_look_similar(
                manual_ingredient.supplier_product_name,
                ingredient.supplier_product_name,
            )
            or _strong_unit_match(manual_ingredient, ingredient)
            or _strong_calculation_match(manual_ingredient, ingredient)
        )
    ]
    if len(strong_matches) == 1:
        return {
            "match_status": "strong",
            "matched_import_ingredient_id": strong_matches[0].id,
        }

    possible_matches = []
    for ingredient in candidates:
        has_code_match = ingredient.supplier_product_code == manual_ingredient.supplier_product_code
        has_name_match = _product_names_look_similar(
            manual_ingredient.supplier_product_name,
            ingredient.supplier_product_name,
        )
        has_unit_match = _possible_unit_match(manual_ingredient, ingredient)
        has_calculation_match = _possible_calculation_match(manual_ingredient, ingredient)
        has_supporting_match = has_unit_match or has_calculation_match

        if has_code_match and (has_name_match or has_supporting_match):
            possible_matches.append(ingredient)
            continue

        if has_name_match and has_supporting_match:
            possible_matches.append(ingredient)

    if possible_matches:
        return {"match_status": "possible", "matched_import_ingredient_id": None}

    return {"match_status": "none", "matched_import_ingredient_id": None}


def build_import_match_debug_for_manual_ingredient(db: Session, manual_ingredient: Ingredient) -> dict:
    normalized_supplier_name = _clean_text(manual_ingredient.supplier_name)
    candidates = []
    if normalized_supplier_name is not None:
        candidates = (
            db.query(Ingredient)
            .filter(
                Ingredient.source_type == "import",
                Ingredient.is_archived.is_(False),
                func.lower(func.trim(Ingredient.supplier_name)) == normalized_supplier_name,
            )
            .order_by(Ingredient.id.asc())
            .all()
        )

    candidate_debug = []
    for ingredient in candidates:
        has_code_match = ingredient.supplier_product_code == manual_ingredient.supplier_product_code
        has_name_match = _product_names_look_similar(
            manual_ingredient.supplier_product_name,
            ingredient.supplier_product_name,
        )
        has_unit_match = _possible_unit_match(manual_ingredient, ingredient)
        has_calculation_match = _possible_calculation_match(manual_ingredient, ingredient)
        strong_unit_match = _strong_unit_match(manual_ingredient, ingredient)
        strong_calculation_match = _strong_calculation_match(manual_ingredient, ingredient)
        would_be_strong = has_code_match and (
            has_name_match or strong_unit_match or strong_calculation_match
        )
        would_be_possible = (
            (has_code_match and (has_name_match or has_unit_match or has_calculation_match))
            or (has_name_match and (has_unit_match or has_calculation_match))
        )

        candidate_debug.append(
            {
                "id": ingredient.id,
                "supplier_product_code": ingredient.supplier_product_code,
                "supplier_product_name": ingredient.supplier_product_name,
                "supplier_unit": ingredient.supplier_unit,
                "supplier_sales_unit_code": ingredient.supplier_sales_unit_code,
                "supplier_sales_unit_name": ingredient.supplier_sales_unit_name,
                "calculation_unit": ingredient.calculation_unit,
                "calculation_quantity_per_package": float(ingredient.calculation_quantity_per_package)
                if ingredient.calculation_quantity_per_package is not None
                else None,
                "has_code_match": has_code_match,
                "has_name_match": has_name_match,
                "has_unit_match": has_unit_match,
                "has_calculation_match": has_calculation_match,
                "strong_unit_match": strong_unit_match,
                "strong_calculation_match": strong_calculation_match,
                "would_be_strong": would_be_strong,
                "would_be_possible": would_be_possible,
            }
        )

    return {
        "manual_ingredient": {
            "id": manual_ingredient.id,
            "supplier_name": manual_ingredient.supplier_name,
            "supplier_product_code": manual_ingredient.supplier_product_code,
            "supplier_product_name": manual_ingredient.supplier_product_name,
            "supplier_unit": manual_ingredient.supplier_unit,
            "supplier_sales_unit_code": manual_ingredient.supplier_sales_unit_code,
            "supplier_sales_unit_name": manual_ingredient.supplier_sales_unit_name,
            "calculation_unit": manual_ingredient.calculation_unit,
            "calculation_quantity_per_package": float(manual_ingredient.calculation_quantity_per_package)
            if manual_ingredient.calculation_quantity_per_package is not None
            else None,
        },
        "current_match_result": detect_import_match_for_manual_ingredient(db, manual_ingredient),
        "candidate_count": len(candidate_debug),
        "candidates": candidate_debug,
    }
