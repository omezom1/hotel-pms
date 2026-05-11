import type {
  Room, Guest, Booking, Invoice, HousekeepingTask,
  MaintenanceLog, Staff, OTAChannel, User,
  InventoryItem, InventoryTransaction, CorporateAccount, CorporateTransaction,
  AddOnItem, BookingAddOn
} from '@/types'

// ========== ROOMS: 40 ห้อง (A1-A20 ด้านหน้า, B1-B20 ด้านหลัง) ==========
// Wing A (ด้านหน้า) - วิวสวย, ราคาพรีเมียม
// Wing B (ด้านหลัง) - ราคาประหยัด

const baseAmenities = ['WiFi', 'TV', 'เครื่องปรับอากาศ']
const stdAmenities = baseAmenities
const dlxAmenities = baseAmenities
const suiteAmenities = baseAmenities
const penthouseAmenities = baseAmenities
const familyAmenities = baseAmenities

export const mockRooms: Room[] = [
  // ===== Wing A (ด้านหน้า) — 20 ห้อง =====
  // ชั้น 1: A1-A10
  { id: 'rA1',  number: 'A1',  type: 'standard', floor: 1, wing: 'front', status: 'occupied',    pricePerNight: 1200, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหน้า ชั้น 1', currentGuestId: 'g001', currentBookingId: 'b001' },
  { id: 'rA2',  number: 'A2',  type: 'standard', floor: 1, wing: 'front', status: 'available',   pricePerNight: 1200, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหน้า ชั้น 1' },
  { id: 'rA3',  number: 'A3',  type: 'standard', floor: 1, wing: 'front', status: 'occupied',    pricePerNight: 1200, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหน้า ชั้น 1', currentGuestId: 'g003', currentBookingId: 'b003' },
  { id: 'rA4',  number: 'A4',  type: 'standard', floor: 1, wing: 'front', status: 'cleaning',    pricePerNight: 1200, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหน้า ชั้น 1' },
  { id: 'rA5',  number: 'A5',  type: 'deluxe',   floor: 1, wing: 'front', status: 'maintenance', pricePerNight: 1800, maxGuests: 2, amenities: dlxAmenities, description: 'ห้อง Deluxe ด้านหน้า ชั้น 1' },
  { id: 'rA6',  number: 'A6',  type: 'deluxe',   floor: 1, wing: 'front', status: 'available',   pricePerNight: 1800, maxGuests: 2, amenities: dlxAmenities, description: 'ห้อง Deluxe ด้านหน้า ชั้น 1' },
  { id: 'rA7',  number: 'A7',  type: 'deluxe',   floor: 1, wing: 'front', status: 'available',   pricePerNight: 1800, maxGuests: 2, amenities: dlxAmenities, description: 'ห้อง Deluxe ด้านหน้า ชั้น 1' },
  { id: 'rA8',  number: 'A8',  type: 'deluxe',   floor: 1, wing: 'front', status: 'available',   pricePerNight: 1800, maxGuests: 2, amenities: dlxAmenities, description: 'ห้อง Deluxe ด้านหน้า ชั้น 1' },
  { id: 'rA9',  number: 'A9',  type: 'deluxe',   floor: 1, wing: 'front', status: 'available',   pricePerNight: 1800, maxGuests: 2, amenities: dlxAmenities, description: 'ห้อง Deluxe ด้านหน้า ชั้น 1' },
  { id: 'rA10', number: 'A10', type: 'deluxe',   floor: 1, wing: 'front', status: 'available',   pricePerNight: 1800, maxGuests: 2, amenities: dlxAmenities, description: 'ห้อง Deluxe ด้านหน้า ชั้น 1' },
  // ชั้น 2: A11-A20
  { id: 'rA11', number: 'A11', type: 'deluxe',   floor: 2, wing: 'front', status: 'occupied',    pricePerNight: 1800, maxGuests: 2, amenities: dlxAmenities, description: 'ห้อง Deluxe ด้านหน้า ชั้น 2', currentGuestId: 'g002', currentBookingId: 'b002' },
  { id: 'rA12', number: 'A12', type: 'deluxe',   floor: 2, wing: 'front', status: 'available',   pricePerNight: 1800, maxGuests: 2, amenities: dlxAmenities, description: 'ห้อง Deluxe ด้านหน้า ชั้น 2' },
  { id: 'rA13', number: 'A13', type: 'deluxe',   floor: 2, wing: 'front', status: 'available',   pricePerNight: 1800, maxGuests: 2, amenities: dlxAmenities, description: 'ห้อง Deluxe ด้านหน้า ชั้น 2' },
  { id: 'rA14', number: 'A14', type: 'deluxe',   floor: 2, wing: 'front', status: 'available',   pricePerNight: 1800, maxGuests: 2, amenities: dlxAmenities, description: 'ห้อง Deluxe ด้านหน้า ชั้น 2' },
  { id: 'rA15', number: 'A15', type: 'suite',    floor: 2, wing: 'front', status: 'maintenance', pricePerNight: 4500, maxGuests: 2, amenities: suiteAmenities, description: 'Suite ด้านหน้า วิวทะเล' },
  { id: 'rA16', number: 'A16', type: 'suite',    floor: 2, wing: 'front', status: 'available',   pricePerNight: 4500, maxGuests: 2, amenities: suiteAmenities, description: 'Suite ด้านหน้า วิวทะเล' },
  { id: 'rA17', number: 'A17', type: 'suite',    floor: 2, wing: 'front', status: 'available',   pricePerNight: 4500, maxGuests: 2, amenities: suiteAmenities, description: 'Suite ด้านหน้า วิวทะเล' },
  { id: 'rA18', number: 'A18', type: 'suite',    floor: 2, wing: 'front', status: 'available',   pricePerNight: 4500, maxGuests: 2, amenities: suiteAmenities, description: 'Suite ด้านหน้า วิวทะเล' },
  { id: 'rA19', number: 'A19', type: 'suite',    floor: 2, wing: 'front', status: 'occupied',    pricePerNight: 4500, maxGuests: 2, amenities: suiteAmenities, description: 'Suite ด้านหน้า วิวทะเล', currentGuestId: 'g004', currentBookingId: 'b004' },
  { id: 'rA20', number: 'A20', type: 'penthouse',floor: 2, wing: 'front', status: 'available',   pricePerNight: 8000, maxGuests: 4, amenities: penthouseAmenities, description: 'Penthouse ด้านหน้า ชั้นบนสุด วิว 360 องศา' },

  // ===== Wing B (ด้านหลัง) — 20 ห้อง =====
  // ชั้น 1: B1-B10
  { id: 'rB1',  number: 'B1',  type: 'standard', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 1000, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 1' },
  { id: 'rB2',  number: 'B2',  type: 'standard', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 1000, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 1' },
  { id: 'rB3',  number: 'B3',  type: 'standard', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 1000, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 1' },
  { id: 'rB4',  number: 'B4',  type: 'standard', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 1000, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 1' },
  { id: 'rB5',  number: 'B5',  type: 'standard', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 1000, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 1' },
  { id: 'rB6',  number: 'B6',  type: 'standard', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 1000, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 1' },
  { id: 'rB7',  number: 'B7',  type: 'standard', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 1000, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 1' },
  { id: 'rB8',  number: 'B8',  type: 'standard', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 1000, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 1' },
  { id: 'rB9',  number: 'B9',  type: 'standard', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 1000, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 1' },
  { id: 'rB10', number: 'B10', type: 'standard', floor: 1, wing: 'back',  status: 'available',   pricePerNight: 1000, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 1' },
  // ชั้น 2: B11-B20
  { id: 'rB11', number: 'B11', type: 'standard', floor: 2, wing: 'back',  status: 'cleaning',    pricePerNight: 1100, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 2' },
  { id: 'rB12', number: 'B12', type: 'standard', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 1100, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 2' },
  { id: 'rB13', number: 'B13', type: 'standard', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 1100, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 2' },
  { id: 'rB14', number: 'B14', type: 'standard', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 1100, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 2' },
  { id: 'rB15', number: 'B15', type: 'standard', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 1100, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 2' },
  { id: 'rB16', number: 'B16', type: 'standard', floor: 2, wing: 'back',  status: 'available',   pricePerNight: 1100, maxGuests: 2, amenities: stdAmenities, description: 'ห้อง Standard ด้านหลัง ชั้น 2' },
  { id: 'rB17', number: 'B17', type: 'deluxe',   floor: 2, wing: 'back',  status: 'available',   pricePerNight: 1500, maxGuests: 2, amenities: dlxAmenities, description: 'ห้อง Deluxe ด้านหลัง ชั้น 2' },
  { id: 'rB18', number: 'B18', type: 'deluxe',   floor: 2, wing: 'back',  status: 'available',   pricePerNight: 1500, maxGuests: 2, amenities: dlxAmenities, description: 'ห้อง Deluxe ด้านหลัง ชั้น 2' },
  { id: 'rB19', number: 'B19', type: 'family',   floor: 2, wing: 'back',  status: 'available',   pricePerNight: 2800, maxGuests: 4, amenities: familyAmenities, description: 'ห้อง Family ด้านหลัง สำหรับครอบครัว' },
  { id: 'rB20', number: 'B20', type: 'family',   floor: 2, wing: 'back',  status: 'available',   pricePerNight: 2800, maxGuests: 4, amenities: familyAmenities, description: 'ห้อง Family ด้านหลัง สำหรับครอบครัว' },
]

export const mockGuests: Guest[] = [
  {
    id: 'g001', name: 'สมชาย ใจดี', email: 'somchai@email.com', phone: '0812345678',
    nationality: 'ไทย', idNumber: '1234567890123',
    preferences: { pillow: 'high', floor: 'high', foodAllergies: ['กุ้ง'], specialRequests: ['หมอนเพิ่ม 1 ใบ'], smokingRoom: false, bedType: 'double' },
    totalStays: 12, totalSpend: 68400, joinedAt: '2022-03-15'
  },
  {
    id: 'g002', name: 'สุดา วงษ์สวัสดิ์', email: 'suda@email.com', phone: '0823456789',
    nationality: 'ไทย', idNumber: '2345678901234',
    preferences: { pillow: 'soft', floor: 'low', foodAllergies: [], specialRequests: [], smokingRoom: false, bedType: 'twin' },
    totalStays: 4, totalSpend: 18600, joinedAt: '2023-06-20'
  },
  {
    id: 'g003', name: 'John Smith', email: 'john@email.com', phone: '0834567890',
    nationality: 'อังกฤษ', idNumber: 'AB123456',
    preferences: { pillow: 'firm', floor: 'high', foodAllergies: ['นม', 'แป้งสาลี'], specialRequests: ['น้ำแร่ในห้อง', 'หนังสือพิมพ์ภาษาอังกฤษ'], smokingRoom: false, bedType: 'double' },
    totalStays: 28, totalSpend: 185000, joinedAt: '2021-01-10'
  },
  {
    id: 'g004', name: 'วิชัย มั่งมี', email: 'wichai@email.com', phone: '0845678901',
    nationality: 'ไทย', idNumber: '3456789012345',
    preferences: { pillow: 'high', floor: 'high', foodAllergies: [], specialRequests: ['ผลไม้ต้อนรับ', 'แชมเปญ'], smokingRoom: false, bedType: 'double' },
    totalStays: 35, totalSpend: 420000, joinedAt: '2020-08-05'
  },
  {
    id: 'g005', name: 'Yuki Tanaka', email: 'yuki@email.com', phone: '0856789012',
    nationality: 'ญี่ปุ่น', idNumber: 'JPN987654',
    preferences: { pillow: null, floor: null, foodAllergies: ['อาหารทะเล'], specialRequests: [], smokingRoom: false, bedType: 'double' },
    totalStays: 2, totalSpend: 7200, joinedAt: '2024-02-14'
  },
  {
    id: 'g006', name: 'มาลี ประดับ', email: 'malee@email.com', phone: '0867890123',
    nationality: 'ไทย', idNumber: '4567890123456',
    preferences: { pillow: 'soft', floor: 'low', foodAllergies: [], specialRequests: ['ห้องติดกัน 2 ห้อง'], smokingRoom: false, bedType: 'twin' },
    totalStays: 8, totalSpend: 32000, joinedAt: '2022-11-30'
  },
]

export const mockBookings: Booking[] = [
  // ปัจจุบัน — เช็คอินอยู่
  { id: 'b001', roomId: 'rA1',  guestId: 'g001', checkIn: '2026-05-08', checkOut: '2026-05-12', nights: 4, status: 'checked_in', source: 'direct',      totalAmount: 4800,  paidAmount: 4800,  adults: 2, children: 0, specialRequests: 'หมอนเพิ่ม',        createdAt: '2026-05-01', paymentMethod: 'credit_card' },
  { id: 'b002', roomId: 'rA11', guestId: 'g002', checkIn: '2026-05-09', checkOut: '2026-05-11', nights: 2, status: 'checked_in', source: 'agoda',       totalAmount: 3600,  paidAmount: 3600,  adults: 2, children: 0, specialRequests: '',                 createdAt: '2026-05-03', paymentMethod: 'qr_code' },
  { id: 'b003', roomId: 'rA3',  guestId: 'g003', checkIn: '2026-05-07', checkOut: '2026-05-14', nights: 7, status: 'checked_in', source: 'booking_com', totalAmount: 8400,  paidAmount: 8400,  adults: 1, children: 0, specialRequests: 'น้ำแร่ในห้อง',     createdAt: '2026-04-20', paymentMethod: 'credit_card' },
  { id: 'b004', roomId: 'rA19', guestId: 'g004', checkIn: '2026-05-10', checkOut: '2026-05-13', nights: 3, status: 'confirmed',  source: 'direct',      totalAmount: 13500, paidAmount: 5000,  adults: 2, children: 0, specialRequests: 'ผลไม้ต้อนรับ แชมเปญ', createdAt: '2026-05-05', paymentMethod: 'bank_transfer' },
  // อนาคต — confirmed
  { id: 'b005', roomId: 'rA2',  guestId: 'g005', checkIn: '2026-05-12', checkOut: '2026-05-15', nights: 3, status: 'confirmed',  source: 'expedia',     totalAmount: 3600,  paidAmount: 3600,  adults: 2, children: 0, specialRequests: '',                 createdAt: '2026-05-06', paymentMethod: 'credit_card' },
  { id: 'b006', roomId: 'rB19', guestId: 'g006', checkIn: '2026-05-15', checkOut: '2026-05-18', nights: 3, status: 'confirmed',  source: 'direct',      totalAmount: 8400,  paidAmount: 2800,  adults: 2, children: 2, specialRequests: 'เตียงเสริมสำหรับเด็ก', createdAt: '2026-05-07', paymentMethod: 'credit_card' },
  // อดีต
  { id: 'b007', roomId: 'rA7',  guestId: 'g001', checkIn: '2026-04-20', checkOut: '2026-04-23', nights: 3, status: 'checked_out', source: 'direct',      totalAmount: 5700,  paidAmount: 5700,  adults: 2, children: 0, specialRequests: '',                 createdAt: '2026-04-10', paymentMethod: 'credit_card' },
  { id: 'b008', roomId: 'rB5',  guestId: 'g003', checkIn: '2026-04-25', checkOut: '2026-05-01', nights: 6, status: 'checked_out', source: 'booking_com', totalAmount: 7200,  paidAmount: 7200,  adults: 1, children: 0, specialRequests: '',                 createdAt: '2026-04-15', paymentMethod: 'credit_card' },
  { id: 'b009', roomId: 'rA9',  guestId: 'g002', checkIn: '2026-05-01', checkOut: '2026-05-04', nights: 3, status: 'cancelled',   source: 'agoda',       totalAmount: 5400,  paidAmount: 0,     adults: 2, children: 0, specialRequests: '',                 createdAt: '2026-04-28', paymentMethod: 'qr_code' },
]

export const mockInvoices: Invoice[] = [
  {
    id: 'inv001', bookingId: 'b001', guestId: 'g001', amount: 4363.64, tax: 436.36, total: 4800,
    status: 'paid', issuedAt: '2026-05-08', paidAt: '2026-05-08', paymentMethod: 'credit_card',
    items: [
      { description: 'ค่าห้องพัก Standard 4 คืน (A1)', quantity: 4, unitPrice: 1090.91, total: 4363.64 },
    ]
  },
  {
    id: 'inv002', bookingId: 'b002', guestId: 'g002', amount: 3272.73, tax: 327.27, total: 3600,
    status: 'paid', issuedAt: '2026-05-09', paidAt: '2026-05-09', paymentMethod: 'qr_code',
    items: [
      { description: 'ค่าห้องพัก Deluxe 2 คืน (A11)', quantity: 2, unitPrice: 1636.36, total: 3272.73 },
    ]
  },
  {
    id: 'inv003', bookingId: 'b004', guestId: 'g004', amount: 12272.73, tax: 1227.27, total: 13500,
    status: 'draft', issuedAt: '2026-05-10', paymentMethod: 'bank_transfer',
    items: [
      { description: 'ค่าห้องพัก Suite 3 คืน (A19)', quantity: 3, unitPrice: 4090.91, total: 12272.73 },
    ]
  },
  {
    id: 'inv004', bookingId: 'b007', guestId: 'g001', amount: 5181.82, tax: 518.18, total: 5700,
    status: 'paid', issuedAt: '2026-04-20', paidAt: '2026-04-23', paymentMethod: 'credit_card',
    items: [
      { description: 'ค่าห้องพัก Deluxe 3 คืน (A7)', quantity: 3, unitPrice: 1727.27, total: 5181.82 },
    ]
  },
]

export const mockHousekeepingTasks: HousekeepingTask[] = [
  { id: 'hk001', roomId: 'rA4',  roomNumber: 'A4',  assignedTo: 'นิดา สะอาด', staffId: 's004', status: 'in_progress', priority: 'high',   notes: 'ผู้เข้าพักออกแล้ว รีบทำความสะอาด',  scheduledAt: '2026-05-10T09:00:00', startedAt: '2026-05-10T09:30:00' },
  { id: 'hk002', roomId: 'rB11', roomNumber: 'B11', assignedTo: 'มะลิ สวย',   staffId: 's005', status: 'pending',     priority: 'normal', notes: 'ทำความสะอาดประจำวัน',                  scheduledAt: '2026-05-10T10:00:00' },
  { id: 'hk003', roomId: 'rB13', roomNumber: 'B13', assignedTo: 'นิดา สะอาด', staffId: 's004', status: 'pending',     priority: 'normal', notes: '',                                       scheduledAt: '2026-05-10T11:00:00' },
  { id: 'hk004', roomId: 'rA20', roomNumber: 'A20', assignedTo: 'มะลิ สวย',   staffId: 's005', status: 'completed',   priority: 'normal', notes: 'เตรียมห้องสำหรับผู้เข้าพักรายใหม่',  scheduledAt: '2026-05-10T08:00:00', startedAt: '2026-05-10T08:05:00', completedAt: '2026-05-10T08:55:00' },
  { id: 'hk005', roomId: 'rB7',  roomNumber: 'B7',  assignedTo: 'มะลิ สวย',   staffId: 's005', status: 'completed',   priority: 'urgent', notes: 'VIP เช็คอินบ่ายนี้',                   scheduledAt: '2026-05-10T07:00:00', startedAt: '2026-05-10T07:10:00', completedAt: '2026-05-10T07:50:00' },
]

export const mockMaintenanceLogs: MaintenanceLog[] = [
  { id: 'm001', roomId: 'rA5',  roomNumber: 'A5',  issue: 'เครื่องปรับอากาศขัดข้อง', description: 'AC ไม่เย็น คอมเพรสเซอร์มีเสียงดัง',  status: 'in_progress', priority: 'high',   reportedBy: 'พนักงานต้อนรับ', reportedAt: '2026-05-09T14:00:00', assignedTo: 'ช่างสมศักดิ์' },
  { id: 'm002', roomId: 'rA15', roomNumber: 'A15', issue: 'ท่อน้ำรั่ว',                description: 'ท่อน้ำในห้องน้ำรั่ว น้ำซึมออกมาที่พื้น', status: 'open',        priority: 'urgent', reportedBy: 'แม่บ้าน',         reportedAt: '2026-05-10T08:30:00' },
  { id: 'm003', roomId: 'rB3',  roomNumber: 'B3',  issue: 'โทรทัศน์ไม่มีสัญญาณ',         description: 'รีโมทไม่ทำงาน สัญญาณขาดหาย',           status: 'resolved',    priority: 'normal', reportedBy: 'แขกผู้เข้าพัก',  reportedAt: '2026-05-08T20:00:00', assignedTo: 'ช่างไฟสมปอง', resolvedAt: '2026-05-08T21:00:00', cost: 200 },
  { id: 'm004', roomId: 'rA1',  roomNumber: 'A1',  issue: 'หลอดไฟในห้องน้ำขาด',          description: 'หลอดไฟเสีย 1 ดวง',                       status: 'resolved',    priority: 'low',    reportedBy: 'แม่บ้าน',         reportedAt: '2026-05-07T09:00:00', assignedTo: 'ช่างไฟสมปอง', resolvedAt: '2026-05-07T09:30:00', cost: 150 },
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
    permissions: { canViewDashboard: true, canManageBookings: true, canManageGuests: true, canViewFinance: false, canManageFinance: false, canManageRooms: false, canManageStaff: false, canViewReports: false, canManageHousekeeping: false, canManageMaintenance: false, canManageInventory: false, canManageCorporate: true }
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
// หมายเหตุ: ใน production ควรใช้ hashed password (bcrypt) — นี่เป็น demo
export const mockUsers: User[] = [
  { id: 'u001', username: 'admin',        password: 'admin123',  staffId: 's001' },
  { id: 'u002', username: 'reception',    password: 'reception', staffId: 's002' },
  { id: 'u003', username: 'accountant',   password: 'account',   staffId: 's003' },
  { id: 'u004', username: 'nida',         password: 'nida123',   staffId: 's004' },
  { id: 'u005', username: 'mali',         password: 'mali123',   staffId: 's005' },
  { id: 'u006', username: 'somsak',       password: 'somsak123', staffId: 's006' },
]

export const mockOTAChannels: OTAChannel[] = [
  { id: 'ota001', name: 'Agoda',       logo: '🟠', isConnected: true,  lastSync: '2026-05-10T06:00:00', inventoryMapped: 35, totalRooms: 40, pendingBookings: 2, commission: 15 },
  { id: 'ota002', name: 'Booking.com', logo: '🔵', isConnected: true,  lastSync: '2026-05-10T05:45:00', inventoryMapped: 30, totalRooms: 40, pendingBookings: 1, commission: 17 },
  { id: 'ota003', name: 'Expedia',     logo: '🟡', isConnected: true,  lastSync: '2026-05-10T06:15:00', inventoryMapped: 25, totalRooms: 40, pendingBookings: 0, commission: 18 },
  { id: 'ota004', name: 'Airbnb',      logo: '🔴', isConnected: false, lastSync: '2026-04-01T00:00:00', inventoryMapped: 0,  totalRooms: 40, pendingBookings: 0, commission: 3 },
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
  { id: 'ctx002', corporateAccountId: 'corp001', type: 'charge',  amount: 48500,  balanceBefore: 100000, balanceAfter: 51500,  performedBy: 's002', date: '2026-04-20T15:30:00', bookingId: 'b007', notes: 'พนักงาน: นายวีระ สมใจ เข้าพัก 3 คืน' },
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
  { id: 'dp001', roomType: 'standard',  name: 'ราคาปกติ',     startDate: '2026-01-01', endDate: '2026-12-31', price: 1200,  description: 'ราคามาตรฐาน Wing A' },
  { id: 'dp002', roomType: 'standard',  name: 'High Season',  startDate: '2026-12-20', endDate: '2027-01-05', price: 1800,  description: 'ช่วงเทศกาลปีใหม่' },
  { id: 'dp003', roomType: 'deluxe',    name: 'ราคาปกติ',     startDate: '2026-01-01', endDate: '2026-12-31', price: 1800,  description: 'ราคามาตรฐาน' },
  { id: 'dp004', roomType: 'suite',     name: 'ราคาปกติ',     startDate: '2026-01-01', endDate: '2026-12-31', price: 4500,  description: 'ราคามาตรฐาน' },
  { id: 'dp005', roomType: 'family',    name: 'ราคาปกติ',     startDate: '2026-01-01', endDate: '2026-12-31', price: 2800,  description: 'ราคามาตรฐาน' },
  { id: 'dp006', roomType: 'penthouse', name: 'ราคาปกติ',     startDate: '2026-01-01', endDate: '2026-12-31', price: 8000,  description: 'ราคามาตรฐาน' },
]
