# ParkHere: Smart Parking Management & Reservation System

College DBMS project targeting Katpadi and Vellore, Tamil Nadu.

## Current stack

- **Frontend:** React 18, Vite, Tailwind CSS (kept from the original project)
- **Backend:** Python Flask with route modules/blueprints
- **Database:** PostgreSQL, using parameterized raw SQL and no ORM
- **Security:** JWT authentication, bcrypt password hashes, role-based access, HMAC-SHA256 gate-code hashes, AES-256-GCM gate-code encryption

The Flask migration preserves the existing `/api/...` contract and the PostgreSQL schema, including the 17-table relational design, occupancy view, expiry function, status-change audit trigger, transactions, and capacity-pooling model. The original Express source is available in `legacy_node_backend/` as a reference only.

## Quick start

1. Install PostgreSQL and create an empty database named `parkhere`.
2. Follow `backend/README.md` to create a virtual environment, install Python dependencies, configure `backend/.env`, and initialize the schema.
3. Start Flask with `cd backend && python app.py`.
4. In another terminal, start the existing frontend with `cd frontend && npm install && npm run dev`.
5. Open `http://localhost:5173`; the Vite development proxy forwards `/api` calls to Flask at `http://127.0.0.1:5000`.

Health check: `http://localhost:5000/api/health`.

## Database features preserved

- 17 related tables, foreign keys, checks, unique constraints, and indexes
- Time-overlap availability through `v_occupying_bookings`
- Separate public and verified-member capacity pools
- Transactional booking with row-level locking to prevent overbooking
- Gate arrival PIN hashing, encrypted customer retrieval, expiry, and single-use invalidation
- Trigger-generated booking lifecycle audit history
- Exit-time billing, overtime, add-ons, invoices, and simulated payments
- Role-specific customer, organisation administrator, private owner, and platform administrator APIs

See `database/parkhere.sql` for the full schema and viva SQL exercises.
