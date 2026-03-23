from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.models.ingredient import Ingredient


def _to_decimal(value):
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _clean_string(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _legacy_matches_new_variant(legacy: Ingredient, variant: Ingredient) -> bool:
    legacy_unit = _clean_string(legacy.supplier_unit)
    variant_unit = _clean_string(variant.supplier_sales_unit_name) or _clean_string(
        variant.supplier_sales_unit_code
    )
    if legacy_unit is None or variant_unit is None or legacy_unit != variant_unit:
        return False

    if _to_decimal(legacy.supplier_price_ex_vat) != _to_decimal(variant.supplier_price_ex_vat):
        return False
    if _to_decimal(legacy.net_content_amount) != _to_decimal(variant.net_content_amount):
        return False
    if _clean_string(legacy.net_content_unit) != _clean_string(variant.net_content_unit):
        return False

    return True


def archive_legacy_variant_duplicates(db: Session) -> dict:
    scanned = 0
    archived = 0
    skipped = 0

    supplier_product_codes = [
        row[0]
        for row in (
            db.query(Ingredient.supplier_product_code)
            .filter(
                Ingredient.is_archived.is_(False),
                Ingredient.supplier_sales_unit_code.is_(None),
                Ingredient.supplier_sales_unit_name.is_(None),
            )
            .distinct()
            .all()
        )
    ]

    for supplier_product_code in supplier_product_codes:
        legacy_rows = (
            db.query(Ingredient)
            .filter(
                Ingredient.supplier_product_code == supplier_product_code,
                Ingredient.is_archived.is_(False),
                Ingredient.supplier_sales_unit_code.is_(None),
                Ingredient.supplier_sales_unit_name.is_(None),
            )
            .all()
        )
        variant_rows = (
            db.query(Ingredient)
            .filter(
                Ingredient.supplier_product_code == supplier_product_code,
                Ingredient.is_archived.is_(False),
                (Ingredient.supplier_sales_unit_code.is_not(None))
                | (Ingredient.supplier_sales_unit_name.is_not(None)),
            )
            .all()
        )

        matches_by_legacy: dict[int, list[Ingredient]] = {}
        for legacy in legacy_rows:
            scanned += 1
            matches_by_legacy[legacy.id] = [
                variant
                for variant in variant_rows
                if _legacy_matches_new_variant(legacy, variant)
            ]

        for legacy in legacy_rows:
            matches = matches_by_legacy.get(legacy.id, [])
            if len(matches) != 1:
                skipped += 1
                continue

            matched_variant = matches[0]
            reverse_matches = [
                other_legacy
                for other_legacy in legacy_rows
                if matched_variant in matches_by_legacy.get(other_legacy.id, [])
            ]
            if len(reverse_matches) != 1:
                skipped += 1
                continue

            legacy.is_archived = True
            legacy.archived_at = datetime.now(timezone.utc)
            archived += 1

    db.commit()
    return {"scanned": scanned, "archived": archived, "skipped": skipped}
