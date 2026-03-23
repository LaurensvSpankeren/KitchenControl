from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.ingredient import Ingredient
from app.models.recipe_line import RecipeLine
from app.services.ingredient_import_match_service import detect_import_match_for_manual_ingredient


def link_manual_ingredient_to_import(db: Session, manual_ingredient_id: int) -> dict:
    manual_ingredient = db.query(Ingredient).filter(Ingredient.id == manual_ingredient_id).first()
    if manual_ingredient is None:
        raise LookupError("Ingredient not found")
    if manual_ingredient.source_type != "manual":
        raise ValueError("Only manual ingredients can be linked via this endpoint")
    if manual_ingredient.is_archived:
        raise ValueError("Archived manual ingredients cannot be linked")

    match = detect_import_match_for_manual_ingredient(db, manual_ingredient)
    if match.get("match_status") != "strong":
        raise ValueError("Only manual ingredients with a strong import match can be linked")

    import_ingredient_id = match.get("matched_import_ingredient_id")
    if not import_ingredient_id:
        raise ValueError("Strong import match did not return a matched import ingredient")

    import_ingredient = db.query(Ingredient).filter(Ingredient.id == import_ingredient_id).first()
    if import_ingredient is None:
        raise ValueError("Matched import ingredient not found")
    if import_ingredient.source_type != "import":
        raise ValueError("Matched ingredient is not an active import ingredient")
    if import_ingredient.is_archived:
        raise ValueError("Matched import ingredient is archived")

    recipe_lines = (
        db.query(RecipeLine)
        .filter(RecipeLine.item_type == "ingredient", RecipeLine.item_id == manual_ingredient.id)
        .all()
    )
    for recipe_line in recipe_lines:
        recipe_line.item_id = import_ingredient.id

    now = datetime.now(timezone.utc)
    manual_ingredient.is_archived = True
    manual_ingredient.archived_at = now
    manual_ingredient.awaiting_import_match = False
    manual_ingredient.last_manual_review_at = now

    db.commit()

    return {
        "linked": True,
        "manual_ingredient_id": manual_ingredient.id,
        "import_ingredient_id": import_ingredient.id,
        "updated_recipe_line_count": len(recipe_lines),
    }
