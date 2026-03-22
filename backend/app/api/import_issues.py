from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.ingredient_import_issue import IngredientImportIssue
from app.services.ingredient_import_issue_service import resolve_issue

router = APIRouter()


def _serialize_issue(issue: IngredientImportIssue) -> dict:
    return {
        "id": issue.id,
        "import_batch_id": issue.import_batch_id,
        "ingredient_id": issue.ingredient_id,
        "supplier_product_code": issue.supplier_product_code,
        "supplier_product_name": issue.supplier_product_name,
        "issue_type": issue.issue_type,
        "status": issue.status,
        "payload_json": issue.payload_json,
        "resolution_action": issue.resolution_action,
        "resolution_payload": issue.resolution_payload,
        "created_at": issue.created_at.isoformat() if issue.created_at is not None else None,
        "resolved_at": issue.resolved_at.isoformat() if issue.resolved_at is not None else None,
    }


@router.post("/api/import-issues/{issue_id}/resolve", tags=["import-issues"])
def resolve_import_issue(issue_id: int, payload: dict, db: Session = Depends(get_db)) -> dict:
    try:
        issue = resolve_issue(
            db=db,
            issue_id=issue_id,
            action=payload.get("action"),
            payload=payload.get("payload"),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _serialize_issue(issue)
