import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'
import { mockDynamicPricing } from './mock-data'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
    standard: 'Standard',
    deluxe: 'Deluxe',
    suite: 'Suite',
    family: 'Family',
    penthouse: 'Penthouse',
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

export function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    low: 'ต่ำ',
    normal: 'ปกติ',
    high: 'สูง',
    urgent: 'เร่งด่วน',
  }
  return labels[priority] ?? priority
}
