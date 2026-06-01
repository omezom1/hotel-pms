-- ============================================================
-- Optimistic concurrency ให้ app_state — Pruksatara Park & Resort
-- เพิ่มคอลัมน์ version สำหรับ compare-and-swap (CAS)
-- กัน last-write-wins: 2 แท็บ/เครื่องเขียนพร้อมกัน อันหลังจะถูก reject
-- แล้ว client ดึงล่าสุดมา merge แบบ union-by-id ก่อนเขียนซ้ำ (งานไม่หาย)
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → Run
-- ============================================================

alter table app_state
  add column if not exists version bigint not null default 0;

-- replica identity full (migration 003) ส่ง row เต็มมากับ event อยู่แล้ว
-- → payload.new.version จะติดมาด้วย ไม่ต้องตั้งค่าเพิ่ม
