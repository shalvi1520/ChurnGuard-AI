"""
Rate limiting for the unauthenticated authentication endpoints.

**Scope, stated first so this is not mistaken for more than it is.** This is an
in-process, in-memory sliding window. It protects one uvicorn worker. Run four
workers, or two machines behind a load balancer, and each keeps its own
counters -- the effective limit multiplies by the number of processes.

That limitation is accepted deliberately. The alternative is a shared store
(Redis, or a database table written on every attempt), and this project has
neither a Redis nor an appetite for a round-trip on a path whose entire job is
to be cheap. What this does buy, on any deployment, is the thing the reset
endpoint actually needs protecting from: a script pointed at one address
hammering out reset emails, and a single source walking a list of addresses.
Both are per-process floods, and both are stopped here. A distributed,
low-and-slow campaign is not, and the README says so rather than implying a
guarantee that isn't being made.

**Why it cannot become an account-existence oracle.** The check runs *before*
the user lookup, on the submitted address, whether or not that address has an
account. If it ran only for real accounts, a 429 would mean "this email is
registered" -- which would hand back exactly the disclosure the generic
response in auth_routes.py exists to prevent.

Keys are stored hashed. There is no security claim in that: it just keeps a
long-lived process from holding a plaintext list of every address anyone has
ever typed into the forgot-password form.
"""
import hashlib
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Deque, Dict


@dataclass(frozen=True)
class Decision:
    """The outcome of one check.

    `retry_after` is whole seconds until the oldest hit in the window falls
    out of it -- i.e. until one slot frees up. It is sent as the `Retry-After`
    header, which is a real instruction to well-behaved clients and a useful
    thing for a human to be told.
    """

    allowed: bool
    retry_after: int = 0


class SlidingWindow:
    """`limit` events per `window_seconds`, per key.

    Sliding rather than fixed-bucket: a fixed window lets someone spend the
    whole allowance at 11:59:59 and the whole next allowance at 12:00:00, which
    is twice the intended rate at the moment it matters most. Keeping the
    timestamps costs a few bytes per key and removes that edge entirely.

    Thread-safe because it has to be. FastAPI runs plain `def` endpoints -- all
    of auth_routes.py -- on a worker thread pool, so two requests for the same
    email genuinely can be inside `check()` at the same time.
    """

    def __init__(self, limit: int, window_seconds: int, name: str = "") -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.name = name
        self._hits: Dict[str, Deque[float]] = {}
        self._lock = threading.Lock()
        self._last_prune = 0.0

    @staticmethod
    def _key(raw: str) -> str:
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _prune(self, now: float) -> None:
        """Drop keys whose every hit has aged out. Caller holds the lock.

        Without this the dict is an unbounded memory leak on a public endpoint:
        one entry per distinct address ever submitted, kept for the life of the
        process. Run at most once a minute, since it walks every key.
        """
        if now - self._last_prune < 60:
            return
        self._last_prune = now
        cutoff = now - self.window_seconds
        for key in [k for k, hits in self._hits.items() if not hits or hits[-1] <= cutoff]:
            del self._hits[key]

    def check(self, raw_key: str) -> Decision:
        """Consumes one slot if there is one.

        Consuming on success and not on failure is the deliberate choice: a
        refused request must not push the window forward, or a client retrying
        in a tight loop would hold itself out indefinitely rather than getting
        back in as soon as the window genuinely clears.
        """
        if self.limit <= 0:  # 0 disables the limiter (documented escape hatch)
            return Decision(allowed=True)

        key = self._key(raw_key)
        now = time.monotonic()
        with self._lock:
            self._prune(now)
            cutoff = now - self.window_seconds
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= cutoff:
                hits.popleft()

            if len(hits) >= self.limit:
                retry_after = max(1, int(hits[0] + self.window_seconds - now) + 1)
                return Decision(allowed=False, retry_after=retry_after)

            hits.append(now)
            return Decision(allowed=True)

    def reset(self) -> None:
        """Clears all state. For tests, which must not inherit a window from
        whichever test ran before them."""
        with self._lock:
            self._hits.clear()
            self._last_prune = 0.0


def client_ip(request, trust_proxy: bool) -> str:
    """The address to rate-limit an IP-keyed window on.

    `X-Forwarded-For` is read **only** when the deployment says it is behind a
    proxy that sets it. Trusting it unconditionally would make the IP limiter
    decorative: any caller can send a different `X-Forwarded-For` on every
    request and get a fresh allowance each time. Trusting it never would make
    it equally useless behind a real proxy, where every request appears to come
    from the load balancer -- one shared bucket for all users.

    The left-most entry is the original client; the rest are the proxies it
    passed through.
    """
    if trust_proxy:
        forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        if forwarded:
            return forwarded
    client = getattr(request, "client", None)
    return getattr(client, "host", None) or "unknown"
