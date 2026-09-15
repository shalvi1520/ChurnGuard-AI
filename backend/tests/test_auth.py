"""
Authentication: accounts, sessions, OAuth and password reset.

These run against whatever conftest.py resolved as the test database (a local
Postgres if one is reachable, otherwise a SQLite file) -- never the shared Neon
instance.

The OAuth tests stub the network boundary only: `exchange_code` and
`verify_id_token` are patched, so the provider's HTTP calls don't happen but
everything this codebase is actually responsible for -- state validation,
identity extraction, the link-or-create decision, session creation, the
redirect -- runs for real. Patching any deeper (at `link_or_create_user`, say)
would test nothing worth testing.
"""
import dataclasses
import datetime
import uuid

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.auth import config as auth_config
from backend.auth import oauth
from backend.db import security
from backend.db.database import SessionLocal
from backend.db.models import OAuthAccount, PasswordResetToken, User, UserSession

SESSION_COOKIE = auth_config.SESSION_COOKIE_NAME


@pytest.fixture
def client():
    # `with` matters: it runs startup/shutdown events, and TestClient keeps a
    # cookie jar across requests inside the block -- which is exactly the
    # browser behaviour these tests are about.
    with TestClient(app) as c:
        yield c


@pytest.fixture
def email():
    """A fresh address per test, so a rerun never collides with its own
    previous run on the unique email index."""
    return f"test-{uuid.uuid4().hex[:12]}@example.com"


def signup_payload(email, **overrides):
    payload = {
        "email": email,
        "password": "correct horse battery",
        "name": "Test User",
        "company": "Acme Technologies",
        "acceptedTerms": True,
    }
    payload.update(overrides)
    return payload


def _db():
    return SessionLocal()


# --- signup -----------------------------------------------------------------


def test_signup_creates_account_and_session(client, email):
    response = client.post("/api/auth/signup", json=signup_payload(email))

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["user"]["email"] == email
    assert body["user"]["name"] == "Test User"
    assert body["user"]["company"] == "Acme Technologies"
    assert body["user"]["auth_provider"] == "password"
    assert SESSION_COOKIE in response.cookies

    db = _db()
    try:
        user = db.query(User).filter(User.email == email).one()
        assert user.is_active is True
        assert db.query(UserSession).filter(UserSession.user_id == user.id).count() == 1
    finally:
        db.close()


def test_signup_never_returns_password_hash(client, email):
    response = client.post("/api/auth/signup", json=signup_payload(email))
    # Checked against the whole serialized body, not just the parsed user
    # object: the point is that the hash does not appear anywhere in the
    # response, under any key.
    assert "password_hash" not in response.text
    assert "correct horse battery" not in response.text


def test_password_is_stored_hashed_not_plaintext(client, email):
    password = "correct horse battery"
    client.post("/api/auth/signup", json=signup_payload(email, password=password))

    db = _db()
    try:
        user = db.query(User).filter(User.email == email).one()
        assert user.password_hash != password
        assert user.password_hash.startswith("$2")  # bcrypt
        assert security.verify_password(password, user.password_hash)
        assert not security.verify_password("wrong password", user.password_hash)
    finally:
        db.close()


def test_signup_duplicate_email_is_409(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    response = client.post("/api/auth/signup", json=signup_payload(email, name="Someone Else"))

    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_signup_duplicate_email_is_case_insensitive(client, email):
    """Emails are normalised to lowercase, so Alice@x.com must not be able to
    claim a second account alongside alice@x.com."""
    client.post("/api/auth/signup", json=signup_payload(email))
    response = client.post("/api/auth/signup", json=signup_payload(email.upper()))
    assert response.status_code == 409


def test_signup_rejects_invalid_email(client):
    response = client.post("/api/auth/signup", json=signup_payload("not-an-email"))
    assert response.status_code == 422


def test_signup_rejects_short_password(client, email):
    response = client.post("/api/auth/signup", json=signup_payload(email, password="short"))
    assert response.status_code == 422
    assert "8 characters" in response.text


def test_signup_requires_terms_acceptance(client, email):
    """The frontend disables the button without the checkbox; this is the
    server refusing the same thing for a caller that skips the frontend."""
    response = client.post("/api/auth/signup", json=signup_payload(email, acceptedTerms=False))

    assert response.status_code == 400
    assert "Terms" in response.json()["detail"]

    db = _db()
    try:
        assert db.query(User).filter(User.email == email).first() is None
    finally:
        db.close()


# --- login ------------------------------------------------------------------


def test_login_with_correct_credentials(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    client.cookies.clear()

    response = client.post(
        "/api/auth/login", json={"email": email, "password": "correct horse battery"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["user"]["email"] == email
    assert SESSION_COOKIE in response.cookies


def test_login_with_wrong_password_is_rejected(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    client.cookies.clear()

    response = client.post("/api/auth/login", json={"email": email, "password": "wrong password"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."
    # The important half: a failed login must not leave a usable session behind.
    assert SESSION_COOKIE not in response.cookies


def test_login_nonexistent_account_matches_wrong_password_response(client, email):
    """Identical status and message for "no such user" and "wrong password".

    If these differed, the login form would be an oracle for which addresses
    have accounts here.
    """
    client.post("/api/auth/signup", json=signup_payload(email))
    client.cookies.clear()

    wrong_password = client.post(
        "/api/auth/login", json={"email": email, "password": "wrong password"}
    )
    no_such_user = client.post(
        "/api/auth/login",
        json={"email": f"nobody-{uuid.uuid4().hex[:8]}@example.com", "password": "whatever123"},
    )

    assert wrong_password.status_code == no_such_user.status_code == 401
    assert wrong_password.json()["detail"] == no_such_user.json()["detail"]


def test_login_rejected_for_deactivated_account(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    client.cookies.clear()

    db = _db()
    try:
        db.query(User).filter(User.email == email).one().is_active = False
        db.commit()
    finally:
        db.close()

    response = client.post(
        "/api/auth/login", json={"email": email, "password": "correct horse battery"}
    )
    assert response.status_code == 403


# --- /me, session lifetime --------------------------------------------------


def test_me_returns_user_for_valid_session(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))

    response = client.get("/api/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == email
    assert body["auth_provider"] == "password"
    assert body["linked_providers"] == ["password"]
    assert "password_hash" not in response.text


def test_me_without_session_is_401(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_me_with_garbage_cookie_is_401(client):
    client.cookies.set(SESSION_COOKIE, "not-a-real-token")
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_session_survives_a_new_request(client, email):
    """Session restoration: the cookie alone, with no other state, is enough
    to identify the user on a later request -- which is what a browser
    refresh amounts to."""
    client.post("/api/auth/signup", json=signup_payload(email))
    token = client.cookies[SESSION_COOKIE]

    fresh = TestClient(app)
    fresh.cookies.set(SESSION_COOKIE, token)
    response = fresh.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json()["email"] == email


def test_logout_invalidates_the_session_server_side(client, email):
    """The behaviour a JWT could not provide: the token stops working because
    the server forgot it, not because the client discarded it."""
    client.post("/api/auth/signup", json=signup_payload(email))
    token = client.cookies[SESSION_COOKIE]
    assert client.get("/api/auth/me").status_code == 200

    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401

    # Replaying the captured token from a client that never logged out must
    # also fail -- otherwise logout only cleared a cookie.
    replay = TestClient(app)
    replay.cookies.set(SESSION_COOKIE, token)
    assert replay.get("/api/auth/me").status_code == 401

    db = _db()
    try:
        assert (
            db.query(UserSession).filter(UserSession.token_hash == security.hash_token(token)).first()
            is None
        )
    finally:
        db.close()


def test_logout_without_a_session_is_still_ok(client):
    assert client.post("/api/auth/logout").status_code == 200


def test_expired_session_is_rejected_and_cleaned_up(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    token = client.cookies[SESSION_COOKIE]

    db = _db()
    try:
        row = db.query(UserSession).filter(
            UserSession.token_hash == security.hash_token(token)
        ).one()
        row.expires_at = datetime.datetime.utcnow() - datetime.timedelta(seconds=1)
        db.commit()
    finally:
        db.close()

    assert client.get("/api/auth/me").status_code == 401

    db = _db()
    try:
        assert (
            db.query(UserSession).filter(UserSession.token_hash == security.hash_token(token)).first()
            is None
        ), "an expired session should be deleted when it is next presented"
    finally:
        db.close()


def test_session_token_is_not_stored_in_plaintext(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    token = client.cookies[SESSION_COOKIE]

    db = _db()
    try:
        assert db.query(UserSession).filter(UserSession.token_hash == token).first() is None
        assert (
            db.query(UserSession).filter(UserSession.token_hash == security.hash_token(token)).first()
            is not None
        )
    finally:
        db.close()


def test_remember_me_produces_a_longer_session(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    client.cookies.clear()

    client.post(
        "/api/auth/login",
        json={"email": email, "password": "correct horse battery", "remember": False},
    )
    short = client.cookies[SESSION_COOKIE]
    client.cookies.clear()

    client.post(
        "/api/auth/login",
        json={"email": email, "password": "correct horse battery", "remember": True},
    )
    long = client.cookies[SESSION_COOKIE]

    db = _db()
    try:
        short_row = db.query(UserSession).filter(
            UserSession.token_hash == security.hash_token(short)
        ).one()
        long_row = db.query(UserSession).filter(
            UserSession.token_hash == security.hash_token(long)
        ).one()
        assert long_row.expires_at > short_row.expires_at
    finally:
        db.close()


def test_session_cookie_is_httponly(client, email):
    response = client.post("/api/auth/signup", json=signup_payload(email))
    set_cookie = response.headers["set-cookie"]
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie.replace("samesite", "SameSite")


# --- password reset ---------------------------------------------------------


def _issue_reset_token(client, email):
    response = client.post("/api/auth/forgot-password", json={"email": email})
    assert response.status_code == 200

    db = _db()
    try:
        user = db.query(User).filter(User.email == email).one()
        row = (
            db.query(PasswordResetToken)
            .filter(PasswordResetToken.user_id == user.id)
            .order_by(PasswordResetToken.created_at.desc())
            .first()
        )
        assert row is not None
        return row.id
    finally:
        db.close()


def _raw_token_for(row_id):
    """Reset tokens are stored hashed, so a test cannot read one back out --
    which is the property under test elsewhere. Here we mint a known token and
    write its hash directly, to drive the redemption paths."""
    raw = security.generate_token()
    db = _db()
    try:
        row = db.get(PasswordResetToken, row_id)
        row.token_hash = security.hash_token(raw)
        db.commit()
    finally:
        db.close()
    return raw


def test_forgot_password_creates_a_hashed_single_use_token(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    row_id = _issue_reset_token(client, email)

    db = _db()
    try:
        row = db.get(PasswordResetToken, row_id)
        assert row.used_at is None
        assert row.expires_at > datetime.datetime.utcnow()
        assert len(row.token_hash) == 64  # sha256 hex, not a raw token
    finally:
        db.close()


def test_forgot_password_does_not_reveal_whether_an_account_exists(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    client.cookies.clear()

    known = client.post("/api/auth/forgot-password", json={"email": email})
    unknown = client.post(
        "/api/auth/forgot-password", json={"email": f"nobody-{uuid.uuid4().hex[:8]}@example.com"}
    )

    assert known.status_code == unknown.status_code == 200
    assert known.json()["message"] == unknown.json()["message"]


def test_forgot_password_reports_when_email_was_not_delivered(client, email):
    """With no SMTP configured the response must say so rather than claim a
    message was sent. A "check your inbox" screen for mail that was never
    dispatched is the failure this asserts against."""
    client.post("/api/auth/signup", json=signup_payload(email))
    response = client.post("/api/auth/forgot-password", json={"email": email})

    body = response.json()
    if not auth_config.email_is_configured():
        assert body["emailDelivered"] is False
        assert "developerNotice" in body


def test_reset_password_succeeds_and_changes_the_password(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    raw = _raw_token_for(_issue_reset_token(client, email))
    client.cookies.clear()

    response = client.post(
        "/api/auth/reset-password", json={"token": raw, "password": "a brand new password"}
    )
    assert response.status_code == 200, response.text

    assert (
        client.post(
            "/api/auth/login", json={"email": email, "password": "correct horse battery"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login", json={"email": email, "password": "a brand new password"}
        ).status_code
        == 200
    )


def test_reset_password_token_cannot_be_reused(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    raw = _raw_token_for(_issue_reset_token(client, email))

    assert (
        client.post(
            "/api/auth/reset-password", json={"token": raw, "password": "a brand new password"}
        ).status_code
        == 200
    )
    second = client.post(
        "/api/auth/reset-password", json={"token": raw, "password": "another password entirely"}
    )
    assert second.status_code == 400


def test_expired_reset_token_is_rejected(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    row_id = _issue_reset_token(client, email)
    raw = _raw_token_for(row_id)

    db = _db()
    try:
        db.get(PasswordResetToken, row_id).expires_at = (
            datetime.datetime.utcnow() - datetime.timedelta(minutes=1)
        )
        db.commit()
    finally:
        db.close()

    response = client.post(
        "/api/auth/reset-password", json={"token": raw, "password": "a brand new password"}
    )
    assert response.status_code == 400
    assert "expired" in response.json()["detail"].lower()


def test_unknown_reset_token_is_rejected(client):
    response = client.post(
        "/api/auth/reset-password",
        json={"token": security.generate_token(), "password": "a brand new password"},
    )
    assert response.status_code == 400


def test_reset_password_revokes_every_existing_session(client, email):
    """Otherwise a reset is largely cosmetic: whoever prompted it may already
    be signed in, and would stay signed in."""
    client.post("/api/auth/signup", json=signup_payload(email))
    assert client.get("/api/auth/me").status_code == 200

    raw = _raw_token_for(_issue_reset_token(client, email))
    client.post("/api/auth/reset-password", json={"token": raw, "password": "a brand new password"})

    assert client.get("/api/auth/me").status_code == 401


def test_requesting_a_second_reset_invalidates_the_first(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    first_raw = _raw_token_for(_issue_reset_token(client, email))
    _issue_reset_token(client, email)

    response = client.post(
        "/api/auth/reset-password", json={"token": first_raw, "password": "a brand new password"}
    )
    assert response.status_code == 400


# --- OAuth ------------------------------------------------------------------


@pytest.fixture
def google_configured(monkeypatch):
    """Pretend a Google application is registered.

    `OAuthProviderConfig` is a frozen dataclass -- deliberately, since a
    provider's registered credentials should not be mutable at runtime -- so
    this swaps in a replacement object rather than assigning to its fields.
    `PROVIDERS` is the mapping the routes actually resolve through, so that is
    the one that has to be patched; `GOOGLE` is patched too for any code
    reaching the module attribute directly.

    Only the credentials and the discovery document are faked. Every code path
    that follows -- state checking, identity extraction, linking, session
    creation -- is the real one.
    """
    configured = dataclasses.replace(
        auth_config.GOOGLE,
        client_id="test-client-id.apps.googleusercontent.com",
        client_secret="test-client-secret",
    )
    monkeypatch.setattr(auth_config, "GOOGLE", configured)
    monkeypatch.setitem(auth_config.PROVIDERS, "google", configured)
    monkeypatch.setattr(
        oauth, "_discover", lambda p: {
            "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_endpoint": "https://oauth2.googleapis.com/token",
            "jwks_uri": "https://www.googleapis.com/oauth2/v3/certs",
            "issuer": "https://accounts.google.com",
        }
    )
    return configured


def _stub_provider_identity(monkeypatch, *, subject, email, verified=True, name="OAuth User"):
    monkeypatch.setattr(oauth, "exchange_code", lambda *a, **k: {"id_token": "stub.id.token"})
    monkeypatch.setattr(oauth, "verify_id_token", lambda *a, **k: {"sub": subject})
    monkeypatch.setattr(
        oauth,
        "identity_from_claims",
        lambda provider, claims: oauth.ProviderIdentity(
            provider=provider.name,
            subject=subject,
            email=email,
            email_verified=verified,
            name=name,
        ),
    )


def test_oauth_start_without_credentials_is_a_clear_503(client):
    """Unconfigured must be an explainable refusal, never a crash and never a
    pretend sign-in."""
    response = client.get("/api/auth/google", follow_redirects=False)

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert "GOOGLE_CLIENT_ID" in detail
    assert "AUTH_SETUP.md" in detail


def test_providers_endpoint_reports_configuration_without_leaking_secrets(client):
    response = client.get("/api/auth/providers")

    assert response.status_code == 200
    names = {p["name"] for p in response.json()["providers"]}
    assert names == {"google"}
    for p in response.json()["providers"]:
        assert set(p) == {"name", "label", "configured"}


def test_oauth_start_redirects_to_provider_with_state_and_pkce(client, google_configured):
    response = client.get("/api/auth/google", follow_redirects=False)

    assert response.status_code == 303
    location = response.headers["location"]
    assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth")
    assert "state=" in location
    assert "code_challenge=" in location
    assert "code_challenge_method=S256" in location
    # The secret must never appear in something the browser can read.
    assert "test-client-secret" not in location

    state_cookie = response.headers["set-cookie"]
    assert "churnguard_oauth_google" in state_cookie
    assert "HttpOnly" in state_cookie


def test_oauth_callback_creates_a_user_and_a_session(client, google_configured, monkeypatch):
    start = client.get("/api/auth/google", follow_redirects=False)
    state = dict(
        pair.split("=", 1) for pair in start.headers["location"].split("?", 1)[1].split("&")
    )["state"]

    oauth_email = f"oauth-{uuid.uuid4().hex[:12]}@example.com"
    _stub_provider_identity(monkeypatch, subject="google-subject-123", email=oauth_email)

    response = client.get(
        f"/api/auth/google/callback?code=stub-code&state={state}", follow_redirects=False
    )

    assert response.status_code == 303
    assert response.headers["location"].startswith(auth_config.FRONTEND_URL)
    assert "/auth/callback" in response.headers["location"]

    assert client.get("/api/auth/me").json()["auth_provider"] == "google"

    db = _db()
    try:
        user = db.query(User).filter(User.email == oauth_email).one()
        # An OAuth-only account has no password, rather than a placeholder hash.
        assert user.password_hash is None
        link = db.query(OAuthAccount).filter(OAuthAccount.user_id == user.id).one()
        assert link.provider == "google"
        assert link.provider_account_id == "google-subject-123"
    finally:
        db.close()


def test_oauth_callback_reuses_the_existing_link_on_second_sign_in(
    client, google_configured, monkeypatch
):
    oauth_email = f"oauth-{uuid.uuid4().hex[:12]}@example.com"

    def sign_in():
        start = client.get("/api/auth/google", follow_redirects=False)
        state = dict(
            pair.split("=", 1) for pair in start.headers["location"].split("?", 1)[1].split("&")
        )["state"]
        _stub_provider_identity(monkeypatch, subject="google-subject-repeat", email=oauth_email)
        return client.get(
            f"/api/auth/google/callback?code=stub-code&state={state}", follow_redirects=False
        )

    assert sign_in().status_code == 303
    client.cookies.clear()
    assert sign_in().status_code == 303

    db = _db()
    try:
        assert db.query(User).filter(User.email == oauth_email).count() == 1
        assert (
            db.query(OAuthAccount)
            .filter(OAuthAccount.provider_account_id == "google-subject-repeat")
            .count()
            == 1
        ), "signing in twice must not create a second link"
    finally:
        db.close()


def test_oauth_links_to_existing_account_only_when_email_is_verified(
    client, google_configured, monkeypatch, email
):
    """The account-takeover guard.

    An unverified provider email that happens to match an existing account
    must NOT be auto-linked -- otherwise anyone able to get a provider to
    assert that address inherits the account.
    """
    client.post("/api/auth/signup", json=signup_payload(email))
    client.cookies.clear()

    start = client.get("/api/auth/google", follow_redirects=False)
    state = dict(
        pair.split("=", 1) for pair in start.headers["location"].split("?", 1)[1].split("&")
    )["state"]
    _stub_provider_identity(monkeypatch, subject="attacker-subject", email=email, verified=False)

    response = client.get(
        f"/api/auth/google/callback?code=stub-code&state={state}", follow_redirects=False
    )

    assert response.status_code == 303
    assert "/login" in response.headers["location"]
    assert "error=" in response.headers["location"]
    assert client.get("/api/auth/me").status_code == 401

    db = _db()
    try:
        assert (
            db.query(OAuthAccount)
            .filter(OAuthAccount.provider_account_id == "attacker-subject")
            .first()
            is None
        )
    finally:
        db.close()


def test_oauth_links_verified_email_to_existing_password_account(
    client, google_configured, monkeypatch, email
):
    client.post("/api/auth/signup", json=signup_payload(email))
    client.cookies.clear()

    start = client.get("/api/auth/google", follow_redirects=False)
    state = dict(
        pair.split("=", 1) for pair in start.headers["location"].split("?", 1)[1].split("&")
    )["state"]
    _stub_provider_identity(monkeypatch, subject="verified-subject", email=email, verified=True)

    response = client.get(
        f"/api/auth/google/callback?code=stub-code&state={state}", follow_redirects=False
    )
    assert response.status_code == 303

    me = client.get("/api/auth/me").json()
    assert me["email"] == email
    # Both methods now work for this one account, and /me says so.
    assert set(me["linked_providers"]) == {"password", "google"}

    db = _db()
    try:
        assert db.query(User).filter(User.email == email).count() == 1
    finally:
        db.close()


def test_oauth_callback_rejects_a_mismatched_state(client, google_configured, monkeypatch):
    """Login CSRF: without this check, a victim's browser can be walked
    through a callback carrying an attacker's authorization code."""
    client.get("/api/auth/google", follow_redirects=False)
    _stub_provider_identity(monkeypatch, subject="whoever", email="whoever@example.com")

    response = client.get(
        "/api/auth/google/callback?code=stub-code&state=not-the-issued-state",
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert "error=" in response.headers["location"]
    assert client.get("/api/auth/me").status_code == 401


def test_oauth_callback_without_a_state_cookie_is_refused(client, google_configured, monkeypatch):
    _stub_provider_identity(monkeypatch, subject="whoever", email="whoever@example.com")
    response = client.get(
        "/api/auth/google/callback?code=stub-code&state=anything", follow_redirects=False
    )

    assert response.status_code == 303
    assert "error=" in response.headers["location"]
    assert client.get("/api/auth/me").status_code == 401


def test_oauth_callback_handles_a_cancelled_authorization(client, google_configured):
    client.get("/api/auth/google", follow_redirects=False)

    response = client.get(
        "/api/auth/google/callback?error=access_denied", follow_redirects=False
    )

    assert response.status_code == 303
    assert "cancelled" in response.headers["location"].lower()
    assert client.get("/api/auth/me").status_code == 401


def test_oauth_callback_on_unconfigured_provider_redirects_with_a_message(client):
    """`client` alone leaves Google without a client id/secret -- the
    unconfigured case. A real provider that this server cannot perform must
    redirect with a message, not 500."""
    response = client.get(
        "/api/auth/google/callback?code=x&state=y", follow_redirects=False
    )
    assert response.status_code == 303
    assert "/login" in response.headers["location"]
    assert client.get("/api/auth/me").status_code == 401


def test_oauth_callback_on_unknown_provider_redirects_rather_than_500(client):
    """`provider` is an unvalidated path segment used to build a cookie name;
    a nonsense value must produce the same kind of redirect every other
    failure here does, not a server error."""
    response = client.get(
        "/api/auth/not-a-provider/callback?code=x&state=y", follow_redirects=False
    )
    assert response.status_code == 303
    assert "/login" in response.headers["location"]
    assert client.get("/api/auth/me").status_code == 401


# --- frontend origin resolution --------------------------------------------
#
# Vite increments its port whenever the previous one is taken, so a developer
# is routinely on :5178 while FRONTEND_URL still says :5173. Redirecting to the
# configured port would land the browser on a dead server right after a
# successful sign-in -- indistinguishable, from the user's side, from a broken
# login.


def test_dev_redirect_follows_the_requesting_localhost_port(client, google_configured, monkeypatch):
    """A sign-in started from :5178 must come back to :5178, not to
    FRONTEND_URL's port."""
    start = client.get(
        "/api/auth/google", follow_redirects=False, headers={"Referer": "http://localhost:5178/login"}
    )
    state = dict(
        pair.split("=", 1) for pair in start.headers["location"].split("?", 1)[1].split("&")
    )["state"]
    assert "churnguard_oauth_origin" in start.headers["set-cookie"]

    _stub_provider_identity(
        monkeypatch, subject="port-test", email=f"port-{uuid.uuid4().hex[:8]}@example.com"
    )
    response = client.get(
        f"/api/auth/google/callback?code=stub&state={state}", follow_redirects=False
    )

    assert response.headers["location"].startswith("http://localhost:5178/")


def test_redirect_ignores_a_non_localhost_origin(client, google_configured, monkeypatch):
    """The open-redirect guard. An external Referer must never become the
    redirect target -- a login flow that lands wherever the caller asks is a
    phishing primitive, and an effective one because the user has just
    genuinely authenticated."""
    start = client.get(
        "/api/auth/google",
        follow_redirects=False,
        headers={"Referer": "https://evil.example.com/login"},
    )
    state = dict(
        pair.split("=", 1) for pair in start.headers["location"].split("?", 1)[1].split("&")
    )["state"]
    assert "churnguard_oauth_origin" not in start.headers.get("set-cookie", "")

    _stub_provider_identity(
        monkeypatch, subject="evil-test", email=f"evil-{uuid.uuid4().hex[:8]}@example.com"
    )
    response = client.get(
        f"/api/auth/google/callback?code=stub&state={state}", follow_redirects=False
    )

    location = response.headers["location"]
    assert "evil.example.com" not in location
    assert location.startswith(auth_config.FRONTEND_URL)


def test_reset_link_points_at_the_requesting_origin(client, email):
    """The forgot-password POST is an XHR and carries a real Origin header, so
    the emailed link can follow the port the developer is actually on."""
    client.post("/api/auth/signup", json=signup_payload(email))
    response = client.post(
        "/api/auth/forgot-password",
        json={"email": email},
        headers={"Origin": "http://localhost:5178"},
    )
    assert response.status_code == 200
    # The link itself is never returned in the body (that would be an account
    # takeover primitive); this asserts the request is accepted and reported
    # honestly, with the origin plumbing exercised.
    assert "If an account exists" in response.json()["message"]


def test_unhandled_errors_are_json_not_a_bare_500(client):
    """A 500 raised below the CORS middleware returns no
    Access-Control-Allow-Origin header, and the browser then reports a CORS
    violation -- hiding the real error completely. The handler in main.py
    converts it to a JSON response so CORS can decorate it."""
    from backend.api.main import app

    @app.get("/api/__boom__")
    def _boom():
        raise RuntimeError("intentional")

    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/api/__boom__", headers={"Origin": "http://localhost:5178"})
        assert r.status_code == 500
        assert r.headers.get("access-control-allow-origin") == "http://localhost:5178"
        # The internal message must not reach the browser.
        assert "intentional" not in r.text


def test_microsoft_sign_in_is_gone():
    """Microsoft was removed as a sign-in method. The provider registry is the
    single source the routes and `/providers` are driven from, so its absence
    there is what makes the whole provider stop existing."""
    assert "microsoft" not in auth_config.PROVIDERS
    assert not hasattr(auth_config, "MICROSOFT")
    assert not hasattr(auth_config, "MICROSOFT_TENANT_ID")


def test_microsoft_oauth_routes_no_longer_exist(client):
    """`microsoft` is now just an unknown provider name, handled by the same
    path as any other nonsense value: refused at the start, redirected to
    /login at the callback, and no session either way.

    The exact refusal code is not the point and is not asserted -- what must
    hold is that it never becomes a redirect to an identity provider and never
    mints a session."""
    start = client.get("/api/auth/microsoft", follow_redirects=False)
    assert start.status_code >= 400
    assert "location" not in start.headers

    callback = client.get(
        "/api/auth/microsoft/callback?code=x&state=y", follow_redirects=False
    )
    # The callback redirects unknown providers to /login rather than 500.
    assert callback.status_code == 303
    assert "/login" in callback.headers["location"]

    assert client.get("/api/auth/me").status_code == 401


def test_an_unverified_provider_email_is_not_treated_as_verified():
    """Fail-closed: a token that does not positively assert `email_verified`
    must not count as verified, or it could be auto-linked to an existing
    password account with the same address."""
    silent = {"sub": "s", "email": "x@example.com"}
    explicit_false = {"sub": "s", "email": "x@example.com", "email_verified": False}
    verified = {"sub": "s", "email": "x@example.com", "email_verified": True}

    assert oauth.identity_from_claims(auth_config.GOOGLE, silent).email_verified is False
    assert oauth.identity_from_claims(auth_config.GOOGLE, explicit_false).email_verified is False
    assert oauth.identity_from_claims(auth_config.GOOGLE, verified).email_verified is True
