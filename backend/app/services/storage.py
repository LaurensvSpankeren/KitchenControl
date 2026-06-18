from urllib.parse import unquote

from app.core.config import settings


class StorageConfigurationError(RuntimeError):
    pass


class StorageUploadError(RuntimeError):
    pass


class StorageDeleteError(RuntimeError):
    pass


def _save_dish_photo_local(dish_id: int, image_bytes: bytes) -> str:
    uploads_dishes_dir = settings.uploads_dir / "dishes"
    uploads_dishes_dir.mkdir(parents=True, exist_ok=True)
    target_path = uploads_dishes_dir / f"dish_{dish_id}.jpg"
    target_path.write_bytes(image_bytes)
    return f"/uploads/dishes/{target_path.name}"


def _save_semi_finished_product_photo_local(
    semi_finished_product_id: int, image_bytes: bytes
) -> str:
    uploads_dir = settings.uploads_dir / "semi_finished_products"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    target_path = uploads_dir / f"semi_finished_product_{semi_finished_product_id}.jpg"
    target_path.write_bytes(image_bytes)
    return f"/uploads/semi_finished_products/{target_path.name}"


def _get_r2_client():
    try:
        import boto3
    except ImportError as exc:
        raise StorageConfigurationError(
            "Cloudflare R2 storage is not available because boto3 is not installed."
        ) from exc

    endpoint_url = settings.r2_endpoint_url
    if not endpoint_url and settings.r2_account_id:
        endpoint_url = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"

    missing = []
    if not endpoint_url:
        missing.append("R2_ENDPOINT_URL or R2_ACCOUNT_ID")
    if not settings.r2_access_key_id:
        missing.append("R2_ACCESS_KEY_ID")
    if not settings.r2_secret_access_key:
        missing.append("R2_SECRET_ACCESS_KEY")
    if not settings.r2_bucket_name:
        missing.append("R2_BUCKET_NAME")
    if not settings.r2_public_base_url:
        missing.append("R2_PUBLIC_BASE_URL")
    if missing:
        raise StorageConfigurationError(
            f"Cloudflare R2 storage is not configured: {', '.join(missing)}."
        )

    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )


def _save_dish_photo_r2(dish_id: int, image_bytes: bytes) -> str:
    key = f"dishes/dish_{dish_id}.jpg"
    client = _get_r2_client()

    try:
        client.put_object(
            Bucket=settings.r2_bucket_name,
            Key=key,
            Body=image_bytes,
            ContentType="image/jpeg",
        )
    except Exception as exc:
        raise StorageUploadError("Foto uploaden naar Cloudflare R2 mislukt.") from exc

    return f"{settings.r2_public_base_url}/{key}"


def _save_semi_finished_product_photo_r2(
    semi_finished_product_id: int, image_bytes: bytes
) -> str:
    key = f"semi_finished_products/semi_finished_product_{semi_finished_product_id}.jpg"
    client = _get_r2_client()

    try:
        client.put_object(
            Bucket=settings.r2_bucket_name,
            Key=key,
            Body=image_bytes,
            ContentType="image/jpeg",
        )
    except Exception as exc:
        raise StorageUploadError("Foto uploaden naar Cloudflare R2 mislukt.") from exc

    return f"{settings.r2_public_base_url}/{key}"


def _r2_object_key_from_public_url(public_url: str | None) -> str | None:
    if not public_url or not settings.r2_public_base_url:
        return None

    value = str(public_url).strip()
    base_url = settings.r2_public_base_url.rstrip("/")
    if not value.startswith(f"{base_url}/"):
        return None

    key = value[len(base_url) + 1 :].split("?", 1)[0].split("#", 1)[0].lstrip("/")
    if not key:
        return None
    return unquote(key)


def delete_r2_object_for_public_url(public_url: str | None) -> bool:
    key = _r2_object_key_from_public_url(public_url)
    if key is None:
        return False

    client = _get_r2_client()
    try:
        client.delete_object(Bucket=settings.r2_bucket_name, Key=key)
    except Exception as exc:
        raise StorageDeleteError("Foto verwijderen uit Cloudflare R2 mislukt.") from exc
    return True


def save_dish_photo(dish_id: int, image_bytes: bytes) -> str:
    backend = settings.storage_backend
    if backend == "local":
        return _save_dish_photo_local(dish_id, image_bytes)
    if backend == "r2":
        return _save_dish_photo_r2(dish_id, image_bytes)

    raise StorageConfigurationError(f"Onbekende storage backend: {backend}.")


def save_semi_finished_product_photo(
    semi_finished_product_id: int, image_bytes: bytes
) -> str:
    backend = settings.storage_backend
    if backend == "local":
        return _save_semi_finished_product_photo_local(
            semi_finished_product_id, image_bytes
        )
    if backend == "r2":
        return _save_semi_finished_product_photo_r2(
            semi_finished_product_id, image_bytes
        )

    raise StorageConfigurationError(f"Onbekende storage backend: {backend}.")
