import hashlib
import os
import tempfile

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import has_permission
from app.services.google_drive import (
    GoogleDriveConfigurationError,
    GoogleDriveFileNotFoundError,
    GoogleDriveRequestError,
    download_file,
    get_file_metadata,
    get_latest_csv_file,
)
from app.services.ingredient_import import import_ingredients_from_csv

router = APIRouter()


@router.get("/api/imports/google-drive/latest", tags=["imports"])
def get_latest_google_drive_csv(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.importeren", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")
    if not settings.google_drive_import_enabled:
        raise HTTPException(
            status_code=503,
            detail="Google Drive-import is niet geconfigureerd.",
        )
    if not settings.google_drive_folder_id:
        raise HTTPException(
            status_code=503,
            detail="GOOGLE_DRIVE_FOLDER_ID is niet ingesteld.",
        )

    try:
        latest_file = get_latest_csv_file(
            folder_id=settings.google_drive_folder_id,
            service_account_file=settings.google_service_account_file,
            minimum_age_seconds=settings.google_drive_min_file_age_seconds,
        )
    except GoogleDriveConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except GoogleDriveRequestError as exc:
        raise HTTPException(
            status_code=502,
            detail="Google Drive kon niet worden gecontroleerd.",
        ) from exc

    if latest_file is None:
        raise HTTPException(
            status_code=404,
            detail="Geen CSV-bestand gevonden in de gekoppelde Google Drive-map.",
        )
    return latest_file


@router.post("/api/imports/google-drive/import", tags=["imports"])
def import_google_drive_csv(
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.importeren", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")
    if not settings.google_drive_import_enabled:
        raise HTTPException(
            status_code=503,
            detail="Google Drive-import is niet geconfigureerd.",
        )
    if not settings.google_drive_folder_id:
        raise HTTPException(
            status_code=503,
            detail="GOOGLE_DRIVE_FOLDER_ID is niet ingesteld.",
        )

    file_id = str(payload.get("file_id") or "").strip()
    expected_checksum = str(payload.get("checksum") or "").strip() or None
    if not file_id:
        raise HTTPException(status_code=400, detail="Google Drive file_id ontbreekt.")

    try:
        metadata = get_file_metadata(
            file_id=file_id,
            service_account_file=settings.google_service_account_file,
        )
    except GoogleDriveConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except GoogleDriveFileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except GoogleDriveRequestError as exc:
        raise HTTPException(
            status_code=502,
            detail="Google Drive kon niet worden gecontroleerd.",
        ) from exc

    if metadata["trashed"]:
        raise HTTPException(status_code=400, detail="Het geselecteerde bestand staat in de prullenbak.")
    if settings.google_drive_folder_id not in metadata["parents"]:
        raise HTTPException(
            status_code=400,
            detail="Het geselecteerde bestand staat niet in de gekoppelde Google Drive-map.",
        )
    if not metadata["name"].lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Het geselecteerde bestand is geen CSV-bestand.")

    current_checksum = metadata.get("checksum")
    if expected_checksum and current_checksum != expected_checksum:
        raise HTTPException(
            status_code=409,
            detail="Het Google Drive-bestand is gewijzigd sinds de laatste controle.",
        )

    temp_file_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as temp_file:
            temp_file_path = temp_file.name

        try:
            download_file(
                file_id=file_id,
                target_path=temp_file_path,
                service_account_file=settings.google_service_account_file,
            )
        except GoogleDriveConfigurationError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except GoogleDriveFileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except GoogleDriveRequestError as exc:
            raise HTTPException(
                status_code=502,
                detail="Het Google Drive-bestand kon niet worden gedownload.",
            ) from exc

        if current_checksum:
            checksum = hashlib.md5()
            with open(temp_file_path, "rb") as downloaded_file:
                for chunk in iter(lambda: downloaded_file.read(1024 * 1024), b""):
                    checksum.update(chunk)
            downloaded_checksum = checksum.hexdigest()
            if downloaded_checksum != current_checksum:
                raise HTTPException(
                    status_code=409,
                    detail="De gedownloade CSV komt niet overeen met de gecontroleerde versie.",
                )

        summary = import_ingredients_from_csv(temp_file_path, db)
        return {
            **summary,
            "filename": metadata["name"],
            "file_id": metadata["file_id"],
            "checksum": current_checksum,
        }
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)


@router.post("/api/imports/ingredients", tags=["imports"])
async def import_ingredients(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "importbeheer.importeren", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    temp_file_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name

        summary = import_ingredients_from_csv(temp_file_path, db)
        return summary
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
