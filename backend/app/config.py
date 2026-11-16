from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Database ---
    POSTGRES_USER: str = "finance"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "finance_db"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str = "postgresql+asyncpg://finance:finance@db:5432/finance_db"

    # --- SimpleFIN ---
    SIMPLEFIN_SETUP_TOKEN: Optional[str] = None
    SIMPLEFIN_ACCESS_URL: Optional[str] = None

    # --- LLM (Gemini via OpenAI-compatible endpoint) ---
    LLM_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "gemini-2.0-flash"

    # --- Telegram ---
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_CHAT_ID: Optional[str] = None

    # --- SMTP / Carrier email-to-SMS fallback ---
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASS: Optional[str] = None
    SMS_GATEWAY_EMAIL: Optional[str] = None

    # --- Nvidia Shield TV ---
    SHIELD_TV_IP: Optional[str] = None
    SHIELD_LIVE_TOAST_ENABLED: bool = False

    # --- App Behavior ---
    SYNC_INTERVAL_HOURS: int = 4
    DEBT_ALERT_THRESHOLD: float = 1500.0
    SAFE_TO_SPEND_ALERT_THRESHOLD: float = 500.0
    TIMEZONE: str = "America/Los_Angeles"

    # --- Roast Blacklist (comma-separated merchant substrings) ---
    ROAST_BLACKLIST: str = "DOORDASH,UBER EATS,DRAFTKINGS,STEAM"

    def get_blacklist(self) -> list[str]:
        return [m.strip().upper() for m in self.ROAST_BLACKLIST.split(",") if m.strip()]


settings = Settings()
