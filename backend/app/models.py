"""
SQLAlchemy ORM models — matches the full database schema from the spec.
Tables are auto-created via init_db() on startup (CREATE TABLE IF NOT EXISTS).
"""
import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class BucketType(str, enum.Enum):
    day_to_day = "day_to_day"
    short_term_debt = "short_term_debt"
    savings = "savings"
    retirement = "retirement"


# ---------------------------------------------------------------------------
# Account
# ---------------------------------------------------------------------------

class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    institution: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    custom_name: Mapped[Optional[str]] = mapped_column(String(150))
    bucket: Mapped[BucketType] = mapped_column(
        SAEnum(BucketType, name="bucket_type", create_type=True), nullable=False
    )
    current_balance: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00)
    available_balance: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    credit_limit: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    statement_due_day: Mapped[Optional[int]] = mapped_column(Integer)
    include_in_cashflow: Mapped[bool] = mapped_column(Boolean, default=True)
    last_synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="account", cascade="all, delete-orphan"
    )

    @property
    def display_name(self) -> str:
        return self.custom_name or self.name


# ---------------------------------------------------------------------------
# Transaction
# ---------------------------------------------------------------------------

class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    account_id: Mapped[str] = mapped_column(
        String(128), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    transacted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    merchant_raw: Mapped[str] = mapped_column(Text, nullable=False)
    merchant_clean: Mapped[Optional[str]] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(100), default="Uncategorized")
    is_pending: Mapped[bool] = mapped_column(Boolean, default=False)
    is_internal_transfer: Mapped[bool] = mapped_column(Boolean, default=False)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    roast_score: Mapped[int] = mapped_column(Integer, default=0)
    roast_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    roast_message: Mapped[Optional[str]] = mapped_column(Text)
    user_justification: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    account: Mapped["Account"] = relationship("Account", back_populates="transactions")


# ---------------------------------------------------------------------------
# RecurringSchedule
# ---------------------------------------------------------------------------

class RecurringSchedule(Base):
    __tablename__ = "recurring_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    merchant_pattern: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    expected_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    tolerance_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=10.00)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False)  # weekly/monthly/annual
    expected_day_of_month: Mapped[Optional[int]] = mapped_column(Integer)
    last_charged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    next_expected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


# ---------------------------------------------------------------------------
# AppState  (key/value store for runtime config)
# ---------------------------------------------------------------------------

class AppState(Base):
    __tablename__ = "app_state"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
