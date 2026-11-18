"""
Roast Engine — heuristic scoring + LLM roast generation.

Flow:
  1. evaluate_transactions() runs all heuristic rules and assigns roast_score.
  2. For any tx with roast_score >= 60, call generate_roast() via LLM.
  3. The roast message is stored back in the transaction and queued for delivery.
"""
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import pytz
from openai import AsyncOpenAI
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Account, BucketType, Transaction

logger = logging.getLogger(__name__)

ROAST_THRESHOLD = 60

# Non-roastable essential merchants / transactions
_ESSENTIAL_OR_UTILITY_RE = re.compile(
    r"(?i)(puget\s+sound\s+ener|pse\b|electric|water|utility|utilities|"
    r"movement\s+mtg|mortgage|escrow|insurance|geico|state\s+farm|allstate|"
    r"kaiser|regence|cigna|doctor|dental|clinic|hospital|pharmacy|walgreens|cvs|"
    r"safeway|winco|fred\s+meyer|trader\s+joe|costco|kroger|wal-mart|walmart|"
    r"target|grocery|supermarket|market\b|tax\s+withheld|internal\s+transfer)"
)

SYSTEM_PROMPT = (
    "You are Marcus, an unhinged, creative, laugh-out-loud funny African American personal financial planner. "
    "You possess the electric delivery of Shannon Sharpe, the colorful comedic rage of Bernie Mac, and the cold reality-check wisdom of Samuel L. Jackson. "
    "CRITICAL RULES FOR ROASTING:\n"
    "1. Do NOT repeat formulaic catchphrases. Avoid starting every sentence with 'Hold up' or 'My brother in Christ'. Mix up your intros! Use wild, creative, and completely unhinged analogies (e.g. 'You out here swiping cards like you won the Powerball in your dreams', 'Did your brain take an unpaid personal day?', 'Who authorized this foolishness?!').\n"
    "2. Explicitly cite the exact dollar amount and the merchant name.\n"
    "3. Directly roast the specific absurdity of the item/merchant vs their financial situation.\n"
    "4. Keep it strictly between 2 to 3 rhythmic, punchy, hilarious sentences (under 320 characters) so it sounds natural, energetic, and explosive when read aloud over audio.\n"
    "5. Always close with a funny, aggressive demand for an excuse so you can figure out what they were thinking."
)

EXCUSE_SYSTEM_PROMPT = (
    "You are Marcus, an unhinged, hilarious African American personal financial planner reviewing a user's excuse for a purchase. "
    "Evaluate their excuse and deliver a sharp, creative, funny comeback in your signature comedic voice. "
    "Return ONLY valid JSON with keys: "
    "\"assigned_category\" (one of: Home Improvement, Dining, Hobbies, Groceries, Auto, Bullshit Impulse), "
    "\"justification_note\" (cleaned summary of the excuse, max 100 chars), "
    "\"snarky_comeback\" (1 punchy, funny sentence parting shot in Marcus's authentic voice, max 150 chars). "
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
    from app.models import RecurringSchedule

    result = await db.execute(
        select(func.sum(Account.current_balance)).where(
            Account.bucket == BucketType.day_to_day,
            Account.include_in_cashflow == True,
        )
    )
    day_to_day = float(result.scalar() or 0)

    result = await db.execute(
        select(func.sum(Account.current_balance)).where(
            Account.bucket == BucketType.short_term_debt,
            Account.include_in_cashflow == True,
        )
    )
    debt_total = abs(float(result.scalar() or 0))

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


async def _total_short_term_debt(db: AsyncSession) -> float:
    result = await db.execute(
        select(func.sum(Account.current_balance)).where(
            Account.bucket == BucketType.short_term_debt,
        )
    )
    return abs(float(result.scalar() or 0))


async def score_transaction(db: AsyncSession, tx: Transaction, account: Account) -> int:
    """
    Apply heuristic rules and return a roast_score integer.
    Utilities, groceries, medical, and essentials are explicitly protected (score = 0).
    """
    merchant = (tx.merchant_clean or tx.merchant_raw or "").strip().upper()
    amount = abs(float(tx.amount))

    # Protect essentials from ever being roasted
    if _ESSENTIAL_OR_UTILITY_RE.search(merchant):
        return 0

    score = 0
    triggers: list[str] = []
    local_tz = pytz.timezone(settings.TIMEZONE)
    local_time = tx.posted_at.astimezone(local_tz)

    # --- Rule 1: High Velocity Habit (>= 3 visits in rolling 7 days to same discretionary spot) ---
    if tx.merchant_clean:
        visits_7d = await _merchant_visits_last_n_days(db, tx.merchant_clean, 7)
        if visits_7d >= 3:
            score += 50
            triggers.append("Discretionary Habit Velocity")

    # --- Rule 2: Home Depot Project Creep (Only if non-essential runaway spending) ---
    if "HOME DEPOT" in merchant:
        hd_30d_result = await db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.merchant_clean.ilike("%home depot%"),
                Transaction.amount < 0,
                Transaction.is_internal_transfer == False,
                Transaction.posted_at >= datetime.now(timezone.utc) - timedelta(days=30),
            )
        )
        hd_30d_spend = abs(float(hd_30d_result.scalar() or 0))
        if hd_30d_spend > 350 and amount > 50:
            score += 65
            triggers.append("Home Depot Runaway Project")

    # --- Rule 3: Debt-Float Violation on Pure Discretionary Luxury/Dining ---
    # Only applies to discretionary purchases over $65 when carrying heavy credit debt
    total_debt = await _total_short_term_debt(db)
    safe_to_spend = await _get_safe_to_spend(db)
    if amount > 65 and (total_debt > settings.DEBT_ALERT_THRESHOLD or safe_to_spend < settings.SAFE_TO_SPEND_ALERT_THRESHOLD):
        score += 45
        triggers.append("Debt-Float Discretionary Spend")

    # --- Rule 4: Late-Night Impulse (Bars, Late Delivery, Night Shopping) ---
    hour = local_time.hour
    is_late_night = hour >= 23 or hour < 4
    if is_late_night and amount > 45:
        score += 40
        triggers.append("Late-Night Impulse")

    # --- Rule 5: Blacklist Discretionary Merchants (Gambling, OnlyFans, Video Game MTX) ---
    blacklist = settings.get_blacklist()
    if any(kw in merchant for kw in blacklist):
        score += 100
        triggers.append("Blacklist Merchant")

    tx._roast_triggers = triggers  # type: ignore[attr-defined]
    return score


async def evaluate_transactions(db: AsyncSession) -> list[Transaction]:
    """
    Score un-roasted outflow transactions in spending buckets.
    Only evaluates transactions posted within the last 5 days so old transactions are never re-roasted.
    """
    five_days_ago = datetime.now(timezone.utc) - timedelta(days=5)

    result = await db.execute(
        select(Transaction, Account)
        .join(Account, Transaction.account_id == Account.id)
        .where(
            Transaction.amount < 0,
            Transaction.is_internal_transfer == False,
            Transaction.roast_sent == False,
            Transaction.posted_at >= five_days_ago,
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
    Build the context payload and call the LLM to generate a punchy, creative roast message.
    """
    result = await db.execute(select(Account).where(Account.id == tx.account_id))
    account = result.scalar_one_or_none()
    if not account:
        return None

    visits_30d = await _merchant_visits_last_n_days(db, tx.merchant_clean or tx.merchant_raw, 30)
    total_debt = await _total_short_term_debt(db)
    safe = await _get_safe_to_spend(db)

    user_prompt = (
        f"Roast this purchase right now: The user spent ${abs(float(tx.amount)):.2f} at '{tx.merchant_clean or tx.merchant_raw}' "
        f"using their {account.display_name} card. "
        f"User Financial Stats: {visits_30d} visits here in 30 days, current credit card debt is ${total_debt:,.2f}, "
        f"true liquid safe-to-spend is ${safe:,.2f}. "
        f"Make this comedic, unpredictable, and savage without using canned cliché openings. Demand their excuse."
    )

    client = _get_llm_client()
    try:
        response = await client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=400,
            temperature=0.95,
        )
        roast = (response.choices[0].message.content or "").strip()
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
        return "I don't have any recent purchases waiting on an excuse from you right now. You're off the hook for this second."

    client = _get_llm_client()
    prompt = (
        f"The user was roasted for spending ${abs(float(tx.amount)):.2f} at {tx.merchant_raw}. "
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
            max_tokens=300,
            temperature=0.8,
        )
        raw_json = response.choices[0].message.content or "{}"
        if "```" in raw_json:
            raw_json = raw_json.split("```")[1]
            if raw_json.startswith("json"):
                raw_json = raw_json[4:]

        data = json.loads(raw_json.strip())
        tx.category = data.get("assigned_category", tx.category)
        tx.user_justification = data.get("justification_note", user_reply[:100])
        await db.commit()
        return data.get("snarky_comeback", "Alright, I logged that. Don't let me catch you slipping again.")
    except Exception as e:
        logger.error(f"Failed to process excuse via LLM: {e}")
        tx.user_justification = user_reply[:100]
        await db.commit()
        return "Excuse noted, but you're on thin ice."
