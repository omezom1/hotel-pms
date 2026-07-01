-- 018_housekeeping_realtime.sql — Tier C kickoff (housekeeping_tasks cutover)
-- housekeeping_tasks = mutable + soft-delete (แพทเทิร์น guests/staff/rooms). leaf ที่สุดของ Tier C:
--   ไม่มี entity อื่นพึ่ง; FK ขาออก room_id→rooms (CASCADE) ชี้ตารางที่ย้ายแล้ว (Tier B) → valid ไม่แตะ
-- ถูก "สร้าง" เป็น side-effect ใน checkout/cancel/move (จับ hkFx) + แก้/complete โดย updateTaskStatus/addHousekeepingTask
-- CHECK enums (status/priority) ตรงกับ TS types แล้ว — ไม่ต้องแก้ (ต่างจาก rooms ที่ 001 seed เพี้ยน)
-- รันผ่าน MCP execute_sql (management creds รัน DDL ได้)

-- ── 1) คอลัมน์ writer_id (echo key; ข้าม event ที่ตัวเองเป็นคนเขียน) ──────────
ALTER TABLE housekeeping_tasks ADD COLUMN IF NOT EXISTS writer_id TEXT;

-- ── 2) เปิด Realtime ให้ตาราง (idempotent DO block ตาม 003/…/017) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'housekeeping_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE housekeeping_tasks;
  END IF;
END $$;

-- ── 3) ส่ง row เต็มมากับ event (UPDATE/DELETE พก writer_id + deleted_at ครบ) ──
ALTER TABLE housekeeping_tasks REPLICA IDENTITY FULL;

-- ── 4) เปิด RLS anon กลับ (012 ปิด orphan housekeeping_tasks ไว้) — select + insert + update ──
--    soft-delete = update; ไม่มี hard delete (แพทเทิร์น active-table ใน 012)
DROP POLICY IF EXISTS "anon_select_housekeeping_tasks" ON public.housekeeping_tasks;
DROP POLICY IF EXISTS "anon_insert_housekeeping_tasks" ON public.housekeeping_tasks;
DROP POLICY IF EXISTS "anon_update_housekeeping_tasks" ON public.housekeeping_tasks;
create policy "anon_select_housekeeping_tasks" on public.housekeeping_tasks for select to anon using (true);
create policy "anon_insert_housekeeping_tasks" on public.housekeeping_tasks for insert to anon with check (true);
create policy "anon_update_housekeeping_tasks" on public.housekeeping_tasks for update to anon using (true) with check (true);
