"""
TTS Service — Generate realistic neural speech audio via edge-tts (free, no API key required).
"""
import io
import logging
from typing import Optional

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
    Uses edge-tts with deep, energetic male neural voice settings.
    """
    v = voice or settings.TTS_VOICE
    r = rate or settings.TTS_RATE
    p = pitch or settings.TTS_PITCH

    # 1. Try with customized rate/pitch
    try:
        kwargs = {"text": text, "voice": v}
        if r:
            kwargs["rate"] = r
        if p:
            kwargs["pitch"] = p
        communicate = edge_tts.Communicate(**kwargs)
        buffer = bytearray()
        async for chunk in communicate.stream():
            if chunk.get("type") == "audio":
                buffer.extend(chunk.get("data", b""))
        if buffer:
            logger.info(f"Generated {len(buffer)} bytes of audio for text: '{text[:40]}...'")
            return bytes(buffer)
    except Exception as e:
        logger.warning(f"TTS custom settings failed: {e}. Retrying with default voice settings...")

    # 2. Fallback to basic Communicate without rate/pitch
    try:
        communicate = edge_tts.Communicate(text=text, voice=v)
        buffer = bytearray()
        async for chunk in communicate.stream():
            if chunk.get("type") == "audio":
                buffer.extend(chunk.get("data", b""))
        if buffer:
            return bytes(buffer)
    except Exception as e:
        logger.error(f"TTS basic fallback failed: {e}")

    # 3. Fallback to standard US male voice en-US-GuyNeural
    try:
        communicate = edge_tts.Communicate(text=text, voice="en-US-GuyNeural")
        buffer = bytearray()
        async for chunk in communicate.stream():
            if chunk.get("type") == "audio":
                buffer.extend(chunk.get("data", b""))
        return bytes(buffer)
    except Exception as e:
        logger.error(f"TTS ultimate fallback failed: {e}")
        return b""
