"""
Standalone DB connection test -- deliberately has nothing to do with
FastAPI, SQLAlchemy, the connection pool, or any of ChurnGuard's own code.
The point is to answer one question in isolation: does a plain psycopg2
connection (TCP + SSL handshake + Postgres startup) to Neon succeed from
this machine, right now?

Run it directly:
    python test_db_connection.py

It reads DATABASE_URL the same way the real app does (from backend/.env),
so it's testing the exact same connection string, just with nothing else
in the way.
"""
import os
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / "backend" / ".env", override=True)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise SystemExit("DATABASE_URL not found -- run this from the project root (same folder as backend/).")

host = DATABASE_URL.split("@")[-1].split("/")[0] if "@" in DATABASE_URL else "(unparsed)"
print(f"Testing connection to: {host}")
print("Attempting psycopg2.connect() with a 10s timeout...\n")

import psycopg2  # noqa: E402

start = time.time()
try:
    conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
    elapsed = time.time() - start
    print(f"SUCCESS in {elapsed:.2f}s -- connection, SSL handshake, and Postgres startup all worked.")
    cur = conn.cursor()
    cur.execute("SELECT 1")
    print(f"Query result: {cur.fetchone()}")
    conn.close()
except Exception as exc:  # noqa: BLE001 -- diagnostic script, print everything
    elapsed = time.time() - start
    print(f"FAILED after {elapsed:.2f}s")
    print(f"Error type: {type(exc).__name__}")
    print(f"Error: {exc}")