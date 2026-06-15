-- ============================================================
-- 008 — Relational migration Tier A: expenses cutover (entity แรกที่ mutable)
-- Pruksatara Park & Resort Hotel PMS
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → Run (anon key รัน DDL ไม่ได้)
--
-- ตาราง expenses ถูกสร้างใน 005 (Phase 0, additive) แต่ยัง:
--   • ขาดคอลัมน์ receipt_path  (เพิ่มใน TS Expense ทีหลัง — แนบรูปบิล/Storage 2026-06-07)
--   • ขาดคอลัมน์ writer_id     (echo key สำหรับ realtime ตามแพทเทิร์น audit_logs)
--   • ยังไม่เปิด Realtime + ยังไม่ REPLICA IDENTITY FULL (ต้องการ payload เต็มของ UPDATE/DELETE)
-- expenses มี update + delete (ไม่ใช่ append-only เหมือน audit_logs) → ใช้ soft-delete:
--   ลบ = UPDATE deleted_at=NOW() (005 เตรียม deleted_at + trigger set_updated_at ไว้แล้ว)
--   กัน §3c resurrection (union-merge ของ blob ชุบชีวิตแถวที่ลบไม่ได้ เพราะแถวไม่หาย)
-- เนื้อหา additive/idempotent ล้วน → ปลอดภัยต่อ blob (app_state ยังเป็นแหล่งจริงช่วง dual-write)
-- ============================================================

-- ── 1) คอลัมน์ที่ขาด ────────────────────────────────────────────────────────
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_path TEXT;
-- writer_id = CLIENT_ID ของแท็บที่เขียน (echo key; ข้าม event ที่ตัวเองเป็นคนเขียน)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS writer_id TEXT;

-- ── 2) เปิด Realtime ให้ตาราง (idempotent DO block ตาม 003/006) ──────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'expenses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
  END IF;
END $$;

-- ── 3) ส่ง row เต็มมากับ event (payload.new/old พก writer_id + deleted_at ครบ) ─
-- จำเป็นสำหรับ UPDATE/DELETE: echo-guard อ่าน writer_id, soft-delete อ่าน deleted_at
ALTER TABLE expenses REPLICA IDENTITY FULL;
