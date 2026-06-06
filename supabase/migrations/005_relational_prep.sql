-- ============================================================
-- 005 — Relational migration Phase 0 (เตรียม schema, ไม่ cutover entity)
-- Pruksatara Park & Resort Hotel PMS
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → Run (anon key รัน DDL ไม่ได้)
--
-- เนื้อหา = additive ล้วน → ปลอดภัยต่อ blob (app_state) ที่ยังเป็นแหล่งจริงอยู่
--  1) ตาราง payments (แยกจาก bookings.payments jsonb — กัน id-collision + refund atomic)
--  2) ตาราง expenses (ขาดหายใน 001)
--  3) คอลัมน์ bookings.room_type_at_booking (snapshot ประเภทห้องตอนจอง)
--  4) คอลัมน์ updated_at / deleted_at + trigger set_updated_at บนตารางที่จะย้าย
-- ยังไม่มี client เรียกใช้ตารางพวกนี้ใน 005 — แค่เตรียมโครง
-- ============================================================

-- ── trigger function กลาง: เซ็ต updated_at อัตโนมัติทุก UPDATE ─────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 1) payments (append-only ledger; ไม่มี updated_at/deleted_at) ──────────
CREATE TABLE IF NOT EXISTS payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  TEXT NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'payment'
                CHECK (kind IN ('payment', 'deposit', 'refund')),
  method      TEXT CHECK (method IN ('credit_card', 'debit_card', 'qr_code', 'bank_transfer', 'cash', 'pay_later')),
  notes       TEXT,
  created_by  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_authenticated_payments" ON payments;
CREATE POLICY "allow_all_authenticated_payments" ON payments
  FOR ALL USING (true) WITH CHECK (true);

-- ── 2) expenses (mirror TS Expense — types/index.ts) ──────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN (
                'salary', 'utilities_electric', 'utilities_water', 'utilities_internet',
                'maintenance', 'cleaning', 'tax', 'marketing', 'supplies', 'other')),
  description TEXT NOT NULL DEFAULT '',
  payee       TEXT,
  amount      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_authenticated_expenses" ON expenses;
CREATE POLICY "allow_all_authenticated_expenses" ON expenses
  FOR ALL USING (true) WITH CHECK (true);

-- ── 3) snapshot ประเภทห้องตอนจอง ──────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS room_type_at_booking TEXT
    CHECK (room_type_at_booking IN ('single', 'double', 'triple'));

-- ── 4) updated_at / deleted_at + trigger บนตารางที่จะย้าย (mutable entities) ─
-- (เว้น ledger append-only: payments, inventory_transactions, corporate_transactions, audit_logs)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rooms', 'guests', 'bookings', 'invoices', 'housekeeping_tasks',
    'maintenance_logs', 'staff', 'users', 'inventory_items',
    'corporate_accounts', 'add_on_items', 'booking_add_ons', 'expenses'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;
