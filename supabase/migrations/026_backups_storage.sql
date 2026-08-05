-- ============================================================
-- 026 — Storage bucket สำหรับสำเนาข้อมูลอัตโนมัติ (daily backup)
-- Pruksatara Park & Resort Hotel PMS
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → Run
--
-- ทำไมต้องมี: free tier ไม่มี daily backup ให้ (Pro มี ย้อนหลัง 7 วัน) เราจึงดัมพ์เอง
-- ทุกคืนผ่าน Vercel Cron → /api/backup → เก็บไฟล์ JSON ไว้ที่นี่ (เก็บย้อนหลัง 30 วัน)
--
-- 🔒 bucket = private และ **ไม่มี policy ใด ๆ** โดยตั้งใจ
--    ไฟล์สำเนามีข้อมูลแขก/การเงินทั้งระบบในไฟล์เดียว — ใครที่ล็อกอินได้ไม่ควรโหลดได้ทุกคน
--    การเข้าถึงทั้งหมดวิ่งผ่าน /api/backup ซึ่งใช้ service_role (ข้าม RLS) หลังตรวจ canManageStaff
--    แล้วคืนเป็น signed URL อายุ 60 วินาที
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- กันพลาด: ถ้าเคยมี policy ของ bucket นี้หลงเหลือจากการทดลอง ให้ถอดออก
DROP POLICY IF EXISTS "anon read backups" ON storage.objects;
DROP POLICY IF EXISTS "authenticated read backups" ON storage.objects;

-- ตรวจผล: ควรได้ 1 แถว public=false และ 0 policy ที่อ้าง bucket 'backups'
-- SELECT id, public FROM storage.buckets WHERE id = 'backups';
-- SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND qual LIKE '%backups%';
