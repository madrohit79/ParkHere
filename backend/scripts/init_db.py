"""Apply the project's original SQL sections to a fresh PostgreSQL database."""
import os, re
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(Path(__file__).resolve().parents[1] / '.env')
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/parkhere')
SQL_PATH = ROOT / 'database' / 'parkhere.sql'


def main():
    if not SQL_PATH.exists():
        raise SystemExit(f'Schema file not found: {SQL_PATH}')
    sql = SQL_PATH.read_text(encoding='utf-8-sig')
    # Match the section-by-section execution used by the original initializer.
    # Section 7 contains intentional BEGIN/ROLLBACK demonstrations and must not
    # accidentally roll back schema/seed work from earlier sections.
    sections = re.split(r'-- =+\s*\n-- SECTION ', sql)
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            for index, section in enumerate(sections[1:], start=1):
                section_sql = '-- SECTION ' + section
                title = section_sql.splitlines()[0].replace('--', '').strip()
                clean_sql = re.sub(r'--[^\n]*', '', section_sql).strip()
                if not clean_sql:
                    print(f'[{index}/{len(sections)-1}] {title} ... SKIPPED (documentation)')
                    continue
                print(f'[{index}/{len(sections)-1}] {title} ...', end=' ', flush=True)
                cur.execute(section_sql)
                print('OK')
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*) FROM users'); users = cur.fetchone()[0]
            cur.execute('SELECT COUNT(*) FROM parking_locations'); locations = cur.fetchone()[0]
            cur.execute('SELECT COUNT(*) FROM org_members'); members = cur.fetchone()[0]
            cur.execute('SELECT COUNT(*) FROM bookings'); bookings = cur.fetchone()[0]
        print('\nDatabase initialization completed.')
        print(f'Users: {users} | Locations: {locations} | Organisation members: {members} | Bookings: {bookings}')
    finally:
        conn.close()


if __name__ == '__main__':
    main()
