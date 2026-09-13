"""
Unlike test_db_connection.py (one fresh psycopg2 connection per process),
this uses the REAL app engine/session from backend/db/database.py and
repeats a query several times in the SAME process, with pauses in between --
much closer to what actually happens while the app runs: one long-lived
pool, reused (or sitting briefly idle) across many requests over time.

Run from the project root:
    python test_db_pool_reuse.py
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from backend.db.database import SessionLocal  # noqa: E402
from sqlalchemy import text  # noqa: E402

N_ROUNDS = 8
PAUSE_SECONDS = 3

print(f"Running {N_ROUNDS} rounds, {PAUSE_SECONDS}s apart, reusing the app's real connection pool.\n")

for i in range(1, N_ROUNDS + 1):
    start = time.time()
    db = SessionLocal()
    try:
        result = db.execute(text("SELECT 1")).scalar()
        elapsed = time.time() - start
        print(f"[{i}/{N_ROUNDS}] OK in {elapsed:.2f}s -- result={result}")
    except Exception as exc:  # noqa: BLE001 -- diagnostic script, show everything
        elapsed = time.time() - start
        print(f"[{i}/{N_ROUNDS}] FAILED after {elapsed:.2f}s -- {type(exc).__name__}: {exc}")
    finally:
        db.close()
    if i < N_ROUNDS:
        time.sleep(PAUSE_SECONDS)

print("\nDone.")