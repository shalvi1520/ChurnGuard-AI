"""
Credential primitives: password hashing, opaque session/reset tokens, and the
legacy JWT helpers.

Two different kinds of secret live here and they are handled differently on
purpose:

  Passwords   -- hashed with bcrypt, which is deliberately slow. Verifying is
                 meant to cost real time so that guessing does too.
  Tokens      -- session cookies and reset links. These are already 256 bits
                 of CSPRNG output, so there is nothing to brute-force and no
                 reason to pay bcrypt's cost on every single request. A plain
                 SHA-256 is the right tool: it keeps the stored value useless
                 to anyone who reads the database, without making every
                 authenticated request wait on a KDF.

The rule both share: what the user holds is never what the server stores.

JWT_SECRET must come from the environment, never a literal in code -- see
backend/.env. There is no fallback default: a server that can't verify its
own tokens should fail to start, not silently sign with a guessable secret.
"""
import datetime
import hashlib
import hmac
import os
import secrets
from pathlib import Path
from typing import Optional

import bcrypt
import jwt
from dotenv import load_dotenv

# See database.py's matching comment: an explicit path, not load_dotenv()'s
# call-depth-dependent frame-guessing default.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET is not set. Add a long random value to backend/.env, e.g. "
        "generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )

JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = 24 * 7

# Remember-me, in concrete numbers. Unchecked gives a session that dies with
# the browser (no cookie Max-Age at all, so it is gone when the window
# closes) but is still capped server-side at this many hours -- a browser
# left open for a fortnight should not mean a fortnight-long session.
SESSION_HOURS_DEFAULT = 12
# Checked: a persistent cookie, and a row that outlives the browser.
SESSION_DAYS_REMEMBER = 30

# Short on purpose. A reset link is the one credential that arrives over
# email, the least trustworthy channel in the system, so it is valid for the
# length of one sitting rather than one day.
RESET_TOKEN_MINUTES = 60

MIN_PASSWORD_LENGTH = 8


def hash_password(password: str) -> str:
    # bcrypt silently truncates at 72 bytes; rejecting instead of truncating
    # avoids a passphrase whose tail is quietly ignored.
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must be 72 bytes or fewer.")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: Optional[str]) -> bool:
    """False for an account that has no password at all.

    An OAuth-only user has `password_hash = NULL` (see models.User). Passing
    that to bcrypt would raise; returning False states the accurate thing --
    this account cannot be opened with a password -- and lets the login route
    answer with its usual generic message rather than a 500 that would also
    reveal the account exists.
    """
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def validate_password(password: str) -> Optional[str]:
    """Returns a human-readable complaint, or None if the password is fine.

    Deliberately just a length floor. Composition rules (an uppercase, a
    digit, a symbol) push people towards `Password1!` and towards reuse, and
    NIST has recommended against them since SP 800-63B; length is the property
    that actually buys resistance. The signup form's strength meter still
    *encourages* better passwords -- it just doesn't refuse merely unfashionable
    ones.
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if len(password.encode("utf-8")) > 72:
        return "Password must be 72 bytes or fewer."
    return None


# --- opaque tokens ----------------------------------------------------------


def generate_token() -> str:
    """A fresh 256-bit URL-safe token. This is the only time the raw value
    exists; callers hand it to the user and store `hash_token()` of it."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 hex of a token, for storage and lookup.

    Unsalted on purpose, and correct here in a way it would not be for a
    password: lookup requires computing the same digest from the incoming
    cookie, which a per-row salt would make impossible, and the input is
    already 256 bits of randomness, so there is no dictionary to precompute
    and nothing a rainbow table could help with.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_equal(a: str, b: str) -> bool:
    """Constant-time comparison, for the paths that compare digests directly
    (OAuth state) rather than looking one up by primary key."""
    return hmac.compare_digest(a, b)


def session_expiry(remember: bool) -> datetime.datetime:
    now = datetime.datetime.utcnow()
    if remember:
        return now + datetime.timedelta(days=SESSION_DAYS_REMEMBER)
    return now + datetime.timedelta(hours=SESSION_HOURS_DEFAULT)


def reset_expiry() -> datetime.datetime:
    return datetime.datetime.utcnow() + datetime.timedelta(minutes=RESET_TOKEN_MINUTES)


# --- legacy JWT -------------------------------------------------------------
#
# Sessions are database-backed opaque tokens now (models.UserSession), because
# a JWT cannot be revoked and "Sign out" has to actually mean something. These
# helpers stay for the `Authorization: Bearer` path, which auth_routes still
# accepts for scripting and for the backend's own tests -- a signed token, not
# a bypass, and never the browser's mechanism.


def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRES_HOURS),
        "iat": datetime.datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[str]:
    """Returns the user id the token was issued for, or None if the token is
    missing, expired, or doesn't verify -- callers treat None as "not signed
    in", never as an error to surface."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    return payload.get("sub")
