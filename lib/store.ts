'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabaseStorage, registerStateApplier } from './supabase-storage'
import type {
  Room, Guest, Booking, Invoice, InvoiceItem, InvoiceStatus, HousekeepingTask,
  MaintenanceLog, Staff, RoomStatus, BookingStatus, HousekeepingStatus, MaintenanceStatus,
  InventoryItem, InventoryTransaction, CorporateAccount, CorporateTransaction,
  AddOnItem, BookingAddOn, AuditLog, AuditCategory, Expense, User
} from '@/types'
import { useAuthStore } from './auth-store'
import { calcAddOnTotal, calcOutstanding, roomHasConflict, todayLocal } from './utils'
import {
  mockRooms, mockGuests, mockBookings, mockInvoices,
  mockHousekeepingTasks, mockMaintenanceLogs, mockStaff, mockUsers,
  mockInventoryItems, mockInventoryTransactions, mockCorporateAccounts, mockCorporateTransactions,
  mockAddOnItems, mockBookingAddOns, mockExpenses, mockDynamicPricing, shiftMockDates
} from './mock-data'

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
  moveBooking: (bookingId: string, newRoomId: string) => { ok: boolean; error?: string }
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
  deleteInventoryItem: (id: string) => void
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

  _hasHydrated: false,
  setHasHydrated: (v) => set({ _hasHydrated: v }),

  logAudit: ({ category, action, summary, entityId }) => {
    const u = useAuthStore.getState().user
    const entry: AuditLog = {
      id: `audit${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      staffId: u?.staff.id ?? 'system',
      staffName: u?.staff.name ?? 'ระบบ',
      category,
      action,
      summary,
      entityId,
    }
    set((state) => ({ auditLogs: [entry, ...state.auditLogs].slice(0, 500) }))
  },

  updateRoomStatus: (roomId, status) =>
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId ? { ...r, status } : r
      ),
    })),

  createBooking: (bookingData) => {
    // ด่านสุดท้ายกันจองซ้ำ: ห้ามมี booking active อื่นในห้องเดียวกันที่ช่วงวันคร่อมกัน
    const state = get()
    if (roomHasConflict(state.bookings, bookingData.roomId, bookingData.checkIn, bookingData.checkOut)) {
      return { ok: false, error: 'ห้องนี้มีการจองอื่นทับช่วงวันที่เลือกแล้ว' }
    }

    set((state) => {
      const now = new Date().toISOString()
      const bookingId = `b${Date.now()}`
      // ถ้าจ่ายเงินมาตั้งแต่ตอนสร้าง (walk-in หรือ confirmed ที่จ่ายเต็ม) → push เข้า payments[]
      const initialPayment: import('@/types').Payment | null = bookingData.paidAmount > 0
        ? {
            id: `pay${Date.now()}`,
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
      return {
        bookings: [newBooking, ...state.bookings],
        rooms: updatedRooms,
      }
    })
    return { ok: true }
  },

  updateBookingStatus: (bookingId, status) =>
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
        return { bookings: updatedBookings, rooms: updatedRooms }
      }

      if (status !== 'checked_out') {
        return { bookings: updatedBookings }
      }

      const now = new Date().toISOString()
      const room = state.rooms.find((r) => r.id === booking.roomId)

      // 1) รวมยอด add-on ที่ยังไม่ถูกยกเลิก (requested + fulfilled) เข้ายอดสุดท้าย
      //    ใช้เกณฑ์เดียวกับยอดค้างที่แสดงหน้า front-desk เพื่อไม่ให้รายการ add-on หายจากบิล
      const chargeableAddOns = state.bookingAddOns.filter(
        (a) => a.bookingId === bookingId && a.status !== 'cancelled'
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
            id: `ctx${Date.now()}`,
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
          updatedCorpAccounts = state.corporateAccounts.map((a) =>
            a.id === booking.corporateAccountId
              ? {
                  ...a,
                  totalUsed: a.totalUsed + outstanding,
                  availableBalance: a.availableBalance - outstanding,
                }
              : a
          )
          updatedCorpTx = [corpTx, ...state.corporateTransactions]
          newPaidAmount = combinedTotal
          corpPayment = {
            id: `pay${Date.now()}`,
            amount: outstanding,
            method: 'bank_transfer',
            date: now,
            staffId: 'system',
            notes: `ตัดเครดิตองค์กรอัตโนมัติ (${acc.companyName})`,
          }
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
        id: `inv${Date.now()}`,
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

      // 4) ห้อง → cleaning
      const updatedRooms = state.rooms.map((r) =>
        r.id === booking.roomId
          ? { ...r, status: 'cleaning' as RoomStatus, currentBookingId: undefined, currentGuestId: undefined }
          : r
      )

      // 5) สร้าง Housekeeping task อัตโนมัติ
      const newTask: HousekeepingTask = {
        id: `hk${Date.now()}`,
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
          g.id === booking.guestId
            ? { ...g, totalStays: g.totalStays + 1, totalSpend: g.totalSpend + newPaidAmount }
            : g
        )
      }

      return {
        bookings: updatedBookings,
        rooms: updatedRooms,
        invoices: [newInvoice, ...state.invoices],
        housekeepingTasks: [...state.housekeepingTasks, newTask],
        guests: updatedGuests,
        corporateAccounts: updatedCorpAccounts,
        corporateTransactions: updatedCorpTx,
      }
    }),

  cancelBooking: (bookingId) =>
    set((state) => {
      const booking = state.bookings.find((b) => b.id === bookingId)
      if (!booking) return {}
      if (booking.status === 'cancelled') return {}
      const wasCheckedIn = booking.status === 'checked_in'
      const room = state.rooms.find((r) => r.id === booking.roomId)
      const now = new Date().toISOString()
      // ถ้ายกเลิกหลังเช็คอินแล้ว → สร้าง HK task ให้แม่บ้านไปทำความสะอาด
      const newTask: HousekeepingTask | null = wasCheckedIn && room
        ? {
            id: `hk${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
      const refundPayment: import('@/types').Payment | null = refundAmount > 0
        ? {
            id: `pay${Date.now()}`,
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
          updatedCorpAccounts = state.corporateAccounts.map((a) =>
            a.id === acc.id
              ? { ...a, totalUsed: Math.max(0, a.totalUsed - refundAmount), availableBalance: a.availableBalance + refundAmount }
              : a
          )
          const ctx: CorporateTransaction = {
            id: `ctx${Date.now()}`, corporateAccountId: acc.id, type: 'refund', amount: refundAmount,
            balanceBefore: acc.availableBalance, balanceAfter: acc.availableBalance + refundAmount,
            performedBy: 'system', date: now, bookingId, notes: 'คืนเครดิตจากการยกเลิกการจอง',
          }
          updatedCorpTx = [ctx, ...state.corporateTransactions]
        }
      }

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
          r.id === booking.roomId
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
    }),

  updateBooking: (bookingId, updates) =>
    set((state) => ({
      bookings: state.bookings.map((b) =>
        b.id === bookingId ? { ...b, ...updates } : b
      ),
    })),

  extendBooking: (bookingId, additionalNights) => {
    const state = get()
    const booking = state.bookings.find((b) => b.id === bookingId)
    if (!booking) return { ok: false, error: 'ไม่พบการจอง' }
    if (additionalNights <= 0) return { ok: false, error: 'จำนวนคืนต้องมากกว่า 0' }
    if (['checked_out', 'cancelled'].includes(booking.status)) {
      return { ok: false, error: 'ไม่สามารถขยายการจองที่ปิดแล้ว' }
    }

    const oldCheckOut = booking.checkOut.split('T')[0]
    const newCheckOutDate = new Date(oldCheckOut)
    newCheckOutDate.setDate(newCheckOutDate.getDate() + additionalNights)
    const newCheckOut = newCheckOutDate.toISOString()

    // เช็คชน booking อื่นในห้องเดียวกัน ช่วงระหว่าง oldCheckOut → newCheckOut (ข้ามตัวเอง)
    if (roomHasConflict(state.bookings, booking.roomId, oldCheckOut, newCheckOut, bookingId)) {
      return { ok: false, error: 'มีการจองอื่นทับช่วงวันที่ขยาย' }
    }

    // คำนวณราคาเพิ่ม (dynamic pricing ของวันที่เพิ่ม)
    const room = state.rooms.find((r) => r.id === booking.roomId)
    if (!room) return { ok: false, error: 'ไม่พบห้อง' }
    let extraPrice = 0
    const d = new Date(oldCheckOut)
    for (let i = 0; i < additionalNights; i++) {
      const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      const matches = mockDynamicPricing.filter(
        (r) => r.roomType === room.type && r.startDate <= day && r.endDate >= day
      )
      const sorted = [...matches].sort((a, b) => {
        const aLen = new Date(a.endDate).getTime() - new Date(a.startDate).getTime()
        const bLen = new Date(b.endDate).getTime() - new Date(b.startDate).getTime()
        return aLen - bLen
      })
      extraPrice += sorted[0]?.price ?? room.pricePerNight
      d.setUTCDate(d.getUTCDate() + 1)
    }

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
    return { ok: true }
  },

  moveBooking: (bookingId, newRoomId) => {
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
    const newTask: HousekeepingTask | null = wasCheckedIn && oldRoom
      ? {
          id: `hk${Date.now()}`,
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

    set((s) => ({
      bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, roomId: newRoomId } : b)),
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

    const avgNightly = b.nights > 0 ? b.totalAmount / b.nights : b.totalAmount
    const newTotal = Math.round(avgNightly * actualNights)
    const now = new Date().toISOString()
    // จ่ายมาเกินยอดใหม่ → คืนเงินส่วนเกิน (บันทึก payment ติดลบ เหมือน flow ยกเลิก)
    const overpaid = Math.max(0, b.paidAmount - newTotal)
    const refundPayment: import('@/types').Payment | null = overpaid > 0
      ? { id: `pay${Date.now()}`, amount: -overpaid, method: b.paymentMethod ?? 'cash', date: now, staffId: 'system', notes: 'คืนเงินจากการออกก่อนกำหนด' }
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
    return { ok: true, newNights: actualNights, newTotal, refunded: overpaid }
  },

  addGuest: (guestData) => {
    const id = `g${Date.now()}`
    set((state) => ({
      guests: [...state.guests, { ...guestData, id }],
    }))
    return id
  },

  updateGuest: (guestId, updates) =>
    set((state) => ({
      guests: state.guests.map((g) => (g.id === guestId ? { ...g, ...updates } : g)),
    })),

  addHousekeepingTask: (taskData) =>
    set((state) => ({
      housekeepingTasks: [
        ...state.housekeepingTasks,
        { ...taskData, id: `hk${Date.now()}` },
      ],
    })),

  updateTaskStatus: (taskId, status) =>
    set((state) => {
      const now = new Date().toISOString()
      const updatedTasks = state.housekeepingTasks.map((t) => {
        if (t.id !== taskId) return t
        const updates: Partial<HousekeepingTask> = { status }
        if (status === 'in_progress') updates.startedAt = now
        if (status === 'completed') updates.completedAt = now
        return { ...t, ...updates }
      })
      // เมื่อทำความสะอาดเสร็จ → คืนห้องเป็น available เฉพาะห้องที่กำลัง 'cleaning' (หลังเช็คเอาต์)
      // ห้ามแตะห้องที่ 'occupied' (งานทำความสะอาดระหว่างเข้าพัก) หรือ 'maintenance'
      const task = updatedTasks.find((t) => t.id === taskId)
      const updatedRooms =
        status === 'completed' && task
          ? state.rooms.map((r) =>
              r.id === task.roomId && r.status === 'cleaning' ? { ...r, status: 'available' as RoomStatus } : r
            )
          : state.rooms
      return { housekeepingTasks: updatedTasks, rooms: updatedRooms }
    }),

  addMaintenanceLog: (logData) =>
    set((state) => {
      const newLog = { ...logData, id: `m${Date.now()}` }
      // ตั้งห้องเป็น maintenance ทันทีถ้า issue ยังไม่ resolved
      const updatedRooms = newLog.status !== 'resolved'
        ? state.rooms.map((r) =>
            r.id === newLog.roomId && r.status !== 'occupied'
              ? { ...r, status: 'maintenance' as RoomStatus }
              : r
          )
        : state.rooms
      return {
        maintenanceLogs: [newLog, ...state.maintenanceLogs],
        rooms: updatedRooms,
      }
    }),

  updateMaintenanceStatus: (logId, status) =>
    set((state) => {
      const now = new Date().toISOString()
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
        if (!hasOtherOpen) {
          updatedRooms = state.rooms.map((r) =>
            r.id === log.roomId && r.status === 'maintenance'
              ? { ...r, status: 'available' as RoomStatus }
              : r
          )
        }
      }
      return { maintenanceLogs: updatedLogs, rooms: updatedRooms }
    }),

  removeMaintenanceLog: (logId) =>
    set((state) => {
      const log = state.maintenanceLogs.find((l) => l.id === logId)
      const updatedLogs = state.maintenanceLogs.filter((l) => l.id !== logId)
      // ถ้าห้องอยู่ในสถานะ maintenance และไม่มี log ค้างอื่น → คืนห้องเป็น available
      let updatedRooms = state.rooms
      if (log) {
        const hasOtherOpen = updatedLogs.some(
          (l) => l.roomId === log.roomId && l.status !== 'resolved'
        )
        if (!hasOtherOpen) {
          updatedRooms = state.rooms.map((r) =>
            r.id === log.roomId && r.status === 'maintenance'
              ? { ...r, status: 'available' as RoomStatus }
              : r
          )
        }
      }
      return { maintenanceLogs: updatedLogs, rooms: updatedRooms }
    }),

  addInventoryItem: (itemData) =>
    set((state) => ({
      inventoryItems: [...state.inventoryItems, { ...itemData, id: `inv${Date.now()}` }],
    })),

  updateInventoryItem: (id, updates) =>
    set((state) => ({
      inventoryItems: state.inventoryItems.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    })),

  deleteInventoryItem: (id) =>
    set((state) => ({
      inventoryItems: state.inventoryItems.filter((item) => item.id !== id),
    })),

  restockItem: (itemId, quantity, staffId, notes) =>
    set((state) => {
      if (quantity <= 0) return {} // กันเติมสต็อกค่าติดลบ/ศูนย์
      const now = new Date().toISOString()
      const tx: InventoryTransaction = {
        id: `itx${Date.now()}`, itemId, type: 'restock', quantity, performedBy: staffId, date: now, notes,
      }
      return {
        inventoryItems: state.inventoryItems.map((item) =>
          item.id === itemId
            ? { ...item, currentStock: item.currentStock + quantity, lastRestocked: now }
            : item
        ),
        inventoryTransactions: [tx, ...state.inventoryTransactions],
      }
    }),

  useInventoryItem: (itemId, quantity, staffId, referenceId, notes) => {
    const state = get()
    const item = state.inventoryItems.find((i) => i.id === itemId)
    if (!item) return { ok: false, error: 'ไม่พบสินค้า' }
    if (quantity <= 0) return { ok: false, error: 'จำนวนต้องมากกว่า 0' }
    if (item.currentStock < quantity) {
      return { ok: false, error: `สต็อก "${item.name}" ไม่พอ (มี ${item.currentStock} ต้องการ ${quantity})` }
    }
    const now = new Date().toISOString()
    const tx: InventoryTransaction = {
      id: `itx${Date.now()}`, itemId, type: 'use', quantity: -quantity, performedBy: staffId, date: now, referenceId, notes,
    }
    set((s) => ({
      inventoryItems: s.inventoryItems.map((it) =>
        it.id === itemId ? { ...it, currentStock: it.currentStock - quantity } : it
      ),
      inventoryTransactions: [tx, ...s.inventoryTransactions],
    }))
    return { ok: true }
  },

  adjustStock: (itemId, newQuantity, staffId, notes) =>
    set((state) => {
      const now = new Date().toISOString()
      const item = state.inventoryItems.find((i) => i.id === itemId)
      if (!item) return {}
      const diff = newQuantity - item.currentStock
      const tx: InventoryTransaction = {
        id: `itx${Date.now()}`, itemId, type: 'adjust', quantity: diff, performedBy: staffId, date: now, notes,
      }
      return {
        inventoryItems: state.inventoryItems.map((i) =>
          i.id === itemId ? { ...i, currentStock: newQuantity } : i
        ),
        inventoryTransactions: [tx, ...state.inventoryTransactions],
      }
    }),

  addCorporateAccount: (accountData) =>
    set((state) => ({
      corporateAccounts: [
        ...state.corporateAccounts,
        {
          ...accountData, id: `corp${Date.now()}`,
          totalDeposited: 0, totalUsed: 0, availableBalance: 0,
          createdAt: new Date().toISOString(),
        },
      ],
    })),

  updateCorporateAccount: (id, updates) =>
    set((state) => ({
      corporateAccounts: state.corporateAccounts.map((acc) =>
        acc.id === id ? { ...acc, ...updates } : acc
      ),
    })),

  depositToAccount: (accountId, amount, staffId, notes) =>
    set((state) => {
      const now = new Date().toISOString()
      const acc = state.corporateAccounts.find((a) => a.id === accountId)
      if (!acc) return {}
      const tx: CorporateTransaction = {
        id: `ctx${Date.now()}`, corporateAccountId: accountId, type: 'deposit', amount,
        balanceBefore: acc.availableBalance, balanceAfter: acc.availableBalance + amount,
        performedBy: staffId, date: now, notes,
      }
      return {
        corporateAccounts: state.corporateAccounts.map((a) =>
          a.id === accountId
            ? { ...a, totalDeposited: a.totalDeposited + amount, availableBalance: a.availableBalance + amount }
            : a
        ),
        corporateTransactions: [tx, ...state.corporateTransactions],
      }
    }),

  chargeAccount: (accountId, amount, staffId, bookingId, notes) =>
    set((state) => {
      const now = new Date().toISOString()
      const acc = state.corporateAccounts.find((a) => a.id === accountId)
      if (!acc || acc.availableBalance < amount) return {}
      const tx: CorporateTransaction = {
        id: `ctx${Date.now()}`, corporateAccountId: accountId, type: 'charge', amount,
        balanceBefore: acc.availableBalance, balanceAfter: acc.availableBalance - amount,
        performedBy: staffId, date: now, bookingId, notes,
      }
      return {
        corporateAccounts: state.corporateAccounts.map((a) =>
          a.id === accountId
            ? { ...a, totalUsed: a.totalUsed + amount, availableBalance: a.availableBalance - amount }
            : a
        ),
        corporateTransactions: [tx, ...state.corporateTransactions],
      }
    }),

  refundToAccount: (accountId, amount, staffId, bookingId, notes) =>
    set((state) => {
      const now = new Date().toISOString()
      const acc = state.corporateAccounts.find((a) => a.id === accountId)
      if (!acc) return {}
      const tx: CorporateTransaction = {
        id: `ctx${Date.now()}`, corporateAccountId: accountId, type: 'refund', amount,
        balanceBefore: acc.availableBalance, balanceAfter: acc.availableBalance + amount,
        performedBy: staffId, date: now, bookingId, notes,
      }
      return {
        corporateAccounts: state.corporateAccounts.map((a) =>
          a.id === accountId
            ? { ...a, totalUsed: Math.max(0, a.totalUsed - amount), availableBalance: a.availableBalance + amount }
            : a
        ),
        corporateTransactions: [tx, ...state.corporateTransactions],
      }
    }),

  // ===== Expense actions =====
  addExpense: (expense) =>
    set((state) => ({
      expenses: [{ ...expense, id: `exp${Date.now()}`, createdAt: new Date().toISOString() }, ...state.expenses],
    })),

  updateExpense: (id, updates) =>
    set((state) => ({
      expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),

  deleteExpense: (id) =>
    set((state) => ({
      expenses: state.expenses.filter((e) => e.id !== id),
    })),

  // ===== User / account actions =====
  addUser: (userData) => {
    const state = get()
    const username = userData.username.trim()
    if (!username) return { ok: false, error: 'ต้องระบุชื่อผู้ใช้' }
    if (!userData.password) return { ok: false, error: 'ต้องระบุรหัสผ่าน' }
    if (state.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return { ok: false, error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' }
    }
    const newUser: User = { ...userData, username, id: `u${Date.now()}` }
    set((s) => ({ users: [...s.users, newUser] }))
    return { ok: true }
  },

  updateUser: (id, updates) => {
    const state = get()
    if (updates.username !== undefined) {
      const username = updates.username.trim()
      if (!username) return { ok: false, error: 'ต้องระบุชื่อผู้ใช้' }
      if (state.users.some((u) => u.id !== id && u.username.toLowerCase() === username.toLowerCase())) {
        return { ok: false, error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' }
      }
      updates = { ...updates, username }
    }
    set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...updates } : u)) }))
    return { ok: true }
  },

  deleteUser: (id) =>
    set((state) => ({ users: state.users.filter((u) => u.id !== id) })),

  recordLogin: (userId) =>
    set((state) => ({
      users: state.users.map((u) =>
        u.id === userId ? { ...u, lastLogin: new Date().toISOString() } : u
      ),
    })),

  addStaff: (staffData) => {
    const id = `s${Date.now()}`
    set((state) => ({ staff: [...state.staff, { ...staffData, id }] }))
    return id
  },

  updateStaff: (id, updates) =>
    set((state) => ({
      staff: state.staff.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),

  deleteStaff: (id) =>
    set((state) => ({ staff: state.staff.filter((s) => s.id !== id) })),

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
    const state = get()
    const booking = state.bookings.find((b) => b.id === bookingId)
    if (!booking) return { ok: false, error: 'ไม่พบการจอง' }
    if (amount <= 0) return { ok: false, error: 'จำนวนเงินต้องมากกว่า 0' }
    // คำนวณยอดคงค้าง (helper กลาง ใช้เกณฑ์เดียวกับทุกหน้า)
    const outstanding = calcOutstanding(booking, state.bookingAddOns)
    if (outstanding <= 0) return { ok: false, error: 'การจองนี้ชำระครบแล้ว' }
    if (amount > outstanding) return { ok: false, error: `เกินยอดค้างชำระ (สูงสุด ${outstanding.toLocaleString()} บาท)` }

    set((s) => ({
      bookings: s.bookings.map((b) => {
        if (b.id !== bookingId) return b
        const payment: import('@/types').Payment = {
          id: `pay${Date.now()}`,
          amount,
          method: method as import('@/types').PaymentMethod,
          date: new Date().toISOString(),
          staffId,
          notes,
        }
        return {
          ...b,
          paidAmount: b.paidAmount + amount,
          paymentMethod: method as import('@/types').PaymentMethod,
          payments: [...(b.payments ?? []), payment],
        }
      }),
    }))
    return { ok: true }
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
      id: `ba${Date.now()}`, bookingId, addOnItemId, quantity,
      unitPrice: item.price, totalPrice: item.price * quantity,
      status: 'requested', requestedAt: new Date().toISOString(),
      requestedBy: staffId, notes,
    }
    set((s) => ({ bookingAddOns: [newAddOn, ...s.bookingAddOns] }))
    return { ok: true }
  },

  fulfillAddOn: (addOnId, staffId) => {
    const state = get()
    const addOn = state.bookingAddOns.find((a) => a.id === addOnId)
    if (!addOn) return { ok: false, error: 'ไม่พบรายการ Add-on' }
    if (addOn.status !== 'requested') return { ok: false, error: 'รายการนี้ดำเนินการไปแล้ว' }
    const item = state.addOnItems.find((a) => a.id === addOn.addOnItemId)
    const now = new Date().toISOString()

    // ตรวจสต็อกก่อน ถ้าไม่พอ → block
    if (item?.inventoryItemId && item.inventoryQtyPerUnit > 0) {
      const deduct = item.inventoryQtyPerUnit * addOn.quantity
      const inv = state.inventoryItems.find((i) => i.id === item.inventoryItemId)
      if (!inv || inv.currentStock < deduct) {
        return { ok: false, error: `สต็อก "${item.name}" ไม่พอ (มี ${inv?.currentStock ?? 0} ต้องการ ${deduct})` }
      }
    }

    set((s) => {
      let updatedItems = s.inventoryItems
      let updatedTx = s.inventoryTransactions
      if (item?.inventoryItemId && item.inventoryQtyPerUnit > 0) {
        const deduct = item.inventoryQtyPerUnit * addOn.quantity
        const invTx: InventoryTransaction = {
          id: `itx${Date.now()}`, itemId: item.inventoryItemId, type: 'use',
          quantity: -deduct, referenceId: addOnId, performedBy: staffId, date: now,
          notes: `Add-on: ${item.name} x${addOn.quantity}`,
        }
        updatedItems = s.inventoryItems.map((i) =>
          i.id === item.inventoryItemId
            ? { ...i, currentStock: i.currentStock - deduct }
            : i
        )
        updatedTx = [invTx, ...s.inventoryTransactions]
      }
      return {
        bookingAddOns: s.bookingAddOns.map((a) =>
          a.id === addOnId ? { ...a, status: 'fulfilled' as const, fulfilledAt: now, fulfilledBy: staffId } : a
        ),
        inventoryItems: updatedItems,
        inventoryTransactions: updatedTx,
      }
    })
    return { ok: true }
  },

  cancelAddOn: (addOnId) =>
    set((state) => {
      const addOn = state.bookingAddOns.find((a) => a.id === addOnId)
      if (!addOn) return {}
      if (addOn.status === 'cancelled') return {} // กันยกเลิกซ้ำ
      const now = new Date().toISOString()
      const wasFulfilled = addOn.status === 'fulfilled'
      const item = state.addOnItems.find((i) => i.id === addOn.addOnItemId) ?? null

      // ถ้าเคย fulfilled แล้วและมี inventoryItemId → คืนสต็อกกลับ
      let updatedItems = state.inventoryItems
      let updatedTx = state.inventoryTransactions
      if (wasFulfilled && item?.inventoryItemId && item.inventoryQtyPerUnit > 0) {
        const restore = item.inventoryQtyPerUnit * addOn.quantity
        const invTx: InventoryTransaction = {
          id: `itx${Date.now()}`, itemId: item.inventoryItemId, type: 'adjust',
          quantity: restore, referenceId: addOnId, performedBy: 'system',
          date: now,
          notes: `คืนสต็อกจากการยกเลิก Add-on: ${item.name} x${addOn.quantity}`,
        }
        updatedItems = state.inventoryItems.map((i) =>
          i.id === item.inventoryItemId
            ? { ...i, currentStock: i.currentStock + restore }
            : i
        )
        updatedTx = [invTx, ...state.inventoryTransactions]
      }

      // คืนเงินส่วนที่จ่ายเกิน ถ้า add-on นี้ถูกชำระไปแล้ว (paidAmount เกินยอดที่ต้องจ่ายหลังยกเลิก)
      let updatedBookings = state.bookings
      const booking = state.bookings.find((b) => b.id === addOn.bookingId)
      let updatedCorpAccounts = state.corporateAccounts
      let updatedCorpTx = state.corporateTransactions
      if (booking) {
        const otherAddOnTotal = state.bookingAddOns
          .filter((a) => a.bookingId === booking.id && a.id !== addOnId && a.status !== 'cancelled')
          .reduce((s, a) => s + a.totalPrice, 0)
        const newCharge = booking.totalAmount + otherAddOnTotal
        const overpaid = Math.max(0, booking.paidAmount - newCharge)
        if (overpaid > 0) {
          const refundPayment: import('@/types').Payment = {
            id: `pay${Date.now()}`, amount: -overpaid, method: booking.paymentMethod ?? 'cash',
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
              updatedCorpAccounts = state.corporateAccounts.map((a) =>
                a.id === acc.id
                  ? { ...a, totalUsed: Math.max(0, a.totalUsed - overpaid), availableBalance: a.availableBalance + overpaid }
                  : a
              )
              const ctx: CorporateTransaction = {
                id: `ctx${Date.now()}`, corporateAccountId: acc.id, type: 'refund', amount: overpaid,
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
    }),
}), {
  name: 'hotel-pms-storage',
  storage: createJSONStorage(() => supabaseStorage),
  version: 2,
  // storage เป็น async (Supabase) — ปิด auto-hydrate แล้วสั่ง rehydrate() เองใน AppShell
  // เพื่อกัน race ที่แอป render ด้วย mock state ก่อนแล้วเขียนทับ cloud (ข้อมูลหาย)
  skipHydration: true,
  // เผื่อ field ใหม่ (เช่น auditLogs, payments) ที่ user เคย save ก่อนเพิ่มไว้
  merge: (persisted, current) => {
    const p = (persisted ?? {}) as Partial<typeof current>
    return { ...current, ...p, auditLogs: p.auditLogs ?? current.auditLogs ?? [] }
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
