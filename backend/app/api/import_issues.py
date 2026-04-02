from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.session import get_db
from app.models.ingredient_import_issue import IngredientImportIssue
from app.models.user import has_permission
from app.services.ingredient_import_issue_service import resolve_issue
from app.services.ingredient_variant_cleanup_service import archive_legacy_variant_duplicates

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


@router.get("/api/import-issues", tags=["import-issues"])
def list_import_issues(
    status: str | None = None,
    issue_type: str | None = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> list[dict]:
    if not has_permission(current_user, "importbeheer.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")
    if not has_permission(current_user, "importbeheer.samenvoegen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    query = db.query(IngredientImportIssue)
    if status:
        query = query.filter(IngredientImportIssue.status == status)
    if issue_type:
        query = query.filter(IngredientImportIssue.issue_type == issue_type)

    issues = query.order_by(IngredientImportIssue.created_at.desc()).all()
    return [_serialize_issue(issue) for issue in issues]


@router.get("/api/import-issues/{issue_id}", tags=["import-issues"])
def get_import_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")
    if not has_permission(current_user, "importbeheer.samenvoegen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    issue = db.query(IngredientImportIssue).filter(IngredientImportIssue.id == issue_id).first()
    if issue is None:
        raise HTTPException(status_code=404, detail="Import issue not found")
    return _serialize_issue(issue)


@router.post("/api/import-issues/{issue_id}/resolve", tags=["import-issues"])
def resolve_import_issue(
    issue_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.samenvoegen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

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


@router.post("/api/import-issues/cleanup-legacy-variants", tags=["import-issues"])
def cleanup_legacy_variant_duplicates(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.samenvoegen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    return archive_legacy_variant_duplicates(db)
