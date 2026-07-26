-- 025_go_live_reset.sql — "เริ่มใช้งานจริง" (go-live): ล้างข้อมูลตัวอย่างออกจากฐานข้อมูล
--
-- ⚠️⚠️ สคริปต์นี้ลบข้อมูลถาวร (hard delete) และ **ไม่ใช่ migration ที่รันอัตโนมัติ**
--     รันครั้งเดียวในวันที่ตัดสินใจเริ่มใช้งานจริงเท่านั้น หลังจากนั้นข้อมูลที่เข้ามาคือของจริงทั้งหมด
--     ⛔ ห้ามรันซ้ำหลังเริ่มใช้งานแล้ว — ข้อมูลแขก/การจอง/บิล/รายรับรายจ่ายจะหายทั้งหมด
--
-- 📌 ก่อนรัน: กด "ดาวน์โหลดข้อมูล (.json)" ในแอป 1 ครั้ง (เก็บสำเนาข้อมูลชุดเดโมไว้)
-- 📌 หลังรัน: ให้ทุกเครื่องที่เปิดแอปค้างไว้ refresh (แท็บที่เปิดอยู่ยังถือ state เก่า)
--
-- ── เก็บไว้ ────────────────────────────────────────────────────────
--   rooms (คืนสถานะเป็น "ว่าง" ทุกห้อง) · staff · users (บัญชีล็อกอิน)
--   add_on_items เฉพาะ "ที่นอนเสริม" (ตามที่เลือกไว้ — ดูขั้นที่ 6 ถ้าจะเก็บรายการอื่นด้วย)
-- ── ล้างทั้งหมด ───────────────────────────────────────────────────
--   bookings · invoices · booking_add_ons · housekeeping_tasks · maintenance_logs · guests
--   expenses · inventory_items + inventory_transactions · corporate_accounts + corporate_transactions
--   dynamic_pricing (ช่วงราคาตัวอย่าง — ตั้งใหม่เองในแอป) · audit_logs (ประวัติช่วงพัฒนา)

BEGIN;

-- 1) ลูก ๆ ที่อ้าง bookings ก่อน (FK)
DELETE FROM booking_add_ons;
DELETE FROM invoices;
DELETE FROM housekeeping_tasks;

-- 2) corporate: transactions อ้าง accounts (+ เคยอ้าง bookings)
DELETE FROM corporate_transactions;
DELETE FROM corporate_accounts;

-- 3) bookings แล้วค่อย guests (bookings.guest_id → guests)
DELETE FROM bookings;
DELETE FROM guests;

-- 4) งานซ่อม / รายจ่าย
DELETE FROM maintenance_logs;
DELETE FROM expenses;

-- 5) สต็อก: ล้างทั้งบัญชีเคลื่อนไหวและรายการสินค้า (ของตัวอย่างทั้งชุด — เพิ่มของจริงเองในหน้าคลังสินค้า)
DELETE FROM inventory_transactions;
DELETE FROM inventory_items;

-- 6) แคตตาล็อกบริการเสริม: เก็บเฉพาะ "ที่นอนเสริม"
--    (ยังไม่มีหน้าจัดการแคตตาล็อกในแอป — ถ้าจะเก็บรายการอื่นด้วย ให้เพิ่มชื่อในลิสต์นี้ก่อนรัน
--     ตัวเลือกทั้งหมด: ที่นอนเสริม, หมอนเพิ่ม, ผ้าเช็ดตัวเพิ่ม, ชุดสบู่+แชมพูเพิ่ม,
--                      น้ำดื่มเพิ่ม 6 ขวด, Late Check-out, Early Check-in)
DELETE FROM add_on_items WHERE name NOT IN ('ที่นอนเสริม');
--    รายการที่เหลือเคยผูกกับสินค้าในสต็อกที่เพิ่งลบไป → ตัดการผูกทิ้ง (ผูกใหม่ได้เมื่อมีสินค้าจริง)
UPDATE add_on_items SET inventory_item_id = NULL WHERE inventory_item_id IS NOT NULL;

-- 7) ช่วงราคาตามฤดูกาลตัวอย่าง (ตั้งใหม่ในหน้า จัดการห้องพัก → Dynamic Pricing)
DELETE FROM dynamic_pricing;

-- 8) ประวัติการใช้งานช่วงพัฒนา
DELETE FROM audit_logs;

-- 9) คืนห้องทุกห้องเป็น "ว่าง" + ล้าง pointer ที่ชี้การจอง/แขกที่ถูกลบไปแล้ว
--    (ห้องที่ต้องปิดจริง เช่น ห้องเจ้าของ ให้ไปกด "ปิดปรับปรุง" ในแอปหลังเริ่มใช้งาน
--     จะได้มีเหตุผล + audit ตั้งแต่แถวแรก)
UPDATE rooms SET status = 'available', current_booking_id = NULL, current_guest_id = NULL;

-- 10) ตรวจผลก่อน COMMIT — กลุ่ม "ล้าง" ต้องเป็น 0 ทั้งหมด, กลุ่ม "เก็บ" ต้องเท่าเดิม
SELECT 'bookings' t, count(*) FROM bookings
UNION ALL SELECT 'invoices', count(*) FROM invoices
UNION ALL SELECT 'booking_add_ons', count(*) FROM booking_add_ons
UNION ALL SELECT 'housekeeping_tasks', count(*) FROM housekeeping_tasks
UNION ALL SELECT 'maintenance_logs', count(*) FROM maintenance_logs
UNION ALL SELECT 'guests', count(*) FROM guests
UNION ALL SELECT 'expenses', count(*) FROM expenses
UNION ALL SELECT 'inventory_items', count(*) FROM inventory_items
UNION ALL SELECT 'inventory_transactions', count(*) FROM inventory_transactions
UNION ALL SELECT 'corporate_accounts', count(*) FROM corporate_accounts
UNION ALL SELECT 'corporate_transactions', count(*) FROM corporate_transactions
UNION ALL SELECT 'dynamic_pricing', count(*) FROM dynamic_pricing
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
UNION ALL SELECT '— keep: rooms (available)', count(*) FROM rooms WHERE status = 'available' AND deleted_at IS NULL
UNION ALL SELECT '— keep: staff', count(*) FROM staff WHERE deleted_at IS NULL
UNION ALL SELECT '— keep: users', count(*) FROM users WHERE deleted_at IS NULL
UNION ALL SELECT '— keep: add_on_items', count(*) FROM add_on_items WHERE deleted_at IS NULL;

COMMIT;

-- หมายเหตุ app_state: ไม่ต้องแตะ — retire blob แล้ว (data.state = {}) เหลือเป็นซองสำหรับ
-- hydration gate / version CAS / realtime เท่านั้น ไม่มีข้อมูลธุรกิจค้างอยู่
