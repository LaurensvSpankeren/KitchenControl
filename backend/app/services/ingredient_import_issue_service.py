import json
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.ingredient import Ingredient
from app.models.ingredient_import_issue import IngredientImportIssue


def _to_decimal(value):
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _ingredient_matches_variant(ingredient: Ingredient, variant: dict) -> bool:
    return (
        ingredient.supplier_product_code == (variant.get("supplier_product_code") or ingredient.supplier_product_code)
        and ingredient.supplier_price_ex_vat == _to_decimal(variant.get("supplier_price_ex_vat"))
        and ingredient.supplier_unit == (variant.get("supplier_unit") or "")
        and ingredient.net_content_amount == _to_decimal(variant.get("net_content_amount"))
        and ingredient.net_content_unit == variant.get("net_content_unit")
    )


def resolve_issue(
    db: Session,
    issue_id: int,
    action: str,
    payload: dict | None = None,
) -> IngredientImportIssue:
    issue = db.query(IngredientImportIssue).filter(IngredientImportIssue.id == issue_id).first()
    if issue is None:
        raise LookupError("Import issue not found")

    normalized_action = (action or "").strip()
    if not normalized_action:
        raise ValueError("action is required")

    if issue.status != "open":
        raise ValueError("Only open issues can be resolved")

    resolution_payload = dict(payload) if payload is not None else {}
    if issue.issue_type == "duplicate_conflict_in_file" and normalized_action == "choose_duplicate_variant":
        issue_payload = json.loads(issue.payload_json) if issue.payload_json else {}
        variants = issue_payload.get("variants") if isinstance(issue_payload, dict) else None
        chosen_variant_index = resolution_payload.get("chosen_variant_index")
        apply_result = "no_variants"

        if isinstance(variants, list) and isinstance(chosen_variant_index, int):
            if 0 <= chosen_variant_index < len(variants):
                chosen_variant = variants[chosen_variant_index]
                active_ingredients = (
                    db.query(Ingredient)
                    .filter(
                        Ingredient.supplier_product_code == issue.supplier_product_code,
                        Ingredient.is_archived.is_(False),
                    )
                    .all()
                )
                chosen_matches = [
                    ingredient
                    for ingredient in active_ingredients
                    if _ingredient_matches_variant(ingredient, chosen_variant)
                ]

                if len(chosen_matches) == 1:
                    chosen_ingredient = chosen_matches[0]
                    archived_ids = []
                    now = datetime.now(timezone.utc)
                    for ingredient in active_ingredients:
                        if ingredient.id == chosen_ingredient.id:
                            continue
                        ingredient.is_archived = True
                        ingredient.archived_at = now
                        archived_ids.append(ingredient.id)
                    resolution_payload["kept_ingredient_id"] = chosen_ingredient.id
                    resolution_payload["affected_ingredient_ids"] = archived_ids
                    apply_result = "archived_duplicates"
                else:
                    apply_result = "no_unique_match"
            else:
                apply_result = "invalid_variant_index"

        resolution_payload["apply_result"] = apply_result

    issue.resolution_action = normalized_action
    issue.resolution_payload = json.dumps(resolution_payload) if resolution_payload else None
    issue.status = "ignored" if normalized_action == "ignore" else "resolved"
    issue.resolved_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(issue)
    return issue
