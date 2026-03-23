import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.ingredient_import_issue import IngredientImportIssue


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

    issue.resolution_action = normalized_action
    issue.resolution_payload = json.dumps(payload) if payload is not None else None
    issue.status = "ignored" if normalized_action == "ignore" else "resolved"
    issue.resolved_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(issue)
    return issue
