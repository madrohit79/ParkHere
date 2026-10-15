# ParkHere Flask API

This directory is the Flask replacement for the original Express API. The React + Vite frontend is intentionally unchanged and continues to call the same `/api/...` endpoints. PostgreSQL, the existing SQL schema, views, PL/pgSQL functions, triggers, and parameterized raw SQL are retained. No ORM is used.

## Requirements

- Python 3.10+
- PostgreSQL 14+ (the supplied schema targets PostgreSQL features and should be used with PostgreSQL, not SQLite)
- Node.js 18+ only for the existing frontend

> The previous backend used a Node-specific embedded PostgreSQL package. The Flask backend does not try to start that Node package. Run a local PostgreSQL server and configure `DATABASE_URL`.

## Setup

From the project root:

```bash
cd backend
python -m venv .venv
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

macOS/Linux:

```bash
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to your PostgreSQL database. Set `JWT_SECRET` and `CODE_HMAC_SECRET` to long random secrets. `CODE_ENC_KEY` must be exactly 64 hexadecimal characters (32 bytes), because the arrival-code encryption uses AES-256-GCM.

Create a fresh database named `parkhere` in PostgreSQL, then from the project root run:

```bash
cd backend
python scripts/init_db.py
```

**Warning:** the schema file seeds demo rows and is intended for a fresh database. Do not run it against an already populated database unless you have backed up the data and understand the seed section.

## Start the application

Terminal 1, from the project root:

```bash
cd backend
python app.py
```

API: `http://localhost:5000/api/health`

Terminal 2:

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`. The existing Vite proxy forwards `/api` requests to Flask on port 5000. No frontend source changes are required for the backend migration.

## Demo accounts

The SQL seed data uses the password `Password123!` for its demo users. The seeded roles include platform admin, organisation admin, owner, and customer. Use the account email addresses documented in the root README and verify them against `database/parkhere.sql` if the seed set has been edited.

## Architecture

```text
React + Vite + Tailwind (existing frontend)
               |
          /api/* requests
               |
       Flask route blueprints
               |
     JWT + role/provider guards
               |
  Parameterized PostgreSQL raw SQL
               |
  Tables, views, triggers, PL/pgSQL
```

Run the pure utility regression tests with `python -m unittest discover -s tests -v` from this directory. The API route prefixes and response envelopes are kept compatible with the existing frontend. Reservation creation uses a PostgreSQL transaction and row lock (`SELECT ... FOR UPDATE`) before checking capacity. Gate PINs use HMAC-SHA256 hashes and AES-256-GCM encryption. The booking-expiry sweep runs in a background thread every 30 seconds and can be disabled with `DISABLE_EXPIRY_WORKER=1` for tests.

## Troubleshooting

- `connection refused`: start PostgreSQL and verify `DATABASE_URL`.
- `relation ... does not exist`: initialize a fresh database using `python scripts/init_db.py`.
- `invalid key length`: `CODE_ENC_KEY` must contain exactly 64 hexadecimal characters.
- `401`: sign in again; JWTs expire after 24 hours.
- If you change the backend port, also update the Vite proxy in `frontend/vite.config.js`.

The original Node/Express source is retained separately in `legacy_node_backend/` for comparison; it is not used when running the Flask backend.
