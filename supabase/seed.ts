/**
 * Supabase Seed Script — Pruksatara Park & Resort
 *
 * Inserts all mock data into Supabase in foreign-key-safe order.
 * Uses upsert so it can be re-run safely without duplicates.
 *
 * Run with:
 *   npm run seed
 */

import { createClient } from '@supabase/supabase-js'
import {
  mockRooms,
  mockGuests,
  mockStaff,
  mockUsers,
  mockBookings,
  mockInvoices,
  mockHousekeepingTasks,
  mockMaintenanceLogs,
  mockInventoryItems,
  mockInventoryTransactions,
  mockCorporateAccounts,
  mockCorporateTransactions,
  mockAddOnItems,
  mockBookingAddOns,
  mockOTAChannels,
} from '../lib/mock-data'

// ── Supabase client (reads env vars at runtime) ──────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.')
  console.error('Create .env.local or export the variables before running this script.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Helper: upsert a batch and report ────────────────────────
async function upsert(
  table: string,
  rows: Record<string, unknown>[],
  conflictColumn = 'id'
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .upsert(rows, { onConflict: conflictColumn })

  if (error) {
    console.error(`  FAILED — ${table}: ${error.message}`)
    throw error
  }
  console.log(`  OK — ${table}: ${rows.length} row(s) upserted`)
}

// ── Main seed function ────────────────────────────────────────
async function seed(): Promise<void> {
  console.log('\n=== Pruksatara Park & Resort — Supabase Seed ===\n')

  // 1. ROOMS — no foreign key dependencies
  await upsert('rooms', mockRooms.map(r => ({
    id:                  r.id,
    number:              r.number,
    type:                r.type,
    floor:               r.floor,
    wing:                r.wing,
    status:              r.status,
    price_per_night:     r.pricePerNight,
    max_guests:          r.maxGuests,
    amenities:           r.amenities,
    description:         r.description,
    current_guest_id:    r.currentGuestId ?? null,
    current_booking_id:  r.currentBookingId ?? null,
  })))

  // 2. GUESTS — no foreign key dependencies
  await upsert('guests', mockGuests.map(g => ({
    id:          g.id,
    name:        g.name,
    email:       g.email,
    phone:       g.phone,
    nationality: g.nationality,
    id_number:   g.idNumber,
    preferences: g.preferences,
    total_stays: g.totalStays,
    total_spend: g.totalSpend,
    joined_at:   g.joinedAt,
  })))

  // 3. STAFF — no foreign key dependencies
  await upsert('staff', mockStaff.map(s => ({
    id:          s.id,
    name:        s.name,
    role:        s.role,
    email:       s.email,
    phone:       s.phone,
    avatar:      s.avatar ?? null,
    permissions: s.permissions,
    hire_date:   s.hireDate,
    is_active:   s.isActive,
  })))

  // 4. USERS — depends on staff
  // WARNING: Passwords are plain-text (demo only).
  // Hash with bcrypt before seeding a production database.
  await upsert('users', mockUsers.map(u => ({
    id:         u.id,
    username:   u.username,
    password:   u.password,
    staff_id:   u.staffId,
    last_login: u.lastLogin ?? null,
  })))

  // 5. CORPORATE ACCOUNTS — must precede bookings
  await upsert('corporate_accounts', mockCorporateAccounts.map(c => ({
    id:                c.id,
    company_name:      c.companyName,
    contact_person:    c.contactPerson,
    contact_phone:     c.contactPhone,
    contact_email:     c.contactEmail,
    tax_id:            c.taxId ?? null,
    address:           c.address ?? null,
    total_deposited:   c.totalDeposited,
    total_used:        c.totalUsed,
    available_balance: c.availableBalance,
    status:            c.status,
    notes:             c.notes ?? null,
  })))

  // 6. BOOKINGS — depends on rooms + guests + corporate_accounts
  await upsert('bookings', mockBookings.map(b => ({
    id:                   b.id,
    room_id:              b.roomId,
    guest_id:             b.guestId,
    check_in:             b.checkIn,
    check_out:            b.checkOut,
    nights:               b.nights,
    status:               b.status,
    source:               b.source,
    total_amount:         b.totalAmount,
    paid_amount:          b.paidAmount,
    adults:               b.adults,
    children:             b.children,
    special_requests:     b.specialRequests,
    payment_method:       b.paymentMethod ?? null,
    corporate_account_id: b.corporateAccountId ?? null,
    is_corporate:         b.isCorporate ?? false,
    payments:             b.payments ?? [],
  })))

  // 7. INVOICES — depends on bookings + guests
  await upsert('invoices', mockInvoices.map(i => ({
    id:             i.id,
    booking_id:     i.bookingId,
    guest_id:       i.guestId,
    amount:         i.amount,
    tax:            i.tax,
    total:          i.total,
    status:         i.status,
    issued_at:      i.issuedAt,
    paid_at:        i.paidAt ?? null,
    payment_method: i.paymentMethod ?? null,
    items:          i.items,
  })))

  // 8. HOUSEKEEPING TASKS — depends on rooms
  await upsert('housekeeping_tasks', mockHousekeepingTasks.map(t => ({
    id:           t.id,
    room_id:      t.roomId,
    room_number:  t.roomNumber,
    assigned_to:  t.assignedTo,
    staff_id:     t.staffId,
    status:       t.status,
    priority:     t.priority,
    notes:        t.notes,
    scheduled_at: t.scheduledAt,
    started_at:   t.startedAt ?? null,
    completed_at: t.completedAt ?? null,
  })))

  // 9. MAINTENANCE LOGS — depends on rooms
  await upsert('maintenance_logs', mockMaintenanceLogs.map(m => ({
    id:          m.id,
    room_id:     m.roomId,
    room_number: m.roomNumber,
    issue:       m.issue,
    description: m.description,
    status:      m.status,
    priority:    m.priority,
    reported_by: m.reportedBy,
    reported_at: m.reportedAt,
    assigned_to: m.assignedTo ?? null,
    resolved_at: m.resolvedAt ?? null,
    cost:        m.cost ?? null,
  })))

  // 10. INVENTORY ITEMS — no foreign key dependencies
  await upsert('inventory_items', mockInventoryItems.map(i => ({
    id:             i.id,
    name:           i.name,
    category:       i.category,
    unit:           i.unit,
    current_stock:  i.currentStock,
    min_stock:      i.minStock,
    max_stock:      i.maxStock,
    cost_per_unit:  i.costPerUnit,
    supplier:       i.supplier ?? null,
    last_restocked: i.lastRestocked,
    notes:          i.notes ?? null,
  })))

  // 11. INVENTORY TRANSACTIONS — depends on inventory_items
  await upsert('inventory_transactions', mockInventoryTransactions.map(t => ({
    id:           t.id,
    item_id:      t.itemId,
    type:         t.type,
    quantity:     t.quantity,
    reference_id: t.referenceId ?? null,
    performed_by: t.performedBy,
    date:         t.date,
    notes:        t.notes ?? null,
  })))

  // 12. CORPORATE TRANSACTIONS — depends on corporate_accounts + bookings + invoices
  await upsert('corporate_transactions', mockCorporateTransactions.map(ct => ({
    id:                   ct.id,
    corporate_account_id: ct.corporateAccountId,
    type:                 ct.type,
    amount:               ct.amount,
    balance_before:       ct.balanceBefore,
    balance_after:        ct.balanceAfter,
    booking_id:           ct.bookingId ?? null,
    invoice_id:           ct.invoiceId ?? null,
    performed_by:         ct.performedBy,
    date:                 ct.date,
    notes:                ct.notes ?? null,
  })))

  // 13. ADD-ON ITEMS — depends on inventory_items (optional FK)
  await upsert('add_on_items', mockAddOnItems.map(a => ({
    id:                     a.id,
    name:                   a.name,
    category:               a.category,
    price:                  a.price,
    inventory_item_id:      a.inventoryItemId ?? null,
    inventory_qty_per_unit: a.inventoryQtyPerUnit,
    is_available:           a.isAvailable,
  })))

  // 14. BOOKING ADD-ONS — depends on bookings + add_on_items
  await upsert('booking_add_ons', mockBookingAddOns.map(ba => ({
    id:             ba.id,
    booking_id:     ba.bookingId,
    add_on_item_id: ba.addOnItemId,
    quantity:       ba.quantity,
    unit_price:     ba.unitPrice,
    total_price:    ba.totalPrice,
    status:         ba.status,
    requested_at:   ba.requestedAt,
    requested_by:   ba.requestedBy,
    fulfilled_at:   ba.fulfilledAt ?? null,
    fulfilled_by:   ba.fulfilledBy ?? null,
    notes:          ba.notes ?? null,
  })))

  // 15. OTA CHANNELS — no foreign key dependencies
  await upsert('ota_channels', mockOTAChannels.map(o => ({
    id:               o.id,
    name:             o.name,
    logo:             o.logo,
    is_connected:     o.isConnected,
    last_sync:        o.lastSync,
    inventory_mapped: o.inventoryMapped,
    total_rooms:      o.totalRooms,
    pending_bookings: o.pendingBookings,
    commission:       o.commission,
  })))

  console.log('\n=== Seed completed successfully ===\n')
}

seed().catch((err: unknown) => {
  console.error('\nSeed failed:', err)
  process.exit(1)
})
