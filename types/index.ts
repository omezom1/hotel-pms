export type RoomStatus = 'available' | 'occupied' | 'cleaning' | 'maintenance'
export type RoomType = 'single' | 'double' | 'triple'
export type RoomWing = 'front' | 'back'

// กฎราคาตามช่วงวัน/ฤดูกาล ต่อประเภทห้อง (rule ช่วงสั้นสุดชนะ = เฉพาะเจาะจงสุด)
export interface DynamicPricing {
  id: string
  roomType: RoomType
  name: string
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD (inclusive)
  price: number
  description?: string
}
export type BookingStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'pending'
export type BookingSource = 'direct' | 'walk_in'
export type StaffRole = 'admin' | 'receptionist' | 'accountant' | 'housekeeper' | 'maintenance'
export type HousekeepingStatus = 'pending' | 'in_progress' | 'completed'
export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved'
export type PaymentMethod = 'credit_card' | 'debit_card' | 'qr_code' | 'bank_transfer' | 'cash' | 'pay_later'
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'refunded'

export interface Room {
  id: string
  number: string
  type: RoomType
  floor: number
  wing: RoomWing
  status: RoomStatus
  pricePerNight: number
  maxGuests: number
  amenities: string[]
  description: string
  currentGuestId?: string
  currentBookingId?: string
}

// ฟิลด์ห้องที่ผู้ดูแลแก้ได้เองผ่าน UI — ตัด status/occupancy pointers ที่ระบบคุมผ่าน booking lifecycle
export type RoomInput = Omit<Room, 'id' | 'status' | 'currentGuestId' | 'currentBookingId'>

export interface Guest {
  id: string
  name: string
  email: string
  phone: string
  nationality: string
  idNumber: string
  preferences: GuestPreferences
  totalStays: number
  totalSpend: number
  joinedAt: string
}

export interface GuestPreferences {
  pillow: 'soft' | 'firm' | 'high' | null
  floor: 'low' | 'high' | null
  foodAllergies: string[]
  specialRequests: string[]
  smokingRoom: boolean
  bedType: 'single' | 'double' | 'twin' | null
}

// ข้อมูลแขกแบบชั่วคราว — ไม่บันทึกเข้า CRM (guests)
export interface GuestSnapshot {
  name: string
  phone?: string
  nationality?: string
  idNumber?: string
}

export interface Booking {
  id: string
  roomId: string
  roomTypeAtBooking?: RoomType  // snapshot ประเภทห้องตอนจอง — ใช้แยกรายได้ตามประเภทให้ถูกแม้ย้ายห้องข้ามประเภทภายหลัง
  guestId?: string          // optional: ถ้าเป็นลูกค้าประจำ
  guestSnapshot?: GuestSnapshot  // optional: ถ้าเป็นแขกชั่วคราว (ไม่บันทึก CRM)
  checkIn: string
  checkOut: string
  nights: number
  status: BookingStatus
  source: BookingSource
  totalAmount: number
  paidAmount: number
  adults: number
  children: number
  specialRequests: string
  createdAt: string
  paymentMethod?: PaymentMethod
  corporateAccountId?: string
  isCorporate?: boolean
  payments?: Payment[]
}

export interface Payment {
  id: string
  amount: number
  method: PaymentMethod
  date: string
  staffId: string
  notes?: string
}

export type AuditCategory = 'booking' | 'payment' | 'room' | 'guest' | 'housekeeping' | 'maintenance' | 'inventory' | 'corporate' | 'auth' | 'expense'

export interface AuditLog {
  id: string
  timestamp: string
  staffId: string
  staffName: string
  category: AuditCategory
  action: string
  summary: string
  entityId?: string
}

export interface Invoice {
  id: string
  bookingId: string
  guestId?: string   // optional: snapshot booking ไม่มี guestId
  amount: number
  tax: number
  total: number
  status: InvoiceStatus
  issuedAt: string
  paidAt?: string
  paymentMethod?: PaymentMethod
  items: InvoiceItem[]
}

export interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

// ===== รายจ่าย / ต้นทุนดำเนินงาน =====
export type ExpenseCategory =
  | 'salary'              // เงินเดือนพนักงาน
  | 'utilities_electric' // ค่าไฟฟ้า กฟภ./กฟน.
  | 'utilities_water'    // ค่าน้ำประปา
  | 'utilities_internet' // ค่าอินเตอร์เน็ต
  | 'maintenance'        // ค่าซ่อมบำรุง
  | 'cleaning'           // ค่าทำความสะอาด
  | 'tax'                // ภาษีโรงเรือน/ภาษีอื่น
  | 'marketing'          // ค่าการตลาด
  | 'supplies'           // ค่าวัสดุสิ้นเปลือง
  | 'other'              // ค่าใช้จ่ายอื่นๆ

export interface Expense {
  id: string
  date: string          // ISO — วันที่จ่าย
  category: ExpenseCategory
  description: string   // รายการ
  payee?: string        // ผู้รับเงิน
  amount: number
  note?: string
  receiptPath?: string   // path ของรูปบิล/ใบเสร็จใน Supabase Storage bucket 'receipts' (optional)
  createdAt: string
}

export interface HousekeepingTask {
  id: string
  roomId: string
  roomNumber: string
  assignedTo: string
  staffId: string
  status: HousekeepingStatus
  priority: 'low' | 'normal' | 'high' | 'urgent'
  notes: string
  scheduledAt: string
  startedAt?: string
  completedAt?: string
}

export interface MaintenanceLog {
  id: string
  roomId: string
  roomNumber: string
  issue: string
  description: string
  status: MaintenanceStatus
  priority: 'low' | 'normal' | 'high' | 'urgent'
  reportedBy: string
  reportedAt: string
  assignedTo?: string
  resolvedAt?: string
  cost?: number
}

export interface Staff {
  id: string
  name: string
  role: StaffRole
  email: string
  phone: string
  avatar?: string
  permissions: StaffPermissions
  hireDate: string
  isActive: boolean
}

export interface StaffPermissions {
  canViewDashboard: boolean
  canManageBookings: boolean
  canManageGuests: boolean
  canViewFinance: boolean
  canManageFinance: boolean
  canManageRooms: boolean
  canManageStaff: boolean
  canViewReports: boolean
  canManageHousekeeping: boolean
  canManageMaintenance: boolean
  canManageInventory: boolean
  canManageCorporate: boolean
}


export interface User {
  id: string
  username: string
  password: string
  staffId: string
  lastLogin?: string
}

export interface DashboardStats {
  occupancyRate: number
  todayRevenue: number
  revpar: number
  checkInsToday: number
  checkOutsToday: number
  availableRooms: number
  occupiedRooms: number
  cleaningRooms: number
  maintenanceRooms: number
}

// ========== Inventory ==========
export type InventoryCategory = 'room_amenities' | 'minibar' | 'cleaning_supplies'
export type InventoryUnit = 'piece' | 'bottle' | 'pack' | 'set' | 'liter' | 'kg'

export interface InventoryItem {
  id: string
  name: string
  category: InventoryCategory
  unit: InventoryUnit
  currentStock: number
  minStock: number
  maxStock: number
  costPerUnit: number
  supplier?: string
  lastRestocked: string
  notes?: string
}

export interface InventoryTransaction {
  id: string
  itemId: string
  type: 'restock' | 'use' | 'adjust' | 'waste'
  quantity: number
  referenceId?: string
  performedBy: string
  date: string
  notes?: string
}

// ========== Corporate Credit/Deposit ==========
export interface CorporateAccount {
  id: string
  companyName: string
  contactPerson: string
  contactPhone: string
  contactEmail: string
  taxId?: string
  address?: string
  totalDeposited: number
  totalUsed: number
  availableBalance: number
  status: 'active' | 'suspended' | 'closed'
  createdAt: string
  notes?: string
}

export interface CorporateTransaction {
  id: string
  corporateAccountId: string
  type: 'deposit' | 'charge' | 'refund' | 'adjustment'
  amount: number
  balanceBefore: number
  balanceAfter: number
  bookingId?: string
  invoiceId?: string
  performedBy: string
  date: string
  notes?: string
}

// ========== Add-on ==========
export type AddOnCategory = 'bedding' | 'amenity' | 'service'

export interface AddOnItem {
  id: string
  name: string
  category: AddOnCategory
  price: number
  inventoryItemId?: string
  inventoryQtyPerUnit: number
  isAvailable: boolean
}

export interface BookingAddOn {
  id: string
  bookingId: string
  addOnItemId: string
  quantity: number
  unitPrice: number
  totalPrice: number
  status: 'requested' | 'fulfilled' | 'cancelled'
  requestedAt: string
  requestedBy: string
  fulfilledAt?: string
  fulfilledBy?: string
  notes?: string
}
