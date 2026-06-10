-- ============================================================
-- 009 — Relational migration Tier A: inventory cutover (items + ledger)
-- Pruksatara Park & Resort Hotel PMS
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → Run (anon key รัน DDL ไม่ได้)
--
-- inventory มี 2 entity (ย้ายพร้อมกัน เพราะ stock-movement แก้ทั้งคู่ในนาทีเดียว):
--   • inventory_items        = mutable (add/update/delete + currentStock เปลี่ยนตลอด) → ใช้ soft-delete
--                              เหมือน expenses (deleted_at จาก 005 + trigger set_updated_at)
--   • inventory_transactions = append-only ledger (restock/use/adjust/waste) เหมือน audit_logs
--                              (ไม่มี updated_at/deleted_at — ไม่เคยแก้/ลบ, INSERT อย่างเดียว)
-- ทั้งสองตารางสร้างใน 001 แล้ว แต่ยัง:
--   • ขาดคอลัมน์ writer_id  (echo key สำหรับ realtime ตามแพทเทิร์น audit_logs/expenses)
--   • ยังไม่เปิด Realtime + ยังไม่ REPLICA IDENTITY FULL
-- เนื้อหา additive/idempotent ล้วน → ปลอดภัยต่อ blob (app_state ยังเป็นแหล่งจริงช่วง dual-write)
-- ============================================================

-- ── 1) คอลัมน์ writer_id (echo key; ข้าม event ที่ตัวเองเป็นคนเขียน) ──────────
ALTER TABLE inventory_items        ADD COLUMN IF NOT EXISTS writer_id TEXT;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS writer_id TEXT;

-- ── 2) เปิด Realtime ให้ทั้งสองตาราง (idempotent DO block ตาม 003/006/008) ───
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_items', 'inventory_transactions']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

-- ── 3) ส่ง row เต็มมากับ event ──────────────────────────────────────────────
-- inventory_items: UPDATE/DELETE ต้องพก writer_id + deleted_at + current_stock เต็ม
-- inventory_transactions: INSERT-only แต่ FULL ไว้กันเหนียว (writer_id อยู่ใน payload.new อยู่แล้ว)
ALTER TABLE inventory_items        REPLICA IDENTITY FULL;
ALTER TABLE inventory_transactions REPLICA IDENTITY FULL;
