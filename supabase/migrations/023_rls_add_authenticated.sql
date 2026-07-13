-- 023_rls_add_authenticated.sql — Supabase Auth ขั้น B [ADDITIVE, prod-safe]
-- เพิ่ม role `authenticated` เข้าทุก policy ที่มีอยู่ (เดิม TO anon) → เป็น TO anon, authenticated
-- = client ที่ login แล้ว (authenticated JWT) อ่าน/เขียนตารางได้ผ่าน policy เดิม
-- ยัง additive: prod เดิม (anon) ทำงานต่อได้จน "ขั้น E" (024) ลบ anon ออก = hardening จริง
-- ครอบ public (18 ตาราง incl app_state) + storage (receipts bucket 3 policy)
-- รันผ่าน MCP execute_sql

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO anon, authenticated',
                   p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;
