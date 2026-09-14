"""
Actually delivers an approved outreach draft over SMTP, using the project's
own Gmail account (EMAIL_USER / EMAIL_APP_PASSWORD in .env). Mirrors
providers.py's pattern: read credentials from the environment only, never
hardcoded, and treat missing configuration as "not available" rather than
an error -- so a deployment without SMTP set up still runs, it just falls
back to dataset_routes.py's original mark-as-sent behaviour.
"""
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

_ENV_HOST = "EMAIL_HOST"
_ENV_PORT = "EMAIL_PORT"
_ENV_USER = "EMAIL_USER"
_ENV_PASSWORD = "EMAIL_APP_PASSWORD"
_ENV_FROM_NAME = "EMAIL_FROM_NAME"

_DEFAULT_FROM_NAME = "The Customer Success Team"
_SMTP_TIMEOUT_SECONDS = 15
_BRAND_ACCENT = "#22C55E"  # matches ChurnGuard's "approved" green used elsewhere in the app




_smtp_connection = None


def _get_connection():
    global _smtp_connection
    if _smtp_connection is not None:
        try:
            _smtp_connection.noop()  # cheap way to check the connection is still alive
            return _smtp_connection
        except Exception:
            _smtp_connection = None  # stale connection, reconnect below

    host = os.getenv(_ENV_HOST, "smtp.gmail.com")
    port = int(os.getenv(_ENV_PORT, "587"))
    user = os.getenv(_ENV_USER)
    password = os.getenv(_ENV_PASSWORD)

    conn = smtplib.SMTP(host, port, timeout=_SMTP_TIMEOUT_SECONDS)
    conn.starttls()
    conn.login(user, password)
    _smtp_connection = conn
    return conn


class EmailDeliveryError(Exception):
    """Raised when SMTP is configured but the send itself fails -- lets the
    caller keep the draft's status unchanged instead of falsely marking it
    'sent'."""


def is_configured() -> bool:
    return bool(os.getenv(_ENV_USER) and os.getenv(_ENV_PASSWORD))


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


# def send_outreach_email(recipient_email: str, subject: str, body_text: str, cta_text: Optional[str] = None) -> None:
#     """Raises EmailDeliveryError on any SMTP failure -- callers must not
#     mark a draft 'sent' unless this returns without raising."""
#     if not is_configured():
#         raise EmailDeliveryError("SMTP is not configured (EMAIL_USER / EMAIL_APP_PASSWORD missing).")

#     from_name = os.getenv(_ENV_FROM_NAME, _DEFAULT_FROM_NAME)
#     host = os.getenv(_ENV_HOST, "smtp.gmail.com")
#     port = int(os.getenv(_ENV_PORT, "587"))
#     user = os.getenv(_ENV_USER)
#     password = os.getenv(_ENV_PASSWORD)

#     msg = MIMEMultipart("alternative")
#     msg["Subject"] = subject
#     msg["From"] = f"{from_name} <{user}>"
#     msg["To"] = recipient_email
#     msg.attach(MIMEText(body_text, "plain"))
#     msg.attach(MIMEText(_wrap_html(body_text, from_name, cta_text), "html"))

#     try:
#         with smtplib.SMTP(host, port, timeout=_SMTP_TIMEOUT_SECONDS) as server:
#             server.starttls()
#             server.login(user, password)
#             server.sendmail(user, recipient_email, msg.as_string())
#     except (smtplib.SMTPException, OSError) as exc:
#         raise EmailDeliveryError(str(exc)) from exc



def send_outreach_email(recipient_email: str, subject: str, body_text: str, cta_text: Optional[str] = None) -> None:
    if not is_configured():
        raise EmailDeliveryError("SMTP is not configured (EMAIL_USER / EMAIL_APP_PASSWORD missing).")

    from_name = os.getenv(_ENV_FROM_NAME, _DEFAULT_FROM_NAME)
    user = os.getenv(_ENV_USER)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{user}>"
    msg["To"] = recipient_email
    msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(_wrap_html(body_text, from_name, cta_text), "html"))

    try:
        conn = _get_connection()
        conn.sendmail(user, recipient_email, msg.as_string())
    except (smtplib.SMTPException, OSError) as exc:
        global _smtp_connection
        _smtp_connection = None  # force a fresh connection next time
        raise EmailDeliveryError(str(exc)) from exc