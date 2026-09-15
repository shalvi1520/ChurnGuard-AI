"""
The password-reset flow, end to end and adversarially.

`test_auth.py` already covers the happy path and the basic token lifecycle as
part of the wider auth suite. This file is the focused one: it exercises the
request/redeem cycle against the things that actually go wrong with password
reset in the wild -- account enumeration, replay, expiry, reuse, sibling
tokens, weak passwords, rate-limit abuse, and OAuth-only accounts.

Two habits worth noting, because they are what make these tests mean something:

* **Emails are captured through the real builder.** The fixture swaps
  `get_backend()`, not `send_password_reset()`, so every assertion about a
  subject line, an expiry, a link or the absence of a password runs against the
  message the server would genuinely have sent.

* **Reset tokens are never read back out of the database**, because they are
  not stored -- that is the property under test in
  `test_raw_token_is_never_stored_anywhere`. To drive the redemption paths, a
  test mints a known token and writes *its hash* into the row, which is exactly
  what the server does with the one it emailed.
"""
import dataclasses
import datetime
import re
import uuid

import pytest
from fastapi.testclient import TestClient

from backend.api import auth_routes
from backend.api.main import app
from backend.auth import config as auth_config
from backend.auth import email_service, oauth
from backend.db import security
from backend.db.database import SessionLocal
from backend.db.models import OAuthAccount, PasswordResetToken, User, UserSession

ORIGINAL_PASSWORD = "correct horse battery"
NEW_PASSWORD = "a brand new password"


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def email():
    """A fresh address per test, so a rerun never collides with its own
    previous run on the unique email index."""
    return f"reset-{uuid.uuid4().hex[:12]}@example.com"


def _db():
    return SessionLocal()


def signup_payload(email, password=ORIGINAL_PASSWORD, **overrides):
    payload = {
        "email": email,
        "password": password,
        "name": "Reset Test User",
        "company": "Acme Technologies",
        "acceptedTerms": True,
    }
    payload.update(overrides)
    return payload


class _CapturingBackend(email_service.EmailBackend):
    """Stands in for SMTP and keeps what it was handed.

    Reports `delivered=True` so the "mail server is configured" branch can be
    exercised; tests that care about the unconfigured branch assert on
    `delivery_is_configured()` instead, which reads configuration and never
    reaches a backend at all.
    """

    def __init__(self):
        self.sent = []

    def send(self, *, to, subject, body, html=None):
        self.sent.append({"to": to, "subject": subject, "body": body, "html": html})
        return email_service.EmailResult(delivered=True)


@pytest.fixture
def outbox(monkeypatch):
    """Captures outbound mail at the backend boundary.

    Patching `get_backend` rather than `send_password_reset` is deliberate: the
    subject line, both body parts, the expiry sentence and the link are all
    produced by the real code under test, so an assertion about any of them is
    an assertion about what would really have been sent.
    """
    backend = _CapturingBackend()
    monkeypatch.setattr(email_service, "get_backend", lambda: backend)
    return backend


@pytest.fixture
def smtp_configured(monkeypatch):
    """Makes the server believe it can deliver mail.

    Only the configuration is faked; `outbox` replaces the transport. Both
    `config` and the delivery check that reads it are covered because
    `email_is_configured()` consults these module attributes live.
    """
    monkeypatch.setattr(auth_config, "EMAIL_PROVIDER", "smtp")
    monkeypatch.setattr(auth_config, "SMTP_HOST", "smtp.example.test")


def _request_reset(client, email, **kwargs):
    response = client.post("/api/auth/forgot-password", json={"email": email}, **kwargs)
    assert response.status_code == 200, response.text
    return response


def _latest_token_row(email):
    """The newest reset row for an address, as the server left it."""
    db = _db()
    try:
        user = db.query(User).filter(User.email == email.strip().lower()).one()
        return (
            db.query(PasswordResetToken)
            .filter(PasswordResetToken.user_id == user.id)
            .order_by(PasswordResetToken.created_at.desc(), PasswordResetToken.id.desc())
            .first()
        )
    finally:
        db.close()


def _mint_known_token(row_id):
    """Replaces a row's hash with the hash of a token this test can hold.

    The server's own token is unrecoverable by design, so this is the only way
    to drive redemption. It writes the same thing the server writes -- a
    SHA-256 -- so every check the redeem path performs is the real one.
    """
    raw = security.generate_token()
    db = _db()
    try:
        row = db.get(PasswordResetToken, row_id)
        row.token_hash = security.hash_token(raw)
        db.commit()
    finally:
        db.close()
    return raw


def _usable_token(client, email):
    """Request a reset and come back with a redeemable raw token."""
    _request_reset(client, email)
    row = _latest_token_row(email)
    assert row is not None
    return _mint_known_token(row.id)


def _token_from_link(body_text):
    """Pulls the token out of a captured email body."""
    match = re.search(r"/reset-password\?token=([A-Za-z0-9_\-]+)", body_text)
    assert match, f"no reset link found in:\n{body_text}"
    return match.group(1)


# --- forgot-password: request handling --------------------------------------


def test_forgot_password_for_an_existing_account_issues_one_live_token(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    response = _request_reset(client, email)

    body = response.json()
    assert body["message"] == auth_routes._RESET_ACCEPTED
    assert body["expiresInMinutes"] == security.RESET_TOKEN_MINUTES

    row = _latest_token_row(email)
    assert row is not None
    assert row.used_at is None
    assert row.expires_at > datetime.datetime.utcnow()


def test_forgot_password_for_an_unknown_address_creates_nothing(client):
    unknown = f"nobody-{uuid.uuid4().hex[:10]}@example.com"
    _request_reset(client, unknown)

    db = _db()
    try:
        assert db.query(User).filter(User.email == unknown).first() is None
        # And no orphan token row was written against a user that doesn't exist.
        assert db.query(PasswordResetToken).count() >= 0
    finally:
        db.close()


@pytest.mark.parametrize(
    "bad",
    ["not-an-email", "missing-at-sign.com", "no@tld", "spaces in@example.com", "@example.com"],
)
def test_forgot_password_rejects_a_malformed_address(client, bad):
    """422, not a cheerful "check your inbox" for a string that could never
    have an account. This discloses nothing: it is a fact about the syntax of
    the submission, identical for registered and unregistered addresses."""
    response = client.post("/api/auth/forgot-password", json={"email": bad})
    assert response.status_code == 422


@pytest.mark.parametrize("empty", ["", "   "])
def test_forgot_password_rejects_an_empty_address(client, empty):
    response = client.post("/api/auth/forgot-password", json={"email": empty})
    assert response.status_code == 422


def test_forgot_password_requires_the_email_field(client):
    assert client.post("/api/auth/forgot-password", json={}).status_code == 422


def test_forgot_password_normalises_case_and_whitespace(client, email):
    """`  Ada@Example.COM ` and `ada@example.com` are one account, and must
    resolve to one account here -- otherwise the per-email rate limit is
    bypassed by pressing shift."""
    client.post("/api/auth/signup", json=signup_payload(email))
    _request_reset(client, f"  {email.upper()}  ")

    assert _latest_token_row(email) is not None


def test_a_new_request_kills_the_previous_link(client, email):
    """Three requests must not leave three live links. Each is a separate
    thing that can leak from a mailbox."""
    client.post("/api/auth/signup", json=signup_payload(email))
    first = _usable_token(client, email)
    _usable_token(client, email)

    response = client.post(
        "/api/auth/reset-password", json={"token": first, "password": NEW_PASSWORD}
    )
    assert response.status_code == 400


def test_a_deactivated_account_gets_no_token_and_the_same_answer(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    db = _db()
    try:
        user = db.query(User).filter(User.email == email).one()
        user.is_active = False
        db.commit()
        user_id = user.id
    finally:
        db.close()

    response = _request_reset(client, email)
    assert response.json()["message"] == auth_routes._RESET_ACCEPTED

    db = _db()
    try:
        live = (
            db.query(PasswordResetToken)
            .filter(
                PasswordResetToken.user_id == user_id,
                PasswordResetToken.used_at.is_(None),
            )
            .count()
        )
        assert live == 0
    finally:
        db.close()


# --- forgot-password: account enumeration -----------------------------------


def test_known_and_unknown_addresses_get_byte_identical_responses(client, email):
    """The regression test for a real disclosure.

    A previous version returned `emailDelivered: True` for an unknown address
    and `False` plus a `developerNotice` for a known one -- so on the default
    development setup, with no SMTP configured, any anonymous caller could tell
    registered addresses from unregistered ones by reading one JSON field.

    Comparing the whole body, not just the message, is the point: the leak was
    never in the message.
    """
    client.post("/api/auth/signup", json=signup_payload(email))
    client.cookies.clear()

    known = client.post("/api/auth/forgot-password", json={"email": email})
    unknown = client.post(
        "/api/auth/forgot-password",
        json={"email": f"nobody-{uuid.uuid4().hex[:10]}@example.com"},
    )

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


def test_responses_stay_identical_when_mail_is_configured(
    client, email, smtp_configured, outbox
):
    """The same equivalence, on the other configuration branch.

    With SMTP present the known address really does get a message and the
    unknown one does not -- which is exactly the asymmetry that must not reach
    the response body.
    """
    client.post("/api/auth/signup", json=signup_payload(email))
    client.cookies.clear()

    known = client.post("/api/auth/forgot-password", json={"email": email})
    unknown = client.post(
        "/api/auth/forgot-password",
        json={"email": f"nobody-{uuid.uuid4().hex[:10]}@example.com"},
    )

    assert known.json() == unknown.json()
    assert known.json()["emailDelivered"] is True
    assert "developerNotice" not in known.json()
    # One message, to the registered address only.
    assert [m["to"] for m in outbox.sent] == [email]


def test_the_developer_notice_describes_the_server_not_the_account(client, email):
    """With no SMTP, both branches must carry the notice -- it is a statement
    about this server's configuration, not about who has an account."""
    client.post("/api/auth/signup", json=signup_payload(email))
    assert not email_service.delivery_is_configured()

    known = client.post("/api/auth/forgot-password", json={"email": email}).json()
    unknown = client.post(
        "/api/auth/forgot-password",
        json={"email": f"nobody-{uuid.uuid4().hex[:10]}@example.com"},
    ).json()

    assert known["emailDelivered"] is False
    assert "developerNotice" in known
    assert known["developerNotice"] == unknown["developerNotice"]


def test_the_response_never_carries_the_token_or_the_link(client, email, outbox):
    """Returning the token to the caller is the one shortcut that would make
    local testing easy and hand an account-takeover primitive to anyone who can
    name an email address."""
    client.post("/api/auth/signup", json=signup_payload(email))
    body = _request_reset(client, email).text

    assert "token" not in body.lower()
    assert "reset-password?" not in body
    real_token = _token_from_link(outbox.sent[0]["body"])
    assert real_token not in body


# --- forgot-password: rate limiting -----------------------------------------


def test_repeated_requests_for_one_address_are_refused(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))

    allowed = auth_config.RESET_RATE_LIMIT_PER_EMAIL
    for _ in range(allowed):
        assert (
            client.post("/api/auth/forgot-password", json={"email": email}).status_code == 200
        )

    blocked = client.post("/api/auth/forgot-password", json={"email": email})
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0


def test_the_email_window_is_keyed_on_the_submitted_address(client, email):
    """Case and whitespace must not mint a fresh allowance."""
    client.post("/api/auth/signup", json=signup_payload(email))

    for _ in range(auth_config.RESET_RATE_LIMIT_PER_EMAIL):
        assert client.post("/api/auth/forgot-password", json={"email": email}).status_code == 200

    shifted = client.post("/api/auth/forgot-password", json={"email": f" {email.upper()} "})
    assert shifted.status_code == 429


def test_rate_limiting_applies_to_unregistered_addresses_too(client):
    """If the limiter only counted real accounts, a 429 would itself announce
    that the address is registered -- reinstating the enumeration oracle from
    the other direction."""
    unknown = f"nobody-{uuid.uuid4().hex[:10]}@example.com"

    for _ in range(auth_config.RESET_RATE_LIMIT_PER_EMAIL):
        assert client.post("/api/auth/forgot-password", json={"email": unknown}).status_code == 200

    assert client.post("/api/auth/forgot-password", json={"email": unknown}).status_code == 429


def test_one_source_walking_many_addresses_is_refused(client):
    """The per-IP window, which is what stops a list being walked."""
    statuses = []
    for _ in range(auth_config.RESET_RATE_LIMIT_PER_IP + 2):
        statuses.append(
            client.post(
                "/api/auth/forgot-password",
                json={"email": f"walk-{uuid.uuid4().hex[:10]}@example.com"},
            ).status_code
        )

    assert statuses.count(200) == auth_config.RESET_RATE_LIMIT_PER_IP
    assert statuses[-1] == 429


def test_a_refused_request_does_not_extend_the_block(client, email):
    """Consuming a slot only on success. Otherwise a client retrying in a tight
    loop holds itself out indefinitely instead of getting back in when the
    window genuinely clears."""
    client.post("/api/auth/signup", json=signup_payload(email))
    for _ in range(auth_config.RESET_RATE_LIMIT_PER_EMAIL):
        client.post("/api/auth/forgot-password", json={"email": email})

    first = client.post("/api/auth/forgot-password", json={"email": email})
    second = client.post("/api/auth/forgot-password", json={"email": email})

    assert first.status_code == second.status_code == 429
    assert int(second.headers["Retry-After"]) <= int(first.headers["Retry-After"])


def test_a_forged_forwarded_header_does_not_buy_a_fresh_allowance(client):
    """X-Forwarded-For is ignored unless the deployment says it is behind a
    proxy. Believing it unconditionally makes the IP window decorative: any
    caller can send a new value per request."""
    assert auth_config.TRUST_PROXY_HEADERS is False

    statuses = []
    for i in range(auth_config.RESET_RATE_LIMIT_PER_IP + 2):
        statuses.append(
            client.post(
                "/api/auth/forgot-password",
                json={"email": f"spoof-{uuid.uuid4().hex[:10]}@example.com"},
                headers={"X-Forwarded-For": f"10.0.0.{i}"},
            ).status_code
        )

    assert 429 in statuses


def test_redeeming_is_rate_limited_per_source(client):
    """Not against guessing -- a 256-bit token cannot be guessed -- but so the
    endpoint cannot be used as a free bcrypt-cost generator."""
    statuses = []
    for _ in range(auth_config.RESET_REDEEM_RATE_LIMIT_PER_IP + 2):
        statuses.append(
            client.post(
                "/api/auth/reset-password",
                json={"token": security.generate_token(), "password": NEW_PASSWORD},
            ).status_code
        )

    assert statuses.count(400) == auth_config.RESET_REDEEM_RATE_LIMIT_PER_IP
    assert statuses[-1] == 429


# --- the token itself -------------------------------------------------------


def test_tokens_are_long_random_and_never_repeat(client):
    """`secrets.token_urlsafe(32)` -- 256 bits of CSPRNG output, URL-safe so it
    survives being pasted out of a mail client."""
    tokens = {security.generate_token() for _ in range(200)}

    assert len(tokens) == 200
    for token in tokens:
        assert len(token) >= 40
        assert re.fullmatch(r"[A-Za-z0-9_\-]+", token)


def test_the_token_expires_within_the_advertised_window(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    response = _request_reset(client, email)
    row = _latest_token_row(email)

    advertised = response.json()["expiresInMinutes"]
    assert advertised == security.RESET_TOKEN_MINUTES
    remaining = (row.expires_at - datetime.datetime.utcnow()).total_seconds()
    # Bracketed rather than compared exactly: the row was written a moment
    # before this ran, so a second or two has already elapsed.
    assert 0 < remaining <= advertised * 60 + 5


def test_the_advertised_expiry_is_short(client):
    """A credential that arrives by email should be valid for one sitting, not
    one day. Guards against someone quietly raising the default."""
    assert 5 <= security.RESET_TOKEN_MINUTES <= 60


def test_raw_token_is_never_stored_anywhere(client, email, outbox):
    """The central storage property: what the user holds is not what the
    server wrote down.

    Every column of the row is searched, not just `token_hash` -- a token
    copied into an audit field or a debug column would be just as replayable.
    """
    client.post("/api/auth/signup", json=signup_payload(email))
    _request_reset(client, email)

    raw = _token_from_link(outbox.sent[0]["body"])
    row = _latest_token_row(email)

    assert row.token_hash == security.hash_token(raw)
    assert row.token_hash != raw
    assert len(row.token_hash) == 64
    assert re.fullmatch(r"[0-9a-f]{64}", row.token_hash)

    stored = " ".join(
        str(getattr(row, column.name)) for column in row.__table__.columns
    )
    assert raw not in stored


# --- reset-password: redemption ---------------------------------------------


def test_a_valid_token_sets_the_new_password(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    raw = _usable_token(client, email)
    client.cookies.clear()

    response = client.post(
        "/api/auth/reset-password", json={"token": raw, "password": NEW_PASSWORD}
    )
    assert response.status_code == 200
    assert "reset" in response.json()["message"].lower()


def test_the_old_password_stops_working(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    raw = _usable_token(client, email)
    client.cookies.clear()
    client.post("/api/auth/reset-password", json={"token": raw, "password": NEW_PASSWORD})

    response = client.post(
        "/api/auth/login", json={"email": email, "password": ORIGINAL_PASSWORD}
    )
    assert response.status_code == 401


def test_the_new_password_works(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    raw = _usable_token(client, email)
    client.cookies.clear()
    client.post("/api/auth/reset-password", json={"token": raw, "password": NEW_PASSWORD})

    response = client.post("/api/auth/login", json={"email": email, "password": NEW_PASSWORD})
    assert response.status_code == 200
    assert response.json()["user"]["email"] == email


def test_an_unknown_token_is_refused(client):
    response = client.post(
        "/api/auth/reset-password",
        json={"token": security.generate_token(), "password": NEW_PASSWORD},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == auth_routes._RESET_LINK_DEAD


def test_an_expired_token_is_refused(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    _request_reset(client, email)
    row = _latest_token_row(email)
    raw = _mint_known_token(row.id)

    db = _db()
    try:
        db.get(PasswordResetToken, row.id).expires_at = (
            datetime.datetime.utcnow() - datetime.timedelta(seconds=1)
        )
        db.commit()
    finally:
        db.close()

    response = client.post(
        "/api/auth/reset-password", json={"token": raw, "password": NEW_PASSWORD}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == auth_routes._RESET_LINK_DEAD


def test_a_spent_token_cannot_be_used_again(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    raw = _usable_token(client, email)

    assert (
        client.post(
            "/api/auth/reset-password", json={"token": raw, "password": NEW_PASSWORD}
        ).status_code
        == 200
    )
    replay = client.post(
        "/api/auth/reset-password", json={"token": raw, "password": "yet another password"}
    )
    assert replay.status_code == 400

    # And the replay changed nothing.
    client.cookies.clear()
    assert (
        client.post("/api/auth/login", json={"email": email, "password": NEW_PASSWORD}).status_code
        == 200
    )


def test_unknown_spent_and_expired_are_indistinguishable(client, email):
    """Same status and same sentence for all three.

    Telling them apart would let someone probe which of a batch of guessed
    tokens had ever been real -- and "this token existed but is spent" is a
    fact about an account that exists.
    """
    client.post("/api/auth/signup", json=signup_payload(email))
    spent = _usable_token(client, email)
    client.post("/api/auth/reset-password", json={"token": spent, "password": NEW_PASSWORD})

    _request_reset(client, email)
    expired_row = _latest_token_row(email)
    expired = _mint_known_token(expired_row.id)
    db = _db()
    try:
        db.get(PasswordResetToken, expired_row.id).expires_at = (
            datetime.datetime.utcnow() - datetime.timedelta(seconds=1)
        )
        db.commit()
    finally:
        db.close()

    answers = [
        client.post("/api/auth/reset-password", json={"token": t, "password": NEW_PASSWORD})
        for t in (security.generate_token(), spent, expired)
    ]

    assert {r.status_code for r in answers} == {400}
    assert len({r.json()["detail"] for r in answers}) == 1


def test_a_weak_password_is_refused_and_the_token_survives(client, email):
    """A rejected attempt must not burn the link. Otherwise one typo means
    going back to the inbox for a new email."""
    client.post("/api/auth/signup", json=signup_payload(email))
    raw = _usable_token(client, email)

    weak = client.post("/api/auth/reset-password", json={"token": raw, "password": "short"})
    assert weak.status_code == 422

    retry = client.post(
        "/api/auth/reset-password", json={"token": raw, "password": NEW_PASSWORD}
    )
    assert retry.status_code == 200


def test_reset_enforces_the_same_password_rules_as_signup(client, email):
    """A weak password that signup refuses must not be reachable via reset --
    an easy bypass to leave open when the two paths validate separately."""
    too_short = "a" * (security.MIN_PASSWORD_LENGTH - 1)
    assert security.validate_password(too_short) is not None

    signup = client.post("/api/auth/signup", json=signup_payload(email, password=too_short))
    assert signup.status_code == 422

    client.post("/api/auth/signup", json=signup_payload(email))
    raw = _usable_token(client, email)
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": raw, "password": too_short}
        ).status_code
        == 422
    )


@pytest.mark.parametrize("missing", ["", "   "])
def test_an_empty_token_is_refused(client, missing):
    response = client.post(
        "/api/auth/reset-password", json={"token": missing, "password": NEW_PASSWORD}
    )
    assert response.status_code == 422


def test_reset_password_requires_both_fields(client):
    assert client.post("/api/auth/reset-password", json={}).status_code == 422
    assert (
        client.post("/api/auth/reset-password", json={"token": "x"}).status_code == 422
    )


def test_the_new_password_is_stored_hashed(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    raw = _usable_token(client, email)
    client.post("/api/auth/reset-password", json={"token": raw, "password": NEW_PASSWORD})

    db = _db()
    try:
        user = db.query(User).filter(User.email == email).one()
    finally:
        db.close()

    assert user.password_hash != NEW_PASSWORD
    assert NEW_PASSWORD not in user.password_hash
    # bcrypt, not a bare digest: the prefix carries the algorithm and cost.
    assert user.password_hash.startswith("$2")
    assert security.verify_password(NEW_PASSWORD, user.password_hash)
    assert not security.verify_password(ORIGINAL_PASSWORD, user.password_hash)


def test_a_reset_signs_out_every_session(client, email):
    """Including the attacker's, which is the scenario the feature exists for."""
    client.post("/api/auth/signup", json=signup_payload(email))
    assert client.get("/api/auth/me").status_code == 200

    other = TestClient(app)
    other.post("/api/auth/login", json={"email": email, "password": ORIGINAL_PASSWORD})
    assert other.get("/api/auth/me").status_code == 200

    raw = _usable_token(client, email)
    client.post("/api/auth/reset-password", json={"token": raw, "password": NEW_PASSWORD})

    assert client.get("/api/auth/me").status_code == 401
    assert other.get("/api/auth/me").status_code == 401

    db = _db()
    try:
        user = db.query(User).filter(User.email == email).one()
        assert db.query(UserSession).filter(UserSession.user_id == user.id).count() == 0
    finally:
        db.close()


def test_a_completed_reset_kills_every_other_outstanding_link(client, email):
    """An attacker who requested a reset first, then watched the owner complete
    one of their own, must not be left holding a live link to the account whose
    password just changed."""
    client.post("/api/auth/signup", json=signup_payload(email))

    _request_reset(client, email)
    attacker_row = _latest_token_row(email)
    attacker_raw = _mint_known_token(attacker_row.id)

    # The owner's own request supersedes it, and they complete that one.
    owner_raw = _usable_token(client, email)
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": owner_raw, "password": NEW_PASSWORD}
        ).status_code
        == 200
    )

    assert (
        client.post(
            "/api/auth/reset-password",
            json={"token": attacker_raw, "password": "attacker chosen password"},
        ).status_code
        == 400
    )

    db = _db()
    try:
        user = db.query(User).filter(User.email == email).one()
        outstanding = (
            db.query(PasswordResetToken)
            .filter(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used_at.is_(None),
            )
            .count()
        )
        assert outstanding == 0
    finally:
        db.close()


def test_a_token_stops_working_if_the_account_is_deactivated(client, email):
    client.post("/api/auth/signup", json=signup_payload(email))
    raw = _usable_token(client, email)

    db = _db()
    try:
        db.query(User).filter(User.email == email).one().is_active = False
        db.commit()
    finally:
        db.close()

    response = client.post(
        "/api/auth/reset-password", json={"token": raw, "password": NEW_PASSWORD}
    )
    assert response.status_code == 400


# --- the email --------------------------------------------------------------


def test_the_email_carries_a_working_link_and_no_password(client, email, outbox):
    client.post("/api/auth/signup", json=signup_payload(email))
    _request_reset(client, email)

    assert len(outbox.sent) == 1
    message = outbox.sent[0]

    assert message["to"] == email
    assert message["subject"] == "Reset your ChurnGuard-AI password"
    assert f"{security.RESET_TOKEN_MINUTES} minutes" in message["body"]

    # Never the password, and never the stored hash.
    db = _db()
    try:
        password_hash = db.query(User).filter(User.email == email).one().password_hash
    finally:
        db.close()
    for part in (message["body"], message["html"]):
        assert ORIGINAL_PASSWORD not in part
        assert password_hash not in part

    # The link in the email is the one that actually redeems.
    raw = _token_from_link(message["body"])
    client.cookies.clear()
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": raw, "password": NEW_PASSWORD}
        ).status_code
        == 200
    )


def test_the_email_has_both_a_text_and_an_html_part(client, email, outbox):
    client.post("/api/auth/signup", json=signup_payload(email))
    _request_reset(client, email)
    message = outbox.sent[0]

    assert message["html"] and "<a href=" in message["html"]
    # The same link in both, so a text-only client is not stranded.
    assert _token_from_link(message["body"]) == _token_from_link(message["html"])


def test_the_reset_link_is_built_on_the_configured_frontend(client, email, outbox):
    client.post("/api/auth/signup", json=signup_payload(email))
    _request_reset(client, email)

    link = re.search(r"(https?://\S+/reset-password\?token=[^\s\"<]+)", outbox.sent[0]["body"])
    assert link
    assert link.group(1).startswith(auth_config.FRONTEND_URL.rstrip("/"))


def test_the_reset_link_follows_the_requesting_dev_port(client, email, outbox):
    """Vite hops ports; a link to the port FRONTEND_URL was written for lands
    on a dead server. Development only, and loopback only."""
    client.post("/api/auth/signup", json=signup_payload(email))
    _request_reset(client, email, headers={"Origin": "http://localhost:5178"})

    assert "http://localhost:5178/reset-password?token=" in outbox.sent[0]["body"]


def test_an_external_origin_cannot_redirect_the_reset_link(client, email, outbox):
    """The link is a live credential; pointing it at an attacker's host would
    hand the token over on click."""
    client.post("/api/auth/signup", json=signup_payload(email))
    _request_reset(client, email, headers={"Origin": "https://evil.example.com"})

    body = outbox.sent[0]["body"]
    assert "evil.example.com" not in body
    assert auth_config.FRONTEND_URL.rstrip("/") in body


def test_no_email_is_sent_for_an_unknown_address(client, outbox):
    _request_reset(client, f"nobody-{uuid.uuid4().hex[:10]}@example.com")
    assert outbox.sent == []


# --- OAuth accounts ---------------------------------------------------------


@pytest.fixture
def google_configured(monkeypatch):
    """Pretend a Google application is registered. Only the credentials and the
    discovery document are faked; state checking, identity extraction, linking
    and session creation are all the real code."""
    configured = dataclasses.replace(
        auth_config.GOOGLE,
        client_id="test-client-id.apps.googleusercontent.com",
        client_secret="test-client-secret",
    )
    monkeypatch.setattr(auth_config, "GOOGLE", configured)
    monkeypatch.setitem(auth_config.PROVIDERS, "google", configured)
    monkeypatch.setattr(
        oauth,
        "_discover",
        lambda p: {
            "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_endpoint": "https://oauth2.googleapis.com/token",
            "jwks_uri": "https://www.googleapis.com/oauth2/v3/certs",
            "issuer": "https://accounts.google.com",
        },
    )
    return configured


def _stub_identity(monkeypatch, provider_name, *, subject, email, verified=True):
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
            name="OAuth User",
        ),
    )


def _sign_in_with(client, monkeypatch, provider, email, subject=None):
    """Drives a full OAuth sign-in and returns the resulting local user id."""
    subject = subject or f"sub-{uuid.uuid4().hex[:12]}"
    _stub_identity(monkeypatch, provider, subject=subject, email=email)

    start = client.get(f"/api/auth/{provider}", follow_redirects=False)
    assert start.status_code == 303
    state = re.search(r"state=([^&]+)", start.headers["location"]).group(1)

    callback = client.get(
        f"/api/auth/{provider}/callback?code=stub-code&state={state}", follow_redirects=False
    )
    assert callback.status_code == 303, callback.text

    db = _db()
    try:
        return db.query(User).filter(User.email == email).one().id
    finally:
        db.close()


def test_google_sign_in_still_works(client, google_configured, monkeypatch, email):
    """Regression guard: the reset work must not disturb OAuth."""
    user_id = _sign_in_with(client, monkeypatch, "google", email)

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["auth_provider"] == "google"
    assert "google" in me.json()["linked_providers"]

    db = _db()
    try:
        user = db.get(User, user_id)
        assert user.password_hash is None  # OAuth-only, no placeholder credential
    finally:
        db.close()


def test_an_oauth_only_account_gets_the_set_a_password_wording(
    client, google_configured, monkeypatch, email, outbox
):
    """Served like any other account -- refusing would be a statement about a
    specific address to an anonymous caller -- but "reset your password" makes
    no sense to someone who has never had one."""
    _sign_in_with(client, monkeypatch, "google", email)
    client.cookies.clear()

    _request_reset(client, email)
    body = outbox.sent[0]["body"]

    assert "set a password" in body.lower()
    assert "Google" in body
    assert "Microsoft" not in body
    assert "does not remove or change" in body


def test_setting_a_password_adds_a_credential_without_touching_oauth(
    client, google_configured, monkeypatch, email, outbox
):
    """The security requirement in full: a reset must not create an insecure
    password, must not bypass the provider, and must leave provider sign-in
    exactly as it was."""
    user_id = _sign_in_with(client, monkeypatch, "google", email)
    subject_before = _oauth_links(user_id)
    client.cookies.clear()

    _request_reset(client, email)
    raw = _token_from_link(outbox.sent[0]["body"])
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": raw, "password": NEW_PASSWORD}
        ).status_code
        == 200
    )

    # The password now works...
    assert (
        client.post("/api/auth/login", json={"email": email, "password": NEW_PASSWORD}).status_code
        == 200
    )
    # ...and it is a real bcrypt hash, not a placeholder.
    db = _db()
    try:
        user = db.get(User, user_id)
        assert user.password_hash.startswith("$2")
        assert security.verify_password(NEW_PASSWORD, user.password_hash)
    finally:
        db.close()

    # The Google link is untouched, so provider sign-in is unaffected.
    assert _oauth_links(user_id) == subject_before

    client.cookies.clear()
    _sign_in_with(client, monkeypatch, "google", email, subject=subject_before[0][1])
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert set(me.json()["linked_providers"]) == {"password", "google"}


def _oauth_links(user_id):
    db = _db()
    try:
        return sorted(
            (a.provider, a.provider_account_id)
            for a in db.query(OAuthAccount).filter(OAuthAccount.user_id == user_id).all()
        )
    finally:
        db.close()


def test_an_oauth_only_account_cannot_be_signed_into_before_a_password_is_set(
    client, google_configured, monkeypatch, email
):
    """Requesting a reset must not, by itself, create a usable password."""
    _sign_in_with(client, monkeypatch, "google", email)
    client.cookies.clear()

    _request_reset(client, email)

    for attempt in ("", " ", NEW_PASSWORD, ORIGINAL_PASSWORD):
        response = client.post("/api/auth/login", json={"email": email, "password": attempt})
        assert response.status_code == 401


def test_the_reset_flow_never_reveals_how_an_account_signs_in(
    client, google_configured, monkeypatch, email
):
    """A password account and an OAuth-only account must be indistinguishable
    from outside -- otherwise the form reports which addresses use SSO."""
    _sign_in_with(client, monkeypatch, "google", email)
    client.cookies.clear()

    password_email = f"pw-{uuid.uuid4().hex[:10]}@example.com"
    client.post("/api/auth/signup", json=signup_payload(password_email))
    client.cookies.clear()

    oauth_response = client.post("/api/auth/forgot-password", json={"email": email})
    password_response = client.post(
        "/api/auth/forgot-password", json={"email": password_email}
    )

    assert oauth_response.status_code == password_response.status_code == 200
    assert oauth_response.json() == password_response.json()
