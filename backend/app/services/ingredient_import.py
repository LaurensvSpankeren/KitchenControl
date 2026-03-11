import csv

from sqlalchemy.orm import Session

from app.models.ingredient import Ingredient


def _parse_number(value: str | None) -> float | None:
    if value is None:
        return None
    cleaned = value.strip().replace(",", ".")
    if cleaned == "":
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def import_ingredients_from_csv(file_path: str, db: Session) -> dict[str, int]:
    created = 0
    updated = 0

    with open(file_path, newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file, delimiter=";")

        for row in reader:
            supplier_product_code = (row.get("Artikelnummer") or "").strip()
            supplier_product_name = (row.get("Omschrijving artikel") or "").strip()
            supplier_unit = (
                (row.get("Omschrijving verkoopeenheid") or "").strip()
                or (row.get("Verkoopeenheid") or "").strip()
            )
            supplier_price_ex_vat = _parse_number(
                row.get("Nettoprijs artikel (incl. klantconditie)")
            )
            supplier_vat_rate = _parse_number(row.get("BTW waarde"))
            supplier_allergens_raw = (row.get("Ingredienten - declaratie") or "").strip() or None

            if not supplier_product_code:
                continue

            ingredient = (
                db.query(Ingredient)
                .filter(Ingredient.supplier_product_code == supplier_product_code)
                .first()
            )

            if ingredient:
                ingredient.supplier_product_name = supplier_product_name or ingredient.supplier_product_name
                ingredient.supplier_unit = supplier_unit or ingredient.supplier_unit
                ingredient.supplier_price_ex_vat = supplier_price_ex_vat
                ingredient.supplier_vat_rate = supplier_vat_rate
                ingredient.supplier_allergens_raw = supplier_allergens_raw
                updated += 1
            else:
                ingredient = Ingredient(
                    supplier_name="Bidfood",
                    supplier_product_code=supplier_product_code,
                    supplier_product_name=supplier_product_name or supplier_product_code,
                    supplier_unit=supplier_unit or "st",
                    supplier_price_ex_vat=supplier_price_ex_vat,
                    supplier_vat_rate=supplier_vat_rate,
                    supplier_allergens_raw=supplier_allergens_raw,
                    base_unit=supplier_unit or "st",
                )
                db.add(ingredient)
                created += 1

    db.commit()

    return {"created": created, "updated": updated}
