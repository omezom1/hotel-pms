'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import GlobalSearch from '@/components/GlobalSearch'
import { useAuthStore } from '@/lib/auth-store'
import { useHotelStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { CLIENT_ID, applyRemoteState, setLastSeenVersion, registerSaveErrorHandler } from '@/lib/supabase-storage'
import { getRequiredPermission } from '@/lib/route-permissions'
import type { AuditLog, Expense, InventoryItem, InventoryTransaction, MaintenanceLog, AddOnItem, Guest, Staff, User, CorporateAccount, CorporateTransaction, Room, HousekeepingTask } from '@/types'
import { hashPassword } from '@/lib/auth-utils'
import { toast } from 'sonner'

const STORE_KEY = 'hotel-pms-storage'

// แปลงแถว audit_logs (snake_case จาก Supabase) → AuditLog (camelCase)
function rowToAuditLog(r: Record<string, unknown>): AuditLog {
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
function rowToExpense(r: Record<string, unknown>): Expense {
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
function rowToInventoryItem(r: Record<string, unknown>): InventoryItem {
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
function rowToInventoryTx(r: Record<string, unknown>): InventoryTransaction {
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
function rowToMaintenanceLog(r: Record<string, unknown>): MaintenanceLog {
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
function maintLogToRow(l: MaintenanceLog) {
  return {
    id: l.id, room_id: l.roomId, room_number: l.roomNumber,
    issue: l.issue, description: l.description, status: l.status,
    priority: l.priority, reported_by: l.reportedBy, reported_at: l.reportedAt,
    assigned_to: l.assignedTo ?? null, resolved_at: l.resolvedAt ?? null,
    cost: l.cost ?? null, writer_id: CLIENT_ID,
  }
}

// แปลงแถว add_on_items (snake_case) → AddOnItem (camelCase)
function rowToAddOnItem(r: Record<string, unknown>): AddOnItem {
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
function addOnItemToRow(a: AddOnItem) {
  return {
    id: a.id, name: a.name, category: a.category, price: a.price,
    inventory_item_id: a.inventoryItemId ?? null,
    inventory_qty_per_unit: a.inventoryQtyPerUnit,
    is_available: a.isAvailable, writer_id: CLIENT_ID,
  }
}

// แปลงแถว guests (snake_case) → Guest (camelCase)
function rowToGuest(r: Record<string, unknown>): Guest {
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
function guestToRow(g: Guest) {
  return {
    id: g.id, name: g.name, email: g.email, phone: g.phone,
    nationality: g.nationality, id_number: g.idNumber, preferences: g.preferences,
    total_stays: g.totalStays, total_spend: g.totalSpend, joined_at: g.joinedAt,
    writer_id: CLIENT_ID,
  }
}

// แปลงแถว staff (snake_case) → Staff (camelCase)
function rowToStaff(r: Record<string, unknown>): Staff {
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
function staffToRow(s: Staff) {
  return {
    id: s.id, name: s.name, role: s.role, email: s.email, phone: s.phone,
    avatar: s.avatar ?? null, permissions: s.permissions,
    hire_date: s.hireDate, is_active: s.isActive, writer_id: CLIENT_ID,
  }
}

// แปลงแถว users (snake_case จาก Supabase) → User (camelCase). password = bcrypt hash
function rowToUser(r: Record<string, unknown>): User {
  return {
    id: String(r.id),
    username: String(r.username ?? ''),
    password: String(r.password ?? ''),
    staffId: String(r.staff_id ?? ''),
    lastLogin: r.last_login != null ? String(r.last_login) : undefined,
  }
}

// แปลง User → row (snake_case) สำหรับ reconcile upsert จาก blob (+ writer_id echo key)
function userToRow(u: User) {
  return {
    id: u.id, username: u.username, password: u.password,
    staff_id: u.staffId, last_login: u.lastLogin ?? null, writer_id: CLIENT_ID,
  }
}

// แปลงแถว corporate_accounts (snake_case) → CorporateAccount (camelCase)
function rowToCorpAccount(r: Record<string, unknown>): CorporateAccount {
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
function corpAccountToRow(a: CorporateAccount) {
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
function rowToCorpTx(r: Record<string, unknown>): CorporateTransaction {
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
function corpTxToRow(t: CorporateTransaction) {
  return {
    id: t.id, corporate_account_id: t.corporateAccountId, type: t.type, amount: t.amount,
    balance_before: t.balanceBefore, balance_after: t.balanceAfter,
    booking_id: t.bookingId ?? null, invoice_id: t.invoiceId ?? null,
    performed_by: t.performedBy, date: t.date, notes: t.notes ?? null, writer_id: CLIENT_ID,
  }
}

// แปลงแถว rooms (snake_case) → Room (camelCase). Tier B ตัวสุดท้าย
function rowToRoom(r: Record<string, unknown>): Room {
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
function roomToRow(r: Room) {
  return {
    id: r.id, number: r.number, type: r.type, floor: r.floor, wing: r.wing,
    status: r.status, price_per_night: r.pricePerNight, max_guests: r.maxGuests,
    amenities: r.amenities, description: r.description,
    current_guest_id: r.currentGuestId ?? null, current_booking_id: r.currentBookingId ?? null,
    writer_id: CLIENT_ID,
  }
}

// แปลงแถว housekeeping_tasks (snake_case) → HousekeepingTask (camelCase). Tier C kickoff
function rowToHkTask(r: Record<string, unknown>): HousekeepingTask {
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
function hkTaskToRow(t: HousekeepingTask) {
  return {
    id: t.id, room_id: t.roomId, room_number: t.roomNumber,
    assigned_to: t.assignedTo, staff_id: t.staffId, status: t.status,
    priority: t.priority, notes: t.notes, scheduled_at: t.scheduledAt,
    started_at: t.startedAt ?? null, completed_at: t.completedAt ?? null,
    writer_id: CLIENT_ID,
  }
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, hydrated } = useAuthStore()
  // hotel store ใช้ Supabase storage (async) + skipHydration → ต้องสั่ง rehydrate เอง
  const hotelHydrated = useHotelStore((s) => s._hasHydrated)
  const [loadTimedOut, setLoadTimedOut] = useState(false)

  const isAuthRoute = pathname?.startsWith('/login')

  // โหลด state ก้อนใหญ่จาก Supabase ครั้งเดียวตอน mount (กัน mock state เขียนทับ cloud)
  // แล้ว subscribe Realtime: ถ้าแท็บ/เครื่องอื่นเขียนข้อมูล ให้ดึงมา sync ทันที
  // (ลดความเสี่ยง last-write-wins ที่งานของกันและกันหายเมื่อเปิดหลายที่พร้อมกัน)
  useEffect(() => {
    // เขียนขึ้น cloud ไม่สำเร็จ → เตือนผู้ใช้ (ไม่งั้นงานหายเงียบ ๆ)
    registerSaveErrorHandler((msg) =>
      toast.error('บันทึกขึ้นคลาวด์ไม่สำเร็จ', {
        description: `${msg} — ข้อมูลล่าสุดอาจยังไม่ถูกบันทึก ลองทำรายการอีกครั้ง`,
        duration: 7000,
      })
    )

    const channel = supabase
      .channel('app_state-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_state', filter: `id=eq.${STORE_KEY}` },
        (payload) => {
          const row = payload.new as { data?: Record<string, unknown>; version?: number } | null
          // อัปเดตเลข version ที่จำไว้เสมอ (รวม echo ของเราเอง) เพื่อให้ CAS ครั้งหน้าใช้ฐานล่าสุด
          if (typeof row?.version === 'number') setLastSeenVersion(row.version)
          const data = row?.data
          // ข้าม event ที่เกิดจากการเขียนของแท็บนี้เอง (echo)
          if (!data || data._writer === CLIENT_ID) return
          const { _writer, ...envelope } = data
          const incoming = (envelope as { state?: Record<string, unknown> }).state
          if (!incoming) return
          // auditLogs/expenses/inventory/maintenance/add_on_items/guests ย้ายไปตารางจริงแล้ว — strip ออกจาก full-state sync ของ blob
          // (ไม่งั้นจะมาทับ/ชุบชีวิตสิ่งที่ per-table sync เพิ่ง apply → 2 แท็บไม่ตรงกัน)
          const {
            auditLogs: _migAudit, expenses: _migExp,
            inventoryItems: _migInvItems, inventoryTransactions: _migInvTx,
            maintenanceLogs: _migMaint, addOnItems: _migAddOn, guests: _migGuests,
            staff: _migStaff, users: _migUsers,
            corporateAccounts: _migCorpAcc, corporateTransactions: _migCorpTx,
            rooms: _migRooms, housekeepingTasks: _migHk,
            ...rest
          } = incoming
          // apply แบบไม่เขียนกลับ cloud (กัน ping-pong loop)
          applyRemoteState(() => useHotelStore.setState(rest as never))
        }
      )
      .subscribe()

    // ── audit_logs relational sync (Phase 1, strangler) ─────────────────────
    // entity แรกที่ย้ายจาก blob → ตารางจริง. ลำดับ: subscribe → buffer → seed
    // (event ที่เข้ามาระหว่าง boot ถูก buffer ไว้ ไม่ตกหล่น) + merge แบบ dedup-by-id
    let auditLive = false
    const auditBuffer: AuditLog[] = []

    // รวม entry ใหม่เข้ากับ auditLogs เดิมแบบ dedup ตาม id → sort เวลาใหม่→เก่า → cap 500
    // (entry เดียวกันมาได้ทั้งจาก optimistic set, realtime echo, และ seed → กันนับซ้ำ)
    const upsertAuditLogs = (incoming: AuditLog[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map<string, AuditLog>()
          for (const e of [...incoming, ...s.auditLogs]) {
            if (!byId.has(e.id)) byId.set(e.id, e)
          }
          const merged = Array.from(byId.values())
            .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
            .slice(0, 500)
          return { auditLogs: merged }
        })
      )
    }

    const auditChannel = supabase
      .channel('audit_logs-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null
          if (!row) return
          // ข้าม echo ของแท็บนี้เอง (เขียนเองมีใน state แล้วผ่าน optimistic set)
          if (row.writer_id === CLIENT_ID) return
          const entry = rowToAuditLog(row)
          if (!auditLive) {
            auditBuffer.push(entry) // ยัง seed ไม่เสร็จ → พักไว้ก่อน
            return
          }
          upsertAuditLogs([entry])
        }
      )
      .subscribe()

    // ── expenses relational sync (Tier A, strangler — entity แรกที่ mutable) ──
    // ต่างจาก audit (append-only): มี UPDATE/DELETE → ฟัง event '*' + ใช้ soft-delete
    // (deleted_at != null = ลบ → เอาออกจาก state; อื่น ๆ = upsert by id)
    let expensesLive = false
    type ExpenseEvent = { id: string; deleted: boolean; expense: Expense }
    const expensesBuffer: ExpenseEvent[] = []

    // apply ชุด event ทับ state.expenses เดิม (upsert/remove by id) → sort ใหม่→เก่า
    const applyExpenseEvents = (events: ExpenseEvent[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map(s.expenses.map((e) => [e.id, e]))
          for (const ev of events) {
            if (ev.deleted) byId.delete(ev.id)
            else byId.set(ev.id, ev.expense)
          }
          const merged = Array.from(byId.values()).sort((a, b) =>
            a.createdAt < b.createdAt ? 1 : -1
          )
          return { expenses: merged }
        })
      )
    }

    const expensesChannel = supabase
      .channel('expenses-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses' },
        (payload) => {
          // soft-delete = UPDATE(deleted_at); hard DELETE (เผื่อไว้) ใช้ payload.old
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null
          if (!row) return
          if (row.writer_id === CLIENT_ID) return // echo ของแท็บนี้เอง
          const ev: ExpenseEvent = {
            id: String(row.id),
            deleted: payload.eventType === 'DELETE' || row.deleted_at != null,
            expense: rowToExpense(row),
          }
          if (!expensesLive) {
            expensesBuffer.push(ev) // ยัง seed ไม่เสร็จ → พักไว้ก่อน
            return
          }
          applyExpenseEvents([ev])
        }
      )
      .subscribe()

    // ── inventory relational sync (Tier A, strangler) — 2 entity ────────────
    // inventory_items = mutable (event '*' + soft-delete เหมือน expenses)
    let itemsLive = false
    type InvItemEvent = { id: string; deleted: boolean; item: InventoryItem }
    const itemsBuffer: InvItemEvent[] = []
    const applyInventoryItemEvents = (events: InvItemEvent[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map(s.inventoryItems.map((i) => [i.id, i]))
          for (const ev of events) {
            if (ev.deleted) byId.delete(ev.id)
            else byId.set(ev.id, ev.item)
          }
          return { inventoryItems: Array.from(byId.values()) }
        })
      )
    }
    const itemsChannel = supabase
      .channel('inventory_items-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null
          if (!row) return
          if (row.writer_id === CLIENT_ID) return // echo ของแท็บนี้เอง
          const ev: InvItemEvent = {
            id: String(row.id),
            deleted: payload.eventType === 'DELETE' || row.deleted_at != null,
            item: rowToInventoryItem(row),
          }
          if (!itemsLive) {
            itemsBuffer.push(ev)
            return
          }
          applyInventoryItemEvents([ev])
        }
      )
      .subscribe()

    // inventory_transactions = append-only ledger (INSERT เหมือน audit_logs)
    let txLive = false
    const txBuffer: InventoryTransaction[] = []
    const upsertInventoryTx = (incoming: InventoryTransaction[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map<string, InventoryTransaction>()
          for (const t of [...incoming, ...s.inventoryTransactions]) {
            if (!byId.has(t.id)) byId.set(t.id, t)
          }
          const merged = Array.from(byId.values()).sort((a, b) => (a.date < b.date ? 1 : -1))
          return { inventoryTransactions: merged }
        })
      )
    }
    const txChannel = supabase
      .channel('inventory_transactions-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inventory_transactions' },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null
          if (!row) return
          if (row.writer_id === CLIENT_ID) return
          const tx = rowToInventoryTx(row)
          if (!txLive) {
            txBuffer.push(tx)
            return
          }
          upsertInventoryTx([tx])
        }
      )
      .subscribe()

    // ── maintenance_logs relational sync (Tier A) — mutable + soft-delete (เหมือน expenses) ──
    let maintLive = false
    type MaintEvent = { id: string; deleted: boolean; log: MaintenanceLog }
    const maintBuffer: MaintEvent[] = []
    const applyMaintEvents = (events: MaintEvent[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map(s.maintenanceLogs.map((l) => [l.id, l]))
          for (const ev of events) {
            if (ev.deleted) byId.delete(ev.id)
            else byId.set(ev.id, ev.log)
          }
          const merged = Array.from(byId.values()).sort((a, b) =>
            a.reportedAt < b.reportedAt ? 1 : -1
          )
          return { maintenanceLogs: merged }
        })
      )
    }
    const maintenanceChannel = supabase
      .channel('maintenance_logs-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_logs' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null
          if (!row) return
          if (row.writer_id === CLIENT_ID) return // echo ของแท็บนี้เอง
          const ev: MaintEvent = {
            id: String(row.id),
            deleted: payload.eventType === 'DELETE' || row.deleted_at != null,
            log: rowToMaintenanceLog(row),
          }
          if (!maintLive) {
            maintBuffer.push(ev)
            return
          }
          applyMaintEvents([ev])
        }
      )
      .subscribe()

    // ── add_on_items relational sync (Tier B kickoff) — read-only catalog ────
    // แอปไม่ mutate (ไม่มี action) แต่ subscribe ไว้กัน edit จาก Dashboard/แท็บอื่น + รองรับ reconcile echo
    let addOnLive = false
    type AddOnEvent = { id: string; deleted: boolean; item: AddOnItem }
    const addOnBuffer: AddOnEvent[] = []
    const applyAddOnEvents = (events: AddOnEvent[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map(s.addOnItems.map((a) => [a.id, a]))
          for (const ev of events) {
            if (ev.deleted) byId.delete(ev.id)
            else byId.set(ev.id, ev.item)
          }
          return { addOnItems: Array.from(byId.values()) }
        })
      )
    }
    const addOnChannel = supabase
      .channel('add_on_items-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'add_on_items' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null
          if (!row) return
          if (row.writer_id === CLIENT_ID) return // echo ของแท็บนี้เอง
          const ev: AddOnEvent = {
            id: String(row.id),
            deleted: payload.eventType === 'DELETE' || row.deleted_at != null,
            item: rowToAddOnItem(row),
          }
          if (!addOnLive) {
            addOnBuffer.push(ev)
            return
          }
          applyAddOnEvents([ev])
        }
      )
      .subscribe()

    // ── guests relational sync (Tier B) — mutable (add/update) + side-effect totalStays/totalSpend ตอนเช็คเอาต์ ──
    let guestsLive = false
    type GuestEvent = { id: string; deleted: boolean; guest: Guest }
    const guestsBuffer: GuestEvent[] = []
    const applyGuestEvents = (events: GuestEvent[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map(s.guests.map((g) => [g.id, g]))
          for (const ev of events) {
            if (ev.deleted) byId.delete(ev.id)
            else byId.set(ev.id, ev.guest)
          }
          return { guests: Array.from(byId.values()) }
        })
      )
    }
    const guestsChannel = supabase
      .channel('guests-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guests' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null
          if (!row) return
          if (row.writer_id === CLIENT_ID) return // echo ของแท็บนี้เอง
          const ev: GuestEvent = {
            id: String(row.id),
            deleted: payload.eventType === 'DELETE' || row.deleted_at != null,
            guest: rowToGuest(row),
          }
          if (!guestsLive) {
            guestsBuffer.push(ev)
            return
          }
          applyGuestEvents([ev])
        }
      )
      .subscribe()

    // ── staff relational sync (Tier B) — mutable CRUD (add/update/delete=soft-delete) ──
    let staffLive = false
    type StaffEvent = { id: string; deleted: boolean; staff: Staff }
    const staffBuffer: StaffEvent[] = []
    const applyStaffEvents = (events: StaffEvent[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map(s.staff.map((st) => [st.id, st]))
          for (const ev of events) {
            if (ev.deleted) byId.delete(ev.id)
            else byId.set(ev.id, ev.staff)
          }
          return { staff: Array.from(byId.values()) }
        })
      )
    }
    const staffChannel = supabase
      .channel('staff-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null
          if (!row) return
          if (row.writer_id === CLIENT_ID) return // echo ของแท็บนี้เอง
          const ev: StaffEvent = {
            id: String(row.id),
            deleted: payload.eventType === 'DELETE' || row.deleted_at != null,
            staff: rowToStaff(row),
          }
          if (!staffLive) {
            staffBuffer.push(ev)
            return
          }
          applyStaffEvents([ev])
        }
      )
      .subscribe()

    // ── users relational sync (Tier B) — mutable CRUD (add/update/delete=soft-delete) ──
    // login อ่าน slice นี้จาก store → ตารางเป็นเจ้าของ; realtime ให้เพิ่ม/แก้บัญชีจากแท็บอื่นเห็นทันที
    let usersLive = false
    type UserEvent = { id: string; deleted: boolean; user: User }
    const usersBuffer: UserEvent[] = []
    const applyUserEvents = (events: UserEvent[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map(s.users.map((u) => [u.id, u]))
          for (const ev of events) {
            if (ev.deleted) byId.delete(ev.id)
            else byId.set(ev.id, ev.user)
          }
          return { users: Array.from(byId.values()) }
        })
      )
    }
    const usersChannel = supabase
      .channel('users-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null
          if (!row) return
          if (row.writer_id === CLIENT_ID) return // echo ของแท็บนี้เอง
          const ev: UserEvent = {
            id: String(row.id),
            deleted: payload.eventType === 'DELETE' || row.deleted_at != null,
            user: rowToUser(row),
          }
          if (!usersLive) {
            usersBuffer.push(ev)
            return
          }
          applyUserEvents([ev])
        }
      )
      .subscribe()

    // ── corporate_accounts relational sync (Tier B) — mutable + soft-delete (เหมือน guests/staff) ──
    let corpAccLive = false
    type CorpAccEvent = { id: string; deleted: boolean; account: CorporateAccount }
    const corpAccBuffer: CorpAccEvent[] = []
    const applyCorpAccEvents = (events: CorpAccEvent[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map(s.corporateAccounts.map((a) => [a.id, a]))
          for (const ev of events) {
            if (ev.deleted) byId.delete(ev.id)
            else byId.set(ev.id, ev.account)
          }
          return { corporateAccounts: Array.from(byId.values()) }
        })
      )
    }
    const corpAccChannel = supabase
      .channel('corporate_accounts-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'corporate_accounts' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null
          if (!row) return
          if (row.writer_id === CLIENT_ID) return
          const ev: CorpAccEvent = {
            id: String(row.id),
            deleted: payload.eventType === 'DELETE' || row.deleted_at != null,
            account: rowToCorpAccount(row),
          }
          if (!corpAccLive) { corpAccBuffer.push(ev); return }
          applyCorpAccEvents([ev])
        }
      )
      .subscribe()

    // ── corporate_transactions relational sync (Tier B) — append-only ledger (เหมือน inventory_transactions) ──
    let corpTxLive = false
    const corpTxBuffer: CorporateTransaction[] = []
    const upsertCorpTx = (incoming: CorporateTransaction[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map<string, CorporateTransaction>()
          for (const t of [...incoming, ...s.corporateTransactions]) {
            if (!byId.has(t.id)) byId.set(t.id, t)
          }
          const merged = Array.from(byId.values()).sort((a, b) => (a.date < b.date ? 1 : -1))
          return { corporateTransactions: merged }
        })
      )
    }
    const corpTxChannel = supabase
      .channel('corporate_transactions-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'corporate_transactions' },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null
          if (!row) return
          if (row.writer_id === CLIENT_ID) return
          const tx = rowToCorpTx(row)
          if (!corpTxLive) { corpTxBuffer.push(tx); return }
          upsertCorpTx([tx])
        }
      )
      .subscribe()

    // ── rooms relational sync (Tier B ตัวสุดท้าย) — เปลี่ยนเฉพาะ status + occupancy pointers ผ่าน lifecycle ──
    //    ไม่มี delete action (ชุดคงที่); upsert by id เหมือน guests/staff (soft-delete slot รองรับไว้)
    let roomsLive = false
    type RoomEvent = { id: string; deleted: boolean; room: Room }
    const roomsBuffer: RoomEvent[] = []
    const applyRoomEvents = (events: RoomEvent[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map(s.rooms.map((r) => [r.id, r]))
          for (const ev of events) {
            if (ev.deleted) byId.delete(ev.id)
            else byId.set(ev.id, ev.room)
          }
          return { rooms: Array.from(byId.values()) }
        })
      )
    }
    const roomsChannel = supabase
      .channel('rooms-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null
          if (!row) return
          if (row.writer_id === CLIENT_ID) return // echo ของแท็บนี้เอง
          const ev: RoomEvent = {
            id: String(row.id),
            deleted: payload.eventType === 'DELETE' || row.deleted_at != null,
            room: rowToRoom(row),
          }
          if (!roomsLive) { roomsBuffer.push(ev); return }
          applyRoomEvents([ev])
        }
      )
      .subscribe()

    // ── housekeeping_tasks relational sync (Tier C kickoff) — mutable + soft-delete (เหมือน guests/staff/rooms) ──
    let hkLive = false
    type HkEvent = { id: string; deleted: boolean; task: HousekeepingTask }
    const hkBuffer: HkEvent[] = []
    const applyHkEvents = (events: HkEvent[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map(s.housekeepingTasks.map((t) => [t.id, t]))
          for (const ev of events) {
            if (ev.deleted) byId.delete(ev.id)
            else byId.set(ev.id, ev.task)
          }
          return { housekeepingTasks: Array.from(byId.values()) }
        })
      )
    }
    const hkChannel = supabase
      .channel('housekeeping_tasks-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'housekeeping_tasks' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null
          if (!row) return
          if (row.writer_id === CLIENT_ID) return // echo ของแท็บนี้เอง
          const ev: HkEvent = {
            id: String(row.id),
            deleted: payload.eventType === 'DELETE' || row.deleted_at != null,
            task: rowToHkTask(row),
          }
          if (!hkLive) { hkBuffer.push(ev); return }
          applyHkEvents([ev])
        }
      )
      .subscribe()

    // ⚠️ ต้อง AWAIT อ่าน app_state ให้เสร็จ "ก่อน" เรียก rehydrate (deterministic ไม่ใช่ race)
    // เหตุผล: rehydrate จะ trigger persist write ครั้งแรก (onRehydrateStorage setState _hasHydrated)
    // ที่ partialize ตัด migrated slice ทิ้งจาก blob. ถ้าอ่านหลัง/พร้อมกับ rehydrate อาจได้ค่าว่าง →
    // reconcile เข้าใจผิดว่า "ไม่มีใน blob" → soft-delete ของจริงทิ้ง (เคยทำ add_on_items/maintenance หาย).
    // await ก่อนเรียก rehydrate = strip-write ยังไม่ถูกสร้าง → snapshot pre-strip การันตี 100%
    ;(async () => {
      const bootBlob = await supabase
        .from('app_state').select('data').eq('id', STORE_KEY).maybeSingle()
      const bootState = ((bootBlob.data?.data as { state?: Record<string, unknown> } | null)?.state) ?? {}

      // rehydrate blob ให้เสร็จก่อน แล้วค่อย seed audit + expenses จากตาราง
      // (กัน rehydrate.merge เขียนทับสิ่งที่ seed มา — blob ยังพก slice เหล่านี้อยู่ช่วง dual-write)
      await useHotelStore.persist.rehydrate()
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) {
        console.error('[audit-sync] seed:', error.message)
      } else {
        const snapshot = (data ?? []).map(rowToAuditLog)
        upsertAuditLogs([...snapshot, ...auditBuffer])
      }
      auditBuffer.length = 0
      auditLive = true

      // seed expenses (กรอง soft-deleted); ถ้าตารางว่างแต่ blob มีของ → backfill ครั้งเดียว
      const { data: expData, error: expErr } = await supabase
        .from('expenses')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (expErr) {
        console.error('[expenses-sync] seed:', expErr.message)
      } else {
        let rows = expData ?? []
        // backfill: ตาราง expenses (สร้างใน 005) ว่าง แต่ของจริงยังอยู่ใน blob →
        // ยกขึ้นตารางครั้งเดียว (idempotent ด้วย upsert onConflict id) ก่อนถอด blob (step 3)
        const local = useHotelStore.getState().expenses
        if (rows.length === 0 && local.length > 0) {
          const { error: bfErr } = await supabase.from('expenses').upsert(
            local.map((e) => ({
              id: e.id, date: e.date, category: e.category, description: e.description,
              payee: e.payee ?? null, amount: e.amount, note: e.note ?? null,
              receipt_path: e.receiptPath ?? null, writer_id: CLIENT_ID,
            })),
            { onConflict: 'id' }
          )
          if (bfErr) console.error('[expenses-sync] backfill:', bfErr.message)
          else {
            const re = await supabase
              .from('expenses').select('*').is('deleted_at', null)
              .order('created_at', { ascending: false })
            rows = re.data ?? rows
          }
        }
        const snapshot = rows.map(rowToExpense)
        // seed = authoritative: แทนที่ทั้ง slice ด้วย snapshot จากตาราง (ไม่ merge ทับ initial/mock)
        // ไม่งั้น mock row ที่ user เคยลบ (ไม่มีในตาราง) จะโผล่กลับมา — ตารางเป็นแหล่งจริงคนเดียว
        applyRemoteState(() => useHotelStore.setState({ expenses: snapshot }))
        // event ที่ buffer ไว้ระหว่าง boot (แท็บอื่นแก้) apply ทับ snapshot
        if (expensesBuffer.length) applyExpenseEvents(expensesBuffer)
      }
      expensesBuffer.length = 0
      expensesLive = true

      // ── seed inventory_items (กรอง soft-deleted) + backfill ครั้งเดียวจาก blob ──
      const { data: itemData, error: itemErr } = await supabase
        .from('inventory_items')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (itemErr) {
        console.error('[inventory-items-sync] seed:', itemErr.message)
      } else {
        let rows = itemData ?? []
        const localItems = useHotelStore.getState().inventoryItems
        if (rows.length === 0 && localItems.length > 0) {
          const { error: bfErr } = await supabase.from('inventory_items').upsert(
            localItems.map((i) => ({
              id: i.id, name: i.name, category: i.category, unit: i.unit,
              current_stock: i.currentStock, min_stock: i.minStock, max_stock: i.maxStock,
              cost_per_unit: i.costPerUnit, supplier: i.supplier ?? null,
              last_restocked: i.lastRestocked, notes: i.notes ?? null, writer_id: CLIENT_ID,
            })),
            { onConflict: 'id' }
          )
          if (bfErr) console.error('[inventory-items-sync] backfill:', bfErr.message)
          else {
            const re = await supabase
              .from('inventory_items').select('*').is('deleted_at', null)
              .order('created_at', { ascending: false })
            rows = re.data ?? rows
          }
        }
        applyRemoteState(() => useHotelStore.setState({ inventoryItems: rows.map(rowToInventoryItem) }))
        if (itemsBuffer.length) applyInventoryItemEvents(itemsBuffer)
      }
      itemsBuffer.length = 0
      itemsLive = true

      // ── seed inventory_transactions (ledger) + backfill (หลัง items เพราะ FK item_id) ──
      // backfill กรอง tx ที่อ้าง item ซึ่งถูกลบไปแล้ว (ไม่อยู่ในตาราง items) กัน FK violation
      const { data: txData, error: txErr } = await supabase
        .from('inventory_transactions')
        .select('*')
        .order('created_at', { ascending: false })
      if (txErr) {
        console.error('[inventory-tx-sync] seed:', txErr.message)
      } else {
        let rows = txData ?? []
        const localTx = useHotelStore.getState().inventoryTransactions
        if (rows.length === 0 && localTx.length > 0) {
          const liveItemIds = new Set(useHotelStore.getState().inventoryItems.map((i) => i.id))
          const insertable = localTx.filter((t) => liveItemIds.has(t.itemId))
          if (insertable.length > 0) {
            const { error: bfErr } = await supabase.from('inventory_transactions').upsert(
              insertable.map((t) => ({
                id: t.id, item_id: t.itemId, type: t.type, quantity: t.quantity,
                reference_id: t.referenceId ?? null, performed_by: t.performedBy,
                date: t.date, notes: t.notes ?? null, writer_id: CLIENT_ID,
              })),
              { onConflict: 'id' }
            )
            if (bfErr) console.error('[inventory-tx-sync] backfill:', bfErr.message)
            else {
              const re = await supabase
                .from('inventory_transactions').select('*')
                .order('created_at', { ascending: false })
              rows = re.data ?? rows
            }
          }
        }
        applyRemoteState(() => useHotelStore.setState({ inventoryTransactions: rows.map(rowToInventoryTx) }))
        if (txBuffer.length) upsertInventoryTx(txBuffer)
      }
      txBuffer.length = 0
      txLive = true

      // ── seed maintenance_logs (กรอง soft-deleted) + one-time reconcile จาก blob ──
      // ตาราง 001 มี orphan seed ที่ stale (content ต่างจาก blob — เช่น resolvedAt เลื่อน)
      // → guard rows.length===0 ใช้ไม่ได้; ใช้ "ยังไม่เคย cutover" = ไม่มีแถวที่มี writer_id
      //   แล้ว reconcile จาก blob (แหล่งจริง ยังพก maintenanceLogs อยู่): upsert ทับ orphan ที่ stale
      //   + soft-delete แถวที่ blob ไม่มี (เคลียร์ orphan ส่วนเกิน)
      const { data: mlData, error: mlErr } = await supabase
        .from('maintenance_logs')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (mlErr) {
        console.error('[maintenance-sync] seed:', mlErr.message)
      } else {
        let rows = mlData ?? []
        const everWritten = rows.some((r) => r.writer_id != null)
        if (!everWritten) {
          // ใช้ bootState ที่ await ไว้ "ก่อน" rehydrate (pre-strip การันตี)
          const blobLogs = (bootState.maintenanceLogs ?? []) as MaintenanceLog[]
          if (blobLogs.length > 0) {
            const { error: upErr } = await supabase.from('maintenance_logs')
              .upsert(blobLogs.map(maintLogToRow), { onConflict: 'id' })
            if (upErr) console.error('[maintenance-sync] reconcile upsert:', upErr.message)
          }
          // soft-delete orphan ที่ blob ไม่มี (รวมกรณี blobLogs ว่าง → เคลียร์ orphan ทั้งหมด)
          const blobIds = new Set(blobLogs.map((l) => l.id))
          const orphanIds = rows.map((r) => String(r.id)).filter((id) => !blobIds.has(id))
          if (orphanIds.length > 0) {
            const { error: delErr } = await supabase.from('maintenance_logs')
              .update({ deleted_at: new Date().toISOString(), writer_id: CLIENT_ID })
              .in('id', orphanIds)
            if (delErr) console.error('[maintenance-sync] reconcile soft-delete:', delErr.message)
          }
          const re = await supabase
            .from('maintenance_logs').select('*').is('deleted_at', null)
            .order('created_at', { ascending: false })
          rows = re.data ?? rows
        }
        applyRemoteState(() => useHotelStore.setState({ maintenanceLogs: rows.map(rowToMaintenanceLog) }))
        if (maintBuffer.length) applyMaintEvents(maintBuffer)
      }
      maintBuffer.length = 0
      maintLive = true

      // ── seed add_on_items (read-only catalog) + one-time reconcile จาก blob ──
      // เหมือน maintenance: ตาราง 001 มี orphan seed → ใช้ everWritten (writer_id) เป็น flag
      // แล้ว reconcile จาก bootState (await อ่านก่อน rehydrate = pre-strip snapshot การันตี)
      const { data: aoData, error: aoErr } = await supabase
        .from('add_on_items')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (aoErr) {
        console.error('[add-on-sync] seed:', aoErr.message)
      } else {
        let rows = aoData ?? []
        const everWritten = rows.some((r) => r.writer_id != null)
        if (!everWritten) {
          const blobItems = (bootState.addOnItems ?? []) as AddOnItem[]
          if (blobItems.length > 0) {
            const { error: upErr } = await supabase.from('add_on_items')
              .upsert(blobItems.map(addOnItemToRow), { onConflict: 'id' })
            if (upErr) console.error('[add-on-sync] reconcile upsert:', upErr.message)
          }
          const blobIds = new Set(blobItems.map((a) => a.id))
          const orphanIds = rows.map((r) => String(r.id)).filter((id) => !blobIds.has(id))
          if (orphanIds.length > 0) {
            const { error: delErr } = await supabase.from('add_on_items')
              .update({ deleted_at: new Date().toISOString(), writer_id: CLIENT_ID })
              .in('id', orphanIds)
            if (delErr) console.error('[add-on-sync] reconcile soft-delete:', delErr.message)
          }
          const re = await supabase
            .from('add_on_items').select('*').is('deleted_at', null)
            .order('created_at', { ascending: false })
          rows = re.data ?? rows
        }
        applyRemoteState(() => useHotelStore.setState({ addOnItems: rows.map(rowToAddOnItem) }))
        if (addOnBuffer.length) applyAddOnEvents(addOnBuffer)
      }
      addOnBuffer.length = 0
      addOnLive = true

      // ── seed guests (Tier B) + one-time reconcile จาก blob ──
      // เหมือน maintenance/add_on_items: ตาราง 001 มี orphan seed (g001–g006) ที่ stale
      // (blob คือแหล่งจริง — ผู้ใช้แก้โปรไฟล์ + totalStays/totalSpend ขยับจาก checkout สะสมมา)
      // → everWritten (writer_id) เป็น flag, reconcile จาก bootState (await อ่านก่อน rehydrate = pre-strip การันตี)
      const { data: gData, error: gErr } = await supabase
        .from('guests')
        .select('*')
        .is('deleted_at', null)
        .order('name', { ascending: true })
      if (gErr) {
        console.error('[guests-sync] seed:', gErr.message)
      } else {
        let rows = gData ?? []
        const everWritten = rows.some((r) => r.writer_id != null)
        if (!everWritten) {
          const blobGuests = (bootState.guests ?? []) as Guest[]
          if (blobGuests.length > 0) {
            const { error: upErr } = await supabase.from('guests')
              .upsert(blobGuests.map(guestToRow), { onConflict: 'id' })
            if (upErr) console.error('[guests-sync] reconcile upsert:', upErr.message)
          }
          // soft-delete orphan ที่ blob ไม่มี (รวมกรณี blobGuests ว่าง → เคลียร์ orphan ทั้งหมด)
          const blobIds = new Set(blobGuests.map((g) => g.id))
          const orphanIds = rows.map((r) => String(r.id)).filter((id) => !blobIds.has(id))
          if (orphanIds.length > 0) {
            const { error: delErr } = await supabase.from('guests')
              .update({ deleted_at: new Date().toISOString(), writer_id: CLIENT_ID })
              .in('id', orphanIds)
            if (delErr) console.error('[guests-sync] reconcile soft-delete:', delErr.message)
          }
          const re = await supabase
            .from('guests').select('*').is('deleted_at', null)
            .order('name', { ascending: true })
          rows = re.data ?? rows
        }
        applyRemoteState(() => useHotelStore.setState({ guests: rows.map(rowToGuest) }))
        if (guestsBuffer.length) applyGuestEvents(guestsBuffer)
      }
      guestsBuffer.length = 0
      guestsLive = true

      // ── seed staff (Tier B) + one-time reconcile จาก blob ──
      // เหมือน guests: ตาราง 001 มี orphan seed (s001–s006) → everWritten (writer_id) เป็น flag,
      // reconcile จาก bootState (await อ่านก่อน rehydrate = pre-strip การันตี)
      const { data: stData, error: stErr } = await supabase
        .from('staff')
        .select('*')
        .is('deleted_at', null)
        .order('id', { ascending: true })
      if (stErr) {
        console.error('[staff-sync] seed:', stErr.message)
      } else {
        let rows = stData ?? []
        const everWritten = rows.some((r) => r.writer_id != null)
        if (!everWritten) {
          const blobStaff = (bootState.staff ?? []) as Staff[]
          if (blobStaff.length > 0) {
            const { error: upErr } = await supabase.from('staff')
              .upsert(blobStaff.map(staffToRow), { onConflict: 'id' })
            if (upErr) console.error('[staff-sync] reconcile upsert:', upErr.message)
          }
          const blobIds = new Set(blobStaff.map((s) => s.id))
          const orphanIds = rows.map((r) => String(r.id)).filter((id) => !blobIds.has(id))
          if (orphanIds.length > 0) {
            const { error: delErr } = await supabase.from('staff')
              .update({ deleted_at: new Date().toISOString(), writer_id: CLIENT_ID })
              .in('id', orphanIds)
            if (delErr) console.error('[staff-sync] reconcile soft-delete:', delErr.message)
          }
          const re = await supabase
            .from('staff').select('*').is('deleted_at', null)
            .order('id', { ascending: true })
          rows = re.data ?? rows
        }
        applyRemoteState(() => useHotelStore.setState({ staff: rows.map(rowToStaff) }))
        if (staffBuffer.length) applyStaffEvents(staffBuffer)
      }
      staffBuffer.length = 0
      staffLive = true

      // ── seed users (Tier B) + one-time reconcile จาก blob ──
      // ⚠️ ต่างจาก staff: ตาราง relational มี bcrypt hash ที่ถูกต้องอยู่แล้ว แต่ blob (ถูก reset)
      //    อาจเป็น plaintext → reconcile "รักษา hash ในตารางไว้" (ไม่ downgrade): ใช้ hash เดิมถ้ามี,
      //    user ที่มีเฉพาะใน blob (plaintext) → hash ก่อนเขียน. blob ยังเป็นเจ้าของ membership + lastLogin
      const { data: usData, error: usErr } = await supabase
        .from('users')
        .select('*')
        .is('deleted_at', null)
        .order('id', { ascending: true })
      if (usErr) {
        console.error('[users-sync] seed:', usErr.message)
      } else {
        let rows = usData ?? []
        const everWritten = rows.some((r) => r.writer_id != null)
        if (!everWritten) {
          const blobUsers = (bootState.users ?? []) as User[]
          if (blobUsers.length > 0) {
            const tableHashById = new Map(rows.map((r) => [String(r.id), String(r.password ?? '')]))
            const upsertRows = blobUsers.map((u) => {
              const existing = tableHashById.get(u.id)
              const password = existing && existing.length > 0 ? existing : hashPassword(u.password)
              return userToRow({ ...u, password })
            })
            const { error: upErr } = await supabase.from('users')
              .upsert(upsertRows, { onConflict: 'id' })
            if (upErr) console.error('[users-sync] reconcile upsert:', upErr.message)
          }
          const blobIds = new Set(blobUsers.map((u) => u.id))
          const orphanIds = rows.map((r) => String(r.id)).filter((id) => !blobIds.has(id))
          if (orphanIds.length > 0) {
            const { error: delErr } = await supabase.from('users')
              .update({ deleted_at: new Date().toISOString(), writer_id: CLIENT_ID })
              .in('id', orphanIds)
            if (delErr) console.error('[users-sync] reconcile soft-delete:', delErr.message)
          }
          const re = await supabase
            .from('users').select('*').is('deleted_at', null)
            .order('id', { ascending: true })
          rows = re.data ?? rows
        }
        applyRemoteState(() => useHotelStore.setState({ users: rows.map(rowToUser) }))
        if (usersBuffer.length) applyUserEvents(usersBuffer)
      }
      usersBuffer.length = 0
      usersLive = true

      // ── seed corporate_accounts (Tier B) + one-time reconcile จาก blob ──
      // เหมือน guests/staff: ตาราง 001 มี orphan seed (corp001-003) → everWritten flag, reconcile จาก bootState (pre-strip)
      // corpEverWritten ใช้ร่วมกับ transactions (append-only ledger stamp ไม่ได้ → gate ด้วย accounts ที่ stamp ได้)
      let corpEverWritten = false
      const { data: caData, error: caErr } = await supabase
        .from('corporate_accounts')
        .select('*')
        .is('deleted_at', null)
        .order('id', { ascending: true })
      if (caErr) {
        console.error('[corporate-accounts-sync] seed:', caErr.message)
      } else {
        let rows = caData ?? []
        corpEverWritten = rows.some((r) => r.writer_id != null)
        if (!corpEverWritten) {
          const blobAccounts = (bootState.corporateAccounts ?? []) as CorporateAccount[]
          if (blobAccounts.length > 0) {
            const { error: upErr } = await supabase.from('corporate_accounts')
              .upsert(blobAccounts.map(corpAccountToRow), { onConflict: 'id' })
            if (upErr) console.error('[corporate-accounts-sync] reconcile upsert:', upErr.message)
          }
          const blobIds = new Set(blobAccounts.map((a) => a.id))
          const orphanIds = rows.map((r) => String(r.id)).filter((id) => !blobIds.has(id))
          if (orphanIds.length > 0) {
            const { error: delErr } = await supabase.from('corporate_accounts')
              .update({ deleted_at: new Date().toISOString(), writer_id: CLIENT_ID })
              .in('id', orphanIds)
            if (delErr) console.error('[corporate-accounts-sync] reconcile soft-delete:', delErr.message)
          }
          const re = await supabase
            .from('corporate_accounts').select('*').is('deleted_at', null)
            .order('id', { ascending: true })
          rows = re.data ?? rows
        }
        applyRemoteState(() => useHotelStore.setState({ corporateAccounts: rows.map(rowToCorpAccount) }))
        if (corpAccBuffer.length) applyCorpAccEvents(corpAccBuffer)
      }
      corpAccBuffer.length = 0
      corpAccLive = true

      // ── seed corporate_transactions (ledger) + one-time backfill (หลัง accounts เพราะ FK corp_tx→accounts) ──
      // append-only (RLS = insert+select, ไม่มี update/delete กันแก้ประวัติการเงิน) → stamp orphan ไม่ได้
      // จึง gate ด้วย corpEverWritten (จาก accounts ที่ stamp ได้) + insert-only (ignoreDuplicates) กัน RLS-deny
      // บน ON CONFLICT UPDATE. orphan seed (corp tx เดิม) ที่ id ซ้ำถูกเก็บไว้ (= authoritative หลัง blob strip)
      const { data: ctData, error: ctErr } = await supabase
        .from('corporate_transactions')
        .select('*')
        .order('date', { ascending: false })
      if (ctErr) {
        console.error('[corporate-tx-sync] seed:', ctErr.message)
      } else {
        let rows = ctData ?? []
        if (!corpEverWritten) {
          const blobTx = (bootState.corporateTransactions ?? []) as CorporateTransaction[]
          if (blobTx.length > 0) {
            // INSERT ... ON CONFLICT DO NOTHING (ต้องการแค่ INSERT policy) — insert tx ที่ยังไม่มี, ข้ามที่ id ซ้ำ
            const { error: upErr } = await supabase.from('corporate_transactions')
              .upsert(blobTx.map(corpTxToRow), { onConflict: 'id', ignoreDuplicates: true })
            if (upErr) console.error('[corporate-tx-sync] backfill insert:', upErr.message)
          }
          const re = await supabase
            .from('corporate_transactions').select('*')
            .order('date', { ascending: false })
          rows = re.data ?? rows
        }
        applyRemoteState(() => useHotelStore.setState({ corporateTransactions: rows.map(rowToCorpTx) }))
        if (corpTxBuffer.length) upsertCorpTx(corpTxBuffer)
      }
      corpTxBuffer.length = 0
      corpTxLive = true

      // ── seed rooms (Tier B ตัวสุดท้าย) + one-time reconcile จาก blob ──
      // เหมือน guests/staff: ตาราง 001 มี orphan seed 40 ห้องที่ stale (ราคา/สถานะ/currentBookingId ต่างจาก blob;
      // blob = แหล่งจริง — ผู้ใช้เปลี่ยนชื่อห้อง/ราคา + status ขยับจาก lifecycle สะสมมา)
      // → everWritten (writer_id) เป็น flag, reconcile จาก bootState (await อ่านก่อน rehydrate = pre-strip การันตี)
      const { data: rmData, error: rmErr } = await supabase
        .from('rooms')
        .select('*')
        .is('deleted_at', null)
        .order('id', { ascending: true })
      if (rmErr) {
        console.error('[rooms-sync] seed:', rmErr.message)
      } else {
        let rows = rmData ?? []
        const everWritten = rows.some((r) => r.writer_id != null)
        const blobRooms = (bootState.rooms ?? []) as Room[]
        // reconcile เฉพาะเมื่อ blob ยังมี rooms เป็นแหล่งจริง (blobRooms.length > 0).
        // ⚠️ ถ้า blob ถูก strip ไปแล้ว (cutover เสร็จ) แต่ everWritten ยัง false ด้วยเหตุผิดปกติ
        //    ห้าม soft-delete rooms ทั้งชุดจาก orphan-diff (rooms critical — เคยเจอ blob-strip ทำ reconcile กวาดห้องทิ้ง)
        if (!everWritten && blobRooms.length > 0) {
          const { error: upErr } = await supabase.from('rooms')
            .upsert(blobRooms.map(roomToRow), { onConflict: 'id' })
          if (upErr) console.error('[rooms-sync] reconcile upsert:', upErr.message)
          // soft-delete orphan ที่ blob ไม่มี (ปกติไม่มี — id ตรงกันครบ; FK maintenance_logs.room_id ยัง valid เพราะ soft-delete ไม่ลบแถว)
          const blobIds = new Set(blobRooms.map((r) => r.id))
          const orphanIds = rows.map((r) => String(r.id)).filter((id) => !blobIds.has(id))
          if (orphanIds.length > 0) {
            const { error: delErr } = await supabase.from('rooms')
              .update({ deleted_at: new Date().toISOString(), writer_id: CLIENT_ID })
              .in('id', orphanIds)
            if (delErr) console.error('[rooms-sync] reconcile soft-delete:', delErr.message)
          }
          const re = await supabase
            .from('rooms').select('*').is('deleted_at', null)
            .order('id', { ascending: true })
          rows = re.data ?? rows
        }
        applyRemoteState(() => useHotelStore.setState({ rooms: rows.map(rowToRoom) }))
        if (roomsBuffer.length) applyRoomEvents(roomsBuffer)
      }
      roomsBuffer.length = 0
      roomsLive = true

      // ── seed housekeeping_tasks (Tier C kickoff) + one-time reconcile จาก blob ──
      // เหมือน guests/rooms: ตาราง 001 มี orphan seed (hk001-005) ที่ stale (บาง task status/room ต่างจาก blob;
      // blob = แหล่งจริง) → everWritten (writer_id) เป็น flag, reconcile จาก bootState (await อ่านก่อน rehydrate = pre-strip)
      const { data: hkData, error: hkErr } = await supabase
        .from('housekeeping_tasks')
        .select('*')
        .is('deleted_at', null)
        .order('scheduled_at', { ascending: false })
      if (hkErr) {
        console.error('[housekeeping-sync] seed:', hkErr.message)
      } else {
        let rows = hkData ?? []
        const everWritten = rows.some((r) => r.writer_id != null)
        const blobTasks = (bootState.housekeepingTasks ?? []) as HousekeepingTask[]
        // guard blobTasks.length>0 ก่อน soft-delete (บทเรียน rooms — ห้ามกวาดทิ้งถ้า blob ถูก strip แล้ว)
        if (!everWritten && blobTasks.length > 0) {
          const { error: upErr } = await supabase.from('housekeeping_tasks')
            .upsert(blobTasks.map(hkTaskToRow), { onConflict: 'id' })
          if (upErr) console.error('[housekeeping-sync] reconcile upsert:', upErr.message)
          const blobIds = new Set(blobTasks.map((t) => t.id))
          const orphanIds = rows.map((r) => String(r.id)).filter((id) => !blobIds.has(id))
          if (orphanIds.length > 0) {
            const { error: delErr } = await supabase.from('housekeeping_tasks')
              .update({ deleted_at: new Date().toISOString(), writer_id: CLIENT_ID })
              .in('id', orphanIds)
            if (delErr) console.error('[housekeeping-sync] reconcile soft-delete:', delErr.message)
          }
          const re = await supabase
            .from('housekeeping_tasks').select('*').is('deleted_at', null)
            .order('scheduled_at', { ascending: false })
          rows = re.data ?? rows
        }
        applyRemoteState(() => useHotelStore.setState({ housekeepingTasks: rows.map(rowToHkTask) }))
        if (hkBuffer.length) applyHkEvents(hkBuffer)
      }
      hkBuffer.length = 0
      hkLive = true
    })()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(auditChannel)
      supabase.removeChannel(expensesChannel)
      supabase.removeChannel(itemsChannel)
      supabase.removeChannel(txChannel)
      supabase.removeChannel(maintenanceChannel)
      supabase.removeChannel(addOnChannel)
      supabase.removeChannel(guestsChannel)
      supabase.removeChannel(staffChannel)
      supabase.removeChannel(usersChannel)
      supabase.removeChannel(corpAccChannel)
      supabase.removeChannel(corpTxChannel)
      supabase.removeChannel(roomsChannel)
      supabase.removeChannel(hkChannel)
    }
  }, [])

  // ถ้าโหลดข้อมูลคลาวด์นานผิดปกติ (เน็ตหลุด/Supabase ล่ม) → แสดงปุ่มลองใหม่ ไม่ค้างถาวร
  useEffect(() => {
    if (hotelHydrated) { setLoadTimedOut(false); return }
    const t = setTimeout(() => setLoadTimedOut(true), 12000)
    return () => clearTimeout(t)
  }, [hotelHydrated])

  // AuthGuard: redirect ไป /login ถ้ายังไม่ login
  useEffect(() => {
    if (!hydrated) return
    if (!user && !isAuthRoute) {
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : ''
      router.replace(`/login${next}`)
    }
  }, [hydrated, user, isAuthRoute, pathname, router])

  // PermissionGuard: ถ้า user ไม่มีสิทธิ์เข้าหน้านี้ → ส่งกลับ dashboard
  useEffect(() => {
    if (!hydrated || !user || isAuthRoute || !pathname) return
    const required = getRequiredPermission(pathname)
    if (required && !user.staff.permissions[required]) {
      toast.error('คุณไม่มีสิทธิ์เข้าถึงหน้านี้')
      router.replace('/dashboard')
    }
  }, [hydrated, user, pathname, isAuthRoute, router])

  // หน้า login: render เต็มจอ ไม่มี sidebar
  if (isAuthRoute) {
    return <>{children}</>
  }

  // ระหว่างรอ hydrate: auth (localStorage) + ข้อมูลโรงแรม (Supabase, async)
  // ต้องรอ cloud ให้เสร็จก่อน ไม่งั้น component จะเห็น mock state แล้ว action จะเขียนทับ cloud
  if (!hydrated || !hotelHydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50">
        <div className="text-slate-500 text-sm">กำลังโหลดข้อมูลจากคลาวด์…</div>
        {loadTimedOut && (
          <div className="text-center">
            <div className="text-xs text-slate-400 mb-2">ใช้เวลานานผิดปกติ — อาจเชื่อมต่อคลาวด์ไม่ได้</div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-medium rounded-lg"
            >
              ลองใหม่
            </button>
          </div>
        )}
      </div>
    )
  }

  // ยังไม่ login — แสดง loading ระหว่าง redirect
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 text-sm">กำลังนำทางไปหน้าเข้าสู่ระบบ…</div>
      </div>
    )
  }

  // login แล้ว — แสดง layout ปกติ
  return (
    <>
      <Sidebar />
      <main className="ml-16 lg:ml-60 min-h-screen">{children}</main>
      <GlobalSearch />
    </>
  )
}
