from app.db.base_class import Base


# Ensure model metadata is registered on Base.metadata
from app.models import Dish, Ingredient, RecipeLine, SemiFinishedProduct  # noqa: E402,F401
