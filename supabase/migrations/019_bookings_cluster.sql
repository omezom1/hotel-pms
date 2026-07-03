-- 019_bookings_cluster.sql — Tier C Phase C2 (bookings + invoices + booking_add_ons cutover)
-- 3 ตารางย้ายพร้อมกันเพราะ FK ผูกกันแน่น (invoices→bookings, booking_add_ons→bookings;
-- payments ฝังเป็น jsonb ใน booking row — ตาราง payments แยก (005) ว่าง/ไม่ใช้ → DROP ทิ้ง)
-- ทุกตารางมี updated_at/deleted_at แล้ว (005) + CHECK enums ตรง TS (verify 2026-07-01) — ไม่แตะ
-- schema gap ที่แก้: walk-in booking ไม่มี guestId (ใช้ guestSnapshot) แต่ guest_id เป็น NOT NULL
-- รันผ่าน MCP execute_sql (management creds รัน DDL ได้)

-- ── 1) แก้ schema gap สำหรับ walk-in (guestSnapshot ไม่มี guestId) ──────────
ALTER TABLE bookings ALTER COLUMN guest_id DROP NOT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_snapshot JSONB;
ALTER TABLE invoices ALTER COLUMN guest_id DROP NOT NULL;

-- ── 2) คอลัมน์ writer_id (echo key; ข้าม event ที่ตัวเองเป็นคนเขียน) ──────────
ALTER TABLE bookings        ADD COLUMN IF NOT EXISTS writer_id TEXT;
ALTER TABLE invoices        ADD COLUMN IF NOT EXISTS writer_id TEXT;
ALTER TABLE booking_add_ons ADD COLUMN IF NOT EXISTS writer_id TEXT;

-- ── 3) เปิด Realtime ให้ 3 ตาราง (idempotent DO block ตาม 003/…/018) ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookings', 'invoices', 'booking_add_ons'] LOOP
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

-- ── 4) ส่ง row เต็มมากับ event (UPDATE/DELETE พก writer_id + deleted_at ครบ) ──
ALTER TABLE bookings        REPLICA IDENTITY FULL;
ALTER TABLE invoices        REPLICA IDENTITY FULL;
ALTER TABLE booking_add_ons REPLICA IDENTITY FULL;

-- ── 5) เปิด RLS anon กลับ (012 ปิด orphan ไว้) — select + insert + update ──
--    soft-delete = update; ไม่มี hard delete (แพทเทิร์น active-table ใน 012/018)
DROP POLICY IF EXISTS "anon_select_bookings" ON public.bookings;
DROP POLICY IF EXISTS "anon_insert_bookings" ON public.bookings;
DROP POLICY IF EXISTS "anon_update_bookings" ON public.bookings;
create policy "anon_select_bookings" on public.bookings for select to anon using (true);
create policy "anon_insert_bookings" on public.bookings for insert to anon with check (true);
create policy "anon_update_bookings" on public.bookings for update to anon using (true) with check (true);

DROP POLICY IF EXISTS "anon_select_invoices" ON public.invoices;
DROP POLICY IF EXISTS "anon_insert_invoices" ON public.invoices;
DROP POLICY IF EXISTS "anon_update_invoices" ON public.invoices;
create policy "anon_select_invoices" on public.invoices for select to anon using (true);
create policy "anon_insert_invoices" on public.invoices for insert to anon with check (true);
create policy "anon_update_invoices" on public.invoices for update to anon using (true) with check (true);

DROP POLICY IF EXISTS "anon_select_booking_add_ons" ON public.booking_add_ons;
DROP POLICY IF EXISTS "anon_insert_booking_add_ons" ON public.booking_add_ons;
DROP POLICY IF EXISTS "anon_update_booking_add_ons" ON public.booking_add_ons;
create policy "anon_select_booking_add_ons" on public.booking_add_ons for select to anon using (true);
create policy "anon_insert_booking_add_ons" on public.booking_add_ons for insert to anon with check (true);
create policy "anon_update_booking_add_ons" on public.booking_add_ons for update to anon using (true) with check (true);

-- ── 6) DROP ตาราง payments (005) — ว่าง/ไม่มี FK อ้างถึง; payments ฝัง jsonb ใน bookings ──
DROP TABLE IF EXISTS payments;
