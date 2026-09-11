"""
Standalone timing test -- completely separate from the FastAPI app -- to
find out whether a slow /predict is caused by the database connection
itself (network route to Neon) or by something in the app's own code.

Run from backend/:  python test_db_speed.py
"""
import os
import time

from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise SystemExit("DATABASE_URL not found -- run this from the backend/ folder.")

import psycopg2  # noqa: E402  (import after the check above, on purpose)

for attempt in range(1, 4):
    start = time.perf_counter()
    conn = psycopg2.connect(DATABASE_URL, connect_timeout=30)
    connected = time.perf_counter()
    cur = conn.cursor()
    cur.execute("SELECT 1;")
    cur.fetchone()
    queried = time.perf_counter()
    conn.close()

    print(f"Attempt {attempt}:")
    print(f"  Connect time : {connected - start:.2f}s")
    print(f"  Query time   : {queried - connected:.2f}s")
    print(f"  Total        : {queried - start:.2f}s")
    print()
