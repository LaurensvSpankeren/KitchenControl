import csv
import json
import re
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.ingredient import Ingredient
from app.models.ingredient_import_batch import IngredientImportBatch
from app.models.ingredient_import_issue import IngredientImportIssue
from app.models.ingredient_price_history import IngredientPriceHistory

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
SUBPACKAGE_UNIT_TERMS = ("zak", "stuk", "stuks", "rol", "rollen", "portie", "bak", "tray", "pak")
SUBPACKAGE_UNIT_CODES = {"ZK", "ST", "RL", "TR", "BK", "PK"}
OUTER_PACK_TERMS = ("tray", "doos", "krat", "collo", "bak", "emmer")
OUTER_PACK_CODES = {"TR", "DS", "KR", "CL", "BK", "EM"}
INNER_PACK_TERMS = ("pak", "fles", "blik", "pot", "stuk", "stuks")
INNER_PACK_CODES = {"PK", "FL", "BL", "PT", "ST"}
AMOUNT_MATCH_EPSILON = 1e-6
DERIVED_CONTENT_MATCH_RATIO = 0.005
SALES_FACTOR_SUBPACKAGE_TERMS = ("folie", "zak", "pak", "verpakking", "pouch")
SALES_FACTOR_SUBPACKAGE_CODES = {"FO", "ZK", "PK"}


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


def _extract_nested_multipack_from_text(
    value: str | None,
) -> tuple[float | None, str | None, float | None, float | None]:
    if not value:
        return None, None, None, None

    normalized = value.strip().replace(",", ".")
    match = re.fullmatch(
        r"(\d+)\s*[xX]\s*(\d+)\s*[xX]\s*(\d+(?:\.\d+)?)\s*(kg|gr|gram|g|ml|liter|l|lt)",
        normalized,
        re.IGNORECASE,
    )
    if not match:
        return None, None, None, None

    outer_count = _parse_number(match.group(1))
    inner_count = _parse_number(match.group(2))
    per_unit_amount = _parse_number(match.group(3))
    unit = _normalize_unit(match.group(4))
    if (
        outer_count is None
        or inner_count is None
        or per_unit_amount is None
        or outer_count <= 1
        or inner_count <= 1
        or per_unit_amount <= 0
    ):
        return None, None, None, None

    units_per_package = outer_count * inner_count
    if unit in {"kg", "gram"}:
        normalized_per_unit_amount = _normalize_weight_to_gram(per_unit_amount, unit)
        calc_unit = "gram"
    elif unit in {"liter", "ml"}:
        normalized_per_unit_amount = _normalize_volume_to_ml(per_unit_amount, unit)
        calc_unit = "ml"
    else:
        return None, None, None, None

    if normalized_per_unit_amount is None:
        return None, None, None, None

    return (
        units_per_package,
        calc_unit,
        units_per_package * normalized_per_unit_amount,
        normalized_per_unit_amount,
    )


def _extract_simple_multipack_from_text(
    value: str | None,
) -> tuple[float | None, str | None, float | None, float | None]:
    if not value:
        return None, None, None, None

    normalized = value.strip().replace(",", ".")
    match = re.fullmatch(
        r"(\d+)\s*[xX]\s*(\d+(?:\.\d+)?)\s*(kg|gr|gram|g|ml|liter|l|lt)",
        normalized,
        re.IGNORECASE,
    )
    if not match:
        return None, None, None, None

    units_per_subpackage = _parse_number(match.group(1))
    per_unit_amount = _parse_number(match.group(2))
    unit = _normalize_unit(match.group(3))
    if (
        units_per_subpackage is None
        or per_unit_amount is None
        or units_per_subpackage <= 1
        or per_unit_amount <= 0
    ):
        return None, None, None, None

    if unit in {"kg", "gram"}:
        normalized_per_unit_amount = _normalize_weight_to_gram(per_unit_amount, unit)
        calc_unit = "gram"
    elif unit in {"liter", "ml"}:
        normalized_per_unit_amount = _normalize_volume_to_ml(per_unit_amount, unit)
        calc_unit = "ml"
    else:
        return None, None, None, None

    if normalized_per_unit_amount is None:
        return None, None, None, None

    return (
        units_per_subpackage,
        calc_unit,
        units_per_subpackage * normalized_per_unit_amount,
        normalized_per_unit_amount,
    )


def _text_contains_explicit_multiplier(value: str | None) -> bool:
    if not value:
        return False
    normalized = value.strip().replace(",", ".")
    return bool(re.search(r"\d+(?:\.\d+)?\s*[xX]\s*\d", normalized))


def _looks_like_outer_pack(unit_code: str | None, unit_name: str | None) -> bool:
    normalized_code = (unit_code or "").strip().upper()
    normalized_name = (unit_name or "").strip().lower()
    return normalized_code in OUTER_PACK_CODES or any(term in normalized_name for term in OUTER_PACK_TERMS)


def _looks_like_inner_pack(unit_code: str | None, unit_name: str | None) -> bool:
    normalized_code = (unit_code or "").strip().upper()
    normalized_name = (unit_name or "").strip().lower()
    return normalized_code in INNER_PACK_CODES or any(term in normalized_name for term in INNER_PACK_TERMS)


def _looks_like_sales_factor_subpackage(unit_code: str | None, unit_name: str | None) -> bool:
    normalized_code = (unit_code or "").strip().upper()
    normalized_name = (unit_name or "").strip().lower()
    return normalized_code in SALES_FACTOR_SUBPACKAGE_CODES or any(
        term in normalized_name for term in SALES_FACTOR_SUBPACKAGE_TERMS
    )


def _amounts_match_with_tolerance(expected: float, actual: float) -> bool:
    tolerance = max(AMOUNT_MATCH_EPSILON, abs(expected) * DERIVED_CONTENT_MATCH_RATIO)
    return abs(expected - actual) <= tolerance


def _derive_sales_factor_subpackage_values(
    supplier_sales_factor: float | None,
    supplier_sales_unit_code: str | None,
    supplier_sales_unit_name: str | None,
    supplier_standard_unit_code: str | None,
    supplier_standard_unit_name: str | None,
    supplier_pack_description: str | None,
    package_weight_amount: float | None,
    package_weight_unit: str | None,
    standard_package_weight_amount: float | None,
    standard_package_weight_unit: str | None,
    package_volume_amount: float | None,
    package_volume_unit: str | None,
) -> tuple[float | None, str | None, float | None, bool]:
    if supplier_sales_factor is None or supplier_sales_factor <= 1:
        return None, None, None, False

    sales_unit_code = (supplier_sales_unit_code or "").strip().upper()
    standard_unit_code = (supplier_standard_unit_code or "").strip().upper()
    sales_unit_name = (supplier_sales_unit_name or "").strip().lower()
    standard_unit_name = (supplier_standard_unit_name or "").strip().lower()
    if sales_unit_code == standard_unit_code and sales_unit_name == standard_unit_name:
        return None, None, None, False

    if not _looks_like_outer_pack(supplier_sales_unit_code, supplier_sales_unit_name):
        return None, None, None, False
    if not _looks_like_sales_factor_subpackage(
        supplier_standard_unit_code,
        supplier_standard_unit_name,
    ):
        return None, None, None, False

    (
        units_per_subpackage,
        calc_unit,
        subpackage_calc_quantity,
        secondary_unit_factor,
    ) = _extract_simple_multipack_from_text(supplier_pack_description)
    if (
        units_per_subpackage is None
        or calc_unit is None
        or subpackage_calc_quantity is None
        or secondary_unit_factor is None
    ):
        return None, None, None, False

    if calc_unit == "gram":
        total_source_amount = package_weight_amount
        total_source_unit = package_weight_unit
        standard_source_amount = standard_package_weight_amount
        standard_source_unit = standard_package_weight_unit
        normalize_fn = _normalize_weight_to_gram
    elif calc_unit == "ml":
        total_source_amount = package_volume_amount
        total_source_unit = package_volume_unit
        standard_source_amount = None
        standard_source_unit = None
        normalize_fn = _normalize_volume_to_ml
    else:
        return None, None, None, False

    total_source_quantity = (
        normalize_fn(total_source_amount, total_source_unit)
        if total_source_amount is not None and total_source_unit is not None
        else None
    )
    expected_total_quantity = supplier_sales_factor * subpackage_calc_quantity
    if total_source_quantity is None or not _amounts_match_with_tolerance(
        expected_total_quantity,
        total_source_quantity,
    ):
        return None, None, None, False

    standard_source_quantity = (
        normalize_fn(standard_source_amount, standard_source_unit)
        if standard_source_amount is not None and standard_source_unit is not None
        else None
    )
    if standard_source_quantity is not None and not _amounts_match_with_tolerance(
        subpackage_calc_quantity,
        standard_source_quantity,
    ):
        return None, None, None, False

    return (
        supplier_sales_factor * units_per_subpackage,
        calc_unit,
        expected_total_quantity,
        True,
    )


def _derive_safe_multipack_values(
    supplier_sales_factor: float | None,
    supplier_sales_unit_code: str | None,
    supplier_sales_unit_name: str | None,
    supplier_standard_unit_code: str | None,
    supplier_standard_unit_name: str | None,
    supplier_pack_description: str | None,
    units_per_package: float | None,
    calc_unit: str | None,
    calc_quantity: float | None,
) -> tuple[float | None, float | None, bool]:
    if supplier_sales_factor is None or supplier_sales_factor <= 1:
        return units_per_package, calc_quantity, False

    sales_unit_code = (supplier_sales_unit_code or "").strip().upper()
    standard_unit_code = (supplier_standard_unit_code or "").strip().upper()
    sales_unit_name = (supplier_sales_unit_name or "").strip().lower()
    standard_unit_name = (supplier_standard_unit_name or "").strip().lower()
    if (
        sales_unit_code == standard_unit_code
        and sales_unit_name
        and standard_unit_name
        and sales_unit_name == standard_unit_name
    ):
        return units_per_package, calc_quantity, False

    if not _looks_like_outer_pack(supplier_sales_unit_code, supplier_sales_unit_name):
        return units_per_package, calc_quantity, False
    if not _looks_like_inner_pack(supplier_standard_unit_code, supplier_standard_unit_name):
        return units_per_package, calc_quantity, False
    if _text_contains_explicit_multiplier(supplier_pack_description):
        return units_per_package, calc_quantity, False

    text_amount, text_unit = _extract_amount_and_unit_from_text(supplier_pack_description)
    normalized_calc_unit = _normalize_unit(calc_unit)
    normalized_text_unit = _normalize_unit(text_unit)
    if (
        text_amount is None
        or normalized_text_unit not in {"gram", "kg", "liter", "ml"}
        or normalized_calc_unit is None
        or calc_quantity is None
    ):
        return units_per_package, calc_quantity, False

    single_item_quantity = calc_quantity
    if normalized_calc_unit in {"gram", "ml"}:
        normalized_text_quantity = (
            _normalize_weight_to_gram(text_amount, normalized_text_unit)
            if normalized_calc_unit == "gram"
            else _normalize_volume_to_ml(text_amount, normalized_text_unit)
        )
        if normalized_text_quantity is None or abs(calc_quantity - normalized_text_quantity) > AMOUNT_MATCH_EPSILON:
            return units_per_package, calc_quantity, False
        single_item_quantity = normalized_text_quantity

    inferred_units = units_per_package if units_per_package is not None else supplier_sales_factor
    if inferred_units is None or inferred_units <= 1:
        return units_per_package, calc_quantity, False

    inferred_calc_quantity = single_item_quantity * inferred_units
    if inferred_calc_quantity <= 0:
        return units_per_package, calc_quantity, False

    return inferred_units, inferred_calc_quantity, True


def _should_flag_multipack_review(
    supplier_sales_factor: float | None,
    supplier_sales_unit_code: str | None,
    supplier_sales_unit_name: str | None,
    supplier_standard_unit_code: str | None,
    supplier_standard_unit_name: str | None,
    supplier_pack_description: str | None,
    units_per_package: float | None,
) -> bool:
    if supplier_sales_factor is None or supplier_sales_factor <= 1:
        return False
    if not _looks_like_outer_pack(supplier_sales_unit_code, supplier_sales_unit_name):
        return False
    if not _looks_like_inner_pack(supplier_standard_unit_code, supplier_standard_unit_name):
        return False
    if _text_contains_explicit_multiplier(supplier_pack_description):
        return False
    text_amount, text_unit = _extract_amount_and_unit_from_text(supplier_pack_description)
    if text_amount is None or _normalize_unit(text_unit) not in {"gram", "kg", "liter", "ml"}:
        return False
    return units_per_package is None


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


def _extract_explicit_weight_unit(row: dict) -> str | None:
    unit_columns = [
        "Eenheid Netto Gewicht",
        "Eenheid netto gewicht",
        "Netto gewicht eenheid",
    ]
    for column_name in unit_columns:
        normalized_unit = _normalize_unit(row.get(column_name))
        if normalized_unit in {"kg", "gram"}:
            return normalized_unit
    return None


def _extract_explicit_volume_unit(row: dict) -> str | None:
    unit_columns = [
        "Eenheid Netto inhoud",
        "Eenheid netto inhoud",
        "Netto inhoud eenheid",
    ]
    for column_name in unit_columns:
        normalized_unit = _normalize_unit(row.get(column_name))
        if normalized_unit in {"liter", "ml"}:
            return normalized_unit
    return None


def _normalize_weight_to_gram(amount: float, unit: str | None) -> float | None:
    normalized_unit = _normalize_unit(unit)
    if normalized_unit == "kg":
        return amount * 1000
    if normalized_unit == "gram":
        return amount
    return None


def _normalize_volume_to_ml(amount: float, unit: str | None) -> float | None:
    normalized_unit = _normalize_unit(unit)
    if normalized_unit == "liter":
        return amount * 1000
    if normalized_unit == "ml":
        return amount
    return None


def _values_match_by_unit_conversion(
    amount: float | None,
    text_amount: float | None,
    text_unit: str | None,
    possible_amount_units: tuple[str, ...],
    normalize_fn,
) -> bool:
    if amount is None or text_amount is None or text_unit is None:
        return False

    normalized_text = normalize_fn(text_amount, text_unit)
    if normalized_text is None:
        return False

    for amount_unit in possible_amount_units:
        normalized_amount = normalize_fn(amount, amount_unit)
        if normalized_amount is None:
            continue
        if abs(normalized_amount - normalized_text) <= AMOUNT_MATCH_EPSILON:
            return True

    return False


def _infer_sales_factor_subpackage_total_weight_unit(row: dict, amount: float | None) -> str | None:
    if amount is None:
        return None

    supplier_sales_factor = _parse_number(row.get("Verkoopfaktor"))
    if supplier_sales_factor is None or supplier_sales_factor <= 1:
        return None

    supplier_sales_unit_code = row.get("Verkoopeenheid")
    supplier_sales_unit_name = row.get("Omschrijving verkoopeenheid")
    supplier_standard_unit_code = row.get("Standaard eenheid")
    supplier_standard_unit_name = row.get("Omschrijving standaardeenheid")
    if not _looks_like_outer_pack(supplier_sales_unit_code, supplier_sales_unit_name):
        return None
    if not _looks_like_sales_factor_subpackage(
        supplier_standard_unit_code,
        supplier_standard_unit_name,
    ):
        return None

    (
        _units_per_subpackage,
        calc_unit,
        subpackage_calc_quantity,
        _secondary_unit_factor,
    ) = _extract_simple_multipack_from_text(row.get("Omschrijving inhoud artikel"))
    if calc_unit != "gram" or subpackage_calc_quantity is None:
        return None

    expected_total_quantity = supplier_sales_factor * subpackage_calc_quantity
    amount_as_kg = _normalize_weight_to_gram(amount, "kg")
    if amount_as_kg is None or not _amounts_match_with_tolerance(
        expected_total_quantity,
        amount_as_kg,
    ):
        return None

    for column_name in (
        "Netto Gewicht Standaardeenheid",
        "Netto gewicht Standaardeenheid",
    ):
        standard_amount = _parse_number(row.get(column_name))
        if standard_amount is None or standard_amount == 0:
            continue
        standard_quantity = _normalize_weight_to_gram(standard_amount, "kg")
        if standard_quantity is not None and not _amounts_match_with_tolerance(
            subpackage_calc_quantity,
            standard_quantity,
        ):
            return None

    return "kg"


def _extract_package_weight(row: dict) -> tuple[float | None, str | None]:
    amount = _parse_number(row.get("Netto Gewicht"))
    if amount is None:
        amount = _parse_number(row.get("Netto gewicht"))
    if amount == 0:
        amount = None
    if amount is None:
        return None, None

    unit = _extract_explicit_weight_unit(row)
    inferred_total_weight_unit = _infer_sales_factor_subpackage_total_weight_unit(row, amount)
    text_amount, text_unit = _extract_amount_and_unit_from_text(row.get("Omschrijving inhoud artikel"))
    if inferred_total_weight_unit is not None:
        unit = inferred_total_weight_unit
    elif (
        unit is None
        and text_amount is not None
        and text_unit in {"kg", "gram"}
        and _values_match_by_unit_conversion(
            amount,
            text_amount,
            text_unit,
            ("kg", "gram"),
            _normalize_weight_to_gram,
        )
    ):
        unit = text_unit

    if unit is None:
        # Bidfood "Netto Gewicht" is doorgaans in kilogram.
        unit = "kg"

    return amount, unit


def _extract_standard_package_weight(row: dict) -> tuple[float | None, str | None]:
    for column_name in (
        "Netto Gewicht Standaardeenheid",
        "Netto gewicht Standaardeenheid",
    ):
        amount = _parse_number(row.get(column_name))
        if amount is not None and amount != 0:
            # Bidfood standaard-eenheid gewichtskolommen zijn in kilogram.
            return amount, "kg"
    return None, None


def _extract_package_volume(row: dict) -> tuple[float | None, str | None]:
    amount = _parse_number(row.get("Netto inhoud"))
    unit = _extract_explicit_volume_unit(row)
    text_amount, text_unit = _extract_amount_and_unit_from_text(row.get("Omschrijving inhoud artikel"))
    effective_unit = unit if unit in {"liter", "ml"} else text_unit if text_unit in {"liter", "ml"} else None

    if amount == 0:
        amount = None

    # Veilige text-only fallback: alleen gebruiken wanneer volumekolom ontbreekt/0 is.
    if amount is None:
        if text_amount is not None and text_unit in {"liter", "ml"}:
            return text_amount, text_unit
        return None, None

    if effective_unit in {"liter", "ml"} and text_amount is not None and text_unit in {"liter", "ml"}:
        normalized_amount = _normalize_volume_to_ml(amount, effective_unit)
        normalized_text_amount = _normalize_volume_to_ml(text_amount, text_unit)
        if (
            normalized_amount is not None
            and normalized_text_amount is not None
            and abs(normalized_amount - normalized_text_amount) > AMOUNT_MATCH_EPSILON
        ):
            return text_amount, text_unit

    if (
        unit is None
        and text_amount is not None
        and text_unit in {"liter", "ml"}
        and _values_match_by_unit_conversion(
            amount,
            text_amount,
            text_unit,
            ("liter", "ml"),
            _normalize_volume_to_ml,
        )
    ):
        unit = text_unit

    return amount, effective_unit or unit


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
    volume_amount, volume_unit = _extract_package_volume(row)
    if volume_amount is not None and volume_unit in {"liter", "ml"}:
        return volume_amount, volume_unit

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
        if amount_source == "netto_gewicht":
            inferred_total_weight_unit = _infer_sales_factor_subpackage_total_weight_unit(row, amount)
            if inferred_total_weight_unit is not None:
                unit = inferred_total_weight_unit
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


def _values_differ(current_value, imported_value) -> bool:
    if current_value is None and imported_value is None:
        return False
    if current_value is None or imported_value is None:
        return True
    if isinstance(current_value, (int, float, Decimal)) and isinstance(
        imported_value, (int, float, Decimal)
    ):
        return Decimal(str(current_value)) != Decimal(str(imported_value))
    return current_value != imported_value


def _to_decimal_or_none(value) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _should_update_dual_unit_values(
    ingredient: Ingredient,
    preferred_unit: str | None,
    secondary_unit: str | None,
    secondary_unit_factor: float | None,
    nested_multipack_applied: bool,
    previous_units_per_package,
    calc_quantity: float | None,
) -> bool:
    if preferred_unit is None or secondary_unit is None or secondary_unit_factor is None:
        return False

    if (
        ingredient.preferred_unit is None
        and ingredient.secondary_unit is None
        and ingredient.secondary_unit_factor is None
    ):
        return True

    if not nested_multipack_applied:
        return False

    if _normalize_unit(ingredient.preferred_unit) != _normalize_unit(preferred_unit):
        return False

    existing_secondary_unit = _normalize_unit(ingredient.secondary_unit)
    if existing_secondary_unit is not None and existing_secondary_unit != _normalize_unit(secondary_unit):
        return False

    if ingredient.secondary_unit is None or ingredient.secondary_unit_factor is None:
        return True

    previous_units = _to_decimal_or_none(previous_units_per_package)
    current_factor = _to_decimal_or_none(ingredient.secondary_unit_factor)
    next_factor = _to_decimal_or_none(secondary_unit_factor)
    next_calc_quantity = _to_decimal_or_none(calc_quantity)
    if (
        previous_units is None
        or previous_units == 0
        or current_factor is None
        or next_factor is None
        or next_calc_quantity is None
    ):
        return False

    previously_derived_factor = next_calc_quantity / previous_units
    return current_factor == previously_derived_factor and current_factor != next_factor


def _serialize_import_value(value):
    return str(value) if value is not None else None


def _clean_optional_string(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _normalize_supplier_article_code(value: str | None) -> str | None:
    cleaned = _clean_optional_string(value)
    if cleaned is None or cleaned == "000000":
        return None
    return cleaned


def _parse_supplier_orderable(value: str | None) -> bool | None:
    normalized = (value or "").strip().upper()
    if normalized == "J":
        return True
    if normalized == "N":
        return False
    return None


def _build_duplicate_fingerprint(parsed_row: dict) -> dict:
    return {
        "supplier_product_code": parsed_row["supplier_product_code"],
        "supplier_product_name": parsed_row["supplier_product_name"] or None,
        "supplier_sales_unit_code": parsed_row["supplier_sales_unit_code"] or None,
        "supplier_sales_unit_name": parsed_row["supplier_sales_unit_name"] or None,
        "supplier_standard_unit_code": parsed_row["supplier_standard_unit_code"] or None,
        "supplier_standard_unit_name": parsed_row["supplier_standard_unit_name"] or None,
        "supplier_sales_factor": _serialize_import_value(parsed_row["supplier_sales_factor"]),
        "supplier_price_ex_vat": _serialize_import_value(parsed_row["supplier_price_ex_vat"]),
        "supplier_vat_rate": _serialize_import_value(parsed_row["supplier_vat_rate"]),
        "supplier_unit": parsed_row["supplier_unit"] or None,
        "units_per_package": _serialize_import_value(parsed_row["units_per_package"]),
        "net_content_amount": _serialize_import_value(parsed_row["net_content_amount"]),
        "net_content_unit": parsed_row["net_content_unit"] or None,
        "package_weight_amount": _serialize_import_value(parsed_row["package_weight_amount"]),
        "package_weight_unit": parsed_row["package_weight_unit"] or None,
        "package_volume_amount": _serialize_import_value(parsed_row["package_volume_amount"]),
        "package_volume_unit": parsed_row["package_volume_unit"] or None,
        "supplier_pack_description": parsed_row["supplier_pack_description"] or None,
    }


def _build_variant_group_key(parsed_row: dict) -> tuple[str, str | None, str | None]:
    return (
        parsed_row["supplier_product_code"],
        parsed_row["supplier_sales_unit_code"] or None,
        parsed_row["supplier_sales_unit_name"] or None,
    )


def _derive_sales_variant_structure(
    calc_unit: str | None,
    calc_quantity: float | None,
    supplier_sales_factor: float | None,
    supplier_standard_unit_code: str | None,
    supplier_standard_unit_name: str | None,
) -> tuple[float | None, str | None, str | None, float | None]:
    normalized_calc_unit = _normalize_unit(calc_unit)
    if normalized_calc_unit not in {"gram", "ml"} or calc_quantity is None or calc_quantity <= 0:
        return None, None, None, None

    if supplier_sales_factor is None or supplier_sales_factor <= 1:
        return None, None, None, None

    standard_unit_code = (supplier_standard_unit_code or "").strip().upper()
    standard_unit_name = (supplier_standard_unit_name or "").strip().lower()
    if (
        standard_unit_code not in SUBPACKAGE_UNIT_CODES
        and not any(term in standard_unit_name for term in SUBPACKAGE_UNIT_TERMS)
    ):
        return None, None, None, None

    secondary_unit_factor = calc_quantity / supplier_sales_factor
    if secondary_unit_factor <= 0:
        return None, None, None, None

    return supplier_sales_factor, "stuk", normalized_calc_unit, secondary_unit_factor


def _find_existing_ingredient_for_variant(
    db: Session,
    supplier_product_code: str,
    supplier_sales_unit_code: str | None,
    supplier_sales_unit_name: str | None,
):
    if supplier_sales_unit_code:
        ingredient = (
            db.query(Ingredient)
            .filter(
                Ingredient.supplier_product_code == supplier_product_code,
                Ingredient.supplier_sales_unit_code == supplier_sales_unit_code,
            )
            .first()
        )
        if ingredient is not None:
            return ingredient

    if supplier_sales_unit_name:
        ingredient = (
            db.query(Ingredient)
            .filter(
                Ingredient.supplier_product_code == supplier_product_code,
                Ingredient.supplier_sales_unit_name == supplier_sales_unit_name,
            )
            .first()
        )
        if ingredient is not None:
            return ingredient

    legacy_candidates = (
        db.query(Ingredient)
        .filter(
            Ingredient.supplier_product_code == supplier_product_code,
            Ingredient.supplier_sales_unit_code.is_(None),
            Ingredient.supplier_sales_unit_name.is_(None),
        )
        .all()
    )
    if legacy_candidates:
        legacy_unit_matches = []
        match_value = supplier_sales_unit_name or supplier_sales_unit_code
        if match_value:
            for ingredient in legacy_candidates:
                if (ingredient.supplier_unit or "").strip() == match_value:
                    legacy_unit_matches.append(ingredient)
        if len(legacy_unit_matches) == 1:
            return legacy_unit_matches[0]

    if supplier_sales_unit_code is None and supplier_sales_unit_name is None:
        return (
            db.query(Ingredient)
            .filter(Ingredient.supplier_product_code == supplier_product_code)
            .first()
        )

    return None


def import_ingredients_from_csv(file_path: str, db: Session) -> dict[str, int]:
    created = 0
    updated = 0
    batch = IngredientImportBatch(
        source_filename=Path(file_path).name,
        started_at=datetime.now(timezone.utc),
        status="running",
        total_rows=0,
        created_count=0,
        updated_count=0,
        issue_count=0,
    )
    db.add(batch)
    db.flush()

    with open(file_path, newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file, delimiter=";")
        parsed_rows: list[dict] = []

        for row in reader:
            supplier_product_code = (row.get("Artikelnummer") or "").strip()
            supplier_product_name = (row.get("Omschrijving artikel") or "").strip()
            supplier_sales_unit_code = _clean_optional_string(row.get("Verkoopeenheid"))
            supplier_sales_unit_name = _clean_optional_string(row.get("Omschrijving verkoopeenheid"))
            supplier_standard_unit_code = _clean_optional_string(row.get("Standaard eenheid"))
            supplier_standard_unit_name = _clean_optional_string(
                row.get("Omschrijving standaardeenheid")
            )
            supplier_sales_factor = _parse_number(row.get("Verkoopfaktor"))
            supplier_unit = supplier_sales_unit_name or supplier_sales_unit_code or ""
            supplier_price_ex_vat = _parse_number(
                row.get("Nettoprijs artikel (incl. klantconditie)")
            )
            supplier_vat_rate = _parse_number(row.get("BTW waarde"))
            supplier_allergens_raw = _extract_supplier_allergens(row)
            supplier_brand = (row.get("Merknaam voluit") or "").strip() or None
            category = (row.get("Omschrijving hoofdproduktgroep") or "").strip() or None
            supplier_is_orderable = _parse_supplier_orderable(row.get("Bestelbaar"))
            supplier_order_status_code = _clean_optional_string(row.get("Bestelstatus"))
            supplier_order_status_description = _clean_optional_string(
                row.get("Bestelstatus omschrijving")
            )
            supplier_alternative_article_code = _normalize_supplier_article_code(
                row.get("Alternatief artikel")
            )
            supplier_replaced_by_article_code = _normalize_supplier_article_code(
                row.get("Art Vervangen door")
            )

            packaging_type = (row.get("Omschrijving verkoopeenheid") or "").strip() or None
            units_per_package = _extract_units_per_package(row)
            net_content_amount, net_content_unit = _extract_net_content(row)
            package_weight_amount, package_weight_unit = _extract_package_weight(row)
            standard_package_weight_amount, standard_package_weight_unit = _extract_standard_package_weight(row)
            package_volume_amount, package_volume_unit = _extract_package_volume(row)
            supplier_pack_description = (row.get("Omschrijving inhoud artikel") or "").strip() or None

            calc_unit, calc_quantity = _derive_calculation_values(
                net_content_unit,
                net_content_amount,
                units_per_package,
            )
            (
                nested_units_per_package,
                nested_calc_unit,
                nested_calc_quantity,
                _nested_secondary_unit_factor,
            ) = _extract_nested_multipack_from_text(supplier_pack_description)
            did_apply_nested_multipack = (
                nested_units_per_package is not None
                and nested_calc_unit is not None
                and nested_calc_quantity is not None
            )
            if did_apply_nested_multipack:
                units_per_package = nested_units_per_package
                calc_unit = nested_calc_unit
                calc_quantity = nested_calc_quantity
            did_apply_sales_factor_subpackage = False
            if not did_apply_nested_multipack:
                (
                    sales_factor_units_per_package,
                    sales_factor_calc_unit,
                    sales_factor_calc_quantity,
                    did_apply_sales_factor_subpackage,
                ) = _derive_sales_factor_subpackage_values(
                    supplier_sales_factor,
                    supplier_sales_unit_code,
                    supplier_sales_unit_name,
                    supplier_standard_unit_code,
                    supplier_standard_unit_name,
                    supplier_pack_description,
                    package_weight_amount,
                    package_weight_unit,
                    standard_package_weight_amount,
                    standard_package_weight_unit,
                    package_volume_amount,
                    package_volume_unit,
                )
                if did_apply_sales_factor_subpackage:
                    units_per_package = sales_factor_units_per_package
                    calc_unit = sales_factor_calc_unit
                    calc_quantity = sales_factor_calc_quantity
            multipack_review_needed = _should_flag_multipack_review(
                supplier_sales_factor,
                supplier_sales_unit_code,
                supplier_sales_unit_name,
                supplier_standard_unit_code,
                supplier_standard_unit_name,
                supplier_pack_description,
                units_per_package,
            )
            units_per_package, inferred_calc_quantity, did_apply_safe_multipack = _derive_safe_multipack_values(
                supplier_sales_factor,
                supplier_sales_unit_code,
                supplier_sales_unit_name,
                supplier_standard_unit_code,
                supplier_standard_unit_name,
                supplier_pack_description,
                units_per_package,
                calc_unit,
                calc_quantity,
            )
            if did_apply_safe_multipack and inferred_calc_quantity is not None:
                calc_quantity = inferred_calc_quantity
            preferred_unit, secondary_unit, secondary_unit_factor = _derive_dual_unit_values(
                calc_unit,
                calc_quantity,
                units_per_package,
                supplier_unit,
                supplier_pack_description,
            )
            (
                derived_units_per_package,
                derived_preferred_unit,
                derived_secondary_unit,
                derived_secondary_unit_factor,
            ) = _derive_sales_variant_structure(
                calc_unit,
                calc_quantity,
                supplier_sales_factor,
                supplier_standard_unit_code,
                supplier_standard_unit_name,
            )
            if units_per_package is None and derived_units_per_package is not None:
                units_per_package = derived_units_per_package
            if (
                preferred_unit is None
                and secondary_unit is None
                and secondary_unit_factor is None
                and derived_preferred_unit is not None
                and derived_secondary_unit is not None
                and derived_secondary_unit_factor is not None
            ):
                preferred_unit = derived_preferred_unit
                secondary_unit = derived_secondary_unit
                secondary_unit_factor = derived_secondary_unit_factor

            if not supplier_product_code:
                continue

            parsed_rows.append(
                {
                    "supplier_product_code": supplier_product_code,
                    "supplier_product_name": supplier_product_name,
                    "supplier_sales_unit_code": supplier_sales_unit_code,
                    "supplier_sales_unit_name": supplier_sales_unit_name,
                    "supplier_standard_unit_code": supplier_standard_unit_code,
                    "supplier_standard_unit_name": supplier_standard_unit_name,
                    "supplier_sales_factor": supplier_sales_factor,
                    "supplier_unit": supplier_unit,
                    "supplier_price_ex_vat": supplier_price_ex_vat,
                    "supplier_vat_rate": supplier_vat_rate,
                    "supplier_allergens_raw": supplier_allergens_raw,
                    "supplier_brand": supplier_brand,
                    "category": category,
                    "supplier_is_orderable": supplier_is_orderable,
                    "supplier_order_status_code": supplier_order_status_code,
                    "supplier_order_status_description": supplier_order_status_description,
                    "supplier_alternative_article_code": supplier_alternative_article_code,
                    "supplier_replaced_by_article_code": supplier_replaced_by_article_code,
                    "packaging_type": packaging_type,
                    "units_per_package": units_per_package,
                    "net_content_amount": net_content_amount,
                    "net_content_unit": net_content_unit,
                    "package_weight_amount": package_weight_amount,
                    "package_weight_unit": package_weight_unit,
                    "package_volume_amount": package_volume_amount,
                    "package_volume_unit": package_volume_unit,
                    "supplier_pack_description": supplier_pack_description,
                    "calc_unit": calc_unit,
                    "calc_quantity": calc_quantity,
                    "preferred_unit": preferred_unit,
                    "secondary_unit": secondary_unit,
                    "secondary_unit_factor": secondary_unit_factor,
                    "multipack_review_needed": multipack_review_needed and not did_apply_safe_multipack,
                    "nested_multipack_applied": did_apply_nested_multipack,
                    "sales_factor_subpackage_applied": did_apply_sales_factor_subpackage,
                }
            )

    batch.total_rows = len(parsed_rows)

    grouped_rows: dict[tuple[str, str | None, str | None], list[dict]] = {}
    for parsed_row in parsed_rows:
        grouped_rows.setdefault(_build_variant_group_key(parsed_row), []).append(parsed_row)

    effective_rows: list[dict] = []
    for _, grouped in grouped_rows.items():
        supplier_product_code = grouped[0]["supplier_product_code"]
        if len(grouped) == 1:
            effective_rows.append(grouped[0])
            continue

        variants_by_key: dict[tuple, dict] = {}
        for parsed_row in grouped:
            fingerprint = _build_duplicate_fingerprint(parsed_row)
            variants_by_key[tuple(fingerprint.items())] = fingerprint

        if len(variants_by_key) == 1:
            effective_rows.append(grouped[0])
            continue

        db.add(
            IngredientImportIssue(
                import_batch_id=batch.id,
                ingredient_id=None,
                supplier_product_code=supplier_product_code,
                supplier_product_name=next(
                    (row["supplier_product_name"] for row in grouped if row["supplier_product_name"]),
                    None,
                ),
                issue_type="duplicate_conflict_in_file",
                status="open",
                payload_json=json.dumps(
                    {
                        "duplicate_count": len(grouped),
                        "variants": list(variants_by_key.values()),
                    }
                ),
            )
        )
        batch.issue_count += 1

    for parsed_row in effective_rows:
        import_timestamp = datetime.now(timezone.utc)
        supplier_product_code = parsed_row["supplier_product_code"]
        supplier_product_name = parsed_row["supplier_product_name"]
        supplier_sales_unit_code = parsed_row["supplier_sales_unit_code"]
        supplier_sales_unit_name = parsed_row["supplier_sales_unit_name"]
        supplier_standard_unit_code = parsed_row["supplier_standard_unit_code"]
        supplier_standard_unit_name = parsed_row["supplier_standard_unit_name"]
        supplier_sales_factor = parsed_row["supplier_sales_factor"]
        supplier_unit = parsed_row["supplier_unit"]
        supplier_price_ex_vat = parsed_row["supplier_price_ex_vat"]
        supplier_vat_rate = parsed_row["supplier_vat_rate"]
        supplier_allergens_raw = parsed_row["supplier_allergens_raw"]
        supplier_brand = parsed_row["supplier_brand"]
        category = parsed_row["category"]
        supplier_is_orderable = parsed_row["supplier_is_orderable"]
        supplier_order_status_code = parsed_row["supplier_order_status_code"]
        supplier_order_status_description = parsed_row["supplier_order_status_description"]
        supplier_alternative_article_code = parsed_row["supplier_alternative_article_code"]
        supplier_replaced_by_article_code = parsed_row["supplier_replaced_by_article_code"]
        packaging_type = parsed_row["packaging_type"]
        units_per_package = parsed_row["units_per_package"]
        net_content_amount = parsed_row["net_content_amount"]
        net_content_unit = parsed_row["net_content_unit"]
        package_weight_amount = parsed_row["package_weight_amount"]
        package_weight_unit = parsed_row["package_weight_unit"]
        package_volume_amount = parsed_row["package_volume_amount"]
        package_volume_unit = parsed_row["package_volume_unit"]
        supplier_pack_description = parsed_row["supplier_pack_description"]
        calc_unit = parsed_row["calc_unit"]
        calc_quantity = parsed_row["calc_quantity"]
        preferred_unit = parsed_row["preferred_unit"]
        secondary_unit = parsed_row["secondary_unit"]
        secondary_unit_factor = parsed_row["secondary_unit_factor"]

        ingredient = _find_existing_ingredient_for_variant(
            db,
            supplier_product_code,
            supplier_sales_unit_code,
            supplier_sales_unit_name,
        )

        issues_to_create: list[IngredientImportIssue] = []

        if parsed_row.get("multipack_review_needed"):
            issues_to_create.append(
                IngredientImportIssue(
                    import_batch_id=batch.id,
                    ingredient_id=ingredient.id if ingredient else None,
                    supplier_product_code=supplier_product_code,
                    supplier_product_name=supplier_product_name or None,
                    issue_type="multipack_review_recommended",
                    status="open",
                    payload_json=json.dumps(
                        {
                            "supplier_sales_factor": (
                                str(supplier_sales_factor)
                                if supplier_sales_factor is not None
                                else None
                            ),
                            "supplier_sales_unit_code": supplier_sales_unit_code,
                            "supplier_sales_unit_name": supplier_sales_unit_name,
                            "supplier_standard_unit_code": supplier_standard_unit_code,
                            "supplier_standard_unit_name": supplier_standard_unit_name,
                            "supplier_pack_description": supplier_pack_description,
                        }
                    ),
                )
            )

        if ingredient:
            current_name = (ingredient.supplier_product_name or "").strip()
            imported_name = supplier_product_name.strip()
            if imported_name and imported_name != current_name:
                issues_to_create.append(
                    IngredientImportIssue(
                        import_batch_id=batch.id,
                        ingredient_id=ingredient.id,
                        supplier_product_code=supplier_product_code,
                        supplier_product_name=supplier_product_name or None,
                        issue_type="name_mismatch",
                        status="open",
                        payload_json=json.dumps(
                            {
                                "current_name": ingredient.supplier_product_name,
                                "imported_name": supplier_product_name,
                            }
                        ),
                    )
                )

            packaging_changes = {}
            packaging_fields = {
                "units_per_package": (ingredient.units_per_package, units_per_package),
                "net_content_amount": (ingredient.net_content_amount, net_content_amount),
                "net_content_unit": (ingredient.net_content_unit, net_content_unit),
            }
            for field_name, (current_value, imported_value) in packaging_fields.items():
                if _values_differ(current_value, imported_value):
                    packaging_changes[field_name] = {
                        "current": str(current_value) if current_value is not None else None,
                        "imported": str(imported_value) if imported_value is not None else None,
                    }
            if packaging_changes:
                issues_to_create.append(
                    IngredientImportIssue(
                        import_batch_id=batch.id,
                        ingredient_id=ingredient.id,
                        supplier_product_code=supplier_product_code,
                        supplier_product_name=supplier_product_name or None,
                        issue_type="packaging_changed",
                        status="open",
                        payload_json=json.dumps(packaging_changes),
                    )
                )

        has_existing_conversion_factor = (
            ingredient is not None
            and ingredient.conversion_factor_to_base is not None
            and ingredient.conversion_factor_to_base != 0
        )
        has_new_calc_quantity = calc_quantity is not None and calc_quantity != 0
        should_flag_base_price_unreliable = supplier_price_ex_vat is None
        if ingredient:
            if not has_new_calc_quantity and not has_existing_conversion_factor:
                should_flag_base_price_unreliable = True
        elif not has_new_calc_quantity:
            should_flag_base_price_unreliable = True

        if should_flag_base_price_unreliable:
            issues_to_create.append(
                IngredientImportIssue(
                    import_batch_id=batch.id,
                    ingredient_id=ingredient.id if ingredient else None,
                    supplier_product_code=supplier_product_code,
                    supplier_product_name=supplier_product_name or None,
                    issue_type="base_price_unreliable",
                    status="open",
                    payload_json=json.dumps(
                        {
                            "supplier_price_ex_vat": (
                                str(supplier_price_ex_vat) if supplier_price_ex_vat is not None else None
                            ),
                            "calc_quantity": str(calc_quantity) if calc_quantity is not None else None,
                            "calc_unit": calc_unit,
                        }
                    ),
                )
            )

        for issue in issues_to_create:
            db.add(issue)
        batch.issue_count += len(issues_to_create)

        if ingredient:
            previous_units_per_package = ingredient.units_per_package
            ingredient.supplier_product_name = supplier_product_name or ingredient.supplier_product_name
            ingredient.supplier_sales_unit_code = supplier_sales_unit_code
            ingredient.supplier_sales_unit_name = supplier_sales_unit_name
            ingredient.supplier_standard_unit_code = supplier_standard_unit_code
            ingredient.supplier_standard_unit_name = supplier_standard_unit_name
            ingredient.supplier_sales_factor = supplier_sales_factor
            ingredient.supplier_unit = supplier_unit or ingredient.supplier_unit
            ingredient.supplier_price_ex_vat = supplier_price_ex_vat
            ingredient.supplier_vat_rate = supplier_vat_rate
            ingredient.supplier_allergens_raw = supplier_allergens_raw
            ingredient.supplier_brand = supplier_brand
            ingredient.category = category
            ingredient.supplier_is_orderable = supplier_is_orderable
            ingredient.supplier_order_status_code = supplier_order_status_code
            ingredient.supplier_order_status_description = supplier_order_status_description
            ingredient.supplier_alternative_article_code = supplier_alternative_article_code
            ingredient.supplier_replaced_by_article_code = supplier_replaced_by_article_code
            ingredient.supplier_pack_description = supplier_pack_description
            ingredient.packaging_type = packaging_type
            ingredient.units_per_package = units_per_package
            ingredient.net_content_amount = net_content_amount
            ingredient.net_content_unit = net_content_unit
            ingredient.supplier_net_content = net_content_amount
            ingredient.package_weight_amount = package_weight_amount
            ingredient.package_weight_unit = package_weight_unit
            ingredient.package_volume_amount = package_volume_amount
            ingredient.package_volume_unit = package_volume_unit
            ingredient.supplier_status_last_imported_at = import_timestamp
            ingredient.supplier_last_imported_at = import_timestamp
            if calc_unit is not None and calc_quantity is not None:
                ingredient.calculation_unit = calc_unit
                ingredient.calculation_quantity_per_package = calc_quantity
                ingredient.conversion_factor_to_base = calc_quantity
            if _should_update_dual_unit_values(
                ingredient,
                preferred_unit,
                secondary_unit,
                secondary_unit_factor,
                bool(
                    parsed_row.get("nested_multipack_applied")
                    or parsed_row.get("sales_factor_subpackage_applied")
                ),
                previous_units_per_package,
                calc_quantity,
            ):
                ingredient.preferred_unit = preferred_unit
                ingredient.secondary_unit = secondary_unit
                ingredient.secondary_unit_factor = secondary_unit_factor
            updated += 1
            batch.updated_count += 1
        else:
            base_unit = calc_unit or supplier_unit or "st"
            ingredient = Ingredient(
                supplier_name="Bidfood",
                supplier_product_code=supplier_product_code,
                supplier_product_name=supplier_product_name or supplier_product_code,
                supplier_brand=supplier_brand,
                supplier_sales_unit_code=supplier_sales_unit_code,
                supplier_sales_unit_name=supplier_sales_unit_name,
                supplier_standard_unit_code=supplier_standard_unit_code,
                supplier_standard_unit_name=supplier_standard_unit_name,
                supplier_sales_factor=supplier_sales_factor,
                supplier_unit=supplier_unit or "st",
                supplier_pack_description=supplier_pack_description,
                supplier_net_content=net_content_amount,
                packaging_type=packaging_type,
                units_per_package=units_per_package,
                net_content_amount=net_content_amount,
                net_content_unit=net_content_unit,
                package_weight_amount=package_weight_amount,
                package_weight_unit=package_weight_unit,
                package_volume_amount=package_volume_amount,
                package_volume_unit=package_volume_unit,
                calculation_unit=calc_unit,
                calculation_quantity_per_package=calc_quantity,
                preferred_unit=preferred_unit,
                secondary_unit=secondary_unit,
                secondary_unit_factor=secondary_unit_factor,
                supplier_price_ex_vat=supplier_price_ex_vat,
                supplier_vat_rate=supplier_vat_rate,
                supplier_allergens_raw=supplier_allergens_raw,
                supplier_is_orderable=supplier_is_orderable,
                supplier_order_status_code=supplier_order_status_code,
                supplier_order_status_description=supplier_order_status_description,
                supplier_alternative_article_code=supplier_alternative_article_code,
                supplier_replaced_by_article_code=supplier_replaced_by_article_code,
                supplier_status_last_imported_at=import_timestamp,
                supplier_last_imported_at=import_timestamp,
                category=category,
                base_unit=base_unit,
                conversion_factor_to_base=calc_quantity if calc_quantity is not None else 1,
            )
            db.add(ingredient)
            created += 1
            batch.created_count += 1

        db.flush()

        history_base_unit = calc_unit or ingredient.base_unit
        history_conversion_factor = (
            Decimal(str(calc_quantity))
            if calc_quantity is not None
            else Decimal(str(ingredient.conversion_factor_to_base))
            if ingredient.conversion_factor_to_base is not None
            else None
        )
        history_supplier_price = (
            Decimal(str(supplier_price_ex_vat)) if supplier_price_ex_vat is not None else None
        )
        history_base_price = None
        if (
            history_supplier_price is not None
            and history_conversion_factor is not None
            and history_conversion_factor != 0
        ):
            history_base_price = history_supplier_price / history_conversion_factor

        db.add(
            IngredientPriceHistory(
                ingredient_id=ingredient.id,
                supplier_product_code=supplier_product_code,
                supplier_product_name=supplier_product_name or ingredient.supplier_product_name,
                supplier_price_ex_vat=history_supplier_price,
                base_price_per_unit_ex_vat=history_base_price,
                base_unit=history_base_unit,
                supplier_vat_rate=Decimal(str(supplier_vat_rate)) if supplier_vat_rate is not None else None,
                recorded_at=datetime.now(timezone.utc),
            )
        )

    batch.completed_at = datetime.now(timezone.utc)
    batch.status = "completed"
    db.commit()

    return {"created": created, "updated": updated}
