-- 024_rls_drop_anon.sql — Supabase Auth ขั้น E [DESTRUCTIVE — hardening จริง]
-- ⚠️⚠️ อย่ารันจนกว่าโค้ด Supabase Auth (022+023 + client) จะ deploy ขึ้น prod แล้ว
--    (prod เดิมยังเป็น anon — ถ้าลบ anon ก่อน deploy = prod อ่านตารางไม่ได้ = พังทันที)
-- ลำดับ deploy ที่ถูก: merge PR (code) → Vercel deploy → login prod ผ่าน (authenticated) → ค่อยรันไฟล์นี้
--
-- ลบ role `anon` ออกจากทุก policy (เหลือเฉพาะ `authenticated`) = ปิดช่อง
-- "ใครมี public/anon key ก็อ่าน/เขียนตารางได้" สนิท (residual risk สุดท้ายหลัง retire blob)
-- 023 ตั้งทุก policy เป็น {anon, authenticated} ไว้แล้ว → ไฟล์นี้ถอด anon ออก
-- รันผ่าน MCP execute_sql

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage') AND 'anon' = ANY(roles)
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated',
                   p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- verify (ควรได้ 0): policy ที่ยังมี anon
-- SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','storage') AND 'anon' = ANY(roles);
