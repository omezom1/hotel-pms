-- ============================================================
-- เปิด Realtime ให้ตาราง app_state — Pruksatara Park & Resort
-- เพื่อให้ทุกแท็บ/เครื่องที่เปิดอยู่ได้รับ event เมื่อ state เปลี่ยน
-- แล้ว sync ข้อมูลล่าสุดหากัน (ลดความเสี่ยง last-write-wins ข้อมูลหาย)
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- เพิ่มตารางเข้า publication ของ Realtime (กันรันซ้ำด้วย DO block)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table app_state;
  end if;
end $$;

-- ส่ง row เต็ม (รวม column ที่ไม่เปลี่ยน) มากับ event UPDATE
-- จำเป็นเพราะฝั่ง client อ่าน payload.new.data ทั้งก้อน
alter table app_state replica identity full;
