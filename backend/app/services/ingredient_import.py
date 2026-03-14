import csv
import re

from sqlalchemy.orm import Session

from app.models.ingredient import Ingredient

ALLERGEN_COLUMN_MAP = {
    "Zwaveldioxide en sulfieten": "zwaveldioxide en sulfieten",
    "Pinda's (aardnoten)": "pinda",
    "Bevat sporen van boomnoten": "boomnoten",
    "Melk": "melk",
    "Lactose": "lactose",
    "Sesam": "sesam",
    "Gluten": "gluten",
    "Mosterd": "mosterd",
    "Selderij": "selderij",
    "Ei": "ei",
    "Weekdieren": "weekdieren",
    "Schaaldieren": "schaaldieren",
    "Vis": "vis",
    "Soja": "soja",
    "Tarwe": "tarwe",
    "Rogge": "rogge",
    "Lupine": "lupine",
    "Gerst": "gerst",
    "Haver": "haver",
    "Spelt": "spelt",
    "Kamut": "kamut",
    "Hazelnoten": "hazelnoten",
    "Walnoten": "walnoten",
    "Pecannoten": "pecannoten",
    "Paranoten": "paranoten",
    "Macadamianoten": "macadamianoten",
    "Pistachenoten": "pistachenoten",
    "Amandelen": "amandelen",
    "Cashewnoten": "cashewnoten",
}

NEGATIVE_ALLERGEN_VALUES = {
    "",
    "-",
    "bevat geen",
    "geen",
    "n.v.t.",
    "nvt",
    "nee",
    "no",
    "false",
    "0",
}

PIECE_HINT_TERMS = ("stuk", "stuks", " st ", "x", "rol", "rollen", "brood", "portie")


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


def _normalize_unit(value: str | None) -> str | None:
    if not value:
        return None
    unit = value.strip().lower()
    mapping = {
        "gr": "gram",
        "g": "gram",
        "gram": "gram",
        "kg": "kg",
        "l": "liter",
        "lt": "liter",
        "liter": "liter",
        "ml": "ml",
        "stuk": "stuk",
        "st": "stuk",
        "stuks": "stuk",
    }
    return mapping.get(unit, unit)


def _extract_amount_and_unit_from_text(value: str | None) -> tuple[float | None, str | None]:
    if not value:
        return None, None

    raw = value.strip().replace(",", ".")
    matches = re.findall(
        r"(\d+(?:\.\d+)?)\s*(kg|gr|gram|g|ml|liter|l|lt|stuk|st|stuks)",
        raw,
        re.IGNORECASE,
    )
    if not matches:
        return None, None

    normalized_matches: list[tuple[float | None, str | None]] = [
        (_parse_number(amount), _normalize_unit(unit)) for amount, unit in matches
    ]

    for amount, unit in normalized_matches:
        if unit in {"kg", "gram", "liter", "ml"} and amount is not None:
            return amount, unit

    for amount, unit in normalized_matches:
        if unit is not None and amount is not None:
            return amount, unit

    return None, None


def _extract_units_per_package(row: dict) -> float | None:
    verkoop_unit = (row.get("Verkoopeenheid") or "").strip()
    direct = _parse_number(verkoop_unit)
    if direct is not None:
        return direct

    desc_content = (row.get("Omschrijving inhoud artikel") or "").strip().replace(",", ".")
    multi_match = re.search(r"(\d+(?:\.\d+)?)\s*[xX]", desc_content)
    if multi_match:
        return _parse_number(multi_match.group(1))

    piece_match = re.search(r"(\d+(?:\.\d+)?)\s*(st|stuks|stuk)", desc_content, re.IGNORECASE)
    if piece_match:
        return _parse_number(piece_match.group(1))

    return None


def _extract_explicit_net_unit(row: dict) -> str | None:
    unit_columns = [
        "Eenheid Netto inhoud",
        "Eenheid netto inhoud",
        "Netto inhoud eenheid",
        "Eenheid Netto Gewicht",
        "Eenheid netto gewicht",
        "Netto gewicht eenheid",
    ]

    for column_name in unit_columns:
        normalized_unit = _normalize_unit(row.get(column_name))
        if normalized_unit:
            return normalized_unit

    return None


def _derive_calculation_values(
    net_content_unit: str | None,
    net_content_amount: float | None,
    units_per_package: float | None,
) -> tuple[str | None, float | None]:
    unit = _normalize_unit(net_content_unit)

    if unit == "kg" and net_content_amount is not None:
        return "gram", net_content_amount * 1000
    if unit == "gram" and net_content_amount is not None:
        return "gram", net_content_amount
    if unit == "liter" and net_content_amount is not None:
        return "ml", net_content_amount * 1000
    if unit == "ml" and net_content_amount is not None:
        return "ml", net_content_amount
    if unit == "stuk":
        return "stuk", units_per_package if units_per_package else 1

    return None, None


def _derive_dual_unit_values(
    calc_unit: str | None,
    calc_quantity: float | None,
    units_per_package: float | None,
    supplier_unit: str | None,
    supplier_pack_description: str | None,
) -> tuple[str | None, str | None, float | None]:
    if (
        calc_unit is None
        or calc_quantity is None
        or calc_quantity <= 0
        or units_per_package is None
        or units_per_package <= 1
    ):
        return None, None, None

    normalized_calc_unit = _normalize_unit(calc_unit)
    if normalized_calc_unit not in {"gram", "ml"}:
        return None, None, None

    combined_text = f"{supplier_unit or ''} {supplier_pack_description or ''}".lower()
    if not any(term in combined_text for term in PIECE_HINT_TERMS):
        return None, None, None

    factor = calc_quantity / units_per_package
    if factor <= 0:
        return None, None, None

    return "stuk", normalized_calc_unit, factor


def _extract_net_content(row: dict) -> tuple[float | None, str | None]:
    amount = _parse_number(row.get("Netto inhoud"))
    amount_source = "netto_inhoud" if amount is not None else None
    if amount == 0:
        amount = None
        amount_source = None

    if amount is None:
        amount = _parse_number(row.get("Netto Gewicht"))
        amount_source = "netto_gewicht" if amount is not None else amount_source
    if amount is None:
        amount = _parse_number(row.get("Netto gewicht"))
        amount_source = "netto_gewicht" if amount is not None else amount_source

    text_amount, text_unit = _extract_amount_and_unit_from_text(row.get("Omschrijving inhoud artikel"))
    explicit_unit = _extract_explicit_net_unit(row)

    if amount is None and text_amount is not None:
        amount = text_amount
        amount_source = "text"

    # Expliciete bronkolommen zijn leidend. Vrije tekst gebruiken we hier alleen als
    # extra unit-hint wanneer de teksthoeveelheid overeenkomt met de kolomhoeveelheid.
    if amount_source in {"netto_inhoud", "netto_gewicht"}:
        unit = explicit_unit
        if (
            unit is None
            and text_unit is not None
            and text_amount is not None
            and amount is not None
            and abs(text_amount - amount) < 1e-9
        ):
            unit = text_unit
        if unit is None and amount_source == "netto_gewicht" and amount is not None:
            unit = "kg"
        return amount, unit

    unit = explicit_unit or text_unit
    if amount_source == "text" and amount is not None and unit is None:
        unit = "kg"

    return amount, unit


def _is_positive_allergen_value(value: str | None) -> bool:
    normalized = (value or "").strip().lower()
    if normalized in NEGATIVE_ALLERGEN_VALUES:
        return False
    if "bevat geen" in normalized:
        return False
    if "bevat" in normalized:
        return True
    return normalized in {"ja", "yes", "true", "1", "sporen"}


def _extract_supplier_allergens(row: dict) -> str | None:
    allergens: list[str] = []
    for column_name, allergen_name in ALLERGEN_COLUMN_MAP.items():
        if _is_positive_allergen_value(row.get(column_name)):
            allergens.append(allergen_name)

    if not allergens:
        return None
    return " | ".join(dict.fromkeys(allergens))


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
            supplier_allergens_raw = _extract_supplier_allergens(row)
            supplier_brand = (row.get("Merknaam voluit") or "").strip() or None
            category = (row.get("Omschrijving hoofdproduktgroep") or "").strip() or None

            packaging_type = (row.get("Omschrijving verkoopeenheid") or "").strip() or None
            units_per_package = _extract_units_per_package(row)
            net_content_amount, net_content_unit = _extract_net_content(row)
            supplier_pack_description = (row.get("Omschrijving inhoud artikel") or "").strip() or None

            calc_unit, calc_quantity = _derive_calculation_values(
                net_content_unit,
                net_content_amount,
                units_per_package,
            )
            preferred_unit, secondary_unit, secondary_unit_factor = _derive_dual_unit_values(
                calc_unit,
                calc_quantity,
                units_per_package,
                supplier_unit,
                supplier_pack_description,
            )

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
                ingredient.supplier_brand = supplier_brand
                ingredient.category = category
                ingredient.supplier_pack_description = supplier_pack_description
                ingredient.packaging_type = packaging_type
                ingredient.units_per_package = units_per_package
                ingredient.net_content_amount = net_content_amount
                ingredient.net_content_unit = net_content_unit
                ingredient.supplier_net_content = net_content_amount
                if calc_unit is not None and calc_quantity is not None:
                    ingredient.calculation_unit = calc_unit
                    ingredient.calculation_quantity_per_package = calc_quantity
                    ingredient.conversion_factor_to_base = calc_quantity
                if (
                    preferred_unit is not None
                    and secondary_unit is not None
                    and secondary_unit_factor is not None
                    and ingredient.preferred_unit is None
                    and ingredient.secondary_unit is None
                    and ingredient.secondary_unit_factor is None
                ):
                    ingredient.preferred_unit = preferred_unit
                    ingredient.secondary_unit = secondary_unit
                    ingredient.secondary_unit_factor = secondary_unit_factor
                updated += 1
            else:
                base_unit = calc_unit or supplier_unit or "st"
                ingredient = Ingredient(
                    supplier_name="Bidfood",
                    supplier_product_code=supplier_product_code,
                    supplier_product_name=supplier_product_name or supplier_product_code,
                    supplier_brand=supplier_brand,
                    supplier_unit=supplier_unit or "st",
                    supplier_pack_description=supplier_pack_description,
                    supplier_net_content=net_content_amount,
                    packaging_type=packaging_type,
                    units_per_package=units_per_package,
                    net_content_amount=net_content_amount,
                    net_content_unit=net_content_unit,
                    calculation_unit=calc_unit,
                    calculation_quantity_per_package=calc_quantity,
                    preferred_unit=preferred_unit,
                    secondary_unit=secondary_unit,
                    secondary_unit_factor=secondary_unit_factor,
                    supplier_price_ex_vat=supplier_price_ex_vat,
                    supplier_vat_rate=supplier_vat_rate,
                    supplier_allergens_raw=supplier_allergens_raw,
                    category=category,
                    base_unit=base_unit,
                    conversion_factor_to_base=calc_quantity if calc_quantity is not None else 1,
                )
                db.add(ingredient)
                created += 1

    db.commit()

    return {"created": created, "updated": updated}
