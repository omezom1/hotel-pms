-- ============================================================
-- 006 — Relational migration Phase 1: audit_logs cutover (entity แรก / practice)
-- Pruksatara Park & Resort Hotel PMS
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → Run
--
-- audit_logs เป็น append-only + single-writer (logAudit) + single-reader (/audit-log)
-- → blast radius เล็กสุด, §3c resurrection เป็นไปไม่ได้ (ไม่มี update/delete)
-- ============================================================

-- ── 1) reconcile CHECK ─────────────────────────────────────────────────────
-- 001 ตั้ง category รวม 'staff' แต่ TS AuditCategory ใช้ 'expense' (ไม่มี 'staff')
-- → union ทั้งสองชุด ไม่งั้น dual-write category 'expense' โดน 23514 check_violation
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_category_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_category_check
  CHECK (category IN (
    'booking', 'payment', 'room', 'guest', 'housekeeping',
    'maintenance', 'inventory', 'corporate', 'auth', 'expense', 'staff'
  ));

-- ── 2) writer_id = CLIENT_ID ของแท็บที่เขียน (echo key; คนละตัวกับ staff_id) ──
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS writer_id TEXT;

-- ── 3) เปิด Realtime ให้ตาราง (idempotent DO block ตาม 003) ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'audit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
  END IF;
END $$;

-- ── 4) ส่ง row เต็มมากับ event (ให้ payload.new พก writer_id + ทุกคอลัมน์) ───
ALTER TABLE audit_logs REPLICA IDENTITY FULL;

-- หมายเหตุ retention (ตัดสินใจ 2026-06-06): เก็บครบทุกแถวในตาราง (durable history)
-- ฝั่ง client hydrate แค่ 500 ล่าสุด — ไม่มี trigger/cron ตัดของเก่า
