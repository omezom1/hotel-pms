-- 017_rooms_realtime.sql — Tier B (rooms cutover — ตัวสุดท้ายของ Tier B)
-- rooms = ไม่มี record CRUD ในแอป (ชุดคงที่จาก seed); เปลี่ยนเฉพาะ status + occupancy pointers
--   (current_booking_id/current_guest_id) ผ่าน booking/maintenance/housekeeping lifecycle ~10 จุด
-- แพทเทิร์น guests/staff (mutable + soft-delete slot) — ไม่มี delete action → RLS ไม่เปิด delete
-- ไม่มี FK ขาออก; FK ขาเข้า bookings.room_id/housekeeping_tasks.room_id เป็นตาราง orphan (แอปไม่เขียน) → upsert rooms ไม่ละเมิด
-- รันผ่าน MCP execute_sql (management creds รัน DDL ได้)

-- ── 0) แก้ CHECK constraint ให้ตรงกับ RoomType จริงของแอป ──────────
--    001 seed ใช้ enum เก่า (standard/deluxe/suite/family/penthouse) แต่แอปจริงใช้ single/double/triple
--    (blob = mockRooms). rooms กลายเป็น table-authoritative → ตารางต้องรับค่าที่แอปเขียน
--    ⚠️ ต้อง reconcile ค่า type ในตารางให้เป็น single/double/triple ก่อน ADD (orphan seed ยังเป็น enum เก่า)
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_type_check;
-- (ค่าในตารางถูก reconcile จาก blob/mockRooms เป็น single/double/triple แล้ว — ดู reconcile ใน AppShell)
ALTER TABLE rooms ADD CONSTRAINT rooms_type_check
  CHECK (type = ANY (ARRAY['single'::text, 'double'::text, 'triple'::text]));

-- ── 1) คอลัมน์ writer_id (echo key; ข้าม event ที่ตัวเองเป็นคนเขียน) ──────────
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS writer_id TEXT;

-- ── 2) เปิด Realtime ให้ตาราง (idempotent DO block ตาม 003/006/…/016) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
  END IF;
END $$;

-- ── 3) ส่ง row เต็มมากับ event (UPDATE พก writer_id + deleted_at ครบ) ──
ALTER TABLE rooms REPLICA IDENTITY FULL;

-- ── 4) เปิด RLS anon กลับ (012 ปิด orphan rooms ไว้) — select + insert + update ──
--    ไม่มี hard delete action ในแอป (rooms ชุดคงที่) → ไม่เปิด delete policy
create policy "anon_select_rooms" on public.rooms for select to anon using (true);
create policy "anon_insert_rooms" on public.rooms for insert to anon with check (true);
create policy "anon_update_rooms" on public.rooms for update to anon using (true) with check (true);

-- ── 5) ใส่ FK maintenance_logs.room_id → rooms(id) กลับ (010 drop ไว้ตอน rooms ยัง blob/orphan) ──
--    rooms ย้ายมาเป็น table-authoritative แล้ว → ทุก maintenance_logs.room_id (รวม soft-deleted)
--    อ้าง room id ที่มีจริงในตาราง (verify แล้ว: 0 orphan) → เพิ่ม FK ได้ปลอดภัย
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'maintenance_logs_room_id_fkey'
      AND table_schema = 'public'
      AND table_name = 'maintenance_logs'
  ) THEN
    ALTER TABLE maintenance_logs
      ADD CONSTRAINT maintenance_logs_room_id_fkey
      FOREIGN KEY (room_id) REFERENCES rooms(id);
  END IF;
END $$;
