import os


class Settings:
    app_name: str = os.getenv('APP_NAME', 'KitchenControl API')
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./kitchencontrol.db")


settings = Settings()
