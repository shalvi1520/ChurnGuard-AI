"""
Outbound email, behind a thin abstraction.

There is exactly one rule here, and it is the reason this module is not just
an `smtplib` call inlined into the reset route: **the caller is always told
whether the message was really sent.** A password-reset flow that shows "check
your inbox" when no mail server is configured is worse than one that has no
reset at all -- the user waits for something that is never coming, and the
only person who knows is whoever reads the server log.

So `send()` returns a result carrying `delivered`, and the route renders a
different (honest) screen when it is False. In development with no SMTP host,
the reset link is written to the server log and the UI says so plainly.

Resend is tried first when configured (RESEND_API_KEY): several hosts,
Render included, block outbound SMTP on standard tiers to stop spam abuse,
so raw SMTP that works locally can silently fail once deployed. Resend sends
over a normal HTTPS API call instead, which isn't affected by that block.
SMTP remains supported for anyone who configures SMTP_HOST instead.
"""
import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from html import escape as html_escape
from typing import Optional

from . import config

logger = logging.getLogger(__name__)


@dataclass
class EmailResult:
    """Outcome of one send attempt.

    `delivered` is the only field callers should branch on. `detail` explains
    a non-delivery for the server's own logs and for the developer-facing
    notice; it is never shown verbatim to an end user in production.
    """

    delivered: bool
    detail: str = ""


class EmailBackend:
    def send(self, *, to: str, subject: str, body: str, html: Optional[str] = None) -> EmailResult:
        raise NotImplementedError


class ConsoleEmailBackend(EmailBackend):
    """No mail server configured: log the message, and say it was not sent.

    Returning `delivered=False` is the entire contract of this class. It would
    be trivially easy to return True and let the flow look finished in
    development -- and that lie would then ship, because nothing downstream
    would ever discover the difference.

    The body is written to the log **only in development**. A password-reset
    body contains a working reset link, and a log is not a safe place for a
    live credential: logs get shipped to aggregators, tailed in shared
    terminals, and kept long after the token would otherwise have expired.
    Outside development the message is recorded as not-sent and its contents
    are dropped.

    Development is the one case where writing it is the lesser evil: without
    it there is no way to complete a reset at all on a machine with no SMTP,
    and the alternative people reach for -- returning the token in the HTTP
    response -- would hand an account-takeover primitive to any unauthenticated
    caller who can name an email address.
    """

    def send(self, *, to: str, subject: str, body: str, html: Optional[str] = None) -> EmailResult:
        # `html` is accepted and dropped: the log wants the readable version,
        # and a wall of markup there would bury the link this exists to show.
        if config.IS_PRODUCTION:
            logger.error(
                "No email backend configured — email NOT sent to %s (subject=%r). Body withheld: "
                "it can contain a live reset link, which must not reach the logs.",
                to,
                subject,
            )
        else:
            logger.warning(
                "No email backend configured — email NOT sent. Intended recipient=%s subject=%r\n"
                "--- message body (development only; APP_ENV=%s) ---\n%s\n"
                "---------------------------------------------------",
                to,
                subject,
                config.APP_ENV,
                body,
            )
        return EmailResult(
            delivered=False,
            detail="No email backend is configured (set RESEND_API_KEY or SMTP_HOST in backend/.env).",
        )


class SmtpEmailBackend(EmailBackend):
    def send(self, *, to: str, subject: str, body: str, html: Optional[str] = None) -> EmailResult:
        message = EmailMessage()
        message["From"] = config.SMTP_FROM
        message["To"] = to
        message["Subject"] = subject
        # Plain text first, HTML as the alternative. That order is what makes
        # the text part the fallback rather than the other way round: a client
        # that renders HTML picks the last alternative it understands, and one
        # that doesn't -- or a user who has turned it off -- still gets a
        # readable message with a working link in it, not an empty body.
        message.set_content(body)
        if html:
            message.add_alternative(html, subtype="html")

        try:
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as smtp:
                if config.SMTP_USE_TLS:
                    smtp.starttls()
                if config.SMTP_USERNAME and config.SMTP_PASSWORD:
                    smtp.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
                smtp.send_message(message)
        except (smtplib.SMTPException, OSError) as exc:
            # The exception text can contain the SMTP username and the server's
            # own diagnostics, so it goes to the log and not to the caller's
            # user-visible detail.
            logger.error("SMTP send to %s failed: %s", to, exc)
            return EmailResult(delivered=False, detail="The mail server rejected the message.")
        return EmailResult(delivered=True)


class ResendEmailBackend(EmailBackend):
    """Sends over Resend's HTTPS API instead of raw SMTP.

    Exists because several hosts (Render included) block outbound SMTP
    connections on standard tiers to prevent spam abuse -- HTTPS is not
    blocked, so an API-based provider is what actually works once deployed,
    even though SMTP works fine locally.
    """

    def send(self, *, to: str, subject: str, body: str, html: Optional[str] = None) -> EmailResult:
        import httpx

        payload = {
            "from": config.SMTP_FROM,
            "to": [to],
            "subject": subject,
            "text": body,
        }
        if html:
            payload["html"] = html

        try:
            response = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {config.RESEND_API_KEY}"},
                json=payload,
                timeout=15,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            # Same reasoning as the SMTP branch: Resend's error body can
            # include account-identifying detail, so it stays server-side.
            logger.error("Resend send to %s failed: %s", to, exc)
            return EmailResult(delivered=False, detail="The email provider rejected the message.")
        return EmailResult(delivered=True)


def get_backend() -> EmailBackend:
    """The backend this server's configuration selects.

    Resend takes priority when RESEND_API_KEY is set -- it works in
    environments (like Render) that block outbound SMTP. SMTP remains
    available for anyone who configures SMTP_HOST instead, and
    ConsoleEmailBackend is the honest fallback when neither is configured.

    Adding another provider API (SES, Postmark) means one more EmailBackend
    subclass and one more branch here. Nothing else in the codebase touches
    email -- auth_routes calls send_password_reset and reads `delivered`,
    and that is the whole contract.
    """
    if config.RESEND_API_KEY:
        return ResendEmailBackend()
    return SmtpEmailBackend() if config.email_is_configured() else ConsoleEmailBackend()


def delivery_is_configured() -> bool:
    """Whether this server can deliver mail at all.

    A property of the server only. auth_routes reports this in the
    forgot-password response, which is seen by unauthenticated callers, so it
    must not vary with anything about the address submitted -- otherwise it
    becomes the account-existence oracle the generic response exists to
    prevent.
    """
    return config.email_is_configured()


# --- the password-reset message ---------------------------------------------

RESET_SUBJECT = "Reset your ChurnGuard-AI password"


def _reset_body_text(greeting: str, reset_url: str, expires_minutes: int, set_first: bool) -> str:
    """The plain-text part.

    The URL sits on a line of its own, unwrapped and undecorated: mail clients
    linkify a bare URL reliably and mangle a decorated one, and a reset link
    that arrives split across two lines is a support ticket.
    """
    action = (
        "Someone asked to set a password for your ChurnGuard-AI account."
        if set_first
        else "Someone asked to reset the password for your ChurnGuard-AI account."
    )
    instruction = (
        "Open the link below to choose one:"
        if set_first
        else "Open the link below to choose a new one:"
    )
    note = (
        "Your account currently signs in with Google. Setting a "
        "password adds a second way in - it does not remove or change that one.\n\n"
        if set_first
        else ""
    )
    return (
        f"{greeting}\n\n"
        f"{action}\n"
        f"{instruction}\n\n"
        f"{reset_url}\n\n"
        f"{note}"
        f"This link expires in {expires_minutes} minutes and can only be used once.\n"
        "If you didn't request this, you can ignore this email - nothing will change.\n\n"
        "- ChurnGuard-AI"
    )


def _reset_body_html(greeting: str, reset_url: str, expires_minutes: int, set_first: bool) -> str:
    """The HTML part: the same words, plus a button.

    Inline styles on simple block elements, and no <table> scaffolding. Mail
    clients strip <style> blocks, ignore most of CSS, and Outlook renders
    through Word; inline properties on a single column are the subset that
    survives all of them.

    The button is an <a> styled as one -- a <button> does nothing in an email
    -- and the raw URL is repeated underneath it. That repetition is not
    redundancy: a client with remote content blocked may show no button at all,
    and plenty of people would rather read where a link goes before pressing
    it, which is precisely the instinct a password-reset email should reward.

    Every interpolated value is escaped. `reset_url` is built by the backend
    from FRONTEND_URL and a generated token so it is not attacker-controlled,
    and `name` comes from the account -- but "not attacker-controlled today"
    is a property that quietly stops being true, and an unescaped name in an
    HTML email is how that becomes someone else's problem.
    """
    safe_url = html_escape(reset_url, quote=True)
    heading = "Set your password" if set_first else "Reset your password"
    button_label = "Set Password" if set_first else "Reset Password"
    intro = (
        "Someone asked to set a password for your ChurnGuard-AI account."
        if set_first
        else "Someone asked to reset the password for your ChurnGuard-AI account."
    )
    oauth_note = (
        '<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475569;">'
        "Your account currently signs in with Google. Setting a password "
        "adds a second way in &mdash; it does not remove or change that one.</p>"
        if set_first
        else ""
    )
    return (
        '<!doctype html>\n'
        '<html>\n'
        '  <body style="margin:0;padding:24px;background:#f1f5f9;'
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\">\n"
        '    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">\n'
        '      <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.04em;'
        'text-transform:uppercase;color:#0891b2;">ChurnGuard-AI</p>\n'
        f'      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f172a;">{heading}</h1>\n'
        f'      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#334155;">{html_escape(greeting)}</p>\n'
        f'      <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#334155;">{intro}</p>\n'
        '      <p style="margin:0 0 24px;">\n'
        f'        <a href="{safe_url}" style="display:inline-block;padding:12px 24px;background:#0891b2;'
        'color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">'
        f'{button_label}</a>\n'
        '      </p>\n'
        f'      {oauth_note}\n'
        '      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#64748b;">\n'
        '        Or paste this link into your browser:<br>\n'
        f'        <span style="word-break:break-all;color:#0891b2;">{safe_url}</span>\n'
        '      </p>\n'
        '      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;">\n'
        f'        This link expires in {expires_minutes} minutes and can only be used once.\n'
        '      </p>\n'
        '      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">\n'
        '        If you didn&rsquo;t request this, you can ignore this email &mdash; nothing will change.\n'
        '      </p>\n'
        '    </div>\n'
        '  </body>\n'
        '</html>'
    )


def send_password_reset(
    to: str,
    reset_url: str,
    name: Optional[str] = None,
    *,
    expires_minutes: int = 30,
    set_first: bool = False,
) -> EmailResult:
    """The one password-reset message.

    `expires_minutes` is passed in rather than read from a constant here, so
    the number in the email is always the number the token was actually minted
    with. A hardcoded one is how an email ends up confidently quoting a
    lifetime the server stopped using two releases ago.

    `set_first` is for an account with no password at all -- one created by
    signing in with Google. The flow is identical and equally safe
    (control of the mailbox is the proof in both cases); only the wording
    changes, because "reset your password" is a confusing thing to read about
    an account you have never given a password to. See
    auth_routes.forgot_password for why such an account is served at all.
    """
    greeting = f"Hi {name}," if name else "Hi,"
    return get_backend().send(
        to=to,
        subject=RESET_SUBJECT,
        body=_reset_body_text(greeting, reset_url, expires_minutes, set_first),
        html=_reset_body_html(greeting, reset_url, expires_minutes, set_first),
    )