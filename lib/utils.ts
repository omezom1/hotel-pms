import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'
import { mockDynamicPricing } from './mock-data'
import type { Booking, Guest, BookingAddOn, BookingStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const day = (iso: string) => iso.split('T')[0]

// ============================================================
//  SINGLE SOURCE OF TRUTH สำหรับ logic ธุรกิจที่เคยถูกเขียนซ้ำหลายที่
//  ห้าม inline เงื่อนไขพวกนี้ในหน้า/หรือ store อีก — เรียก helper พวกนี้แทน
//  status ใช้ exhaustive switch: เพิ่มสถานะใหม่ใน types แล้ว build จะแตกที่นี่จุดเดียว
// ============================================================

// add-on นี้ต้องคิดเงินไหม (fulfilled = คิด, requested/cancelled = ไม่คิด)
// นโยบาย: คิดเงินเฉพาะ add-on ที่ "จัดให้แล้ว" (fulfilled) — ที่ลูกค้าแค่ร้องขอ (requested)
// ยังไม่จัดให้ ยังไม่คิดเงิน เพื่อกันเก็บเกินถ้ายกเลิกภายหลัง. คุมที่จุดเดียวนี้ให้ทั้งแอปตรงกัน
export function addOnCountsTowardCharge(status: BookingAddOn['status']): boolean {
  switch (status) {
    case 'fulfilled':
      return true
    case 'requested':
    case 'cancelled':
      return false
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

// booking นี้เป็น "การจองที่ยัง active" ไหม (จะมาใช้ห้อง — ใช้กับกันชน + แสดงผลปฏิทิน/grid)
// checked_out/cancelled = ไม่ active แล้ว
export function isActiveReservation(status: BookingStatus): boolean {
  switch (status) {
    case 'confirmed':
    case 'checked_in':
    case 'pending':
      return true
    case 'checked_out':
    case 'cancelled':
      return false
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

// ===== ยอดค้างชำระ / add-on (single source of truth) =====
// รวมเฉพาะ add-on ที่จัดให้แล้ว (fulfilled) ตาม addOnCountsTowardCharge — ใช้เกณฑ์เดียวกันทุกหน้า
export function calcAddOnTotal(bookingId: string, addOns: BookingAddOn[]): number {
  return addOns
    .filter((a) => a.bookingId === bookingId && addOnCountsTowardCharge(a.status))
    .reduce((s, a) => s + a.totalPrice, 0)
}

export function calcOutstanding(booking: Booking, addOns: BookingAddOn[]): number {
  return booking.totalAmount + calcAddOnTotal(booking.id, addOns) - booking.paidAmount
}

// รายได้ที่รับรู้จากการจองหนึ่ง = ค่าห้อง + add-on (ไม่ถูกยกเลิก) = ยอดที่ออกบิลจริง
// ใช้กับ "รายได้วันนี้/รายวัน" ทุกหน้า เพื่อไม่ให้รายงานต่ำกว่าจริงเพราะลืม add-on
export function bookingRevenue(booking: Booking, addOns: BookingAddOn[]): number {
  return booking.totalAmount + calcAddOnTotal(booking.id, addOns)
}

// === รายได้ที่ "รับรู้แล้ว" (single source of truth) ===
// กฎธุรกิจ: รับรู้รายได้เมื่อแขกเช็คเอาท์ (status === 'checked_out') เท่านั้น
// booking ที่ยัง pending/confirmed/checked_in = ยอดจองในมือ ยังไม่ใช่รายได้จริง
// ⚠️ ทุกหน้าที่รวม "รายได้" ต้องผ่าน isRealizedRevenue/sumRealizedRevenue เท่านั้น
//    ห้าม inline `status === 'checked_out'` หรือ `status !== 'cancelled'` เองอีก (เลขจะเพี้ยนข้ามหน้า)
export function isRealizedRevenue(b: Booking): boolean {
  switch (b.status) {
    case 'checked_out':
      return true
    case 'pending':
    case 'confirmed':
    case 'checked_in':
    case 'cancelled':
      return false
    default: {
      const _exhaustive: never = b.status
      return _exhaustive
    }
  }
}

// รวมรายได้รับรู้ของชุด booking; ส่ง predicate เพิ่ม (เช่นกรองตามวัน) ผ่าน extra ได้
export function sumRealizedRevenue(
  bookings: Booking[], addOns: BookingAddOn[], extra?: (b: Booking) => boolean
): number {
  return bookings
    .filter((b) => isRealizedRevenue(b) && (extra ? extra(b) : true))
    .reduce((s, b) => s + bookingRevenue(b, addOns), 0)
}

// ===== การครอบครองห้อง / ชนกันของการจอง (single source of truth) =====
// (display) booking นี้เป็นการจอง active บน "วัน" ที่กำหนดไหม — ใช้กับปฏิทิน/grid
export function bookingActiveOnDay(b: Booking, dayKey: string): boolean {
  return isActiveReservation(b.status) && day(b.checkIn) <= dayKey && day(b.checkOut) > dayKey
}

// จำนวนห้องที่ "ขายได้จริง" = ตัดห้องปิดปรับปรุง (maintenance) ออก — ห้องปิดปรับปรุงไม่ใช่ห้องที่ขายได้
// ใช้เป็นตัวหารมาตรฐานของ occupancy ทุกหน้า (dashboard/reports/daily-report) ให้เลขตรงกันทุกที่
export function sellableRoomCount(rooms: { status: string }[]): number {
  return rooms.filter((r) => r.status !== 'maintenance').length
}

// (stats) booking นี้ครอบครองคืนของ "วัน" ที่กำหนดไหม — ใช้กับ occupancy/รายงาน
// นับ checked_out ด้วย (แขกที่เช็คเอาท์ไปแล้วก็เคยใช้ห้องคืนนั้นจริง) ไม่นับ cancelled
export function bookingOccupiesDay(b: Booking, dayKey: string): boolean {
  return b.status !== 'cancelled' && day(b.checkIn) <= dayKey && day(b.checkOut) > dayKey
}

// การจอง active ทับช่วง [checkIn, checkOut) ไหม — ใช้ตรวจห้องว่าง/กันชน
export function bookingOverlapsRange(b: Booking, checkIn: string, checkOut: string): boolean {
  return isActiveReservation(b.status) && day(b.checkIn) < day(checkOut) && day(b.checkOut) > day(checkIn)
}

// ห้องนี้มีการจองชนช่วง [checkIn, checkOut) ไหม (ข้าม booking ที่ระบุได้ เช่นตอนแก้ของตัวเอง)
export function roomHasConflict(
  bookings: Booking[], roomId: string, checkIn: string, checkOut: string, excludeBookingId?: string
): boolean {
  return bookings.some(
    (b) => b.id !== excludeBookingId && b.roomId === roomId && bookingOverlapsRange(b, checkIn, checkOut)
  )
}

// จำนวนคืนสูงสุดที่จองห้องนี้ได้ตั้งแต่ checkIn โดยไม่ชนการจอง active อื่น
// maxNights = null → ไม่มีการจองข้างหน้า (จองได้ไม่จำกัดตามด่านนี้)
// maxNights = 0 → มีการจองคร่อม checkIn อยู่แล้ว (จองไม่ได้เลย)
// conflictDate = checkIn ของการจองตัวถัดไปที่กั้นอยู่ (ISO) สำหรับโชว์เตือน
export function maxNightsBeforeConflict(
  bookings: Booking[], roomId: string, checkIn: string, excludeBookingId?: string
): { maxNights: number | null; conflictDate: string | null } {
  const inDay = day(checkIn)
  const blocking = bookings.filter(
    (b) =>
      b.id !== excludeBookingId &&
      b.roomId === roomId &&
      isActiveReservation(b.status) &&
      day(b.checkOut) > inDay
  )
  if (blocking.length === 0) return { maxNights: null, conflictDate: null }
  const next = blocking.reduce((earliest, b) => (day(b.checkIn) < day(earliest.checkIn) ? b : earliest))
  // back-to-back วันเดียวกันถือว่าจองได้ (checkOut ของเราเท่ากับ checkIn ของเขา) → diff = คืนสูงสุด
  const diffDays = Math.round(
    (new Date(day(next.checkIn)).getTime() - new Date(inDay).getTime()) / 86400000
  )
  return { maxNights: Math.max(0, diffDays), conflictDate: next.checkIn }
}

// แปลง Date จาก date-picker → ISO ที่ "วัน" ตรงกับวันบนปฏิทินเสมอ
// react-date-range ให้ Date เป็นเที่ยงคืน "เวลาท้องถิ่น"; เรียก .toISOString() ตรงๆ ใน TZ บวก (เช่นไทย +07)
// จะเลื่อนวันถอยหลัง 1 วัน (3 มิ.ย. 00:00 +07 → 2 มิ.ย. 17:00 UTC) ทำให้ split('T')[0] อ่านได้ผิดวัน
// ฟังก์ชันนี้อ่านวัน/เดือน/ปี "ท้องถิ่น" แล้วตรึงเป็น UTC-midnight ให้ทั้งระบบอ่านวันได้ถูกตลอด
export function calendarDateToISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}T00:00:00.000Z`
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(dateStr: string, fmt = 'dd MMM yyyy'): string {
  try {
    return format(parseISO(dateStr), fmt, { locale: th })
  } catch {
    return dateStr
  }
}

export function formatDateTime(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy HH:mm', { locale: th })
  } catch {
    return dateStr
  }
}

export function calcNights(checkIn: string, checkOut: string): number {
  return differenceInDays(parseISO(checkOut), parseISO(checkIn))
}

// บวก n คืนเข้า "วัน" ของ ISO โดยตรึง UTC-midnight — แทน epoch math (+n*86400000) หรือ
// local setDate() ที่เปราะข้าม timezone (จะเลื่อนวันใน TZ ติดลบ). ให้ทั้งระบบบวกวันแบบเดียวกัน
export function addNightsISO(iso: string, nights: number): string {
  const d = new Date(`${iso.split('T')[0]}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + nights)
  return d.toISOString()
}

// Date object → YYYY-MM-DD ตามเวลาท้องถิ่น
export function toLocalDateKey(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// วันนี้ตามเวลาท้องถิ่น (YYYY-MM-DD) — แทน new Date().toISOString().split('T')[0]
// ซึ่งจะให้ UTC date และผิดในช่วงข้ามคืนของไทย (00:00–06:59)
export function todayLocal(): string {
  return toLocalDateKey(new Date())
}

// ราคา/คืน ของ room type ในวันนั้น (เลือก rule ที่ช่วงวันสั้นที่สุด = เฉพาะเจาะจงที่สุด)
export function getNightlyPrice(roomType: string, date: string, fallback: number): number {
  const day = date.split('T')[0]
  const matches = mockDynamicPricing.filter(
    (r) => r.roomType === roomType && r.startDate <= day && r.endDate >= day
  )
  if (matches.length === 0) return fallback
  const sorted = [...matches].sort((a, b) => {
    const aLen = parseISO(a.endDate).getTime() - parseISO(a.startDate).getTime()
    const bLen = parseISO(b.endDate).getTime() - parseISO(b.startDate).getTime()
    return aLen - bLen
  })
  return sorted[0].price
}

// ยอดรวมตามช่วงวัน โดยใช้ dynamic pricing ราย night
export function calcBookingTotal(roomType: string, checkIn: string, checkOut: string, fallback: number): number {
  if (!checkIn || !checkOut) return 0
  const ci = parseISO(checkIn.split('T')[0])
  const co = parseISO(checkOut.split('T')[0])
  let total = 0
  for (const d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
    total += getNightlyPrice(roomType, toLocalDateKey(d), fallback)
  }
  return total
}

export function getRoomStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    available: 'ว่าง',
    occupied: 'มีผู้เข้าพัก',
    cleaning: 'กำลังทำความสะอาด',
    maintenance: 'ปิดปรับปรุง',
  }
  return labels[status] ?? status
}

export function getRoomTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    single: 'เตียงเดี่ยว',
    double: 'เตียงคู่',
    triple: '3 เตียง',
  }
  return labels[type] ?? type
}

export function getBookingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    confirmed: 'ยืนยันแล้ว',
    checked_in: 'เช็คอินแล้ว',
    checked_out: 'เช็คเอาต์แล้ว',
    cancelled: 'ยกเลิกแล้ว',
    pending: 'รอยืนยัน',
  }
  return labels[status] ?? status
}

export function getBookingSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    direct: 'จองตรง',
    walk_in: 'Walk-in',
  }
  return labels[source] ?? 'จองตรง'
}

export function getStaffRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'ผู้ดูแลระบบ',
    receptionist: 'พนักงานต้อนรับ',
    accountant: 'นักบัญชี',
    housekeeper: 'แม่บ้าน',
    maintenance: 'ช่างซ่อมบำรุง',
  }
  return labels[role] ?? role
}

export function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    credit_card: 'บัตรเครดิต',
    debit_card: 'บัตรเดบิต',
    qr_code: 'QR Code',
    bank_transfer: 'โอนเงิน',
    cash: 'เงินสด',
    pay_later: 'ชำระภายหลัง',
  }
  return labels[method] ?? method
}

// ดึงชื่อแขกจาก booking — รองรับทั้ง registered guest และ snapshot (ชั่วคราว)
export function getGuestDisplayName(booking: Booking, guests: Guest[]): string {
  if (booking.guestId) {
    return guests.find((g) => g.id === booking.guestId)?.name ?? '–'
  }
  return booking.guestSnapshot?.name ?? 'Walk-in'
}

export function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    low: 'ต่ำ',
    normal: 'ปกติ',
    high: 'สูง',
    urgent: 'เร่งด่วน',
  }
  return labels[priority] ?? priority
}
