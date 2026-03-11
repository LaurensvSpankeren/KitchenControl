import os


class Settings:
    app_name: str = os.getenv('APP_NAME', 'KitchenControl API')


settings = Settings()
