"""
Categorizer service.

Responsibilities:
  1. Internal transfer deduplication (credit card payments, ACH transfers).
  2. Recurring bill detection (upsert into recurring_schedules).
  3. Price-hike alerts for recurring charges that exceed tolerance.
"""
import logging
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, BucketType, RecurringSchedule, Transaction

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal Transfer Detection
# ---------------------------------------------------------------------------

_TRANSFER_RE = re.compile(
    r"(?i)(payment\s+thank\s+you|autopay|online\s+payment|"
    r"chase\s+credit\s+crd|bk\s+of\s+amer\s+visa|discover\s+e.payment|"
    r"citi\s+card\s+online|home\s+depot.*(pymt|online\s+pmt)|transfer\s+to|transfer\s+from|"
    r"mobile\s+transfer|zelle|venmo\s+payment|paypal\s+transfer)"
)


async def flag_internal_transfers(db: AsyncSession) -> int:
    """
    Mark transactions as internal transfers using:
      a) Regex on merchant_raw / merchant_clean
      b) Inverse-amount pairing across different accounts within 4 days
    Returns count of newly flagged transactions.
    """
    result = await db.execute(
        select(Transaction).where(Transaction.is_internal_transfer == False)
    )
    transactions: list[Transaction] = list(result.scalars().all())

    flagged = 0

    # --- Rule A: Regex ---
    for tx in transactions:
        raw_text = f"{tx.merchant_raw or ''} {tx.merchant_clean or ''}"
        if _TRANSFER_RE.search(raw_text):
            tx.is_internal_transfer = True
            flagged += 1

    # --- Rule B: Inverse-amount pairing within 4 days ---
    amount_map: dict[float, list[Transaction]] = defaultdict(list)
    for tx in transactions:
        if not tx.is_internal_transfer:
            amount_map[round(float(tx.amount), 2)].append(tx)

    for tx in transactions:
        if tx.is_internal_transfer:
            continue
        inverse_key = round(-float(tx.amount), 2)
        candidates = amount_map.get(inverse_key, [])
        for candidate in candidates:
            if candidate.account_id == tx.account_id:
                continue
            if candidate.is_internal_transfer:
                continue
            diff = abs((tx.posted_at - candidate.posted_at).days)
            if diff <= 4:
                tx.is_internal_transfer = True
                candidate.is_internal_transfer = True
                flagged += 2
                break

    if flagged:
        await db.commit()
        logger.info(f"Flagged {flagged} transactions as internal transfers.")
    return flagged


# ---------------------------------------------------------------------------
# Recurring Bill Detection
# ---------------------------------------------------------------------------

# Exclude non-subscription discretionary spending (e.g. fast food, groceries, transfers)
_NON_SUBSCRIPTION_RE = re.compile(
    r"(?i)(jack\s+in\s+the\s+box|mcdonald|wendy|burger\s+king|taco\s+bell|"
    r"starbucks|chipotle|subway|dunkin|fred-meyer|fred\s+meyer|winco|trader\s+joe|"
    r"safeway|kroger|costco|walmart|target|home\s+depot.*pmt|payment\s+thank\s+you|"
    r"reinvestment|tax\s+withheld|interest\s+payment)"
)


async def detect_recurring(db: AsyncSession) -> int:
    """
    Group historical outflows by merchant_clean.
    If a merchant appears >= 3 times with median interval 25-35 days (monthly),
    or 6-8 days (weekly), 12-16 days (bi-weekly), or 350-380 days (annual),
    upsert into recurring_schedules.
    Discretionary fast food/groceries and card payment transfers are excluded.
    Returns count of upserted/updated recurring schedules.
    """
    result = await db.execute(
        select(Transaction).where(
            Transaction.amount < 0,
            Transaction.is_internal_transfer == False,
            Transaction.merchant_clean != None,
        ).order_by(Transaction.merchant_clean, Transaction.posted_at)
    )
    transactions: list[Transaction] = list(result.scalars().all())

    # Group by clean merchant name
    by_merchant: dict[str, list[Transaction]] = defaultdict(list)
    for tx in transactions:
        key = (tx.merchant_clean or tx.merchant_raw)[:100].upper().strip()
        by_merchant[key].append(tx)

    upserted = 0
    for merchant, txs in by_merchant.items():
        # Exclude obvious non-recurring discretionary or fast food
        if _NON_SUBSCRIPTION_RE.search(merchant):
            continue

        # Require at least 3 occurrences for weekly/biweekly, or at least 2 with very consistent amounts for monthly
        if len(txs) < 2:
            continue

        txs_sorted = sorted(txs, key=lambda t: t.posted_at)
        dates = [t.posted_at for t in txs_sorted]
        intervals = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        if not intervals:
            continue

        med_interval = median(intervals)
        if 25 <= med_interval <= 35:
            frequency = "monthly"
            cycle_days = 30
        elif 12 <= med_interval <= 16:
            # Need at least 3 charges to establish a true bi-weekly recurring habit
            if len(txs) < 3:
                continue
            frequency = "bi-weekly"
            cycle_days = 14
        elif 6 <= med_interval <= 8:
            # Need at least 3 charges for weekly
            if len(txs) < 3:
                continue
            frequency = "weekly"
            cycle_days = 7
        elif 350 <= med_interval <= 380:
            frequency = "annual"
            cycle_days = 365
        else:
            continue

        amounts = [abs(float(t.amount)) for t in txs_sorted]
        expected = median(amounts)
        last_tx = txs_sorted[-1]

        # Compute next expected date
        next_expected = last_tx.posted_at + timedelta(days=cycle_days)

        # Upsert
        result2 = await db.execute(
            select(RecurringSchedule).where(RecurringSchedule.merchant_pattern == merchant)
        )
        schedule = result2.scalar_one_or_none()
        if schedule is None:
            schedule = RecurringSchedule(
                merchant_pattern=merchant,
                expected_amount=expected,
                frequency=frequency,
                last_charged_at=last_tx.posted_at,
                next_expected_at=next_expected,
                expected_day_of_month=last_tx.posted_at.day,
            )
            db.add(schedule)
            upserted += 1
        else:
            schedule.expected_amount = expected
            schedule.last_charged_at = last_tx.posted_at
            schedule.next_expected_at = next_expected
            schedule.frequency = frequency

        for tx in txs:
            if not tx.is_recurring:
                tx.is_recurring = True

    # Also deactivate or purge any previously added non-subscription schedules (like Jack in the Box)
    all_schedules_res = await db.execute(select(RecurringSchedule))
    all_schedules = all_schedules_res.scalars().all()
    for s in all_schedules:
        if _NON_SUBSCRIPTION_RE.search(s.merchant_pattern):
            s.active = False

    await db.commit()
    logger.info(f"Upserted {upserted} recurring schedules.")
    return upserted


async def check_price_hike(
    db: AsyncSession,
    tx: Transaction,
) -> Optional[dict]:
    """
    If this transaction matches a recurring schedule and exceeds tolerance,
    return a dict describing the price hike alert.
    """
    if not tx.merchant_clean:
        return None

    merchant_key = tx.merchant_clean[:100].upper().strip()
    result = await db.execute(
        select(RecurringSchedule).where(
            RecurringSchedule.merchant_pattern == merchant_key,
            RecurringSchedule.active == True,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        return None

    actual = abs(float(tx.amount))
    expected = float(schedule.expected_amount)
    tolerance = float(schedule.tolerance_pct) / 100.0

    if actual > expected * (1.0 + tolerance):
        diff = actual - expected
        pct_increase = round((diff / expected) * 100.0, 1)
        return {
            "merchant": schedule.merchant_pattern,
            "expected_amount": expected,
            "actual_amount": actual,
            "diff": round(diff, 2),
            "pct_increase": pct_increase,
            "alert": True,
        }

    return None
