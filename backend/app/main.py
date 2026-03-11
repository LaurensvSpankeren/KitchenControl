from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.ingredients import router as ingredients_router
from app.db.base import Base
from app.db.session import engine

app = FastAPI(title="KitchenControl API")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "running"}


app.include_router(health_router)
app.include_router(ingredients_router)
