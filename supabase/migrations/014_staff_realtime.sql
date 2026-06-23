-- 014_staff_realtime.sql — Tier B (staff cutover)
-- staff = mutable CRUD (add/update/delete=soft-delete); แพทเทิร์น guests/maintenance_logs
-- ไม่มี FK ขาออก; FK `users.staff_id→staff` เป็นฝั่ง parent (upsert/soft-delete ไม่ละเมิด;
--   staff ย้ายก่อน users → users FK มี parent ครบตอน users ย้ายตามมา)
-- รันผ่าน MCP execute_sql (management creds รัน DDL ได้)

-- ── 1) คอลัมน์ writer_id (echo key; ข้าม event ที่ตัวเองเป็นคนเขียน) ──────────
ALTER TABLE staff ADD COLUMN IF NOT EXISTS writer_id TEXT;

-- ── 2) เปิด Realtime ให้ตาราง (idempotent DO block ตาม 003/006/008/009/010/011/013) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'staff'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE staff;
  END IF;
END $$;

-- ── 3) ส่ง row เต็มมากับ event (UPDATE/DELETE พก writer_id + deleted_at ครบ) ──
ALTER TABLE staff REPLICA IDENTITY FULL;

-- ── 4) เปิด RLS anon กลับ (012 ปิด orphan staff ไว้) — select + insert + update ──
--    soft-delete = update; ไม่มี hard delete (แพทเทิร์น active-table ใน 012)
DROP POLICY IF EXISTS "anon_select_staff" ON public.staff;
DROP POLICY IF EXISTS "anon_insert_staff" ON public.staff;
DROP POLICY IF EXISTS "anon_update_staff" ON public.staff;
CREATE POLICY "anon_select_staff" ON public.staff FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_staff" ON public.staff FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_staff" ON public.staff FOR UPDATE TO anon USING (true) WITH CHECK (true);
