-- ============================================================================
-- ParkHere: Web-based Parking Management & Reservation System
-- Database: PostgreSQL (local)
-- File: database/parkhere.sql
-- ============================================================================
-- TABLE OF CONTENTS
-- ----------------------------------------------------------------------------
-- 1. SETUP INSTRUCTIONS & DATABASE INITIALIZATION
-- 2. DDL SCHEMA (TABLES, CONSTRAINTS, INDEXES)
-- 3. VIEWS, FUNCTIONS & TRIGGERS
-- 4. SEED & DEMO DATA
--    4.1 Users & Roles (Platform Admin, Org Admin, Owners, Customers)
--    4.2 Organisations & Owner Profiles
--    4.3 Organisation Members & Verified Customer Memberships
--    4.4 Facilities Lookup
--    4.5 Parking Locations (Vellore & Katpadi Area Demo Listings)
--    4.6 Tariffs, Vehicle Types & Facilities Mapping
--    4.7 Historical Seed Bookings, Sessions, Invoices & Payments
-- 5. REFERENCE QUERIES BY TOPIC (WITH APP USAGE & PARAMETERS)
--    5.1 User, Role & Provider Approval Queries
--    5.2 Membership Verification Queries (Valid & Failing)
--    5.3 Location Search & Availability Computation (Capacity Math)
--    5.4 Booking Creation & Pricing Snapshot Queries
--    5.5 Arrival Code Verification (Atomic Single-Use Transition)
--    5.6 Expiry Automation Queries
--    5.7 Exit Recording & Billing Calculation (Overtime + Addons)
--    5.8 Simulated Payment Management
--    5.9 Dashboards & Reporting Analytics
-- 6. VIVA EXAMINATION & EVALUATION QUERIES
--    6.1 Joins (INNER, LEFT, Multi-Table)
--    6.2 Aggregate Queries with GROUP BY & HAVING
--    6.3 Subqueries (Correlated & Uncorrelated)
--    6.4 Existential Checks (EXISTS & NOT EXISTS)
--    6.5 Common Table Expressions (CTE)
--    6.6 Window Functions (Ranking Locations by Revenue)
--    6.7 Set Operations (UNION, INTERSECT, EXCEPT)
--    6.8 View & PL/pgSQL Function Execution
--    6.9 Live Database Constraint Demonstrations (Error Trapping Blocks)
-- 7. TRANSACTIONAL UPDATE & DELETE DEMONSTRATIONS (ROLLBACK SAFE)
-- ============================================================================

-- ============================================================================
-- SECTION 1. SETUP INSTRUCTIONS & DATABASE INITIALIZATION
-- ============================================================================
-- To create the database and run this script via command line:
--
-- 1. Connect to PostgreSQL and create the database:
--    CREATE DATABASE parkhere;
--
-- 2. Execute this file using psql:
--    psql -U postgres -d parkhere -f database/parkhere.sql
--
-- 3. Or initialize via Node script (runs plain SQL without psql meta-commands):
--    npm run db:init (inside the backend/ folder)
--
-- DESTRUCTIVE RESET BLOCK (OPTIONAL - UNCOMMENT ONLY IF FULL RESET IS NEEDED):
-- DROP TRIGGER IF EXISTS trg_booking_status_event ON bookings CASCADE;
-- DROP FUNCTION IF EXISTS fn_log_booking_event() CASCADE;
-- DROP FUNCTION IF EXISTS expire_overdue_bookings() CASCADE;
-- DROP VIEW IF EXISTS v_occupying_bookings CASCADE;
-- DROP TABLE IF EXISTS booking_events CASCADE;
-- DROP TABLE IF EXISTS payments CASCADE;
-- DROP TABLE IF EXISTS invoices CASCADE;
-- DROP TABLE IF EXISTS parking_sessions CASCADE;
-- DROP TABLE IF EXISTS booking_addons CASCADE;
-- DROP TABLE IF EXISTS bookings CASCADE;
-- DROP TABLE IF EXISTS location_photos CASCADE;
-- DROP TABLE IF EXISTS location_facilities CASCADE;
-- DROP TABLE IF EXISTS facilities CASCADE;
-- DROP TABLE IF EXISTS location_vehicle_types CASCADE;
-- DROP TABLE IF EXISTS location_tariffs CASCADE;
-- DROP TABLE IF EXISTS parking_locations CASCADE;
-- DROP TABLE IF EXISTS customer_memberships CASCADE;
-- DROP TABLE IF EXISTS org_members CASCADE;
-- DROP TABLE IF EXISTS owner_profiles CASCADE;
-- DROP TABLE IF EXISTS organisations CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- SECTION 2. DDL SCHEMA (TABLES, CONSTRAINTS, INDEXES)
-- ============================================================================

-- 1. Users table (Platform Admin, Org Admin, Owner, Customer)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(30) NOT NULL CHECK (role IN ('customer', 'org_admin', 'owner', 'platform_admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Organisations (Managed by org_admin, approved by platform_admin)
CREATE TABLE IF NOT EXISTS organisations (
    id SERIAL PRIMARY KEY,
    admin_user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name VARCHAR(200) NOT NULL,
    org_identifier VARCHAR(50) UNIQUE NOT NULL,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Owner Profiles (Private parking owners awaiting platform approval)
CREATE TABLE IF NOT EXISTS owner_profiles (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(200),
    approval_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Organisation Members (Directory maintained by Organisation Admin)
CREATE TABLE IF NOT EXISTS org_members (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    member_identifier VARCHAR(100) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    parking_benefit VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (parking_benefit IN ('free', 'discounted', 'standard')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_org_member_identifier UNIQUE (org_id, member_identifier)
);

-- 5. Customer Memberships (Verified link between customer account & org_member record)
CREATE TABLE IF NOT EXISTS customer_memberships (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_member_id INT UNIQUE NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'revoked')),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customer_org_member UNIQUE (customer_id, org_member_id)
);

-- 6. Parking Locations (Sites offering parking inventory)
-- Providers are either an Organisation OR a Private Owner (enforced with CHECK).
-- Private owners have member_capacity = 0. Total capacity = public + member > 0.
CREATE TABLE IF NOT EXISTS parking_locations (
    id SERIAL PRIMARY KEY,
    provider_type VARCHAR(20) NOT NULL CHECK (provider_type IN ('org', 'owner')),
    org_id INT REFERENCES organisations(id) ON DELETE CASCADE,
    owner_id INT REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    address TEXT NOT NULL,
    locality VARCHAR(150) NOT NULL,
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    public_capacity INT NOT NULL DEFAULT 0 CHECK (public_capacity >= 0),
    member_capacity INT NOT NULL DEFAULT 0 CHECK (member_capacity >= 0),
    operating_hours VARCHAR(100) DEFAULT '24/7',
    is_24_7 BOOLEAN NOT NULL DEFAULT TRUE,
    opens_at TIME,
    closes_at TIME,
    has_cctv BOOLEAN NOT NULL DEFAULT FALSE,
    has_guard BOOLEAN NOT NULL DEFAULT FALSE,
    is_covered BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_total_capacity_positive CHECK (public_capacity + member_capacity > 0),
    CONSTRAINT chk_location_provider CHECK (
        (provider_type = 'org' AND org_id IS NOT NULL AND owner_id IS NULL) OR
        (provider_type = 'owner' AND owner_id IS NOT NULL AND org_id IS NULL AND member_capacity = 0)
    )
);

-- 7. Location Tariffs
CREATE TABLE IF NOT EXISTS location_tariffs (
    id SERIAL PRIMARY KEY,
    location_id INT UNIQUE NOT NULL REFERENCES parking_locations(id) ON DELETE CASCADE,
    hourly_rate NUMERIC(10,2) CHECK (hourly_rate IS NULL OR hourly_rate >= 0),
    daily_rate NUMERIC(10,2) CHECK (daily_rate IS NULL OR daily_rate >= 0),
    weekly_rate NUMERIC(10,2) CHECK (weekly_rate IS NULL OR weekly_rate >= 0),
    monthly_rate NUMERIC(10,2) CHECK (monthly_rate IS NULL OR monthly_rate >= 0),
    overtime_rate_per_minute NUMERIC(10,2) NOT NULL DEFAULT 1.00 CHECK (overtime_rate_per_minute >= 0),
    member_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (member_discount_percent >= 0 AND member_discount_percent <= 100),
    CONSTRAINT chk_at_least_one_rate CHECK (
        hourly_rate IS NOT NULL OR daily_rate IS NOT NULL OR weekly_rate IS NOT NULL OR monthly_rate IS NOT NULL
    )
);

-- 8. Location Vehicle Types Junction
CREATE TABLE IF NOT EXISTS location_vehicle_types (
    id SERIAL PRIMARY KEY,
    location_id INT NOT NULL REFERENCES parking_locations(id) ON DELETE CASCADE,
    vehicle_type VARCHAR(50) NOT NULL CHECK (vehicle_type IN ('two_wheeler', 'four_wheeler', 'ev', 'heavy')),
    CONSTRAINT uq_location_vehicle_type UNIQUE (location_id, vehicle_type)
);

-- 9. Facilities Master Table
CREATE TABLE IF NOT EXISTS facilities (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

-- 10. Location Facilities Junction (Pricing & Offer Status)
CREATE TABLE IF NOT EXISTS location_facilities (
    id SERIAL PRIMARY KEY,
    location_id INT NOT NULL REFERENCES parking_locations(id) ON DELETE CASCADE,
    facility_code VARCHAR(50) NOT NULL REFERENCES facilities(code) ON DELETE CASCADE,
    price NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
    is_offered BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_location_facility UNIQUE (location_id, facility_code)
);

-- 11. Location Photos
CREATE TABLE IF NOT EXISTS location_photos (
    id SERIAL PRIMARY KEY,
    location_id INT NOT NULL REFERENCES parking_locations(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 0
);

-- 12. Bookings Table (Capacity-based, explicit state machine)
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    booking_reference VARCHAR(32) UNIQUE NOT NULL,
    customer_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    location_id INT NOT NULL REFERENCES parking_locations(id) ON DELETE RESTRICT,
    pool VARCHAR(20) NOT NULL CHECK (pool IN ('public', 'member')),
    vehicle_type VARCHAR(50) NOT NULL CHECK (vehicle_type IN ('two_wheeler', 'four_wheeler', 'ev', 'heavy')),
    vehicle_number VARCHAR(50) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'expired', 'cancelled')),
    arrival_window_start TIMESTAMPTZ NOT NULL,
    arrival_deadline TIMESTAMPTZ NOT NULL,
    code_hash VARCHAR(64),
    code_encrypted TEXT,
    failed_attempts INT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    assigned_spot VARCHAR(50),
    rate_type VARCHAR(20) NOT NULL CHECK (rate_type IN ('hour', 'day', 'week', 'month')),
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price_snapshot NUMERIC(10,2) NOT NULL CHECK (unit_price_snapshot >= 0),
    benefit_applied VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (benefit_applied IN ('none', 'free', 'discounted', 'standard')),
    discount_percent_snapshot NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (discount_percent_snapshot >= 0 AND discount_percent_snapshot <= 100),
    base_amount_snapshot NUMERIC(10,2) NOT NULL CHECK (base_amount_snapshot >= 0),
    overtime_rate_snapshot NUMERIC(10,2) NOT NULL DEFAULT 1.00 CHECK (overtime_rate_snapshot >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_booking_time_range CHECK (end_time > start_time)
);

-- Partial Unique Index for Arrival Code Collision Prevention on Pending Bookings
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_pending_code 
ON bookings (location_id, code_hash) 
WHERE status = 'pending';

-- Booking Lookup & Performance Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_overlap 
ON bookings (location_id, pool, status, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_bookings_deadline 
ON bookings (status, arrival_deadline) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_bookings_customer 
ON bookings (customer_id, status);

CREATE INDEX IF NOT EXISTS idx_bookings_location 
ON bookings (location_id, status);

-- 13. Booking Add-ons (Snapshotted facility selections per booking)
CREATE TABLE IF NOT EXISTS booking_addons (
    id SERIAL PRIMARY KEY,
    booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    facility_code VARCHAR(50) NOT NULL REFERENCES facilities(code),
    price_snapshot NUMERIC(10,2) NOT NULL CHECK (price_snapshot >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_booking_addon UNIQUE (booking_id, facility_code)
);

-- 14. Parking Sessions (Created on successful entry verification)
CREATE TABLE IF NOT EXISTS parking_sessions (
    id SERIAL PRIMARY KEY,
    booking_id INT UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exit_time TIMESTAMPTZ,
    verified_by_user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    spot_label VARCHAR(50),
    notes TEXT
);

-- 15. Invoices (Created on exit recording)
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    booking_id INT UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    session_id INT UNIQUE NOT NULL REFERENCES parking_sessions(id) ON DELETE RESTRICT,
    base_amount NUMERIC(10,2) NOT NULL CHECK (base_amount >= 0),
    overtime_minutes INT NOT NULL DEFAULT 0 CHECK (overtime_minutes >= 0),
    overtime_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (overtime_amount >= 0),
    addons_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (addons_amount >= 0),
    total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
    actual_duration_minutes INT NOT NULL CHECK (actual_duration_minutes >= 0),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Payments (Simulated payments table)
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
    payment_method VARCHAR(50) DEFAULT 'simulated',
    transaction_ref VARCHAR(100),
    paid_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. Booking Events (Audit log populated by trigger)
CREATE TABLE IF NOT EXISTS booking_events (
    id SERIAL PRIMARY KEY,
    booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- SECTION 3. VIEWS, FUNCTIONS & TRIGGERS
-- ============================================================================

-- 1. View: Occupying Bookings
-- Only pending bookings within deadline and active bookings count against capacity.
-- For active bookings, occupancy extends to GREATEST(end_time, NOW()) to account for overstay.
CREATE OR REPLACE VIEW v_occupying_bookings AS
SELECT
    b.id AS booking_id,
    b.location_id,
    b.pool,
    b.vehicle_type,
    b.start_time AS occ_start,
    CASE
        WHEN b.status = 'active' THEN GREATEST(b.end_time, NOW())
        ELSE b.end_time
    END AS occ_end,
    b.status,
    b.arrival_deadline
FROM bookings b
WHERE
    (b.status = 'pending' AND b.arrival_deadline >= NOW())
    OR (b.status = 'active');

-- 2. PL/pgSQL Function: Expire Overdue Bookings
-- Sweeps pending bookings past their deadline, marks them expired, and cleans secrets.
CREATE OR REPLACE FUNCTION expire_overdue_bookings()
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    WITH expired_rows AS (
        UPDATE bookings
        SET
            status = 'expired',
            code_hash = NULL,
            code_encrypted = NULL,
            updated_at = NOW()
        WHERE status = 'pending' AND arrival_deadline < NOW()
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM expired_rows;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger Function: Log Booking Status Change
CREATE OR REPLACE FUNCTION fn_log_booking_event()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO booking_events (booking_id, old_status, new_status, event_type, notes, created_at)
        VALUES (
            NEW.id,
            NULL,
            NEW.status,
            'BOOKING_CREATED',
            'Booking created with status ' || NEW.status,
            NOW()
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO booking_events (booking_id, old_status, new_status, event_type, notes, created_at)
            VALUES (
                NEW.id,
                OLD.status,
                NEW.status,
                'STATUS_CHANGE_' || UPPER(NEW.status),
                'Booking transitioned from ' || OLD.status || ' to ' || NEW.status,
                NOW()
            );
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach Trigger to bookings
DROP TRIGGER IF EXISTS trg_booking_status_event ON bookings;
CREATE TRIGGER trg_booking_status_event
AFTER INSERT OR UPDATE OF status ON bookings
FOR EACH ROW
EXECUTE FUNCTION fn_log_booking_event();

-- ============================================================================
-- SECTION 4. SEED & DEMO DATA
-- Demo Password for all accounts: Password123!
-- Real bcrypt hash (cost factor 10): $2a$10$4t1UDFfjffWTaZRtZRaEg.qYQbj6MDr5/DwWeacEvLXEilLCxucpO
-- ============================================================================

-- 4.1 Users
INSERT INTO users (id, email, password_hash, full_name, phone, role, is_active) VALUES
-- Platform Admin
(1, 'admin@parkhere.local', '$2a$10$4t1UDFfjffWTaZRtZRaEg.qYQbj6MDr5/DwWeacEvLXEilLCxucpO', 'System Administrator', '+91 9876543210', 'platform_admin', TRUE),

-- Organisation Admin
(2, 'orgadmin@parkhere.local', '$2a$10$4t1UDFfjffWTaZRtZRaEg.qYQbj6MDr5/DwWeacEvLXEilLCxucpO', 'TechCorp Facilities Admin', '+91 9876543211', 'org_admin', TRUE),

-- Private Owners
(3, 'owner1@parkhere.local', '$2a$10$4t1UDFfjffWTaZRtZRaEg.qYQbj6MDr5/DwWeacEvLXEilLCxucpO', 'Karthik Ramanathan', '+91 9876543212', 'owner', TRUE),
(4, 'owner2@parkhere.local', '$2a$10$4t1UDFfjffWTaZRtZRaEg.qYQbj6MDr5/DwWeacEvLXEilLCxucpO', 'Meenakshi Sundaram', '+91 9876543213', 'owner', TRUE),

-- Customers
(5, 'customer1@parkhere.local', '$2a$10$4t1UDFfjffWTaZRtZRaEg.qYQbj6MDr5/DwWeacEvLXEilLCxucpO', 'Rajesh Kumar', '+91 9876543214', 'customer', TRUE),
(6, 'customer2@parkhere.local', '$2a$10$4t1UDFfjffWTaZRtZRaEg.qYQbj6MDr5/DwWeacEvLXEilLCxucpO', 'Priya Sharma', '+91 9876543215', 'customer', TRUE),
(7, 'customer3@parkhere.local', '$2a$10$4t1UDFfjffWTaZRtZRaEg.qYQbj6MDr5/DwWeacEvLXEilLCxucpO', 'Kavita Reddy', '+91 9876543216', 'customer', TRUE),
(8, 'customer4@parkhere.local', '$2a$10$4t1UDFfjffWTaZRtZRaEg.qYQbj6MDr5/DwWeacEvLXEilLCxucpO', 'Suresh Verma', '+91 9876543217', 'customer', TRUE)
ON CONFLICT (id) DO NOTHING;

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- 4.2 Organisations & Owner Profiles
INSERT INTO organisations (id, admin_user_id, name, org_identifier, approval_status, is_active) VALUES
(1, 2, 'Sample Organisation (Demo)', 'DEMO-ORG', 'approved', TRUE)
ON CONFLICT (id) DO NOTHING;
SELECT setval('organisations_id_seq', (SELECT MAX(id) FROM organisations));

INSERT INTO owner_profiles (id, user_id, business_name, approval_status) VALUES
(1, 3, 'Karthik Parking Services', 'approved'),
(2, 4, 'Sundaram Secure Spaces', 'approved')
ON CONFLICT (id) DO NOTHING;
SELECT setval('owner_profiles_id_seq', (SELECT MAX(id) FROM owner_profiles));

-- 4.3 Organisation Members
INSERT INTO org_members (id, org_id, member_identifier, full_name, email, phone, parking_benefit, is_active) VALUES
(1, 1, 'MEM-001', 'Rajesh Kumar', 'rajesh@example.com', '+91 9876543214', 'free', TRUE),
(2, 1, 'MEM-002', 'Priya Sharma', 'priya@example.com', '+91 9876543215', 'discounted', TRUE),
(3, 1, 'MEM-003', 'Amit Patel', 'amit@example.com', '+91 9876543218', 'standard', TRUE),
(4, 1, 'MEM-004', 'Sneha Rao', 'sneha@example.com', '+91 9876543219', 'free', TRUE),
(5, 1, 'MEM-005', 'Vikram Singh', 'vikram@example.com', '+91 9876543220', 'discounted', TRUE),
(6, 1, 'MEM-006', 'Anita Nair', 'anita@example.com', '+91 9876543221', 'free', FALSE) -- Inactive member
ON CONFLICT (id) DO NOTHING;
SELECT setval('org_members_id_seq', (SELECT MAX(id) FROM org_members));

-- Verified Customer Memberships
-- Customer 1 (Rajesh Kumar) verified with MEM-001
-- Customer 2 (Priya Sharma) verified with MEM-002
INSERT INTO customer_memberships (id, customer_id, org_member_id, status) VALUES
(1, 5, 1, 'verified'),
(2, 6, 2, 'verified')
ON CONFLICT (id) DO NOTHING;
SELECT setval('customer_memberships_id_seq', (SELECT MAX(id) FROM customer_memberships));

-- 4.4 Facilities Lookup Table
INSERT INTO facilities (code, name, description) VALUES
('EV_CHARGING', 'EV Charging', 'High-speed EV charging stations with dedicated power backup'),
('VEHICLE_CLEANING', 'Vehicle Cleaning', 'Exterior pressure wash and interior vacuuming service'),
('TYRE_AIR_FILLING', 'Tyre Air Filling', 'Digital tyre pressure check and automated air inflation')
ON CONFLICT (code) DO NOTHING;

-- 4.5 Parking Locations (10 Private Owner Demo Listings in Vellore/Katpadi + 1 Org Demo Location)
INSERT INTO parking_locations (
    id, provider_type, org_id, owner_id, name, address, locality, 
    latitude, longitude, public_capacity, member_capacity, 
    operating_hours, is_24_7, opens_at, closes_at, 
    has_cctv, has_guard, is_covered, is_active, is_demo
) VALUES
-- Location 1 (Owner 1)
(1, 'owner', NULL, 3, 'Sample Parking: Katpadi Station Road Area (Demo)', 'No. 12 Station Road, Near Katpadi Junction', 'Katpadi', 12.9716, 79.1384, 15, 0, '24/7', TRUE, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE),

-- Location 2 (Owner 1)
(2, 'owner', NULL, 3, 'Sample Parking: Gandhi Nagar Main Road (Demo)', '45 14th East Cross Road, Gandhi Nagar', 'Gandhi Nagar', 12.9634, 79.1432, 10, 0, '06:00 - 23:00', FALSE, '06:00', '23:00', TRUE, TRUE, FALSE, TRUE, TRUE),

-- Location 3 (Owner 1)
(3, 'owner', NULL, 3, 'Sample Parking: VIT Main Gate Vicinity (Demo)', 'Near VIT Main Gate, Tiruvalam Road', 'Bramhapuram', 12.9692, 79.1559, 20, 0, '24/7', TRUE, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE),

-- Location 4 (Owner 1)
(4, 'owner', NULL, 3, 'Sample Parking: Silk Mill Junction Lot (Demo)', 'Opposite Silk Mill Bus Stop, Chittoor Road', 'Katpadi', 12.9785, 79.1321, 12, 0, '07:00 - 22:00', FALSE, '07:00', '22:00', TRUE, FALSE, FALSE, TRUE, TRUE),

-- Location 5 (Owner 1)
(5, 'owner', NULL, 3, 'Sample Parking: Green Circle Hub (Demo)', 'Old NH48 Bypass, Green Circle Junction', 'Vellore Central', 12.9348, 79.1352, 25, 0, '24/7', TRUE, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE),

-- Location 6 (Owner 2)
(6, 'owner', NULL, 4, 'Sample Parking: Bagayam Campus Road (Demo)', 'Bagayam Main Road, Near Otteri Lake Turn', 'Bagayam', 12.8712, 79.1315, 8, 0, '24/7', TRUE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, TRUE),

-- Location 7 (Owner 2)
(7, 'owner', NULL, 4, 'Sample Parking: Fort Round Road Facility (Demo)', 'South Fort Rampart Road, Near Moat Entrance', 'Vellore Fort', 12.9234, 79.1328, 18, 0, '06:00 - 21:00', FALSE, '06:00', '21:00', TRUE, TRUE, TRUE, TRUE, TRUE),

-- Location 8 (Owner 2)
(8, 'owner', NULL, 4, 'Sample Parking: Officers Line Central (Demo)', 'Officers Line, Opposite Collectorate Office', 'Vellore Town', 12.9281, 79.1367, 14, 0, '24/7', TRUE, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE),

-- Location 9 (Owner 2)
(9, 'owner', NULL, 4, 'Sample Parking: Sathuvachari Bypass Zone (Demo)', 'Phase 2 Main Road, Sathuvachari', 'Sathuvachari', 12.9412, 79.1678, 22, 0, '24/7', TRUE, NULL, NULL, TRUE, FALSE, FALSE, TRUE, TRUE),

-- Location 10 (Owner 2)
(10, 'owner', NULL, 4, 'Sample Parking: Chittor Bus Stand Area (Demo)', 'Vellore-Chittoor Highway, Katpadi North', 'Katpadi North', 12.9845, 79.1410, 10, 0, '05:00 - 23:00', FALSE, '05:00', '23:00', TRUE, TRUE, TRUE, TRUE, TRUE),

-- Location 11 (Organisation Demo Location - Dual Pool)
(11, 'org', 1, NULL, 'Sample Org Facility: Tech Park Campus (Demo)', 'SIPCOT Industrial Complex, Ranipet Road', 'Katpadi Extension', 12.9810, 79.1520, 10, 30, '24/7', TRUE, NULL, NULL, TRUE, TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

SELECT setval('parking_locations_id_seq', (SELECT MAX(id) FROM parking_locations));

-- 4.6 Tariffs for Locations
INSERT INTO location_tariffs (
    id, location_id, hourly_rate, daily_rate, weekly_rate, monthly_rate, 
    overtime_rate_per_minute, member_discount_percent
) VALUES
(1, 1, 40.00, 300.00, 1800.00, 6000.00, 1.00, 0.00),
(2, 2, 30.00, 220.00, NULL, NULL, 0.75, 0.00),
(3, 3, 50.00, 350.00, 2000.00, 7000.00, 1.25, 0.00),
(4, 4, 35.00, 250.00, 1500.00, NULL, 1.00, 0.00),
(5, 5, 60.00, 450.00, 2600.00, 8500.00, 1.50, 0.00),
(6, 6, 25.00, 180.00, 1000.00, 3500.00, 0.50, 0.00),
(7, 7, 45.00, 320.00, 1900.00, 6500.00, 1.00, 0.00),
(8, 8, 55.00, 400.00, 2400.00, 8000.00, 1.25, 0.00),
(9, 9, 30.00, 200.00, 1200.00, 4000.00, 0.75, 0.00),
(10, 10, 35.00, 240.00, 1400.00, 4500.00, 1.00, 0.00),
(11, 11, 40.00, 280.00, 1600.00, 5000.00, 1.00, 25.00) -- Org location: 25% discount for discounted members
ON CONFLICT (id) DO NOTHING;

SELECT setval('location_tariffs_id_seq', (SELECT MAX(id) FROM location_tariffs));

-- Vehicle Types Supported
INSERT INTO location_vehicle_types (location_id, vehicle_type) VALUES
(1, 'two_wheeler'), (1, 'four_wheeler'), (1, 'ev'),
(2, 'two_wheeler'), (2, 'four_wheeler'),
(3, 'two_wheeler'), (3, 'four_wheeler'), (3, 'ev'),
(4, 'two_wheeler'), (4, 'four_wheeler'),
(5, 'two_wheeler'), (5, 'four_wheeler'), (5, 'ev'), (5, 'heavy'),
(6, 'two_wheeler'), (6, 'four_wheeler'),
(7, 'two_wheeler'), (7, 'four_wheeler'),
(8, 'two_wheeler'), (8, 'four_wheeler'), (8, 'ev'),
(9, 'two_wheeler'), (9, 'four_wheeler'), (9, 'heavy'),
(10, 'two_wheeler'), (10, 'four_wheeler'), (10, 'ev'),
(11, 'two_wheeler'), (11, 'four_wheeler'), (11, 'ev')
ON CONFLICT (location_id, vehicle_type) DO NOTHING;

-- Facilities Offered per Location
INSERT INTO location_facilities (location_id, facility_code, price, is_offered) VALUES
(1, 'EV_CHARGING', 150.00, TRUE),
(1, 'TYRE_AIR_FILLING', 20.00, TRUE),
(3, 'EV_CHARGING', 120.00, TRUE),
(3, 'VEHICLE_CLEANING', 250.00, TRUE),
(5, 'EV_CHARGING', 180.00, TRUE),
(5, 'VEHICLE_CLEANING', 300.00, TRUE),
(5, 'TYRE_AIR_FILLING', 30.00, TRUE),
(8, 'EV_CHARGING', 140.00, TRUE),
(10, 'TYRE_AIR_FILLING', 25.00, TRUE),
(11, 'EV_CHARGING', 100.00, TRUE),
(11, 'VEHICLE_CLEANING', 200.00, TRUE),
(11, 'TYRE_AIR_FILLING', 20.00, TRUE)
ON CONFLICT (location_id, facility_code) DO NOTHING;

-- 4.7 Historical Seed Bookings (Completed, Expired, Cancelled)
-- Timestamps strictly in the past. No pending or active bookings seeded.
INSERT INTO bookings (
    id, booking_reference, customer_id, location_id, pool, 
    vehicle_type, vehicle_number, start_time, end_time, status, 
    arrival_window_start, arrival_deadline, code_hash, code_encrypted, 
    rate_type, quantity, unit_price_snapshot, benefit_applied, 
    discount_percent_snapshot, base_amount_snapshot, overtime_rate_snapshot, 
    created_at, updated_at
) VALUES
-- Past completed booking 1 (Customer 5 at Location 1)
(1, 'PH-HIST-001', 5, 1, 'public', 'four_wheeler', 'TN23-AB-1234', 
 NOW() - INTERVAL '2 days 4 hours', NOW() - INTERVAL '2 days 2 hours', 'completed',
 NOW() - INTERVAL '2 days 4 hours', NOW() - INTERVAL '2 days 3 hours 45 minutes', NULL, NULL,
 'hour', 2, 40.00, 'none', 0.00, 80.00, 1.00,
 NOW() - INTERVAL '2 days 5 hours', NOW() - INTERVAL '2 days 2 hours'),

-- Past completed booking 2 (Customer 6 at Org Location 11 with 25% discount)
(2, 'PH-HIST-002', 6, 11, 'member', 'four_wheeler', 'TN23-XY-5678',
 NOW() - INTERVAL '1 day 6 hours', NOW() - INTERVAL '1 day 3 hours', 'completed',
 NOW() - INTERVAL '1 day 6 hours', NOW() - INTERVAL '1 day 5 hours 45 minutes', NULL, NULL,
 'hour', 3, 40.00, 'discounted', 25.00, 90.00, 1.00, -- 120 - 25% = 90
 NOW() - INTERVAL '1 day 7 hours', NOW() - INTERVAL '1 day 3 hours'),

-- Past completed booking 3 (Customer 7 at Location 5 with overtime)
(3, 'PH-HIST-003', 7, 5, 'public', 'two_wheeler', 'TN23-CC-9988',
 NOW() - INTERVAL '12 hours', NOW() - INTERVAL '10 hours', 'completed',
 NOW() - INTERVAL '12 hours', NOW() - INTERVAL '11 hours 45 minutes', NULL, NULL,
 'hour', 2, 60.00, 'none', 0.00, 120.00, 1.50,
 NOW() - INTERVAL '13 hours', NOW() - INTERVAL '9 hours 45 minutes'),

-- Past expired booking 4 (Customer 8 at Location 3)
(4, 'PH-HIST-004', 8, 3, 'public', 'four_wheeler', 'TN23-DD-4455',
 NOW() - INTERVAL '8 hours', NOW() - INTERVAL '6 hours', 'expired',
 NOW() - INTERVAL '8 hours', NOW() - INTERVAL '7 hours 45 minutes', NULL, NULL,
 'hour', 2, 50.00, 'none', 0.00, 100.00, 1.25,
 NOW() - INTERVAL '9 hours', NOW() - INTERVAL '7 hours 44 minutes'),

-- Past cancelled booking 5 (Customer 5 at Location 7)
(5, 'PH-HIST-005', 5, 7, 'public', 'four_wheeler', 'TN23-AB-1234',
 NOW() - INTERVAL '5 hours', NOW() - INTERVAL '3 hours', 'cancelled',
 NOW() - INTERVAL '5 hours', NOW() - INTERVAL '4 hours 45 minutes', NULL, NULL,
 'hour', 2, 45.00, 'none', 0.00, 90.00, 1.00,
 NOW() - INTERVAL '6 hours', NOW() - INTERVAL '5 hours 30 minutes')
ON CONFLICT (id) DO NOTHING;

SELECT setval('bookings_id_seq', (SELECT MAX(id) FROM bookings));

-- Historical Addons
INSERT INTO booking_addons (booking_id, facility_code, price_snapshot) VALUES
(1, 'EV_CHARGING', 150.00),
(2, 'TYRE_AIR_FILLING', 20.00),
(3, 'TYRE_AIR_FILLING', 30.00)
ON CONFLICT (booking_id, facility_code) DO NOTHING;

-- Historical Sessions
INSERT INTO parking_sessions (id, booking_id, entry_time, exit_time, verified_by_user_id, spot_label) VALUES
(1, 1, NOW() - INTERVAL '2 days 3 hours 55 minutes', NOW() - INTERVAL '2 days 2 hours', 3, 'P-01'),
(2, 2, NOW() - INTERVAL '1 day 5 hours 50 minutes', NOW() - INTERVAL '1 day 3 hours', 2, 'M-04'),
(3, 3, NOW() - INTERVAL '11 hours 50 minutes', NOW() - INTERVAL '9 hours 45 minutes', 3, 'G-08') -- 15 mins overtime
ON CONFLICT (id) DO NOTHING;

SELECT setval('parking_sessions_id_seq', (SELECT MAX(id) FROM parking_sessions));

-- Historical Invoices
-- Booking 1: base 80.00 + addon 150.00 + overtime 0 = 230.00
-- Booking 2: base 90.00 + addon 20.00 + overtime 0 = 110.00
-- Booking 3: base 120.00 + addon 30.00 + overtime (15 min * 1.50 = 22.50) = 172.50
INSERT INTO invoices (
    id, booking_id, session_id, base_amount, 
    overtime_minutes, overtime_amount, addons_amount, total_amount, 
    actual_duration_minutes, generated_at
) VALUES
(1, 1, 1, 80.00, 0, 0.00, 150.00, 230.00, 115, NOW() - INTERVAL '2 days 2 hours'),
(2, 2, 2, 90.00, 0, 0.00, 20.00, 110.00, 170, NOW() - INTERVAL '1 day 3 hours'),
(3, 3, 3, 120.00, 15, 22.50, 30.00, 172.50, 125, NOW() - INTERVAL '9 hours 45 minutes')
ON CONFLICT (id) DO NOTHING;

SELECT setval('invoices_id_seq', (SELECT MAX(id) FROM invoices));

-- Historical Payments
INSERT INTO payments (id, invoice_id, booking_id, amount, status, payment_method, transaction_ref, paid_at) VALUES
(1, 1, 1, 230.00, 'paid', 'simulated_card', 'TXN-SIM-001', NOW() - INTERVAL '2 days 1 hour 58 minutes'),
(2, 2, 2, 110.00, 'paid', 'simulated_upi', 'TXN-SIM-002', NOW() - INTERVAL '1 day 2 hours 55 minutes'),
(3, 3, 3, 172.50, 'paid', 'simulated_netbanking', 'TXN-SIM-003', NOW() - INTERVAL '9 hours 40 minutes')
ON CONFLICT (id) DO NOTHING;

SELECT setval('payments_id_seq', (SELECT MAX(id) FROM payments));

-- ============================================================================
-- SECTION 5. REFERENCE QUERIES BY TOPIC (WITH APP USAGE & PARAMETERS)
-- ============================================================================

-- 5.1 User, Role & Provider Approval Queries
-- Purpose: Load active user profile with verified status on each request
-- App usage: backend/src/middleware/auth.js -> verifyUserActive($1)
SELECT id, email, full_name, phone, role, is_active
FROM users
WHERE id = 5 AND is_active = TRUE;

-- List organisations awaiting platform approval
-- App usage: backend/src/controllers/adminController.js -> getPendingOrganisations()
SELECT o.id, o.name, o.org_identifier, o.approval_status, u.full_name AS admin_name, u.email AS admin_email, o.created_at
FROM organisations o
JOIN users u ON o.admin_user_id = u.id
WHERE o.approval_status = 'pending'
ORDER BY o.created_at ASC;

-- 5.2 Membership Verification Queries (Valid & Failing)
-- Purpose: Matches submitted org identifier, member identifier, name, and email against active org records.
-- App usage: backend/src/controllers/membershipController.js -> verifyMembership($1, $2, $3, $4, $5)
-- Example 1: Matching verification (Succeeds)
SELECT m.id AS org_member_id, m.parking_benefit, o.id AS org_id, o.name AS org_name
FROM org_members m
JOIN organisations o ON m.org_id = o.id
WHERE UPPER(TRIM(o.org_identifier)) = UPPER(TRIM('DEMO-ORG'))
  AND UPPER(TRIM(m.member_identifier)) = UPPER(TRIM('MEM-001'))
  AND LOWER(TRIM(m.email)) = LOWER(TRIM('rajesh@example.com'))
  AND LOWER(TRIM(m.full_name)) = LOWER(TRIM('Rajesh Kumar'))
  AND m.is_active = TRUE
  AND o.approval_status = 'approved'
  AND o.is_active = TRUE;

-- Example 2: Failing verification (Wrong member ID or inactive record returns 0 rows)
SELECT m.id AS org_member_id
FROM org_members m
JOIN organisations o ON m.org_id = o.id
WHERE UPPER(TRIM(o.org_identifier)) = UPPER(TRIM('DEMO-ORG'))
  AND UPPER(TRIM(m.member_identifier)) = UPPER(TRIM('INVALID-ID'))
  AND m.is_active = TRUE;

-- 5.3 Location Search & Availability Computation (Capacity Math)
-- Purpose: Search locations matching filters and calculate real-time available capacity by subtracting overlapping bookings.
-- App usage: backend/src/db/locationQueries.js -> searchLocations($1..$8)
-- Parameters: $start = NOW(), $end = NOW() + INTERVAL '2 hours', $vehicle = 'four_wheeler'
SELECT 
    l.id,
    l.name,
    l.locality,
    l.address,
    l.is_demo,
    l.public_capacity,
    l.member_capacity,
    l.has_cctv,
    l.has_guard,
    l.is_covered,
    t.hourly_rate,
    t.daily_rate,
    t.overtime_rate_per_minute,
    t.member_discount_percent,
    -- Available public spaces = capacity minus overlapping occupying bookings
    GREATEST(0, l.public_capacity - COALESCE(occ.public_occupied, 0)) AS available_public,
    GREATEST(0, l.member_capacity - COALESCE(occ.member_occupied, 0)) AS available_member
FROM parking_locations l
JOIN location_tariffs t ON l.id = t.location_id
JOIN location_vehicle_types vt ON l.id = vt.location_id AND vt.vehicle_type = 'four_wheeler'
LEFT JOIN (
    SELECT 
        v.location_id,
        COUNT(*) FILTER (WHERE v.pool = 'public') AS public_occupied,
        COUNT(*) FILTER (WHERE v.pool = 'member') AS member_occupied
    FROM v_occupying_bookings v
    WHERE v.occ_start < (NOW() + INTERVAL '2 hours') 
      AND v.occ_end > NOW()
    GROUP BY v.location_id
) occ ON l.id = occ.location_id
WHERE l.is_active = TRUE
  AND (
      (l.provider_type = 'owner' AND EXISTS (
          SELECT 1 FROM owner_profiles op WHERE op.user_id = l.owner_id AND op.approval_status = 'approved'
      ))
      OR 
      (l.provider_type = 'org' AND EXISTS (
          SELECT 1 FROM organisations org WHERE org.id = l.org_id AND org.approval_status = 'approved' AND org.is_active = TRUE
      ))
  )
ORDER BY t.hourly_rate ASC;

-- 5.4 Booking Creation & Concurrency Lock
-- Purpose: Lock location row to serialize concurrent booking attempts for the same inventory.
-- App usage: backend/src/controllers/bookingController.js -> createBooking (inside transaction)
-- Parameters: $1 = location_id
SELECT id, provider_type, org_id, public_capacity, member_capacity, is_active
FROM parking_locations
WHERE id = 1
FOR UPDATE;

-- Check overlapping capacity usage in specific pool
-- App usage: backend/src/controllers/bookingController.js -> checkPoolAvailability($1, $2, $3, $4)
SELECT COUNT(*) AS occupied_count
FROM v_occupying_bookings
WHERE location_id = 1
  AND pool = 'public'
  AND occ_start < (NOW() + INTERVAL '2 hours')
  AND occ_end > NOW();

-- 5.5 Arrival Code Verification (Atomic Single-Use Transition)
-- Purpose: Atomically verify arrival code inside the arrival window, ensuring single-use and ownership.
-- App usage: backend/src/controllers/bookingController.js -> verifyArrivalCode($1, $2, $3)
-- Parameters: $1 = booking_id, $2 = code_hash, $3 = operator_user_id
UPDATE bookings b
SET 
    status = 'active',
    code_hash = NULL,
    code_encrypted = NULL,
    updated_at = NOW()
FROM parking_locations l
WHERE b.id = 1
  AND b.status = 'pending'
  AND b.code_hash = 'sample_hash_hex'
  AND NOW() BETWEEN b.arrival_window_start AND b.arrival_deadline
  AND b.location_id = l.id
  AND (l.owner_id = 3 OR l.org_id = (SELECT org_id FROM organisations WHERE admin_user_id = 2))
RETURNING b.id, b.booking_reference, b.status;

-- 5.6 Expiry Automation
-- App usage: backend/src/utils/cron.js & PL/pgSQL function expire_overdue_bookings()
SELECT expire_overdue_bookings();

-- 5.7 Exit Recording & Billing Calculation (Overtime + Addons)
-- Purpose: Lock active session and compute overtime charges at exit
-- App usage: backend/src/controllers/bookingController.js -> recordExit($1)
SELECT 
    b.id AS booking_id,
    b.end_time AS scheduled_end,
    b.base_amount_snapshot,
    b.overtime_rate_snapshot,
    s.id AS session_id,
    s.entry_time,
    NOW() AS actual_exit,
    -- Overtime minutes calculation: CEIL of difference past scheduled_end
    GREATEST(0, CEIL(EXTRACT(EPOCH FROM (NOW() - b.end_time)) / 60))::INT AS overtime_minutes,
    COALESCE(addons.total_addons, 0.00) AS addons_amount
FROM bookings b
JOIN parking_sessions s ON b.id = s.booking_id
LEFT JOIN (
    SELECT booking_id, SUM(price_snapshot) AS total_addons
    FROM booking_addons
    GROUP BY booking_id
) addons ON b.id = addons.booking_id
WHERE b.id = 1 AND b.status = 'active'
FOR UPDATE OF b;

-- 5.8 Simulated Payment Management
-- Purpose: Update payment status to 'paid' upon simulated user confirmation
-- App usage: backend/src/controllers/paymentController.js -> simulatePayment($1, $2)
UPDATE payments
SET status = 'paid', paid_at = NOW(), transaction_ref = 'TXN-SIM-MANUAL-001', updated_at = NOW()
WHERE id = 1 AND status = 'pending'
RETURNING id, amount, status;

-- 5.9 Dashboards & Reporting Analytics
-- Purpose: Operator dashboard listing upcoming pending arrivals
-- App usage: backend/src/controllers/operatorController.js -> getPendingArrivals($1)
SELECT 
    b.id,
    b.booking_reference,
    b.pool,
    b.vehicle_type,
    b.vehicle_number,
    b.start_time,
    b.arrival_deadline,
    u.full_name AS customer_name,
    u.phone AS customer_phone
FROM bookings b
JOIN users u ON b.customer_id = u.id
WHERE b.location_id = 1
  AND b.status = 'pending'
  AND b.arrival_deadline >= NOW()
ORDER BY b.arrival_deadline ASC;

-- ============================================================================
-- SECTION 6. VIVA EXAMINATION & EVALUATION QUERIES
-- ============================================================================

-- 6.1 JOINS: Detailed multi-table join for comprehensive booking audit
-- Demonstrates: INNER JOIN, LEFT JOIN, Aggregation across relations
SELECT 
    b.booking_reference,
    u.full_name AS customer_name,
    l.name AS location_name,
    b.vehicle_type,
    b.vehicle_number,
    b.status,
    s.entry_time,
    s.exit_time,
    inv.total_amount,
    pay.status AS payment_status
FROM bookings b
INNER JOIN users u ON b.customer_id = u.id
INNER JOIN parking_locations l ON b.location_id = l.id
LEFT JOIN parking_sessions s ON b.id = s.booking_id
LEFT JOIN invoices inv ON b.id = inv.booking_id
LEFT JOIN payments pay ON inv.id = pay.invoice_id
ORDER BY b.created_at DESC;

-- 6.2 GROUP BY & HAVING: Locations with more than 1 completed booking and high revenue
-- Demonstrates: Grouping, Filtering on Aggregate Values (HAVING SUM > threshold)
SELECT 
    l.id AS location_id,
    l.name AS location_name,
    COUNT(b.id) AS completed_bookings_count,
    SUM(inv.total_amount) AS total_revenue
FROM parking_locations l
JOIN bookings b ON l.id = b.location_id
JOIN invoices inv ON b.id = inv.booking_id
WHERE b.status = 'completed'
GROUP BY l.id, l.name
HAVING COUNT(b.id) >= 1 AND SUM(inv.total_amount) > 50.00
ORDER BY total_revenue DESC;

-- 6.3 SUBQUERIES:
-- 6.3.1 Correlated Subquery: Customers whose average invoice amount exceeds overall average
SELECT u.id, u.full_name, u.email,
    (SELECT AVG(inv.total_amount) FROM invoices inv JOIN bookings b ON inv.booking_id = b.id WHERE b.customer_id = u.id) AS customer_avg_bill
FROM users u
WHERE u.role = 'customer'
  AND (
      SELECT AVG(inv.total_amount) 
      FROM invoices inv 
      JOIN bookings b ON inv.booking_id = b.id 
      WHERE b.customer_id = u.id
  ) > (SELECT AVG(total_amount) FROM invoices);

-- 6.3.2 Uncorrelated Subquery: Locations that have EV charging facility priced below INR 150
SELECT id, name, locality
FROM parking_locations
WHERE id IN (
    SELECT location_id 
    FROM location_facilities 
    WHERE facility_code = 'EV_CHARGING' AND price <= 150.00 AND is_offered = TRUE
);

-- 6.4 EXISTS / NOT EXISTS:
-- Locations that have NEVER experienced an expired or cancelled booking
SELECT l.id, l.name, l.locality
FROM parking_locations l
WHERE NOT EXISTS (
    SELECT 1 
    FROM bookings b 
    WHERE b.location_id = l.id AND b.status IN ('expired', 'cancelled')
);

-- 6.5 CTE (Common Table Expression): Revenue breakdown by vehicle type
WITH VehicleRevenueCTE AS (
    SELECT 
        b.vehicle_type,
        COUNT(b.id) AS total_trips,
        SUM(inv.base_amount) AS total_base_revenue,
        SUM(inv.overtime_amount) AS total_overtime_revenue,
        SUM(inv.addons_amount) AS total_addon_revenue,
        SUM(inv.total_amount) AS gross_revenue
    FROM bookings b
    JOIN invoices inv ON b.id = inv.booking_id
    GROUP BY b.vehicle_type
)
SELECT 
    vehicle_type,
    total_trips,
    gross_revenue,
    ROUND((gross_revenue * 100.0 / (SELECT SUM(gross_revenue) FROM VehicleRevenueCTE)), 2) AS percentage_of_total
FROM VehicleRevenueCTE
ORDER BY gross_revenue DESC;

-- 6.6 WINDOW FUNCTION: Ranking locations by gross billed revenue
SELECT 
    l.id,
    l.name,
    l.locality,
    SUM(inv.total_amount) AS location_revenue,
    DENSE_RANK() OVER (ORDER BY SUM(inv.total_amount) DESC) AS revenue_rank,
    ROUND(AVG(SUM(inv.total_amount)) OVER (), 2) AS avg_revenue_across_all
FROM parking_locations l
JOIN bookings b ON l.id = b.location_id
JOIN invoices inv ON b.id = inv.booking_id
GROUP BY l.id, l.name, l.locality
ORDER BY revenue_rank ASC;

-- 6.7 SET OPERATIONS (UNION, INTERSECT, EXCEPT):
-- Union: Distinct localities covered by either Owner 1 or Owner 2
(SELECT locality FROM parking_locations WHERE owner_id = 3)
UNION
(SELECT locality FROM parking_locations WHERE owner_id = 4);

-- Except: Localities with locations that do NOT offer EV charging
(SELECT locality FROM parking_locations)
EXCEPT
(SELECT l.locality FROM parking_locations l JOIN location_facilities lf ON l.id = lf.location_id WHERE lf.facility_code = 'EV_CHARGING');

-- 6.8 LIVE DATABASE CONSTRAINT DEMONSTRATIONS (Error Trapping DO blocks)
-- These illustrate that PostgreSQL constraints strictly prevent corrupt data.

-- Demonstration 1: Enforcing Check Constraint (end_time must be strictly greater than start_time)
DO $$
BEGIN
    INSERT INTO bookings (
        booking_reference, customer_id, location_id, pool, vehicle_type, vehicle_number,
        start_time, end_time, status, arrival_window_start, arrival_deadline,
        rate_type, quantity, unit_price_snapshot, base_amount_snapshot
    ) VALUES (
        'FAIL-TIME-001', 5, 1, 'public', 'four_wheeler', 'TN23-XX-0000',
        NOW(), NOW() - INTERVAL '1 hour', 'pending', NOW(), NOW() + INTERVAL '15 minutes',
        'hour', 1, 40.00, 40.00
    );
    RAISE NOTICE 'FAILED: Check constraint allowed end_time <= start_time';
EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASSED: Check constraint chk_booking_time_range successfully blocked invalid time span!';
END $$;

-- Demonstration 2: Enforcing Unique Constraint on Member Identifier per Organisation
DO $$
BEGIN
    INSERT INTO org_members (org_id, member_identifier, full_name, email, parking_benefit)
    VALUES (1, 'MEM-001', 'Duplicate Member Test', 'duplicate@example.com', 'standard');
    RAISE NOTICE 'FAILED: Unique constraint allowed duplicate member_identifier';
EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASSED: Unique constraint uq_org_member_identifier blocked duplicate member ID!';
END $$;

-- Demonstration 3: Enforcing Foreign Key Integrity (Invalid User ID)
DO $$
BEGIN
    INSERT INTO bookings (
        booking_reference, customer_id, location_id, pool, vehicle_type, vehicle_number,
        start_time, end_time, status, arrival_window_start, arrival_deadline,
        rate_type, quantity, unit_price_snapshot, base_amount_snapshot
    ) VALUES (
        'FAIL-FK-001', 999999, 1, 'public', 'four_wheeler', 'TN23-XX-0000',
        NOW(), NOW() + INTERVAL '1 hour', 'pending', NOW(), NOW() + INTERVAL '15 minutes',
        'hour', 1, 40.00, 40.00
    );
    RAISE NOTICE 'FAILED: Foreign key allowed non-existent customer_id';
EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASSED: Foreign key constraint successfully blocked orphan booking record!';
END $$;

-- ============================================================================
-- SECTION 7. TRANSACTIONAL UPDATE & DELETE DEMONSTRATIONS (ROLLBACK SAFE)
-- ============================================================================
-- All statements in this section are wrapped in BEGIN ... ROLLBACK blocks to ensure
-- that executing this entire script repeatedly leaves seeded records pristine.

-- 7.1 Demonstration: Update Tariff Rates & Overtime Fee
BEGIN;
    UPDATE location_tariffs
    SET hourly_rate = 65.00,
        overtime_rate_per_minute = 2.00
    WHERE location_id = 1;

    -- Verify the update within transaction
    SELECT location_id, hourly_rate, overtime_rate_per_minute 
    FROM location_tariffs 
    WHERE location_id = 1;
ROLLBACK;

-- 7.2 Demonstration: Deactivate an Organisation Member
BEGIN;
    UPDATE org_members
    SET is_active = FALSE,
        updated_at = NOW()
    WHERE org_id = 1 AND member_identifier = 'MEM-003';

    -- Verify member is now inactive
    SELECT id, member_identifier, full_name, is_active 
    FROM org_members 
    WHERE member_identifier = 'MEM-003';
ROLLBACK;

-- 7.3 Demonstration: Customer Cancels a Pending Booking
BEGIN;
    -- Temporarily create a pending booking to simulate cancellation
    INSERT INTO bookings (
        id, booking_reference, customer_id, location_id, pool,
        vehicle_type, vehicle_number, start_time, end_time, status,
        arrival_window_start, arrival_deadline, code_hash,
        rate_type, quantity, unit_price_snapshot, base_amount_snapshot
    ) VALUES (
        9999, 'TEST-CANCEL-999', 5, 1, 'public',
        'four_wheeler', 'TN23-TEST-99', NOW(), NOW() + INTERVAL '1 hour', 'pending',
        NOW(), NOW() + INTERVAL '15 minutes', 'sample_hash',
        'hour', 1, 40.00, 40.00
    );

    -- Customer executes cancellation
    UPDATE bookings
    SET status = 'cancelled',
        code_hash = NULL,
        code_encrypted = NULL,
        updated_at = NOW()
    WHERE id = 9999 AND status = 'pending';

    -- Confirm event trigger logged the cancellation
    SELECT event_type, old_status, new_status, notes 
    FROM booking_events 
    WHERE booking_id = 9999;
ROLLBACK;

-- 7.4 Demonstration: Delete an Inactive Member Record
BEGIN;
    DELETE FROM org_members
    WHERE member_identifier = 'MEM-006' AND is_active = FALSE;

    -- Verify record deletion within transaction
    SELECT COUNT(*) AS count_mem_006 
    FROM org_members 
    WHERE member_identifier = 'MEM-006';
ROLLBACK;

-- ============================================================================
-- END OF SCRIPT: database/parkhere.sql
-- ============================================================================
