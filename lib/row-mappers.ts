'use client'
/**
 * mappers แปลงแถวตาราง relational (snake_case จาก Supabase) ↔ entity ใน store (camelCase)
 * — hoist ออกมาจาก AppShell (Tier C C3) เพื่อแชร์ระหว่าง:
 *   - AppShell: per-table realtime channels + reconcile-from-blob
 *   - lib/store callRpc: apply แถว authoritative ที่ RPC คืน + repair (refetch ตอน RPC fail)
 * ฝั่ง *ToRow แนบ writer_id = CLIENT_ID เป็น echo key ให้ channel ของแท็บตัวเอง suppress ได้
 */
import { CLIENT_ID } from './supabase-storage'
import type {
  AuditLog, Expense, InventoryItem, InventoryTransaction, MaintenanceLog, AddOnItem,
  Guest, Staff, User, CorporateAccount, CorporateTransaction, Room, HousekeepingTask,
  Booking, Invoice, BookingAddOn, DynamicPricing,
} from '@/types'

// แปลงแถว audit_logs (snake_case จาก Supabase) → AuditLog (camelCase)
export function rowToAuditLog(r: Record<string, unknown>): AuditLog {
  return {
    id: String(r.id),
    timestamp: String(r.timestamp),
    staffId: String(r.staff_id ?? ''),
    staffName: String(r.staff_name ?? ''),
    category: r.category as AuditLog['category'],
    action: String(r.action ?? ''),
    summary: String(r.summary ?? ''),
    entityId: r.entity_id != null ? String(r.entity_id) : undefined,
  }
}

// แปลงแถว expenses (snake_case จาก Supabase) → Expense (camelCase)
export function rowToExpense(r: Record<string, unknown>): Expense {
  return {
    id: String(r.id),
    date: String(r.date),
    category: r.category as Expense['category'],
    description: String(r.description ?? ''),
    payee: r.payee != null ? String(r.payee) : undefined,
    amount: Number(r.amount ?? 0),
    note: r.note != null ? String(r.note) : undefined,
    receiptPath: r.receipt_path != null ? String(r.receipt_path) : undefined,
    createdAt: String(r.created_at ?? r.date),
  }
}

// แปลงแถว inventory_items (snake_case) → InventoryItem (camelCase)
export function rowToInventoryItem(r: Record<string, unknown>): InventoryItem {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    category: r.category as InventoryItem['category'],
    unit: r.unit as InventoryItem['unit'],
    currentStock: Number(r.current_stock ?? 0),
    minStock: Number(r.min_stock ?? 0),
    maxStock: Number(r.max_stock ?? 0),
    costPerUnit: Number(r.cost_per_unit ?? 0),
    supplier: r.supplier != null ? String(r.supplier) : undefined,
    lastRestocked: String(r.last_restocked ?? ''),
    notes: r.notes != null ? String(r.notes) : undefined,
  }
}

// แปลงแถว inventory_transactions (snake_case) → InventoryTransaction (camelCase)
export function rowToInventoryTx(r: Record<string, unknown>): InventoryTransaction {
  return {
    id: String(r.id),
    itemId: String(r.item_id),
    type: r.type as InventoryTransaction['type'],
    quantity: Number(r.quantity ?? 0),
    referenceId: r.reference_id != null ? String(r.reference_id) : undefined,
    performedBy: String(r.performed_by ?? ''),
    date: String(r.date ?? ''),
    notes: r.notes != null ? String(r.notes) : undefined,
  }
}

// แปลงแถว maintenance_logs (snake_case) → MaintenanceLog (camelCase)
export function rowToMaintenanceLog(r: Record<string, unknown>): MaintenanceLog {
  return {
    id: String(r.id),
    roomId: String(r.room_id),
    roomNumber: String(r.room_number ?? ''),
    issue: String(r.issue ?? ''),
    description: String(r.description ?? ''),
    status: r.status as MaintenanceLog['status'],
    priority: r.priority as MaintenanceLog['priority'],
    reportedBy: String(r.reported_by ?? ''),
    reportedAt: String(r.reported_at ?? ''),
    assignedTo: r.assigned_to != null ? String(r.assigned_to) : undefined,
    resolvedAt: r.resolved_at != null ? String(r.resolved_at) : undefined,
    cost: r.cost != null ? Number(r.cost) : undefined,
  }
}

// แปลง MaintenanceLog → row (snake_case) สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
export function maintLogToRow(l: MaintenanceLog) {
  return {
    id: l.id, room_id: l.roomId, room_number: l.roomNumber,
    issue: l.issue, description: l.description, status: l.status,
    priority: l.priority, reported_by: l.reportedBy, reported_at: l.reportedAt,
    assigned_to: l.assignedTo ?? null, resolved_at: l.resolvedAt ?? null,
    cost: l.cost ?? null, writer_id: CLIENT_ID,
  }
}

// แปลงแถว add_on_items (snake_case) → AddOnItem (camelCase)
export function rowToAddOnItem(r: Record<string, unknown>): AddOnItem {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    category: r.category as AddOnItem['category'],
    price: Number(r.price ?? 0),
    inventoryItemId: r.inventory_item_id != null ? String(r.inventory_item_id) : undefined,
    inventoryQtyPerUnit: Number(r.inventory_qty_per_unit ?? 0),
    isAvailable: Boolean(r.is_available),
  }
}

// แปลง AddOnItem → row (snake_case) สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
export function addOnItemToRow(a: AddOnItem) {
  return {
    id: a.id, name: a.name, category: a.category, price: a.price,
    inventory_item_id: a.inventoryItemId ?? null,
    inventory_qty_per_unit: a.inventoryQtyPerUnit,
    is_available: a.isAvailable, writer_id: CLIENT_ID,
  }
}

// แปลงแถว guests (snake_case) → Guest (camelCase)
export function rowToGuest(r: Record<string, unknown>): Guest {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    phone: String(r.phone ?? ''),
    nationality: String(r.nationality ?? ''),
    idNumber: String(r.id_number ?? ''),
    preferences: (r.preferences ?? {}) as Guest['preferences'],
    totalStays: Number(r.total_stays ?? 0),
    totalSpend: Number(r.total_spend ?? 0),
    joinedAt: String(r.joined_at ?? ''),
  }
}

// แปลง Guest → row (snake_case) สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
export function guestToRow(g: Guest) {
  return {
    id: g.id, name: g.name, email: g.email, phone: g.phone,
    nationality: g.nationality, id_number: g.idNumber, preferences: g.preferences,
    total_stays: g.totalStays, total_spend: g.totalSpend, joined_at: g.joinedAt,
    writer_id: CLIENT_ID,
  }
}

// แปลงแถว staff (snake_case) → Staff (camelCase)
export function rowToStaff(r: Record<string, unknown>): Staff {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    role: r.role as Staff['role'],
    email: String(r.email ?? ''),
    phone: String(r.phone ?? ''),
    avatar: r.avatar != null ? String(r.avatar) : undefined,
    permissions: (r.permissions ?? {}) as Staff['permissions'],
    hireDate: String(r.hire_date ?? ''),
    isActive: Boolean(r.is_active),
  }
}

// แปลง Staff → row (snake_case) สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
export function staffToRow(s: Staff) {
  return {
    id: s.id, name: s.name, role: s.role, email: s.email, phone: s.phone,
    avatar: s.avatar ?? null, permissions: s.permissions,
    hire_date: s.hireDate, is_active: s.isActive, writer_id: CLIENT_ID,
  }
}

// แปลงแถว users (snake_case จาก Supabase) → User (camelCase). password = bcrypt hash
export function rowToUser(r: Record<string, unknown>): User {
  return {
    id: String(r.id),
    username: String(r.username ?? ''),
    password: String(r.password ?? ''),
    staffId: String(r.staff_id ?? ''),
    lastLogin: r.last_login != null ? String(r.last_login) : undefined,
  }
}

// แปลง User → row (snake_case) สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
export function userToRow(u: User) {
  return {
    id: u.id, username: u.username, password: u.password,
    staff_id: u.staffId, last_login: u.lastLogin ?? null, writer_id: CLIENT_ID,
  }
}

// แปลงแถว corporate_accounts (snake_case) → CorporateAccount (camelCase)
export function rowToCorpAccount(r: Record<string, unknown>): CorporateAccount {
  return {
    id: String(r.id),
    companyName: String(r.company_name ?? ''),
    contactPerson: String(r.contact_person ?? ''),
    contactPhone: String(r.contact_phone ?? ''),
    contactEmail: String(r.contact_email ?? ''),
    taxId: r.tax_id != null ? String(r.tax_id) : undefined,
    address: r.address != null ? String(r.address) : undefined,
    totalDeposited: Number(r.total_deposited ?? 0),
    totalUsed: Number(r.total_used ?? 0),
    availableBalance: Number(r.available_balance ?? 0),
    status: r.status as CorporateAccount['status'],
    createdAt: String(r.created_at ?? ''),
    notes: r.notes != null ? String(r.notes) : undefined,
  }
}
// แปลง CorporateAccount → row (snake_case) สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
export function corpAccountToRow(a: CorporateAccount) {
  return {
    id: a.id, company_name: a.companyName, contact_person: a.contactPerson,
    contact_phone: a.contactPhone, contact_email: a.contactEmail,
    tax_id: a.taxId ?? null, address: a.address ?? null,
    total_deposited: a.totalDeposited, total_used: a.totalUsed,
    available_balance: a.availableBalance, status: a.status,
    notes: a.notes ?? null, writer_id: CLIENT_ID,
  }
}
// แปลงแถว corporate_transactions (snake_case) → CorporateTransaction (camelCase)
export function rowToCorpTx(r: Record<string, unknown>): CorporateTransaction {
  return {
    id: String(r.id),
    corporateAccountId: String(r.corporate_account_id ?? ''),
    type: r.type as CorporateTransaction['type'],
    amount: Number(r.amount ?? 0),
    balanceBefore: Number(r.balance_before ?? 0),
    balanceAfter: Number(r.balance_after ?? 0),
    bookingId: r.booking_id != null ? String(r.booking_id) : undefined,
    invoiceId: r.invoice_id != null ? String(r.invoice_id) : undefined,
    performedBy: String(r.performed_by ?? ''),
    date: String(r.date ?? ''),
    notes: r.notes != null ? String(r.notes) : undefined,
  }
}
// แปลง CorporateTransaction → row (snake_case) สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
export function corpTxToRow(t: CorporateTransaction) {
  return {
    id: t.id, corporate_account_id: t.corporateAccountId, type: t.type, amount: t.amount,
    balance_before: t.balanceBefore, balance_after: t.balanceAfter,
    booking_id: t.bookingId ?? null, invoice_id: t.invoiceId ?? null,
    performed_by: t.performedBy, date: t.date, notes: t.notes ?? null, writer_id: CLIENT_ID,
  }
}

// แปลงแถว rooms (snake_case) → Room (camelCase). Tier B ตัวสุดท้าย
export function rowToRoom(r: Record<string, unknown>): Room {
  return {
    id: String(r.id),
    number: String(r.number ?? ''),
    type: r.type as Room['type'],
    floor: Number(r.floor ?? 0),
    wing: r.wing as Room['wing'],
    status: r.status as Room['status'],
    pricePerNight: Number(r.price_per_night ?? 0),
    maxGuests: Number(r.max_guests ?? 0),
    amenities: (r.amenities ?? []) as string[],
    description: String(r.description ?? ''),
    currentGuestId: r.current_guest_id != null ? String(r.current_guest_id) : undefined,
    currentBookingId: r.current_booking_id != null ? String(r.current_booking_id) : undefined,
  }
}
// แปลง Room → row (snake_case) เต็มชุด สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
export function roomToRow(r: Room) {
  return {
    id: r.id, number: r.number, type: r.type, floor: r.floor, wing: r.wing,
    status: r.status, price_per_night: r.pricePerNight, max_guests: r.maxGuests,
    amenities: r.amenities, description: r.description,
    current_guest_id: r.currentGuestId ?? null, current_booking_id: r.currentBookingId ?? null,
    writer_id: CLIENT_ID,
  }
}

// แปลงแถว housekeeping_tasks (snake_case) → HousekeepingTask (camelCase). Tier C kickoff
export function rowToHkTask(r: Record<string, unknown>): HousekeepingTask {
  return {
    id: String(r.id),
    roomId: String(r.room_id ?? ''),
    roomNumber: String(r.room_number ?? ''),
    assignedTo: String(r.assigned_to ?? ''),
    staffId: String(r.staff_id ?? ''),
    status: r.status as HousekeepingTask['status'],
    priority: r.priority as HousekeepingTask['priority'],
    notes: String(r.notes ?? ''),
    scheduledAt: String(r.scheduled_at ?? ''),
    startedAt: r.started_at != null ? String(r.started_at) : undefined,
    completedAt: r.completed_at != null ? String(r.completed_at) : undefined,
  }
}
// แปลง HousekeepingTask → row (snake_case) สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
export function hkTaskToRow(t: HousekeepingTask) {
  return {
    id: t.id, room_id: t.roomId, room_number: t.roomNumber,
    assigned_to: t.assignedTo, staff_id: t.staffId, status: t.status,
    priority: t.priority, notes: t.notes, scheduled_at: t.scheduledAt,
    started_at: t.startedAt ?? null, completed_at: t.completedAt ?? null,
    writer_id: CLIENT_ID,
  }
}

// แปลงแถว bookings (snake_case) → Booking (camelCase). Tier C Phase C2 (hub)
// payments/guest_snapshot เก็บเป็น jsonb ในแถว → กลับเป็น nested object ตรง ๆ
export function rowToBooking(r: Record<string, unknown>): Booking {
  const payments = (r.payments ?? []) as NonNullable<Booking['payments']>
  return {
    id: String(r.id),
    roomId: String(r.room_id ?? ''),
    roomTypeAtBooking: r.room_type_at_booking != null ? (r.room_type_at_booking as Booking['roomTypeAtBooking']) : undefined,
    guestId: r.guest_id != null ? String(r.guest_id) : undefined,
    guestSnapshot: r.guest_snapshot != null ? (r.guest_snapshot as Booking['guestSnapshot']) : undefined,
    checkIn: String(r.check_in ?? ''),
    checkOut: String(r.check_out ?? ''),
    nights: Number(r.nights ?? 0),
    status: r.status as Booking['status'],
    source: r.source as Booking['source'],
    totalAmount: Number(r.total_amount ?? 0),
    paidAmount: Number(r.paid_amount ?? 0),
    adults: Number(r.adults ?? 0),
    children: Number(r.children ?? 0),
    specialRequests: String(r.special_requests ?? ''),
    createdAt: String(r.created_at ?? ''),
    paymentMethod: r.payment_method != null ? (r.payment_method as Booking['paymentMethod']) : undefined,
    corporateAccountId: r.corporate_account_id != null ? String(r.corporate_account_id) : undefined,
    // blob เก็บ true/undefined (ไม่มี false ชัดแจ้ง) → คงรูปเดิมกัน diff ปลอม
    isCorporate: r.is_corporate === true ? true : undefined,
    payments: payments.length > 0 ? payments : undefined,
  }
}
// แปลง Booking → row (snake_case) สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
export function bookingToRow(b: Booking) {
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

// แปลงแถว invoices (snake_case) → Invoice (camelCase); items เก็บเป็น jsonb array
export function rowToInvoice(r: Record<string, unknown>): Invoice {
  return {
    id: String(r.id),
    bookingId: String(r.booking_id ?? ''),
    guestId: r.guest_id != null ? String(r.guest_id) : undefined,
    amount: Number(r.amount ?? 0),
    tax: Number(r.tax ?? 0),
    total: Number(r.total ?? 0),
    status: r.status as Invoice['status'],
    issuedAt: String(r.issued_at ?? ''),
    paidAt: r.paid_at != null ? String(r.paid_at) : undefined,
    paymentMethod: r.payment_method != null ? (r.payment_method as Invoice['paymentMethod']) : undefined,
    items: (r.items ?? []) as Invoice['items'],
  }
}
// แปลง Invoice → row (snake_case) สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
export function invoiceToRow(iv: Invoice) {
  return {
    id: iv.id, booking_id: iv.bookingId, guest_id: iv.guestId ?? null,
    amount: iv.amount, tax: iv.tax, total: iv.total, status: iv.status,
    issued_at: iv.issuedAt, paid_at: iv.paidAt ?? null,
    payment_method: iv.paymentMethod ?? null, items: iv.items, writer_id: CLIENT_ID,
  }
}

// แปลงแถว booking_add_ons (snake_case) → BookingAddOn (camelCase)
export function rowToBookingAddOn(r: Record<string, unknown>): BookingAddOn {
  return {
    id: String(r.id),
    bookingId: String(r.booking_id ?? ''),
    addOnItemId: String(r.add_on_item_id ?? ''),
    quantity: Number(r.quantity ?? 0),
    unitPrice: Number(r.unit_price ?? 0),
    totalPrice: Number(r.total_price ?? 0),
    status: r.status as BookingAddOn['status'],
    requestedAt: String(r.requested_at ?? ''),
    requestedBy: String(r.requested_by ?? ''),
    fulfilledAt: r.fulfilled_at != null ? String(r.fulfilled_at) : undefined,
    fulfilledBy: r.fulfilled_by != null ? String(r.fulfilled_by) : undefined,
    notes: r.notes != null ? String(r.notes) : undefined,
  }
}
// แปลง BookingAddOn → row (snake_case) สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
export function bookingAddOnToRow(a: BookingAddOn) {
  return {
    id: a.id, booking_id: a.bookingId, add_on_item_id: a.addOnItemId,
    quantity: a.quantity, unit_price: a.unitPrice, total_price: a.totalPrice,
    status: a.status, requested_at: a.requestedAt, requested_by: a.requestedBy,
    fulfilled_at: a.fulfilledAt ?? null, fulfilled_by: a.fulfilledBy ?? null,
    notes: a.notes ?? null, writer_id: CLIENT_ID,
  }
}

// แปลงแถว dynamic_pricing (snake_case) → DynamicPricing (camelCase) — Phase 4 (slice สุดท้าย)
export function rowToDynamicPricing(r: Record<string, unknown>): DynamicPricing {
  return {
    id: String(r.id),
    roomType: r.room_type as DynamicPricing['roomType'],
    name: String(r.name ?? ''),
    startDate: String(r.start_date ?? ''),
    endDate: String(r.end_date ?? ''),
    price: Number(r.price ?? 0),
    description: r.description != null ? String(r.description) : undefined,
  }
}
// แปลง DynamicPricing → row (snake_case) สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
export function dynamicPricingToRow(d: DynamicPricing) {
  return {
    id: d.id, room_type: d.roomType, name: d.name,
    start_date: d.startDate, end_date: d.endDate, price: d.price,
    description: d.description ?? null, writer_id: CLIENT_ID,
  }
}
