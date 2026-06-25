-- 015_users_realtime.sql — Tier B (users cutover)
-- users = mutable CRUD (add/update/delete=soft-delete) + login อ่าน slice นี้; แพทเทิร์น staff
-- ไม่มี role column (role มาจาก staff ที่ผูกผ่าน staff_id; User type ไม่มี role)
-- FK `users.staff_id→staff` = ฝั่ง child; staff ย้ายแล้ว (014) → parent มีครบ upsert ไม่ละเมิด
-- ⚠️ password: ตาราง relational มี bcrypt hash อยู่แล้ว แต่ blob (v21) ถูก reset เป็น plaintext
--    → reconnnile ฝั่ง AppShell รักษา hash ในตารางไว้ (ไม่ downgrade) ไม่ใช่เขียน blob ทับตรง ๆ
-- รันผ่าน MCP execute_sql (management creds รัน DDL ได้)

-- ── 1) คอลัมน์ writer_id (echo key; ข้าม event ที่ตัวเองเป็นคนเขียน) ──────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS writer_id TEXT;

-- ── 2) เปิด Realtime ให้ตาราง (idempotent DO block ตาม 003/006/008/009/010/011/013/014) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE users;
  END IF;
END $$;

-- ── 3) ส่ง row เต็มมากับ event (UPDATE/DELETE พก writer_id + deleted_at ครบ) ──
ALTER TABLE users REPLICA IDENTITY FULL;

-- ── 4) เปิด RLS anon กลับ (012 ปิด orphan users ไว้) — select + insert + update ──
--    soft-delete = update; ไม่มี hard delete (แพทเทิร์น active-table ใน 012)
DROP POLICY IF EXISTS "anon_select_users" ON public.users;
DROP POLICY IF EXISTS "anon_insert_users" ON public.users;
DROP POLICY IF EXISTS "anon_update_users" ON public.users;
CREATE POLICY "anon_select_users" ON public.users FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_users" ON public.users FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_users" ON public.users FOR UPDATE TO anon USING (true) WITH CHECK (true);
