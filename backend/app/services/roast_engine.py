"""
Roast Engine — heuristic scoring + LLM roast generation.

Flow:
  1. evaluate_transactions() runs all heuristic rules and assigns roast_score.
  2. For any tx with roast_score >= 50, call generate_roast() via LLM.
  3. The roast message is stored back in the transaction and queued for delivery.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import pytz
from openai import AsyncOpenAI
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Account, BucketType, Transaction

logger = logging.getLogger(__name__)

ROAST_THRESHOLD = 50

SYSTEM_PROMPT = (
    "You are an unhinged, foul-mouthed, ruthlessly observant financial parole officer. "
    "Your job is to text the user about their latest stupid purchase. "
    "Keep it under 280 characters (2-3 punchy sentences). "
    "Explicitly name the dollar amount, the merchant, and the card used. "
    "Use their actual stats (like how many trips they've made this month or their total "
    "short-term card debt) to roast them. "
    "Always end by asking why tf they bought it or demanding an excuse to categorize it."
)

EXCUSE_SYSTEM_PROMPT = (
    "You are a financial accountability bot processing a user's excuse for a purchase. "
    "Return ONLY valid JSON with keys: "
    "\"assigned_category\" (one of: Home Improvement, Dining, Hobbies, Groceries, Auto, Bullshit Impulse), "
    "\"justification_note\" (cleaned summary of the excuse, max 100 chars), "
    "\"snarky_comeback\" (1-sentence parting shot, max 150 chars). "
    "No markdown, no code fences — raw JSON only."
)


# ---------------------------------------------------------------------------
# LLM Client
# ---------------------------------------------------------------------------

def _get_llm_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
    )


# ---------------------------------------------------------------------------
# Heuristic Scoring
# ---------------------------------------------------------------------------

async def _get_safe_to_spend(db: AsyncSession) -> float:
    """Compute the True Safe-to-Spend metric."""
    from sqlalchemy import select as sa_select
    from app.models import RecurringSchedule

    # Sum day_to_day balances
    result = await db.execute(
        select(func.sum(Account.current_balance)).where(
            Account.bucket == BucketType.day_to_day,
            Account.include_in_cashflow == True,
        )
    )
    day_to_day = float(result.scalar() or 0)

    # Sum absolute short_term_debt balances
    result = await db.execute(
        select(func.sum(Account.current_balance)).where(
            Account.bucket == BucketType.short_term_debt,
            Account.include_in_cashflow == True,
        )
    )
    debt_total = abs(float(result.scalar() or 0))

    # Upcoming bills in next 14 days
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(func.sum(RecurringSchedule.expected_amount)).where(
            RecurringSchedule.active == True,
            RecurringSchedule.next_expected_at >= now,
            RecurringSchedule.next_expected_at <= now + timedelta(days=14),
        )
    )
    upcoming = float(result.scalar() or 0)

    return day_to_day - debt_total - upcoming


async def _merchant_visits_last_n_days(
    db: AsyncSession, merchant_clean: str, days: int
) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.merchant_clean == merchant_clean,
            Transaction.posted_at >= cutoff,
            Transaction.is_internal_transfer == False,
        )
    )
    return int(result.scalar() or 0)


async def _category_spend_mtd(db: AsyncSession, account_id: str) -> float:
    """Total outflow from the same account this calendar month."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    result = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.account_id == account_id,
            Transaction.amount < 0,
            Transaction.is_internal_transfer == False,
            Transaction.posted_at >= month_start,
        )
    )
    return abs(float(result.scalar() or 0))


async def _total_short_term_debt(db: AsyncSession) -> float:
    result = await db.execute(
        select(func.sum(Account.current_balance)).where(
            Account.bucket == BucketType.short_term_debt,
        )
    )
    return abs(float(result.scalar() or 0))


async def score_transaction(db: AsyncSession, tx: Transaction, account: Account) -> int:
    """
    Apply all heuristic rules and return a roast_score integer.
    Only called for outflows on spending buckets.
    """
    score = 0
    triggers: list[str] = []
    amount = abs(float(tx.amount))
    merchant = (tx.merchant_clean or tx.merchant_raw).upper()
    local_tz = pytz.timezone(settings.TIMEZONE)
    local_time = tx.posted_at.astimezone(local_tz)

    # --- Rule 1: Merchant Velocity (>= 3 visits in rolling 7 days) ---
    if tx.merchant_clean:
        visits_7d = await _merchant_visits_last_n_days(db, tx.merchant_clean, 7)
        if visits_7d >= 3:
            score += 50
            triggers.append("Merchant Velocity")

    # --- Rule 2: Home Depot Project Creep ---
    hd_30d_result = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.merchant_clean.ilike("%home depot%"),
            Transaction.amount < 0,
            Transaction.is_internal_transfer == False,
            Transaction.posted_at >= datetime.now(timezone.utc) - timedelta(days=30),
        )
    )
    hd_30d_spend = abs(float(hd_30d_result.scalar() or 0))
    if ("HOME DEPOT" in merchant or account.name.upper().find("HOME DEPOT") != -1) and hd_30d_spend > 150:
        score += 60
        triggers.append("Home Depot Project Creep")

    # --- Rule 3: Debt-Float Violation ---
    total_debt = await _total_short_term_debt(db)
    safe_to_spend = await _get_safe_to_spend(db)
    if amount > 40 and (total_debt > settings.DEBT_ALERT_THRESHOLD or safe_to_spend < settings.SAFE_TO_SPEND_ALERT_THRESHOLD):
        score += 50
        triggers.append("Debt-Float Violation")

    # --- Rule 4: Late-Night / Weekend Impulse ---
    hour = local_time.hour
    is_late_night = hour >= 22 or hour < 4
    if is_late_night and amount > 35:
        score += 40
        triggers.append("Late-Night Impulse")

    # --- Rule 5: Blacklist Merchant ---
    blacklist = settings.get_blacklist()
    if any(kw in merchant for kw in blacklist):
        score += 100
        triggers.append("Blacklist Merchant")

    # Store triggers in a temporary attribute for the roast generator
    tx._roast_triggers = triggers  # type: ignore[attr-defined]
    return score


async def evaluate_transactions(db: AsyncSession) -> list[Transaction]:
    """
    Score all un-roasted outflow transactions in spending buckets.
    Returns list of transactions that crossed the roast threshold.
    """
    result = await db.execute(
        select(Transaction, Account)
        .join(Account, Transaction.account_id == Account.id)
        .where(
            Transaction.amount < 0,
            Transaction.is_internal_transfer == False,
            Transaction.roast_sent == False,
            Account.bucket.in_([BucketType.day_to_day, BucketType.short_term_debt]),
        )
    )
    rows = result.all()

    to_roast: list[Transaction] = []
    for tx, account in rows:
        score = await score_transaction(db, tx, account)
        tx.roast_score = score
        if score >= ROAST_THRESHOLD:
            to_roast.append(tx)

    await db.commit()
    return to_roast


# ---------------------------------------------------------------------------
# LLM Roast Generator
# ---------------------------------------------------------------------------

async def generate_roast(db: AsyncSession, tx: Transaction) -> Optional[str]:
    """
    Build the context payload and call the LLM to generate a roast message.
    Stores the result in tx.roast_message.
    """
    result = await db.execute(select(Account).where(Account.id == tx.account_id))
    account = result.scalar_one_or_none()
    if not account:
        return None

    visits_30d = await _merchant_visits_last_n_days(db, tx.merchant_clean or tx.merchant_raw, 30)
    spend_mtd = await _category_spend_mtd(db, tx.account_id)
    total_debt = await _total_short_term_debt(db)
    safe = await _get_safe_to_spend(db)

    user_prompt = (
        f"Roast this user who spent ${abs(float(tx.amount)):.2f} at {tx.merchant_clean or tx.merchant_raw} "
        f"using their {account.display_name} card. "
        f"Context: {visits_30d} visits to this merchant in 30 days, total short-term credit card debt is ${total_debt:,.2f}, "
        f"safe-to-spend is ${safe:,.2f}. Demand an excuse to categorize it."
    )

    client = _get_llm_client()
    try:
        response = await client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=800,
            temperature=0.9,
        )
        roast = response.choices[0].message.content or ""
        tx.roast_message = roast[:1000]
        logger.info(f"Generated roast for tx {tx.id}: {roast[:80]}...")
        return roast
    except Exception as e:
        logger.error(f"LLM roast generation failed for tx {tx.id}: {e}")
        return None


# ---------------------------------------------------------------------------
# Two-Way Excuse Handler
# ---------------------------------------------------------------------------

async def process_excuse(db: AsyncSession, user_reply: str) -> Optional[str]:
    """
    Find the latest roasted-but-unjustified transaction,
    send the excuse to LLM for structured output,
    update the transaction, and return the snarky comeback.
    """
    result = await db.execute(
        select(Transaction)
        .where(
            Transaction.roast_sent == True,
            Transaction.user_justification == None,
        )
        .order_by(Transaction.created_at.desc())
        .limit(1)
    )
    tx = result.scalar_one_or_none()
    if not tx:
        return "I don't have any recent purchases waiting for your excuse. Nice try."

    client = _get_llm_client()
    prompt = (
        f"The user was roasted for this transaction: {tx.merchant_raw} ${abs(float(tx.amount)):.2f}. "
        f"Their excuse: \"{user_reply}\". "
        "Return JSON with assigned_category, justification_note, and snarky_comeback."
    )

    try:
        response = await client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": EXCUSE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=800,
            temperature=0.7,
        )
        raw = response.choices[0].message.content or "{}"
        data = json.loads(raw)

        tx.category = data.get("assigned_category", "Uncategorized")
        tx.user_justification = data.get("justification_note", user_reply[:200])
        comeback = data.get("snarky_comeback", "Fine. I'll allow it. For now.")
        await db.commit()
        return comeback
    except Exception as e:
        logger.error(f"Excuse processing failed: {e}")
        tx.user_justification = user_reply[:200]
        await db.commit()
        return "I couldn't process your excuse properly, but I saved your rambling."
