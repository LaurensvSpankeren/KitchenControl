from app.db.base_class import Base


# Ensure model metadata is registered on Base.metadata
from app.models import Ingredient  # noqa: E402,F401
