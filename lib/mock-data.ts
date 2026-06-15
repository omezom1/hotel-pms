import type {
  Room, Guest, Booking, Invoice, HousekeepingTask,
  MaintenanceLog, Staff, User,
  InventoryItem, InventoryTransaction, CorporateAccount, CorporateTransaction,
  AddOnItem, BookingAddOn, Expense
} from '@/types'

// ===== ทำให้วันที่ mock เลื่อนตาม "วันนี้" จริง — เดโมมีกิจกรรมวันนี้เสมอ ไม่ว่าเปิดวันไหน =====
// mock ทั้งหมดยึด 2026-05-29 เป็น "วันนี้"; เราเลื่อนทุกวันที่ด้วย offset = (วันนี้จริง − anchor)
// โดยคงความสัมพันธ์เดิมไว้ทั้งหมด (booking 7 คืนก็ยัง 7 คืน แค่ขยับให้คร่อมวันนี้)
const MOCK_ANCHOR = '2026-05-29'
const MOCK_SHIFT_DAYS = (() => {
  const anchor = new Date(`${MOCK_ANCHOR}T00:00:00`)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((today.getTime() - anchor.getTime()) / 86400000)
})()

function shiftIso(s: string): string {
  // เลื่อนเฉพาะ string ที่ขึ้นต้นด้วย YYYY-MM-DD (คง suffix เวลา/โซนเดิม)
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(s)
  if (!m) return s
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)
  d.setDate(d.getDate() + MOCK_SHIFT_DAYS)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}${m[4]}`
}

// เดินลึกทุก field แล้วเลื่อนเฉพาะ string ที่เป็นวันที่ ISO
export function shiftMockDates<T>(value: T): T {
  if (typeof value === 'string') return shiftIso(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => shiftMockDates(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k] = shiftMockDates((value as Record<string, unknown>)[k])
    }
    return out as unknown as T
  }
  return value
}

// ========== ROOMS: 39 ห้อง (A1-A20 อาคาร A, B1-B20 อาคาร B) — A5 ห้องเจ้าของ ==========
// เตียงเดี่ยว (single) 500/คืน — 25 ห้อง
// เตียงคู่   (double) 500/คืน — 12 ห้อง: A1-A3, A11-A15, B2-B5
// 3 เตียง   (triple) 700/คืน —  2 ห้อง: A4, B1

const amenities = ['WiFi', 'TV', 'เครื่องปรับอากาศ']

export const mockRooms: Room[] = [
  // ===== อาคาร A — 20 ห้อง =====
  // ชั้น 1: A1-A10
  { id: 'rA1',  number: 'A1',  type: 'double', floor: 1, wing: 'front', status: 'occupied',    pricePerNight: 500, maxGuests: 2, amenities, description: 'เตียงคู่ อาคาร A ชั้น 1', currentGuestId: 'g001', currentBookingId: 'b001' },
  { id: 'rA2',  number: 'A2',  type: 'double', floor: 1, wing: 'front', status: 'cleaning',    pricePerNight: 500, maxGuests: 2, amenities, description: 'เตียงคู่ อาคาร A ชั้น 1' },
  { id: 'rA3',  number: 'A3',  type: 'double', floor: 1, wing: 'front', status: 'occupied',    pricePerNight: 500, maxGuests: 2, amenities, description: 'เตียงคู่ อาคาร A ชั้น 1', currentGuestId: 'g003', currentBookingId: 'b003' },
  { id: 'rA4',  number: 'A4',  type: 'triple', floor: 1, wing: 'front', status: 'cleaning',    pricePerNight: 700, maxGuests: 3, amenities, description: '3 เตียง อาคาร A ชั้น 1' },
  { id: 'rA5',  number: 'เฮียดิเรก',  type: 'single', floor: 1, wing: 'front', status: 'maintenance', pricePerNight: 500, maxGuests: 1, amenities, description: 'ห้องของพ่อ (เฮียดิเรก) — ปิดใช้งาน' },
  { id: 'rA6',  number: 'A6',  type: 'single', floor: 1, wing: 'front', status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร A ชั้น 1' },
  { id: 'rA7',  number: 'A7',  type: 'single', floor: 1, wing: 'front', status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร A ชั้น 1' },
  { id: 'rA8',  number: 'A8',  type: 'single', floor: 1, wing: 'front', status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร A ชั้น 1' },
  { id: 'rA9',  number: 'A9',  type: 'single', floor: 1, wing: 'front', status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร A ชั้น 1' },
  { id: 'rA10', number: 'A10', type: 'single', floor: 1, wing: 'front', status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร A ชั้น 1' },
  // ชั้น 2: A11-A20
  { id: 'rA11', number: 'A11', type: 'double', floor: 2, wing: 'front', status: 'occupied',    pricePerNight: 500, maxGuests: 2, amenities, description: 'เตียงคู่ อาคาร A ชั้น 2', currentGuestId: 'g002', currentBookingId: 'b002' },
  { id: 'rA12', number: 'A12', type: 'double', floor: 2, wing: 'front', status: 'available',   pricePerNight: 500, maxGuests: 2, amenities, description: 'เตียงคู่ อาคาร A ชั้น 2' },
  { id: 'rA13', number: 'A13', type: 'double', floor: 2, wing: 'front', status: 'available',   pricePerNight: 500, maxGuests: 2, amenities, description: 'เตียงคู่ อาคาร A ชั้น 2' },
  { id: 'rA14', number: 'A14', type: 'double', floor: 2, wing: 'front', status: 'available',   pricePerNight: 500, maxGuests: 2, amenities, description: 'เตียงคู่ อาคาร A ชั้น 2' },
  { id: 'rA15', number: 'A15', type: 'double', floor: 2, wing: 'front', status: 'maintenance', pricePerNight: 500, maxGuests: 2, amenities, description: 'เตียงคู่ อาคาร A ชั้น 2' },
  { id: 'rA16', number: 'A16', type: 'single', floor: 2, wing: 'front', status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร A ชั้น 2' },
  { id: 'rA17', number: 'A17', type: 'single', floor: 2, wing: 'front', status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร A ชั้น 2' },
  { id: 'rA18', number: 'A18', type: 'single', floor: 2, wing: 'front', status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร A ชั้น 2' },
  { id: 'rA19', number: 'A19', type: 'single', floor: 2, wing: 'front', status: 'occupied',    pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร A ชั้น 2', currentGuestId: 'g004', currentBookingId: 'b004' },
  { id: 'rA20', number: 'A20', type: 'single', floor: 2, wing: 'front', status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร A ชั้น 2' },

  // ===== อาคาร B — 20 ห้อง =====
  // ชั้น 1: B1-B10
  { id: 'rB1',  number: 'B1',  type: 'triple', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 700, maxGuests: 3, amenities, description: '3 เตียง อาคาร B ชั้น 1' },
  { id: 'rB2',  number: 'B2',  type: 'double', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 2, amenities, description: 'เตียงคู่ อาคาร B ชั้น 1' },
  { id: 'rB3',  number: 'B3',  type: 'double', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 2, amenities, description: 'เตียงคู่ อาคาร B ชั้น 1' },
  { id: 'rB4',  number: 'B4',  type: 'double', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 2, amenities, description: 'เตียงคู่ อาคาร B ชั้น 1' },
  { id: 'rB5',  number: 'B5',  type: 'double', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 2, amenities, description: 'เตียงคู่ อาคาร B ชั้น 1' },
  { id: 'rB6',  number: 'B6',  type: 'single', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 1' },
  { id: 'rB7',  number: 'B7',  type: 'single', floor: 1, wing: 'back',  status: 'occupied',    pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 1', currentBookingId: 'b010' },
  { id: 'rB8',  number: 'B8',  type: 'single', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 1' },
  { id: 'rB9',  number: 'B9',  type: 'single', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 1' },
  { id: 'rB10', number: 'B10', type: 'single', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 1' },
  // ชั้น 2: B11-B20
  { id: 'rB11', number: 'B11', type: 'single', floor: 2, wing: 'back',  status: 'cleaning',    pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 2' },
  { id: 'rB12', number: 'B12', type: 'single', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 2' },
  { id: 'rB13', number: 'B13', type: 'single', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 2' },
  { id: 'rB14', number: 'B14', type: 'single', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 2' },
  { id: 'rB15', number: 'B15', type: 'single', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 2' },
  { id: 'rB16', number: 'B16', type: 'single', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 2' },
  { id: 'rB17', number: 'B17', type: 'single', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 2' },
  { id: 'rB18', number: 'B18', type: 'single', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 2' },
  { id: 'rB19', number: 'B19', type: 'single', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 2' },
  { id: 'rB20', number: 'B20', type: 'single', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 500, maxGuests: 1, amenities, description: 'เตียงเดี่ยว อาคาร B ชั้น 2' },
]

export const mockGuests: Guest[] = [
  {
    id: 'g001', name: 'สมชาย ใจดี', email: 'somchai@email.com', phone: '0812345678',
    nationality: 'ไทย', idNumber: '1234567890123',
    preferences: { pillow: 'high', floor: 'high', foodAllergies: ['กุ้ง'], specialRequests: ['หมอนเพิ่ม 1 ใบ'], smokingRoom: false, bedType: 'double' },
    totalStays: 12, totalSpend: 5000, joinedAt: '2022-03-15'
  },
  {
    id: 'g002', name: 'สุดา วงษ์สวัสดิ์', email: 'suda@email.com', phone: '0823456789',
    nationality: 'ไทย', idNumber: '2345678901234',
    preferences: { pillow: 'soft', floor: 'low', foodAllergies: [], specialRequests: [], smokingRoom: false, bedType: 'twin' },
    totalStays: 1, totalSpend: 1500, joinedAt: '2023-06-20'
  },
  {
    id: 'g003', name: 'John Smith', email: 'john@email.com', phone: '0834567890',
    nationality: 'อังกฤษ', idNumber: 'AB123456',
    preferences: { pillow: 'firm', floor: 'high', foodAllergies: ['นม', 'แป้งสาลี'], specialRequests: ['น้ำแร่ในห้อง', 'หนังสือพิมพ์ภาษาอังกฤษ'], smokingRoom: false, bedType: 'double' },
    totalStays: 2, totalSpend: 5500, joinedAt: '2021-01-10'
  },
  {
    id: 'g004', name: 'วิชัย มั่งมี', email: 'wichai@email.com', phone: '0845678901',
    nationality: 'ไทย', idNumber: '3456789012345',
    preferences: { pillow: 'high', floor: 'high', foodAllergies: [], specialRequests: ['ผลไม้ต้อนรับ', 'แชมเปญ'], smokingRoom: false, bedType: 'double' },
    totalStays: 1, totalSpend: 2000, joinedAt: '2020-08-05'
  },
  {
    id: 'g005', name: 'Yuki Tanaka', email: 'yuki@email.com', phone: '0856789012',
    nationality: 'ญี่ปุ่น', idNumber: 'JPN987654',
    preferences: { pillow: null, floor: null, foodAllergies: ['อาหารทะเล'], specialRequests: [], smokingRoom: false, bedType: 'double' },
    totalStays: 1, totalSpend: 2000, joinedAt: '2024-02-14'
  },
  {
    id: 'g006', name: 'มาลี ประดับ', email: 'malee@email.com', phone: '0867890123',
    nationality: 'ไทย', idNumber: '4567890123456',
    preferences: { pillow: 'soft', floor: 'low', foodAllergies: [], specialRequests: ['ห้องติดกัน 2 ห้อง'], smokingRoom: false, bedType: 'twin' },
    totalStays: 8, totalSpend: 32000, joinedAt: '2022-11-30'
  },
]

export const mockBookings: Booking[] = [
  // ===== เข้าพักอยู่ปัจจุบัน (checkIn <= วันนี้ < checkOut) =====
  { id: 'b001', roomId: 'rA1',  guestId: 'g001', checkIn: '2026-05-27', checkOut: '2026-06-03', nights: 7, status: 'checked_in',  source: 'direct',   totalAmount: 3500, paidAmount: 3500, adults: 2, children: 0, specialRequests: 'หมอนเพิ่ม',         createdAt: '2026-05-20T10:00:00', paymentMethod: 'credit_card',   payments: [{ id: 'pay001', amount: 3500, method: 'credit_card',   date: '2026-05-27T14:00:00', staffId: 's002' }] },
  { id: 'b002', roomId: 'rA11', guestId: 'g002', checkIn: '2026-05-28', checkOut: '2026-05-31', nights: 3, status: 'checked_in',  source: 'direct',   totalAmount: 1500, paidAmount: 1500, adults: 2, children: 0, specialRequests: '',                  createdAt: '2026-05-22T09:00:00', paymentMethod: 'qr_code',       payments: [{ id: 'pay002', amount: 1500, method: 'qr_code',       date: '2026-05-28T15:00:00', staffId: 's002' }] },
  { id: 'b003', roomId: 'rA3',  guestId: 'g003', checkIn: '2026-05-26', checkOut: '2026-06-01', nights: 6, status: 'checked_in',  source: 'direct',   totalAmount: 3000, paidAmount: 3000, adults: 1, children: 0, specialRequests: 'น้ำแร่ในห้อง',      createdAt: '2026-05-15T11:00:00', paymentMethod: 'credit_card',   payments: [{ id: 'pay003', amount: 3000, method: 'credit_card',   date: '2026-05-26T13:00:00', staffId: 's002' }] },
  // ===== เช็คอินวันนี้ 29 พ.ค. =====
  { id: 'b004', roomId: 'rA19', guestId: 'g004', checkIn: '2026-05-29', checkOut: '2026-06-02', nights: 4, status: 'checked_in',  source: 'direct',   totalAmount: 2000, paidAmount: 2000, adults: 2, children: 0, specialRequests: 'ผลไม้ต้อนรับ',     createdAt: '2026-05-20T14:00:00', paymentMethod: 'bank_transfer', payments: [{ id: 'pay004', amount: 2000, method: 'bank_transfer', date: '2026-05-29T10:30:00', staffId: 's002' }] },
  // ===== เช็คเอาต์วันนี้ 29 พ.ค. =====
  { id: 'b005', roomId: 'rA2',  guestId: 'g005', checkIn: '2026-05-25', checkOut: '2026-05-29', nights: 4, status: 'checked_out', source: 'direct',   totalAmount: 2000, paidAmount: 2000, adults: 2, children: 0, specialRequests: '',                  createdAt: '2026-05-18T10:00:00', paymentMethod: 'credit_card',   payments: [{ id: 'pay005', amount: 2000, method: 'credit_card',   date: '2026-05-25T14:00:00', staffId: 's002' }] },
  // ===== Walk-in วันนี้ 29 พ.ค. =====
  { id: 'b010', roomId: 'rB7',  guestSnapshot: { name: 'สมชาย ผ่านมา', phone: '0812345678', idNumber: '1234567890123' }, checkIn: '2026-05-29', checkOut: '2026-05-30', nights: 1, status: 'checked_in', source: 'walk_in', totalAmount: 500, paidAmount: 500, adults: 1, children: 0, specialRequests: '', createdAt: '2026-05-29T14:00:00', paymentMethod: 'cash', payments: [{ id: 'pay010', amount: 500, method: 'cash', date: '2026-05-29T14:05:00', staffId: 's002' }] },
  // ===== อนาคต — confirmed =====
  { id: 'b006', roomId: 'rB4',  guestId: 'g006', checkIn: '2026-06-05', checkOut: '2026-06-08', nights: 3, status: 'confirmed',  source: 'direct',   totalAmount: 1500, paidAmount: 500,  adults: 2, children: 2, specialRequests: 'เตียงเสริมสำหรับเด็ก', createdAt: '2026-05-20T09:00:00', paymentMethod: 'credit_card' },
  // ===== อดีต — checked_out =====
  { id: 'b007', roomId: 'rA7',  guestId: 'g001', checkIn: '2026-04-20', checkOut: '2026-04-23', nights: 3, status: 'checked_out', source: 'direct',   totalAmount: 1500, paidAmount: 1500, adults: 2, children: 0, specialRequests: '',                  createdAt: '2026-04-10T09:00:00', paymentMethod: 'credit_card',   isCorporate: true, corporateAccountId: 'corp001', payments: [{ id: 'pay007', amount: 1500, method: 'credit_card',   date: '2026-04-23T12:00:00', staffId: 's002' }] },
  { id: 'b008', roomId: 'rB6',  guestId: 'g003', checkIn: '2026-05-15', checkOut: '2026-05-20', nights: 5, status: 'checked_out', source: 'direct',   totalAmount: 2500, paidAmount: 2500, adults: 1, children: 0, specialRequests: '',                  createdAt: '2026-05-10T10:00:00', paymentMethod: 'credit_card',   payments: [{ id: 'pay008', amount: 2500, method: 'credit_card',   date: '2026-05-20T11:00:00', staffId: 's002' }] },
  // ===== ยกเลิก =====
  { id: 'b009', roomId: 'rA9',  guestId: 'g002', checkIn: '2026-06-10', checkOut: '2026-06-13', nights: 3, status: 'cancelled',  source: 'direct',   totalAmount: 1500, paidAmount: 0,    adults: 2, children: 0, specialRequests: '',                  createdAt: '2026-05-25T15:00:00', paymentMethod: 'qr_code' },
]

export const mockInvoices: Invoice[] = [
  {
    id: 'inv001', bookingId: 'b005', guestId: 'g005', amount: 2000, tax: 0, total: 2000,
    status: 'paid', issuedAt: '2026-05-29T11:30:00', paidAt: '2026-05-29T11:30:00', paymentMethod: 'credit_card',
    items: [
      { description: 'ค่าห้องพัก เตียงคู่ 4 คืน (A2)', quantity: 4, unitPrice: 500, total: 2000 },
    ]
  },
  {
    id: 'inv002', bookingId: 'b007', guestId: 'g001', amount: 1500, tax: 0, total: 1500,
    status: 'paid', issuedAt: '2026-04-23T12:00:00', paidAt: '2026-04-23T12:00:00', paymentMethod: 'credit_card',
    items: [
      { description: 'ค่าห้องพัก เตียงเดี่ยว 3 คืน (A7)', quantity: 3, unitPrice: 500, total: 1500 },
    ]
  },
  {
    id: 'inv003', bookingId: 'b008', guestId: 'g003', amount: 2500, tax: 0, total: 2500,
    status: 'paid', issuedAt: '2026-05-20T11:00:00', paidAt: '2026-05-20T11:00:00', paymentMethod: 'credit_card',
    items: [
      { description: 'ค่าห้องพัก เตียงเดี่ยว 5 คืน (B6)', quantity: 5, unitPrice: 500, total: 2500 },
    ]
  },
  {
    id: 'inv004', bookingId: 'b010', amount: 500, tax: 0, total: 500,
    status: 'paid', issuedAt: '2026-05-29T14:10:00', paidAt: '2026-05-29T14:10:00', paymentMethod: 'cash',
    items: [
      { description: 'ค่าห้องพัก เตียงเดี่ยว 1 คืน (B7)', quantity: 1, unitPrice: 500, total: 500 },
    ]
  },
]

export const mockHousekeepingTasks: HousekeepingTask[] = [
  { id: 'hk001', roomId: 'rA4',  roomNumber: 'A4',  assignedTo: 'นิดา สะอาด', staffId: 's004', status: 'in_progress', priority: 'high',   notes: 'ผู้เข้าพักออกแล้ว รีบทำความสะอาด',           scheduledAt: '2026-05-29T09:00:00', startedAt: '2026-05-29T09:30:00' },
  { id: 'hk002', roomId: 'rB11', roomNumber: 'B11', assignedTo: 'มะลิ สวย',   staffId: 's005', status: 'pending',     priority: 'normal', notes: 'ทำความสะอาดประจำวัน',                         scheduledAt: '2026-05-29T10:00:00' },
  { id: 'hk003', roomId: 'rB13', roomNumber: 'B13', assignedTo: 'นิดา สะอาด', staffId: 's004', status: 'pending',     priority: 'normal', notes: '',                                              scheduledAt: '2026-05-29T11:00:00' },
  { id: 'hk004', roomId: 'rA2',  roomNumber: 'A2',  assignedTo: 'มะลิ สวย',   staffId: 's005', status: 'pending',     priority: 'high',   notes: 'เช็คเอาต์แล้ว รอทำความสะอาด',                scheduledAt: '2026-05-29T12:00:00' },
  { id: 'hk005', roomId: 'rA19', roomNumber: 'A19', assignedTo: 'มะลิ สวย',   staffId: 's005', status: 'completed',   priority: 'urgent', notes: 'เตรียมห้องก่อนแขกเช็คอิน',                   scheduledAt: '2026-05-29T08:00:00', startedAt: '2026-05-29T08:05:00', completedAt: '2026-05-29T08:50:00' },
]

export const mockMaintenanceLogs: MaintenanceLog[] = [
  { id: 'm001', roomId: 'rA5',  roomNumber: 'เฮียดิเรก',  issue: 'เครื่องปรับอากาศขัดข้อง', description: 'AC ไม่เย็น คอมเพรสเซอร์มีเสียงดัง',       status: 'in_progress', priority: 'high',   reportedBy: 'พนักงานต้อนรับ', reportedAt: '2026-05-25T14:00:00', assignedTo: 'สมศักดิ์ ช่างซ่อม' },
  { id: 'm002', roomId: 'rA15', roomNumber: 'A15', issue: 'ท่อน้ำรั่ว',               description: 'ท่อน้ำในห้องน้ำรั่ว น้ำซึมออกมาที่พื้น',   status: 'open',        priority: 'urgent', reportedBy: 'แม่บ้าน',         reportedAt: '2026-05-29T08:30:00' },
  { id: 'm003', roomId: 'rB3',  roomNumber: 'B3',  issue: 'โทรทัศน์ไม่มีสัญญาณ',    description: 'รีโมทไม่ทำงาน สัญญาณขาดหาย',                status: 'resolved',    priority: 'normal', reportedBy: 'แขกผู้เข้าพัก',  reportedAt: '2026-05-20T20:00:00', assignedTo: 'สมศักดิ์ ช่างซ่อม', resolvedAt: '2026-05-20T21:00:00', cost: 200 },
  { id: 'm004', roomId: 'rA1',  roomNumber: 'A1',  issue: 'หลอดไฟในห้องน้ำขาด',     description: 'หลอดไฟเสีย 1 ดวง',                           status: 'resolved',    priority: 'low',    reportedBy: 'แม่บ้าน',         reportedAt: '2026-05-22T09:00:00', assignedTo: 'สมศักดิ์ ช่างซ่อม', resolvedAt: '2026-05-22T09:30:00', cost: 150 },
]

export const mockStaff: Staff[] = [
  {
    id: 's001', name: 'อดิศักดิ์ ผู้จัดการ', role: 'admin', email: 'admin@hotel.com', phone: '0891234567',
    hireDate: '2019-01-01', isActive: true,
    permissions: { canViewDashboard: true, canManageBookings: true, canManageGuests: true, canViewFinance: true, canManageFinance: true, canManageRooms: true, canManageStaff: true, canViewReports: true, canManageHousekeeping: true, canManageMaintenance: true, canManageInventory: true, canManageCorporate: true }
  },
  {
    id: 's002', name: 'นภา พนักงานต้อนรับ', role: 'receptionist', email: 'napa@hotel.com', phone: '0892345678',
    hireDate: '2021-05-15', isActive: true,
    permissions: { canViewDashboard: true, canManageBookings: true, canManageGuests: true, canViewFinance: false, canManageFinance: false, canManageRooms: false, canManageStaff: false, canViewReports: false, canManageHousekeeping: false, canManageMaintenance: true, canManageInventory: false, canManageCorporate: true }
  },
  {
    id: 's003', name: 'วรรณา นักบัญชี', role: 'accountant', email: 'wanna@hotel.com', phone: '0893456789',
    hireDate: '2020-08-01', isActive: true,
    permissions: { canViewDashboard: true, canManageBookings: false, canManageGuests: false, canViewFinance: true, canManageFinance: true, canManageRooms: false, canManageStaff: false, canViewReports: true, canManageHousekeeping: false, canManageMaintenance: false, canManageInventory: false, canManageCorporate: true }
  },
  {
    id: 's004', name: 'นิดา สะอาด', role: 'housekeeper', email: 'nida@hotel.com', phone: '0894567890',
    hireDate: '2022-02-10', isActive: true,
    permissions: { canViewDashboard: false, canManageBookings: false, canManageGuests: false, canViewFinance: false, canManageFinance: false, canManageRooms: false, canManageStaff: false, canViewReports: false, canManageHousekeeping: true, canManageMaintenance: false, canManageInventory: true, canManageCorporate: false }
  },
  {
    id: 's005', name: 'มะลิ สวย', role: 'housekeeper', email: 'mali@hotel.com', phone: '0895678901',
    hireDate: '2023-03-20', isActive: true,
    permissions: { canViewDashboard: false, canManageBookings: false, canManageGuests: false, canViewFinance: false, canManageFinance: false, canManageRooms: false, canManageStaff: false, canViewReports: false, canManageHousekeeping: true, canManageMaintenance: false, canManageInventory: true, canManageCorporate: false }
  },
  {
    id: 's006', name: 'สมศักดิ์ ช่างซ่อม', role: 'maintenance', email: 'somsak@hotel.com', phone: '0896789012',
    hireDate: '2021-11-01', isActive: true,
    permissions: { canViewDashboard: false, canManageBookings: false, canManageGuests: false, canViewFinance: false, canManageFinance: false, canManageRooms: false, canManageStaff: false, canViewReports: false, canManageHousekeeping: false, canManageMaintenance: true, canManageInventory: true, canManageCorporate: false }
  },
]

// ===== Users สำหรับ Login =====
// รหัสผ่านเก็บเป็น bcrypt hash (ไม่ใช่ plaintext) — verify ด้วย lib/auth-utils.ts
// Demo credentials (plaintext) สำหรับลองเข้าระบบ:
//   admin/admin123 · reception/reception · accountant/account
//   nida/nida123 · mali/mali123 · somsak/somsak123
export const mockUsers: User[] = [
  { id: 'u001', username: 'admin',        password: '$2b$10$55iY2DWPrKuE8h5HmklJiO90nUdZx9uHIzlxJ0I0vS6VWXMlb034K', staffId: 's001' },
  { id: 'u002', username: 'reception',    password: '$2b$10$2n6qW9cBaqQ8hwCqJeR1POUAuCEVoF8sv.G57IfqNCZRtMgEwQAMm', staffId: 's002' },
  { id: 'u003', username: 'accountant',   password: '$2b$10$46xzHXE3uS2oupMzyhIGEuwcEEmUGxbd8W5a69SURkzdn3prq5R4.', staffId: 's003' },
  { id: 'u004', username: 'nida',         password: '$2b$10$dXWxvL5ynqbCcoSaY2pYZ.P2DWS7x1ZXtiWfAu6sx2G.QMK.lgj9C', staffId: 's004' },
  { id: 'u005', username: 'mali',         password: '$2b$10$LttAAyo8xxFZpA62NTS0WuVU5Atd/EZxsdPrRVVmZvY5qNIR7zxgu', staffId: 's005' },
  { id: 'u006', username: 'somsak',       password: '$2b$10$uRTXc830uhj6It.cp5Yxru3rZ4oKPHSSgktnWECY0nc6IJ6xP/7Sa', staffId: 's006' },
]



export const mockInventoryItems: InventoryItem[] = [
  // อุปกรณ์ห้องพัก
  { id: 'inv001', name: 'สบู่ก้อน',         category: 'room_amenities', unit: 'piece',  currentStock: 150, minStock: 50,  maxStock: 500, costPerUnit: 12,  supplier: 'บริษัท Clean Co.', lastRestocked: '2026-05-01' },
  { id: 'inv002', name: 'แชมพู (ขวดเล็ก)', category: 'room_amenities', unit: 'bottle', currentStock: 80,  minStock: 60,  maxStock: 400, costPerUnit: 18,  supplier: 'บริษัท Clean Co.', lastRestocked: '2026-05-01' },
  { id: 'inv003', name: 'ผ้าเช็ดตัว',        category: 'room_amenities', unit: 'piece',  currentStock: 200, minStock: 80,  maxStock: 300, costPerUnit: 120, supplier: 'โรงงานผ้า ABC',   lastRestocked: '2026-04-20' },
  { id: 'inv004', name: 'กระดาษทิชชู',      category: 'room_amenities', unit: 'pack',   currentStock: 40,  minStock: 50,  maxStock: 300, costPerUnit: 25,  supplier: 'บริษัท Paper Plus', lastRestocked: '2026-04-25', notes: 'ใกล้หมด' },
  { id: 'inv005', name: 'สลิปเปอร์',          category: 'room_amenities', unit: 'set',    currentStock: 120, minStock: 40,  maxStock: 200, costPerUnit: 35,  supplier: 'โรงงานผ้า ABC',   lastRestocked: '2026-04-15' },
  // มินิบาร์
  { id: 'inv006', name: 'น้ำดื่ม 600ml',      category: 'minibar',        unit: 'bottle', currentStock: 300, minStock: 100, maxStock: 600, costPerUnit: 10,  supplier: 'บริษัท Aqua',      lastRestocked: '2026-05-08' },
  { id: 'inv007', name: 'โค้ก 325ml',         category: 'minibar',        unit: 'bottle', currentStock: 45,  minStock: 60,  maxStock: 300, costPerUnit: 20,  supplier: 'บริษัท Beverage',  lastRestocked: '2026-04-30', notes: 'ต้องสั่งเพิ่ม' },
  { id: 'inv008', name: 'เบียร์ช้าง 320ml', category: 'minibar',        unit: 'bottle', currentStock: 80,  minStock: 60,  maxStock: 200, costPerUnit: 35,  supplier: 'บริษัท Beverage',  lastRestocked: '2026-05-01' },
  { id: 'inv009', name: 'ถั่วอบ (ซอง)',      category: 'minibar',        unit: 'pack',   currentStock: 120, minStock: 50,  maxStock: 300, costPerUnit: 25,  supplier: 'บริษัท Snack',     lastRestocked: '2026-04-28' },
  { id: 'inv010', name: 'ช็อกโกแลต',         category: 'minibar',        unit: 'piece',  currentStock: 90,  minStock: 40,  maxStock: 200, costPerUnit: 30,  supplier: 'บริษัท Snack',     lastRestocked: '2026-04-28' },
  // วัสดุทำความสะอาด
  { id: 'inv011', name: 'น้ำยาทำความสะอาดพื้น', category: 'cleaning_supplies', unit: 'liter',  currentStock: 25,  minStock: 20,  maxStock: 100, costPerUnit: 85,  supplier: 'บริษัท CleanPro', lastRestocked: '2026-04-10' },
  { id: 'inv012', name: 'ผงซักฟอก',           category: 'cleaning_supplies', unit: 'kg',     currentStock: 15,  minStock: 20,  maxStock: 80,  costPerUnit: 120, supplier: 'บริษัท CleanPro', lastRestocked: '2026-04-10', notes: 'ต้องสั่งเพิ่มด่วน' },
  { id: 'inv013', name: 'ถุงขยะ (ม้วน)',      category: 'cleaning_supplies', unit: 'pack',   currentStock: 60,  minStock: 30,  maxStock: 200, costPerUnit: 45,  supplier: 'บริษัท CleanPro', lastRestocked: '2026-04-20' },
  { id: 'inv014', name: 'น้ำยาล้างห้องน้ำ',  category: 'cleaning_supplies', unit: 'bottle', currentStock: 35,  minStock: 20,  maxStock: 120, costPerUnit: 65,  supplier: 'บริษัท CleanPro', lastRestocked: '2026-04-15' },
  { id: 'inv015', name: 'น้ำยาฆ่าเชื้อ',     category: 'cleaning_supplies', unit: 'liter',  currentStock: 8,   minStock: 15,  maxStock: 60,  costPerUnit: 150, supplier: 'บริษัท MedClean', lastRestocked: '2026-04-01', notes: 'สต็อกต่ำมาก' },
]

export const mockInventoryTransactions: InventoryTransaction[] = [
  { id: 'itx001', itemId: 'inv001', type: 'restock', quantity: 100, performedBy: 's004', date: '2026-05-01T09:00:00', notes: 'เติมสต็อกประจำเดือน' },
  { id: 'itx002', itemId: 'inv006', type: 'restock', quantity: 200, performedBy: 's004', date: '2026-05-08T10:00:00' },
  { id: 'itx003', itemId: 'inv004', type: 'use',     quantity: -20, performedBy: 's005', date: '2026-05-09T14:00:00', referenceId: 'hk001' },
  { id: 'itx004', itemId: 'inv007', type: 'use',     quantity: -15, performedBy: 's004', date: '2026-05-10T08:00:00' },
  { id: 'itx005', itemId: 'inv015', type: 'use',     quantity: -7,  performedBy: 's005', date: '2026-05-10T09:00:00', notes: 'ทำความสะอาดห้องพักพิเศษ' },
]

export const mockCorporateAccounts: CorporateAccount[] = [
  {
    id: 'corp001', companyName: 'บริษัท ไทยพัฒนา จำกัด', contactPerson: 'คุณประวิทย์ สมบูรณ์',
    contactPhone: '0812345678', contactEmail: 'prawit@thaipattana.co.th',
    taxId: '0105561234567', address: '99/1 ถ.สุขุมวิท กรุงเทพฯ 10110',
    totalDeposited: 100000, totalUsed: 48500, availableBalance: 51500,
    status: 'active', createdAt: '2025-01-15', notes: 'ลูกค้าองค์กรขนาดใหญ่ ส่งพนักงานเข้าพักบ่อย'
  },
  {
    id: 'corp002', companyName: 'บริษัท ซันไรส์ เทรดดิ้ง จำกัด', contactPerson: 'คุณสุภาพร แสนดี',
    contactPhone: '0823456789', contactEmail: 'supaporn@sunrise.co.th',
    taxId: '0105562345678', address: '55 ถ.รัชดาภิเษก กรุงเทพฯ 10310',
    totalDeposited: 50000, totalUsed: 38200, availableBalance: 11800,
    status: 'active', createdAt: '2025-06-01',
  },
  {
    id: 'corp003', companyName: 'ห้างหุ้นส่วน มงคล', contactPerson: 'คุณมงคล ทรัพย์ดี',
    contactPhone: '0834567890', contactEmail: 'mongkol@mongkol.co.th',
    taxId: '0105563456789', address: '12 ถ.เพชรบุรี กรุงเทพฯ 10400',
    totalDeposited: 20000, totalUsed: 20000, availableBalance: 0,
    status: 'suspended', createdAt: '2025-03-10', notes: 'เครดิตหมด รอการโอนเงินเพิ่ม'
  },
]

export const mockCorporateTransactions: CorporateTransaction[] = [
  { id: 'ctx001', corporateAccountId: 'corp001', type: 'deposit', amount: 100000, balanceBefore: 0,      balanceAfter: 100000, performedBy: 's003', date: '2025-01-15T10:00:00', notes: 'เปิดบัญชีและวางมัดจำครั้งแรก' },
  { id: 'ctx002', corporateAccountId: 'corp001', type: 'charge',  amount: 1500,   balanceBefore: 100000, balanceAfter: 98500,  performedBy: 's002', date: '2026-04-23T12:00:00', bookingId: 'b007', notes: 'พนักงาน: นายวีระ สมใจ เข้าพัก 3 คืน' },
  { id: 'ctx003', corporateAccountId: 'corp002', type: 'deposit', amount: 50000,  balanceBefore: 0,      balanceAfter: 50000,  performedBy: 's003', date: '2025-06-01T09:00:00', notes: 'วางมัดจำครั้งแรก' },
  { id: 'ctx004', corporateAccountId: 'corp002', type: 'charge',  amount: 38200,  balanceBefore: 50000,  balanceAfter: 11800,  performedBy: 's002', date: '2026-05-01T12:00:00', notes: 'พนักงานเข้าพักหลายรายการ' },
  { id: 'ctx005', corporateAccountId: 'corp003', type: 'deposit', amount: 20000,  balanceBefore: 0,      balanceAfter: 20000,  performedBy: 's003', date: '2025-03-10T11:00:00', notes: 'วางมัดจำ' },
  { id: 'ctx006', corporateAccountId: 'corp003', type: 'charge',  amount: 20000,  balanceBefore: 20000,  balanceAfter: 0,      performedBy: 's002', date: '2026-03-15T14:00:00', notes: 'ใช้เครดิตครบ' },
]

export const mockAddOnItems: AddOnItem[] = [
  { id: 'ao001', name: 'ที่นอนเสริม',          category: 'bedding',  price: 300, inventoryQtyPerUnit: 0, isAvailable: true },
  { id: 'ao002', name: 'หมอนเพิ่ม',             category: 'bedding',  price: 100, inventoryQtyPerUnit: 0, isAvailable: true },
  { id: 'ao003', name: 'ผ้าเช็ดตัวเพิ่ม',      category: 'amenity',  price: 50,  inventoryItemId: 'inv003', inventoryQtyPerUnit: 1, isAvailable: true },
  { id: 'ao004', name: 'ชุดสบู่+แชมพูเพิ่ม',  category: 'amenity',  price: 80,  inventoryItemId: 'inv001', inventoryQtyPerUnit: 1, isAvailable: true },
  { id: 'ao005', name: 'น้ำดื่มเพิ่ม 6 ขวด',  category: 'amenity',  price: 60,  inventoryItemId: 'inv006', inventoryQtyPerUnit: 6, isAvailable: true },
  { id: 'ao006', name: 'Late Check-out',         category: 'service',  price: 300, inventoryQtyPerUnit: 0, isAvailable: true },
  { id: 'ao007', name: 'Early Check-in',         category: 'service',  price: 200, inventoryQtyPerUnit: 0, isAvailable: true },
]

export const mockBookingAddOns: BookingAddOn[] = [
  { id: 'ba001', bookingId: 'b001', addOnItemId: 'ao001', quantity: 1, unitPrice: 300, totalPrice: 300,  status: 'fulfilled',  requestedAt: '2026-05-08T14:00:00', requestedBy: 's002', fulfilledAt: '2026-05-08T15:30:00', fulfilledBy: 's004' },
  { id: 'ba002', bookingId: 'b003', addOnItemId: 'ao003', quantity: 2, unitPrice: 50,  totalPrice: 100,  status: 'requested',  requestedAt: '2026-05-10T09:00:00', requestedBy: 's002', notes: 'ต้องการผ้าเพิ่มสำหรับ 2 ท่าน' },
  { id: 'ba003', bookingId: 'b001', addOnItemId: 'ao005', quantity: 1, unitPrice: 60,  totalPrice: 60,   status: 'requested',  requestedAt: '2026-05-09T20:00:00', requestedBy: 's002' },
]

export const mockDynamicPricing = [
  { id: 'dp001', roomType: 'single', name: 'ราคาปกติ',    startDate: '2026-01-01', endDate: '2026-12-31', price: 500, description: 'ราคามาตรฐานเตียงเดี่ยว' },
  { id: 'dp002', roomType: 'double', name: 'ราคาปกติ',    startDate: '2026-01-01', endDate: '2026-12-31', price: 500, description: 'ราคามาตรฐานเตียงคู่' },
  { id: 'dp003', roomType: 'triple', name: 'ราคาปกติ',    startDate: '2026-01-01', endDate: '2026-12-31', price: 700, description: 'ราคามาตรฐาน 3 เตียง' },
]

// ========== EXPENSES: รายจ่าย/ต้นทุนดำเนินงาน ==========
export const mockExpenses: Expense[] = [
  // ----- งวด 5/2026 (เดือนปัจจุบันของ mock) -----
  { id: 'exp001', date: '2026-05-28', category: 'salary',             description: 'เงินเดือนพนักงาน 5/2026 (ฝ่ายต้อนรับ)', payee: '-',                  amount: 17868, note: 'โอนผ่านธนาคาร', createdAt: '2026-05-28T10:00:00' },
  { id: 'exp002', date: '2026-05-28', category: 'salary',             description: 'เงินเดือนพนักงาน 5/2026 (แม่บ้าน/ช่าง)', payee: '-',                  amount: 15148, note: 'โอนผ่านธนาคาร', createdAt: '2026-05-28T10:05:00' },
  { id: 'exp003', date: '2026-05-15', category: 'utilities_electric', description: 'ค่าไฟฟ้ารวมเดือน 5/2026',           payee: 'การไฟฟ้านครหลวง',     amount: 24944.40, createdAt: '2026-05-15T09:00:00' },
  { id: 'exp004', date: '2026-05-15', category: 'utilities_water',    description: 'ค่าน้ำประปารวมเดือน 5/2026',         payee: 'การประปานครหลวง',     amount: 4603.50, createdAt: '2026-05-15T09:05:00' },
  { id: 'exp005', date: '2026-05-10', category: 'utilities_internet', description: 'ค่าอินเทอร์เน็ต/ไฟเบอร์ 5/2026',     payee: 'True Corporation',    amount: 3906, createdAt: '2026-05-10T11:00:00' },
  { id: 'exp006', date: '2026-05-17', category: 'maintenance',        description: 'ซ่อมเครื่องปรับอากาศ + ปั๊มน้ำ',      payee: 'บริษัท คลีนเซอร์วิส',   amount: 6553, createdAt: '2026-05-17T14:00:00' },
  { id: 'exp007', date: '2026-05-08', category: 'cleaning',           description: 'ค่าทำความสะอาดพื้นที่ส่วนกลาง',       payee: 'บริษัท คลีนเซอร์วิส',   amount: 7000, createdAt: '2026-05-08T13:00:00' },
  { id: 'exp008', date: '2026-05-05', category: 'tax',                description: 'ภาษีโรงเรือนและที่ดิน',              payee: 'สำนักงานเขต',         amount: 7326, createdAt: '2026-05-05T10:30:00' },
  { id: 'exp009', date: '2026-05-12', category: 'marketing',          description: 'ค่าโฆษณาออนไลน์ + ป้าย',             payee: 'Facebook Ads',        amount: 4888, createdAt: '2026-05-12T16:00:00' },
  { id: 'exp010', date: '2026-05-21', category: 'supplies',           description: 'วัสดุสิ้นเปลือง (สบู่/กระดาษ/น้ำยา)', payee: 'แม็คโคร',             amount: 3210, createdAt: '2026-05-21T15:30:00' },
  { id: 'exp011', date: '2026-05-21', category: 'other',              description: 'ค่าอาหารพนักงาน/เบ็ดเตล็ด',          payee: '-',                  amount: 1204, createdAt: '2026-05-21T12:00:00' },

  // ----- งวด 4/2026 (เดือนก่อนหน้า — ไว้สลับดูย้อนหลัง) -----
  { id: 'exp012', date: '2026-04-28', category: 'salary',             description: 'เงินเดือนพนักงาน 4/2026',            payee: '-',                  amount: 32500, createdAt: '2026-04-28T10:00:00' },
  { id: 'exp013', date: '2026-04-15', category: 'utilities_electric', description: 'ค่าไฟฟ้ารวมเดือน 4/2026',           payee: 'การไฟฟ้านครหลวง',     amount: 21880, createdAt: '2026-04-15T09:00:00' },
  { id: 'exp014', date: '2026-04-15', category: 'utilities_water',    description: 'ค่าน้ำประปารวมเดือน 4/2026',         payee: 'การประปานครหลวง',     amount: 4120, createdAt: '2026-04-15T09:05:00' },
  { id: 'exp015', date: '2026-04-10', category: 'utilities_internet', description: 'ค่าอินเทอร์เน็ต/ไฟเบอร์ 4/2026',     payee: 'True Corporation',    amount: 3906, createdAt: '2026-04-10T11:00:00' },
]
