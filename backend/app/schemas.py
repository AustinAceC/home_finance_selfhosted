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
    account_role: Optional[str] = "general"
    low_balance_threshold: Optional[float] = 500.0
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
    account_role: Optional[str] = None  # primary_spend, mortgage, bills_subs, general
    low_balance_threshold: Optional[float] = None
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
# Checking Account Detail & Cashflow Schemas
# ---------------------------------------------------------------------------

class CheckingAccountDetail(BaseModel):
    id: str
    name: str
    custom_name: Optional[str] = None
    institution: str
    account_role: str   # primary_spend, mortgage, bills_subs, general
    current_balance: float
    inflow_30d: float
    outflow_30d: float
    net_cashflow: float
    low_balance_threshold: float
    low_balance_alert: bool
    negative_cashflow_alert: bool
    next_bill_amount: Optional[float] = None
    next_bill_name: Optional[str] = None
    next_bill_date: Optional[datetime] = None
    insufficient_funds_for_bill: bool = False
    warnings: list[str] = []


class BurnRateMetric(BaseModel):
    monthly_outflow: float
    monthly_inflow: float
    daily_burn_rate: float
    burn_rate_pct: float
    safe_daily_spend: float
    status: str       # 'normal', 'warning', 'critical'
    status_message: str
    days_remaining_in_month: int


class DailyCashflowPoint(BaseModel):
    date: str
    inflow: float
    outflow: float
    net: float


class BillCalendarItem(BaseModel):
    id: str
    title: str
    expected_amount: float
    due_date: str
    days_until: int
    frequency: str
    status: str     # 'due_today', 'due_soon', 'upcoming'
    matched_account_id: Optional[str] = None
    is_funded: bool = True


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
    checking_accounts: list[CheckingAccountDetail] = []
    burn_rate: Optional[BurnRateMetric] = None
    cashflow_trend: list[DailyCashflowPoint] = []


# ---------------------------------------------------------------------------
# Webhook / Messaging Schemas
# ---------------------------------------------------------------------------

class TelegramUpdate(BaseModel):
    update_id: int
    message: Optional[dict] = None


class SMSWebhook(BaseModel):
    From: Optional[str] = None
    Body: Optional[str] = None
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
