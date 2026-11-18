import logging
import json
from typing import Optional
from email.mime.text import MIMEText
import httpx
from app.config import settings
from app.services.tts import synthesize_speech

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Telegram Bot Delivery (Expressive Voice + Text Caption)
# ---------------------------------------------------------------------------

async def send_telegram(message: str, chat_id: Optional[str] = None) -> bool:
    """Send a formatted text message to Telegram."""
    token = settings.TELEGRAM_BOT_TOKEN
    target_chat = chat_id or settings.TELEGRAM_CHAT_ID
    if not token or not target_chat:
        logger.warning("Telegram credentials not configured. Skipping send.")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": target_chat,
        "text": message,
        "parse_mode": "HTML",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(url, json=payload)
            if res.status_code == 200:
                logger.info("Telegram text message sent successfully.")
                return True
            else:
                logger.error(f"Telegram text send error: {res.status_code} {res.text}")
                return False
    except Exception as e:
        logger.error(f"Telegram request failed: {e}")
        return False


async def send_telegram_voice(
    audio_bytes: bytes,
    caption: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> bool:
    """
    Send an audio file using sendVoice so Telegram displays an inline waveform player.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    target_chat = chat_id or settings.TELEGRAM_CHAT_ID
    if not token or not target_chat:
        return False

    url = f"https://api.telegram.org/bot{token}/sendVoice"
    try:
        files = {
            "voice": ("voice.mp3", audio_bytes, "audio/mpeg")
        }
        data = {
            "chat_id": target_chat,
        }
        if caption:
            data["caption"] = caption[:1024]
            data["parse_mode"] = "HTML"

        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(url, data=data, files=files)
            if res.status_code == 200:
                logger.info("Telegram voice note delivered successfully.")
                return True
            else:
                logger.warning(f"sendVoice failed ({res.status_code}): {res.text}. Trying sendAudio...")
                return False
    except Exception as e:
        logger.error(f"Telegram voice request failed: {e}")
        return False


async def send_telegram_audio(
    audio_bytes: bytes,
    caption: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> bool:
    """Fallback audio delivery using sendAudio."""
    token = settings.TELEGRAM_BOT_TOKEN
    target_chat = chat_id or settings.TELEGRAM_CHAT_ID
    if not token or not target_chat:
        return False

    url = f"https://api.telegram.org/bot{token}/sendAudio"
    try:
        files = {
            "audio": ("marcus_roast.mp3", audio_bytes, "audio/mpeg")
        }
        data = {
            "chat_id": target_chat,
            "title": "Marcus — Financial Planner",
            "performer": "Marcus",
        }
        if caption:
            data["caption"] = caption[:1024]
            data["parse_mode"] = "HTML"

        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(url, data=data, files=files)
            if res.status_code == 200:
                logger.info("Telegram audio delivered successfully.")
                return True
            else:
                logger.error(f"sendAudio failed ({res.status_code}): {res.text}")
                return False
    except Exception as e:
        logger.error(f"Telegram audio request failed: {e}")
        return False


async def voice_and_send_telegram(
    text: str,
    header: str = "🗣️ <b>Marcus (Financial Planner):</b>\n\n",
    voice: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> bool:
    """
    Synthesize audio via Gemini TTS and send as Telegram Voice Note with accompanying text caption.
    """
    logger.info("Synthesizing speech via Gemini TTS...")
    audio = await synthesize_speech(text, voice=voice)
    caption = f"{header}{text}"

    if audio:
        sent_voice = await send_telegram_voice(audio, caption=caption, chat_id=chat_id)
        if sent_voice:
            return True
        sent_audio = await send_telegram_audio(audio, caption=caption, chat_id=chat_id)
        if sent_audio:
            return True

    logger.warning("TTS audio generation/delivery failed. Falling back to text message.")
    return await send_telegram(caption, chat_id=chat_id)


# ---------------------------------------------------------------------------
# Unified Dispatcher
# ---------------------------------------------------------------------------

async def notify(payload) -> bool:
    """
    Send an informational notification to Telegram, formatted properly (never raw JSON).
    """
    if not (settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID):
        return False

    if isinstance(payload, dict):
        # Format price hike or alert nicely
        merchant = payload.get("merchant", "Subscription")
        actual = payload.get("actual_amount", 0.0)
        expected = payload.get("expected_amount", 0.0)
        diff = payload.get("diff", 0.0)
        pct = payload.get("pct_increase", 0.0)
        formatted = (
            f"📈 <b>Subscription Price Alert: {merchant}</b>\n\n"
            f"Charged: <b>${actual:,.2f}</b> (normally ${expected:,.2f})\n"
            f"Increase: <b>+${diff:,.2f} (+{pct:.1f}%)</b>"
        )
        return await send_telegram(formatted)

    return await send_telegram(str(payload))


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
