/**
 * Supabase Data Access Layer — Pruksatara Park & Resort
 *
 * Async CRUD functions for the most critical PMS entities.
 * Column names follow the snake_case convention of the DB schema;
 * return values are mapped back to the camelCase TypeScript types
 * defined in types/index.ts.
 *
 * Usage: import individual functions from this module and call them
 * in Server Components, Route Handlers, or Zustand async actions.
 */

import { supabase } from '@/lib/supabase'
import type {
  Room,
  Guest,
  Booking,
  HousekeepingTask,
  InventoryItem,
  RoomStatus,
  RoomType,
  RoomWing,
  BookingStatus,
  BookingSource,
  PaymentMethod,
  HousekeepingStatus,
  InventoryCategory,
  InventoryUnit,
  GuestPreferences,
} from '@/types'

// ── Type helpers for raw DB rows ─────────────────────────────

interface RoomRow {
  id: string
  number: string
  type: string
  floor: number
  wing: string
  status: string
  price_per_night: number
  max_guests: number
  amenities: string[]
  description: string
  current_guest_id: string | null
  current_booking_id: string | null
}

interface GuestRow {
  id: string
  name: string
  email: string
  phone: string
  nationality: string
  id_number: string
  preferences: GuestPreferences
  total_stays: number
  total_spend: number
  joined_at: string
}

interface BookingRow {
  id: string
  room_id: string
  guest_id: string
  check_in: string
  check_out: string
  nights: number
  status: string
  source: string
  total_amount: number
  paid_amount: number
  adults: number
  children: number
  special_requests: string
  payment_method: string | null
  corporate_account_id: string | null
  is_corporate: boolean
  payments: Booking['payments']
  created_at: string
}

interface HousekeepingTaskRow {
  id: string
  room_id: string
  room_number: string
  assigned_to: string
  staff_id: string
  status: string
  priority: string
  notes: string
  scheduled_at: string
  started_at: string | null
  completed_at: string | null
}

interface InventoryItemRow {
  id: string
  name: string
  category: string
  unit: string
  current_stock: number
  min_stock: number
  max_stock: number
  cost_per_unit: number
  supplier: string | null
  last_restocked: string
  notes: string | null
}

// ── Row mappers ───────────────────────────────────────────────

function mapRoom(row: RoomRow): Room {
  return {
    id:               row.id,
    number:           row.number,
    type:             row.type as RoomType,
    floor:            row.floor,
    wing:             row.wing as RoomWing,
    status:           row.status as RoomStatus,
    pricePerNight:    row.price_per_night,
    maxGuests:        row.max_guests,
    amenities:        row.amenities,
    description:      row.description,
    currentGuestId:   row.current_guest_id ?? undefined,
    currentBookingId: row.current_booking_id ?? undefined,
  }
}

function mapGuest(row: GuestRow): Guest {
  return {
    id:          row.id,
    name:        row.name,
    email:       row.email,
    phone:       row.phone,
    nationality: row.nationality,
    idNumber:    row.id_number,
    preferences: row.preferences,
    totalStays:  row.total_stays,
    totalSpend:  row.total_spend,
    joinedAt:    row.joined_at,
  }
}

function mapBooking(row: BookingRow): Booking {
  return {
    id:                  row.id,
    roomId:              row.room_id,
    guestId:             row.guest_id,
    checkIn:             row.check_in,
    checkOut:            row.check_out,
    nights:              row.nights,
    status:              row.status as BookingStatus,
    source:              row.source as BookingSource,
    totalAmount:         row.total_amount,
    paidAmount:          row.paid_amount,
    adults:              row.adults,
    children:            row.children,
    specialRequests:     row.special_requests,
    createdAt:           row.created_at,
    paymentMethod:       (row.payment_method ?? undefined) as PaymentMethod | undefined,
    corporateAccountId:  row.corporate_account_id ?? undefined,
    isCorporate:         row.is_corporate,
    payments:            row.payments,
  }
}

function mapHousekeepingTask(row: HousekeepingTaskRow): HousekeepingTask {
  return {
    id:          row.id,
    roomId:      row.room_id,
    roomNumber:  row.room_number,
    assignedTo:  row.assigned_to,
    staffId:     row.staff_id,
    status:      row.status as HousekeepingStatus,
    priority:    row.priority as HousekeepingTask['priority'],
    notes:       row.notes,
    scheduledAt: row.scheduled_at,
    startedAt:   row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
  }
}

function mapInventoryItem(row: InventoryItemRow): InventoryItem {
  return {
    id:            row.id,
    name:          row.name,
    category:      row.category as InventoryCategory,
    unit:          row.unit as InventoryUnit,
    currentStock:  row.current_stock,
    minStock:      row.min_stock,
    maxStock:      row.max_stock,
    costPerUnit:   row.cost_per_unit,
    supplier:      row.supplier ?? undefined,
    lastRestocked: row.last_restocked,
    notes:         row.notes ?? undefined,
  }
}

// ── Rooms ─────────────────────────────────────────────────────

/** Fetch all rooms ordered by wing and room number. */
export async function getRooms(): Promise<Room[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .order('wing', { ascending: true })
    .order('number', { ascending: true })

  if (error) throw new Error(`getRooms: ${error.message}`)
  return (data as RoomRow[]).map(mapRoom)
}

/** Partially update a room (e.g. status, currentGuestId). */
export async function updateRoom(
  id: string,
  data: Partial<Pick<Room, 'status' | 'currentGuestId' | 'currentBookingId' | 'pricePerNight' | 'description' | 'amenities'>>
): Promise<Room> {
  const payload: Record<string, unknown> = {}
  if (data.status            !== undefined) payload.status              = data.status
  if (data.currentGuestId    !== undefined) payload.current_guest_id    = data.currentGuestId
  if (data.currentBookingId  !== undefined) payload.current_booking_id  = data.currentBookingId
  if (data.pricePerNight     !== undefined) payload.price_per_night      = data.pricePerNight
  if (data.description       !== undefined) payload.description          = data.description
  if (data.amenities         !== undefined) payload.amenities            = data.amenities

  const { data: updated, error } = await supabase
    .from('rooms')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`updateRoom: ${error.message}`)
  return mapRoom(updated as RoomRow)
}

// ── Bookings ──────────────────────────────────────────────────

/** Fetch all bookings, newest first. */
export async function getBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`getBookings: ${error.message}`)
  return (data as BookingRow[]).map(mapBooking)
}

/** Insert a new booking. Returns the created booking with its generated id. */
export async function createBooking(
  booking: Omit<Booking, 'id' | 'createdAt'>
): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      room_id:              booking.roomId,
      guest_id:             booking.guestId,
      check_in:             booking.checkIn,
      check_out:            booking.checkOut,
      nights:               booking.nights,
      status:               booking.status,
      source:               booking.source,
      total_amount:         booking.totalAmount,
      paid_amount:          booking.paidAmount,
      adults:               booking.adults,
      children:             booking.children,
      special_requests:     booking.specialRequests,
      payment_method:       booking.paymentMethod ?? null,
      corporate_account_id: booking.corporateAccountId ?? null,
      is_corporate:         booking.isCorporate ?? false,
      payments:             booking.payments ?? [],
    })
    .select()
    .single()

  if (error) throw new Error(`createBooking: ${error.message}`)
  return mapBooking(data as BookingRow)
}

/** Update mutable booking fields (status, amounts, requests, etc.). */
export async function updateBooking(
  id: string,
  updates: Partial<Pick<Booking, 'status' | 'paidAmount' | 'totalAmount' | 'nights' | 'checkOut' | 'specialRequests' | 'paymentMethod' | 'payments'>>
): Promise<Booking> {
  const payload: Record<string, unknown> = {}
  if (updates.status          !== undefined) payload.status           = updates.status
  if (updates.paidAmount      !== undefined) payload.paid_amount      = updates.paidAmount
  if (updates.totalAmount     !== undefined) payload.total_amount     = updates.totalAmount
  if (updates.nights          !== undefined) payload.nights           = updates.nights
  if (updates.checkOut        !== undefined) payload.check_out        = updates.checkOut
  if (updates.specialRequests !== undefined) payload.special_requests = updates.specialRequests
  if (updates.paymentMethod   !== undefined) payload.payment_method   = updates.paymentMethod
  if (updates.payments        !== undefined) payload.payments         = updates.payments

  const { data, error } = await supabase
    .from('bookings')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`updateBooking: ${error.message}`)
  return mapBooking(data as BookingRow)
}

// ── Guests ────────────────────────────────────────────────────

/** Fetch all guests ordered by name. */
export async function getGuests(): Promise<Guest[]> {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw new Error(`getGuests: ${error.message}`)
  return (data as GuestRow[]).map(mapGuest)
}

/** Insert a new guest. Returns the created guest. */
export async function createGuest(
  guest: Omit<Guest, 'id' | 'totalStays' | 'totalSpend' | 'joinedAt'>
): Promise<Guest> {
  const { data, error } = await supabase
    .from('guests')
    .insert({
      name:        guest.name,
      email:       guest.email,
      phone:       guest.phone,
      nationality: guest.nationality,
      id_number:   guest.idNumber,
      preferences: guest.preferences,
      total_stays: 0,
      total_spend: 0,
      joined_at:   new Date().toISOString().split('T')[0],
    })
    .select()
    .single()

  if (error) throw new Error(`createGuest: ${error.message}`)
  return mapGuest(data as GuestRow)
}

/** Update guest profile fields. */
export async function updateGuest(
  id: string,
  updates: Partial<Omit<Guest, 'id' | 'totalStays' | 'totalSpend' | 'joinedAt'>>
): Promise<Guest> {
  const payload: Record<string, unknown> = {}
  if (updates.name        !== undefined) payload.name        = updates.name
  if (updates.email       !== undefined) payload.email       = updates.email
  if (updates.phone       !== undefined) payload.phone       = updates.phone
  if (updates.nationality !== undefined) payload.nationality = updates.nationality
  if (updates.idNumber    !== undefined) payload.id_number   = updates.idNumber
  if (updates.preferences !== undefined) payload.preferences = updates.preferences

  const { data, error } = await supabase
    .from('guests')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`updateGuest: ${error.message}`)
  return mapGuest(data as GuestRow)
}

// ── Housekeeping Tasks ────────────────────────────────────────

/** Fetch all housekeeping tasks ordered by scheduled time. */
export async function getHousekeepingTasks(): Promise<HousekeepingTask[]> {
  const { data, error } = await supabase
    .from('housekeeping_tasks')
    .select('*')
    .order('scheduled_at', { ascending: true })

  if (error) throw new Error(`getHousekeepingTasks: ${error.message}`)
  return (data as HousekeepingTaskRow[]).map(mapHousekeepingTask)
}

/** Update a housekeeping task's status (and optional timestamps). */
export async function updateHousekeepingTask(
  id: string,
  updates: Partial<Pick<HousekeepingTask, 'status' | 'assignedTo' | 'staffId' | 'notes' | 'startedAt' | 'completedAt'>>
): Promise<HousekeepingTask> {
  const payload: Record<string, unknown> = {}
  if (updates.status      !== undefined) payload.status       = updates.status
  if (updates.assignedTo  !== undefined) payload.assigned_to  = updates.assignedTo
  if (updates.staffId     !== undefined) payload.staff_id     = updates.staffId
  if (updates.notes       !== undefined) payload.notes        = updates.notes
  if (updates.startedAt   !== undefined) payload.started_at   = updates.startedAt
  if (updates.completedAt !== undefined) payload.completed_at = updates.completedAt

  const { data, error } = await supabase
    .from('housekeeping_tasks')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`updateHousekeepingTask: ${error.message}`)
  return mapHousekeepingTask(data as HousekeepingTaskRow)
}

// ── Inventory ─────────────────────────────────────────────────

/** Fetch all inventory items ordered by category then name. */
export async function getInventory(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(`getInventory: ${error.message}`)
  return (data as InventoryItemRow[]).map(mapInventoryItem)
}

/** Update an inventory item's stock levels or metadata. */
export async function updateInventoryItem(
  id: string,
  updates: Partial<Pick<InventoryItem, 'currentStock' | 'minStock' | 'maxStock' | 'costPerUnit' | 'supplier' | 'notes' | 'lastRestocked'>>
): Promise<InventoryItem> {
  const payload: Record<string, unknown> = {}
  if (updates.currentStock  !== undefined) payload.current_stock  = updates.currentStock
  if (updates.minStock      !== undefined) payload.min_stock      = updates.minStock
  if (updates.maxStock      !== undefined) payload.max_stock      = updates.maxStock
  if (updates.costPerUnit   !== undefined) payload.cost_per_unit  = updates.costPerUnit
  if (updates.supplier      !== undefined) payload.supplier       = updates.supplier
  if (updates.notes         !== undefined) payload.notes          = updates.notes
  if (updates.lastRestocked !== undefined) payload.last_restocked = updates.lastRestocked

  const { data, error } = await supabase
    .from('inventory_items')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`updateInventoryItem: ${error.message}`)
  return mapInventoryItem(data as InventoryItemRow)
}
