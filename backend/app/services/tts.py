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

    try:
        communicate = edge_tts.Communicate(text=text, voice=v, rate=r, pitch=p)
        buffer = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.extend(chunk["data"])
        
        logger.info(f"Generated {len(buffer)} bytes of audio for text: '{text[:40]}...'")
        return bytes(buffer)
    except Exception as e:
        logger.error(f"TTS speech generation failed: {e}")
        return b""
