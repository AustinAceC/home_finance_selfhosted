"""
APScheduler background worker.

Jobs:
  - full_sync_job: Runs every SYNC_INTERVAL_HOURS (default 4h).
    Calls SimpleFIN sync → categorizer → roast engine → notifier → Shield TV.

The scheduler is started/stopped via the FastAPI lifespan in main.py.
"""
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import func, select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Account, BucketType, RecurringSchedule, Transaction

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone=settings.TIMEZONE)


async def full_sync_job() -> None:
    """
    Master sync pipeline:
      1. SimpleFIN poll
      2. Internal transfer dedup
      3. Recurring detection
      4. Roast evaluation
      5. Notifications + Shield TV
    """
    logger.info(f"[{datetime.now(timezone.utc).isoformat()}] Starting full sync pipeline...")

    async with AsyncSessionLocal() as db:
        try:
            # --- Step 1: SimpleFIN sync ---
            from app.services.simplefin import sync_accounts
            sync_result = await sync_accounts(db)
            logger.info(f"Sync result: {sync_result}")

            # --- Step 2: Dedup internal transfers ---
            from app.services.categorizer import flag_internal_transfers, detect_recurring
            flagged = await flag_internal_transfers(db)
            logger.info(f"Flagged {flagged} internal transfers.")

            # --- Step 3: Detect recurring ---
            upserted = await detect_recurring(db)
            logger.info(f"Upserted {upserted} recurring schedules.")

            # --- Step 4: Roast evaluation ---
            from app.services.roast_engine import evaluate_transactions, generate_roast
            to_roast = await evaluate_transactions(db)
            logger.info(f"{len(to_roast)} transactions crossed the roast threshold.")

            # --- Step 5: Generate roasts + notify ---
            from app.services.notifier import notify, send_roast
            from app.services.shield_tv import push_hud_overlay, push_roast_overlay, send_live_toast

            latest_roast_message: str | None = None
            for tx in to_roast:
                roast = await generate_roast(db, tx)
                if roast:
                    tx.roast_sent = True
                    latest_roast_message = roast
                    await db.commit()
                    await send_roast(tx.id, roast)

                    # Live Shield TV toast for high-scorers
                    if tx.roast_score >= 80:
                        await send_live_toast(f"💸 {roast[:200]}")

            # --- Step 6: Push HUD to Shield TV ---
            metrics = await _compute_hud_metrics(db)
            await push_hud_overlay(
                safe_to_spend=metrics["safe_to_spend"],
                card_float=metrics["card_float"],
                burn_rate_pct=metrics["burn_rate_pct"],
                guest_mode=metrics["guest_mode"],
            )
            if latest_roast_message:
                await push_roast_overlay(latest_roast_message)

            # --- Step 7: Price hike alerts on recurring ---
            from app.services.categorizer import check_price_hike
            result = await db.execute(
                select(Transaction).where(
                    Transaction.is_recurring == True,
                    Transaction.roast_sent == False,
                )
            )
            recurring_txs = result.scalars().all()
            for tx in recurring_txs:
                alert = await check_price_hike(db, tx)
                if alert:
                    await notify(alert)

        except Exception as e:
            logger.exception(f"Full sync pipeline failed: {e}")


async def _compute_hud_metrics(db) -> dict:
    """Compute the numbers pushed to Shield TV HUD."""
    from app.services.simplefin import get_state

    result = await db.execute(
        select(func.sum(Account.current_balance)).where(
            Account.bucket == BucketType.day_to_day
        )
    )
    day_to_day = float(result.scalar() or 0)

    result = await db.execute(
        select(func.sum(Account.current_balance)).where(
            Account.bucket == BucketType.short_term_debt
        )
    )
    card_float = abs(float(result.scalar() or 0))

    from datetime import timedelta
    from sqlalchemy import and_
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.amount < 0,
            Transaction.is_internal_transfer == False,
            Transaction.posted_at >= now - timedelta(days=30),
        )
    )
    outflow_30d = abs(float(result.scalar() or 0))

    result = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.amount > 0,
            Transaction.is_internal_transfer == False,
            Transaction.posted_at >= now - timedelta(days=30),
        )
    )
    inflow_30d = float(result.scalar() or 1)

    burn_rate_pct = round(outflow_30d / max(inflow_30d, 1) * 100, 1)

    # Safe to spend
    from app.services.roast_engine import _get_safe_to_spend
    safe = await _get_safe_to_spend(db)

    # Guest mode from app_state
    state = await get_state(db, "guest_privacy_mode")
    guest_mode = state.get("enabled", False) if state else False

    return {
        "safe_to_spend": safe,
        "card_float": card_float,
        "burn_rate_pct": burn_rate_pct,
        "guest_mode": guest_mode,
    }


def start_scheduler() -> None:
    """Register jobs and start the scheduler. Called from FastAPI lifespan."""
    scheduler.add_job(
        full_sync_job,
        trigger="interval",
        hours=settings.SYNC_INTERVAL_HOURS,
        id="full_sync",
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=300,
    )
    scheduler.start()
    logger.info(f"Scheduler started. Sync interval: every {settings.SYNC_INTERVAL_HOURS}h.")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped.")
