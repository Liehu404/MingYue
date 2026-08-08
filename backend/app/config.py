from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./dev.db"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    UPLOAD_DIR: str = "./uploads"
    SEED_SUPER_ADMIN: bool = False
    SUPER_ADMIN_USERNAME: str = "admin"
    SUPER_ADMIN_EMAIL: str = "admin@mingyue.local"
    SUPER_ADMIN_PASSWORD: str = ""
    SUPER_ADMIN_DISPLAY_NAME: str = "超级管理员"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
