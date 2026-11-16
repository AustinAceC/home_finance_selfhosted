"""
Twilio Live Voice Service — Real-time outbound phone calls from Marcus (Financial Planner).

Features:
  - Real-time outbound call dispatch when high-roast transactions occur.
  - Interactive excuse loop via Twilio Speech-to-Text (<Gather input="speech">).
  - Safety circuit breakers: daily call limits, cooldown timers, time-limit cuts.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode
from xml.sax.saxutils import escape as xml_escape

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# State tracking for cooldown and call throttling
_last_call_time: Optional[datetime] = None
_calls_today_count: int = 0
_calls_today_date: Optional[datetime] = None


def _check_rate_limits() -> tuple[bool, str]:
    """Ensures safety circuit breakers (cooldown and daily limits) are respected."""
    global _last_call_time, _calls_today_count, _calls_today_date

    now = datetime.now(timezone.utc)

    # Reset daily counter at midnight UTC
    if _calls_today_date is None or _calls_today_date.date() != now.date():
        _calls_today_date = now
        _calls_today_count = 0

    if _calls_today_count >= settings.TWILIO_MAX_CALLS_PER_DAY:
        return False, f"Daily limit reached ({settings.TWILIO_MAX_CALLS_PER_DAY} calls max/day)."

    if _last_call_time:
        elapsed_minutes = (now - _last_call_time).total_seconds() / 60.0
        if elapsed_minutes < settings.TWILIO_COOLDOWN_MINUTES:
            remaining = int(settings.TWILIO_COOLDOWN_MINUTES - elapsed_minutes)
            return False, f"In cooldown window ({remaining}m remaining)."

    return True, "OK"


def _record_call_made():
    """Update call counters and cooldown timestamps."""
    global _last_call_time, _calls_today_count
    _last_call_time = datetime.now(timezone.utc)
    _calls_today_count += 1


async def place_marcus_call(
    roast_text: str,
    to_number: Optional[str] = None,
    from_number: Optional[str] = None,
) -> bool:
    """
    Places an outbound phone call to the user via Twilio.
    Delivers Marcus's roast and prompts for an excuse.
    """
    sid = settings.TWILIO_ACCOUNT_SID
    token = settings.TWILIO_AUTH_TOKEN
    target = to_number or settings.TWILIO_TO_NUMBER
    source = from_number or settings.TWILIO_FROM_NUMBER

    if not sid or not token or not target or not source:
        logger.warning("Twilio voice not fully configured (missing SID, token, from, or to).")
        return False

    allowed, reason = _check_rate_limits()
    if not allowed:
        logger.info(f"Marcus phone call skipped due to throttle: {reason}")
        return False

    # Build TwiML instructions
    safe_roast = xml_escape(roast_text)
    # If a public webhook URL is configured, use <Gather> to listen for the excuse
    if settings.PUBLIC_BASE_URL:
        action_url = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/api/webhooks/twilio/gather"
        twiml = (
            f'<Response>'
            f'<Gather input="speech" action="{action_url}" method="POST" speechTimeout="auto" timeout="6">'
            f'<Say voice="Polly.Matthew">{safe_roast}</Say>'
            f'<Pause length="1"/>'
            f'<Say voice="Polly.Matthew">I am listening. What is your excuse, Austin?</Say>'
            f'</Gather>'
            f'<Say voice="Polly.Matthew">Since you got nothing to say for yourself, check your dashboard and stop spending.</Say>'
            f'</Response>'
        )
    else:
        # Standalone call without public webhook
        twiml = (
            f'<Response>'
            f'<Say voice="Polly.Matthew">{safe_roast}</Say>'
            f'<Pause length="1"/>'
            f'<Say voice="Polly.Matthew">Check your dashboard and get your budget under control. Goodbye.</Say>'
            f'</Response>'
        )

    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Calls.json"
    data = {
        "To": target,
        "From": source,
        "Twiml": twiml,
        "TimeLimit": 90,  # Force disconnect after 90 seconds max
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, data=data, auth=(sid, token))
            if resp.status_code in [200, 201]:
                _record_call_made()
                call_info = resp.json()
                logger.info(f"Twilio phone call placed to {target}! Call SID: {call_info.get('sid')}")
                return True
            else:
                logger.error(f"Twilio call failed: {resp.status_code} {resp.text}")
                return False
    except Exception as e:
        logger.error(f"Twilio call exception: {e}")
        return False
