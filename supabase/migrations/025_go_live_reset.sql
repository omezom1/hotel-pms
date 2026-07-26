-- 025_go_live_reset.sql — "เริ่มใช้งานจริง" (go-live): ล้างข้อมูลตัวอย่างออกจากฐานข้อมูล
--
-- ⚠️⚠️ สคริปต์นี้ลบข้อมูลถาวร (hard delete) และ **ไม่ใช่ migration ที่รันอัตโนมัติ**
--     รันครั้งเดียวตอนตัดสินใจเริ่มใช้งานจริงเท่านั้น หลังจากนั้นข้อมูลที่เข้ามาคือของจริงทั้งหมด
--     ⛔ ห้ามรันบนระบบที่ใช้งานจริงแล้ว — ข้อมูลแขก/การจอง/บิล/รายรับรายจ่ายจะหายทั้งหมด
--
-- 📌 ก่อนรัน: กด "สำรองข้อมูล (Backup)" ในแอป 1 ครั้ง (ได้ไฟล์ .json ไว้เป็นหลักฐานข้อมูลชุดเดโม)
-- 📌 หลังรัน: ให้ทุกเครื่องที่เปิดแอปค้างไว้ refresh (ระบบ realtime จะยังไม่ล้าง state เก่าให้เอง)
--
-- ── ล้าง (ข้อมูลเดโม/ธุรกรรม) ─────────────────────────────────────────
--   bookings · invoices · booking_add_ons · housekeeping_tasks · maintenance_logs
--   guests · expenses · inventory_transactions · corporate_accounts + corporate_transactions
--   audit_logs (ประวัติการใช้งานช่วงพัฒนา)
-- ── เก็บไว้ (ผังโรงแรม/ค่าตั้งต้น) ───────────────────────────────────
--   rooms (คืนสถานะเป็น "ว่าง" ทุกห้อง) · staff · users (บัญชีล็อกอิน)
--   add_on_items (แคตตาล็อกบริการเสริม) · dynamic_pricing (ช่วงราคา)
--   inventory_items (รายการสต็อก — ยอดคงเหลือคงเดิม ให้ไปนับสต็อกจริงแล้ว "ปรับสต็อก" ในแอป
--                    เพื่อให้ยอดตั้งต้นมีที่มาในบัญชีเคลื่อนไหว)

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

-- 4) งานซ่อม/รายจ่าย/บัญชีเคลื่อนไหวสต็อก (อ้าง rooms/inventory_items ที่เก็บไว้)
DELETE FROM maintenance_logs;
DELETE FROM expenses;
DELETE FROM inventory_transactions;

-- 5) ประวัติการใช้งานช่วงพัฒนา
DELETE FROM audit_logs;

-- 6) คืนห้องทุกห้องเป็น "ว่าง" + ล้าง pointer ที่ชี้การจอง/แขกที่ถูกลบไปแล้ว
--    (ห้องที่ต้องปิดจริง เช่น ห้องเจ้าของ ให้ไปกด "ปิดปรับปรุง" ในแอปหลังเริ่มใช้งาน
--     จะได้มีเหตุผล + audit ตั้งแต่แถวแรก)
UPDATE rooms SET status = 'available', current_booking_id = NULL, current_guest_id = NULL;

-- 7) ตรวจผลก่อน COMMIT — ทุกตารางในกลุ่ม "ล้าง" ต้องเป็น 0, กลุ่ม "เก็บ" ต้องเท่าเดิม
SELECT 'bookings' t, count(*) FROM bookings
UNION ALL SELECT 'invoices', count(*) FROM invoices
UNION ALL SELECT 'booking_add_ons', count(*) FROM booking_add_ons
UNION ALL SELECT 'housekeeping_tasks', count(*) FROM housekeeping_tasks
UNION ALL SELECT 'maintenance_logs', count(*) FROM maintenance_logs
UNION ALL SELECT 'guests', count(*) FROM guests
UNION ALL SELECT 'expenses', count(*) FROM expenses
UNION ALL SELECT 'inventory_transactions', count(*) FROM inventory_transactions
UNION ALL SELECT 'corporate_accounts', count(*) FROM corporate_accounts
UNION ALL SELECT 'corporate_transactions', count(*) FROM corporate_transactions
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
UNION ALL SELECT '— keep: rooms (available)', count(*) FROM rooms WHERE status = 'available' AND deleted_at IS NULL
UNION ALL SELECT '— keep: staff', count(*) FROM staff WHERE deleted_at IS NULL
UNION ALL SELECT '— keep: users', count(*) FROM users WHERE deleted_at IS NULL
UNION ALL SELECT '— keep: add_on_items', count(*) FROM add_on_items WHERE deleted_at IS NULL
UNION ALL SELECT '— keep: inventory_items', count(*) FROM inventory_items WHERE deleted_at IS NULL
UNION ALL SELECT '— keep: dynamic_pricing', count(*) FROM dynamic_pricing WHERE deleted_at IS NULL;

COMMIT;

-- หมายเหตุ app_state: ไม่ต้องแตะ — retire blob แล้ว (data.state = {}) เหลือเป็นซองสำหรับ
-- hydration gate / version CAS / realtime เท่านั้น ไม่มีข้อมูลธุรกิจค้างอยู่
