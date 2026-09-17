"""
Actually delivers an approved outreach draft, using Resend's HTTPS API
(RESEND_API_KEY in .env). Mirrors providers.py's pattern: read credentials
from the environment only, never hardcoded, and treat missing configuration
as "not available" rather than an error -- so a deployment without an email
provider configured still runs, it just falls back to dataset_routes.py's
original mark-as-sent behaviour.

Resend over raw SMTP: several hosts, Render included, block outbound SMTP
connections on standard tiers to prevent spam abuse. A blocked SMTP
connection doesn't always fail fast either -- it can hang at the TCP level
well past any timeout coded here, long enough to trip the platform's own
gateway timeout and return a 502 before this module ever gets the chance to
raise its own clear error. Resend sends over a normal HTTPS POST, which
isn't affected by that block.
"""
import os
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

_ENV_API_KEY = "RESEND_API_KEY"
_ENV_FROM_ADDRESS = "EMAIL_FROM_ADDRESS"
_ENV_FROM_NAME = "EMAIL_FROM_NAME"

_DEFAULT_FROM_NAME = "The Customer Success Team"
_DEFAULT_FROM_ADDRESS = "onboarding@resend.dev"
_REQUEST_TIMEOUT_SECONDS = 15
_BRAND_ACCENT = "#22C55E"  # matches ChurnGuard's "approved" green used elsewhere in the app


class EmailDeliveryError(Exception):
    """Raised when an email provider is configured but the send itself
    fails -- lets the caller keep the draft's status unchanged instead of
    falsely marking it 'sent'."""


def is_configured() -> bool:
    return bool(os.getenv(_ENV_API_KEY))


def _wrap_html(body_text: str, from_name: str, cta_text: Optional[str]) -> str:
    """Wraps the LLM-drafted body (which already includes its own greeting
    and signature -- see outreach_generator.py) in a styled shell resembling
    a real SaaS transactional email: dark header, generous whitespace, one
    clear CTA button, minimal footer. cta_text is the LLM-authored action
    phrase (see prompts.SYSTEM_PROMPT); the button is omitted entirely when
    none is given, rather than showing a generic placeholder action."""
    body_html = body_text.replace("\n", "<br>")

    cta_block = ""
    if cta_text:
        cta_block = f"""
            <tr><td style="padding:8px 40px 32px;">
                <a href="#" style="background:{_BRAND_ACCENT};color:#ffffff;padding:14px 28px;
                   border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;
                   display:inline-block;">{cta_text}</a>
            </td></tr>"""

    return f"""
    <html><body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,Helvetica,Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
        <tr><td align="center">
          <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr><td style="background:#14151A;padding:28px 40px;">
                <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">ChurnGuard</span>
            </td></tr>
            <tr><td style="padding:36px 40px 8px;">
                <p style="font-size:15px;color:#1F2430;line-height:1.7;margin:0;">{body_html}</p>
            </td></tr>
            {cta_block}
            <tr><td style="padding:24px 40px;border-top:1px solid #EEF0F3;">
                <p style="font-size:12px;color:#9AA1AC;margin:0;">Sent by {from_name} &middot; You're receiving this because you're a valued customer.</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>"""


def send_outreach_email(recipient_email: str, subject: str, body_text: str, cta_text: Optional[str] = None) -> None:
    """Raises EmailDeliveryError on any send failure -- callers must not
    mark a draft 'sent' unless this returns without raising."""
    if not is_configured():
        raise EmailDeliveryError("Email delivery is not configured (RESEND_API_KEY missing).")

    api_key = os.getenv(_ENV_API_KEY)
    from_name = os.getenv(_ENV_FROM_NAME, _DEFAULT_FROM_NAME)
    from_address = os.getenv(_ENV_FROM_ADDRESS, _DEFAULT_FROM_ADDRESS)

    payload = {
        "from": f"{from_name} <{from_address}>",
        "to": [recipient_email],
        "subject": subject,
        "text": body_text,
        "html": _wrap_html(body_text, from_name, cta_text),
    }

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        # Same reasoning as elsewhere: the provider's error body can carry
        # account-identifying detail, so it goes to the caller as a plain
        # message, not verbatim.
        raise EmailDeliveryError(f"The email provider rejected the message: {exc}") from exc