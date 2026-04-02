from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.api.semi_finished_products import (
    _build_semi_finished_detail,
    _convert_quantity_to_unit,
    _extract_clean_allergens,
    _to_calculation_quantity,
)
from app.api.auth import get_current_user, require_supervisor
from app.db.session import get_db
from app.models.dish import Dish
from app.models.ingredient import Ingredient
from app.models.menukaart import Menukaart
from app.models.menukaart_category import MenukaartCategory
from app.models.menukaart_gerecht import MenukaartGerecht
from app.models.menukaart_sectie import MenukaartSectie
from app.models.recipe_line import RecipeLine
from app.models.semi_finished_product import SemiFinishedProduct
from app.models.user import has_permission

router = APIRouter()
VALID_STATUSES = {"concept", "active"}


def _serialize_price(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


def _parse_optional_int(payload: dict, field_name: str) -> int | None:
    value = payload.get(field_name)
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid integer value for field: {field_name}",
        ) from exc


def _normalize_name(value: str | None) -> str:
    return (value or "").strip()


def _get_margin_status(value: float | None) -> str | None:
    if value is None:
        return None
    if value >= 70:
        return "green"
    if value >= 65:
        return "orange"
    return "red"


def _build_menukaart_serializer_context(db: Session, items: list[Menukaart]) -> dict:
    category_ids = {item.category_id for item in items if item.category_id is not None}
    dish_ids = {
        link.gerecht_id
        for item in items
        for link in item.gerecht_links
        if link.gerecht is not None
    }
    if not dish_ids:
        return {
            "category_names_by_id": (
                {
                    category.id: category.name
                    for category in db.query(MenukaartCategory)
                    .filter(MenukaartCategory.id.in_(category_ids))
                    .all()
                }
                if category_ids
                else {}
            ),
            "recipe_lines_by_dish_id": {},
            "ingredients_by_id": {},
            "semi_finished_products_by_id": {},
            "dish_snapshots": {},
            "semi_finished_details": {},
        }

    recipe_lines = (
        db.query(RecipeLine)
        .filter(RecipeLine.parent_type == "dish", RecipeLine.parent_id.in_(dish_ids))
        .order_by(RecipeLine.parent_id.asc(), RecipeLine.sort_order.asc(), RecipeLine.id.asc())
        .all()
    )

    recipe_lines_by_dish_id: dict[int, list[RecipeLine]] = {dish_id: [] for dish_id in dish_ids}
    ingredient_ids: set[int] = set()
    semi_finished_ids: set[int] = set()
    for line in recipe_lines:
        recipe_lines_by_dish_id.setdefault(line.parent_id, []).append(line)
        if line.item_type == "ingredient":
            ingredient_ids.add(line.item_id)
        elif line.item_type == "semi_finished_product":
            semi_finished_ids.add(line.item_id)

    ingredients_by_id = (
        {
            item.id: item
            for item in db.query(Ingredient).filter(Ingredient.id.in_(ingredient_ids)).all()
        }
        if ingredient_ids
        else {}
    )
    semi_finished_products_by_id = (
        {
            item.id: item
            for item in db.query(SemiFinishedProduct)
            .filter(SemiFinishedProduct.id.in_(semi_finished_ids))
            .all()
        }
        if semi_finished_ids
        else {}
    )

    return {
        "category_names_by_id": (
            {
                category.id: category.name
                for category in db.query(MenukaartCategory)
                .filter(MenukaartCategory.id.in_(category_ids))
                .all()
            }
            if category_ids
            else {}
        ),
        "recipe_lines_by_dish_id": recipe_lines_by_dish_id,
        "ingredients_by_id": ingredients_by_id,
        "semi_finished_products_by_id": semi_finished_products_by_id,
        "dish_snapshots": {},
        "semi_finished_details": {},
    }


def _get_menukaart_dish_snapshot(db: Session, gerecht: Dish, context: dict) -> dict:
    cached = context["dish_snapshots"].get(gerecht.id)
    if cached is not None:
        return cached

    lines = context["recipe_lines_by_dish_id"].get(gerecht.id, [])
    estimated_cost_total_decimal = Decimal("0")
    has_any_line_cost = False
    allergens_parts: list[str] = []

    for line in lines:
        if line.item_type == "ingredient":
            ingredient = context["ingredients_by_id"].get(line.item_id)
            if ingredient is None:
                continue

            if (
                ingredient.supplier_price_ex_vat is not None
                and ingredient.calculation_quantity_per_package is not None
                and Decimal(ingredient.calculation_quantity_per_package) != 0
            ):
                quantity_for_cost = _to_calculation_quantity(line, ingredient)
                estimated_cost_total_decimal += (
                    quantity_for_cost
                    * Decimal(ingredient.supplier_price_ex_vat)
                    / Decimal(ingredient.calculation_quantity_per_package)
                )
                has_any_line_cost = True
            elif (
                ingredient.supplier_price_ex_vat is not None
                and ingredient.conversion_factor_to_base is not None
                and Decimal(ingredient.conversion_factor_to_base) != 0
            ):
                quantity_for_cost = _to_calculation_quantity(line, ingredient)
                estimated_cost_total_decimal += (
                    quantity_for_cost
                    * Decimal(ingredient.supplier_price_ex_vat)
                    / Decimal(ingredient.conversion_factor_to_base)
                )
                has_any_line_cost = True

            for value in [
                (ingredient.supplier_allergens_raw or "").strip(),
                (ingredient.internal_allergens_extra or "").strip(),
                (ingredient.cross_contamination_notes or "").strip(),
            ]:
                allergens_parts.extend(_extract_clean_allergens(value))

        elif line.item_type == "semi_finished_product":
            nested = context["semi_finished_products_by_id"].get(line.item_id)
            if nested is None:
                continue

            nested_detail = context["semi_finished_details"].get(nested.id)
            if nested_detail is None:
                nested_detail = _build_semi_finished_detail(db, nested)
                context["semi_finished_details"][nested.id] = nested_detail

            nested_cost_total = nested_detail.get("estimated_cost_total")
            nested_final_yield_amount = nested_detail.get("final_yield_amount")
            nested_final_yield_unit = nested_detail.get("final_yield_unit")

            if (
                nested_cost_total is not None
                and nested_final_yield_amount is not None
                and Decimal(str(nested_final_yield_amount)) > 0
                and nested_final_yield_unit
            ):
                converted_quantity = _convert_quantity_to_unit(
                    Decimal(line.quantity),
                    line.unit,
                    nested_final_yield_unit,
                )
                if converted_quantity is not None:
                    estimated_cost_total_decimal += (
                        Decimal(str(nested_cost_total))
                        / Decimal(str(nested_final_yield_amount))
                    ) * converted_quantity
                    has_any_line_cost = True

            allergens_parts.extend(_extract_clean_allergens(nested_detail.get("allergens_total")))

    estimated_cost_total = estimated_cost_total_decimal if has_any_line_cost else None
    allergens_total = " | ".join(dict.fromkeys([part for part in allergens_parts if part])) or None
    gross_margin_percent = None

    if (
        estimated_cost_total is not None
        and gerecht.sale_price_incl_vat is not None
        and gerecht.vat_rate is not None
    ):
        vat_multiplier = Decimal("1") + (Decimal(gerecht.vat_rate) / Decimal("100"))
        if vat_multiplier != 0:
            sale_price_excl_vat_decimal = Decimal(gerecht.sale_price_incl_vat) / vat_multiplier
            if sale_price_excl_vat_decimal != 0:
                gross_margin_percent = float(
                    ((sale_price_excl_vat_decimal - estimated_cost_total) / sale_price_excl_vat_decimal)
                    * Decimal("100")
                )

    snapshot = {
        "gross_margin_percent": gross_margin_percent,
        "allergens_total": allergens_total,
    }
    context["dish_snapshots"][gerecht.id] = snapshot
    return snapshot


def _build_menukaart_margin_payload(db: Session, item: Menukaart, context: dict) -> dict:
    margin_values: list[float] = []
    for link in item.gerecht_links:
        dish_snapshot = _get_menukaart_dish_snapshot(db, link.gerecht, context)
        gross_margin_percent = dish_snapshot.get("gross_margin_percent")
        if gross_margin_percent is not None:
            margin_values.append(float(gross_margin_percent))

    if not margin_values:
        return {
            "average_margin_percent": None,
            "margin_status": None,
        }

    average_margin_percent = sum(margin_values) / len(margin_values)
    return {
        "average_margin_percent": round(average_margin_percent, 1),
        "margin_status": _get_margin_status(average_margin_percent),
    }


def _get_active_days(item: Menukaart) -> int | None:
    if item.status != "active" or item.activated_at is None:
        return None

    activated_at = item.activated_at
    if activated_at.tzinfo is None:
        activated_at = activated_at.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    delta = now.date() - activated_at.date()
    return max(delta.days, 0)


def _build_sections_summary(item: Menukaart) -> str | None:
    if not item.secties:
        return None

    sections_parts = [
        f"{sectie.title} ({len(sectie.gerechten)})"
        for sectie in item.secties
    ]
    if not sections_parts:
        return "0 gerechten"
    return " · ".join(sections_parts)


def _serialize_gerecht_link(db: Session, link: MenukaartGerecht, context: dict) -> dict:
    gerecht = link.gerecht
    dish_snapshot = _get_menukaart_dish_snapshot(db, gerecht, context)
    gross_margin_percent = dish_snapshot.get("gross_margin_percent")
    return {
        "id": gerecht.id,
        "name": gerecht.name,
        "sale_price_incl_vat": _serialize_price(gerecht.sale_price_incl_vat),
        "gross_margin_percent": round(float(gross_margin_percent), 1)
        if gross_margin_percent is not None
        else None,
        "margin_status": _get_margin_status(float(gross_margin_percent))
        if gross_margin_percent is not None
        else None,
        "allergens_total": dish_snapshot.get("allergens_total"),
        "sort_order": link.sort_order,
    }


def _serialize_sectie(db: Session, sectie: MenukaartSectie, context: dict) -> dict:
    return {
        "id": sectie.id,
        "title": sectie.title,
        "sort_order": sectie.sort_order,
        "gerechten": [_serialize_gerecht_link(db, link, context) for link in sectie.gerechten],
    }


def _serialize_menukaart(db: Session, item: Menukaart, context: dict) -> dict:
    data = {
        "id": item.id,
        "name": item.name,
        "category_id": item.category_id,
        "category_name": context["category_names_by_id"].get(item.category_id),
        "status": item.status,
        "is_archived": item.is_archived,
        "created_at": item.created_at.isoformat() if item.created_at is not None else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at is not None else None,
        "activated_at": item.activated_at.isoformat() if item.activated_at is not None else None,
        "active_days": _get_active_days(item),
        "dish_count": len(item.gerecht_links),
        "sections_summary": _build_sections_summary(item),
    }
    data.update(_build_menukaart_margin_payload(db, item, context))
    return data


def _serialize_menukaart_detail(db: Session, item: Menukaart) -> dict:
    context = _build_menukaart_serializer_context(db, [item])
    data = _serialize_menukaart(db, item, context)
    data["secties"] = [_serialize_sectie(db, sectie, context) for sectie in item.secties]

    valid_section_ids = {sectie.id for sectie in item.secties}
    unassigned_links = [
        link
        for link in item.gerecht_links
        if link.menukaart_sectie_id is None or link.menukaart_sectie_id not in valid_section_ids
    ]
    if unassigned_links:
        data["secties"].append(
            {
                "id": None,
                "title": "Zonder sectie",
                "sort_order": 999999,
                "gerechten": [_serialize_gerecht_link(db, link, context) for link in unassigned_links],
            }
        )
    return data


def _validate_status(value: str | None) -> str:
    status = str(value or "").strip().lower()
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status. Use 'concept' or 'active'.")
    return status


def _list_menukaart_categories(db: Session) -> list[dict]:
    categories = db.query(MenukaartCategory).order_by(MenukaartCategory.name.asc()).all()
    return [{"id": category.id, "name": category.name} for category in categories]


def _get_menukaart(db: Session, menukaart_id: int) -> Menukaart:
    item = (
        db.query(Menukaart)
        .options(
            selectinload(Menukaart.gerecht_links).selectinload(MenukaartGerecht.gerecht),
            selectinload(Menukaart.secties)
            .selectinload(MenukaartSectie.gerechten)
            .selectinload(MenukaartGerecht.gerecht),
        )
        .filter(Menukaart.id == menukaart_id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Menukaart not found")
    return item


def _get_sectie(db: Session, menukaart_id: int, sectie_id: int) -> MenukaartSectie:
    sectie = (
        db.query(MenukaartSectie)
        .options(selectinload(MenukaartSectie.gerechten))
        .filter(MenukaartSectie.id == sectie_id, MenukaartSectie.menukaart_id == menukaart_id)
        .first()
    )
    if sectie is None:
        raise HTTPException(status_code=404, detail="Menukaartsectie not found")
    return sectie


def _swap_sort_order(left, right) -> None:
    left.sort_order, right.sort_order = right.sort_order, left.sort_order


def _get_link_in_sectie(db: Session, menukaart_id: int, sectie_id: int, gerecht_id: int) -> MenukaartGerecht:
    link = (
        db.query(MenukaartGerecht)
        .filter(
            MenukaartGerecht.menukaart_id == menukaart_id,
            MenukaartGerecht.menukaart_sectie_id == sectie_id,
            MenukaartGerecht.gerecht_id == gerecht_id,
        )
        .first()
    )
    if link is None:
        raise HTTPException(status_code=404, detail="Gerecht koppeling niet gevonden")
    return link


@router.get("/api/menukaarten", tags=["menukaarten"])
def list_menukaarten(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> list[dict]:
    if not has_permission(current_user, "menukaarten.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    items = (
        db.query(Menukaart)
        .options(
            selectinload(Menukaart.gerecht_links).selectinload(MenukaartGerecht.gerecht),
            selectinload(Menukaart.secties).selectinload(MenukaartSectie.gerechten),
        )
        .filter(Menukaart.is_archived.is_(False))
        .order_by(Menukaart.created_at.desc(), Menukaart.id.desc())
        .all()
    )
    context = _build_menukaart_serializer_context(db, items)
    return [_serialize_menukaart(db, item, context) for item in items]


@router.get("/api/menukaart-categories", tags=["menukaarten"])
def list_menukaart_categories(
    db: Session = Depends(get_db),
    _current_user = Depends(get_current_user),
) -> list[dict]:
    return _list_menukaart_categories(db)


@router.post("/api/menukaart-categories", tags=["menukaarten"])
def create_menukaart_category(
    payload: dict,
    db: Session = Depends(get_db),
    _current_user = Depends(get_current_user),
) -> dict:
    name = _normalize_name(payload.get("name"))
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")

    existing = (
        db.query(MenukaartCategory)
        .filter(func.lower(MenukaartCategory.name) == name.lower())
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=400, detail="Category already exists")

    category = MenukaartCategory(name=name)
    db.add(category)
    db.commit()
    db.refresh(category)

    return {"id": category.id, "name": category.name}


@router.put("/api/menukaart-categories/{category_id}", tags=["menukaarten"])
def rename_menukaart_category(
    category_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    _current_user=Depends(require_supervisor),
) -> dict:
    name = _normalize_name(payload.get("name"))
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")

    category = (
        db.query(MenukaartCategory)
        .filter(MenukaartCategory.id == category_id)
        .first()
    )
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")

    existing = (
        db.query(MenukaartCategory)
        .filter(
            func.lower(MenukaartCategory.name) == name.lower(),
            MenukaartCategory.id != category_id,
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=400, detail="Category already exists")

    category.name = name
    db.add(category)
    db.commit()
    db.refresh(category)

    return {"id": category.id, "name": category.name}


@router.get("/api/menukaarten/archived", tags=["menukaarten"])
def list_archived_menukaarten(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> list[dict]:
    if not has_permission(current_user, "menukaarten.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    items = (
        db.query(Menukaart)
        .options(
            selectinload(Menukaart.gerecht_links).selectinload(MenukaartGerecht.gerecht),
            selectinload(Menukaart.secties).selectinload(MenukaartSectie.gerechten),
        )
        .filter(Menukaart.is_archived.is_(True))
        .order_by(Menukaart.created_at.desc(), Menukaart.id.desc())
        .all()
    )
    context = _build_menukaart_serializer_context(db, items)
    return [_serialize_menukaart(db, item, context) for item in items]


@router.get("/api/menukaarten/{menukaart_id}", tags=["menukaarten"])
def get_menukaart(
    menukaart_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.bekijken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))


@router.post("/api/menukaarten", tags=["menukaarten"])
def create_menukaart(
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.aanmaken", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Missing required field: name")

    category_id = _parse_optional_int(payload, "category_id")
    if category_id is not None:
        category = db.query(MenukaartCategory).filter(MenukaartCategory.id == category_id).first()
        if category is None:
            raise HTTPException(status_code=404, detail="Menukaart category not found")

    item = Menukaart(
        name=name,
        category_id=category_id,
        status="concept",
        is_archived=False,
    )
    db.add(item)
    db.commit()
    item = _get_menukaart(db, item.id)
    context = _build_menukaart_serializer_context(db, [item])
    return _serialize_menukaart(db, item, context)


@router.post("/api/menukaarten/{menukaart_id}/duplicate", tags=["menukaarten"])
def duplicate_menukaart(
    menukaart_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.dupliceren", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    source = _get_menukaart(db, menukaart_id)

    duplicate = Menukaart(
        name=f"{source.name} kopie",
        category_id=source.category_id,
        status="concept",
        is_archived=False,
        activated_at=None,
    )
    db.add(duplicate)
    db.flush()

    section_id_map: dict[int, int] = {}
    for sectie in source.secties:
        duplicated_sectie = MenukaartSectie(
            menukaart_id=duplicate.id,
            title=sectie.title,
            sort_order=sectie.sort_order,
        )
        db.add(duplicated_sectie)
        db.flush()
        section_id_map[sectie.id] = duplicated_sectie.id

    for link in source.gerecht_links:
        db.add(
            MenukaartGerecht(
                menukaart_id=duplicate.id,
                gerecht_id=link.gerecht_id,
                menukaart_sectie_id=section_id_map.get(link.menukaart_sectie_id),
                sort_order=link.sort_order,
            )
        )

    db.commit()
    item = _get_menukaart(db, duplicate.id)
    context = _build_menukaart_serializer_context(db, [item])
    return _serialize_menukaart(db, item, context)


@router.patch("/api/menukaarten/{menukaart_id}", tags=["menukaarten"])
def update_menukaart(
    menukaart_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    item = db.query(Menukaart).filter(Menukaart.id == menukaart_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Menukaart not found")

    if "name" in payload:
        name = (payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Missing required field: name")
        item.name = name

    if "category_id" in payload:
        category_id = _parse_optional_int(payload, "category_id")
        if category_id is not None:
            category = (
                db.query(MenukaartCategory)
                .filter(MenukaartCategory.id == category_id)
                .first()
            )
            if category is None:
                raise HTTPException(status_code=404, detail="Menukaart category not found")
        item.category_id = category_id

    if "status" in payload:
        next_status = _validate_status(payload.get("status"))
        item.status = next_status
        if next_status == "active":
            item.activated_at = datetime.now(timezone.utc)
        elif next_status == "concept":
            item.activated_at = None

    db.commit()
    item = _get_menukaart(db, menukaart_id)
    context = _build_menukaart_serializer_context(db, [item])
    return _serialize_menukaart(db, item, context)


@router.post("/api/menukaarten/{menukaart_id}/secties", tags=["menukaarten"])
def create_menukaart_sectie(
    menukaart_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    menukaart = db.query(Menukaart).filter(Menukaart.id == menukaart_id).first()
    if menukaart is None:
        raise HTTPException(status_code=404, detail="Menukaart not found")

    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Missing required field: title")

    max_sort_order = (
        db.query(func.max(MenukaartSectie.sort_order))
        .filter(MenukaartSectie.menukaart_id == menukaart_id)
        .scalar()
    )
    sectie = MenukaartSectie(
        menukaart_id=menukaart_id,
        title=title,
        sort_order=(max_sort_order or 0) + 1,
    )
    db.add(sectie)
    db.commit()
    return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))


@router.patch("/api/menukaarten/{menukaart_id}/secties/{sectie_id}", tags=["menukaarten"])
def update_menukaart_sectie(
    menukaart_id: int,
    sectie_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    sectie = _get_sectie(db, menukaart_id, sectie_id)
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Missing required field: title")

    sectie.title = title
    db.commit()
    return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))


@router.post("/api/menukaarten/{menukaart_id}/secties/{sectie_id}/move-up", tags=["menukaarten"])
def move_menukaart_sectie_up(
    menukaart_id: int,
    sectie_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    sectie = _get_sectie(db, menukaart_id, sectie_id)
    previous_sectie = (
        db.query(MenukaartSectie)
        .filter(
            MenukaartSectie.menukaart_id == menukaart_id,
            MenukaartSectie.sort_order < sectie.sort_order,
        )
        .order_by(MenukaartSectie.sort_order.desc(), MenukaartSectie.id.desc())
        .first()
    )
    if previous_sectie is None:
        return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))

    _swap_sort_order(sectie, previous_sectie)
    db.commit()
    return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))


@router.post("/api/menukaarten/{menukaart_id}/secties/{sectie_id}/move-down", tags=["menukaarten"])
def move_menukaart_sectie_down(
    menukaart_id: int,
    sectie_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    sectie = _get_sectie(db, menukaart_id, sectie_id)
    next_sectie = (
        db.query(MenukaartSectie)
        .filter(
            MenukaartSectie.menukaart_id == menukaart_id,
            MenukaartSectie.sort_order > sectie.sort_order,
        )
        .order_by(MenukaartSectie.sort_order.asc(), MenukaartSectie.id.asc())
        .first()
    )
    if next_sectie is None:
        return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))

    _swap_sort_order(sectie, next_sectie)
    db.commit()
    return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))


@router.delete("/api/menukaarten/{menukaart_id}/secties/{sectie_id}", tags=["menukaarten"])
def delete_menukaart_sectie(
    menukaart_id: int,
    sectie_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.verwijderen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    sectie = _get_sectie(db, menukaart_id, sectie_id)
    if sectie.gerechten:
        raise HTTPException(status_code=400, detail="Sectie is niet leeg en kan niet worden verwijderd.")

    db.delete(sectie)
    db.commit()
    return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))


@router.post("/api/menukaarten/{menukaart_id}/gerechten", tags=["menukaarten"])
def add_gerecht_to_menukaart(
    menukaart_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    menukaart = db.query(Menukaart).filter(Menukaart.id == menukaart_id).first()
    if menukaart is None:
        raise HTTPException(status_code=404, detail="Menukaart not found")

    gerecht_id = payload.get("gerecht_id")
    sectie_id = payload.get("menukaart_sectie_id")
    if not gerecht_id:
        raise HTTPException(status_code=400, detail="Missing required field: gerecht_id")
    if not sectie_id:
        raise HTTPException(status_code=400, detail="Missing required field: menukaart_sectie_id")

    sectie = _get_sectie(db, menukaart_id, sectie_id)
    gerecht = db.query(Dish).filter(Dish.id == gerecht_id, Dish.is_archived.is_(False)).first()
    if gerecht is None:
        raise HTTPException(status_code=404, detail="Gerecht not found")

    existing = (
        db.query(MenukaartGerecht)
        .filter(
            MenukaartGerecht.menukaart_id == menukaart_id,
            MenukaartGerecht.gerecht_id == gerecht_id,
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=400, detail="Gerecht is al toegevoegd aan deze menukaart.")

    max_sort_order = (
        db.query(func.max(MenukaartGerecht.sort_order))
        .filter(MenukaartGerecht.menukaart_sectie_id == sectie.id)
        .scalar()
    )
    link = MenukaartGerecht(
        menukaart_id=menukaart_id,
        gerecht_id=gerecht_id,
        menukaart_sectie_id=sectie.id,
        sort_order=(max_sort_order or 0) + 1,
    )
    db.add(link)
    db.commit()
    return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))


@router.post("/api/menukaarten/{menukaart_id}/secties/{sectie_id}/gerechten/{gerecht_id}/move-up", tags=["menukaarten"])
def move_menukaart_gerecht_up(
    menukaart_id: int,
    sectie_id: int,
    gerecht_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    _get_sectie(db, menukaart_id, sectie_id)
    link = _get_link_in_sectie(db, menukaart_id, sectie_id, gerecht_id)
    previous_link = (
        db.query(MenukaartGerecht)
        .filter(
            MenukaartGerecht.menukaart_id == menukaart_id,
            MenukaartGerecht.menukaart_sectie_id == sectie_id,
            MenukaartGerecht.sort_order < link.sort_order,
        )
        .order_by(MenukaartGerecht.sort_order.desc(), MenukaartGerecht.id.desc())
        .first()
    )
    if previous_link is None:
        return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))

    _swap_sort_order(link, previous_link)
    db.commit()
    return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))


@router.post("/api/menukaarten/{menukaart_id}/secties/{sectie_id}/gerechten/{gerecht_id}/move-down", tags=["menukaarten"])
def move_menukaart_gerecht_down(
    menukaart_id: int,
    sectie_id: int,
    gerecht_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    _get_sectie(db, menukaart_id, sectie_id)
    link = _get_link_in_sectie(db, menukaart_id, sectie_id, gerecht_id)
    next_link = (
        db.query(MenukaartGerecht)
        .filter(
            MenukaartGerecht.menukaart_id == menukaart_id,
            MenukaartGerecht.menukaart_sectie_id == sectie_id,
            MenukaartGerecht.sort_order > link.sort_order,
        )
        .order_by(MenukaartGerecht.sort_order.asc(), MenukaartGerecht.id.asc())
        .first()
    )
    if next_link is None:
        return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))

    _swap_sort_order(link, next_link)
    db.commit()
    return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))


@router.patch("/api/menukaarten/{menukaart_id}/gerechten/{gerecht_id}/move", tags=["menukaarten"])
def move_menukaart_gerecht_to_sectie(
    menukaart_id: int,
    gerecht_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.wijzigen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    menukaart = db.query(Menukaart).filter(Menukaart.id == menukaart_id).first()
    if menukaart is None:
        raise HTTPException(status_code=404, detail="Menukaart not found")

    target_sectie_id = payload.get("menukaart_sectie_id")
    if not target_sectie_id:
        raise HTTPException(status_code=400, detail="Missing required field: menukaart_sectie_id")

    link = (
        db.query(MenukaartGerecht)
        .filter(
            MenukaartGerecht.menukaart_id == menukaart_id,
            MenukaartGerecht.gerecht_id == gerecht_id,
        )
        .first()
    )
    if link is None:
        raise HTTPException(status_code=404, detail="Gerecht koppeling niet gevonden")

    target_sectie = _get_sectie(db, menukaart_id, target_sectie_id)
    if link.menukaart_sectie_id == target_sectie.id:
        return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))

    max_sort_order = (
        db.query(func.max(MenukaartGerecht.sort_order))
        .filter(MenukaartGerecht.menukaart_sectie_id == target_sectie.id)
        .scalar()
    )
    link.menukaart_sectie_id = target_sectie.id
    link.sort_order = (max_sort_order or 0) + 1
    db.commit()
    return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))


@router.delete("/api/menukaarten/{menukaart_id}/gerechten/{gerecht_id}", tags=["menukaarten"])
def remove_gerecht_from_menukaart(
    menukaart_id: int,
    gerecht_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.verwijderen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    menukaart = db.query(Menukaart).filter(Menukaart.id == menukaart_id).first()
    if menukaart is None:
        raise HTTPException(status_code=404, detail="Menukaart not found")

    link = (
        db.query(MenukaartGerecht)
        .filter(
            MenukaartGerecht.menukaart_id == menukaart_id,
            MenukaartGerecht.gerecht_id == gerecht_id,
        )
        .first()
    )
    if link is None:
        raise HTTPException(status_code=404, detail="Gerecht koppeling niet gevonden")

    db.delete(link)
    db.commit()
    return _serialize_menukaart_detail(db, _get_menukaart(db, menukaart_id))


@router.delete("/api/menukaarten/{menukaart_id}", tags=["menukaarten"])
def archive_menukaart(
    menukaart_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    item = db.query(Menukaart).filter(Menukaart.id == menukaart_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Menukaart not found")

    if item.is_archived:
        if not has_permission(current_user, "menukaarten.verwijderen", db):
            raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")
        db.delete(item)
        db.commit()
        return {"status": "deleted", "menukaart_id": menukaart_id}

    if not has_permission(current_user, "menukaarten.archiveren", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    item.is_archived = True
    db.commit()
    item = _get_menukaart(db, menukaart_id)
    context = _build_menukaart_serializer_context(db, [item])
    return _serialize_menukaart(db, item, context)


@router.put("/api/menukaarten/{menukaart_id}/restore", tags=["menukaarten"])
def restore_menukaart(
    menukaart_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
) -> dict:
    if not has_permission(current_user, "menukaarten.herstellen", db):
        raise HTTPException(status_code=403, detail="Je hebt geen rechten om deze actie uit te voeren")

    item = db.query(Menukaart).filter(Menukaart.id == menukaart_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Menukaart not found")

    item.is_archived = False
    db.commit()
    item = _get_menukaart(db, menukaart_id)
    context = _build_menukaart_serializer_context(db, [item])
    return _serialize_menukaart(db, item, context)
