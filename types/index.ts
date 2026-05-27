export type RoomStatus = 'available' | 'occupied' | 'cleaning' | 'maintenance'
export type RoomType = 'standard' | 'deluxe' | 'suite' | 'family' | 'penthouse'
export type RoomWing = 'front' | 'back'
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

export interface Booking {
  id: string
  roomId: string
  guestId: string
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

export type AuditCategory = 'booking' | 'payment' | 'room' | 'guest' | 'housekeeping' | 'maintenance' | 'inventory' | 'corporate' | 'auth'

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
  guestId: string
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
