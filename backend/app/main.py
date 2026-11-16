"""
FastAPI entrypoint — all routes, webhooks, and app lifecycle.
"""
import calendar
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
    BillCalendarItem,
    BucketSummary,
    BurnRateMetric,
    CheckingAccountDetail,
    ClaimSimpleFinRequest,
    ClaimSimpleFinResponse,
    DailyCashflowPoint,
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
    version="1.1.0",
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
    return {"status": "ok", "service": "Finance Roast API", "version": "1.1.0"}

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
            message="Access URL claimed and stored. SimpleFIN is now configured.",
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
    asyncio.create_task(full_sync_job())
    return {"status": "queued", "message": "Full sync pipeline triggered in background."}


# ---------------------------------------------------------------------------
# Metrics Summary
# ---------------------------------------------------------------------------

@app.get("/api/metrics/summary", response_model=MetricsSummary)
async def get_metrics_summary(db: AsyncSession = Depends(get_db)):
    """
    Returns 4 bucket totals, True Safe-to-Spend, 30-day inflows/outflows,
    individual checking cashflow tracking, burn rate, and trend graphs.
    """
    now = datetime.now(timezone.utc)
    month_ago = now - timedelta(days=30)

    # 1. Bucket totals (all accounts in bucket)
    async def bucket_total(bucket: BucketType) -> float:
        r = await db.execute(
            select(func.sum(Account.current_balance)).where(Account.bucket == bucket)
        )
        return float(r.scalar() or 0)

    # For day_to_day cashflow calculation, sum accounts with include_in_cashflow == True
    r_day = await db.execute(
        select(func.sum(Account.current_balance)).where(
            Account.bucket == BucketType.day_to_day,
            Account.include_in_cashflow == True,
        )
    )
    day_to_day = float(r_day.scalar() or 0)
    short_term_debt = abs(await bucket_total(BucketType.short_term_debt))
    savings = await bucket_total(BucketType.savings)
    retirement = await bucket_total(BucketType.retirement)

    # 2. Upcoming bills in 14 days
    r_bills = await db.execute(
        select(func.sum(RecurringSchedule.expected_amount)).where(
            RecurringSchedule.active == True,
            RecurringSchedule.next_expected_at >= now,
            RecurringSchedule.next_expected_at <= now + timedelta(days=14),
        )
    )
    upcoming_14d = float(r_bills.scalar() or 0)
    safe_to_spend = day_to_day - short_term_debt - upcoming_14d

    # 3. Overall 30-day inflow / outflow
    r_in = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.amount > 0,
            Transaction.is_internal_transfer == False,
            Transaction.posted_at >= month_ago,
        )
    )
    inflow_30d = float(r_in.scalar() or 0)

    r_out = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.amount < 0,
            Transaction.is_internal_transfer == False,
            Transaction.posted_at >= month_ago,
        )
    )
    outflow_30d = abs(float(r_out.scalar() or 0))

    # 4. Build per-bucket account lists
    buckets: list[BucketSummary] = []
    for bucket in BucketType:
        r = await db.execute(select(Account).where(Account.bucket == bucket))
        accounts = list(r.scalars().all())
        total = sum(float(a.current_balance) for a in accounts)
        buckets.append(BucketSummary(
            bucket=bucket,
            total_balance=round(total, 2),
            account_count=len(accounts),
            accounts=[AccountBase.model_validate(a) for a in accounts],
        ))

    # 5. Dedicated Checking Accounts Breakdown & Cashflow
    checking_q = await db.execute(
        select(Account).where(Account.bucket == BucketType.day_to_day)
        .order_by(Account.current_balance.desc())
    )
    checking_accounts_db = checking_q.scalars().all()

    # Get active recurring schedules for upcoming bill matching
    rec_q = await db.execute(
        select(RecurringSchedule).where(RecurringSchedule.active == True)
        .order_by(RecurringSchedule.next_expected_at.asc())
    )
    all_recurring = rec_q.scalars().all()

    checking_details: list[CheckingAccountDetail] = []
    for acct in checking_accounts_db:
        # Inflow / Outflow last 30 days for this account
        in_r = await db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.account_id == acct.id,
                Transaction.amount > 0,
                Transaction.is_internal_transfer == False,
                Transaction.posted_at >= month_ago,
            )
        )
        acct_inflow = float(in_r.scalar() or 0)

        out_r = await db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.account_id == acct.id,
                Transaction.amount < 0,
                Transaction.is_internal_transfer == False,
                Transaction.posted_at >= month_ago,
            )
        )
        acct_outflow = abs(float(out_r.scalar() or 0))
        net_cf = acct_inflow - acct_outflow

        threshold = float(acct.low_balance_threshold or 500.0)
        curr_bal = float(acct.current_balance or 0.0)

        warnings: list[str] = []
        low_alert = curr_bal < threshold
        if low_alert:
            warnings.append(f"Low balance alert: ${curr_bal:,.2f} is below ${threshold:,.2f} threshold")

        neg_alert = net_cf < 0
        if neg_alert:
            warnings.append(f"Negative 30-day cashflow: -${abs(net_cf):,.2f}")

        # Check next bill
        next_bill_amt: Optional[float] = None
        next_bill_name: Optional[str] = None
        next_bill_dt: Optional[datetime] = None
        insufficient_bill = False

        if all_recurring:
            earliest = all_recurring[0]
            next_bill_amt = float(earliest.expected_amount)
            next_bill_name = earliest.merchant_pattern
            next_bill_dt = earliest.next_expected_at
            if curr_bal < next_bill_amt:
                insufficient_bill = True
                warnings.append(f"Next bill {next_bill_name} (${next_bill_amt:,.2f}) exceeds balance")

        checking_details.append(CheckingAccountDetail(
            id=acct.id,
            name=acct.name,
            custom_name=acct.custom_name,
            institution=acct.institution,
            account_role=acct.account_role or "general",
            current_balance=round(curr_bal, 2),
            inflow_30d=round(acct_inflow, 2),
            outflow_30d=round(acct_outflow, 2),
            net_cashflow=round(net_cf, 2),
            low_balance_threshold=round(threshold, 2),
            low_balance_alert=low_alert,
            negative_cashflow_alert=neg_alert,
            next_bill_amount=round(next_bill_amt, 2) if next_bill_amt else None,
            next_bill_name=next_bill_name,
            next_bill_date=next_bill_dt,
            insufficient_funds_for_bill=insufficient_bill,
            warnings=warnings,
        ))

    # 6. Burn Rate Metric
    _, last_day = calendar.monthrange(now.year, now.month)
    days_left = max(last_day - now.day, 1)

    daily_burn = round(outflow_30d / 30.0, 2)
    burn_pct = round((outflow_30d / max(inflow_30d, 1.0)) * 100.0, 1)
    safe_daily = round(safe_to_spend / days_left, 2)

    if burn_pct > 100 or safe_to_spend < 0:
        burn_status = "critical"
        status_msg = f"Deficit Alert: Spending at {burn_pct}% of income! Safe-to-Spend is depleted."
    elif burn_pct > 80:
        burn_status = "warning"
        status_msg = f"Elevated Burn: {burn_pct}% of 30-day income burned. Keep daily spend under ${max(safe_daily, 0):,.2f}."
    else:
        burn_status = "normal"
        status_msg = f"Healthy Pace: {burn_pct}% burn rate. Target daily pace is ${max(safe_daily, 0):,.2f}."

    burn_metric = BurnRateMetric(
        monthly_outflow=round(outflow_30d, 2),
        monthly_inflow=round(inflow_30d, 2),
        daily_burn_rate=daily_burn,
        burn_rate_pct=burn_pct,
        safe_daily_spend=max(safe_daily, 0.0),
        status=burn_status,
        status_message=status_msg,
        days_remaining_in_month=days_left,
    )

    # 7. Cashflow Trend (last 14 days)
    cashflow_trend: list[DailyCashflowPoint] = []
    for i in range(13, -1, -1):
        day_date = (now - timedelta(days=i)).date()
        day_start = datetime(day_date.year, day_date.month, day_date.day, 0, 0, 0, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)

        d_in = await db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.amount > 0,
                Transaction.is_internal_transfer == False,
                Transaction.posted_at >= day_start,
                Transaction.posted_at < day_end,
            )
        )
        d_out = await db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.amount < 0,
                Transaction.is_internal_transfer == False,
                Transaction.posted_at >= day_start,
                Transaction.posted_at < day_end,
            )
        )
        din_val = float(d_in.scalar() or 0)
        dout_val = abs(float(d_out.scalar() or 0))
        cashflow_trend.append(DailyCashflowPoint(
            date=day_date.strftime("%b %d"),
            inflow=round(din_val, 2),
            outflow=round(dout_val, 2),
            net=round(din_val - dout_val, 2),
        ))

    return MetricsSummary(
        day_to_day_balance=round(day_to_day, 2),
        short_term_debt_balance=round(short_term_debt, 2),
        savings_balance=round(savings, 2),
        retirement_balance=round(retirement, 2),
        true_safe_to_spend=round(safe_to_spend, 2),
        upcoming_bills_14d=round(upcoming_14d, 2),
        inflow_30d=round(inflow_30d, 2),
        outflow_30d=round(outflow_30d, 2),
        buckets=buckets,
        checking_accounts=checking_details,
        burn_rate=burn_metric,
        cashflow_trend=cashflow_trend,
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
# Accounts Management
# ---------------------------------------------------------------------------

@app.patch("/api/accounts/{account_id}", response_model=AccountBase)
async def update_account(
    account_id: str,
    body: AccountUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Override bucket, custom_name, account_role, statement_due_day, or alert threshold."""
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    if body.bucket is not None:
        account.bucket = body.bucket
        if body.bucket == BucketType.retirement:
            account.include_in_cashflow = False
        elif account.include_in_cashflow is False and body.bucket != BucketType.retirement:
            account.include_in_cashflow = True

    if body.custom_name is not None:
        account.custom_name = body.custom_name
    if body.account_role is not None:
        account.account_role = body.account_role
    if body.low_balance_threshold is not None:
        account.low_balance_threshold = body.low_balance_threshold
    if body.statement_due_day is not None:
        account.statement_due_day = body.statement_due_day
    if body.include_in_cashflow is not None:
        account.include_in_cashflow = body.include_in_cashflow

    await db.commit()
    await db.refresh(account)
    return AccountBase.model_validate(account)


# ---------------------------------------------------------------------------
# Recurring Bills & Calendar
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


@app.get("/api/calendar/bills", response_model=list[BillCalendarItem])
async def get_calendar_bills(db: AsyncSession = Depends(get_db)):
    """
    Returns upcoming recurring bills and credit card payments
    projected across the current and upcoming 45 days.
    """
    now = datetime.now(timezone.utc)
    items: list[BillCalendarItem] = []

    # 1. Recurring schedules
    rec_r = await db.execute(
        select(RecurringSchedule).where(RecurringSchedule.active == True)
    )
    schedules = rec_r.scalars().all()
    for s in schedules:
        target_dt = s.next_expected_at or (now + timedelta(days=s.expected_day_of_month or 15))
        diff_days = (target_dt.date() - now.date()).days
        if diff_days < 0:
            diff_days += 30
            target_dt = target_dt + timedelta(days=30)
            
        status = "due_today" if diff_days == 0 else ("due_soon" if diff_days <= 3 else "upcoming")
        items.append(BillCalendarItem(
            id=f"rec-{s.id}",
            title=s.merchant_pattern,
            expected_amount=round(float(s.expected_amount), 2),
            due_date=target_dt.strftime("%Y-%m-%d"),
            days_until=diff_days,
            frequency=s.frequency,
            status=status,
            is_funded=True,
        ))

    # 2. Credit cards due dates
    cc_r = await db.execute(
        select(Account).where(
            Account.bucket == BucketType.short_term_debt,
            Account.statement_due_day != None
        )
    )
    cards = cc_r.scalars().all()
    for card in cards:
        day = card.statement_due_day
        if not day:
            continue
        try:
            due_date = now.replace(day=min(day, 28))
            if due_date.date() < now.date():
                due_date = (due_date + timedelta(days=32)).replace(day=min(day, 28))
            diff_days = (due_date.date() - now.date()).days
            status = "due_today" if diff_days == 0 else ("due_soon" if diff_days <= 3 else "upcoming")
            items.append(BillCalendarItem(
                id=f"card-{card.id}",
                title=f"{card.display_name} Payment",
                expected_amount=round(abs(float(card.current_balance)), 2),
                due_date=due_date.strftime("%Y-%m-%d"),
                days_until=diff_days,
                frequency="monthly",
                status=status,
                is_funded=True,
            ))
        except Exception:
            pass

    items.sort(key=lambda x: x.days_until)
    return items


# ---------------------------------------------------------------------------
# Webhooks — Telegram (Two-Way)
# ---------------------------------------------------------------------------

@app.post("/api/webhooks/telegram")
async def telegram_webhook(update: TelegramUpdate, db: AsyncSession = Depends(get_db)):
    """Inbound Telegram webhook. Processes user replies as excuses for recent roasts."""
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
    """Inbound SMS webhook (Twilio/Telnyx form-encoded body)."""
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
    from app.services.simplefin import set_state
    await set_state(db, "guest_privacy_mode", {"enabled": body.enabled})
    return PrivacyToggleResponse(guest_privacy_mode=body.enabled)


@app.get("/api/settings/privacy", response_model=PrivacyToggleResponse)
async def get_privacy(db: AsyncSession = Depends(get_db)):
    from app.services.simplefin import get_state
    state = await get_state(db, "guest_privacy_mode")
    enabled = state.get("enabled", False) if state else False
    return PrivacyToggleResponse(guest_privacy_mode=enabled)
