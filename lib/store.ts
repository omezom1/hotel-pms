'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabaseStorage, registerStateApplier, reportSaveError, applyRemoteState, CLIENT_ID } from './supabase-storage'
import { supabase } from './supabase'
import {
  rowToBooking, rowToInvoice, rowToBookingAddOn, rowToRoom, rowToGuest,
  rowToCorpAccount, rowToCorpTx, rowToHkTask, rowToInventoryItem, rowToInventoryTx,
} from './row-mappers'
import type {
  Room, Guest, Booking, Invoice, InvoiceItem, InvoiceStatus, HousekeepingTask,
  MaintenanceLog, Staff, StaffPermissions, RoomStatus, BookingStatus, HousekeepingStatus, MaintenanceStatus,
  InventoryItem, InventoryTransaction, CorporateAccount, CorporateTransaction,
  AddOnItem, BookingAddOn, AuditLog, AuditCategory, Expense, User, DynamicPricing
} from '@/types'
import { useAuthStore } from './auth-store'
import { addNightsISO, addOnCountsTowardCharge, calcAddOnTotal, calcBookingTotal, calcOutstanding, getRoomTypeLabel, roomHasConflict, todayLocal } from './utils'
import { hashPassword } from './auth-utils'
import {
  mockRooms, mockGuests, mockBookings, mockInvoices,
  mockHousekeepingTasks, mockMaintenanceLogs, mockStaff, mockUsers,
  mockInventoryItems, mockInventoryTransactions, mockCorporateAccounts, mockCorporateTransactions,
  mockAddOnItems, mockBookingAddOns, mockExpenses, mockDynamicPricing, shiftMockDates
} from './mock-data'

// Defense-in-depth: ตรวจสิทธิ์ระดับ store action กันเลี่ยงผ่าน UI (เช่นเรียกตรงจาก devtools).
// หมายเหตุ: ยังไม่ใช่ security boundary จริง — boundary จริงต้องบังคับที่ DB (Supabase Auth + RLS per-role).
// hasPermission คืน false เมื่อไม่มีผู้ใช้ล็อกอิน → ปลอดภัยโดย default
function hasPerm(key: keyof StaffPermissions): boolean {
  try { return useAuthStore.getState().hasPermission(key) } catch { return false }
}

// id ทุกตัวที่เขียนขึ้นตาราง relational ต้องมี random suffix — Date.now() ล้วนชนกันได้เมื่อ
// สองแท็บ/สอง action ยิงในมิลลิวินาทีเดียว แล้วแถวที่ id ซ้ำจะหายเงียบ (insert 23505 ถูกมองเป็น
// idempotent echo) หรือทำ RPC ทั้งก้อน abort (Tier C C3)
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// dual-write helper: รายงาน error ของการเขียนตาราง expenses (relational migration Tier A)
// 23505 = PK ซ้ำ (echo/retry) → idempotent ไม่ถือเป็นความผิดพลาด; อื่น ๆ เตือนผู้ใช้
function reportExpenseError({ error }: { error: { code?: string; message: string } | null }) {
  if (error && error.code !== '23505') reportSaveError('expense write', error.message)
}

// dual-write helpers สำหรับ inventory (Tier A) — 2 entity:
//   inventory_items        = mutable (add/update/soft-delete + currentStock เปลี่ยนตลอด)
//   inventory_transactions = append-only ledger (restock/use/adjust/waste) เหมือน audit_logs
// 23505 = PK ซ้ำ (echo/retry) → idempotent; อื่น ๆ เตือนผู้ใช้
function reportInventoryError({ error }: { error: { code?: string; message: string } | null }) {
  if (error && error.code !== '23505') reportSaveError('inventory write', error.message)
}

// แปลง InventoryItem → row (snake_case) สำหรับ insert (+ writer_id echo key)
function inventoryItemRow(item: InventoryItem) {
  return {
    id: item.id, name: item.name, category: item.category, unit: item.unit,
    current_stock: item.currentStock, min_stock: item.minStock, max_stock: item.maxStock,
    cost_per_unit: item.costPerUnit, supplier: item.supplier ?? null,
    last_restocked: item.lastRestocked, notes: item.notes ?? null, writer_id: CLIENT_ID,
  }
}

// อัปเดต currentStock (+ last_restocked เมื่อ restock) ของ item ขึ้นตาราง — ใช้โดยทุก stock-movement
function pushInventoryStock(itemId: string, currentStock: number, lastRestocked?: string) {
  const patch: Record<string, unknown> = { current_stock: currentStock, writer_id: CLIENT_ID }
  if (lastRestocked !== undefined) patch.last_restocked = lastRestocked
  void supabase.from('inventory_items').update(patch).eq('id', itemId).then(reportInventoryError)
}

// insert แถว ledger ขึ้นตาราง inventory_transactions (append-only)
function pushInventoryTx(tx: InventoryTransaction) {
  void supabase.from('inventory_transactions').insert({
    id: tx.id, item_id: tx.itemId, type: tx.type, quantity: tx.quantity,
    reference_id: tx.referenceId ?? null, performed_by: tx.performedBy, date: tx.date,
    notes: tx.notes ?? null, writer_id: CLIENT_ID,
  }).then(reportInventoryError)
}

// dual-write helper สำหรับ maintenance_logs (Tier A) — mutable + soft-delete (แพทเทิร์น expenses)
// 23505 = PK ซ้ำ (echo/retry) → idempotent; อื่น ๆ เตือนผู้ใช้
function reportMaintenanceError({ error }: { error: { code?: string; message: string } | null }) {
  if (error && error.code !== '23505') reportSaveError('maintenance write', error.message)
}

// แปลง MaintenanceLog → row (snake_case) สำหรับ insert/upsert (+ writer_id echo key)
function maintLogRow(log: MaintenanceLog) {
  return {
    id: log.id, room_id: log.roomId, room_number: log.roomNumber,
    issue: log.issue, description: log.description, status: log.status,
    priority: log.priority, reported_by: log.reportedBy, reported_at: log.reportedAt,
    assigned_to: log.assignedTo ?? null, resolved_at: log.resolvedAt ?? null,
    cost: log.cost ?? null, writer_id: CLIENT_ID,
  }
}

// dual-write helper สำหรับ guests (Tier B) — mutable + side-effect totalStays/totalSpend ตอนเช็คเอาต์
// 23505 = PK ซ้ำ (echo/retry) → idempotent; อื่น ๆ เตือนผู้ใช้
function reportGuestError({ error }: { error: { code?: string; message: string } | null }) {
  if (error && error.code !== '23505') reportSaveError('guest write', error.message)
}

// แปลง Guest → row (snake_case) สำหรับ insert (+ writer_id echo key)
function guestRow(g: Guest) {
  return {
    id: g.id, name: g.name, email: g.email, phone: g.phone,
    nationality: g.nationality, id_number: g.idNumber, preferences: g.preferences,
    total_stays: g.totalStays, total_spend: g.totalSpend, joined_at: g.joinedAt,
    writer_id: CLIENT_ID,
  }
}

// dual-write helper สำหรับ staff (Tier B) — mutable + soft-delete (แพทเทิร์น expenses/maintenance)
// 23505 = PK ซ้ำ (echo/retry) → idempotent; อื่น ๆ เตือนผู้ใช้
function reportStaffError({ error }: { error: { code?: string; message: string } | null }) {
  if (error && error.code !== '23505') reportSaveError('staff write', error.message)
}

// แปลง Staff → row (snake_case) สำหรับ insert (+ writer_id echo key)
function staffRow(s: Staff) {
  return {
    id: s.id, name: s.name, role: s.role, email: s.email, phone: s.phone,
    avatar: s.avatar ?? null, permissions: s.permissions,
    hire_date: s.hireDate, is_active: s.isActive, writer_id: CLIENT_ID,
  }
}

// dual-write helper สำหรับ users (Tier B) — mutable CRUD + soft-delete; login อ่าน slice นี้
// 23505 = PK ซ้ำ (echo/retry) → idempotent; อื่น ๆ เตือนผู้ใช้
function reportUserError({ error }: { error: { code?: string; message: string } | null }) {
  if (error && error.code !== '23505') reportSaveError('user write', error.message)
}

// แปลง User → row (snake_case) สำหรับ insert (+ writer_id echo key). password เก็บเป็น bcrypt hash อยู่แล้ว
function userRow(u: User) {
  return {
    id: u.id, username: u.username, password: u.password,
    staff_id: u.staffId, last_login: u.lastLogin ?? null, writer_id: CLIENT_ID,
  }
}

// dual-write helper สำหรับ dynamic_pricing (Phase 4 retire-blob, slice สุดท้าย) — mutable CRUD + soft-delete
// 23505 = PK ซ้ำ (echo/retry) → idempotent; อื่น ๆ เตือนผู้ใช้
function reportPricingError({ error }: { error: { code?: string; message: string } | null }) {
  if (error && error.code !== '23505') reportSaveError('pricing rule write', error.message)
}

// แปลง DynamicPricing → row (snake_case) สำหรับ insert (+ writer_id echo key)
function pricingRuleRow(d: DynamicPricing) {
  return {
    id: d.id, room_type: d.roomType, name: d.name,
    start_date: d.startDate, end_date: d.endDate, price: d.price,
    description: d.description ?? null, writer_id: CLIENT_ID,
  }
}

// dual-write helpers สำหรับ corporate (Tier B) — accounts = mutable+soft-delete, transactions = append-only ledger
// 23505 = PK ซ้ำ (echo/retry) → idempotent; อื่น ๆ เตือนผู้ใช้
function reportCorporateError({ error }: { error: { code?: string; message: string } | null }) {
  if (error && error.code !== '23505') reportSaveError('corporate write', error.message)
}
function corpAccountRow(a: CorporateAccount) {
  return {
    id: a.id, company_name: a.companyName, contact_person: a.contactPerson,
    contact_phone: a.contactPhone, contact_email: a.contactEmail,
    tax_id: a.taxId ?? null, address: a.address ?? null,
    total_deposited: a.totalDeposited, total_used: a.totalUsed,
    available_balance: a.availableBalance, status: a.status,
    notes: a.notes ?? null, writer_id: CLIENT_ID,
  }
}
function corpTxRow(t: CorporateTransaction) {
  return {
    id: t.id, corporate_account_id: t.corporateAccountId, type: t.type, amount: t.amount,
    balance_before: t.balanceBefore, balance_after: t.balanceAfter,
    booking_id: t.bookingId ?? null, invoice_id: t.invoiceId ?? null,
    performed_by: t.performedBy, date: t.date, notes: t.notes ?? null, writer_id: CLIENT_ID,
  }
}
// push account update (balance หรือ profile เปลี่ยน) → เขียน mutable fields ทั้งชุดทับด้วย id
function pushCorpAccount(a: CorporateAccount) {
  const { id, ...rest } = corpAccountRow(a)
  void supabase.from('corporate_accounts').update(rest).eq('id', id).then(reportCorporateError)
}
function pushCorpTx(t: CorporateTransaction) {
  void supabase.from('corporate_transactions').insert(corpTxRow(t)).then(reportCorporateError)
}

// dual-write helper สำหรับ rooms (Tier B ตัวสุดท้าย) — ไม่มี record CRUD ในแอป (ชุดคงที่จาก seed)
// เปลี่ยนเฉพาะ status + occupancy pointers (currentBookingId/currentGuestId) ผ่าน lifecycle ~10 จุด
// จับ id ห้องที่เปลี่ยนใน closure ของ set() → หลัง set() push ค่าจาก state ล่าสุด (แพทเทิร์น guestFx/corpFx)
// 23505 = PK ซ้ำ (echo/retry) → idempotent; อื่น ๆ เตือนผู้ใช้
function reportRoomError({ error }: { error: { code?: string; message: string } | null }) {
  if (error && error.code !== '23505') reportSaveError('room write', error.message)
}
// dual-write เฉพาะ status + occupancy pointers ของห้องที่เปลี่ยน (static fields ไม่เคยเปลี่ยนหลัง reconcile)
function pushRooms(rooms: Room[]) {
  for (const r of rooms) {
    void supabase.from('rooms').update({
      status: r.status,
      current_booking_id: r.currentBookingId ?? null,
      current_guest_id: r.currentGuestId ?? null,
      writer_id: CLIENT_ID,
    }).eq('id', r.id).then(reportRoomError)
  }
}

// dual-write helper สำหรับ housekeeping_tasks (Tier C kickoff) — mutable + soft-delete (แพทเทิร์น guests/staff)
// ถูกสร้างเป็น side-effect ใน checkout/cancel/move (จับ hkFx) + แก้โดย add/updateTaskStatus
// 23505 = PK ซ้ำ (echo/retry) → idempotent; อื่น ๆ เตือนผู้ใช้
function reportHkError({ error }: { error: { code?: string; message: string } | null }) {
  if (error && error.code !== '23505') reportSaveError('housekeeping write', error.message)
}
// แปลง HousekeepingTask → row (snake_case) เต็มชุด สำหรับ insert (+ writer_id echo key)
function hkTaskRow(t: HousekeepingTask) {
  return {
    id: t.id, room_id: t.roomId, room_number: t.roomNumber,
    assigned_to: t.assignedTo, staff_id: t.staffId, status: t.status,
    priority: t.priority, notes: t.notes, scheduled_at: t.scheduledAt,
    started_at: t.startedAt ?? null, completed_at: t.completedAt ?? null,
    writer_id: CLIENT_ID,
  }
}

// dual-write helpers สำหรับ bookings cluster (Tier C Phase C2) — 3 entity ที่ FK ผูกกันแน่น:
//   bookings        = hub (payments ฝังเป็น jsonb ใน row; walk-in ใช้ guest_snapshot ไม่มี guest_id)
//   invoices        = สร้างตอนเช็คเอาต์ + เปลี่ยนเป็น refunded ตอนยกเลิก
//   booking_add_ons = lifecycle requested→fulfilled/cancelled
// ยังเป็น dual-write best-effort (ไม่ atomic — C3 จะยกเป็น RPC); blob เป็น safety net ระหว่างนี้
// 23505 = PK ซ้ำ (echo/retry) → idempotent; อื่น ๆ เตือนผู้ใช้
function reportBookingError({ error }: { error: { code?: string; message: string } | null }) {
  if (error && error.code !== '23505') reportSaveError('booking write', error.message)
}
// แปลง Booking → row (snake_case) เต็มชุด สำหรับ insert (+ writer_id echo key)
function bookingRow(b: Booking) {
  return {
    id: b.id, room_id: b.roomId, room_type_at_booking: b.roomTypeAtBooking ?? null,
    guest_id: b.guestId ?? null, guest_snapshot: b.guestSnapshot ?? null,
    check_in: b.checkIn, check_out: b.checkOut, nights: b.nights,
    status: b.status, source: b.source,
    total_amount: b.totalAmount, paid_amount: b.paidAmount,
    adults: b.adults, children: b.children, special_requests: b.specialRequests,
    payment_method: b.paymentMethod ?? null,
    corporate_account_id: b.corporateAccountId ?? null,
    is_corporate: b.isCorporate ?? false,
    payments: b.payments ?? [], created_at: b.createdAt, writer_id: CLIENT_ID,
  }
}
// push booking ที่เปลี่ยนขึ้นตาราง — เขียน mutable fields ทั้งชุดทับด้วย id (แพทเทิร์น pushCorpAccount)
// booking ถูกแก้หลายฟิลด์พร้อมกันในหลาย action (status/paid/payments/checkOut/roomId)
// → อ่านค่าจาก state ล่าสุดหลัง set() แล้วเขียนทับทั้งแถว ปลอดภัยกว่า patch รายฟิลด์
function pushBooking(b: Booking) {
  const { id, created_at: _created, ...rest } = bookingRow(b)
  void supabase.from('bookings').update(rest).eq('id', id).then(reportBookingError)
}
// (invoice เขียนผ่าน RPC check_out_booking/cancel_booking เท่านั้นแล้ว — Tier C C3)
function reportAddOnError({ error }: { error: { code?: string; message: string } | null }) {
  if (error && error.code !== '23505') reportSaveError('booking add-on write', error.message)
}
// แปลง BookingAddOn → row (snake_case) สำหรับ insert (+ writer_id echo key)
function bookingAddOnRow(a: BookingAddOn) {
  return {
    id: a.id, booking_id: a.bookingId, add_on_item_id: a.addOnItemId,
    quantity: a.quantity, unit_price: a.unitPrice, total_price: a.totalPrice,
    status: a.status, requested_at: a.requestedAt, requested_by: a.requestedBy,
    fulfilled_at: a.fulfilledAt ?? null, fulfilled_by: a.fulfilledBy ?? null,
    notes: a.notes ?? null, writer_id: CLIENT_ID,
  }
}

// ═══════════ Tier C C3 — RPC atomicity (DDL 020) ═══════════
// multi-entity money actions (create/checkout/cancel/move/pay/fulfill/cancel-addon/extend/adjust)
// เปลี่ยนจาก "optimistic set() + dual-write หลายตาราง best-effort" → "optimistic set() + 1 RPC
// ที่เขียนทุกตาราง atomic ใน transaction เดียว":
// - happy path: id/timestamp ทุกตัว gen ที่ client ส่งเข้า RPC → แถวใน DB == optimistic state
//   แต่ RPC derive ยอดเงิน/บาลานซ์จาก live locked rows (กัน cross-tab race) แล้วคืน jsonb
//   ของทุกแถวที่เขียน → apply ทับ optimistic เผื่อค่า derive ต่างจากที่ client คิด (แผน C3 P1/P2;
//   จำเป็นเพราะ channel ของแท็บต้นทาง suppress echo ตัวเอง — realtime ไม่แก้ให้)
// - error (ROOM_CONFLICT/OVERPAYMENT/STALE_* จากอีกแท็บ): DB rollback ทั้ง tx เองอยู่แล้ว
//   ฝั่ง client "repair" = refetch แถวที่ optimistic แตะจากตารางจริงมาทับ (rollback optimistic จริง)
//   แถวที่ optimistic สร้างแต่ DB ไม่มี (invoice/HK/ledger ของ tx ที่ fail) จะถูกถอดออก + toast

type RepairSlice =
  | 'bookings' | 'invoices' | 'bookingAddOns' | 'rooms' | 'guests'
  | 'corporateAccounts' | 'corporateTransactions' | 'housekeepingTasks'
  | 'inventoryItems' | 'inventoryTransactions'

// ids ของแถวที่ optimistic set() แตะ (รวมที่เพิ่งสร้าง) — ใช้ refetch ตอน RPC fail
type RepairSpec = Partial<Record<RepairSlice, (string | undefined | null)[]>>

const repairMeta: Record<RepairSlice, {
  table: string
  map: (r: Record<string, unknown>) => { id: string }
  hasSoftDelete: boolean // ตารางมีคอลัมน์ deleted_at (ledger append-only ไม่มี)
}> = {
  bookings: { table: 'bookings', map: rowToBooking, hasSoftDelete: true },
  invoices: { table: 'invoices', map: rowToInvoice, hasSoftDelete: true },
  bookingAddOns: { table: 'booking_add_ons', map: rowToBookingAddOn, hasSoftDelete: true },
  rooms: { table: 'rooms', map: rowToRoom, hasSoftDelete: true },
  guests: { table: 'guests', map: rowToGuest, hasSoftDelete: true },
  corporateAccounts: { table: 'corporate_accounts', map: rowToCorpAccount, hasSoftDelete: true },
  corporateTransactions: { table: 'corporate_transactions', map: rowToCorpTx, hasSoftDelete: false },
  housekeepingTasks: { table: 'housekeeping_tasks', map: rowToHkTask, hasSoftDelete: true },
  inventoryItems: { table: 'inventory_items', map: rowToInventoryItem, hasSoftDelete: true },
  inventoryTransactions: { table: 'inventory_transactions', map: rowToInventoryTx, hasSoftDelete: false },
}

// upsert-by-id เข้า slice (แทนที่แถวเดิม in-place คงลำดับ; แถวใหม่ prepend ยกเว้น HK ที่แอป append)
// removeIds = แถวที่ optimistic สร้างแต่ DB ไม่มี → ถอดออก
function upsertSlice(slice: RepairSlice, rows: { id: string }[], removeIds: string[] = []) {
  if (!rows.length && !removeIds.length) return
  useHotelStore.setState((state) => {
    const cur = state[slice] as unknown as { id: string }[]
    const byId = new Map(rows.map((r) => [r.id, r]))
    let next = cur.map((x) => byId.get(x.id) ?? x)
    const have = new Set(next.map((x) => x.id))
    const extras = rows.filter((r) => !have.has(r.id))
    if (extras.length) next = slice === 'housekeepingTasks' ? [...next, ...extras] : [...extras, ...next]
    if (removeIds.length) {
      const rm = new Set(removeIds)
      next = next.filter((x) => !rm.has(x.id))
    }
    return { [slice]: next } as Partial<HotelStore>
  })
}

// key ใน jsonb ที่ RPC คืน → slice ปลายทาง (ค่า null = RPC ไม่ได้แตะ entity นั้น)
const rpcReturnKeys: { key: string; slice: RepairSlice; isArray?: boolean }[] = [
  { key: 'booking', slice: 'bookings' },
  { key: 'room', slice: 'rooms' },
  { key: 'oldRoom', slice: 'rooms' },
  { key: 'newRoom', slice: 'rooms' },
  { key: 'invoice', slice: 'invoices' },
  { key: 'invoices', slice: 'invoices', isArray: true },
  { key: 'guest', slice: 'guests' },
  { key: 'corpAccount', slice: 'corporateAccounts' },
  { key: 'corpTx', slice: 'corporateTransactions' },
  { key: 'hkTask', slice: 'housekeepingTasks' },
  { key: 'addOn', slice: 'bookingAddOns' },
  { key: 'inventoryItem', slice: 'inventoryItems' },
  { key: 'inventoryTx', slice: 'inventoryTransactions' },
]

// apply แถว authoritative ที่ RPC คืนมาทับ optimistic state (ครอบ applyRemoteState กันเขียน blob กลับ)
function applyRpcRows(data: unknown) {
  if (!data || typeof data !== 'object') return
  const obj = data as Record<string, unknown>
  applyRemoteState(() => {
    for (const { key, slice, isArray } of rpcReturnKeys) {
      const v = obj[key]
      if (v == null) continue
      const raw = isArray ? (v as unknown[]) : [v]
      const rows = raw
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map((r) => repairMeta[slice].map(r))
      if (rows.length) upsertSlice(slice, rows)
    }
  })
}

// RPC fail → refetch แถวที่ optimistic แตะจากตารางจริง (id ไหนไม่พบ = ถอดออกจาก state)
async function repairFromTables(spec: RepairSpec) {
  for (const [sliceKey, rawIds] of Object.entries(spec) as [RepairSlice, (string | undefined | null)[]][]) {
    const ids = Array.from(new Set(rawIds.filter((x): x is string => !!x)))
    if (!ids.length) continue
    const meta = repairMeta[sliceKey]
    let q = supabase.from(meta.table).select('*').in('id', ids)
    if (meta.hasSoftDelete) q = q.is('deleted_at', null)
    const { data, error } = await q
    if (error) {
      reportSaveError(`repair ${meta.table}`, error.message)
      continue
    }
    const rows = ((data ?? []) as Record<string, unknown>[]).map(meta.map)
    const found = new Set(rows.map((r) => r.id))
    const removeIds = ids.filter((id) => !found.has(id))
    applyRemoteState(() => upsertSlice(sliceKey, rows, removeIds))
  }
}

// ยิง RPC หลัง optimistic set() (background ไม่ await — action คง synchronous, UI ตอบทันที)
// success → apply แถว authoritative; error → repair (rollback optimistic) + toast ข้อความไทยจาก RPC
// opts.absentNull: แถวที่ client สร้าง optimistic แต่ RPC (จาก live data) ตัดสินใจไม่สร้าง
// (เช่น HK ข้ามเพราะห้องไปซ่อม / corp charge ไม่ผ่าน) → key นั้นคืน null = ถอด id ออกจาก state
function callRpc(
  name: string,
  params: Record<string, unknown>,
  repair: RepairSpec,
  opts?: { absentNull?: { key: string; slice: RepairSlice; id: string }[] },
) {
  void supabase.rpc(name, params).then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
    if (!error) {
      applyRpcRows(data)
      const obj = (data ?? {}) as Record<string, unknown>
      const drops = (opts?.absentNull ?? []).filter((a) => obj[a.key] == null)
      if (drops.length) {
        applyRemoteState(() => {
          for (const d of drops) upsertSlice(d.slice, [], [d.id])
        })
      }
      return
    }
    // error message รูปแบบ 'CODE|ข้อความไทย' (แผน C3 P5) → โชว์เฉพาะข้อความไทย
    const msg = error.message.includes('|')
      ? error.message.split('|').slice(1).join('|')
      : error.message
    reportSaveError(`rpc ${name}`, `${msg} — การเปลี่ยนแปลงถูกย้อนกลับ`)
    void repairFromTables(repair)
  })
}

interface HotelStore {
  rooms: Room[]
  guests: Guest[]
  bookings: Booking[]
  invoices: Invoice[]
  housekeepingTasks: HousekeepingTask[]
  maintenanceLogs: MaintenanceLog[]
  staff: Staff[]
  users: User[]
  inventoryItems: InventoryItem[]
  inventoryTransactions: InventoryTransaction[]
  corporateAccounts: CorporateAccount[]
  corporateTransactions: CorporateTransaction[]
  addOnItems: AddOnItem[]
  bookingAddOns: BookingAddOn[]
  expenses: Expense[]
  auditLogs: AuditLog[]
  dynamicPricing: DynamicPricing[]

  // Cloud hydration (Supabase storage โหลดแบบ async — ต้องรอให้เสร็จก่อนใช้งาน)
  _hasHydrated: boolean
  setHasHydrated: (v: boolean) => void

  logAudit: (entry: { category: AuditCategory; action: string; summary: string; entityId?: string }) => void

  // Expense actions
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => void
  updateExpense: (id: string, updates: Partial<Omit<Expense, 'id' | 'createdAt'>>) => void
  deleteExpense: (id: string) => void

  // User / account actions (บัญชีผู้ใช้เก็บบน cloud — login เช็คกับชุดนี้)
  addUser: (user: Omit<User, 'id'>) => { ok: boolean; error?: string }
  updateUser: (id: string, updates: Partial<Omit<User, 'id'>>) => { ok: boolean; error?: string }
  deleteUser: (id: string) => void
  recordLogin: (userId: string) => void

  // Staff actions
  addStaff: (staff: Omit<Staff, 'id'>) => string
  updateStaff: (id: string, updates: Partial<Omit<Staff, 'id'>>) => void
  deleteStaff: (id: string) => void

  // Room actions
  updateRoomStatus: (roomId: string, status: RoomStatus) => void

  // Booking actions
  createBooking: (booking: Omit<Booking, 'id' | 'createdAt'>) => { ok: boolean; error?: string }
  updateBookingStatus: (bookingId: string, status: BookingStatus) => void
  cancelBooking: (bookingId: string) => void
  updateBooking: (bookingId: string, updates: Partial<Pick<Booking, 'adults' | 'children' | 'source' | 'specialRequests' | 'paymentMethod'>>) => void
  extendBooking: (bookingId: string, additionalNights: number) => { ok: boolean; error?: string }
  moveBooking: (bookingId: string, newRoomId: string, reprice?: boolean) => { ok: boolean; error?: string }
  adjustForEarlyCheckout: (bookingId: string) => { ok: boolean; error?: string; newNights?: number; newTotal?: number; refunded?: number }

  // Data backup / restore
  exportData: () => Record<string, unknown>
  importData: (data: Record<string, unknown>) => void

  // Guest actions
  addGuest: (guest: Omit<Guest, 'id'>) => string
  updateGuest: (guestId: string, updates: Partial<Omit<Guest, 'id' | 'totalStays' | 'totalSpend' | 'joinedAt'>>) => void
  // Housekeeping actions
  addHousekeepingTask: (task: Omit<HousekeepingTask, 'id'>) => void
  updateTaskStatus: (taskId: string, status: HousekeepingStatus) => void

  // Maintenance actions
  addMaintenanceLog: (log: Omit<MaintenanceLog, 'id'>) => void
  updateMaintenanceStatus: (logId: string, status: MaintenanceStatus) => void
  removeMaintenanceLog: (logId: string) => void

  // Inventory actions
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => void
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => void
  deleteInventoryItem: (id: string, staffId: string, reason?: 'waste' | 'transfer' | 'discontinue') => void
  restockItem: (itemId: string, quantity: number, staffId: string, notes?: string) => void
  useInventoryItem: (itemId: string, quantity: number, staffId: string, referenceId?: string, notes?: string) => { ok: boolean; error?: string }
  adjustStock: (itemId: string, newQuantity: number, staffId: string, notes?: string) => void

  // Corporate account actions
  addCorporateAccount: (account: Omit<CorporateAccount, 'id' | 'totalDeposited' | 'totalUsed' | 'availableBalance' | 'createdAt'>) => void
  updateCorporateAccount: (id: string, updates: Partial<CorporateAccount>) => void
  depositToAccount: (accountId: string, amount: number, staffId: string, notes?: string) => void
  chargeAccount: (accountId: string, amount: number, staffId: string, bookingId?: string, notes?: string) => void
  refundToAccount: (accountId: string, amount: number, staffId: string, bookingId?: string, notes?: string) => void

  // Payment actions
  recordPayment: (bookingId: string, amount: number, method: string, staffId: string, notes?: string) => { ok: boolean; error?: string }

  // Add-on actions
  requestAddOn: (bookingId: string, addOnItemId: string, quantity: number, staffId: string, notes?: string) => { ok: boolean; error?: string }
  fulfillAddOn: (addOnId: string, staffId: string) => { ok: boolean; error?: string }
  cancelAddOn: (addOnId: string) => void

  // Seasonal/dynamic pricing actions (จัดการราคาตามช่วงวัน)
  addPricingRule: (rule: Omit<DynamicPricing, 'id'>) => { ok: boolean; error?: string }
  updatePricingRule: (id: string, updates: Partial<Omit<DynamicPricing, 'id'>>) => { ok: boolean; error?: string }
  deletePricingRule: (id: string) => void
}

export const useHotelStore = create<HotelStore>()(persist((set, get) => ({
  rooms: mockRooms,
  guests: mockGuests,
  // เลื่อนวันที่ของ seed ที่เกี่ยวกับกิจกรรมให้อิงวันนี้จริง (เดโมมีชีวิตทุกวัน)
  bookings: shiftMockDates(mockBookings),
  invoices: shiftMockDates(mockInvoices),
  housekeepingTasks: shiftMockDates(mockHousekeepingTasks),
  maintenanceLogs: shiftMockDates(mockMaintenanceLogs),
  staff: mockStaff,
  users: mockUsers,
  inventoryItems: shiftMockDates(mockInventoryItems),
  inventoryTransactions: shiftMockDates(mockInventoryTransactions),
  corporateAccounts: mockCorporateAccounts,
  corporateTransactions: shiftMockDates(mockCorporateTransactions),
  addOnItems: mockAddOnItems,
  bookingAddOns: shiftMockDates(mockBookingAddOns),
  expenses: shiftMockDates(mockExpenses),
  auditLogs: [],
  dynamicPricing: mockDynamicPricing,

  _hasHydrated: false,
  setHasHydrated: (v) => set({ _hasHydrated: v }),

  logAudit: ({ category, action, summary, entityId }) => {
    const u = useAuthStore.getState().user
    const entry: AuditLog = {
      id: `audit${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      staffId: u?.staff.id ?? 'system',
      staffName: u?.staff.name ?? 'ระบบ',
      category,
      action,
      summary,
      entityId,
    }
    set((state) => ({ auditLogs: [entry, ...state.auditLogs].slice(0, 500) }))
    // dual-write ขึ้นตาราง audit_logs (relational migration Phase 1, strangler)
    // blob ยังเป็นแหล่งจริงอยู่ → insert ที่ fail แค่ทำให้ตารางตกหล่น 1 แถว (rollback ฟรี)
    // แต่ "ห้าม fire-and-forget เงียบ" — ถ้าพังต้องเตือน (กันข้อมูลหายเงียบหลัง cutover)
    void supabase
      .from('audit_logs')
      .insert({
        id: entry.id,
        timestamp: entry.timestamp,
        staff_id: entry.staffId,
        staff_name: entry.staffName,
        category: entry.category,
        action: entry.action,
        summary: entry.summary,
        entity_id: entry.entityId ?? null,
        writer_id: CLIENT_ID,
      })
      .then(({ error }) => {
        // 23505 = PK ซ้ำ (id เดิมถูก insert ไปแล้วจาก echo/retry) → idempotent ไม่ใช่ความผิดพลาด
        if (error && error.code !== '23505') reportSaveError('audit insert', error.message)
      })
  },

  updateRoomStatus: (roomId, status) => {
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId ? { ...r, status } : r
      ),
    }))
    // dual-write status ห้องที่เปลี่ยน (Tier B) — อ่านจาก state ล่าสุดหลัง set()
    pushRooms(get().rooms.filter((r) => r.id === roomId))
  },

  createBooking: (bookingData) => {
    // ด่านสุดท้ายกันจองซ้ำ + กัน double-submit race: ตรวจ conflict และ insert ใน set() เดียว
    // (atomic) — ถ้าแยก get()→ตรวจ แล้วค่อย set() สอง submit เร็ว ๆ จะผ่าน conflict ทั้งคู่ = overbooking
    let result: { ok: true } | { ok: false; error: string } = { ok: true }
    let roomFx: string[] = [] // ห้องที่เปลี่ยน status → dual-write หลัง set() (Tier B)
    let bookingFx: Booking | null = null // booking ใหม่ → dual-write insert หลัง set() (Tier C C2)
    set((state) => {
      if (roomHasConflict(state.bookings, bookingData.roomId, bookingData.checkIn, bookingData.checkOut)) {
        result = { ok: false, error: 'ห้องนี้มีการจองอื่นทับช่วงวันที่เลือกแล้ว' }
        return {}
      }
      const now = new Date().toISOString()
      // id ผูก random กัน Date.now() ชนกันเมื่อสร้างสอง booking ในมิลลิวินาทีเดียว
      const uid = newId()
      const bookingId = `b${uid}`
      // ถ้าจ่ายเงินมาตั้งแต่ตอนสร้าง (walk-in หรือ confirmed ที่จ่ายเต็ม) → push เข้า payments[]
      const initialPayment: import('@/types').Payment | null = bookingData.paidAmount > 0
        ? {
            id: `pay${uid}`,
            amount: bookingData.paidAmount,
            method: bookingData.paymentMethod ?? 'cash',
            date: now,
            staffId: 'system',
            notes: bookingData.source === 'walk_in' ? 'ชำระตอน walk-in' : 'ชำระตอนสร้าง booking',
          }
        : null
      const newBooking: Booking = {
        ...bookingData,
        id: bookingId,
        createdAt: now,
        // ตรึงประเภทห้อง ณ เวลาจอง เพื่อให้รายงานรายได้ตามประเภทถูกแม้ย้ายห้องข้ามประเภทภายหลัง
        roomTypeAtBooking: state.rooms.find((r) => r.id === bookingData.roomId)?.type ?? bookingData.roomTypeAtBooking,
        payments: initialPayment ? [initialPayment] : undefined,
      }
      // ตั้งห้อง occupied เฉพาะเมื่อเป็น walk-in (checked_in ตั้งแต่สร้าง)
      const updatedRooms = bookingData.status === 'checked_in'
        ? state.rooms.map((r) =>
            r.id === bookingData.roomId
              ? { ...r, status: 'occupied' as RoomStatus, currentBookingId: newBooking.id, currentGuestId: bookingData.guestId }
              : r
          )
        : state.rooms
      if (bookingData.status === 'checked_in') roomFx = [bookingData.roomId]
      bookingFx = newBooking // → dual-write insert หลัง set() (Tier C C2)
      return {
        bookings: [newBooking, ...state.bookings],
        rooms: updatedRooms,
      }
    })
    // booking ใหม่ (+ห้อง occupied ถ้า walk-in) → RPC เดียว atomic: advisory lock ต่อห้อง
    // กัน phantom overbooking ข้ามแท็บ (conflict-check ใน set() กันได้แค่ในแท็บเดียว)
    const bfx = bookingFx as Booking | null
    if (bfx) {
      callRpc('create_booking_with_conflict_check',
        { p_booking: bookingRow(bfx), p_writer_id: CLIENT_ID },
        { bookings: [bfx.id], rooms: roomFx })
    }
    return result
  },

  updateBookingStatus: (bookingId, status) => {
    // gen timestamp/id ก่อน set() แล้วใช้ร่วมกันทั้ง optimistic state และ RPC params (Tier C C3)
    // → แถวที่ RPC เขียน == optimistic เป๊ะใน happy path; ส่ง id ครบทุกตัวแม้ client จะตัดสินใจ
    // ไม่สร้างบางแถว (เช่น corp charge) เพราะ RPC derive จาก live rows เองว่าจะสร้างหรือไม่
    const now = new Date().toISOString()
    const invoiceId = `inv${newId()}`
    const hkId = `hk${newId()}`
    const corpTxId = `ctx${newId()}`
    const corpPaymentId = `pay${newId()}`
    // อ่าน booking ก่อน set() ไว้ประกอบ repair spec (guestId/corporateAccountId ของแถวที่จะแตะ)
    const pre = get().bookings.find((b) => b.id === bookingId)
    // จับ corporate auto-charge ที่เกิดตอนเช็คเอาต์ เพื่อ log audit หลัง set() (เงินขยับต้องมีร่องรอย)
    let corpAudit: { amount: number; company: string } | null = null
    // จับ id ห้องที่เปลี่ยน status (เช็คอิน = dual-write ตรง; เช็คเอาต์ = repair spec ของ RPC)
    let roomFx: string[] = []
    // จับว่า booking row เปลี่ยนจริง (ผ่าน guard ทุกด่าน)
    let bookingTouched = false
    set((state) => {
      const booking = state.bookings.find((b) => b.id === bookingId)
      if (!booking) return {}
      // กัน double-action ถ้า status เดิมเท่ากับใหม่ ไม่ทำอะไร (กัน checkout ซ้ำ → invoice/HK/guest stats ซ้ำ)
      if (booking.status === status) return {}
      // ห้าม revive booking ที่ปิดแล้ว (cancelled / checked_out) กลับเป็น active
      if (['cancelled', 'checked_out'].includes(booking.status)) return {}
      // เช็คอินได้เฉพาะจาก confirmed/pending; เช็คเอาต์ได้เฉพาะจาก checked_in
      if (status === 'checked_in' && !['confirmed', 'pending'].includes(booking.status)) return {}
      if (status === 'checked_out' && booking.status !== 'checked_in') return {}

      let updatedBookings = state.bookings.map((b) =>
        b.id === bookingId ? { ...b, status } : b
      )

      // เช็คอิน → ห้องเป็น occupied + ผูก booking/guest กับห้อง
      if (status === 'checked_in') {
        const updatedRooms = state.rooms.map((r) =>
          r.id === booking.roomId
            ? {
                ...r,
                status: 'occupied' as RoomStatus,
                currentBookingId: booking.id,
                currentGuestId: booking.guestId,
              }
            : r
        )
        roomFx = [booking.roomId]
        bookingTouched = true
        return { bookings: updatedBookings, rooms: updatedRooms }
      }

      if (status !== 'checked_out') {
        bookingTouched = true
        return { bookings: updatedBookings }
      }

      const room = state.rooms.find((r) => r.id === booking.roomId)

      // 1) รวมยอด add-on ที่คิดเงิน (เฉพาะ fulfilled ตาม addOnCountsTowardCharge) เข้ายอดสุดท้าย
      //    ใช้เกณฑ์เดียวกับยอดค้าง/calcAddOnTotal เพื่อให้รายการในบิลตรงกับยอดรวมบิลเป๊ะ
      const chargeableAddOns = state.bookingAddOns.filter(
        (a) => a.bookingId === bookingId && addOnCountsTowardCharge(a.status)
      )
      const addOnTotal = calcAddOnTotal(bookingId, state.bookingAddOns)
      const combinedTotal = booking.totalAmount + addOnTotal
      const outstanding = combinedTotal - booking.paidAmount

      // 2) Corporate auto-charge (ถ้ามีเครดิตพอ)
      let updatedCorpAccounts = state.corporateAccounts
      let updatedCorpTx = state.corporateTransactions
      let newPaidAmount = booking.paidAmount
      let corpPayment: import('@/types').Payment | null = null

      if (booking.corporateAccountId && outstanding > 0) {
        const acc = state.corporateAccounts.find((a) => a.id === booking.corporateAccountId)
        if (acc && acc.availableBalance >= outstanding) {
          const corpTx: CorporateTransaction = {
            id: corpTxId,
            corporateAccountId: booking.corporateAccountId,
            type: 'charge',
            amount: outstanding,
            balanceBefore: acc.availableBalance,
            balanceAfter: acc.availableBalance - outstanding,
            bookingId,
            performedBy: 'system',
            date: now,
            notes: 'ตัดเครดิตอัตโนมัติเมื่อเช็คเอาต์',
          }
          const updatedAcc = {
            ...acc,
            totalUsed: acc.totalUsed + outstanding,
            availableBalance: acc.availableBalance - outstanding,
          }
          updatedCorpAccounts = state.corporateAccounts.map((a) =>
            a.id === booking.corporateAccountId ? updatedAcc : a
          )
          updatedCorpTx = [corpTx, ...state.corporateTransactions]
          newPaidAmount = combinedTotal
          corpPayment = {
            id: corpPaymentId,
            amount: outstanding,
            method: 'bank_transfer',
            date: now,
            staffId: 'system',
            notes: `ตัดเครดิตองค์กรอัตโนมัติ (${acc.companyName})`,
          }
          corpAudit = { amount: outstanding, company: acc.companyName }
        }
      }

      updatedBookings = updatedBookings.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              paidAmount: newPaidAmount,
              payments: corpPayment ? [...(b.payments ?? []), corpPayment] : b.payments,
            }
          : b
      )

      // 3) สร้าง Invoice อัตโนมัติ
      const items: InvoiceItem[] = [
        {
          description: `ค่าห้องพัก ห้อง ${room?.number ?? '-'} (${booking.nights} คืน)`,
          quantity: booking.nights,
          unitPrice: booking.nights > 0 ? booking.totalAmount / booking.nights : booking.totalAmount,
          total: booking.totalAmount,
        },
        ...chargeableAddOns.map((a) => {
          const item = state.addOnItems.find((i) => i.id === a.addOnItemId)
          return {
            description: `Add-on: ${item?.name ?? '-'}`,
            quantity: a.quantity,
            unitPrice: a.unitPrice,
            total: a.totalPrice,
          }
        }),
      ]
      const invoiceStatus: InvoiceStatus = newPaidAmount >= combinedTotal ? 'paid' : 'issued'
      const newInvoice: Invoice = {
        id: invoiceId,
        bookingId,
        guestId: booking.guestId,
        amount: combinedTotal,
        tax: 0,
        total: combinedTotal,
        status: invoiceStatus,
        issuedAt: now,
        paidAt: invoiceStatus === 'paid' ? now : undefined,
        paymentMethod: booking.paymentMethod,
        items,
      }

      // 4) ห้อง → cleaning (แต่ถ้ามีแจ้งซ่อมค้าง → maintenance: ห้องเสียห้ามขายต่อ)
      const hasOpenMaintenance = state.maintenanceLogs.some(
        (l) => l.roomId === booking.roomId && l.status !== 'resolved'
      )
      const updatedRooms = state.rooms.map((r) =>
        r.id === booking.roomId
          ? {
              ...r,
              status: (hasOpenMaintenance ? 'maintenance' : 'cleaning') as RoomStatus,
              currentBookingId: undefined,
              currentGuestId: undefined,
            }
          : r
      )
      roomFx = [booking.roomId]

      // 5) สร้าง Housekeeping task อัตโนมัติ (ข้ามถ้าห้องไปซ่อม — ยังไม่ต้องทำความสะอาด)
      const newTask: HousekeepingTask | null = hasOpenMaintenance
        ? null
        : {
            id: hkId,
            roomId: booking.roomId,
            roomNumber: room?.number ?? '-',
            assignedTo: '',
            staffId: '',
            status: 'pending',
            priority: 'normal',
            notes: `ทำความสะอาดหลังเช็คเอาต์ (${bookingId})`,
            scheduledAt: now,
          }

      // 6) อัพเดทสถิติแขก — นับเฉพาะที่จ่ายเงินจริง (paid) เพื่อไม่ให้ totalSpend เฟ้อเมื่อ corp credit ไม่พอ
      let updatedGuests = state.guests
      if (booking.guestId) {
        updatedGuests = state.guests.map((g) =>
          g.id !== booking.guestId
            ? g
            : { ...g, totalStays: g.totalStays + 1, totalSpend: g.totalSpend + newPaidAmount }
        )
      }

      bookingTouched = true
      return {
        bookings: updatedBookings,
        rooms: updatedRooms,
        invoices: [newInvoice, ...state.invoices],
        housekeepingTasks: newTask ? [...state.housekeepingTasks, newTask] : state.housekeepingTasks,
        guests: updatedGuests,
        corporateAccounts: updatedCorpAccounts,
        corporateTransactions: updatedCorpTx,
      }
    })
    // เงินขยับ (ตัดเครดิตองค์กร) → ลง audit เสมอ แม้ checkout จะ trigger จากหลายหน้า
    const ca = corpAudit as { amount: number; company: string } | null
    if (ca) {
      get().logAudit({
        category: 'payment', action: 'corporate_charge',
        summary: `ตัดเครดิตองค์กรอัตโนมัติ ${ca.amount.toLocaleString()} บาท (${ca.company}) เมื่อเช็คเอาต์`,
        entityId: bookingId,
      })
    }
    // เช็คเอาต์ = multi-entity (booking+invoice+room+HK+guest+corp) → 1 RPC atomic (Tier C C3)
    // RPC derive addOnTotal/outstanding/corp-charge จาก live locked rows แล้วคืนทุกแถวที่เขียน
    if (status === 'checked_out' && bookingTouched) {
      callRpc('check_out_booking', {
        p_booking_id: bookingId, p_now: now, p_invoice_id: invoiceId, p_hk_id: hkId,
        p_corp_tx_id: corpTxId, p_corp_payment_id: corpPaymentId, p_writer_id: CLIENT_ID,
      }, {
        bookings: [bookingId], rooms: roomFx, invoices: [invoiceId],
        housekeepingTasks: [hkId], guests: [pre?.guestId],
        corporateAccounts: [pre?.corporateAccountId], corporateTransactions: [corpTxId],
      }, {
        // client อาจสร้าง optimistic แต่ RPC (จาก live rows) ข้าม: HK (ห้องมีซ่อมค้างที่แท็บอื่น
        // เพิ่งแจ้ง), corp tx (เครดิต live ไม่พอ) → key คืน null = ถอด id ที่ optimistic สร้างออก
        absentNull: [
          { key: 'hkTask', slice: 'housekeepingTasks', id: hkId },
          { key: 'corpTx', slice: 'corporateTransactions', id: corpTxId },
        ],
      })
    } else {
      // check-in / transition อื่น (booking+room, 2 ตาราง) = residual dual-write ตามแผน C3
      if (roomFx.length) pushRooms(get().rooms.filter((r) => roomFx.includes(r.id)))
      if (bookingTouched) {
        const b = get().bookings.find((x) => x.id === bookingId)
        if (b) pushBooking(b)
      }
    }
  },

  cancelBooking: (bookingId) => {
    // gen timestamp/id ก่อน set() ใช้ร่วม optimistic state + RPC params (Tier C C3)
    const now = new Date().toISOString()
    const hkId = `hk${newId()}`
    const refundPayId = `pay${newId()}`
    const corpTxId = `ctx${newId()}`
    const pre = get().bookings.find((b) => b.id === bookingId)
    let refundAudit = 0 // เงินคืนที่เกิดจากการยกเลิก → log audit หลัง set()
    let bookingTouched = false // booking row เปลี่ยนจริง (ผ่าน guard)
    let invoiceFx: string[] = [] // invoice ที่พลิกเป็น refunded → repair spec ของ RPC
    set((state) => {
      const booking = state.bookings.find((b) => b.id === bookingId)
      if (!booking) return {}
      if (booking.status === 'cancelled') return {}
      const wasCheckedIn = booking.status === 'checked_in'
      const room = state.rooms.find((r) => r.id === booking.roomId)
      // ถ้ายกเลิกหลังเช็คอินแล้ว → สร้าง HK task ให้แม่บ้านไปทำความสะอาด
      const newTask: HousekeepingTask | null = wasCheckedIn && room
        ? {
            id: hkId,
            roomId: booking.roomId,
            roomNumber: room.number,
            assignedTo: '',
            staffId: '',
            status: 'pending',
            priority: 'normal',
            notes: `ทำความสะอาดหลังยกเลิกการจอง (${bookingId})`,
            scheduledAt: now,
          }
        : null

      // คืนเงินที่รับมาแล้ว: บันทึก refund payment (ยอดติดลบ) + เคลียร์ยอดที่จ่าย
      const refundAmount = booking.paidAmount
      refundAudit = refundAmount
      const refundPayment: import('@/types').Payment | null = refundAmount > 0
        ? {
            id: refundPayId,
            amount: -refundAmount,
            method: booking.paymentMethod ?? 'cash',
            date: now,
            staffId: 'system',
            notes: 'คืนเงินจากการยกเลิกการจอง',
          }
        : null

      // ถ้าเป็น booking องค์กร → คืนเครดิตกลับเข้าบัญชี
      let updatedCorpAccounts = state.corporateAccounts
      let updatedCorpTx = state.corporateTransactions
      if (refundAmount > 0 && booking.isCorporate && booking.corporateAccountId) {
        const acc = state.corporateAccounts.find((a) => a.id === booking.corporateAccountId)
        if (acc) {
          const updatedAcc = { ...acc, totalUsed: Math.max(0, acc.totalUsed - refundAmount), availableBalance: acc.availableBalance + refundAmount }
          updatedCorpAccounts = state.corporateAccounts.map((a) => (a.id === acc.id ? updatedAcc : a))
          const ctx: CorporateTransaction = {
            id: corpTxId, corporateAccountId: acc.id, type: 'refund', amount: refundAmount,
            balanceBefore: acc.availableBalance, balanceAfter: acc.availableBalance + refundAmount,
            performedBy: 'system', date: now, bookingId, notes: 'คืนเครดิตจากการยกเลิกการจอง',
          }
          updatedCorpTx = [ctx, ...state.corporateTransactions]
        }
      }

      // ปล่อยห้องเฉพาะเมื่อ booking นี้ครองห้องจริง (เช็คอินอยู่ หรือ pointer ห้องชี้มาที่ booking นี้)
      // — ยกเลิก booking อนาคตของห้องที่มีแขกอื่นพักอยู่ ห้ามสั่งห้องว่าง/ล้าง pointer ของเขา
      const releaseRoom = wasCheckedIn || room?.currentBookingId === bookingId
      bookingTouched = true
      invoiceFx = state.invoices
        .filter((iv) => iv.bookingId === bookingId && iv.status !== 'refunded')
        .map((iv) => iv.id)
      return {
        bookings: state.bookings.map((b) =>
          b.id === bookingId
            ? {
                ...b,
                status: 'cancelled' as BookingStatus,
                paidAmount: 0,
                payments: refundPayment ? [...(b.payments ?? []), refundPayment] : b.payments,
              }
            : b
        ),
        rooms: state.rooms.map((r) =>
          r.id === booking.roomId && releaseRoom
            ? { ...r, status: (wasCheckedIn ? 'cleaning' : 'available') as RoomStatus, currentBookingId: undefined, currentGuestId: undefined }
            : r
        ),
        housekeepingTasks: newTask ? [...state.housekeepingTasks, newTask] : state.housekeepingTasks,
        // ยกเลิกใบแจ้งหนี้ของการจองนี้ → สถานะ refunded
        invoices: state.invoices.map((iv) =>
          iv.bookingId === bookingId && iv.status !== 'refunded' ? { ...iv, status: 'refunded' as InvoiceStatus } : iv
        ),
        corporateAccounts: updatedCorpAccounts,
        corporateTransactions: updatedCorpTx,
      }
    })
    if (refundAudit > 0) {
      get().logAudit({
        category: 'payment', action: 'refund',
        summary: `คืนเงินจากการยกเลิกการจอง ${refundAudit.toLocaleString()} บาท`,
        entityId: bookingId,
      })
    }
    // ยกเลิก = multi-entity (booking+room+invoice+HK+corp) → 1 RPC atomic (Tier C C3)
    // RPC derive refund จาก live paid_amount + ปล่อยห้องเฉพาะเจ้าของจริง (mirror releaseRoom)
    if (bookingTouched) {
      callRpc('cancel_booking', {
        p_booking_id: bookingId, p_now: now, p_refund_payment_id: refundPayId,
        p_corp_tx_id: corpTxId, p_hk_id: hkId, p_writer_id: CLIENT_ID,
      }, {
        bookings: [bookingId], rooms: [pre?.roomId], invoices: invoiceFx,
        housekeepingTasks: [hkId], corporateAccounts: [pre?.corporateAccountId],
        corporateTransactions: [corpTxId],
      }, {
        // RPC (จาก live rows) อาจไม่สร้างแถวที่ client สร้าง optimistic: HK (สถานะ live ไม่ใช่
        // checked_in), corp tx (live paid = 0 ไม่มีอะไรคืน) → key คืน null = ถอด id ออก
        absentNull: [
          { key: 'hkTask', slice: 'housekeepingTasks', id: hkId },
          { key: 'corpTx', slice: 'corporateTransactions', id: corpTxId },
        ],
      })
    }
  },

  updateBooking: (bookingId, updates) => {
    set((state) => ({
      bookings: state.bookings.map((b) =>
        b.id === bookingId ? { ...b, ...updates } : b
      ),
    }))
    // dual-write: patch เฉพาะฟิลด์ที่เปลี่ยน (camel→snake) + writer_id echo key (Tier C C2)
    const patch: Record<string, unknown> = { writer_id: CLIENT_ID }
    if (updates.adults !== undefined) patch.adults = updates.adults
    if (updates.children !== undefined) patch.children = updates.children
    if (updates.source !== undefined) patch.source = updates.source
    if (updates.specialRequests !== undefined) patch.special_requests = updates.specialRequests
    if (updates.paymentMethod !== undefined) patch.payment_method = updates.paymentMethod ?? null
    void supabase.from('bookings').update(patch).eq('id', bookingId).then(reportBookingError)
  },

  extendBooking: (bookingId, additionalNights) => {
    const state = get()
    const booking = state.bookings.find((b) => b.id === bookingId)
    if (!booking) return { ok: false, error: 'ไม่พบการจอง' }
    if (additionalNights <= 0) return { ok: false, error: 'จำนวนคืนต้องมากกว่า 0' }
    if (['checked_out', 'cancelled'].includes(booking.status)) {
      return { ok: false, error: 'ไม่สามารถขยายการจองที่ปิดแล้ว' }
    }

    const oldCheckOut = booking.checkOut.split('T')[0]
    const newCheckOut = addNightsISO(booking.checkOut, additionalNights)

    // เช็คชน booking อื่นในห้องเดียวกัน ช่วงระหว่าง oldCheckOut → newCheckOut (ข้ามตัวเอง)
    if (roomHasConflict(state.bookings, booking.roomId, oldCheckOut, newCheckOut, bookingId)) {
      return { ok: false, error: 'มีการจองอื่นทับช่วงวันที่ขยาย' }
    }

    // ราคาเพิ่ม = ราคารายคืนจริงของวันที่เพิ่ม (ผ่าน source เดียวกับตอนสร้าง booking)
    const room = state.rooms.find((r) => r.id === booking.roomId)
    if (!room) return { ok: false, error: 'ไม่พบห้อง' }
    const extraPrice = calcBookingTotal(room.type, oldCheckOut, newCheckOut, room.pricePerNight, get().dynamicPricing)

    set((s) => ({
      bookings: s.bookings.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              checkOut: newCheckOut,
              nights: b.nights + additionalNights,
              totalAmount: b.totalAmount + extraPrice,
            }
          : b
      ),
    }))
    // ขยายการจอง → RPC atomic (Tier C C3): advisory lock ห้องกัน conflict ข้ามแท็บช่วงที่ขยาย
    // + CAS ที่ p_old_check_out (ฐานที่ client ใช้คิดราคา) — ฐานเลื่อนไปแล้ว (อีกแท็บ extend) = STALE
    // + retry หลังสำเร็จ (check_out ถึงเป้าแล้ว) = no-op กัน nights/total บวกซ้ำ
    callRpc('extend_booking', {
      p_booking_id: bookingId, p_additional_nights: Math.round(additionalNights),
      p_old_check_out: booking.checkOut, p_new_check_out: newCheckOut,
      p_extra_price: extraPrice, p_writer_id: CLIENT_ID,
    }, { bookings: [bookingId] })
    return { ok: true }
  },

  moveBooking: (bookingId, newRoomId, reprice = false) => {
    const state = get()
    const booking = state.bookings.find((b) => b.id === bookingId)
    if (!booking) return { ok: false, error: 'ไม่พบการจอง' }
    if (['checked_out', 'cancelled'].includes(booking.status)) {
      return { ok: false, error: 'ไม่สามารถย้ายห้องของการจองที่ปิดแล้ว' }
    }
    if (booking.roomId === newRoomId) return { ok: false, error: 'เลือกห้องเดิม' }
    const newRoom = state.rooms.find((r) => r.id === newRoomId)
    if (!newRoom) return { ok: false, error: 'ไม่พบห้องใหม่' }
    if (newRoom.status === 'maintenance') return { ok: false, error: 'ห้องใหม่ปิดปรับปรุง' }

    if (roomHasConflict(state.bookings, newRoomId, booking.checkIn, booking.checkOut, bookingId)) {
      return { ok: false, error: 'ห้องใหม่มีการจองทับช่วงนี้' }
    }

    const wasCheckedIn = booking.status === 'checked_in'
    const oldRoom = state.rooms.find((r) => r.id === booking.roomId)
    const now = new Date().toISOString()
    // gen id ก่อน ใช้ร่วม optimistic state + RPC params (Tier C C3)
    const hkId = `hk${newId()}`
    const refundPayId = `pay${newId()}`
    const newTask: HousekeepingTask | null = wasCheckedIn && oldRoom
      ? {
          id: hkId,
          roomId: booking.roomId,
          roomNumber: oldRoom.number,
          assignedTo: '',
          staffId: '',
          status: 'pending',
          priority: 'normal',
          notes: `ทำความสะอาดหลังย้ายห้อง (${bookingId})`,
          scheduledAt: now,
        }
      : null

    // คิดราคาใหม่ตามประเภทห้องใหม่ (ผ่าน source เดียวกับสร้าง/ขยาย/early-checkout)
    // ถ้า reprice=false → คงราคาเดิม (อัพเกรด/ย้ายฟรี)
    const newTotal = reprice
      ? calcBookingTotal(newRoom.type, booking.checkIn, booking.checkOut, newRoom.pricePerNight, get().dynamicPricing)
      : booking.totalAmount
    const overpaid = reprice ? Math.max(0, booking.paidAmount - newTotal) : 0
    const refundPayment: import('@/types').Payment | null = overpaid > 0
      ? { id: refundPayId, amount: -overpaid, method: booking.paymentMethod ?? 'cash', date: now, staffId: 'system', notes: 'คืนเงินจากการย้ายห้อง (ราคาใหม่ต่ำกว่ายอดที่จ่าย)' }
      : null

    set((s) => ({
      bookings: s.bookings.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              roomId: newRoomId,
              ...(reprice
                ? {
                    totalAmount: newTotal,
                    roomTypeAtBooking: newRoom.type,
                    paidAmount: Math.min(b.paidAmount, newTotal),
                    payments: refundPayment ? [...(b.payments ?? []), refundPayment] : b.payments,
                  }
                : {}),
            }
          : b
      ),
      rooms: s.rooms.map((r) => {
        if (wasCheckedIn) {
          if (r.id === booking.roomId) {
            return { ...r, status: 'cleaning' as RoomStatus, currentBookingId: undefined, currentGuestId: undefined }
          }
          if (r.id === newRoomId) {
            return { ...r, status: 'occupied' as RoomStatus, currentBookingId: booking.id, currentGuestId: booking.guestId }
          }
        }
        return r
      }),
      housekeepingTasks: newTask ? [...s.housekeepingTasks, newTask] : s.housekeepingTasks,
    }))
    if (overpaid > 0) {
      get().logAudit({
        category: 'payment', action: 'refund',
        summary: `คืนเงินจากย้ายห้อง ${overpaid.toLocaleString()} บาท`,
        entityId: bookingId,
      })
    }
    // ย้ายห้อง = multi-entity (booking+2 rooms+HK) → 1 RPC atomic (Tier C C3)
    // advisory lock ทั้ง 2 ห้อง (sorted) กัน phantom conflict/deadlock; derive overpaid จาก live paid
    callRpc('move_room', {
      p_booking_id: bookingId, p_new_room_id: newRoomId, p_reprice: reprice, p_new_total: newTotal,
      p_now: now, p_refund_payment_id: refundPayId, p_hk_id: hkId, p_writer_id: CLIENT_ID,
    }, {
      bookings: [bookingId], rooms: [booking.roomId, newRoomId], housekeepingTasks: [hkId],
    }, {
      absentNull: [{ key: 'hkTask', slice: 'housekeepingTasks', id: hkId }],
    })
    return { ok: true }
  },

  adjustForEarlyCheckout: (bookingId) => {
    const state = get()
    const b = state.bookings.find((x) => x.id === bookingId)
    if (!b) return { ok: false, error: 'ไม่พบการจอง' }
    if (b.status !== 'checked_in') return { ok: false, error: 'ปรับยอดได้เฉพาะการจองที่เช็คอินอยู่' }
    // จำนวนคืนจริง = วันนี้ − วันเช็คอิน (อย่างน้อย 1 คืน)
    const checkInKey = b.checkIn.split('T')[0]
    const ms = new Date(todayLocal()).getTime() - new Date(checkInKey).getTime()
    const actualNights = Math.max(1, Math.round(ms / 86400000))
    if (actualNights >= b.nights) return { ok: false, error: 'ยังไม่ถึงกำหนด — ไม่ใช่การออกก่อนกำหนด' }

    // ยอดใหม่ = ราคารายคืนจริงของคืนที่พักจริง (checkIn → checkIn+actualNights) ผ่าน source เดียว
    // กับตอนสร้าง/ขยาย booking — ไม่ใช้ราคาเฉลี่ย ทำให้ถูกต้องเมื่อใช้ dynamic pricing
    const room = state.rooms.find((r) => r.id === b.roomId)
    const actualCheckOut = addNightsISO(b.checkIn, actualNights)
    const newTotal = room
      ? calcBookingTotal(room.type, b.checkIn, actualCheckOut, room.pricePerNight, get().dynamicPricing)
      : Math.round((b.nights > 0 ? b.totalAmount / b.nights : b.totalAmount) * actualNights)
    const now = new Date().toISOString()
    const refundPayId = `pay${newId()}` // gen ก่อน ใช้ร่วม optimistic + RPC params (Tier C C3)
    // จ่ายมาเกินยอดใหม่ → คืนเงินส่วนเกิน (บันทึก payment ติดลบ เหมือน flow ยกเลิก)
    const overpaid = Math.max(0, b.paidAmount - newTotal)
    const refundPayment: import('@/types').Payment | null = overpaid > 0
      ? { id: refundPayId, amount: -overpaid, method: b.paymentMethod ?? 'cash', date: now, staffId: 'system', notes: 'คืนเงินจากการออกก่อนกำหนด' }
      : null

    set((s) => ({
      bookings: s.bookings.map((x) =>
        x.id === bookingId
          ? {
              ...x,
              nights: actualNights,
              checkOut: now,
              totalAmount: newTotal,
              paidAmount: Math.min(x.paidAmount, newTotal),
              payments: refundPayment ? [...(x.payments ?? []), refundPayment] : x.payments,
            }
          : x
      ),
    }))
    if (overpaid > 0) {
      get().logAudit({
        category: 'payment', action: 'refund',
        summary: `คืนเงินออกก่อนกำหนด ${overpaid.toLocaleString()} บาท`,
        entityId: bookingId,
      })
    }
    // ออกก่อนกำหนด → RPC atomic (Tier C C3): derive overpaid/refund จาก live paid_amount
    callRpc('adjust_for_early_checkout', {
      p_booking_id: bookingId, p_actual_nights: actualNights, p_new_check_out: actualCheckOut,
      p_new_total: newTotal, p_now: now, p_refund_payment_id: refundPayId, p_writer_id: CLIENT_ID,
    }, { bookings: [bookingId] })
    return { ok: true, newNights: actualNights, newTotal, refunded: overpaid }
  },

  addGuest: (guestData) => {
    const id = `g${newId()}`
    const newGuest: Guest = { ...guestData, id }
    set((state) => ({
      guests: [...state.guests, newGuest],
    }))
    // dual-write: insert ขึ้นตาราง guests (Tier B)
    void supabase.from('guests').insert(guestRow(newGuest)).then(reportGuestError)
    return id
  },

  updateGuest: (guestId, updates) => {
    set((state) => ({
      guests: state.guests.map((g) => (g.id === guestId ? { ...g, ...updates } : g)),
    }))
    // dual-write: patch เฉพาะฟิลด์ที่เปลี่ยน (camel→snake) + writer_id echo key
    const patch: Record<string, unknown> = { writer_id: CLIENT_ID }
    if (updates.name !== undefined) patch.name = updates.name
    if (updates.email !== undefined) patch.email = updates.email
    if (updates.phone !== undefined) patch.phone = updates.phone
    if (updates.nationality !== undefined) patch.nationality = updates.nationality
    if (updates.idNumber !== undefined) patch.id_number = updates.idNumber
    if (updates.preferences !== undefined) patch.preferences = updates.preferences
    void supabase.from('guests').update(patch).eq('id', guestId).then(reportGuestError)
  },

  addHousekeepingTask: (taskData) => {
    const newTask: HousekeepingTask = { ...taskData, id: `hk${newId()}` }
    set((state) => ({ housekeepingTasks: [...state.housekeepingTasks, newTask] }))
    // dual-write: insert ขึ้นตาราง housekeeping_tasks (Tier C)
    void supabase.from('housekeeping_tasks').insert(hkTaskRow(newTask)).then(reportHkError)
  },

  updateTaskStatus: (taskId, status) => {
    let roomFx: string[] = [] // ห้องที่คืนเป็น available → dual-write หลัง set() (Tier B)
    let hkPatch: Record<string, unknown> | null = null // แถว HK ที่เปลี่ยน → dual-write หลัง set() (Tier C)
    set((state) => {
      const now = new Date().toISOString()
      const updatedTasks = state.housekeepingTasks.map((t) => {
        if (t.id !== taskId) return t
        const updates: Partial<HousekeepingTask> = { status }
        if (status === 'in_progress') updates.startedAt = now
        if (status === 'completed') updates.completedAt = now
        return { ...t, ...updates }
      })
      // patch เฉพาะฟิลด์ที่เปลี่ยน (status + timestamp ที่เพิ่งตั้ง) → dual-write หลัง set()
      if (state.housekeepingTasks.some((t) => t.id === taskId)) {
        hkPatch = { status, writer_id: CLIENT_ID }
        if (status === 'in_progress') hkPatch.started_at = now
        if (status === 'completed') hkPatch.completed_at = now
      }
      // เมื่อทำความสะอาดเสร็จ → คืนห้องเป็น available เฉพาะห้องที่กำลัง 'cleaning' (หลังเช็คเอาต์)
      // ห้ามแตะห้องที่ 'occupied' (งานทำความสะอาดระหว่างเข้าพัก) หรือ 'maintenance'
      const task = updatedTasks.find((t) => t.id === taskId)
      let updatedRooms = state.rooms
      if (status === 'completed' && task && state.rooms.some((r) => r.id === task.roomId && r.status === 'cleaning')) {
        updatedRooms = state.rooms.map((r) =>
          r.id === task.roomId && r.status === 'cleaning' ? { ...r, status: 'available' as RoomStatus } : r
        )
        roomFx = [task.roomId]
      }
      return { housekeepingTasks: updatedTasks, rooms: updatedRooms }
    })
    // dual-write HK patch (Tier C) + room status (Tier B)
    const patch = hkPatch as Record<string, unknown> | null
    if (patch) void supabase.from('housekeeping_tasks').update(patch).eq('id', taskId).then(reportHkError)
    if (roomFx.length) pushRooms(get().rooms.filter((r) => roomFx.includes(r.id)))
  },

  // ── maintenance dual-write (Tier A) — maintenanceLogs ย้ายไปตาราง; rooms-side-effect ย้ายเป็นตารางแล้ว (Tier B) ──
  addMaintenanceLog: (logData) => {
    const newLog: MaintenanceLog = { ...logData, id: `m${newId()}` }
    let roomFx: string[] = [] // ห้องที่ตั้งเป็น maintenance → dual-write หลัง set() (Tier B)
    set((state) => {
      // ตั้งห้องเป็น maintenance ทันทีถ้า issue ยังไม่ resolved (ห้องที่ไม่ได้ occupied)
      let updatedRooms = state.rooms
      if (newLog.status !== 'resolved' && state.rooms.some((r) => r.id === newLog.roomId && r.status !== 'occupied')) {
        updatedRooms = state.rooms.map((r) =>
          r.id === newLog.roomId && r.status !== 'occupied'
            ? { ...r, status: 'maintenance' as RoomStatus }
            : r
        )
        roomFx = [newLog.roomId]
      }
      return { maintenanceLogs: [newLog, ...state.maintenanceLogs], rooms: updatedRooms }
    })
    void supabase.from('maintenance_logs').insert(maintLogRow(newLog)).then(reportMaintenanceError)
    if (roomFx.length) pushRooms(get().rooms.filter((r) => roomFx.includes(r.id)))
  },

  updateMaintenanceStatus: (logId, status) => {
    const now = new Date().toISOString()
    let roomFx: string[] = [] // ห้องที่คืนเป็น available → dual-write หลัง set() (Tier B)
    set((state) => {
      const log = state.maintenanceLogs.find((l) => l.id === logId)
      const updatedLogs = state.maintenanceLogs.map((l) =>
        l.id === logId
          ? { ...l, status, resolvedAt: status === 'resolved' ? now : l.resolvedAt }
          : l
      )
      // เมื่อ resolved + ไม่มี maintenance อื่นค้างของห้องนี้ → คืนห้องเป็น available
      let updatedRooms = state.rooms
      if (status === 'resolved' && log) {
        const hasOtherOpen = updatedLogs.some(
          (l) => l.id !== logId && l.roomId === log.roomId && l.status !== 'resolved'
        )
        if (!hasOtherOpen && state.rooms.some((r) => r.id === log.roomId && r.status === 'maintenance')) {
          updatedRooms = state.rooms.map((r) =>
            r.id === log.roomId && r.status === 'maintenance'
              ? { ...r, status: 'available' as RoomStatus }
              : r
          )
          roomFx = [log.roomId]
        }
      }
      return { maintenanceLogs: updatedLogs, rooms: updatedRooms }
    })
    // dual-write status (+ resolved_at เฉพาะตอน resolved) ขึ้น maintenance_logs
    const patch: Record<string, unknown> = { status, writer_id: CLIENT_ID }
    if (status === 'resolved') patch.resolved_at = now
    void supabase.from('maintenance_logs').update(patch).eq('id', logId).then(reportMaintenanceError)
    // ห้องคืน available → dual-write ขึ้นตาราง rooms (Tier B)
    if (roomFx.length) pushRooms(get().rooms.filter((r) => roomFx.includes(r.id)))
  },

  removeMaintenanceLog: (logId) => {
    let roomFx: string[] = [] // ห้องที่คืนเป็น available → dual-write หลัง set() (Tier B)
    set((state) => {
      const log = state.maintenanceLogs.find((l) => l.id === logId)
      const updatedLogs = state.maintenanceLogs.filter((l) => l.id !== logId)
      // ถ้าห้องอยู่ในสถานะ maintenance และไม่มี log ค้างอื่น → คืนห้องเป็น available
      let updatedRooms = state.rooms
      if (log) {
        const hasOtherOpen = updatedLogs.some(
          (l) => l.roomId === log.roomId && l.status !== 'resolved'
        )
        if (!hasOtherOpen && state.rooms.some((r) => r.id === log.roomId && r.status === 'maintenance')) {
          updatedRooms = state.rooms.map((r) =>
            r.id === log.roomId && r.status === 'maintenance'
              ? { ...r, status: 'available' as RoomStatus }
              : r
          )
          roomFx = [log.roomId]
        }
      }
      return { maintenanceLogs: updatedLogs, rooms: updatedRooms }
    })
    // soft-delete (กัน §3c resurrection + เก็บ history) — UI ลบออกจาก state แล้ว
    void supabase.from('maintenance_logs')
      .update({ deleted_at: new Date().toISOString(), writer_id: CLIENT_ID })
      .eq('id', logId).then(reportMaintenanceError)
    // ห้องคืน available → dual-write ขึ้นตาราง rooms (Tier B)
    if (roomFx.length) pushRooms(get().rooms.filter((r) => roomFx.includes(r.id)))
  },

  // ── inventory dual-write (Tier A, strangler) — blob ยังเป็นแหล่งจริงช่วง dual-write ──
  addInventoryItem: (itemData) => {
    const newItem: InventoryItem = { ...itemData, id: `inv${newId()}` }
    set((state) => ({ inventoryItems: [...state.inventoryItems, newItem] }))
    void supabase.from('inventory_items').insert(inventoryItemRow(newItem)).then(reportInventoryError)
  },

  updateInventoryItem: (id, updates) => {
    set((state) => ({
      inventoryItems: state.inventoryItems.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }))
    // map เฉพาะฟิลด์ที่เปลี่ยน → snake_case + writer_id เสมอ
    const patch: Record<string, unknown> = { writer_id: CLIENT_ID }
    if (updates.name !== undefined) patch.name = updates.name
    if (updates.category !== undefined) patch.category = updates.category
    if (updates.unit !== undefined) patch.unit = updates.unit
    if (updates.currentStock !== undefined) patch.current_stock = updates.currentStock
    if (updates.minStock !== undefined) patch.min_stock = updates.minStock
    if (updates.maxStock !== undefined) patch.max_stock = updates.maxStock
    if (updates.costPerUnit !== undefined) patch.cost_per_unit = updates.costPerUnit
    if (updates.supplier !== undefined) patch.supplier = updates.supplier ?? null
    if (updates.lastRestocked !== undefined) patch.last_restocked = updates.lastRestocked
    if (updates.notes !== undefined) patch.notes = updates.notes ?? null
    void supabase.from('inventory_items').update(patch).eq('id', id).then(reportInventoryError)
  },

  deleteInventoryItem: (id, staffId, reason = 'waste') => {
    const item = get().inventoryItems.find((i) => i.id === id)
    const now = new Date().toISOString()
    // ถ้ายังมีสต็อกค้าง → บันทึก write-off ยอดที่เหลือ ก่อนลบ เพื่อให้ ledger ครบ
    // (ไม่งั้นสต็อกที่เหลือหายจากบัญชีเงียบ ๆ — มีแค่ audit log ว่า "ลบรายการ")
    // เหตุผลกำหนด tx type: ของเสีย→'waste' (นับเข้ารายงานของเสีย); โอนออก/เลิกใช้→'adjust' (neutral ไม่เฟ้อรายงาน)
    const reasonText = reason === 'transfer' ? 'โอนออก/ย้ายคลัง' : reason === 'discontinue' ? 'เลิกใช้รายการ' : 'ตัดเป็นของเสีย'
    const writeOffTx: InventoryTransaction | null = item && item.currentStock > 0
      ? {
          id: `itx${newId()}`, itemId: id, type: reason === 'waste' ? 'waste' : 'adjust', quantity: -item.currentStock,
          performedBy: staffId, date: now, notes: `${reasonText} (ลบรายการ "${item.name}")`,
        }
      : null
    set((state) => ({
      inventoryItems: state.inventoryItems.filter((i) => i.id !== id),
      inventoryTransactions: writeOffTx
        ? [writeOffTx, ...state.inventoryTransactions]
        : state.inventoryTransactions,
    }))
    // dual-write write-off ก่อน (item ยังอยู่ใน table แบบ soft-delete → FK item_id ครบ)
    if (writeOffTx) pushInventoryTx(writeOffTx)
    // soft-delete (กัน §3c resurrection); ตั้ง current_stock=0 ให้แถวที่เก็บไว้ตรงกับ ledger
    void supabase.from('inventory_items')
      .update({ current_stock: 0, deleted_at: now, writer_id: CLIENT_ID })
      .eq('id', id).then(reportInventoryError)
  },

  restockItem: (itemId, quantity, staffId, notes) => {
    if (quantity <= 0) return // กันเติมสต็อกค่าติดลบ/ศูนย์
    const item = get().inventoryItems.find((i) => i.id === itemId)
    if (!item) return
    const now = new Date().toISOString()
    const newStock = item.currentStock + quantity
    const tx: InventoryTransaction = {
      id: `itx${newId()}`, itemId, type: 'restock', quantity, performedBy: staffId, date: now, notes,
    }
    set((state) => ({
      inventoryItems: state.inventoryItems.map((it) =>
        it.id === itemId ? { ...it, currentStock: newStock, lastRestocked: now } : it
      ),
      inventoryTransactions: [tx, ...state.inventoryTransactions],
    }))
    pushInventoryStock(itemId, newStock, now)
    pushInventoryTx(tx)
  },

  useInventoryItem: (itemId, quantity, staffId, referenceId, notes) => {
    const state = get()
    const item = state.inventoryItems.find((i) => i.id === itemId)
    if (!item) return { ok: false, error: 'ไม่พบสินค้า' }
    if (quantity <= 0) return { ok: false, error: 'จำนวนต้องมากกว่า 0' }
    if (item.currentStock < quantity) {
      return { ok: false, error: `สต็อก "${item.name}" ไม่พอ (มี ${item.currentStock} ต้องการ ${quantity})` }
    }
    const now = new Date().toISOString()
    const newStock = item.currentStock - quantity
    const tx: InventoryTransaction = {
      id: `itx${newId()}`, itemId, type: 'use', quantity: -quantity, performedBy: staffId, date: now, referenceId, notes,
    }
    set((s) => ({
      inventoryItems: s.inventoryItems.map((it) =>
        it.id === itemId ? { ...it, currentStock: newStock } : it
      ),
      inventoryTransactions: [tx, ...s.inventoryTransactions],
    }))
    pushInventoryStock(itemId, newStock)
    pushInventoryTx(tx)
    return { ok: true }
  },

  adjustStock: (itemId, newQuantity, staffId, notes) => {
    const item = get().inventoryItems.find((i) => i.id === itemId)
    if (!item) return
    const now = new Date().toISOString()
    const diff = newQuantity - item.currentStock
    const tx: InventoryTransaction = {
      id: `itx${newId()}`, itemId, type: 'adjust', quantity: diff, performedBy: staffId, date: now, notes,
    }
    set((state) => ({
      inventoryItems: state.inventoryItems.map((i) =>
        i.id === itemId ? { ...i, currentStock: newQuantity } : i
      ),
      inventoryTransactions: [tx, ...state.inventoryTransactions],
    }))
    pushInventoryStock(itemId, newQuantity)
    pushInventoryTx(tx)
  },

  addCorporateAccount: (accountData) => {
    const newAccount: CorporateAccount = {
      ...accountData, id: `corp${newId()}`,
      totalDeposited: 0, totalUsed: 0, availableBalance: 0,
      createdAt: new Date().toISOString(),
    }
    set((state) => ({ corporateAccounts: [...state.corporateAccounts, newAccount] }))
    // dual-write: insert ขึ้นตาราง corporate_accounts (Tier B)
    void supabase.from('corporate_accounts').insert(corpAccountRow(newAccount)).then(reportCorporateError)
  },

  updateCorporateAccount: (id, updates) => {
    set((state) => ({
      corporateAccounts: state.corporateAccounts.map((acc) =>
        acc.id === id ? { ...acc, ...updates } : acc
      ),
    }))
    // dual-write: เขียน account ที่อัปเดตแล้วทับ (profile/balance fields)
    const updated = get().corporateAccounts.find((a) => a.id === id)
    if (updated) pushCorpAccount(updated)
  },

  depositToAccount: (accountId, amount, staffId, notes) => {
    let fx: { account: CorporateAccount; tx: CorporateTransaction } | null = null
    set((state) => {
      const now = new Date().toISOString()
      const acc = state.corporateAccounts.find((a) => a.id === accountId)
      if (!acc) return {}
      const tx: CorporateTransaction = {
        id: `ctx${newId()}`, corporateAccountId: accountId, type: 'deposit', amount,
        balanceBefore: acc.availableBalance, balanceAfter: acc.availableBalance + amount,
        performedBy: staffId, date: now, notes,
      }
      const updatedAcc = { ...acc, totalDeposited: acc.totalDeposited + amount, availableBalance: acc.availableBalance + amount }
      fx = { account: updatedAcc, tx }
      return {
        corporateAccounts: state.corporateAccounts.map((a) => (a.id === accountId ? updatedAcc : a)),
        corporateTransactions: [tx, ...state.corporateTransactions],
      }
    })
    // dual-write: account balance + ledger tx (Tier B)
    const f = fx as { account: CorporateAccount; tx: CorporateTransaction } | null
    if (f) { pushCorpAccount(f.account); pushCorpTx(f.tx) }
  },

  chargeAccount: (accountId, amount, staffId, bookingId, notes) => {
    let fx: { account: CorporateAccount; tx: CorporateTransaction } | null = null
    set((state) => {
      const now = new Date().toISOString()
      const acc = state.corporateAccounts.find((a) => a.id === accountId)
      if (!acc || acc.availableBalance < amount) return {}
      const tx: CorporateTransaction = {
        id: `ctx${newId()}`, corporateAccountId: accountId, type: 'charge', amount,
        balanceBefore: acc.availableBalance, balanceAfter: acc.availableBalance - amount,
        performedBy: staffId, date: now, bookingId, notes,
      }
      const updatedAcc = { ...acc, totalUsed: acc.totalUsed + amount, availableBalance: acc.availableBalance - amount }
      fx = { account: updatedAcc, tx }
      return {
        corporateAccounts: state.corporateAccounts.map((a) => (a.id === accountId ? updatedAcc : a)),
        corporateTransactions: [tx, ...state.corporateTransactions],
      }
    })
    const f = fx as { account: CorporateAccount; tx: CorporateTransaction } | null
    if (f) { pushCorpAccount(f.account); pushCorpTx(f.tx) }
  },

  refundToAccount: (accountId, amount, staffId, bookingId, notes) => {
    let fx: { account: CorporateAccount; tx: CorporateTransaction } | null = null
    set((state) => {
      const now = new Date().toISOString()
      const acc = state.corporateAccounts.find((a) => a.id === accountId)
      if (!acc) return {}
      const tx: CorporateTransaction = {
        id: `ctx${newId()}`, corporateAccountId: accountId, type: 'refund', amount,
        balanceBefore: acc.availableBalance, balanceAfter: acc.availableBalance + amount,
        performedBy: staffId, date: now, bookingId, notes,
      }
      const updatedAcc = { ...acc, totalUsed: Math.max(0, acc.totalUsed - amount), availableBalance: acc.availableBalance + amount }
      fx = { account: updatedAcc, tx }
      return {
        corporateAccounts: state.corporateAccounts.map((a) => (a.id === accountId ? updatedAcc : a)),
        corporateTransactions: [tx, ...state.corporateTransactions],
      }
    })
    const f = fx as { account: CorporateAccount; tx: CorporateTransaction } | null
    if (f) { pushCorpAccount(f.account); pushCorpTx(f.tx) }
  },

  // ===== Expense actions =====
  // dual-write ขึ้นตาราง expenses (relational migration Tier A, strangler) — แพทเทิร์นเดียวกับ logAudit
  // blob ยังเป็นแหล่งจริงช่วง dual-write → write ที่ fail แค่ทำให้ตารางคลาดเคลื่อน 1 แถว (rollback ฟรี)
  // แต่ "ห้าม fire-and-forget เงียบ" — fail แล้วต้องเตือน (กันข้อมูลหายเงียบหลัง cutover)
  addExpense: (expense) => {
    const newExpense: Expense = { ...expense, id: `exp${newId()}`, createdAt: new Date().toISOString() }
    set((state) => ({ expenses: [newExpense, ...state.expenses] }))
    void supabase
      .from('expenses')
      .insert({
        id: newExpense.id,
        date: newExpense.date,
        category: newExpense.category,
        description: newExpense.description,
        payee: newExpense.payee ?? null,
        amount: newExpense.amount,
        note: newExpense.note ?? null,
        receipt_path: newExpense.receiptPath ?? null,
        writer_id: CLIENT_ID,
      })
      .then(reportExpenseError)
  },

  updateExpense: (id, updates) => {
    set((state) => ({
      expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }))
    // map เฉพาะฟิลด์ที่เปลี่ยน → snake_case (undefined ไม่ถูกส่ง) + writer_id เสมอ
    const patch: Record<string, unknown> = { writer_id: CLIENT_ID }
    if (updates.date !== undefined) patch.date = updates.date
    if (updates.category !== undefined) patch.category = updates.category
    if (updates.description !== undefined) patch.description = updates.description
    if (updates.payee !== undefined) patch.payee = updates.payee ?? null
    if (updates.amount !== undefined) patch.amount = updates.amount
    if (updates.note !== undefined) patch.note = updates.note ?? null
    if (updates.receiptPath !== undefined) patch.receipt_path = updates.receiptPath ?? null
    void supabase.from('expenses').update(patch).eq('id', id).then(reportExpenseError)
  },

  deleteExpense: (id) => {
    set((state) => ({ expenses: state.expenses.filter((e) => e.id !== id) }))
    // soft-delete: ตั้ง deleted_at แทนลบแถวจริง → กัน §3c resurrection + เก็บ history
    // (UI ลบออกจาก state แล้ว; hydrate/seed กรอง deleted_at IS NULL จึงไม่โผล่กลับ)
    void supabase
      .from('expenses')
      .update({ deleted_at: new Date().toISOString(), writer_id: CLIENT_ID })
      .eq('id', id)
      .then(reportExpenseError)
  },

  // ===== User / account actions =====
  addUser: (userData) => {
    if (!hasPerm('canManageStaff')) return { ok: false, error: 'ไม่มีสิทธิ์จัดการบัญชีผู้ใช้' }
    const state = get()
    const username = userData.username.trim()
    if (!username) return { ok: false, error: 'ต้องระบุชื่อผู้ใช้' }
    if (!userData.password) return { ok: false, error: 'ต้องระบุรหัสผ่าน' }
    if (state.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return { ok: false, error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' }
    }
    const newUser: User = { ...userData, username, id: `u${newId()}`, password: hashPassword(userData.password) }
    set((s) => ({ users: [...s.users, newUser] }))
    // dual-write: insert ขึ้นตาราง users (Tier B)
    void supabase.from('users').insert(userRow(newUser)).then(reportUserError)
    get().logAudit({
      category: 'auth', action: 'add-user',
      summary: `สร้างบัญชีผู้ใช้ "${username}"`, entityId: newUser.id,
    })
    return { ok: true }
  },

  updateUser: (id, updates) => {
    // อนุญาตให้แก้บัญชี "ตัวเอง" ได้ (เช่น เปลี่ยนรหัสผ่านผ่าน ChangePasswordButton)
    // แต่แก้บัญชีคนอื่น หรือย้าย staffId (= เปลี่ยนสิทธิ์ตัวเอง) ต้องมี canManageStaff
    const currentUserId = useAuthStore.getState().user?.userId
    const isSelf = currentUserId === id
    const reassignsStaff = updates.staffId !== undefined
    if ((!isSelf || reassignsStaff) && !hasPerm('canManageStaff')) {
      return { ok: false, error: 'ไม่มีสิทธิ์จัดการบัญชีผู้ใช้' }
    }
    const state = get()
    if (updates.username !== undefined) {
      const username = updates.username.trim()
      if (!username) return { ok: false, error: 'ต้องระบุชื่อผู้ใช้' }
      if (state.users.some((u) => u.id !== id && u.username.toLowerCase() === username.toLowerCase())) {
        return { ok: false, error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' }
      }
      updates = { ...updates, username }
    }
    const passwordChanged = updates.password !== undefined && updates.password !== ''
    if (passwordChanged) {
      updates = { ...updates, password: hashPassword(updates.password as string) }
    }
    set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...updates } : u)) }))
    // dual-write: patch เฉพาะฟิลด์ที่เปลี่ยน (camel→snake) + writer_id echo key
    const patch: Record<string, unknown> = { writer_id: CLIENT_ID }
    if (updates.username !== undefined) patch.username = updates.username
    if (passwordChanged) patch.password = updates.password // hash แล้วด้านบน
    if (updates.staffId !== undefined) patch.staff_id = updates.staffId
    void supabase.from('users').update(patch).eq('id', id).then(reportUserError)
    const target = state.users.find((u) => u.id === id)
    get().logAudit({
      category: 'auth', action: 'update-user',
      summary: `แก้บัญชีผู้ใช้ "${updates.username ?? target?.username ?? id}"${passwordChanged ? ' (เปลี่ยนรหัสผ่าน)' : ''}`,
      entityId: id,
    })
    return { ok: true }
  },

  deleteUser: (id) => {
    if (!hasPerm('canManageStaff')) { console.warn('[security] deleteUser ถูกปฏิเสธ: ไม่มีสิทธิ์ canManageStaff'); return }
    const target = get().users.find((u) => u.id === id)
    set((state) => ({ users: state.users.filter((u) => u.id !== id) }))
    // dual-write: soft-delete (ไม่ลบแถวจริง — กัน §3c resurrection + เก็บ history)
    void supabase.from('users')
      .update({ deleted_at: new Date().toISOString(), writer_id: CLIENT_ID })
      .eq('id', id).then(reportUserError)
    get().logAudit({
      category: 'auth', action: 'delete-user',
      summary: `ลบบัญชีผู้ใช้ "${target?.username ?? id}"`, entityId: id,
    })
  },

  recordLogin: (userId) => {
    const ts = new Date().toISOString()
    set((state) => ({
      users: state.users.map((u) =>
        u.id === userId ? { ...u, lastLogin: ts } : u
      ),
    }))
    // dual-write: อัปเดต last_login บนตาราง users (Tier B)
    void supabase.from('users')
      .update({ last_login: ts, writer_id: CLIENT_ID })
      .eq('id', userId).then(reportUserError)
  },

  addStaff: (staffData) => {
    if (!hasPerm('canManageStaff')) { console.warn('[security] addStaff ถูกปฏิเสธ: ไม่มีสิทธิ์ canManageStaff'); return '' }
    const id = `s${newId()}`
    const newStaff: Staff = { ...staffData, id }
    set((state) => ({ staff: [...state.staff, newStaff] }))
    // dual-write: insert ขึ้นตาราง staff (Tier B)
    void supabase.from('staff').insert(staffRow(newStaff)).then(reportStaffError)
    get().logAudit({
      category: 'auth', action: 'add-staff',
      summary: `เพิ่มพนักงาน "${staffData.name}" (${staffData.role})`, entityId: id,
    })
    return id
  },

  updateStaff: (id, updates) => {
    if (!hasPerm('canManageStaff')) { console.warn('[security] updateStaff ถูกปฏิเสธ: ไม่มีสิทธิ์ canManageStaff'); return }
    const prev = get().staff.find((s) => s.id === id)
    set((state) => ({
      staff: state.staff.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }))
    // dual-write: patch เฉพาะฟิลด์ที่เปลี่ยน (camel→snake) + writer_id echo key
    const patch: Record<string, unknown> = { writer_id: CLIENT_ID }
    if (updates.name !== undefined) patch.name = updates.name
    if (updates.role !== undefined) patch.role = updates.role
    if (updates.email !== undefined) patch.email = updates.email
    if (updates.phone !== undefined) patch.phone = updates.phone
    if (updates.avatar !== undefined) patch.avatar = updates.avatar ?? null
    if (updates.permissions !== undefined) patch.permissions = updates.permissions
    if (updates.hireDate !== undefined) patch.hire_date = updates.hireDate
    if (updates.isActive !== undefined) patch.is_active = updates.isActive
    void supabase.from('staff').update(patch).eq('id', id).then(reportStaffError)
    const roleChanged = updates.role !== undefined && updates.role !== prev?.role
    const permsChanged = updates.permissions !== undefined
    const detail = [
      roleChanged ? `เปลี่ยนตำแหน่ง→${updates.role}` : null,
      permsChanged ? 'ปรับสิทธิ์' : null,
    ].filter(Boolean).join(', ')
    get().logAudit({
      category: 'auth', action: 'update-staff',
      summary: `แก้ข้อมูลพนักงาน "${updates.name ?? prev?.name ?? id}"${detail ? ` (${detail})` : ''}`,
      entityId: id,
    })
  },

  deleteStaff: (id) => {
    if (!hasPerm('canManageStaff')) { console.warn('[security] deleteStaff ถูกปฏิเสธ: ไม่มีสิทธิ์ canManageStaff'); return }
    const target = get().staff.find((s) => s.id === id)
    set((state) => ({ staff: state.staff.filter((s) => s.id !== id) }))
    // dual-write: soft-delete (ไม่ลบแถวจริง — กัน §3c resurrection + เก็บ history)
    void supabase.from('staff')
      .update({ deleted_at: new Date().toISOString(), writer_id: CLIENT_ID })
      .eq('id', id).then(reportStaffError)
    get().logAudit({
      category: 'auth', action: 'delete-staff',
      summary: `ลบพนักงาน "${target?.name ?? id}"`, entityId: id,
    })
  },

  // สำรองข้อมูล: คืนเฉพาะ state ที่เป็นข้อมูล (ตัด function ออก)
  // หมายเหตุ: ตัดรหัสผ่านออกจาก users — ไฟล์ backup ไม่ควรมี plaintext password
  exportData: () => {
    const s = get() as unknown as Record<string, unknown>
    const data: Record<string, unknown> = {}
    for (const k of Object.keys(s)) {
      if (typeof s[k] !== 'function') data[k] = s[k]
    }
    if (Array.isArray(data.users)) {
      data.users = (data.users as User[]).map(({ password, ...rest }) => rest)
    }
    return data
  },
  // กู้คืนข้อมูล: เขียนทับ state ด้วยข้อมูลจากไฟล์ (เก็บ function เดิมไว้)
  // users ในไฟล์ไม่มี password (ถูกตัดตอน export) → คงรหัสเดิมของ id ที่ตรงกันไว้
  // (restore บนเครื่องเดิม login ต่อได้; ถ้า restore ขึ้น env ใหม่ admin ต้องตั้งรหัสใหม่)
  importData: (data) =>
    set((state) => {
      const incoming = data as Partial<HotelStore>
      if (Array.isArray(incoming.users)) {
        incoming.users = incoming.users.map((u) =>
          u.password ? u : { ...u, password: state.users.find((c) => c.id === u.id)?.password ?? '' }
        )
      }
      return { ...incoming }
    }),

  recordPayment: (bookingId, amount, method, staffId, notes) => {
    if (amount <= 0) return { ok: false, error: 'จำนวนเงินต้องมากกว่า 0' }
    // gen id/timestamp ก่อน ใช้ร่วม optimistic + RPC params (Tier C C3)
    const paymentId = `pay${newId()}`
    const now = new Date().toISOString()
    // ตรวจ outstanding + apply ใน set() เดียว (atomic) — กัน double-submit จ่ายเกิน:
    // ถ้าแยก get()→ตรวจ→set() สอง submit เร็ว ๆ จะผ่าน check บน outstanding ตัวเดิมทั้งคู่ → จ่ายเกิน
    let result: { ok: true } | { ok: false; error: string } = { ok: true }
    set((s) => {
      const booking = s.bookings.find((b) => b.id === bookingId)
      if (!booking) {
        result = { ok: false, error: 'ไม่พบการจอง' }
        return {}
      }
      // คำนวณยอดคงค้างจาก state ปัจจุบันใน set() (helper กลาง ใช้เกณฑ์เดียวกับทุกหน้า)
      const outstanding = calcOutstanding(booking, s.bookingAddOns)
      if (outstanding <= 0) {
        result = { ok: false, error: 'การจองนี้ชำระครบแล้ว' }
        return {}
      }
      if (amount > outstanding) {
        result = { ok: false, error: `เกินยอดค้างชำระ (สูงสุด ${outstanding.toLocaleString()} บาท)` }
        return {}
      }
      const payment: import('@/types').Payment = {
        id: paymentId,
        amount,
        method: method as import('@/types').PaymentMethod,
        date: now,
        staffId,
        notes,
      }
      return {
        bookings: s.bookings.map((b) =>
          b.id === bookingId
            ? {
                ...b,
                paidAmount: b.paidAmount + amount,
                paymentMethod: method as import('@/types').PaymentMethod,
                payments: [...(b.payments ?? []), payment],
              }
            : b
        ),
      }
    })
    // รับเงิน → RPC atomic (Tier C C3): derive ยอดค้างจาก live row (กันจ่ายซ้อนข้ามแท็บ)
    // + idempotent: payment id ซ้ำ (retry) = no-op ไม่บวกเงินเบิ้ล
    if (result.ok) {
      callRpc('record_payment', {
        p_booking_id: bookingId, p_amount: amount, p_method: method, p_payment_id: paymentId,
        p_now: now, p_staff_id: staffId, p_notes: notes ?? null, p_writer_id: CLIENT_ID,
      }, { bookings: [bookingId] })
    }
    return result
  },

  requestAddOn: (bookingId, addOnItemId, quantity, staffId, notes) => {
    const state = get()
    const booking = state.bookings.find((b) => b.id === bookingId)
    if (!booking) return { ok: false, error: 'ไม่พบการจอง' }
    if (['cancelled', 'checked_out'].includes(booking.status)) {
      return { ok: false, error: 'ไม่สามารถเพิ่ม Add-on กับการจองที่ปิดแล้ว' }
    }
    const item = state.addOnItems.find((a) => a.id === addOnItemId)
    if (!item) return { ok: false, error: 'ไม่พบรายการ Add-on' }
    if (quantity <= 0) return { ok: false, error: 'จำนวนต้องมากกว่า 0' }

    const newAddOn: BookingAddOn = {
      id: `ba${newId()}`, bookingId, addOnItemId, quantity,
      unitPrice: item.price, totalPrice: item.price * quantity,
      status: 'requested', requestedAt: new Date().toISOString(),
      requestedBy: staffId, notes,
    }
    set((s) => ({ bookingAddOns: [newAddOn, ...s.bookingAddOns] }))
    // dual-write: insert ขึ้นตาราง booking_add_ons (Tier C C2)
    void supabase.from('booking_add_ons').insert(bookingAddOnRow(newAddOn)).then(reportAddOnError)
    return { ok: true }
  },

  fulfillAddOn: (addOnId, staffId) => {
    // gen id/timestamp ก่อน ใช้ร่วม optimistic + RPC params (Tier C C3)
    const now = new Date().toISOString()
    const invTxId = `itx${newId()}`
    // ตรวจสถานะ + สต็อก แล้วตัดสต็อก ใน set() เดียว (atomic) — กัน fulfill 2 รายการรัว ๆ
    // ที่ดึงของชิ้นเดียวกัน: ถ้าตรวจสต็อกนอก set() ทั้งคู่ผ่าน check บน stock เดิม → ตัดเกิน stock ติดลบ
    let result: { ok: true } | { ok: false; error: string } = { ok: true }
    // side-effect ฝั่ง inventory (ตัดสต็อก) — จับไว้ประกอบ repair spec ของ RPC
    let invFx: { itemId: string; newStock: number; tx: InventoryTransaction } | null = null
    set((s) => {
      const addOn = s.bookingAddOns.find((a) => a.id === addOnId)
      if (!addOn) {
        result = { ok: false, error: 'ไม่พบรายการ Add-on' }
        return {}
      }
      if (addOn.status !== 'requested') {
        result = { ok: false, error: 'รายการนี้ดำเนินการไปแล้ว' }
        return {}
      }
      const item = s.addOnItems.find((a) => a.id === addOn.addOnItemId)

      let updatedItems = s.inventoryItems
      let updatedTx = s.inventoryTransactions
      if (item?.inventoryItemId && item.inventoryQtyPerUnit > 0) {
        const deduct = item.inventoryQtyPerUnit * addOn.quantity
        const inv = s.inventoryItems.find((i) => i.id === item.inventoryItemId)
        if (!inv || inv.currentStock < deduct) {
          result = { ok: false, error: `สต็อก "${item.name}" ไม่พอ (มี ${inv?.currentStock ?? 0} ต้องการ ${deduct})` }
          return {}
        }
        const invTx: InventoryTransaction = {
          id: invTxId, itemId: item.inventoryItemId, type: 'use',
          quantity: -deduct, referenceId: addOnId, performedBy: staffId, date: now,
          notes: `Add-on: ${item.name} x${addOn.quantity}`,
        }
        updatedItems = s.inventoryItems.map((i) =>
          i.id === item.inventoryItemId
            ? { ...i, currentStock: i.currentStock - deduct }
            : i
        )
        updatedTx = [invTx, ...s.inventoryTransactions]
        invFx = { itemId: item.inventoryItemId, newStock: inv.currentStock - deduct, tx: invTx }
      }
      return {
        bookingAddOns: s.bookingAddOns.map((a) =>
          a.id === addOnId ? { ...a, status: 'fulfilled' as const, fulfilledAt: now, fulfilledBy: staffId } : a
        ),
        inventoryItems: updatedItems,
        inventoryTransactions: updatedTx,
      }
    })
    // TS ไม่ widen invFx ที่ assign ใน closure → cast คืน type ก่อน truthiness guard
    const fx = invFx as { itemId: string; newStock: number; tx: InventoryTransaction } | null
    if (result.ok) {
      // จัดการ add-on = multi-entity (addon+inventory) → 1 RPC atomic (Tier C C3)
      // RPC ตรวจ/ตัดสต็อกจาก live stock (กัน fulfill ซ้อนข้ามแท็บตัดเกิน)
      callRpc('fulfill_add_on', {
        p_add_on_id: addOnId, p_staff_id: staffId, p_now: now,
        p_inv_tx_id: invTxId, p_writer_id: CLIENT_ID,
      }, {
        bookingAddOns: [addOnId], inventoryItems: [fx?.itemId],
        inventoryTransactions: [invTxId],
      }, {
        absentNull: [{ key: 'inventoryTx', slice: 'inventoryTransactions', id: invTxId }],
      })
      const s = get()
      const ao = s.bookingAddOns.find((a) => a.id === addOnId)
      const item = ao ? s.addOnItems.find((i) => i.id === ao.addOnItemId) : null
      s.logAudit({
        category: 'inventory', action: 'fulfill_addon',
        summary: `จัดการ Add-on "${item?.name ?? ao?.addOnItemId ?? addOnId}"${ao ? ` x${ao.quantity}` : ''}${fx ? ' · ตัดสต็อก' : ''}`,
        entityId: addOnId,
      })
    }
    return result
  },

  cancelAddOn: (addOnId) => {
    // gen id/timestamp ก่อน set() ใช้ร่วม optimistic state + RPC params (Tier C C3)
    const now = new Date().toISOString()
    const invTxId = `itx${newId()}`
    const refundPayId = `pay${newId()}`
    const corpTxId = `ctx${newId()}`
    // อ่านข้อมูลอ้างอิงก่อน set() ไว้ประกอบ repair spec (ids ของแถวที่ optimistic จะแตะ)
    const preState = get()
    const preAddOn = preState.bookingAddOns.find((a) => a.id === addOnId)
    const preBooking = preAddOn ? preState.bookings.find((b) => b.id === preAddOn.bookingId) : undefined
    const preItem = preAddOn ? preState.addOnItems.find((i) => i.id === preAddOn.addOnItemId) : undefined
    let refundAudit = 0 // เงินคืนส่วนเกินจากการยกเลิก add-on → log audit หลัง set()
    let addOnTouched = false // add-on ถูกยกเลิกจริง (ผ่าน guard)
    set((state) => {
      const addOn = state.bookingAddOns.find((a) => a.id === addOnId)
      if (!addOn) return {}
      if (addOn.status === 'cancelled') return {} // กันยกเลิกซ้ำ
      addOnTouched = true
      const wasFulfilled = addOn.status === 'fulfilled'
      const item = state.addOnItems.find((i) => i.id === addOn.addOnItemId) ?? null

      // ถ้าเคย fulfilled แล้วและมี inventoryItemId → คืนสต็อกกลับ
      let updatedItems = state.inventoryItems
      let updatedTx = state.inventoryTransactions
      if (wasFulfilled && item?.inventoryItemId && item.inventoryQtyPerUnit > 0) {
        const restore = item.inventoryQtyPerUnit * addOn.quantity
        const inv = state.inventoryItems.find((i) => i.id === item.inventoryItemId)
        const invTx: InventoryTransaction = {
          id: invTxId, itemId: item.inventoryItemId, type: 'adjust',
          quantity: restore, referenceId: addOnId, performedBy: 'system',
          date: now,
          notes: `คืนสต็อกจากการยกเลิก Add-on: ${item.name} x${addOn.quantity}`,
        }
        updatedItems = inv
          ? state.inventoryItems.map((i) =>
              i.id === item.inventoryItemId
                ? { ...i, currentStock: i.currentStock + restore }
                : i
            )
          : state.inventoryItems
        updatedTx = inv ? [invTx, ...state.inventoryTransactions] : state.inventoryTransactions
      }

      // คืนเงินส่วนที่จ่ายเกิน ถ้า add-on นี้ถูกชำระไปแล้ว (paidAmount เกินยอดที่ต้องจ่ายหลังยกเลิก)
      let updatedBookings = state.bookings
      const booking = state.bookings.find((b) => b.id === addOn.bookingId)
      let updatedCorpAccounts = state.corporateAccounts
      let updatedCorpTx = state.corporateTransactions
      if (booking) {
        const otherAddOnTotal = state.bookingAddOns
          .filter((a) => a.bookingId === booking.id && a.id !== addOnId && addOnCountsTowardCharge(a.status))
          .reduce((s, a) => s + a.totalPrice, 0)
        const newCharge = booking.totalAmount + otherAddOnTotal
        const overpaid = Math.max(0, booking.paidAmount - newCharge)
        if (overpaid > 0) {
          refundAudit = overpaid
          const refundPayment: import('@/types').Payment = {
            id: refundPayId, amount: -overpaid, method: booking.paymentMethod ?? 'cash',
            date: now, staffId: 'system', notes: `คืนเงินจากการยกเลิก Add-on: ${item?.name ?? addOn.addOnItemId}`,
          }
          updatedBookings = state.bookings.map((b) =>
            b.id === booking.id
              ? { ...b, paidAmount: b.paidAmount - overpaid, payments: [...(b.payments ?? []), refundPayment] }
              : b
          )
          // ถ้าเป็น booking องค์กร → คืนเครดิตกลับบัญชี
          if (booking.isCorporate && booking.corporateAccountId) {
            const acc = state.corporateAccounts.find((a) => a.id === booking.corporateAccountId)
            if (acc) {
              const updatedAcc = { ...acc, totalUsed: Math.max(0, acc.totalUsed - overpaid), availableBalance: acc.availableBalance + overpaid }
              updatedCorpAccounts = state.corporateAccounts.map((a) => (a.id === acc.id ? updatedAcc : a))
              const ctx: CorporateTransaction = {
                id: corpTxId, corporateAccountId: acc.id, type: 'refund', amount: overpaid,
                balanceBefore: acc.availableBalance, balanceAfter: acc.availableBalance + overpaid,
                performedBy: 'system', date: now, bookingId: booking.id, notes: 'คืนเครดิตจากการยกเลิก Add-on',
              }
              updatedCorpTx = [ctx, ...state.corporateTransactions]
            }
          }
        } else {
          updatedBookings = state.bookings
        }
      } else {
        updatedBookings = state.bookings
      }

      return {
        bookingAddOns: state.bookingAddOns.map((a) =>
          a.id === addOnId ? { ...a, status: 'cancelled' as const } : a
        ),
        bookings: updatedBookings,
        inventoryItems: updatedItems,
        inventoryTransactions: updatedTx,
        corporateAccounts: updatedCorpAccounts,
        corporateTransactions: updatedCorpTx,
      }
    })
    // ยกเลิก add-on = multi-entity (addon+inventory+booking+corp) → 1 RPC atomic (Tier C C3)
    // RPC derive คืนสต็อก/คืนเงินส่วนเกิน/คืนเครดิต จาก live rows แล้วคืนทุกแถวที่เขียน
    if (addOnTouched) {
      callRpc('cancel_add_on', {
        p_add_on_id: addOnId, p_now: now, p_inv_tx_id: invTxId,
        p_refund_payment_id: refundPayId, p_corp_tx_id: corpTxId, p_writer_id: CLIENT_ID,
      }, {
        bookingAddOns: [addOnId], bookings: [preBooking?.id],
        inventoryItems: [preItem?.inventoryItemId], inventoryTransactions: [invTxId],
        corporateAccounts: [preBooking?.corporateAccountId], corporateTransactions: [corpTxId],
      }, {
        // RPC (จาก live rows) อาจไม่สร้าง ledger ที่ client สร้าง optimistic (สต็อก/เครดิต
        // ไม่ต้องคืนตามค่า live) → key คืน null = ถอด id ออก
        absentNull: [
          { key: 'inventoryTx', slice: 'inventoryTransactions', id: invTxId },
          { key: 'corpTx', slice: 'corporateTransactions', id: corpTxId },
        ],
      })
    }
    if (refundAudit > 0) {
      get().logAudit({
        category: 'payment', action: 'refund',
        summary: `คืนเงินจากการยกเลิก Add-on ${refundAudit.toLocaleString()} บาท`,
      })
    }
  },

  // ===== Seasonal / dynamic pricing actions =====
  addPricingRule: (rule) => {
    const name = rule.name?.trim()
    if (!name) return { ok: false, error: 'ต้องระบุชื่อช่วงราคา' }
    if (!rule.startDate || !rule.endDate) return { ok: false, error: 'ต้องระบุวันเริ่มและวันสิ้นสุด' }
    if (rule.startDate > rule.endDate) return { ok: false, error: 'วันเริ่มต้องไม่หลังวันสิ้นสุด' }
    if (!(rule.price > 0)) return { ok: false, error: 'ราคาต้องมากกว่า 0' }
    const newRule: DynamicPricing = {
      ...rule, name, id: `dp${newId()}`,
      description: rule.description?.trim() || undefined,
    }
    set((s) => ({ dynamicPricing: [...s.dynamicPricing, newRule] }))
    // dual-write: insert ขึ้นตาราง dynamic_pricing (Phase 4)
    void supabase.from('dynamic_pricing').insert(pricingRuleRow(newRule)).then(reportPricingError)
    get().logAudit({
      category: 'room', action: 'add-rate',
      summary: `เพิ่มช่วงราคา "${name}" (${getRoomTypeLabel(rule.roomType)}) ${rule.startDate}–${rule.endDate} = ${rule.price.toLocaleString()} บาท/คืน`,
      entityId: newRule.id,
    })
    return { ok: true }
  },

  updatePricingRule: (id, updates) => {
    const existing = get().dynamicPricing.find((r) => r.id === id)
    if (!existing) return { ok: false, error: 'ไม่พบช่วงราคานี้' }
    const merged = { ...existing, ...updates }
    if (updates.name !== undefined && !updates.name.trim()) return { ok: false, error: 'ต้องระบุชื่อช่วงราคา' }
    if (merged.startDate > merged.endDate) return { ok: false, error: 'วันเริ่มต้องไม่หลังวันสิ้นสุด' }
    if (!(merged.price > 0)) return { ok: false, error: 'ราคาต้องมากกว่า 0' }
    const clean: Partial<DynamicPricing> = { ...updates }
    if (updates.name !== undefined) clean.name = updates.name.trim()
    if (updates.description !== undefined) clean.description = updates.description.trim() || undefined
    set((s) => ({ dynamicPricing: s.dynamicPricing.map((r) => (r.id === id ? { ...r, ...clean } : r)) }))
    // dual-write: patch เฉพาะฟิลด์ที่เปลี่ยน (camel→snake) + writer_id echo key
    const patch: Record<string, unknown> = { writer_id: CLIENT_ID }
    if (clean.roomType !== undefined) patch.room_type = clean.roomType
    if (clean.name !== undefined) patch.name = clean.name
    if (clean.startDate !== undefined) patch.start_date = clean.startDate
    if (clean.endDate !== undefined) patch.end_date = clean.endDate
    if (clean.price !== undefined) patch.price = clean.price
    if (clean.description !== undefined) patch.description = clean.description ?? null
    void supabase.from('dynamic_pricing').update(patch).eq('id', id).then(reportPricingError)
    get().logAudit({
      category: 'room', action: 'update-rate',
      summary: `แก้ช่วงราคา "${merged.name}" (${getRoomTypeLabel(merged.roomType)}) ${merged.startDate}–${merged.endDate} = ${merged.price.toLocaleString()} บาท/คืน`,
      entityId: id,
    })
    return { ok: true }
  },

  deletePricingRule: (id) => {
    const target = get().dynamicPricing.find((r) => r.id === id)
    set((s) => ({ dynamicPricing: s.dynamicPricing.filter((r) => r.id !== id) }))
    // dual-write: soft-delete (ไม่ลบแถวจริง — กัน §3c resurrection + เก็บ history)
    void supabase.from('dynamic_pricing')
      .update({ deleted_at: new Date().toISOString(), writer_id: CLIENT_ID })
      .eq('id', id).then(reportPricingError)
    if (target) {
      get().logAudit({
        category: 'room', action: 'delete-rate',
        summary: `ลบช่วงราคา "${target.name}" (${getRoomTypeLabel(target.roomType)})`,
        entityId: id,
      })
    }
  },
}), {
  name: 'hotel-pms-storage',
  storage: createJSONStorage(() => supabaseStorage),
  version: 2,
  // storage เป็น async (Supabase) — ปิด auto-hydrate แล้วสั่ง rehydrate() เองใน AppShell
  // เพื่อกัน race ที่แอป render ด้วย mock state ก่อนแล้วเขียนทับ cloud (ข้อมูลหาย)
  skipHydration: true,
  // ── relational migration จบครบ (Tier A + B + C + Phase 4 dynamicPricing) — ทุก entity อยู่ตารางจริงแล้ว ──
  // partialize = {} → blob ไม่ถือ business data อีกต่อไป (app_state คงไว้เป็น envelope ให้ hydration-gate/
  // version-CAS/realtime app_state-sync ทำงานตามเดิม แต่ไม่มี slice ไหนเขียนลง blob แล้ว = retire blob สำเร็จ)
  partialize: () => ({}),
  // blob เก่าอาจยังพก slice ที่ย้ายแล้วติดมา — บังคับใช้ค่าใน current (ปล่อยให้ seed จากตารางเติม)
  // ไม่งั้นแถวที่ลบไป (soft-delete) จะถูก rehydrate จาก blob เก่ามาชุบชีวิตก่อน seed ทับ
  merge: (persisted, current) => {
    const p = (persisted ?? {}) as Partial<typeof current>
    return {
      ...current, ...p,
      rooms: current.rooms ?? [],
      housekeepingTasks: current.housekeepingTasks ?? [],
      auditLogs: current.auditLogs ?? [],
      expenses: current.expenses ?? [],
      inventoryItems: current.inventoryItems ?? [],
      inventoryTransactions: current.inventoryTransactions ?? [],
      maintenanceLogs: current.maintenanceLogs ?? [],
      addOnItems: current.addOnItems ?? [],
      guests: current.guests ?? [],
      staff: current.staff ?? [],
      users: current.users ?? [],
      corporateAccounts: current.corporateAccounts ?? [],
      corporateTransactions: current.corporateTransactions ?? [],
      bookings: current.bookings ?? [],
      invoices: current.invoices ?? [],
      bookingAddOns: current.bookingAddOns ?? [],
      dynamicPricing: current.dynamicPricing ?? [],
    }
  },
  // ตั้ง flag เสมอ (แม้ error หรือยังไม่มีข้อมูลใน cloud) เพื่อไม่ให้ UI ค้างที่ loading
  onRehydrateStorage: () => (_state, error) => {
    if (error) console.error('[hotel-store] rehydrate error:', error)
    useHotelStore.setState({ _hasHydrated: true })
  },
}))

// ให้ adapter อัปเดต state ในเครื่องเมื่อ merge (CAS conflict) สำเร็จ
// (ลงทะเบียนที่นี่เพื่อเลี่ยง import วนใน lib/supabase-storage)
registerStateApplier((state) => useHotelStore.setState(state as never))
