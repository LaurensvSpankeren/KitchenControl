from datetime import datetime, timedelta, timezone
from pathlib import Path


DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"


class GoogleDriveConfigurationError(RuntimeError):
    pass


class GoogleDriveRequestError(RuntimeError):
    pass


class GoogleDriveFileNotFoundError(RuntimeError):
    pass


def _is_old_enough(modified_time: str | None, minimum_age_seconds: int) -> bool:
    if minimum_age_seconds <= 0:
        return True
    if not modified_time:
        return False

    try:
        modified_at = datetime.fromisoformat(modified_time.replace("Z", "+00:00"))
    except ValueError:
        return False

    return datetime.now(timezone.utc) - modified_at >= timedelta(seconds=minimum_age_seconds)


def _build_drive_client(service_account_file: str):
    if not service_account_file:
        raise GoogleDriveConfigurationError("GOOGLE_SERVICE_ACCOUNT_FILE is niet ingesteld.")

    credentials_path = Path(service_account_file)
    if not credentials_path.is_file():
        raise GoogleDriveConfigurationError(
            "Het geconfigureerde Google service-accountbestand is niet gevonden."
        )

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise GoogleDriveConfigurationError(
            "De Google Drive dependencies zijn niet geïnstalleerd."
        ) from exc

    try:
        credentials = service_account.Credentials.from_service_account_file(
            str(credentials_path),
            scopes=[DRIVE_READONLY_SCOPE],
        )
    except (OSError, ValueError) as exc:
        raise GoogleDriveConfigurationError(
            "Het Google service-accountbestand kon niet worden gelezen."
        ) from exc

    try:
        return build("drive", "v3", credentials=credentials, cache_discovery=False)
    except Exception as exc:
        raise GoogleDriveRequestError("Google Drive kon niet worden geraadpleegd.") from exc


def get_latest_csv_file(
    folder_id: str,
    service_account_file: str,
    minimum_age_seconds: int = 0,
) -> dict | None:
    if not folder_id:
        raise GoogleDriveConfigurationError("GOOGLE_DRIVE_FOLDER_ID is niet ingesteld.")

    drive = _build_drive_client(service_account_file)
    try:
        escaped_folder_id = folder_id.replace("\\", "\\\\").replace("'", "\\'")
        page_token = None
        while True:
            response = (
                drive.files()
                .list(
                    q=f"'{escaped_folder_id}' in parents and trashed = false",
                    spaces="drive",
                    orderBy="modifiedTime desc",
                    pageSize=100,
                    pageToken=page_token,
                    fields=(
                        "nextPageToken,"
                        "files(id,name,modifiedTime,size,md5Checksum,mimeType)"
                    ),
                    includeItemsFromAllDrives=True,
                    supportsAllDrives=True,
                )
                .execute()
            )

            for file_data in response.get("files", []):
                name = str(file_data.get("name") or "")
                modified_time = file_data.get("modifiedTime")
                if not name.lower().endswith(".csv"):
                    continue
                if not _is_old_enough(modified_time, minimum_age_seconds):
                    continue

                size = file_data.get("size")
                return {
                    "file_id": file_data.get("id"),
                    "name": name,
                    "modified_time": modified_time,
                    "size": int(size) if size is not None else None,
                    "checksum": file_data.get("md5Checksum"),
                }

            page_token = response.get("nextPageToken")
            if not page_token:
                return None
    except Exception as exc:
        raise GoogleDriveRequestError("Google Drive kon niet worden geraadpleegd.") from exc


def get_file_metadata(file_id: str, service_account_file: str) -> dict:
    drive = _build_drive_client(service_account_file)
    try:
        file_data = (
            drive.files()
            .get(
                fileId=file_id,
                fields="id,name,modifiedTime,size,md5Checksum,mimeType,parents,trashed",
                supportsAllDrives=True,
            )
            .execute()
        )
    except Exception as exc:
        if getattr(getattr(exc, "resp", None), "status", None) == 404:
            raise GoogleDriveFileNotFoundError(
                "Het geselecteerde Google Drive-bestand bestaat niet meer."
            ) from exc
        raise GoogleDriveRequestError("Google Drive kon niet worden geraadpleegd.") from exc

    size = file_data.get("size")
    return {
        "file_id": file_data.get("id"),
        "name": str(file_data.get("name") or ""),
        "modified_time": file_data.get("modifiedTime"),
        "size": int(size) if size is not None else None,
        "checksum": file_data.get("md5Checksum"),
        "mime_type": file_data.get("mimeType"),
        "parents": file_data.get("parents") or [],
        "trashed": bool(file_data.get("trashed")),
    }


def download_file(file_id: str, target_path: str, service_account_file: str) -> None:
    drive = _build_drive_client(service_account_file)
    try:
        from googleapiclient.http import MediaIoBaseDownload
    except ImportError as exc:
        raise GoogleDriveConfigurationError(
            "De Google Drive dependencies zijn niet geïnstalleerd."
        ) from exc

    try:
        request = drive.files().get_media(fileId=file_id, supportsAllDrives=True)
        with open(target_path, "wb") as target_file:
            downloader = MediaIoBaseDownload(target_file, request)
            completed = False
            while not completed:
                _, completed = downloader.next_chunk()
    except Exception as exc:
        if getattr(getattr(exc, "resp", None), "status", None) == 404:
            raise GoogleDriveFileNotFoundError(
                "Het geselecteerde Google Drive-bestand bestaat niet meer."
            ) from exc
        raise GoogleDriveRequestError("Het Google Drive-bestand kon niet worden gedownload.") from exc
