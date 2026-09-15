# Authentication Setup

How to configure ChurnGuard's authentication: the database, Google sign-in,
and password-reset email.

Email/password sign-up and sign-in work with **no** configuration beyond
`DATABASE_URL` and `JWT_SECRET`. Google sign-in and password-reset email
each need credentials you register yourself — the sections below say exactly
where to get them and where to put them.

Nothing here belongs in a `VITE_*` variable. Vite inlines those into the
JavaScript bundle it serves to every visitor, so a client secret placed there
is published, not configured. All of it lives in `backend/.env`, which is
gitignored and never reaches the browser.

---

## 1. Required configuration

Create `backend/.env` (copy `backend/.env.example`):

```bash
# Where accounts, sessions and dataset history live.
DATABASE_URL=postgresql://user:password@localhost:5432/churnguard
# ...or, for a local file-backed database with no server to run:
# DATABASE_URL=sqlite:///./churnguard.db

# Signs the Bearer tokens used for API scripting. Required.
# Generate one with:
#   python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=
```

Then create the tables:

```bash
python -m alembic upgrade head
```

At this point sign-up, sign-in, sign-out, session restore and protected routes
all work.

### Ports and URLs

The defaults assume the standard local setup:

| What | URL |
| :--- | :--- |
| Frontend (Vite) | `http://localhost:5173` |
| Backend (uvicorn) | `http://localhost:8000` |
| API base | `http://localhost:8000/api` |

If yours differ, set `FRONTEND_URL` and `BACKEND_URL` in `backend/.env`. They
determine the OAuth redirect URI and the link in a password-reset email, so
they must match reality.

> Vite increments its port (5174, 5175, …) when 5173 is already taken. If that
> happens, either free the port or update `FRONTEND_URL` — otherwise OAuth will
> complete and then redirect the browser to the wrong port.

---

## 2. Google sign-in

### Register the application

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or select one).
3. **APIs & Services → OAuth consent screen**
   - User type: **External** (unless you have a Workspace org and want
     internal-only).
   - Fill in app name, support email, developer contact.
   - Scopes: the default `openid`, `email` and `profile` are all that is
     needed. Do not add more — ChurnGuard asks for nothing else.
   - While the app is in **Testing**, only accounts listed under **Test users**
     can sign in. Add your own address there, or publish the app.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized redirect URIs** — add exactly:
     ```
     http://localhost:8000/api/auth/google/callback
     ```
     This must match character for character, including the scheme, port and
     path. Google rejects a mismatch with `redirect_uri_mismatch`, which is by
     far the most common setup error.
   - Authorized JavaScript origins: not required. The browser never talks to
     Google's token endpoint directly in this flow — the backend does.
5. Copy the **Client ID** and **Client secret**.

### Configure

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
```

Restart the backend. The Google button on the sign-in page becomes active.

---

## 3. Password-reset email

Without SMTP settings the reset flow still works end to end — a token is
created, the link is valid, and it can be pasted into the browser — but nothing
is sent, and the UI says so plainly instead of claiming an email is on its way.

In **development** (`APP_ENV=development`, the default) the backend writes the
link to its log so the flow can be completed locally. In **production** the body
is withheld from the log entirely: a reset link is a live credential, and logs
are shipped, tailed and retained. Configure SMTP rather than relying on the log.

To enable real delivery:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=ChurnGuard <no-reply@yourdomain.com>
SMTP_USE_TLS=true
```

Gmail requires an [App Password](https://support.google.com/accounts/answer/185833)
rather than your account password, with `SMTP_HOST=smtp.gmail.com` and
`SMTP_PORT=587`.

To use an API-based provider (Resend, SES, Postmark) instead, add a subclass of
`EmailBackend` in `backend/auth/email_service.py` and select it in
`get_backend()`. Nothing else in the codebase touches email.

---

## 4. Production

```bash
APP_ENV=production
FRONTEND_URL=https://app.yourdomain.com
BACKEND_URL=https://api.yourdomain.com
CORS_ORIGINS=https://app.yourdomain.com
```

`APP_ENV=production` sets `Secure` on the session cookie, so it is only ever
sent over HTTPS. Leaving it as `development` on a public deployment would send
session cookies in the clear.

Also remember to:

- Register the production redirect URI with Google (it is a separate entry
  from the localhost one — keep both if you still develop locally).
- Set `CORS_ORIGINS` explicitly. Left unset, the backend allows any
  `localhost` origin, which is right for development and wrong for production.
- If the API and the app are on **different registrable domains** (not just
  different subdomains), the session cookie needs
  `SESSION_COOKIE_SAMESITE=none`, which also requires `Secure` — i.e. HTTPS.
  Same-domain deployments should stay on the default `lax`.

---

## 5. How it works

### Sessions

Sign-in creates a row in `user_sessions` and returns an opaque random token in
an **HttpOnly** cookie. The database stores only the token's SHA-256.

- **HttpOnly** — JavaScript cannot read it, so an XSS bug cannot exfiltrate it
  the way it could a token in `localStorage`.
- **Opaque** — nothing to decode, nothing to forge.
- **Revocable** — sign-out deletes the row, and the next request fails. This is
  the property a JWT cannot provide: a JWT stays valid until it expires no
  matter what the server has since decided.

**Remember me** unchecked gives a browser-session cookie capped at 12 hours
server-side; checked gives a 30-day persistent one. The `expires_at` column is
authoritative, so editing the cookie client-side changes nothing.

### OAuth

```
Browser  →  GET /api/auth/google          (backend builds the authorize URL)
         →  Google consent screen
         →  GET /api/auth/google/callback  (backend exchanges the code)
         →  redirect to FRONTEND_URL/auth/callback
         →  frontend calls /api/auth/me and routes onward
```

The browser never sees a client secret, an authorization code, or a provider
access token. Three things are verified before any identity is trusted:

1. **`state`** — a random value in a short-lived HttpOnly cookie, echoed by the
   provider. Prevents login CSRF, where a victim is walked through a callback
   carrying an attacker's authorization code.
2. **PKCE** — an intercepted authorization code is useless without the
   verifier, which is only revealed at token exchange.
3. **ID token signature** — checked against the provider's published JWKS, with
   issuer and audience pinned.

Accounts are keyed on the provider's stable subject (`sub`), never on email.

**Account linking.** If a provider identity is new but its email matches an
existing account, the two are linked **only if the provider says the email is
verified**. Otherwise sign-in is refused with a message directing the user to
their password — because auto-linking an unverified address would let anyone
who can get a provider to assert that address take over the account. Google
states verification per token; a provider that does not assert it is treated
as unverified.

### Password reset

A random token is generated, only its SHA-256 is stored, it expires after 60
minutes, and it works once. Requesting a new link invalidates any earlier one,
and a completed reset signs out every existing session for that account.

`/api/auth/forgot-password` returns the same response whether or not the
address has an account, so the form cannot be used to discover who has one.

---

## 6. Troubleshooting

| Symptom | Cause |
| :--- | :--- |
| `redirect_uri_mismatch` | The registered URI differs from `GOOGLE_REDIRECT_URI`. They must match exactly — scheme, host, port, path. |
| Google button is greyed out | Google has no client id/secret in `backend/.env`. Hover it for the reason; check `GET /api/auth/providers`. |
| Signed out immediately after OAuth | `FRONTEND_URL` doesn't match the port the app is actually on, so the cookie was set for a different origin. |
| Signed out on every refresh | The frontend isn't sending credentials. `withCredentials: true` must be set on the axios client, and the backend's CORS must allow the frontend's exact origin with `allow_credentials`. |
| "Email delivery isn't configured" | Expected with no `SMTP_HOST`. The reset link is in the backend log. |
| `DATABASE_URL is not set` | No `backend/.env`, or it's missing that key. |
| Reset link says invalid | It expired (60 minutes), was already used, or a newer request superseded it. |
