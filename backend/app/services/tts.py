"""
TTS Service — Generate high quality speech for Marcus using Google's Gemini TTS models
with automatic gTTS fallback.
"""
import base64
import io
import logging
import struct
from typing import Optional
from gtts import gTTS
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _pcm_to_wav(
    pcm_bytes: bytes,
    sample_rate: int = 24000,
    channels: int = 1,
    bits_per_sample: int = 16,
) -> bytes:
    """Wraps raw linear 16-bit PCM bytes in a standard 44-byte RIFF/WAVE header."""
    byte_rate = sample_rate * channels * (bits_per_sample // 8)
    block_align = channels * (bits_per_sample // 8)
    data_length = len(pcm_bytes)
    total_length = 36 + data_length

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        total_length,
        b"WAVE",
        b"fmt ",
        16,
        1,  # PCM format
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        data_length,
    )
    return header + pcm_bytes


async def generate_speech(
    text: str,
    voice: Optional[str] = None,
    rate: Optional[str] = None,
    pitch: Optional[str] = None,
) -> bytes:
    """
    Generate audio bytes for the given text.
    Uses Google's Gemini TTS models (gemini-3.8-flash-tts, gemini-3.8-flash-lite-tts, gemini-2.5-flash-preview-tts)
    with expressive voices (default: Fenrir or Charon) for natural African American vocal cadence.
    Falls back gracefully to gTTS if Gemini is unavailable.
    """
    selected_voice = voice or settings.TTS_VOICE or "Fenrir"

    # 1. Try Google Gemini TTS if LLM_API_KEY is available
    if settings.LLM_API_KEY:
        models = [
            "gemini-2.5-flash-preview-tts",
            "gemini-2.5-pro-preview-tts",
        ]
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": text}
                    ]
                }
            ],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": selected_voice
                        }
                    }
                },
            },
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            for model in models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={settings.LLM_API_KEY}"
                try:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if not candidates:
                            continue
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if not parts:
                            continue
                        inline_data = parts[0].get("inlineData", {})
                        b64_audio = inline_data.get("data")
                        mime_type = inline_data.get("mimeType", "")
                        if b64_audio:
                            audio_bytes = base64.b64decode(b64_audio)
                            if "pcm" in mime_type.lower():
                                wav_bytes = _pcm_to_wav(audio_bytes, sample_rate=24000)
                                logger.info(
                                    f"Gemini TTS ({model}, voice={selected_voice}) generated {len(wav_bytes)} WAV bytes."
                                )
                                return wav_bytes
                            logger.info(
                                f"Gemini TTS ({model}, voice={selected_voice}) generated {len(audio_bytes)} bytes ({mime_type})."
                            )
                            return audio_bytes
                    else:
                        logger.warning(
                            f"Gemini TTS ({model}) returned {resp.status_code}: {resp.text[:120]}"
                        )
                except Exception as e:
                    logger.warning(f"Gemini TTS ({model}) attempt failed: {e}")

    # 2. Fallback to gTTS
    try:
        fp = io.BytesIO()
        tts = gTTS(text=text, lang="en", tld="com")
        tts.write_to_fp(fp)
        audio_data = fp.getvalue()
        logger.info(f"Fallback gTTS generated {len(audio_data)} bytes of audio.")
        return audio_data
    except Exception as e:
        logger.error(f"TTS generation completely failed: {e}")
        return b""


# Alias for backward compatibility across modules
synthesize_speech = generate_speech

