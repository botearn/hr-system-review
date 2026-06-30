from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: str = "development"

    postgres_user: str = "hr"
    postgres_password: str = "hr_pass"
    postgres_db: str = "hr_system"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    database_url_override: str | None = Field(default=None, alias="DATABASE_URL")

    redis_url: str = "redis://localhost:6379/0"

    # LLM provider: ollama | zhipu | deepseek | openai_compat
    llm_provider: str = "zhipu"
    llm_model: str = "glm-4-flash"
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_timeout_seconds: float = 180.0

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "glm4:9b"

    # Embedding provider: local | zhipu | openai_compat
    embedding_provider: str = "zhipu"
    embedding_model: str = "BAAI/bge-m3"  # only used when provider=local
    embedding_model_name: str = ""  # for API providers (default "embedding-3" for zhipu)
    embedding_base_url: str = ""  # override API base URL
    embedding_api_key: str = ""  # defaults to llm_api_key if blank

    jwt_secret: str = Field(default="dev-only-secret-change-me")
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_minutes: int = 60
    jwt_refresh_ttl_days: int = 14

    # storage_backend: local | supabase
    storage_backend: str = "local"
    storage_root: str = "./storage"
    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_storage_bucket: str = "resumes"

    # Web enrichment
    serp_api_key: str = ""
    github_token: str = ""
    web_enrichment_enabled: bool = True

    cors_origins: str = "*"
    cors_origin_regex: str = r"https://hr-system-review(?:-[a-z0-9-]+)?(?:-hr-system)?\.vercel\.app"

    @property
    def database_url(self) -> str:
        if self.database_url_override:
            url = self.database_url_override
            if url.startswith("postgres://"):
                url = "postgresql+psycopg://" + url[len("postgres://") :]
            elif url.startswith("postgresql://"):
                url = "postgresql+psycopg://" + url[len("postgresql://") :]
            return url
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
