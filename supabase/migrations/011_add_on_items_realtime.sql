-- ============================================================
-- 011 — Relational migration Tier B (kickoff): add_on_items cutover
-- Pruksatara Park & Resort Hotel PMS
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → Run (anon key รัน DDL ไม่ได้)
--
-- add_on_items = catalog แบบ read-only (ไม่มี action เพิ่ม/แก้/ลบในแอป — seed จาก mock)
-- → ไม่มี dual-write; cutover = realtime + reconcile-from-blob + blob isolation เท่านั้น
-- ตารางสร้างใน 001, deleted_at/updated_at/trigger มาจาก 005 (loop รวม add_on_items) — เหลือ:
--   • ขาดคอลัมน์ writer_id (echo key + ใช้เป็น flag "ผ่าน reconcile แล้ว")
--   • ยังไม่เปิด Realtime + ยังไม่ REPLICA IDENTITY FULL
-- FK `add_on_items.inventory_item_id → inventory_items` = **คงไว้**
--   (inventory_items ย้ายแล้ว/มีข้อมูลครบ ใน Tier A → FK ยัง valid, ไม่ต้อง drop)
-- เนื้อหา additive/idempotent ล้วน → ปลอดภัยต่อ blob (app_state ยังเป็นแหล่งจริง)
-- ============================================================

-- ── 1) คอลัมน์ writer_id (echo key; ข้าม event ที่ตัวเองเป็นคนเขียน) ──────────
ALTER TABLE add_on_items ADD COLUMN IF NOT EXISTS writer_id TEXT;

-- ── 2) เปิด Realtime ให้ตาราง (idempotent DO block ตาม 003/006/008/009/010) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'add_on_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE add_on_items;
  END IF;
END $$;

-- ── 3) ส่ง row เต็มมากับ event (UPDATE/DELETE พก writer_id + deleted_at ครบ) ──
ALTER TABLE add_on_items REPLICA IDENTITY FULL;
