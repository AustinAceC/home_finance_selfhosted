"""
FastAPI entrypoint — all routes, webhooks, and app lifecycle.
"""
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, init_db
from app.models import Account, BucketType, RecurringSchedule, Transaction
from app.schemas import (
    AccountBase,
    AccountUpdate,
    BucketSummary,
    ClaimSimpleFinRequest,
    ClaimSimpleFinResponse,
    MetricsSummary,
    PrivacyToggleRequest,
    PrivacyToggleResponse,
    RecurringScheduleOut,
    SMSWebhook,
    TelegramUpdate,
    TransactionOut,
)
from app.worker import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Finance Roast App backend...")
    await init_db()
    start_scheduler()
    yield
    stop_scheduler()
    logger.info("Backend shutdown complete.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Finance Roast API",
    description="Personal finance tracker + AI roast engine",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Root health check
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    return {"status": "ok", "service": "Finance Roast API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}


# ---------------------------------------------------------------------------
# Setup — SimpleFIN token claim
# ---------------------------------------------------------------------------

@app.post("/api/setup/claim-simplefin", response_model=ClaimSimpleFinResponse)
async def claim_simplefin(body: ClaimSimpleFinRequest, db: AsyncSession = Depends(get_db)):
    """
    Exchange a SimpleFIN setup token for a persistent access URL.
    Call this once after getting your SimpleFIN Bridge setup token.
    """
    from app.services.simplefin import claim_setup_token
    try:
        access_url = await claim_setup_token(db, body.setup_token)
        return ClaimSimpleFinResponse(
            access_url_stored=True,
            message=f"Access URL claimed and stored. SimpleFIN is now configured.",
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------

@app.post("/api/sync/trigger")
async def trigger_sync(db: AsyncSession = Depends(get_db)):
    """Manually trigger a full SimpleFIN sync + roast evaluation pipeline."""
    from app.worker import full_sync_job
    import asyncio
    # Fire-and-forget (non-blocking)
    asyncio.create_task(full_sync_job())
    return {"status": "queued", "message": "Full sync pipeline triggered in background."}


# ---------------------------------------------------------------------------
# Metrics Summary
# ---------------------------------------------------------------------------

@app.get("/api/metrics/summary", response_model=MetricsSummary)
async def get_metrics_summary(db: AsyncSession = Depends(get_db)):
    """
    Returns 4 bucket totals, True Safe-to-Spend, 30-day inflows/outflows,
    and per-account breakdown.
    """
    # Bucket balances
    async def bucket_total(bucket: BucketType) -> float:
        r = await db.execute(
            select(func.sum(Account.current_balance)).where(
                Account.bucket == bucket,
                Account.include_in_cashflow == True,
            )
        )
        return float(r.scalar() or 0)

    day_to_day = await bucket_total(BucketType.day_to_day)
    short_term_debt_raw = await bucket_total(BucketType.short_term_debt)
    savings = await bucket_total(BucketType.savings)
    retirement = await bucket_total(BucketType.retirement)
    short_term_debt = abs(short_term_debt_raw)

    # Upcoming bills in 14 days
    now = datetime.now(timezone.utc)
    r = await db.execute(
        select(func.sum(RecurringSchedule.expected_amount)).where(
            RecurringSchedule.active == True,
            RecurringSchedule.next_expected_at >= now,
            RecurringSchedule.next_expected_at <= now + timedelta(days=14),
        )
    )
    upcoming_14d = float(r.scalar() or 0)
    safe_to_spend = day_to_day - short_term_debt - upcoming_14d

    # 30-day flow
    month_ago = now - timedelta(days=30)
    r = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.amount > 0,
            Transaction.is_internal_transfer == False,
            Transaction.posted_at >= month_ago,
        )
    )
    inflow_30d = float(r.scalar() or 0)

    r = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.amount < 0,
            Transaction.is_internal_transfer == False,
            Transaction.posted_at >= month_ago,
        )
    )
    outflow_30d = abs(float(r.scalar() or 0))

    # Build per-bucket account lists
    buckets: list[BucketSummary] = []
    for bucket in BucketType:
        r = await db.execute(
            select(Account).where(Account.bucket == bucket)
        )
        accounts = list(r.scalars().all())
        total = sum(float(a.current_balance) for a in accounts)
        buckets.append(BucketSummary(
            bucket=bucket,
            total_balance=total,
            account_count=len(accounts),
            accounts=[AccountBase.model_validate(a) for a in accounts],
        ))

    return MetricsSummary(
        day_to_day_balance=day_to_day,
        short_term_debt_balance=short_term_debt,
        savings_balance=savings,
        retirement_balance=retirement,
        true_safe_to_spend=round(safe_to_spend, 2),
        upcoming_bills_14d=round(upcoming_14d, 2),
        inflow_30d=round(inflow_30d, 2),
        outflow_30d=round(outflow_30d, 2),
        buckets=buckets,
    )


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

@app.get("/api/transactions", response_model=list[TransactionOut])
async def list_transactions(
    bucket: Optional[BucketType] = Query(None),
    account_id: Optional[str] = Query(None),
    is_recurring: Optional[bool] = Query(None),
    roast_sent: Optional[bool] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    """Filterable transaction list."""
    q = select(Transaction).join(Account, Transaction.account_id == Account.id)
    if bucket:
        q = q.where(Account.bucket == bucket)
    if account_id:
        q = q.where(Transaction.account_id == account_id)
    if is_recurring is not None:
        q = q.where(Transaction.is_recurring == is_recurring)
    if roast_sent is not None:
        q = q.where(Transaction.roast_sent == roast_sent)

    q = q.order_by(Transaction.posted_at.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    return [TransactionOut.model_validate(t) for t in result.scalars().all()]


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

@app.patch("/api/accounts/{account_id}", response_model=AccountBase)
async def update_account(
    account_id: str,
    body: AccountUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Override bucket, custom_name, or statement_due_day for an account."""
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    if body.bucket is not None:
        account.bucket = body.bucket
        # Auto-update include_in_cashflow based on bucket
        if body.bucket == BucketType.retirement:
            account.include_in_cashflow = False
        elif account.include_in_cashflow is False and body.bucket != BucketType.retirement:
            account.include_in_cashflow = True

    if body.custom_name is not None:
        account.custom_name = body.custom_name
    if body.statement_due_day is not None:
        account.statement_due_day = body.statement_due_day
    if body.include_in_cashflow is not None:
        account.include_in_cashflow = body.include_in_cashflow

    await db.commit()
    await db.refresh(account)
    return AccountBase.model_validate(account)


# ---------------------------------------------------------------------------
# Recurring Bills
# ---------------------------------------------------------------------------

@app.get("/api/recurring", response_model=list[RecurringScheduleOut])
async def list_recurring(db: AsyncSession = Depends(get_db)):
    """List all auto-detected recurring bills and their next expected dates."""
    result = await db.execute(
        select(RecurringSchedule)
        .where(RecurringSchedule.active == True)
        .order_by(RecurringSchedule.next_expected_at)
    )
    return [RecurringScheduleOut.model_validate(r) for r in result.scalars().all()]


# ---------------------------------------------------------------------------
# Webhooks — Telegram (Two-Way)
# ---------------------------------------------------------------------------

@app.post("/api/webhooks/telegram")
async def telegram_webhook(update: TelegramUpdate, db: AsyncSession = Depends(get_db)):
    """
    Inbound Telegram webhook. Processes user replies as excuses for recent roasts.
    """
    message = update.message or {}
    text = message.get("text", "").strip()
    if not text:
        return {"ok": True}

    logger.info(f"Telegram inbound: {text[:80]}")

    from app.services.roast_engine import process_excuse
    from app.services.notifier import send_telegram

    comeback = await process_excuse(db, text)
    if comeback:
        await send_telegram(comeback)

    return {"ok": True}


# ---------------------------------------------------------------------------
# Webhooks — SMS (Twilio / Telnyx)
# ---------------------------------------------------------------------------

@app.post("/api/webhooks/sms")
async def sms_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Inbound SMS webhook (Twilio/Telnyx form-encoded body).
    Processes user replies as excuses for recent roasts.
    """
    form = await request.form()
    body_text = str(form.get("Body", "")).strip()

    if not body_text:
        return {"ok": True}

    logger.info(f"SMS inbound: {body_text[:80]}")

    from app.services.roast_engine import process_excuse
    from app.services.notifier import notify

    comeback = await process_excuse(db, body_text)
    if comeback:
        await notify(comeback)

    return {"ok": True}


# ---------------------------------------------------------------------------
# Settings — Privacy Toggle
# ---------------------------------------------------------------------------

@app.post("/api/settings/privacy", response_model=PrivacyToggleResponse)
async def toggle_privacy(body: PrivacyToggleRequest, db: AsyncSession = Depends(get_db)):
    """
    Toggle guest privacy mode.
    When enabled, Shield TV and /tv-kiosk show percentages instead of raw dollar amounts.
    Can be called by Home Assistant when guests arrive.
    """
    from app.services.simplefin import set_state
    await set_state(db, "guest_privacy_mode", {"enabled": body.enabled})
    return PrivacyToggleResponse(guest_privacy_mode=body.enabled)


@app.get("/api/settings/privacy", response_model=PrivacyToggleResponse)
async def get_privacy(db: AsyncSession = Depends(get_db)):
    from app.services.simplefin import get_state
    state = await get_state(db, "guest_privacy_mode")
    enabled = state.get("enabled", False) if state else False
    return PrivacyToggleResponse(guest_privacy_mode=enabled)
