from decimal import Decimal, ROUND_CEILING

from sqlalchemy.orm import Session

from app.models.dish import Dish
from app.models.ingredient import Ingredient
from app.models.recipe_line import RecipeLine
from app.models.recipe_step import RecipeStep
from app.models.semi_finished_product import SemiFinishedProduct


class RecipePurchaseListError(ValueError):
    pass


WEIGHT_UNITS = {
    "gram": Decimal("1"),
    "kg": Decimal("1000"),
}
VOLUME_UNITS = {
    "ml": Decimal("1"),
    "liter": Decimal("1000"),
}


def _normalize_unit(value: str | None) -> str | None:
    unit = str(value or "").strip().lower()
    if not unit:
        return None
    return {
        "g": "gram",
        "gr": "gram",
        "gram": "gram",
        "kg": "kg",
        "ml": "ml",
        "l": "liter",
        "lt": "liter",
        "liter": "liter",
        "st": "stuk",
        "stuks": "stuk",
        "stuk": "stuk",
        "pc": "stuk",
        "pcs": "stuk",
    }.get(unit, unit)


def _to_json_number(value: Decimal) -> int | float:
    if value == value.to_integral_value():
        return int(value)
    return float(value)


def _format_decimal(value: Decimal) -> str:
    text = format(value.normalize(), "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def _convert_basic_quantity(
    quantity: Decimal,
    from_unit: str | None,
    to_unit: str | None,
) -> Decimal | None:
    source = _normalize_unit(from_unit)
    target = _normalize_unit(to_unit)
    if source is None or target is None:
        return None
    if source == target:
        return quantity

    if source in WEIGHT_UNITS and target in WEIGHT_UNITS:
        return quantity * WEIGHT_UNITS[source] / WEIGHT_UNITS[target]
    if source in VOLUME_UNITS and target in VOLUME_UNITS:
        return quantity * VOLUME_UNITS[source] / VOLUME_UNITS[target]
    return None


def _convert_ingredient_quantity(
    quantity: Decimal,
    from_unit: str | None,
    ingredient: Ingredient,
) -> Decimal | None:
    calculation_unit = _normalize_unit(ingredient.calculation_unit)
    direct = _convert_basic_quantity(quantity, from_unit, calculation_unit)
    if direct is not None:
        return direct

    source = _normalize_unit(from_unit)
    preferred = _normalize_unit(ingredient.preferred_unit)
    secondary = _normalize_unit(ingredient.secondary_unit)
    factor = ingredient.secondary_unit_factor
    if (
        source is None
        or calculation_unit is None
        or preferred is None
        or secondary is None
        or factor is None
        or Decimal(factor) <= 0
    ):
        return None

    factor_decimal = Decimal(factor)
    preferred_quantity = _convert_basic_quantity(quantity, source, preferred)
    if preferred_quantity is None:
        secondary_quantity = _convert_basic_quantity(quantity, source, secondary)
        if secondary_quantity is not None:
            preferred_quantity = secondary_quantity / factor_decimal
    if preferred_quantity is None:
        return None

    converted = _convert_basic_quantity(
        preferred_quantity,
        preferred,
        calculation_unit,
    )
    if converted is not None:
        return converted

    secondary_quantity = preferred_quantity * factor_decimal
    return _convert_basic_quantity(
        secondary_quantity,
        secondary,
        calculation_unit,
    )


class _PurchaseListBuilder:
    def __init__(self, db: Session):
        self.db = db
        self.warnings: list[str] = []
        self._warning_set: set[str] = set()
        self._ingredients: dict[int, Ingredient | None] = {}
        self._semi_finished_products: dict[int, SemiFinishedProduct | None] = {}
        self._lines: dict[tuple[str, int], list[RecipeLine]] = {}

    def warn(self, message: str) -> None:
        if message not in self._warning_set:
            self._warning_set.add(message)
            self.warnings.append(message)

    def get_ingredient(self, ingredient_id: int) -> Ingredient | None:
        if ingredient_id not in self._ingredients:
            self._ingredients[ingredient_id] = (
                self.db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
            )
        return self._ingredients[ingredient_id]

    def get_semi_finished_product(
        self,
        semi_finished_product_id: int,
    ) -> SemiFinishedProduct | None:
        if semi_finished_product_id not in self._semi_finished_products:
            self._semi_finished_products[semi_finished_product_id] = (
                self.db.query(SemiFinishedProduct)
                .filter(SemiFinishedProduct.id == semi_finished_product_id)
                .first()
            )
        return self._semi_finished_products[semi_finished_product_id]

    def get_lines(self, parent_type: str, parent_id: int) -> list[RecipeLine]:
        key = (parent_type, parent_id)
        if key not in self._lines:
            self._lines[key] = (
                self.db.query(RecipeLine)
                .filter(
                    RecipeLine.parent_type == parent_type,
                    RecipeLine.parent_id == parent_id,
                )
                .order_by(RecipeLine.sort_order.asc(), RecipeLine.id.asc())
                .all()
            )
        return self._lines[key]

    def build_scaled_recipe_lines(
        self,
        parent_type: str,
        parent_id: int,
        scale_factor: Decimal,
    ) -> list[dict]:
        result: list[dict] = []
        for line in self.get_lines(parent_type, parent_id):
            name = None
            if line.item_type == "ingredient":
                ingredient = self.get_ingredient(line.item_id)
                if ingredient is not None:
                    name = ingredient.supplier_product_name
            elif line.item_type == "semi_finished_product":
                semi_finished_product = self.get_semi_finished_product(line.item_id)
                if semi_finished_product is not None:
                    name = semi_finished_product.name

            result.append(
                {
                    "item_type": line.item_type,
                    "item_id": line.item_id,
                    "name": name or "Onbekend item",
                    "quantity": _to_json_number(Decimal(line.quantity) * scale_factor),
                    "unit": _normalize_unit(line.unit) or line.unit,
                }
            )
        return result

    def build_purchase_blocks(
        self,
        source_type: str,
        source_id: int,
        source_name: str,
        scale_factor: Decimal,
        depth: int = 0,
        active_chain: tuple[int, ...] = (),
    ) -> list[dict]:
        chain = active_chain
        if source_type == "semi_finished_product":
            if source_id in chain:
                raise RecipePurchaseListError(
                    f'Circulaire verwijzing gevonden bij halffabricaat "{source_name}".'
                )
            chain = (*chain, source_id)

        rows: list[dict] = []
        ingredient_rows: dict[int, dict] = {}
        child_blocks: list[dict] = []

        for line in self.get_lines(source_type, source_id):
            scaled_quantity = Decimal(line.quantity) * scale_factor
            if line.item_type == "ingredient":
                ingredient = self.get_ingredient(line.item_id)
                if ingredient is None:
                    self.warn(
                        f"Ingrediënt {line.item_id} bestaat niet meer en kan niet worden berekend."
                    )
                    rows.append(
                        {
                            "item_type": "ingredient",
                            "item_id": line.item_id,
                            "name": "Onbekend ingrediënt",
                            "required_quantity": _to_json_number(scaled_quantity),
                            "required_unit": _normalize_unit(line.unit) or line.unit,
                            "package_label": "Onbekend",
                            "order_quantity": None,
                            "order_unit_label": "Niet berekenbaar",
                        }
                    )
                    continue

                row = self._build_ingredient_row(ingredient, scaled_quantity, line.unit)
                existing = ingredient_rows.get(ingredient.id)
                if existing is not None and existing["required_unit"] == row["required_unit"]:
                    existing["_required_decimal"] += row["_required_decimal"]
                    self._set_order_values(
                        existing,
                        ingredient,
                        existing["_required_decimal"],
                        existing["_conversion_ok"],
                    )
                else:
                    if existing is not None:
                        self.warn(
                            f'Dubbele regels voor "{ingredient.supplier_product_name}" hebben '
                            "niet-compatibele eenheden en konden niet worden samengevoegd."
                        )
                    ingredient_rows[ingredient.id] = row
                    rows.append(row)
                continue

            if line.item_type != "semi_finished_product":
                self.warn(
                    f"Receptregel {line.id} heeft een onbekend itemtype en is overgeslagen."
                )
                continue

            child = self.get_semi_finished_product(line.item_id)
            child_name = child.name if child is not None else "Onbekend halffabricaat"
            rows.append(
                {
                    "item_type": "semi_finished_product",
                    "item_id": line.item_id,
                    "name": child_name,
                    "required_quantity": _to_json_number(scaled_quantity),
                    "required_unit": _normalize_unit(line.unit) or line.unit,
                    "package_label": "Halffabricaat",
                    "order_quantity": None,
                    "order_unit_label": "Eigen productie",
                }
            )

            if child is None:
                self.warn(
                    f"Halffabricaat {line.item_id} bestaat niet meer en kon niet worden uitgeklapt."
                )
                continue
            if child.id in chain:
                raise RecipePurchaseListError(
                    f'Circulaire verwijzing gevonden bij halffabricaat "{child.name}".'
                )

            child_scale_factor = self._get_semi_finished_scale_factor(
                child,
                scaled_quantity,
                line.unit,
            )
            child_blocks.extend(
                self.build_purchase_blocks(
                    "semi_finished_product",
                    child.id,
                    child.name,
                    child_scale_factor,
                    depth=depth + 1,
                    active_chain=chain,
                )
            )

        for row in rows:
            row.pop("_required_decimal", None)
            row.pop("_conversion_ok", None)

        block = {
            "source_type": source_type,
            "source_id": source_id,
            "title": f"Inkoop {source_name}",
            "depth": depth,
            "rows": rows,
        }
        return [block, *child_blocks]

    def _build_ingredient_row(
        self,
        ingredient: Ingredient,
        scaled_quantity: Decimal,
        line_unit: str,
    ) -> dict:
        calculation_unit = _normalize_unit(ingredient.calculation_unit)
        converted_quantity = _convert_ingredient_quantity(
            scaled_quantity,
            line_unit,
            ingredient,
        )
        conversion_ok = converted_quantity is not None and calculation_unit is not None
        if conversion_ok:
            required_quantity = converted_quantity
            required_unit = calculation_unit
        else:
            source_unit = _normalize_unit(line_unit)
            if source_unit in WEIGHT_UNITS:
                required_unit = "gram"
                required_quantity = _convert_basic_quantity(
                    scaled_quantity,
                    source_unit,
                    required_unit,
                )
            elif source_unit in VOLUME_UNITS:
                required_unit = "ml"
                required_quantity = _convert_basic_quantity(
                    scaled_quantity,
                    source_unit,
                    required_unit,
                )
            else:
                required_unit = source_unit or line_unit
                required_quantity = scaled_quantity

        row = {
            "item_type": "ingredient",
            "item_id": ingredient.id,
            "name": ingredient.supplier_product_name,
            "required_quantity": _to_json_number(required_quantity),
            "required_unit": required_unit,
            "package_label": self._build_package_label(ingredient),
            "order_quantity": None,
            "order_unit_label": "Niet berekenbaar",
            "_required_decimal": required_quantity,
            "_conversion_ok": conversion_ok,
        }
        self._set_order_values(row, ingredient, required_quantity, conversion_ok)
        return row

    def _set_order_values(
        self,
        row: dict,
        ingredient: Ingredient,
        required_quantity: Decimal,
        conversion_ok: bool,
    ) -> None:
        row["required_quantity"] = _to_json_number(required_quantity)
        package_quantity = ingredient.calculation_quantity_per_package
        if (
            not conversion_ok
            or package_quantity is None
            or Decimal(package_quantity) <= 0
        ):
            row["order_quantity"] = None
            row["order_unit_label"] = "Niet berekenbaar"
            self.warn(
                f'Bestelhoeveelheid voor "{ingredient.supplier_product_name}" '
                "is niet berekenbaar door ontbrekende of incompatibele verpakkingsdata."
            )
            return

        packages = (required_quantity / Decimal(package_quantity)).to_integral_value(
            rounding=ROUND_CEILING
        )
        row["order_quantity"] = int(packages)
        row["order_unit_label"] = self._get_order_unit_label(ingredient)

    def _build_package_label(self, ingredient: Ingredient) -> str:
        package_name = (
            ingredient.packaging_type
            or ingredient.supplier_sales_unit_name
            or ingredient.supplier_unit
            or "Verpakking"
        )
        package_quantity = ingredient.calculation_quantity_per_package
        calculation_unit = _normalize_unit(ingredient.calculation_unit)
        if (
            package_quantity is not None
            and Decimal(package_quantity) > 0
            and calculation_unit
        ):
            return (
                f"{package_name} · {_format_decimal(Decimal(package_quantity))} "
                f"{calculation_unit}"
            )
        if ingredient.supplier_pack_description:
            return f"{package_name} · {ingredient.supplier_pack_description}"
        return package_name

    def _get_order_unit_label(self, ingredient: Ingredient) -> str:
        value = (
            ingredient.packaging_type
            or ingredient.supplier_sales_unit_name
            or ingredient.supplier_unit
            or "verpakking"
        )
        return str(value).strip().lower()

    def _get_semi_finished_scale_factor(
        self,
        item: SemiFinishedProduct,
        target_quantity: Decimal,
        target_unit: str,
    ) -> Decimal:
        if item.final_yield_amount is None or Decimal(item.final_yield_amount) <= 0:
            raise RecipePurchaseListError(
                f'Vul eerst een eindgewicht in bij halffabricaat "{item.name}".'
            )
        if not item.final_yield_unit:
            raise RecipePurchaseListError(
                f'Vul eerst een eenheid voor het eindgewicht in bij halffabricaat "{item.name}".'
            )

        converted_target = _convert_basic_quantity(
            target_quantity,
            target_unit,
            item.final_yield_unit,
        )
        if converted_target is None:
            raise RecipePurchaseListError(
                f'De gewenste eenheid is niet compatibel met het eindgewicht van "{item.name}".'
            )
        return converted_target / Decimal(item.final_yield_amount)


def _serialize_recipe_steps(
    db: Session,
    parent_type: str,
    parent_id: int,
) -> list[dict]:
    steps = (
        db.query(RecipeStep)
        .filter(
            RecipeStep.parent_type == parent_type,
            RecipeStep.parent_id == parent_id,
        )
        .order_by(RecipeStep.step_number.asc(), RecipeStep.id.asc())
        .all()
    )
    return [
        {
            "step_number": step.step_number,
            "instruction": step.instruction,
        }
        for step in steps
    ]


def build_dish_purchase_list(
    db: Session,
    dish: Dish,
    preparations: Decimal,
) -> dict:
    if not preparations.is_finite() or preparations <= 0:
        raise RecipePurchaseListError("Aantal bereidingen moet groter zijn dan 0.")

    builder = _PurchaseListBuilder(db)
    return {
        "title": dish.name,
        "scale_label": (
            "1 bereiding"
            if preparations == 1
            else f"{_format_decimal(preparations)} bereidingen"
        ),
        "scale_factor": _to_json_number(preparations),
        "scaled_recipe_lines": builder.build_scaled_recipe_lines(
            "dish",
            dish.id,
            preparations,
        ),
        "recipe_steps": _serialize_recipe_steps(db, "dish", dish.id),
        "purchase_blocks": builder.build_purchase_blocks(
            "dish",
            dish.id,
            dish.name,
            preparations,
        ),
        "warnings": builder.warnings,
    }


def build_semi_finished_purchase_list(
    db: Session,
    item: SemiFinishedProduct,
    target_quantity: Decimal,
    target_unit: str,
) -> dict:
    if not target_quantity.is_finite() or target_quantity <= 0:
        raise RecipePurchaseListError("Gewenst eindgewicht moet groter zijn dan 0.")
    if item.final_yield_amount is None or Decimal(item.final_yield_amount) <= 0:
        raise RecipePurchaseListError(
            "Vul eerst een eindgewicht in bij dit halffabricaat."
        )

    normalized_target_unit = _normalize_unit(target_unit)
    if normalized_target_unit is None:
        raise RecipePurchaseListError("Vul een eenheid voor het gewenste eindgewicht in.")

    builder = _PurchaseListBuilder(db)
    scale_factor = builder._get_semi_finished_scale_factor(
        item,
        target_quantity,
        normalized_target_unit,
    )
    return {
        "title": item.name,
        "scale_label": (
            f"{_format_decimal(target_quantity)} {normalized_target_unit}"
        ),
        "scale_factor": _to_json_number(scale_factor),
        "scaled_recipe_lines": builder.build_scaled_recipe_lines(
            "semi_finished_product",
            item.id,
            scale_factor,
        ),
        "recipe_steps": _serialize_recipe_steps(
            db,
            "semi_finished_product",
            item.id,
        ),
        "purchase_blocks": builder.build_purchase_blocks(
            "semi_finished_product",
            item.id,
            item.name,
            scale_factor,
        ),
        "warnings": builder.warnings,
    }
