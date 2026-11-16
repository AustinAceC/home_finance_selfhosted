"""
Nvidia Shield TV integration.

Pushes live financial overlays to the Aerial Views app (port 8081)
and optionally fires Android TV toast notifications (port 7676)
for high-score roasts.
"""
import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

AERIAL_VIEWS_PORT = 8081
TOAST_PORT = 7676


async def push_hud_overlay(
    safe_to_spend: float,
    card_float: float,
    burn_rate_pct: float,
    guest_mode: bool = False,
) -> bool:
    """
    POST the main financial HUD to Aerial Views message slot 1.
    guest_mode masks raw dollar amounts with percentages/index scores.
    """
    if not settings.SHIELD_TV_IP:
        return False

    if guest_mode:
        # Cashflow index: ratio of safe_to_spend to (safe_to_spend + card_float)
        index = round(safe_to_spend / max(safe_to_spend + card_float, 1) * 100, 1)
        utilization = round(card_float / max(safe_to_spend + card_float, 1) * 100, 1)
        message = (
            f"🟢 Cashflow Index: +{index}%  |  "
            f"💳 Card Utilization: {utilization}%  |  "
            f"🔥 Burn Rate: {burn_rate_pct:.0f}%"
        )
    else:
        message = (
            f"💵 Safe-to-Spend: ${safe_to_spend:,.0f}  |  "
            f"💳 Card Float: ${card_float:,.0f}  |  "
            f"🔥 Burn Rate: {burn_rate_pct:.0f}%"
        )

    return await _post_aerial_message(slot=1, text=message)


async def push_roast_overlay(roast_message: str) -> bool:
    """
    POST the latest roast to Aerial Views message slot 2.
    """
    if not settings.SHIELD_TV_IP:
        return False

    text = f"🤖 Financial Parole Officer: {roast_message}"
    return await _post_aerial_message(slot=2, text=text[:500])


async def _post_aerial_message(slot: int, text: str) -> bool:
    url = f"http://{settings.SHIELD_TV_IP}:{AERIAL_VIEWS_PORT}/message/{slot}"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(url, content=text, headers={"Content-Type": "text/plain"})
            response.raise_for_status()
            logger.info(f"Aerial Views slot {slot} updated.")
            return True
    except Exception as e:
        logger.warning(f"Aerial Views push failed (slot {slot}): {e}")
        return False


async def send_live_toast(message: str) -> bool:
    """
    Fire an instant on-screen Android TV toast popup (port 7676).
    Only called when roast_score >= 80 AND SHIELD_LIVE_TOAST_ENABLED=true.
    """
    if not settings.SHIELD_TV_IP or not settings.SHIELD_LIVE_TOAST_ENABLED:
        return False

    url = f"http://{settings.SHIELD_TV_IP}:{TOAST_PORT}/toast"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(url, json={"message": message[:200]})
            response.raise_for_status()
            logger.info("Live toast sent to Shield TV.")
            return True
    except Exception as e:
        logger.warning(f"Shield TV live toast failed: {e}")
        return False
