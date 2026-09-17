"""
Every knob the authentication system reads from the environment, resolved in
one place.

All of it is backend-only. Nothing here is ever sent to the browser, and
nothing here may be mirrored into a VITE_* variable -- Vite inlines those into
the JavaScript bundle it ships, so a client id put there is public and a
client *secret* put there is published to every visitor. The frontend never
needs any of it: it only ever links to `/api/auth/google`, and the backend
does the rest.

Missing OAuth credentials are not an error at import time. The app has to
start and serve the churn pipeline whether or not anyone has registered a
Google application, so absence is recorded and reported by the route as a
clear configuration message. `is_configured()` is what the routes check;
there is no code path that treats unconfigured as "let them in".
"""
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

# Same explicit path as db/database.py -- see its comment for why the default
# frame-guessing behaviour is unreliable here.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)


def _env(name: str) -> Optional[str]:
    """Empty string and whitespace count as unset.

    .env.example ships these keys with empty values, and a copied-but-unfilled
    .env is the single most common way to arrive here. `GOOGLE_CLIENT_ID=`
    must mean "not configured", not "configured as the empty string" -- the
    latter produces a baffling error from Google rather than a useful one from
    us.
    """
    value = os.getenv(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


# --- where the two halves of the app live -----------------------------------

# Used to build OAuth redirect URIs and the link in a password-reset email.
# Both must be absolute, and the frontend one is also the only origin the
# OAuth callback will ever redirect a browser to (see _safe_frontend_redirect
# in auth_routes.py) -- an open redirect off the back of a login callback is a
# standard phishing primitive, so the destination is derived from this rather
# than taken from the request.
FRONTEND_URL = _env("FRONTEND_URL") or "http://localhost:5173"
BACKEND_URL = _env("BACKEND_URL") or "http://localhost:8000"


# --- session cookie ---------------------------------------------------------

SESSION_COOKIE_NAME = "churnguard_session"

# Secure=True requires HTTPS, which localhost dev servers are not. Defaulting
# it off would be the convenient choice and the wrong one -- a production
# deploy that forgets to set it would ship session cookies over plaintext. So
# it follows APP_ENV, and any value other than "development" gets the secure
# treatment.
APP_ENV = (_env("APP_ENV") or "development").lower()
IS_PRODUCTION = APP_ENV != "development"

# Lax, not Strict, and not None.
#
# Lax is what makes the OAuth callback work at all: the provider redirects the
# browser to us as a top-level GET, and a Strict cookie is withheld on exactly
# that kind of cross-site navigation -- the user would land back on the app
# still signed out. Lax sends it, while still withholding the cookie from
# cross-site POSTs and subresource requests, which is the CSRF protection
# being relied on here.
#
# None would be required if the API were on a different registrable domain
# than the app, and would then also require Secure. In development both are
# on `localhost` -- differing ports do not make two sites for cookie purposes
# -- so Lax works, and is the stricter choice.
SESSION_COOKIE_SAMESITE = (_env("SESSION_COOKIE_SAMESITE") or "lax").lower()
SESSION_COOKIE_DOMAIN = _env("SESSION_COOKIE_DOMAIN")

# SameSite=None without Secure is rejected outright by every current browser:
# the cookie is simply never stored, and the only symptom is that sign-in
# appears to succeed and the user is immediately signed out again -- with
# nothing in the server log to explain it. Someone reaching for `none` is
# configuring a cross-site deployment, which has to be HTTPS anyway, so the
# combination is always a misconfiguration rather than a deliberate choice.
# Failing at startup with a sentence naming the fix beats shipping an app
# whose sessions silently never persist.
if SESSION_COOKIE_SAMESITE == "none" and not IS_PRODUCTION:
    raise RuntimeError(
        "SESSION_COOKIE_SAMESITE=none requires a Secure cookie, which this server only "
        "sets when APP_ENV is not 'development'. Browsers discard a SameSite=None cookie "
        "that isn't Secure, so sessions would never persist. Set APP_ENV=production "
        "(and serve over HTTPS), or leave SESSION_COOKIE_SAMESITE at 'lax'."
    )


# --- OAuth providers --------------------------------------------------------


@dataclass(frozen=True)
class OAuthProviderConfig:
    """One provider's registered application.

    `discovery_url` rather than hardcoded endpoints: both providers publish
    OIDC discovery documents listing their current authorization, token and
    JWKS URLs, and reading them means a provider rotating a signing key or
    moving an endpoint does not require a code change here.
    """

    name: str
    label: str
    client_id: Optional[str]
    client_secret: Optional[str]
    redirect_uri: str
    discovery_url: str
    scopes: str

    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def missing_vars(self) -> list[str]:
        prefix = self.name.upper()
        missing = []
        if not self.client_id:
            missing.append(f"{prefix}_CLIENT_ID")
        if not self.client_secret:
            missing.append(f"{prefix}_CLIENT_SECRET")
        return missing


GOOGLE = OAuthProviderConfig(
    name="google",
    label="Google",
    client_id=_env("GOOGLE_CLIENT_ID"),
    client_secret=_env("GOOGLE_CLIENT_SECRET"),
    redirect_uri=_env("GOOGLE_REDIRECT_URI") or f"{BACKEND_URL}/api/auth/google/callback",
    discovery_url="https://accounts.google.com/.well-known/openid-configuration",
    scopes="openid email profile",
)

# The registry the OAuth routes and `GET /api/auth/providers` are driven by.
# Adding a provider here is what makes `/api/auth/{provider}` answer for it;
# nothing else needs to change. Google is currently the only one.
PROVIDERS = {"google": GOOGLE}


# --- outbound email ---------------------------------------------------------
#
# Absent both a Resend key and SMTP settings means password-reset emails
# genuinely cannot be sent, and the app says exactly that rather than showing
# a "check your inbox" screen for a message that was never dispatched. See
# auth/email_service.py.

SMTP_HOST = _env("SMTP_HOST")
SMTP_PORT = int(_env("SMTP_PORT") or "587")
SMTP_USERNAME = _env("SMTP_USERNAME")
SMTP_PASSWORD = _env("SMTP_PASSWORD")
SMTP_FROM = _env("SMTP_FROM") or "ChurnGuard <no-reply@churnguard.local>"
SMTP_USE_TLS = (_env("SMTP_USE_TLS") or "true").lower() != "false"

# Resend (https://resend.com) sends over HTTPS rather than raw SMTP, which
# several hosts -- Render included -- block outbound on standard tiers to
# prevent spam abuse. Preferred over SMTP when set; see
# email_service.get_backend().
RESEND_API_KEY = _env("RESEND_API_KEY")


def email_is_configured() -> bool:
    """Whether this server can actually deliver mail.

    Deliberately a property of the *server*, not of any particular send. The
    forgot-password response reports this value, and it must therefore depend
    on nothing about the address that was submitted -- see the enumeration note
    in auth_routes.forgot_password.
    """
    return bool(RESEND_API_KEY or SMTP_HOST)


# --- rate limiting ----------------------------------------------------------
#
# In-process sliding windows; see auth/rate_limit.py for what that does and
# does not protect. Set any of these to 0 to disable that window.

RESET_RATE_LIMIT_WINDOW_MINUTES = int(_env("RESET_RATE_LIMIT_WINDOW_MINUTES") or "15")

# Per submitted email address. Three links in a quarter of an hour is more than
# anyone genuinely resetting a password needs, and well below what makes the
# endpoint useful as a way to bombard someone's inbox.
RESET_RATE_LIMIT_PER_EMAIL = int(_env("RESET_RATE_LIMIT_PER_EMAIL") or "3")

# Per source address, across all emails -- this is the one that stops a single
# host walking a list of addresses. Higher than the per-email limit because a
# shared office NAT or a university network is legitimately many people.
RESET_RATE_LIMIT_PER_IP = int(_env("RESET_RATE_LIMIT_PER_IP") or "10")

# Redemptions per source address. Guessing a 256-bit token is not a threat this
# defends against (nothing could guess one); the limit is there so the endpoint
# cannot be used as a free bcrypt-cost generator.
RESET_REDEEM_RATE_LIMIT_PER_IP = int(_env("RESET_REDEEM_RATE_LIMIT_PER_IP") or "20")

# Whether X-Forwarded-For may be believed. Off unless the deployment actually
# sits behind a proxy that sets it -- otherwise any caller can forge a new
# source address per request and the IP windows above become decorative.
TRUST_PROXY_HEADERS = (_env("TRUST_PROXY_HEADERS") or "false").lower() == "true"