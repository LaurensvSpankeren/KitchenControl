from fastapi import FastAPI

from app.api.health import router as health_router

app = FastAPI(title="KitchenControl API")


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "running"}


app.include_router(health_router)
