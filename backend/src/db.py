"""PostgreSQL access layer using parameterized raw SQL (no ORM)."""
import os
import re
from contextlib import contextmanager
from decimal import Decimal
from datetime import date, datetime, time
from dotenv import load_dotenv
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
load_dotenv(os.path.join(ROOT, '.env'))
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/parkhere')
_pool = None


def get_pool():
    global _pool
    if _pool is None:
        _pool = ThreadedConnectionPool(1, 20, dsn=DATABASE_URL, connect_timeout=5)
    return _pool


def _prepare(sql, params):
    """Translate node-pg $1 placeholders to psycopg2 %s placeholders safely."""
    if not params:
        return sql, ()
    indexes = [int(m.group(1)) for m in re.finditer(r'\$(\d+)', sql)]
    if not indexes:
        return sql, tuple(params)
    converted = re.sub(r'\$(\d+)', '%s', sql)
    ordered = tuple(params[i - 1] for i in indexes)
    return converted, ordered


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, memoryview):
        return value.tobytes().decode('utf-8', errors='replace')
    return value


class DB:
    def __init__(self, conn):
        self.conn = conn

    def query(self, sql, params=None):
        prepared, values = _prepare(sql, params or ())
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(prepared, values)
            rows = cur.fetchall() if cur.description else []
            return {'rows': [dict(r) for r in rows], 'rowcount': cur.rowcount}



def query(sql, params=None):
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            prepared, values = _prepare(sql, params or ())
            cur.execute(prepared, values)
            rows = cur.fetchall() if cur.description else []
            conn.commit()
            return {'rows': [dict(r) for r in rows], 'rowcount': cur.rowcount}
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


@contextmanager
def transaction():
    pool = get_pool()
    conn = pool.getconn()
    try:
        conn.autocommit = False
        yield DB(conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.autocommit = True
        pool.putconn(conn)


def close_pool():
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None
