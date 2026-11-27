from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./dev.db"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    UPLOAD_DIR: str = "./uploads"

    # 与主站（明月科创教育大模型）的单点登录
    SSO_ENABLED: bool = True
    MODEL_SESSION_URL: str = "http://127.0.0.1:5002/get_session"
    # 部署在子路径时（如 /academic），生成的下载/图片 URL 需要带此前缀
    PUBLIC_BASE_PATH: str = ""

    # 知识库
    KB_SCHEDULER_ENABLED: bool = True
    KB_DATA_DIR: str = "/opt/mingyue/data_import"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
