import os
import tempfile

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.ingredient_import import import_ingredients_from_csv

router = APIRouter()


@router.post("/api/imports/ingredients", tags=["imports"])
async def import_ingredients(file: UploadFile = File(...), db: Session = Depends(get_db)) -> dict:
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
