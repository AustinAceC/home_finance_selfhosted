"""
TTS Service — Generate realistic neural speech audio via edge-tts with automatic gTTS fallback.
"""
import io
import logging
from typing import Optional

from gtts import gTTS
import edge_tts

from app.config import settings

logger = logging.getLogger(__name__)


async def generate_speech(
    text: str,
    voice: Optional[str] = None,
    rate: Optional[str] = None,
    pitch: Optional[str] = None,
) -> bytes:
    """
    Generate MP3 audio bytes for the given text.
    Tries edge-tts first; falls back seamlessly to gTTS if Microsoft blocks the websocket.
    """
    v = voice or settings.TTS_VOICE

    # 1. Try edge-tts
    try:
        communicate = edge_tts.Communicate(text=text, voice=v)
        buffer = bytearray()
        async for chunk in communicate.stream():
            if chunk.get("type") == "audio":
                buffer.extend(chunk.get("data", b""))
        if buffer:
            logger.info(f"Edge-TTS generated {len(buffer)} bytes of audio.")
            return bytes(buffer)
    except Exception as e:
        logger.warning(f"Edge-TTS failed ({e}). Falling back to Google TTS...")

    # 2. Fallback to gTTS (rock-solid, zero API keys, no 403 blocks)
    try:
        fp = io.BytesIO()
        tts = gTTS(text=text, lang="en", tld="com")
        tts.write_to_fp(fp)
        audio_data = fp.getvalue()
        logger.info(f"gTTS generated {len(audio_data)} bytes of audio.")
        return audio_data
    except Exception as e:
        logger.error(f"gTTS generation failed: {e}")
        return b""
