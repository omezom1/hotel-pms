'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth-store'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate, getBookingSourceLabel, getRoomTypeLabel, calcBookingTotal, todayLocal } from '@/lib/utils'
import type { PaymentMethod } from '@/types'
import { BedDouble, UserPlus, CheckCircle2, Clock, AlertTriangle, LogIn, X } from 'lucide-react'
import { toast } from 'sonner'

export default function FrontDeskPage() {
  const { rooms, guests, bookings, updateBookingStatus, createBooking, addGuest, logAudit } = useHotelStore()
  const { user } = useAuthStore()

  const [walkInRoomId, setWalkInRoomId] = useState<string | null>(null)
  const [form, setForm] = useState({
    guestId: '', nights: 1, adults: 1, children: 0,
    paymentMethod: 'cash' as PaymentMethod,
  })
  const [newGuestMode, setNewGuestMode] = useState(false)
  const [newGuest, setNewGuest] = useState({ name: '', phone: '', nationality: 'ไทย' })

  const today = todayLocal()

  const checkInQueue = bookings
    .filter((b) => b.status === 'confirmed')
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))

  const stayingQueue = bookings
    .filter((b) => b.status === 'checked_in')
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut))

  const availableRooms = rooms.filter((r) => r.status === 'available')

  const checkInsRemaining = checkInQueue.filter((b) => b.checkIn.split('T')[0] <= today).length
  const checkInsDoneToday = bookings.filter(
    (b) => b.status === 'checked_in' && b.checkIn.startsWith(today)
  ).length
  const checkOutsRemaining = stayingQueue.filter((b) => b.checkOut.split('T')[0] <= today).length
  const checkOutsDoneToday = bookings.filter(
    (b) => b.status === 'checked_out' && b.checkOut.startsWith(today)
  ).length

  function handleCheckIn(bookingId: string) {
    const b = bookings.find((x) => x.id === bookingId)
    const g = guests.find((x) => x.id === b?.guestId)
    const r = rooms.find((x) => x.id === b?.roomId)
    updateBookingStatus(bookingId, 'checked_in')
    logAudit({ category: 'booking', action: 'check_in', summary: `เช็คอิน ${g?.name ?? '-'} ห้อง ${r?.number ?? '-'}`, entityId: bookingId })
    toast.success(`เช็คอินสำเร็จ${g ? ` — ${g.name}` : ''}`)
  }

  function handleCheckOut(bookingId: string) {
    const b = bookings.find((x) => x.id === bookingId)
    const g = guests.find((x) => x.id === b?.guestId)
    const r = rooms.find((x) => x.id === b?.roomId)
    updateBookingStatus(bookingId, 'checked_out')
    logAudit({ category: 'booking', action: 'check_out', summary: `เช็คเอาต์ ${g?.name ?? '-'} ห้อง ${r?.number ?? '-'}`, entityId: bookingId })
    toast.success(`เช็คเอาต์สำเร็จ${g ? ` — ${g.name}` : ''}`, {
      description: 'สร้างใบแจ้งหนี้ + งานทำความสะอาดอัตโนมัติแล้ว',
    })
  }

  function handleWalkIn() {
    if (!walkInRoomId || !user) return
    const room = rooms.find((r) => r.id === walkInRoomId)
    if (!room) return

    // ถ้าโหมดเพิ่มลูกค้าใหม่ → สร้าง guest ก่อน
    let guestId = form.guestId
    if (newGuestMode) {
      if (!newGuest.name) return
      guestId = addGuest({
        name: newGuest.name,
        email: '',
        phone: newGuest.phone,
        nationality: newGuest.nationality,
        idNumber: '',
        preferences: { pillow: null, floor: null, foodAllergies: [], specialRequests: [], smokingRoom: false, bedType: null },
        totalStays: 0,
        totalSpend: 0,
        joinedAt: new Date().toISOString(),
      })
      toast.success(`เพิ่มลูกค้า "${newGuest.name}" แล้ว`)
    }

    if (!guestId) return

    const checkIn = new Date().toISOString()
    const checkOut = new Date(Date.now() + form.nights * 86400000).toISOString()
    const total = calcBookingTotal(room.type, checkIn, checkOut, room.pricePerNight)
    createBooking({
      roomId: walkInRoomId,
      guestId,
      checkIn,
      checkOut,
      nights: form.nights,
      status: 'checked_in',
      source: 'walk_in',
      totalAmount: total,
      paidAmount: total,
      adults: form.adults,
      children: form.children,
      specialRequests: '',
      paymentMethod: form.paymentMethod,
    })
    setWalkInRoomId(null)
    setForm({ guestId: '', nights: 1, adults: 1, children: 0, paymentMethod: 'cash' })
    setNewGuestMode(false)
    setNewGuest({ name: '', phone: '', nationality: 'ไทย' })
    const guestName = guests.find((x) => x.id === guestId)?.name ?? newGuest.name ?? '-'
    logAudit({ category: 'booking', action: 'walk_in', summary: `Walk-in ${guestName} ห้อง ${room.number} ${form.nights} คืน` })
    toast.success(`Walk-in สำเร็จ ห้อง ${room.number}`)
  }

  const selectedRoom = rooms.find((r) => r.id === walkInRoomId)

  return (
    <div className="flex flex-col h-screen">
      <Header title="เคาน์เตอร์หน้าบ้าน" subtitle="จัดการเช็คอิน · เช็คเอาต์ · Walk-in" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* KPI */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'รอเช็คอิน', value: checkInsRemaining, sub: `เช็คอินไปแล้ว ${checkInsDoneToday}`, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
            { label: 'รอเช็คเอาต์', value: checkOutsRemaining, sub: `เช็คเอาต์ไปแล้ว ${checkOutsDoneToday}`, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
            { label: 'ห้องว่างตอนนี้', value: availableRooms.length, sub: 'พร้อมรับ walk-in', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
            { label: 'คิวรอเช็คอินทั้งหมด', value: checkInQueue.length, sub: 'รวมล่วงหน้า', color: 'text-slate-700', bg: 'bg-slate-50 border-slate-100' },
          ].map(({ label, value, sub, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl p-4 border`}>
              <div className={`text-3xl font-bold ${color}`}>{value}</div>
              <div className="text-sm text-slate-500 mt-1">{label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-5 gap-5">

          {/* Left: queues */}
          <div className="col-span-3 space-y-4">

            {/* Check-in queue */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <LogIn size={17} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800">คิวรอเช็คอิน</h2>
                <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  {checkInQueue.length} รายการ
                </span>
              </div>
              {checkInQueue.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">ไม่มีคิวรอเช็คอิน</div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {checkInQueue.map((booking) => {
                    const guest = guests.find((g) => g.id === booking.guestId)
                    const room = rooms.find((r) => r.id === booking.roomId)
                    const isDue = booking.checkIn.split('T')[0] <= today
                    return (
                      <div
                        key={booking.id}
                        className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors ${isDue ? 'border-l-4 border-amber-400' : 'border-l-4 border-transparent'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-slate-800">{guest?.name ?? '–'}</span>
                            {isDue && <AlertTriangle size={13} className="text-amber-500 shrink-0" />}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <BedDouble size={11} /> ห้อง {room?.number} ({getRoomTypeLabel(room?.type ?? '')})
                            </span>
                            <span>{formatDate(booking.checkIn)} → {formatDate(booking.checkOut)} · {booking.nights} คืน</span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                              {getBookingSourceLabel(booking.source)}
                            </span>
                            <span className="text-xs font-semibold text-slate-700">{formatCurrency(booking.totalAmount)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleCheckIn(booking.id)}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          <CheckCircle2 size={13} /> เช็คอิน
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Staying / check-out queue */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Clock size={17} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800">กำลังเข้าพักอยู่</h2>
                <span className="ml-auto text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                  {stayingQueue.length} ห้อง
                </span>
              </div>
              {stayingQueue.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">ไม่มีแขกเข้าพัก</div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {stayingQueue.map((booking) => {
                    const guest = guests.find((g) => g.id === booking.guestId)
                    const room = rooms.find((r) => r.id === booking.roomId)
                    const isDueToday = booking.checkOut.split('T')[0] <= today
                    return (
                      <div
                        key={booking.id}
                        className={`flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors ${isDueToday ? 'border-l-4 border-red-400' : 'border-l-4 border-transparent'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-semibold text-slate-800">{guest?.name ?? '–'}</span>
                            {isDueToday && (
                              <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                                เช็คเอาต์วันนี้
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <BedDouble size={11} /> ห้อง {room?.number}
                            </span>
                            <span>ออก {formatDate(booking.checkOut)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleCheckOut(booking.id)}
                          className="shrink-0 px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          เช็คเอาต์
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: available rooms */}
          <div className="col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden sticky top-0">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <BedDouble size={17} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800">ห้องว่าง</h2>
                <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                  {availableRooms.length} ห้อง
                </span>
              </div>
              {availableRooms.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">ไม่มีห้องว่าง</div>
              ) : (
                <div className="divide-y divide-slate-50 max-h-[calc(100vh-280px)] overflow-y-auto">
                  {availableRooms.map((room) => (
                    <div key={room.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800">ห้อง {room.number}</div>
                        <div className="text-xs text-slate-500">
                          {getRoomTypeLabel(room.type)} · ชั้น {room.floor} · {formatCurrency(room.pricePerNight)}/คืน
                        </div>
                      </div>
                      <button
                        onClick={() => setWalkInRoomId(room.id)}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 min-h-[40px] bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        <UserPlus size={14} /> Walk-in
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Walk-in modal */}
      {walkInRoomId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="font-semibold text-slate-800">Walk-in เข้าพัก</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  ห้อง {selectedRoom?.number} · {getRoomTypeLabel(selectedRoom?.type ?? '')} · {formatCurrency(selectedRoom?.pricePerNight ?? 0)}/คืน
                </p>
              </div>
              <button onClick={() => setWalkInRoomId(null)} className="p-2 rounded-lg hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-slate-700">ลูกค้า *</label>
                  <button type="button" onClick={() => setNewGuestMode(!newGuestMode)}
                    className="text-xs text-amber-600 hover:text-amber-700 font-medium">
                    {newGuestMode ? '← เลือกจากรายการ' : '+ เพิ่มลูกค้าใหม่'}
                  </button>
                </div>
                {newGuestMode ? (
                  <div className="space-y-2">
                    <input
                      value={newGuest.name}
                      onChange={(e) => setNewGuest({ ...newGuest, name: e.target.value })}
                      placeholder="ชื่อ-นามสกุล *"
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={newGuest.phone}
                        onChange={(e) => setNewGuest({ ...newGuest, phone: e.target.value })}
                        placeholder="โทรศัพท์"
                        className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <input
                        value={newGuest.nationality}
                        onChange={(e) => setNewGuest({ ...newGuest, nationality: e.target.value })}
                        placeholder="สัญชาติ"
                        className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                ) : (
                  <select
                    value={form.guestId}
                    onChange={(e) => setForm({ ...form, guestId: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">เลือกลูกค้า</option>
                    {guests.map((g) => (
                      <option key={g.id} value={g.id}>{g.name} — {g.phone}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">จำนวนคืน</label>
                  <input
                    type="number" min={1} max={30} value={form.nights}
                    onChange={(e) => setForm({ ...form, nights: Math.max(1, +e.target.value) })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">ผู้ใหญ่</label>
                  <input
                    type="number" min={1} max={10} value={form.adults}
                    onChange={(e) => setForm({ ...form, adults: Math.max(1, +e.target.value) })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">ช่องทางชำระเงิน</label>
                <select
                  value={form.paymentMethod}
                  onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none"
                >
                  <option value="cash">เงินสด</option>
                  <option value="credit_card">บัตรเครดิต</option>
                  <option value="debit_card">บัตรเดบิต</option>
                  <option value="qr_code">QR Code</option>
                  <option value="bank_transfer">โอนเงิน</option>
                </select>
              </div>
              <div className="bg-amber-50 rounded-lg px-4 py-3 border border-amber-200 flex justify-between items-center">
                <span className="text-sm text-amber-700">รวม {form.nights} คืน</span>
                <span className="font-bold text-amber-800 text-lg">
                  {formatCurrency(selectedRoom ? calcBookingTotal(selectedRoom.type, new Date().toISOString(), new Date(Date.now() + form.nights * 86400000).toISOString(), selectedRoom.pricePerNight) : 0)}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button
                onClick={() => setWalkInRoomId(null)}
                className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleWalkIn}
                disabled={newGuestMode ? !newGuest.name : !form.guestId}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
              >
                ยืนยันเช็คอิน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
