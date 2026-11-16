"""
SimpleFIN Bridge integration.

Responsibilities:
  1. Claim a setup token (one-time POST) → persist the access URL in app_state.
  2. Poll accounts + transactions every 4 hours.
  3. Auto-bucket new accounts using heuristic rules.
  4. Upsert accounts and transactions into PostgreSQL.
"""
import base64
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, AppState, BucketType, Transaction
from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App-state helpers
# ---------------------------------------------------------------------------

async def get_state(db: AsyncSession, key: str) -> Optional[dict]:
    result = await db.execute(select(AppState).where(AppState.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else None


async def set_state(db: AsyncSession, key: str, value: dict) -> None:
    result = await db.execute(select(AppState).where(AppState.key == key))
    row = result.scalar_one_or_none()
    if row:
        row.value = value
        row.updated_at = datetime.now(timezone.utc)
    else:
        db.add(AppState(key=key, value=value))
    await db.commit()


# ---------------------------------------------------------------------------
# Token Claim
# ---------------------------------------------------------------------------

async def claim_setup_token(db: AsyncSession, setup_token: str) -> str:
    """
    Decode the Base64 setup token (auto-padding if needed), POST to the claim URL once,
    and store the resulting access URL in app_state.
    Returns the access URL.
    """
    token_clean = setup_token.strip(" \"'\r\n")
    missing_padding = len(token_clean) % 4
    if missing_padding:
        token_clean += "=" * (4 - missing_padding)

    decoded = base64.b64decode(token_clean).decode("utf-8").strip()
    claim_url = decoded  # The decoded value IS the claim URL

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(claim_url)
        response.raise_for_status()
        access_url = response.text.strip()

    await set_state(db, "simplefin_access_url", {"url": access_url})
    logger.info("SimpleFIN access URL claimed and stored.")
    return access_url


async def get_access_url(db: AsyncSession) -> Optional[str]:
    """
    Return the access URL from env or app_state (env takes priority).
    """
    if settings.SIMPLEFIN_ACCESS_URL:
        return settings.SIMPLEFIN_ACCESS_URL
    state = await get_state(db, "simplefin_access_url")
    return state["url"] if state else None


# ---------------------------------------------------------------------------
# Auto-Bucket Heuristics
# ---------------------------------------------------------------------------

def infer_bucket(institution: str, name: str, credit_limit: Optional[float], balance: float) -> BucketType:
    """
    Apply heuristic rules from the spec to assign a default bucket.
    """
    combined = f"{institution} {name}".upper()

    # Retirement: Fidelity or account contains IRA/401k/Brokerage keywords
    if any(kw in combined for kw in ["FIDELITY", "IRA", "401K", "BROKERAGE", "HSA"]):
        return BucketType.retirement

    # Savings: Savings, Money Market, Reserve
    if any(kw in combined for kw in ["SAVINGS", "MONEY MARKET", "RESERVE", "HYSA"]):
        return BucketType.savings

    # Short-term debt: credit card indicators
    if any(kw in combined for kw in [
        "VISA", "ALASKA", "DISCOVER", "HOME DEPOT", "CARD", "CREDIT", "MASTERCARD", "AMEX"
    ]):
        return BucketType.short_term_debt

    # Negative balance + credit limit suggests a credit card
    if credit_limit is not None and balance < 0:
        return BucketType.short_term_debt

    # Default: day-to-day checking
    return BucketType.day_to_day


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------

async def sync_accounts(db: AsyncSession) -> dict:
    """
    Poll SimpleFIN for the last 14 days of data, upsert all accounts
    and transactions, and return a summary dict.
    """
    access_url = await get_access_url(db)
    if not access_url:
        raise ValueError("SimpleFIN access URL not configured. Call /api/setup/claim-simplefin first.")

    start_ts = int((datetime.now(timezone.utc) - timedelta(days=14)).timestamp())
    accounts_url = f"{access_url}/accounts?start-date={start_ts}"

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(accounts_url)
        response.raise_for_status()
        data = response.json()

    accounts_synced = 0
    transactions_synced = 0

    for acct_data in data.get("accounts", []):
        acct_id = acct_data["id"]
        institution = acct_data.get("org", {}).get("name", "Unknown")
        name = acct_data.get("name", "Unknown")
        balance = float(acct_data.get("balance", 0))
        available = float(acct_data.get("available-balance", balance)) if acct_data.get("available-balance") is not None else None
        credit_limit_raw = acct_data.get("credit-limit")
        credit_limit = float(credit_limit_raw) if credit_limit_raw is not None else None

        # Fetch existing account or create new one
        result = await db.execute(select(Account).where(Account.id == acct_id))
        account = result.scalar_one_or_none()

        if account is None:
            bucket = infer_bucket(institution, name, credit_limit, balance)
            include = bucket not in (BucketType.retirement,)
            account = Account(
                id=acct_id,
                institution=institution,
                name=name,
                bucket=bucket,
                current_balance=balance,
                available_balance=available,
                credit_limit=credit_limit,
                include_in_cashflow=include,
                last_synced_at=datetime.now(timezone.utc),
            )
            db.add(account)
        else:
            # Update balances and sync timestamp; preserve user overrides
            account.current_balance = balance
            account.available_balance = available
            account.credit_limit = credit_limit
            account.last_synced_at = datetime.now(timezone.utc)

        accounts_synced += 1

        # Upsert transactions
        for tx_data in acct_data.get("transactions", []):
            tx_id = tx_data["id"]
            result = await db.execute(select(Transaction).where(Transaction.id == tx_id))
            tx = result.scalar_one_or_none()

            posted_ts = tx_data.get("posted")
            transacted_ts = tx_data.get("transacted_at") or tx_data.get("transacted-at")

            if tx is None:
                tx = Transaction(
                    id=tx_id,
                    account_id=acct_id,
                    posted_at=datetime.fromtimestamp(posted_ts, tz=timezone.utc) if posted_ts else datetime.now(timezone.utc),
                    transacted_at=datetime.fromtimestamp(transacted_ts, tz=timezone.utc) if transacted_ts else None,
                    amount=float(tx_data.get("amount", 0)),
                    merchant_raw=tx_data.get("description", ""),
                    merchant_clean=_clean_merchant(tx_data.get("description", "")),
                    is_pending=tx_data.get("pending", False),
                )
                db.add(tx)
                transactions_synced += 1
            else:
                # Update pending status (may flip to posted)
                tx.is_pending = tx_data.get("pending", False)

    await db.commit()
    logger.info(f"SimpleFIN sync complete: {accounts_synced} accounts, {transactions_synced} new transactions.")
    return {"accounts_synced": accounts_synced, "transactions_synced": transactions_synced}


# ---------------------------------------------------------------------------
# Merchant Cleaner (simple normalization)
# ---------------------------------------------------------------------------

import re

_NOISE = re.compile(
    r"\b(#\d+|\d{4,}|LLC|INC|CO\b|CORP|LTD|WWW\.|\.COM|\.NET|\.ORG)\b",
    re.IGNORECASE,
)

def _clean_merchant(raw: str) -> str:
    """Strip noise tokens from a raw merchant description."""
    cleaned = _NOISE.sub("", raw).strip()
    # Collapse multiple spaces
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned[:200]
