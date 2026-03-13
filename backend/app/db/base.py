from app.db.base_class import Base


# Ensure model metadata is registered on Base.metadata
from app.models import (  # noqa: E402,F401
    Dish,
    Ingredient,
    RecipeLine,
    RecipeStep,
    SemiFinishedCategory,
    SemiFinishedProduct,
    SemiFinishedSubcategory,
)
