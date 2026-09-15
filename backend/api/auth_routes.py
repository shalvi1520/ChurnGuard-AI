"""
Real user accounts: signup, login, sign-out, OAuth sign-in, password reset,
and the current-user lookup every other authenticated endpoint depends on.

Sessions are server-side rows (models.UserSession) addressed by an opaque
token in an HttpOnly cookie -- not a JWT in localStorage. The change matters
for one reason above all: **sign-out has to actually end the session.** A JWT
stays valid until it expires no matter what the server has since decided, so
the old "logout" only deleted the client's copy while the token itself kept
working for the rest of the week. Deleting a row does not have that problem.
See backend/auth/sessions.py for the rest of the reasoning.

`Authorization: Bearer <jwt>` is still accepted as a secondary credential for
scripting and for the backend's own tests. That is a signed token verified the
same way it always was, not a bypass -- but it is never how the browser
authenticates, and the frontend no longer stores a token anywhere.
"""
import datetime
import logging
import re
import urllib.parse
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Cookie,
    Depends,
    Header,
    HTTPException,
    Request,
    Response,
)
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from ..auth import config as auth_config
from ..auth import email_service, oauth, rate_limit, sessions
from ..db import security
from ..db.database import SessionLocal, get_db
from ..db.models import OAuthAccount, PasswordResetToken, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# One message for "no such account" and for "wrong password" alike. Telling
# the two apart turns the login form into an oracle for which email addresses
# have accounts here, which is worth something to anyone preparing a targeted
# phishing or credential-stuffing run.
_INVALID_CREDENTIALS = "Invalid email or password."


def _run_resilient(operation):
    """Runs `operation(db)` on a short-lived session, retrying once on a
    dropped connection.

    Neon can drop a pooled connection out from under a request that's been
    sitting idle for a while (a 1-2 minute training run with no DB activity in
    between, for instance) -- `pool_pre_ping` and `pool_recycle` (see
    database.py) cut this down a lot, but Neon can still kill a connection in
    the narrow gap between the pre-ping check and the real query. Since this
    runs on every single authenticated request, one transient OperationalError
    used to take down whatever the user was actually trying to do (predict,
    history, outreach...) with an unrelated-looking 500. A fresh SessionLocal()
    is a fresh connection, so retrying once rides out the occasional drop.

    The session is opened and closed here rather than injected with
    `Depends(get_db)` on purpose -- see get_current_user's docstring.
    """
    for attempt in (1, 2):
        db = SessionLocal()
        try:
            return operation(db)
        except OperationalError:
            if attempt == 2:
                raise
        finally:
            db.close()
    return None  # unreachable; keeps type checkers happy


def _user_out(user: User, auth_method: Optional[str] = None) -> dict:
    """The only shape a user is ever returned in.

    Built field by field rather than by serialising the model, so a column
    added to `users` later cannot start leaking by default. password_hash in
    particular must never appear here.

    `auth_provider` reports how this session was opened; `linked_providers`
    lists every method the account can use, so an account with both a password
    and a linked Google identity is represented accurately instead of having
    to be flattened into one value.
    """
    linked = [a.provider for a in user.oauth_accounts]
    if user.password_hash:
        linked.insert(0, "password")
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "company": user.company,
        "auth_provider": auth_method or (linked[0] if linked else "password"),
        "linked_providers": linked,
    }


# --- request models ---------------------------------------------------------


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str
    company: Optional[str] = None
    # The signup form's Terms checkbox, re-checked here. The frontend already
    # blocks submission without it, but a frontend check is a UX affordance,
    # not a control -- the API is reachable directly.
    acceptedTerms: bool = False
    remember: bool = False

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("That doesn't look like a valid email address.")
        return v

    @field_validator("password")
    @classmethod
    def _valid_password(cls, v: str) -> str:
        problem = security.validate_password(v)
        if problem:
            raise ValueError(problem)
        return v

    @field_validator("name")
    @classmethod
    def _valid_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required.")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str
    remember: bool = False


class ForgotPasswordRequest(BaseModel):
    """The submitted address, normalised and format-checked.

    Normalising here rather than in the route means the rate limiter, the
    database lookup and the outbound email all key on the same string --
    `  Ada@Example.COM ` and `ada@example.com` are one account and must count
    as one bucket, or the per-email limit is bypassed by pressing shift.

    Rejecting a malformed address with a 422 is not an enumeration leak: it is
    a statement about the syntax of what was typed, identical for every
    registered and unregistered address alike. Accepting it instead would mean
    cheerfully reporting "check your inbox" for `not an email`, which teaches
    the user nothing and mints a rate-limit bucket for a string that could
    never have an account.
    """

    email: str

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not v:
            raise ValueError("Enter the email address on your account.")
        if not _EMAIL_RE.match(v):
            raise ValueError("That doesn't look like a valid email address.")
        return v


class ResetPasswordRequest(BaseModel):
    """A reset link's token plus the password to set behind it.

    The password validator is the same `security.validate_password` the signup
    form runs through, so a password that could not be registered cannot be
    arrived at by reset either -- a bypass that is easy to leave open when the
    two paths validate separately.
    """

    token: str
    password: str

    @field_validator("token")
    @classmethod
    def _present(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This reset link is missing its token.")
        return v

    @field_validator("password")
    @classmethod
    def _valid_password(cls, v: str) -> str:
        problem = security.validate_password(v)
        if problem:
            raise ValueError(problem)
        return v


# --- email/password ---------------------------------------------------------


@router.post("/signup", status_code=201)
def signup(body: SignupRequest, response: Response, db: Session = Depends(get_db)):
    if not body.acceptedTerms:
        raise HTTPException(400, "Please accept the Terms of Service and Privacy Policy.")

    if db.query(User).filter(User.email == body.email).first():
        # 409 and a specific message, unlike the login path's deliberate
        # vagueness. Signup cannot hide which emails are taken -- it has to
        # refuse the duplicate to be usable at all -- so pretending otherwise
        # would cost clarity and buy no real secrecy.
        raise HTTPException(409, "An account with this email already exists.")

    user = User(
        email=body.email,
        password_hash=security.hash_password(body.password),
        name=body.name,
        company=(body.company or "").strip() or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    raw_token, _ = sessions.create_session(db, user, remember=body.remember, auth_method="password")
    sessions.set_session_cookie(response, raw_token, remember=body.remember)
    return {"user": _user_out(user, "password")}


@router.post("/login")
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    # One branch, one message. Note this also covers an OAuth-only account
    # (password_hash is NULL): verify_password returns False for it rather
    # than raising, so "sign in with Google, then try a password" fails the
    # same indistinguishable way instead of revealing how the account is set up.
    if not user or not security.verify_password(body.password, user.password_hash):
        raise HTTPException(401, _INVALID_CREDENTIALS)
    if not user.is_active:
        raise HTTPException(403, "This account has been deactivated.")

    user.last_login_at = datetime.datetime.utcnow()
    db.commit()

    raw_token, _ = sessions.create_session(db, user, remember=body.remember, auth_method="password")
    sessions.set_session_cookie(response, raw_token, remember=body.remember)
    return {"user": _user_out(user, "password")}


@router.post("/logout")
def logout(
    response: Response,
    churnguard_session: Optional[str] = Cookie(None, alias=auth_config.SESSION_COOKIE_NAME),
):
    """Ends the current session.

    Always 200, even with no cookie or an unrecognised one. Signing out is
    idempotent: the desired end state is "not signed in", and if that is
    already true there is nothing to report as an error. The cookie is cleared
    either way, so a client holding a token the server has forgotten still
    ends up clean.
    """
    revoked = False
    if churnguard_session:
        revoked = _run_resilient(lambda db: sessions.revoke_session(db, churnguard_session))
    sessions.clear_session_cookie(response)
    return {"ok": True, "revoked": bool(revoked)}


# --- current user -----------------------------------------------------------


def _resolve_user(
    session_cookie: Optional[str], authorization: Optional[str]
) -> tuple[Optional[User], Optional[str]]:
    """Returns `(user, auth_method)` for whichever credential is present.

    Cookie first: it is the browser's mechanism and the only revocable one.
    The Bearer header is the fallback for scripts and tests.
    """
    if session_cookie:
        def lookup(db):
            row = sessions.lookup_session(db, session_cookie)
            if row is None:
                return None, None
            # Touch the relationships while the session is open; the caller
            # gets a detached instance once this returns.
            _ = row.user.oauth_accounts
            return row.user, row.auth_method

        user, method = _run_resilient(lookup)
        if user is not None:
            return user, method

    if authorization and authorization.startswith("Bearer "):
        user_id = security.decode_access_token(authorization.removeprefix("Bearer ").strip())
        if user_id:
            def lookup_by_id(db):
                user = db.get(User, user_id)
                if user is not None:
                    _ = user.oauth_accounts
                return user

            user = _run_resilient(lookup_by_id)
            if user is not None and user.is_active:
                return user, "password"

    return None, None


def get_current_user(
    churnguard_session: Optional[str] = Cookie(None, alias=auth_config.SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(None),
) -> User:
    """Required auth: raises 401 if there's no valid session.

    Deliberately does NOT take `db: Session = Depends(get_db)`. A FastAPI
    dependency's session is only closed after the whole request finishes --
    not after this function returns -- so every route behind this dependency
    was holding a Neon connection checked out for as long as the route body
    took to run: a full Optuna retrain, a SHAP pass, an LLM outreach draft,
    sometimes minutes. A handful of those in flight at once (including the
    frontend's habit of firing some GETs twice) was enough to exhaust the pool
    and make every other request -- even a plain, otherwise-instant GET
    /datasets/history -- queue for the full 30s pool timeout and then fail with
    `QueuePool limit ... connection timed out`. Opening and closing a session
    just for this one lookup returns the connection to the pool immediately,
    before the route's real work even starts.
    """
    user, _ = _resolve_user(churnguard_session, authorization)
    if user is None:
        raise HTTPException(401, "Sign in required.")
    return user


def get_current_user_optional(
    churnguard_session: Optional[str] = Cookie(None, alias=auth_config.SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(None),
) -> Optional[User]:
    """Same as get_current_user, but returns None instead of raising -- used by
    dataset routes so the upload/train/predict pipeline keeps working exactly
    as before for a signed-out session; being signed in only adds persisted
    history and skips retraining an already-seen dataset. See
    get_current_user's docstring for why this manages its own short-lived
    session instead of taking one as a FastAPI dependency."""
    user, _ = _resolve_user(churnguard_session, authorization)
    return user


@router.get("/me")
def me(
    churnguard_session: Optional[str] = Cookie(None, alias=auth_config.SESSION_COOKIE_NAME),
    authorization: Optional[str] = Header(None),
):
    """The signed-in user, or 401.

    This is what the frontend calls once on startup to restore a session, so
    the backend -- not localStorage -- is the source of truth for whether
    someone is signed in.
    """
    user, method = _resolve_user(churnguard_session, authorization)
    if user is None:
        raise HTTPException(401, "Sign in required.")
    return _user_out(user, method)


# --- OAuth ------------------------------------------------------------------


# Matches only a loopback origin, with any port. Used to let development
# tolerate Vite's port hopping (5173 -> 5174 -> 5178 ...) without every
# OAuth sign-in redirecting to whichever port FRONTEND_URL was written for.
_LOCALHOST_ORIGIN_RE = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")


def _request_origin(request: Optional[Request]) -> Optional[str]:
    """The origin the browser was on, from the request itself.

    `Origin` for an XHR (the forgot-password POST has one). For a top-level
    navigation there is no Origin header, so the referring page's origin is
    used instead -- which is what `GET /api/auth/google` sees when the app
    navigates to it.
    """
    if request is None:
        return None
    origin = request.headers.get("origin") or ""
    if not origin:
        referer = request.headers.get("referer") or ""
        if referer:
            parts = urllib.parse.urlsplit(referer)
            if parts.scheme and parts.netloc:
                origin = f"{parts.scheme}://{parts.netloc}"
    return origin or None


def _resolve_frontend_origin(candidate: Optional[str]) -> str:
    """Where the browser may be sent back to.

    In production this is *always* config.FRONTEND_URL. A login flow that
    redirects to a caller-supplied URL is an open redirect, and a particularly
    effective phishing primitive because the user has just legitimately
    authenticated.

    In development a candidate origin wins, but only if it matches
    `_LOCALHOST_ORIGIN_RE`. Vite increments its port whenever the previous one
    is taken, so a developer is routinely on :5178 while FRONTEND_URL still
    says :5173. The symptom of that mismatch is a sign-in that completes and
    then lands on a dead port -- which reads as a broken login rather than a
    configuration problem. The regex is the control: it cannot match an
    external host, so the worst achievable outcome is redirecting a
    developer's own browser to another port on their own machine.
    """
    if not auth_config.IS_PRODUCTION and candidate:
        candidate = candidate.rstrip("/")
        if _LOCALHOST_ORIGIN_RE.match(candidate):
            return candidate
    return auth_config.FRONTEND_URL.rstrip("/")


def _frontend_url(path: str, _origin: Optional[str] = None, **params) -> str:
    """Builds a URL on the frontend origin -- see _resolve_frontend_origin."""
    base = _resolve_frontend_origin(_origin)
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    return f"{base}{path}{query}"


def _oauth_error_redirect(message: str, origin: Optional[str] = None) -> RedirectResponse:
    return RedirectResponse(_frontend_url("/login", _origin=origin, error=message), status_code=303)


# Carries the app's own origin across the trip to the provider and back.
#
# The callback cannot work this out for itself: it arrives as a top-level
# redirect *from the provider*, so it has no Origin header and its Referer is
# the provider's domain, not the app's. The origin is therefore captured at
# sign-in start -- where the Referer genuinely is the app's page -- and parked
# in this cookie until the callback reads it. Development only; in production
# FRONTEND_URL is authoritative and this cookie is never set or consulted.
ORIGIN_COOKIE_NAME = "churnguard_oauth_origin"


def _state_cookie_name(provider: str) -> str:
    return f"{oauth.STATE_COOKIE_PREFIX}{provider}"


@router.get("/providers")
def oauth_providers():
    """Which providers this server can actually perform, for the sign-in page.

    Lets the UI disable a button and explain why, instead of offering one that
    dead-ends. Reports only booleans and labels -- never a client id, and
    obviously never a secret.

    Declared before the `/{provider}` routes below deliberately: FastAPI
    matches in registration order, so with these the other way round
    `GET /api/auth/providers` would be captured by the catch-all as a provider
    literally named "providers".
    """
    return {
        "providers": [
            {"name": p.name, "label": p.label, "configured": p.is_configured()}
            for p in auth_config.PROVIDERS.values()
        ]
    }


@router.get("/{provider}/authorize")
@router.get("/{provider}")
def oauth_start(provider: str, request: Request):
    """Sends the user to the provider's consent screen.

    Both `/api/auth/google` and `/api/auth/google/authorize` land here so the
    frontend can link to the short form.

    A missing client id/secret produces a 503 carrying the names of the
    variables to set -- never a crash, and never a pretend sign-in.
    """
    try:
        config_ = oauth.get_provider(provider)
        url, state_payload = oauth.build_authorization_url(config_)
    except oauth.OAuthNotConfigured as exc:
        logger.warning("OAuth start refused: %s", exc)
        raise HTTPException(503, exc.safe_message) from exc
    except oauth.OAuthError as exc:
        logger.warning("OAuth start failed: %s", exc)
        raise HTTPException(502, exc.safe_message) from exc

    response = RedirectResponse(url, status_code=303)
    # The CSRF state and PKCE verifier ride in an HttpOnly cookie. They must
    # survive a top-level redirect back from the provider, so SameSite=lax --
    # strict would withhold the cookie on exactly that navigation and break
    # every sign-in.
    response.set_cookie(
        key=_state_cookie_name(provider),
        value=state_payload,
        httponly=True,
        secure=auth_config.IS_PRODUCTION,
        samesite="lax",
        max_age=oauth.STATE_COOKIE_MAX_AGE,
        path="/",
    )

    # This request is a top-level navigation from the app, so its Referer is
    # the app's own page -- the last point in the flow where the frontend's
    # real origin (and therefore its real port) is visible. The callback sees
    # only the provider's domain, so the value is parked here for it to read.
    # Development only; in production FRONTEND_URL is authoritative.
    if not auth_config.IS_PRODUCTION:
        origin = _request_origin(request)
        if origin and _LOCALHOST_ORIGIN_RE.match(origin.rstrip("/")):
            response.set_cookie(
                key=ORIGIN_COOKIE_NAME,
                value=origin.rstrip("/"),
                httponly=True,
                secure=False,
                samesite="lax",
                max_age=oauth.STATE_COOKIE_MAX_AGE,
                path="/",
            )
    return response


def link_or_create_user(
    db: Session, identity: oauth.ProviderIdentity
) -> User:
    """Resolves a verified provider identity to a local account.

    Three cases, in strict order:

    1. This provider subject is already linked -> that user. The subject, not
       the email, is the key (see models.OAuthAccount).

    2. No link yet, but an account exists with the same email. This is the
       dangerous one, and it is allowed **only if the provider vouched that
       the email is verified**. Auto-linking on an unverified address means
       anyone who can get a provider to assert `alice@corp.com` -- by signing
       up there with it and never proving ownership -- takes over Alice's
       ChurnGuard account. Google states verification per token; a provider that
       see oauth.identity_from_claims. Unverified gets a clear refusal telling
       the user to sign in with their password instead, which is safe because
       they still can.

    3. Otherwise a new account, with no password (password_hash NULL). Such an
       account can use the reset-password flow to add one later.
    """
    existing_link = (
        db.query(OAuthAccount)
        .filter(
            OAuthAccount.provider == identity.provider,
            OAuthAccount.provider_account_id == identity.subject,
        )
        .first()
    )
    if existing_link:
        user = existing_link.user
        if not user.is_active:
            raise oauth.OAuthError(
                f"Inactive account {user.id}", "This account has been deactivated."
            )
        return user

    if not identity.email:
        raise oauth.OAuthError(
            f"{identity.provider} returned no email claim",
            "Your account didn't share an email address, which ChurnGuard needs to create an account.",
        )

    by_email = db.query(User).filter(User.email == identity.email).first()
    if by_email is not None:
        if not identity.email_verified:
            raise oauth.OAuthError(
                f"Refusing to auto-link unverified {identity.provider} email {identity.email}",
                "An account already exists with this email address. Sign in with your "
                "password instead, or use a provider account with a verified email.",
            )
        if not by_email.is_active:
            raise oauth.OAuthError(
                f"Inactive account {by_email.id}", "This account has been deactivated."
            )
        db.add(
            OAuthAccount(
                user_id=by_email.id,
                provider=identity.provider,
                provider_account_id=identity.subject,
                provider_email=identity.email,
            )
        )
        db.commit()
        return by_email

    user = User(
        email=identity.email,
        # No password. This is an OAuth-only account until someone sets one.
        password_hash=None,
        name=identity.name or identity.email.split("@")[0],
    )
    db.add(user)
    db.flush()
    db.add(
        OAuthAccount(
            user_id=user.id,
            provider=identity.provider,
            provider_account_id=identity.subject,
            provider_email=identity.email,
        )
    )
    db.commit()
    db.refresh(user)
    return user


@router.get("/{provider}/callback")
def oauth_callback(
    provider: str,
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Where the provider sends the browser back.

    Everything that can go wrong here ends in a redirect to the frontend
    carrying a short, safe message -- never a JSON error page, and never a
    stack trace. The user is in a browser mid-navigation; an API error body
    would be a dead end.
    """
    # Validate the provider name before it is used to build anything. It is an
    # unvalidated path segment until this point, and the very next thing done
    # with it is to construct a cookie name -- a header value. Starlette's
    # cookie handling would reject a malformed name with an exception rather
    # than emit it, so this is not an injection hole, but it would turn a
    # nonsense URL into a 500 instead of the redirect every other failure here
    # produces.
    # The origin parked at sign-in start, so a dev server on a non-default
    # Vite port gets redirected back to itself rather than to FRONTEND_URL's
    # stale port. Validated by _resolve_frontend_origin before use.
    app_origin = request.cookies.get(ORIGIN_COOKIE_NAME)

    try:
        oauth.get_provider(provider)
    except oauth.OAuthError:
        return _oauth_error_redirect("Unknown sign-in provider.", app_origin)

    state_cookie_name = _state_cookie_name(provider)
    expected_payload = request.cookies.get(state_cookie_name)

    def finish(response: RedirectResponse) -> RedirectResponse:
        # Both cookies are single-use, whatever the outcome.
        response.delete_cookie(state_cookie_name, path="/")
        response.delete_cookie(ORIGIN_COOKIE_NAME, path="/")
        return response

    # The user pressed Cancel, or the provider refused. Not an error worth
    # logging loudly -- it's a normal thing for someone to do.
    if error:
        logger.info("OAuth %s callback returned error=%s", provider, error)
        if error in ("access_denied", "consent_required", "login_required"):
            return finish(_oauth_error_redirect("Sign-in was cancelled.", app_origin))
        return finish(_oauth_error_redirect("Sign-in failed. Please try again.", app_origin))

    if not code or not state:
        return finish(_oauth_error_redirect("Sign-in failed. Please try again.", app_origin))

    # The CSRF check. Without a matching state cookie, this callback could
    # have been triggered by anyone -- including an attacker feeding a victim
    # a callback URL bearing the attacker's own code, which would silently
    # sign the victim into the attacker's account.
    if not expected_payload:
        return finish(
            _oauth_error_redirect("Your sign-in attempt expired. Please try again.", app_origin)
        )
    expected_state, verifier = oauth.split_state_payload(expected_payload)
    if not expected_state or not security.tokens_equal(expected_state, state):
        logger.warning("OAuth %s state mismatch", provider)
        return finish(_oauth_error_redirect("Sign-in failed a security check. Please try again.", app_origin))

    try:
        provider_config = oauth.get_provider(provider)
        tokens = oauth.exchange_code(provider_config, code, verifier)
        id_token = tokens.get("id_token")
        if not id_token:
            raise oauth.OAuthError(f"{provider} token response carried no id_token")
        claims = oauth.verify_id_token(provider_config, id_token)
        identity = oauth.identity_from_claims(provider_config, claims)
        user = link_or_create_user(db, identity)
    except oauth.OAuthNotConfigured as exc:
        logger.warning("OAuth callback on unconfigured provider: %s", exc)
        return finish(_oauth_error_redirect(exc.safe_message, app_origin))
    except oauth.OAuthError as exc:
        # Full detail to the log, safe sentence to the user.
        logger.warning("OAuth %s callback failed: %s", provider, exc)
        return finish(_oauth_error_redirect(exc.safe_message, app_origin))

    user.last_login_at = datetime.datetime.utcnow()
    db.commit()

    # OAuth sign-ins get a persistent session: there is no Remember-me
    # checkbox on the provider's consent screen, and bouncing someone back
    # through Google every twelve hours is the wrong default.
    raw_token, _ = sessions.create_session(db, user, remember=True, auth_method=provider)

    # Land on a dedicated frontend route rather than deep-linking into the
    # app. That page calls /auth/me once and then routes onward, so the
    # session is established before any protected page renders -- no flash of
    # a signed-out screen, and no race between the cookie arriving and the
    # route guard reading it.
    response = RedirectResponse(_frontend_url("/auth/callback", _origin=app_origin), status_code=303)
    sessions.set_session_cookie(response, raw_token, remember=True)
    return finish(response)


# --- password reset ---------------------------------------------------------
#
# The whole flow, and the two properties it is built around:
#
#   1. What the user receives is never what the server stores. A 256-bit
#      urlsafe token goes in the email; only its SHA-256 goes in the database.
#      A dump of `password_reset_tokens` yields nothing replayable.
#
#   2. Nothing in the response varies with whether the address has an account.
#      Not the message, not the status code, not the `emailDelivered` flag, not
#      the presence of `developerNotice`, and -- because the mail is dispatched
#      after the response -- not the timing either. Each of those is a place a
#      previous version of this endpoint did leak, or could have.

# Said to everyone, whether or not the address has an account. The alternative
# -- "no account with that email" -- is a free account-existence oracle, and
# an unauthenticated one.
_RESET_ACCEPTED = (
    "If an account exists for that email, we've sent a link to reset the password."
)

_RESET_LINK_DEAD = "This reset link is invalid or has expired. Please request a new one."

# In-process sliding windows; see auth/rate_limit.py for exactly what that
# does and does not protect (short version: one worker's worth).
#
# The per-email window is checked on the *submitted* address, before any
# database lookup, so a 429 says nothing about whether that address is
# registered. Checking it after the lookup -- the obvious ordering -- would
# reinstate the enumeration oracle the generic response above exists to close.
_WINDOW_SECONDS = auth_config.RESET_RATE_LIMIT_WINDOW_MINUTES * 60

_forgot_by_email = rate_limit.SlidingWindow(
    auth_config.RESET_RATE_LIMIT_PER_EMAIL, _WINDOW_SECONDS, name="forgot-password/email"
)
_forgot_by_ip = rate_limit.SlidingWindow(
    auth_config.RESET_RATE_LIMIT_PER_IP, _WINDOW_SECONDS, name="forgot-password/ip"
)
_redeem_by_ip = rate_limit.SlidingWindow(
    auth_config.RESET_REDEEM_RATE_LIMIT_PER_IP, _WINDOW_SECONDS, name="reset-password/ip"
)


def _reset_rate_limiters() -> tuple:
    """The three windows, for tests that need to clear them between cases."""
    return (_forgot_by_email, _forgot_by_ip, _redeem_by_ip)


def _too_many(decision: rate_limit.Decision) -> HTTPException:
    """429 with a Retry-After header.

    A number of seconds rather than a bare refusal: it is a real instruction to
    a well-behaved client, and the only way a person staring at the form learns
    that waiting is the fix rather than retyping their address.
    """
    return HTTPException(
        status_code=429,
        detail="Too many password reset requests. Please wait a few minutes and try again.",
        headers={"Retry-After": str(decision.retry_after)},
    )


def _delivery_notice() -> Optional[str]:
    """The developer-facing explanation when this server cannot send mail.

    Derived from configuration alone, and therefore identical for a registered
    address and an unregistered one. The previous version of this endpoint
    returned `emailDelivered: True` for an unknown email and `False` plus this
    notice for a known one -- which, on the default development setup with no
    SMTP, told any anonymous caller exactly which addresses had accounts. That
    was a real disclosure, in the one endpoint written specifically to avoid
    it.
    """
    if email_service.delivery_is_configured():
        return None
    return (
        "Email delivery isn't configured on this server "
        "(set SMTP_HOST in backend/.env). If an account exists for that "
        "address, the reset link was written to the backend log instead. "
        "See AUTH_SETUP.md."
    )


def _deliver_reset_email(to: str, reset_url: str, name: Optional[str], set_first: bool) -> None:
    """Sends the message. Runs after the response, via BackgroundTasks.

    Deferring it is not (only) about latency. An SMTP conversation takes real,
    variable time, and it happens on exactly one branch of this endpoint -- the
    one where the address has an account. Doing it inline makes response time a
    side channel for account existence, which is the one fact the whole design
    is trying not to disclose. Answering first and mailing after removes the
    difference at the source instead of trying to mask it.

    Failures are logged and go no further. There is no caller left to report
    them to, and reporting a send failure to an anonymous requester would
    re-open the same channel from the other end: it can only ever happen for an
    address that has an account.
    """
    try:
        result = email_service.send_password_reset(
            to,
            reset_url,
            name,
            expires_minutes=security.RESET_TOKEN_MINUTES,
            set_first=set_first,
        )
        if not result.delivered:
            logger.warning("Password reset email not delivered: %s", result.detail)
    except Exception:  # noqa: BLE001 -- a background task must not crash the worker
        logger.exception("Password reset email failed to send")


@router.post("/forgot-password")
def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Issues a reset link for the address, if it has an account.

    Always 200 with the same body, whatever the answer to that `if`. The only
    non-200 outcomes are a malformed address (422, from the pydantic validator
    -- a syntax fact about the submission, disclosing nothing about who is
    registered) and rate limiting (429, applied before the lookup for the same
    reason).
    """
    email = body.email  # already normalised and format-checked by the validator

    ip_decision = _forgot_by_ip.check(
        rate_limit.client_ip(request, auth_config.TRUST_PROXY_HEADERS)
    )
    if not ip_decision.allowed:
        raise _too_many(ip_decision)

    email_decision = _forgot_by_email.check(email)
    if not email_decision.allowed:
        raise _too_many(email_decision)

    # Built once, before the branch, so both paths return identical bodies.
    # Assembling it separately on each branch is how the two drift apart again.
    accepted = {
        "message": _RESET_ACCEPTED,
        "emailDelivered": email_service.delivery_is_configured(),
        "expiresInMinutes": security.RESET_TOKEN_MINUTES,
    }
    notice = _delivery_notice()
    if notice:
        accepted["developerNotice"] = notice

    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        # No token, no email, same response.
        return accepted

    # Any earlier unused token for this user stops working now. Otherwise
    # asking for three resets would leave three live links, each a separate
    # thing that can leak.
    (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .update({"used_at": datetime.datetime.utcnow()})
    )

    raw_token = security.generate_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=security.hash_token(raw_token),
            expires_at=security.reset_expiry(),
        )
    )
    db.commit()

    # An account with no password at all -- created by signing in with Google
    # sign-in. It is served exactly like any other, and that is the
    # considered position rather than an oversight:
    #
    #   * The proof is the same. Every password reset in this system rests on
    #     control of the mailbox; an OAuth-only account is no different, and
    #     its address was asserted by the provider rather than typed by a
    #     stranger.
    #   * Refusing would leak. "This account uses Google" is an accurate
    #     statement about a specific address, returned to an anonymous caller,
    #     and the entire endpoint is built not to make statements like that.
    #   * It bypasses nothing. Setting a password adds a credential; it does
    #     not touch `oauth_accounts`, so Google sign-in keeps
    #     working, keep being verified the same way, and remain the only path
    #     for anyone who does not hold the mailbox.
    #
    # What does change is the wording: "reset your password" makes no sense to
    # someone who has never had one, so the email says "set" instead and
    # explains that their existing sign-in is unaffected.
    set_first = not user.password_hash

    # This request is an XHR from the app, so it carries a real Origin header
    # -- the reset link lands on whichever port the developer is actually
    # using. _resolve_frontend_origin refuses anything but a loopback origin,
    # and refuses even that outside development.
    reset_url = _frontend_url(
        "/reset-password", _origin=_request_origin(request), token=raw_token
    )
    background.add_task(_deliver_reset_email, user.email, reset_url, user.name, set_first)
    return accepted


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Redeems a reset link and sets the new password.

    The token is proven by presenting it: it is 256 bits of CSPRNG output, so
    there is nothing to guess and nothing to enumerate. Everything below is
    about making sure a *valid* token can only ever do this once.
    """
    ip_decision = _redeem_by_ip.check(
        rate_limit.client_ip(request, auth_config.TRUST_PROXY_HEADERS)
    )
    if not ip_decision.allowed:
        raise _too_many(ip_decision)

    row = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == security.hash_token(body.token))
        .first()
    )

    # Unknown, spent and expired are reported alike. The token is the only
    # thing being proven here, and distinguishing the failures would let
    # someone probe which of a batch of guessed tokens had ever been real.
    if row is None or row.used_at is not None or row.expires_at <= datetime.datetime.utcnow():
        raise HTTPException(400, _RESET_LINK_DEAD)

    user = row.user
    if user is None or not user.is_active:
        raise HTTPException(400, _RESET_LINK_DEAD)

    user.password_hash = security.hash_password(body.password)
    row.used_at = datetime.datetime.utcnow()

    # Every existing session ends, including the current browser's and
    # including any the person who forced the reset may be holding. A reset
    # that left old sessions alive would be largely cosmetic -- which is the
    # whole scenario the feature exists for.
    #
    # Staged into the same transaction as the password change and the
    # token-spend above, then committed once: all three take effect together
    # or none of them do. Committing the password first and the revocations
    # after would leave a window -- and, if the second commit failed, a
    # permanent state -- where the password had changed but every old session
    # was still live.
    #
    # Any *other* unused reset token for this user is spent in the same
    # transaction. A link that was superseded by a newer one is already dead
    # (forgot_password kills it on issue), but an attacker who requested a
    # reset first and then watched the real owner complete one of their own
    # would otherwise still be holding a live link to an account whose
    # password has just changed.
    (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
        .update({"used_at": datetime.datetime.utcnow()})
    )
    sessions.revoke_all_sessions(db, user.id, commit=False)
    db.commit()

    return {"message": "Your password has been reset. Please sign in."}
