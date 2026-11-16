"""
Notifier service — multi-driver outbound messaging + inbound reply routing.

Supported drivers:
  1. Telegram Bot (primary, two-way text + neural voice notes via edge-tts)
  2. Carrier Email-to-SMS via SMTP (zero-cost, outbound SMS directly to cell phone)
"""
import logging
from email.mime.text import MIMEText
from typing import Optional

import httpx

from app.config import settings
from app.services.tts import generate_speech

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Telegram
# ---------------------------------------------------------------------------

async def send_telegram(message: str, chat_id: Optional[str] = None) -> bool:
    """
    Send a text message via Telegram Bot API.
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
            logger.info(f"Telegram text message sent: {message[:60]}...")
            return True
    except Exception as e:
        logger.error(f"Telegram send failed: {e}")
        return False


async def send_telegram_voice(
    audio_bytes: bytes,
    caption: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> bool:
    """
    Send an audio memo / voice message via Telegram Bot API (/sendVoice).
    Telegram displays this as an interactive waveform voice message.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    cid = chat_id or settings.TELEGRAM_CHAT_ID

    if not token or not cid or not audio_bytes:
        logger.warning("Telegram voice note missing token, chat_id, or audio.")
        return False

    is_wav = audio_bytes[:4] == b"RIFF"
    filename = "marcus_roast.wav" if is_wav else "marcus_roast.mp3"
    mime = "audio/wav" if is_wav else "audio/mpeg"

    url = f"https://api.telegram.org/bot{token}/sendVoice"
    files = {
        "voice": (filename, audio_bytes, mime)
    }
    data = {
        "chat_id": cid,
    }
    if caption:
        data["caption"] = caption[:1024]
        data["parse_mode"] = "HTML"

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.post(url, data=data, files=files)
            response.raise_for_status()
            logger.info("Telegram voice message delivered successfully.")
            return True
    except Exception as e:
        logger.error(f"Telegram voice send failed: {e}")
        return False


async def send_telegram_audio(
    audio_bytes: bytes,
    caption: Optional[str] = None,
    title: str = "Marcus Financial Planning Review",
    performer: str = "Marcus",
    chat_id: Optional[str] = None,
) -> bool:
    """
    Send an audio track via Telegram Bot API (/sendAudio).
    Telegram displays this as a full native audio player card with play/pause and progress slider.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    cid = chat_id or settings.TELEGRAM_CHAT_ID

    if not token or not cid or not audio_bytes:
        return False

    is_wav = audio_bytes[:4] == b"RIFF"
    filename = "marcus_roast.wav" if is_wav else "marcus_roast.mp3"
    mime = "audio/wav" if is_wav else "audio/mpeg"

    url = f"https://api.telegram.org/bot{token}/sendAudio"
    files = {
        "audio": (filename, audio_bytes, mime)
    }
    data = {
        "chat_id": cid,
        "title": title,
        "performer": performer,
    }
    if caption:
        data["caption"] = caption[:1024]
        data["parse_mode"] = "HTML"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, data=data, files=files)
            response.raise_for_status()
            logger.info("Telegram audio delivered successfully.")
            return True
    except Exception as e:
        logger.error(f"Telegram audio send failed: {e}")
        return False


async def voice_and_send_telegram(
    text: str,
    header: str = "🗣️ <b>Marcus (Financial Planner):</b>\n\n",
    voice: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> bool:
    """
    Generate speech with Gemini TTS and deliver as audio + text to Telegram.
    Tries voice message first, falls back to native audio player, then plain text.
    """
    audio = await generate_speech(text, voice=voice)
    caption = f"{header}{text}"

    if audio:
        sent_voice = await send_telegram_voice(audio, caption=caption, chat_id=chat_id)
        if sent_voice:
            return True

        sent_audio = await send_telegram_audio(audio, caption=caption, chat_id=chat_id)
        if sent_audio:
            return True

    return await send_telegram(caption, chat_id=chat_id)


async def set_telegram_webhook(webhook_url: str) -> bool:
    """
    Register the FastAPI webhook endpoint with Telegram so inbound messages
    are forwarded here instead of requiring polling.
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
        logger.debug("SMTP/SMS not fully configured — skipping.")
        return False

    try:
        import aiosmtplib

        # Standard SMS 160 character limit per segment
        msg = MIMEText(message[:320])
        msg["From"] = settings.SMTP_USER
        msg["To"] = settings.SMS_GATEWAY_EMAIL
        msg["Subject"] = ""  # Carrier gateways ignore or prepend subject

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASS,
            start_tls=True,
        )
        logger.info(f"SMS via email gateway sent to {settings.SMS_GATEWAY_EMAIL}.")
        return True
    except Exception as e:
        logger.error(f"SMTP send failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Unified Dispatcher
# ---------------------------------------------------------------------------

async def notify(message: str) -> bool:
    """
    Send a basic notification to Telegram.
    """
    if settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID:
        return await send_telegram(message)
    return False


async def send_roast(tx_id: str, roast_message: str, voice: Optional[str] = None) -> bool:
    """
    High-level roast dispatcher:
    Generates expressive speech with Gemini TTS and delivers a voice note + transcription to Telegram.
    """
    if settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID:
        return await voice_and_send_telegram(
            text=roast_message,
            header="🗣️ <b>Marcus (Financial Planner):</b>\n\n",
            voice=voice,
        )
    return False
