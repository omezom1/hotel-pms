-- ============================================================
-- Hotel PMS — Initial Schema Migration
-- Project: Pruksatara Park & Resort
-- Supabase Project: imfmiciqqxkytoxofqzv (ap-southeast-1)
-- ============================================================

-- Enable the pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: rooms
-- TypeScript: Room (types/index.ts)
-- ============================================================
CREATE TABLE IF NOT EXISTS rooms (
  id               TEXT PRIMARY KEY,
  number           TEXT NOT NULL UNIQUE,
  type             TEXT NOT NULL CHECK (type IN ('standard', 'deluxe', 'suite', 'family', 'penthouse')),
  floor            INTEGER NOT NULL,
  wing             TEXT NOT NULL CHECK (wing IN ('front', 'back')),
  status           TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'cleaning', 'maintenance')),
  price_per_night  NUMERIC(10, 2) NOT NULL,
  max_guests       INTEGER NOT NULL,
  amenities        JSONB NOT NULL DEFAULT '[]',
  description      TEXT NOT NULL DEFAULT '',
  current_guest_id TEXT,
  current_booking_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_rooms" ON rooms
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: guests
-- TypeScript: Guest + GuestPreferences (types/index.ts)
-- preferences stored as JSONB (GuestPreferences object)
-- ============================================================
CREATE TABLE IF NOT EXISTS guests (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT NOT NULL DEFAULT '',
  nationality  TEXT NOT NULL DEFAULT '',
  id_number    TEXT NOT NULL DEFAULT '',
  preferences  JSONB NOT NULL DEFAULT '{}',
  total_stays  INTEGER NOT NULL DEFAULT 0,
  total_spend  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  joined_at    TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_guests" ON guests
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: staff
-- TypeScript: Staff + StaffPermissions (types/index.ts)
-- permissions stored as JSONB (StaffPermissions object)
-- NOTE: passwords stored in users table, not here
-- ============================================================
CREATE TABLE IF NOT EXISTS staff (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'receptionist', 'accountant', 'housekeeper', 'maintenance')),
  email       TEXT NOT NULL UNIQUE,
  phone       TEXT NOT NULL DEFAULT '',
  avatar      TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  hire_date   TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_staff" ON staff
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: users
-- TypeScript: User (types/index.ts)
-- NOTE: passwords are plain-text in mock data (demo only).
-- Production MUST hash with bcrypt before inserting.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  staff_id    TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  last_login  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_users" ON users
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: corporate_accounts
-- TypeScript: CorporateAccount (types/index.ts)
-- Must precede bookings (bookings.corporate_account_id → here)
-- ============================================================
CREATE TABLE IF NOT EXISTS corporate_accounts (
  id                TEXT PRIMARY KEY,
  company_name      TEXT NOT NULL,
  contact_person    TEXT NOT NULL,
  contact_phone     TEXT NOT NULL DEFAULT '',
  contact_email     TEXT NOT NULL DEFAULT '',
  tax_id            TEXT,
  address           TEXT,
  total_deposited   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_used        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  available_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE corporate_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_corporate_accounts" ON corporate_accounts
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: bookings
-- TypeScript: Booking (types/index.ts)
-- payments stored as JSONB array (Payment[])
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id                   TEXT PRIMARY KEY,
  room_id              TEXT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  guest_id             TEXT NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,
  check_in             TEXT NOT NULL,
  check_out            TEXT NOT NULL,
  nights               INTEGER NOT NULL,
  status               TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'checked_in', 'checked_out', 'cancelled', 'pending')),
  source               TEXT NOT NULL DEFAULT 'direct' CHECK (source IN ('direct', 'agoda', 'booking_com', 'expedia', 'walk_in')),
  total_amount         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_amount          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  adults               INTEGER NOT NULL DEFAULT 1,
  children             INTEGER NOT NULL DEFAULT 0,
  special_requests     TEXT NOT NULL DEFAULT '',
  payment_method       TEXT CHECK (payment_method IN ('credit_card', 'debit_card', 'qr_code', 'bank_transfer', 'cash', 'pay_later')),
  corporate_account_id TEXT REFERENCES corporate_accounts(id) ON DELETE SET NULL,
  is_corporate         BOOLEAN NOT NULL DEFAULT false,
  payments             JSONB NOT NULL DEFAULT '[]',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_bookings" ON bookings
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: invoices
-- TypeScript: Invoice + InvoiceItem[] (types/index.ts)
-- items stored as JSONB array (InvoiceItem[])
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id             TEXT PRIMARY KEY,
  booking_id     TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  guest_id       TEXT NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,
  amount         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax            NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'refunded')),
  issued_at      TEXT NOT NULL,
  paid_at        TEXT,
  payment_method TEXT CHECK (payment_method IN ('credit_card', 'debit_card', 'qr_code', 'bank_transfer', 'cash', 'pay_later')),
  items          JSONB NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_invoices" ON invoices
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: housekeeping_tasks
-- TypeScript: HousekeepingTask (types/index.ts)
-- ============================================================
CREATE TABLE IF NOT EXISTS housekeeping_tasks (
  id           TEXT PRIMARY KEY,
  room_id      TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  room_number  TEXT NOT NULL,
  assigned_to  TEXT NOT NULL DEFAULT '',
  staff_id     TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  priority     TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  notes        TEXT NOT NULL DEFAULT '',
  scheduled_at TEXT NOT NULL,
  started_at   TEXT,
  completed_at TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE housekeeping_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_housekeeping_tasks" ON housekeeping_tasks
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: maintenance_logs
-- TypeScript: MaintenanceLog (types/index.ts)
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id           TEXT PRIMARY KEY,
  room_id      TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  room_number  TEXT NOT NULL,
  issue        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  priority     TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  reported_by  TEXT NOT NULL DEFAULT '',
  reported_at  TEXT NOT NULL,
  assigned_to  TEXT,
  resolved_at  TEXT,
  cost         NUMERIC(10, 2),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE maintenance_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_maintenance_logs" ON maintenance_logs
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: inventory_items
-- TypeScript: InventoryItem (types/index.ts)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_items (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL CHECK (category IN ('room_amenities', 'minibar', 'cleaning_supplies')),
  unit           TEXT NOT NULL CHECK (unit IN ('piece', 'bottle', 'pack', 'set', 'liter', 'kg')),
  current_stock  INTEGER NOT NULL DEFAULT 0,
  min_stock      INTEGER NOT NULL DEFAULT 0,
  max_stock      INTEGER NOT NULL DEFAULT 0,
  cost_per_unit  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  supplier       TEXT,
  last_restocked TEXT NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_inventory_items" ON inventory_items
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: inventory_transactions
-- TypeScript: InventoryTransaction (types/index.ts)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id            TEXT PRIMARY KEY,
  item_id       TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('restock', 'use', 'adjust', 'waste')),
  quantity      INTEGER NOT NULL,
  reference_id  TEXT,
  performed_by  TEXT NOT NULL DEFAULT '',
  date          TEXT NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_inventory_transactions" ON inventory_transactions
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: corporate_transactions
-- TypeScript: CorporateTransaction (types/index.ts)
-- ============================================================
CREATE TABLE IF NOT EXISTS corporate_transactions (
  id                   TEXT PRIMARY KEY,
  corporate_account_id TEXT NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL CHECK (type IN ('deposit', 'charge', 'refund', 'adjustment')),
  amount               NUMERIC(12, 2) NOT NULL,
  balance_before       NUMERIC(12, 2) NOT NULL,
  balance_after        NUMERIC(12, 2) NOT NULL,
  booking_id           TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  invoice_id           TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  performed_by         TEXT NOT NULL DEFAULT '',
  date                 TEXT NOT NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE corporate_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_corporate_transactions" ON corporate_transactions
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: add_on_items
-- TypeScript: AddOnItem (types/index.ts)
-- ============================================================
CREATE TABLE IF NOT EXISTS add_on_items (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  category              TEXT NOT NULL CHECK (category IN ('bedding', 'amenity', 'service')),
  price                 NUMERIC(10, 2) NOT NULL DEFAULT 0,
  inventory_item_id     TEXT REFERENCES inventory_items(id) ON DELETE SET NULL,
  inventory_qty_per_unit INTEGER NOT NULL DEFAULT 0,
  is_available          BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE add_on_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_add_on_items" ON add_on_items
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: booking_add_ons
-- TypeScript: BookingAddOn (types/index.ts)
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_add_ons (
  id             TEXT PRIMARY KEY,
  booking_id     TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  add_on_item_id TEXT NOT NULL REFERENCES add_on_items(id) ON DELETE RESTRICT,
  quantity       INTEGER NOT NULL DEFAULT 1,
  unit_price     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_price    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'fulfilled', 'cancelled')),
  requested_at   TEXT NOT NULL,
  requested_by   TEXT NOT NULL DEFAULT '',
  fulfilled_at   TEXT,
  fulfilled_by   TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE booking_add_ons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_booking_add_ons" ON booking_add_ons
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: audit_logs
-- TypeScript: AuditLog (types/index.ts)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  timestamp   TEXT NOT NULL,
  staff_id    TEXT NOT NULL DEFAULT '',
  staff_name  TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL CHECK (category IN ('booking', 'payment', 'room', 'guest', 'housekeeping', 'maintenance', 'inventory', 'corporate', 'auth', 'staff')),
  action      TEXT NOT NULL,
  summary     TEXT NOT NULL,
  entity_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_audit_logs" ON audit_logs
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TABLE: ota_channels
-- TypeScript: OTAChannel (types/index.ts)
-- ============================================================
CREATE TABLE IF NOT EXISTS ota_channels (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  logo              TEXT NOT NULL DEFAULT '',
  is_connected      BOOLEAN NOT NULL DEFAULT false,
  last_sync         TEXT NOT NULL,
  inventory_mapped  INTEGER NOT NULL DEFAULT 0,
  total_rooms       INTEGER NOT NULL DEFAULT 0,
  pending_bookings  INTEGER NOT NULL DEFAULT 0,
  commission        NUMERIC(5, 2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ota_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated_ota_channels" ON ota_channels
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- INDEXES for common query patterns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookings_room_id       ON bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_bookings_guest_id      ON bookings(guest_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status        ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_check_in      ON bookings(check_in);
CREATE INDEX IF NOT EXISTS idx_housekeeping_room_id   ON housekeeping_tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_status    ON housekeeping_tasks(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_room_id    ON maintenance_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status     ON maintenance_logs(status);
CREATE INDEX IF NOT EXISTS idx_inv_transactions_item  ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_corp_transactions_acct ON corporate_transactions(corporate_account_id);
CREATE INDEX IF NOT EXISTS idx_booking_addons_booking ON booking_add_ons(booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category    ON audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp   ON audit_logs(timestamp DESC);
