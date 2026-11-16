"""
Notifier service — multi-driver outbound messaging + inbound reply routing.

Supported drivers:
  1. Telegram Bot (primary, two-way)
  2. Carrier Email-to-SMS via SMTP (zero-cost, outbound only)
"""
import logging
import smtplib
from email.mime.text import MIMEText
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Telegram
# ---------------------------------------------------------------------------

async def send_telegram(message: str, chat_id: Optional[str] = None) -> bool:
    """
    Send a message via Telegram Bot API.
    Returns True on success, False on failure.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    cid = chat_id or settings.TELEGRAM_CHAT_ID

    if not token or not cid:
        logger.warning("Telegram not configured — skipping notification.")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": cid,
        "text": message,
        "parse_mode": "HTML",
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            logger.info(f"Telegram message sent: {message[:60]}...")
            return True
    except Exception as e:
        logger.error(f"Telegram send failed: {e}")
        return False


async def set_telegram_webhook(webhook_url: str) -> bool:
    """
    Register the FastAPI webhook endpoint with Telegram so inbound messages
    are forwarded here instead of requiring polling.
    Call this once during setup.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return False

    url = f"https://api.telegram.org/bot{token}/setWebhook"
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(url, json={"url": webhook_url})
        data = response.json()
        logger.info(f"Telegram webhook registration: {data}")
        return data.get("ok", False)


# ---------------------------------------------------------------------------
# Carrier Email-to-SMS (SMTP)
# ---------------------------------------------------------------------------

async def send_sms_via_email(message: str) -> bool:
    """
    Send an SMS via carrier email gateway (e.g. 5551234567@vtext.com).
    Requires SMTP credentials and SMS_GATEWAY_EMAIL in settings.
    """
    if not all([settings.SMTP_HOST, settings.SMTP_USER, settings.SMTP_PASS, settings.SMS_GATEWAY_EMAIL]):
        logger.warning("SMTP/SMS not configured — skipping.")
        return False

    try:
        import aiosmtplib

        msg = MIMEText(message[:160])  # SMS char limit
        msg["From"] = settings.SMTP_USER
        msg["To"] = settings.SMS_GATEWAY_EMAIL
        msg["Subject"] = ""  # Carrier gateway ignores subject

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASS,
            start_tls=True,
        )
        logger.info("SMS via email sent successfully.")
        return True
    except Exception as e:
        logger.error(f"SMTP send failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Unified Dispatcher
# ---------------------------------------------------------------------------

async def notify(message: str) -> bool:
    """
    Send a notification using the best available driver.
    Priority: Telegram → SMS-via-email
    """
    if settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID:
        return await send_telegram(message)
    return await send_sms_via_email(message)


async def send_roast(tx_id: str, roast_message: str) -> bool:
    """High-level helper called after roast generation."""
    return await notify(f"🤖 Financial Parole Officer:\n\n{roast_message}")
