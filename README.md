# ParkHere: Smart Parking Management & Reservation System

ParkHere is a smart parking management and reservation platform that enables users to discover parking facilities, check availability, reserve parking spaces, and manage bookings. It provides dedicated portals for customers, parking providers, organisation administrators, and platform administrators.

## Current Stack

- **Frontend:** React 18, Vite, Tailwind CSS
- **Backend:** Python Flask with route modules and Blueprints
- **Database:** PostgreSQL, using parameterized raw SQL without an ORM
- **Security:** JWT authentication, bcrypt password hashing, HMAC-SHA256 gate-code hashes, and AES-256-GCM gate-code encryption

The Flask migration preserves the existing `/api/...` contract and PostgreSQL schema, including the 17-table relational design, occupancy view, expiry function, status-change audit trigger, transactions, and capacity-pooling model. The original Express implementation is available in `legacy_node_backend/` for reference only.

## Quick Start

1. Install PostgreSQL and create an empty database named `parkhere`.
2. Follow `backend/README.md` to create a Python virtual environment, install dependencies, configure `backend/.env`, and initialize the database schema.
3. Start the Flask backend:

   ```bash
   cd backend
   python app.py
   ```

4. In a separate terminal, start the frontend:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. Open `http://localhost:5173`. The Vite development proxy forwards `/api` requests to Flask at `http://127.0.0.1:5000`.

**Health check:** `http://localhost:5000/api/health`

## Database Features

- 17 related tables with foreign keys, check constraints, unique constraints, and indexes.
- Time-overlap availability checks through `v_occupying_bookings`.
- Separate capacity pools for public parking and verified members.
- Transactional booking with row-level locking to prevent overbooking.
- Gate arrival PIN hashing, encrypted customer retrieval, expiry, and single-use invalidation.
- Trigger-generated booking lifecycle audit history.
- Exit-time billing, overtime charges, add-on services, invoices, and simulated payments.
- Role-specific APIs for customers, organisation administrators, private parking owners, and platform administrators.

See `database/parkhere.sql` for the complete database schema and SQL exercises.
