"""
Pydantic schemas for FastAPI request/response validation.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.models import BucketType


# ---------------------------------------------------------------------------
# Account Schemas
# ---------------------------------------------------------------------------

class AccountBase(BaseModel):
    id: str
    institution: str
    name: str
    custom_name: Optional[str] = None
    bucket: BucketType
    current_balance: float
    available_balance: Optional[float] = None
    credit_limit: Optional[float] = None
    statement_due_day: Optional[int] = None
    include_in_cashflow: bool
    last_synced_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AccountUpdate(BaseModel):
    bucket: Optional[BucketType] = None
    custom_name: Optional[str] = None
    statement_due_day: Optional[int] = None
    include_in_cashflow: Optional[bool] = None


# ---------------------------------------------------------------------------
# Transaction Schemas
# ---------------------------------------------------------------------------

class TransactionOut(BaseModel):
    id: str
    account_id: str
    posted_at: datetime
    transacted_at: Optional[datetime] = None
    amount: float
    merchant_raw: str
    merchant_clean: Optional[str] = None
    category: str
    is_pending: bool
    is_internal_transfer: bool
    is_recurring: bool
    roast_score: int
    roast_sent: bool
    roast_message: Optional[str] = None
    user_justification: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Recurring Schedule Schemas
# ---------------------------------------------------------------------------

class RecurringScheduleOut(BaseModel):
    id: int
    merchant_pattern: str
    expected_amount: float
    tolerance_pct: float
    frequency: str
    expected_day_of_month: Optional[int] = None
    last_charged_at: Optional[datetime] = None
    next_expected_at: Optional[datetime] = None
    active: bool

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Metrics / Summary Schema
# ---------------------------------------------------------------------------

class BucketSummary(BaseModel):
    bucket: BucketType
    total_balance: float
    account_count: int
    accounts: list[AccountBase]


class MetricsSummary(BaseModel):
    day_to_day_balance: float
    short_term_debt_balance: float   # magnitude (absolute value)
    savings_balance: float
    retirement_balance: float
    true_safe_to_spend: float
    upcoming_bills_14d: float
    inflow_30d: float
    outflow_30d: float
    buckets: list[BucketSummary]


# ---------------------------------------------------------------------------
# Webhook / Messaging Schemas
# ---------------------------------------------------------------------------

class TelegramUpdate(BaseModel):
    update_id: int
    message: Optional[dict] = None


class SMSWebhook(BaseModel):
    From: Optional[str] = None
    Body: Optional[str] = None
    # Twilio/Telnyx send various additional fields — allow extras
    model_config = ConfigDict(extra="allow")


# ---------------------------------------------------------------------------
# Setup Schemas
# ---------------------------------------------------------------------------

class ClaimSimpleFinRequest(BaseModel):
    setup_token: str


class ClaimSimpleFinResponse(BaseModel):
    access_url_stored: bool
    message: str


# ---------------------------------------------------------------------------
# Privacy Toggle
# ---------------------------------------------------------------------------

class PrivacyToggleRequest(BaseModel):
    enabled: bool


class PrivacyToggleResponse(BaseModel):
    guest_privacy_mode: bool
