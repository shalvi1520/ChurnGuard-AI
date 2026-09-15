"""
Google sign-in: OAuth 2.0 authorization code flow with OpenID
Connect, server-side.

The browser never sees a client secret, an authorization code, or a provider
access token. It is redirected to the provider, the provider redirects it back
to *this* backend with a code, and the code is exchanged for tokens over a
direct server-to-server call. What the browser ends up holding is a ChurnGuard
session cookie and nothing else.

Three things are verified before any identity from a provider is trusted, and
skipping any one of them is a real vulnerability rather than a formality:

  1. `state` -- a random value stored in a short-lived HttpOnly cookie and
     echoed by the provider. Without it, an attacker can feed a victim's
     browser a callback URL carrying the attacker's own authorization code and
     silently sign the victim into the attacker's account (login CSRF).

  2. PKCE -- a random verifier whose SHA-256 is sent up front; the verifier
     itself is only revealed at token exchange. An authorization code
     intercepted in transit is then useless on its own.

  3. The ID token's signature -- checked against the provider's published JWKS
     (fetched via OIDC discovery), with issuer and audience pinned. An ID
     token is otherwise just a base64 blob that anyone can write; verifying it
     is what turns it into a statement by Google.

Only after all three does `sub` -- the provider's stable subject identifier --
get used to look up or create a local account.

No new runtime library beyond what the project already uses: `requests` for
the two server-to-server calls, and `PyJWT` for ID-token verification. PyJWT
needs `cryptography` to check RS256 signatures, so requirements.txt asks for
`pyjwt[crypto]` explicitly rather than hoping another package drags it in.
"""
import base64
import hashlib
import logging
import secrets
import time
from typing import Any, Optional

import jwt
import requests
from jwt import PyJWKClient

from . import config

logger = logging.getLogger(__name__)

_HTTP_TIMEOUT = 10

# Discovery documents change rarely; refetching one on every sign-in would add
# a network round trip to a flow that already has several. Cached in-process
# with a TTL so a provider's endpoint or key rotation is still picked up
# without a restart.
_DISCOVERY_TTL_SECONDS = 3600
_discovery_cache: dict[str, tuple[float, dict]] = {}
# PyJWKClient keeps its own key cache; one per provider, reused.
_jwks_clients: dict[str, PyJWKClient] = {}

STATE_COOKIE_PREFIX = "churnguard_oauth_"
# The state cookie only has to survive the user's trip through the provider's
# consent screen.
STATE_COOKIE_MAX_AGE = 600


class OAuthError(Exception):
    """Something went wrong in the flow.

    `safe_message` is what the user is shown -- a short, non-technical
    sentence. The exception's own text may carry provider detail for the log
    and is never sent to the browser: provider errors quote request
    parameters back, which is a way to leak configuration into a URL the user
    can read.
    """

    def __init__(self, message: str, safe_message: Optional[str] = None):
        super().__init__(message)
        self.safe_message = safe_message or "Sign-in failed. Please try again."


class OAuthNotConfigured(OAuthError):
    """No client id/secret registered for this provider.

    Its own class because it is the expected state of a fresh checkout, not a
    failure: the route turns it into a plain "not configured yet" message
    naming the variables to set, and never into a crash or a fake success.
    """


def get_provider(name: str) -> config.OAuthProviderConfig:
    provider = config.PROVIDERS.get(name)
    if provider is None:
        raise OAuthError(f"Unknown provider {name!r}", "Unknown sign-in provider.")
    return provider


def require_configured(provider: config.OAuthProviderConfig) -> None:
    if not provider.is_configured():
        missing = ", ".join(provider.missing_vars())
        raise OAuthNotConfigured(
            f"{provider.label} OAuth is not configured (missing: {missing})",
            f"{provider.label} sign-in isn't configured on this server yet. "
            f"Set {missing} in backend/.env — see AUTH_SETUP.md.",
        )


def _discover(provider: config.OAuthProviderConfig) -> dict:
    cached = _discovery_cache.get(provider.name)
    if cached and time.time() - cached[0] < _DISCOVERY_TTL_SECONDS:
        return cached[1]
    try:
        response = requests.get(provider.discovery_url, timeout=_HTTP_TIMEOUT)
        response.raise_for_status()
        document = response.json()
    except requests.RequestException as exc:
        raise OAuthError(
            f"Could not fetch {provider.label} OIDC discovery document: {exc}",
            f"Couldn't reach {provider.label} to sign you in. Check your connection and try again.",
        ) from exc
    _discovery_cache[provider.name] = (time.time(), document)
    return document


def _jwks_client(provider: config.OAuthProviderConfig, jwks_uri: str) -> PyJWKClient:
    client = _jwks_clients.get(provider.name)
    if client is None:
        client = PyJWKClient(jwks_uri, cache_keys=True)
        _jwks_clients[provider.name] = client
    return client


# --- step 1: send the user to the provider ----------------------------------


def _pkce_pair() -> tuple[str, str]:
    """(verifier, challenge) for PKCE S256.

    The challenge is base64url of the verifier's SHA-256 with padding
    stripped -- RFC 7636 requires the unpadded form, and leaving the `=` on
    gets the exchange rejected with an unhelpful error.
    """
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def build_authorization_url(provider: config.OAuthProviderConfig) -> tuple[str, str]:
    """Returns `(url, state_payload)`.

    `state_payload` packs the CSRF state and the PKCE verifier into one string
    for the caller to put in a short-lived HttpOnly cookie. Both must survive
    the round trip and neither may be readable by script, so they travel the
    same way.
    """
    require_configured(provider)
    document = _discover(provider)
    authorization_endpoint = document.get("authorization_endpoint")
    if not authorization_endpoint:
        raise OAuthError(f"{provider.label} discovery document has no authorization_endpoint")

    state = secrets.token_urlsafe(32)
    verifier, challenge = _pkce_pair()

    params = {
        "client_id": provider.client_id,
        "response_type": "code",
        "redirect_uri": provider.redirect_uri,
        "scope": provider.scopes,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    if provider.name == "google":
        # Without this Google skips the account chooser once a session exists,
        # which makes "sign in with a different account" impossible from the
        # app's side.
        params["prompt"] = "select_account"

    url = f"{authorization_endpoint}?{requests.compat.urlencode(params)}"
    return url, f"{state}.{verifier}"


def split_state_payload(payload: str) -> tuple[str, str]:
    state, _, verifier = payload.partition(".")
    return state, verifier


# --- step 2: turn the callback into a verified identity ---------------------


def exchange_code(
    provider: config.OAuthProviderConfig, code: str, code_verifier: str
) -> dict[str, Any]:
    """Swaps the authorization code for tokens, server to server."""
    require_configured(provider)
    document = _discover(provider)
    token_endpoint = document.get("token_endpoint")
    if not token_endpoint:
        raise OAuthError(f"{provider.label} discovery document has no token_endpoint")

    try:
        response = requests.post(
            token_endpoint,
            data={
                "client_id": provider.client_id,
                "client_secret": provider.client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": provider.redirect_uri,
                "code_verifier": code_verifier,
            },
            headers={"Accept": "application/json"},
            timeout=_HTTP_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise OAuthError(
            f"{provider.label} token exchange failed: {exc}",
            f"Couldn't reach {provider.label} to complete sign-in. Please try again.",
        ) from exc

    if response.status_code != 200:
        # Logged, never returned: the provider's body quotes back request
        # parameters and configuration detail.
        logger.warning(
            "%s token exchange rejected (HTTP %s)", provider.label, response.status_code
        )
        raise OAuthError(
            f"{provider.label} token exchange returned HTTP {response.status_code}",
            f"{provider.label} rejected the sign-in attempt. Please try again.",
        )
    return response.json()


def verify_id_token(provider: config.OAuthProviderConfig, id_token: str) -> dict[str, Any]:
    """Verifies the ID token's signature and claims, returning them.

    Everything `options` would let us skip is left on. In particular
    `verify_signature` and `verify_aud`: without the first the token is just
    attacker-writable JSON, and without the second a token legitimately issued
    for a *different* application by the same provider would be accepted here
    -- a well-known way to sign in as someone else across apps sharing an
    identity provider.
    """
    document = _discover(provider)
    jwks_uri = document.get("jwks_uri")
    issuer = document.get("issuer")
    if not jwks_uri or not issuer:
        raise OAuthError(f"{provider.label} discovery document is missing jwks_uri/issuer")

    try:
        signing_key = _jwks_client(provider, jwks_uri).get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=provider.client_id,
            # Issuer is verified explicitly in `_check_issuer` below, against
            # the value from the provider's own discovery document, rather than
            # by PyJWT here. Keeping it in one place means the check is read
            # and audited as a single step alongside the discovery lookup that
            # supplies the expected value.
            options={"verify_iss": False},
        )
    except jwt.PyJWTError as exc:
        logger.warning("%s ID token verification failed: %s", provider.label, exc)
        raise OAuthError(
            f"{provider.label} ID token failed verification: {exc}",
            f"Couldn't verify your {provider.label} identity. Please try again.",
        ) from exc

    _check_issuer(provider, issuer, claims)
    return claims


def _check_issuer(
    provider: config.OAuthProviderConfig, expected_issuer: str, claims: dict[str, Any]
) -> None:
    """Exact-match issuer check against the provider's discovery document.

    `expected_issuer` comes from the provider's own published metadata, and
    the token must name it exactly. Dropping the check would be the easy route
    and would accept a correctly-signed token from any issuer at all.
    """
    actual = claims.get("iss", "")
    if actual != expected_issuer:
        raise OAuthError(
            f"{provider.label} ID token issuer mismatch: {actual!r} != {expected_issuer!r}",
            f"Couldn't verify your {provider.label} identity. Please try again.",
        )


class ProviderIdentity:
    """What a verified provider login tells us about a person.

    `email_verified` is carried separately and honestly: Google states it per
    token, and a provider that does not assert it is treated as unverified.
    An unverified address is never auto-linked to an existing account -- see
    auth_routes.link_or_create_user.
    """

    def __init__(
        self,
        *,
        provider: str,
        subject: str,
        email: Optional[str],
        email_verified: bool,
        name: Optional[str],
    ):
        self.provider = provider
        self.subject = subject
        self.email = (email or "").strip().lower() or None
        self.email_verified = email_verified
        self.name = name


def identity_from_claims(
    provider: config.OAuthProviderConfig, claims: dict[str, Any]
) -> ProviderIdentity:
    subject = claims.get("sub")
    if not subject:
        raise OAuthError(f"{provider.label} ID token has no sub claim")

    email = claims.get("email") or claims.get("preferred_username")
    name = claims.get("name") or claims.get("given_name")

    # Only a provider that positively asserts `email_verified` counts as
    # verified. Google states it per token. Absent or false means unverified,
    # which in auth_routes.link_or_create_user means the identity will not be
    # auto-linked to an existing password account with the same address --
    # the safe default for any provider added here later.
    email_verified = bool(claims.get("email_verified"))

    return ProviderIdentity(
        provider=provider.name,
        subject=str(subject),
        email=email,
        email_verified=email_verified,
        name=name,
    )
