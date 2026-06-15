-- ============================================================
-- 007 — Storage bucket สำหรับรูปบิล/ใบเสร็จของรายจ่าย (expenses.receiptPath)
-- Pruksatara Park & Resort Hotel PMS
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → Run
--
-- เก็บไฟล์รูป/PDF ใน Storage (ไม่ฝังลง state blob) — record เก็บแค่ path
-- bucket = public (อ่านผ่าน getPublicUrl ได้เลย); upload/delete เปิดให้ anon (งานภายใน)
-- ============================================================

-- สร้าง bucket (public read). รันซ้ำได้ (on conflict do nothing)
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- อ่านไฟล์ (public bucket อ่านได้อยู่แล้ว แต่ใส่ policy ให้ชัด)
DROP POLICY IF EXISTS "anon read receipts" ON storage.objects;
CREATE POLICY "anon read receipts" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'receipts');

-- อัปโหลดไฟล์
DROP POLICY IF EXISTS "anon upload receipts" ON storage.objects;
CREATE POLICY "anon upload receipts" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'receipts');

-- ลบไฟล์ (ตอนลบรายจ่าย/เปลี่ยนรูป)
DROP POLICY IF EXISTS "anon delete receipts" ON storage.objects;
CREATE POLICY "anon delete receipts" ON storage.objects
  FOR DELETE TO anon USING (bucket_id = 'receipts');
