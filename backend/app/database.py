import asyncio
import logging
from typing import Optional
from sqlalchemy import text
from sqlalchemy.engine import URL
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger(__name__)


def build_db_url(password: Optional[str] = None) -> URL | str:
    pwd = password if password is not None else settings.POSTGRES_PASSWORD
    if pwd:
        return URL.create(
            drivername="postgresql+asyncpg",
            username=settings.POSTGRES_USER,
            password=pwd,
            host=settings.POSTGRES_HOST,
            port=settings.POSTGRES_PORT,
            database=settings.POSTGRES_DB,
        )
    return settings.DATABASE_URL


engine = create_async_engine(
    build_db_url(),
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:  # type: ignore[override]
    """FastAPI dependency — yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create all tables with retry and password-sync fallback."""
    global engine, AsyncSessionLocal

    # Attempt 1: connect with configured password
    for attempt in range(1, 4):
        try:
            logger.info(f"Connecting to database (attempt {attempt}/3)...")
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                # Auto-migrate new columns
                await conn.execute(text("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_role VARCHAR(50) DEFAULT 'general';"))
                await conn.execute(text("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS low_balance_threshold NUMERIC(12, 2) DEFAULT 500.00;"))
            logger.info("Database initialized successfully.")
            return
        except Exception as e:
            logger.warning(f"Database connection attempt {attempt} failed: {e}. Retrying in 2s...")
            await asyncio.sleep(2)

    # Fallback: if existing volume was created with old placeholder password, auto-heal
    fallback_passwords = ["CHANGE_ME_SET_IN_COOLIFY", "finance"]
    for fb_pwd in fallback_passwords:
        if settings.POSTGRES_PASSWORD == fb_pwd:
            continue
        try:
            logger.info("Attempting fallback DB connection to synchronize password...")
            fb_engine = create_async_engine(build_db_url(password=fb_pwd))
            async with fb_engine.begin() as conn:
                safe_pwd = settings.POSTGRES_PASSWORD.replace("'", "''")
                await conn.execute(text(f"ALTER USER {settings.POSTGRES_USER} WITH PASSWORD '{safe_pwd}';"))
            await fb_engine.dispose()
            logger.info("Successfully updated PostgreSQL user password to match env!")

            # Re-try original engine
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Database initialized successfully after password sync.")
            return
        except Exception as fb_err:
            logger.warning(f"Fallback connection attempt failed: {fb_err}")

    logger.error("Could not connect to database on startup. Service running with degraded DB connectivity.")
