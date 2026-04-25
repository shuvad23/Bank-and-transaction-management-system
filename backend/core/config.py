from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # MongoDB
    MONGODB_URL: str
    DATABASE_NAME: str = "bank_management"

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # App
    APP_NAME: str = "Bank Management System"
    DEBUG: bool = False
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:5000",
        "http://localhost:3000",
        "*",
    ]

    @property
    def origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS]
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
