"""
Server-side sessions and the cookie that carries them.

The browser holds one value: an opaque random token in an HttpOnly cookie. It
carries no claims, decodes to nothing, and means only what the matching
`user_sessions` row says it means. That is the entire point of the design:

  * HttpOnly  -- JavaScript cannot read it, so an XSS bug that would have
                 walked off with a localStorage JWT gets nothing it can
                 exfiltrate. (It can still *use* the cookie from the victim's
                 browser; HttpOnly limits theft, not abuse.)
  * opaque    -- nothing to decode, nothing to tamper with, no algorithm
                 confusion, no claims to forge.
  * revocable -- signing out deletes the row, and the next request fails. A
                 JWT cannot do this; it stays valid until it expires no matter
                 what the server has since decided.

Only the SHA-256 of the token is stored, so reading the database yields
nothing replayable.
"""
import datetime
from typing import Optional

from fastapi import Response
from sqlalchemy.orm import Session

from ..db import security
from ..db.models import User, UserSession
from . import config


def create_session(
    db: Session, user: User, *, remember: bool, auth_method: str = "password"
) -> tuple[str, UserSession]:
    """Issues a session and returns `(raw_token, row)`.

    The raw token is returned rather than stored: it exists only long enough
    for the caller to put it in a Set-Cookie header. After this function
    returns, the database holds the hash and nothing else.
    """
    raw_token = security.generate_token()
    row = UserSession(
        user_id=user.id,
        token_hash=security.hash_token(raw_token),
        expires_at=security.session_expiry(remember),
        auth_method=auth_method,
    )
    db.add(row)
    db.commit()
    return raw_token, row


def lookup_session(db: Session, raw_token: str) -> Optional[UserSession]:
    """The session for this token, or None if it is unknown, expired, or its
    user has been deactivated.

    An expired row is deleted on sight rather than merely ignored: this runs
    on every authenticated request, which makes it the natural place to keep
    the table from accumulating dead rows forever, and it costs one DELETE
    only in the rare case that a request actually presents an expired token.
    """
    row = (
        db.query(UserSession)
        .filter(UserSession.token_hash == security.hash_token(raw_token))
        .first()
    )
    if row is None:
        return None
    if row.expires_at <= datetime.datetime.utcnow():
        db.delete(row)
        db.commit()
        return None
    # Checked here, not only at login: deactivating an account must take
    # effect on the account's next request, not whenever its existing session
    # happens to lapse.
    if row.user is None or not row.user.is_active:
        return None
    return row


def revoke_session(db: Session, raw_token: str) -> bool:
    """Ends one session. True if there was one to end.

    Idempotent by design -- signing out twice, or signing out with a cookie
    the server has already forgotten, is a success, not an error. The route
    clears the cookie either way.
    """
    row = (
        db.query(UserSession)
        .filter(UserSession.token_hash == security.hash_token(raw_token))
        .first()
    )
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def revoke_all_sessions(db: Session, user_id: str, *, commit: bool = True) -> int:
    """Ends every session this user has anywhere. Returns how many.

    Used after a password reset: whoever forced the reset may have been
    signed in already, and leaving their session alive would make the reset
    cosmetic.

    `commit=False` lets the caller fold this into a transaction it is already
    running. The password reset does exactly that, so that changing the
    password and invalidating the old sessions either both happen or neither
    does -- committed separately, a failure in between would leave the
    password changed and every pre-existing session still live, which is the
    precise situation the reset exists to end.
    """
    rows = db.query(UserSession).filter(UserSession.user_id == user_id).all()
    for row in rows:
        db.delete(row)
    if commit:
        db.commit()
    return len(rows)


# --- cookie -----------------------------------------------------------------


def set_session_cookie(response: Response, raw_token: str, *, remember: bool) -> None:
    """Attaches the session cookie.

    `max_age` is omitted entirely when Remember-me is unchecked, which makes
    this a browser-session cookie: it is discarded when the window closes.
    Passing max_age=0 would instead mean "expire immediately" -- deleting the
    cookie rather than scoping it to the session, which is a real and easy
    mistake to make here.

    Whatever the cookie says, the `user_sessions` row is the authority on when
    the session ends. Editing the cookie's lifetime client-side extends
    nothing.
    """
    kwargs = dict(
        key=config.SESSION_COOKIE_NAME,
        value=raw_token,
        httponly=True,
        secure=config.IS_PRODUCTION,
        samesite=config.SESSION_COOKIE_SAMESITE,
        path="/",
    )
    if config.SESSION_COOKIE_DOMAIN:
        kwargs["domain"] = config.SESSION_COOKIE_DOMAIN
    if remember:
        kwargs["max_age"] = security.SESSION_DAYS_REMEMBER * 24 * 60 * 60
    response.set_cookie(**kwargs)


def clear_session_cookie(response: Response) -> None:
    """Removes the cookie.

    The attributes here must match those used when setting it -- path, and
    domain if one was configured. A delete_cookie whose path differs from the
    original silently does nothing: the browser treats them as two different
    cookies and keeps the one that matters.
    """
    kwargs = dict(key=config.SESSION_COOKIE_NAME, path="/")
    if config.SESSION_COOKIE_DOMAIN:
        kwargs["domain"] = config.SESSION_COOKIE_DOMAIN
    response.delete_cookie(**kwargs)
