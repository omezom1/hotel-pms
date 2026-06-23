-- 013_guests_realtime.sql — Tier B (guests cutover)
-- guests = mutable (add/update) + side-effect totalStays/totalSpend ตอนเช็คเอาต์
-- แพทเทิร์น maintenance_logs/expenses; ไม่มี FK ขาออก (FK bookings.guest_id→guests เป็นฝั่ง parent, upsert ไม่ละเมิด)
-- รันผ่าน MCP execute_sql (management creds รัน DDL ได้)

-- ── 1) คอลัมน์ writer_id (echo key; ข้าม event ที่ตัวเองเป็นคนเขียน) ──────────
ALTER TABLE guests ADD COLUMN IF NOT EXISTS writer_id TEXT;

-- ── 2) เปิด Realtime ให้ตาราง (idempotent DO block ตาม 003/006/008/009/010/011) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'guests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE guests;
  END IF;
END $$;

-- ── 3) ส่ง row เต็มมากับ event (UPDATE/DELETE พก writer_id + deleted_at ครบ) ──
ALTER TABLE guests REPLICA IDENTITY FULL;

-- ── 4) เปิด RLS anon กลับ (012 ปิด orphan guests ไว้) — select + insert + update ──
--    soft-delete = update; ไม่มี hard delete (แพทเทิร์น active-table ใน 012)
create policy "anon_select_guests" on public.guests for select to anon using (true);
create policy "anon_insert_guests" on public.guests for insert to anon with check (true);
create policy "anon_update_guests" on public.guests for update to anon using (true) with check (true);
