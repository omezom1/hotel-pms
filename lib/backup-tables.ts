// รายชื่อตารางที่สำรอง — เรียงตามลำดับ "พ่อแม่ก่อนลูก" (FK-safe) สำหรับตอน insert กลับ
// กู้คืน = ลบย้อนลำดับนี้ (ลูกก่อน) แล้วค่อย insert ตามลำดับนี้
//
// ลำดับอ้างจาก FK จริงใน 001_initial_schema.sql (บวก FK ที่ถูกถอดทีหลัง):
//   users→staff · add_on_items→inventory_items · inventory_transactions→inventory_items
//   bookings→rooms,guests,corporate_accounts · invoices→bookings,guests
//   housekeeping_tasks→rooms(,bookings) · booking_add_ons→bookings,add_on_items
//   corporate_transactions→corporate_accounts (FK ไป bookings/invoices ถูก DROP ใน 016)
//   maintenance_logs: FK room_id ถูก DROP ใน 010
//
// ⚠️ ไม่รวม `app_state` โดยตั้งใจ — หลัง retire blob มันคือซองเปล่า (`{}`) ที่เก็บแค่ตัวนับ version
//    ไว้ให้ hydration-gate/CAS/realtime ใช้ ไม่มีข้อมูลธุรกิจ และการเขียนทับ version เก่ากลับไป
//    จะทำให้แท็บที่เปิดอยู่สับสน
export const BACKUP_TABLES = [
  // ชั้น 1 — ไม่อ้างใคร
  'rooms',
  'staff',
  'guests',
  'corporate_accounts',
  'inventory_items',
  'dynamic_pricing',
  'expenses',
  'audit_logs',
  'maintenance_logs',
  // ชั้น 2 — อ้างชั้น 1
  'users',
  'add_on_items',
  'inventory_transactions',
  'bookings',
  // ชั้น 3 — อ้าง bookings
  'invoices',
  'housekeeping_tasks',
  'booking_add_ons',
  'corporate_transactions',
] as const

export type BackupTable = (typeof BACKUP_TABLES)[number]

export const BACKUP_BUCKET = 'backups'
// เก็บสำเนาย้อนหลังกี่วัน (Supabase Pro ให้ 7 วัน — ของเราตั้งเองได้ยาวกว่า)
export const BACKUP_RETENTION_DAYS = 30

// รูปแบบไฟล์: hotel-pms-YYYY-MM-DD.json (วันละไฟล์ รันซ้ำวันเดิม = ทับไฟล์เดิม)
export const BACKUP_FILE_PREFIX = 'hotel-pms-'

// ตั้งชื่อไฟล์ตาม "วันที่ในไทย" ไม่ใช่ UTC — cron รันตี 3 ไทย ซึ่งยังเป็นเมื่อวานตามเวลา UTC
// ถ้าใช้ UTC ชื่อไฟล์จะเลื่อนไปหนึ่งวันจนคนอ่านสับสนว่าสำเนานี้คือของวันไหน
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

export function backupFileName(d: Date): string {
  const local = new Date(d.getTime() + BANGKOK_OFFSET_MS)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${BACKUP_FILE_PREFIX}${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}.json`
}
