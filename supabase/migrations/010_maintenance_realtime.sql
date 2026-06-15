-- ============================================================
-- 010 — Relational migration Tier A: maintenance_logs cutover
-- Pruksatara Park & Resort Hotel PMS
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → Run (anon key รัน DDL ไม่ได้)
--
-- maintenance_logs = mutable + soft-delete (แพทเทิร์น expenses) — 1 entity
-- ตารางสร้างใน 001 แล้ว, deleted_at/updated_at/trigger มาจาก 005 — เหลือ:
--   • ขาดคอลัมน์ writer_id (echo key ตามแพทเทิร์น audit_logs/expenses/inventory)
--   • ยังไม่เปิด Realtime + ยังไม่ REPLICA IDENTITY FULL
--   • **มี FK room_id → rooms(id)** ที่ต้อง DROP:
--     rooms ยังไม่ย้าย (blob/Tier B) และตาราง rooms ใน DB เป็น orphan ที่ stale
--     (ผู้ใช้แก้/เพิ่มห้องใน blob เท่านั้น) → log ของห้องที่ blob มีแต่ตาราง rooms ไม่มี
--     จะ FK-violate ตอน insert/backfill. ปลด FK ช่วง strangler — ใส่กลับเมื่อย้าย rooms (Tier B)
-- เนื้อหา additive/idempotent (ยกเว้น DROP FK) → ปลอดภัยต่อ blob (app_state ยังเป็นแหล่งจริง)
-- ============================================================

-- ── 1) คอลัมน์ writer_id (echo key; ข้าม event ที่ตัวเองเป็นคนเขียน) ──────────
ALTER TABLE maintenance_logs ADD COLUMN IF NOT EXISTS writer_id TEXT;

-- ── 2) ปลด FK room_id → rooms (rooms ยังเป็น blob/orphan — ดูหัวไฟล์) ────────
ALTER TABLE maintenance_logs DROP CONSTRAINT IF EXISTS maintenance_logs_room_id_fkey;

-- ── 3) เปิด Realtime ให้ตาราง (idempotent DO block ตาม 003/006/008/009) ──────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'maintenance_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE maintenance_logs;
  END IF;
END $$;

-- ── 4) ส่ง row เต็มมากับ event (UPDATE/DELETE พก writer_id + deleted_at ครบ) ──
ALTER TABLE maintenance_logs REPLICA IDENTITY FULL;
