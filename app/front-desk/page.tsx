'use client'
import { useState, useRef } from 'react'
import { useHotelStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth-store'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate, getBookingSourceLabel, getRoomTypeLabel, calcBookingTotal, todayLocal, getGuestDisplayName, calcOutstanding, maxNightsBeforeConflict, calendarDateToISO, roomHasConflict } from '@/lib/utils'
import type { PaymentMethod } from '@/types'
import { BedDouble, UserPlus, CheckCircle2, Clock, AlertTriangle, LogIn, X } from 'lucide-react'
import CheckoutConfirmDialog from '@/components/CheckoutConfirmDialog'
import EarlyCheckoutDialog from '@/components/EarlyCheckoutDialog'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { toast } from 'sonner'

export default function FrontDeskPage() {
  const { rooms, guests, bookings, bookingAddOns, dynamicPricing, updateBookingStatus, createBooking, recordPayment, adjustForEarlyCheckout, logAudit } = useHotelStore()
  const { user } = useAuthStore()
  // คืนเงิน (ปรับยอด early-checkout) ต้องมีสิทธิ์การเงิน
  const canRefund = user?.staff.permissions.canManageFinance ?? false

  const [walkInRoomId, setWalkInRoomId] = useState<string | null>(null)
  const walkInBusy = useRef(false) // กัน double-submit walk-in (สร้าง guest/booking ซ้ำ)
  const [form, setForm] = useState({
    guestId: '', nights: 1, adults: 1, children: 0,
    paymentMethod: 'cash' as PaymentMethod,
    payMode: 'full' as 'full' | 'deposit', deposit: 0,
  })
  const [newGuestMode, setNewGuestMode] = useState(false)
  const [newGuest, setNewGuest] = useState({ name: '', phone: '', nationality: 'ไทย', idNumber: '' })
  const [payDialog, setPayDialog] = useState<{ bookingId: string; outstanding: number } | null>(null)
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [checkoutTarget, setCheckoutTarget] = useState<{ bookingId: string; gName: string; roomNo: string; outstanding: number; corporateCharge?: { amount: number; company: string } | null } | null>(null)
  const [earlyTarget, setEarlyTarget] = useState<{ bookingId: string; gName: string; roomNo: string; remaining: number } | null>(null)
  const payTrapRef = useFocusTrap<HTMLDivElement>(!!payDialog, () => setPayDialog(null))

  function outstandingOf(bookingId: string) {
    const b = bookings.find((x) => x.id === bookingId)
    if (!b) return 0
    return calcOutstanding(b, bookingAddOns)
  }

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
    const gName = b ? getGuestDisplayName(b, guests) : '-'
    const r = rooms.find((x) => x.id === b?.roomId)
    updateBookingStatus(bookingId, 'checked_in')
    logAudit({ category: 'booking', action: 'check_in', summary: `เช็คอิน ${gName} ห้อง ${r?.number ?? '-'}`, entityId: bookingId })
    toast.success(`เช็คอินสำเร็จ — ${gName}`)
  }

  function handleCheckOut(bookingId: string) {
    const b = bookings.find((x) => x.id === bookingId)
    // ออกก่อนกำหนด (วันนี้ < วันเช็คเอาต์เดิม) → ถามปรับยอดก่อน
    if (b && b.status === 'checked_in' && today < b.checkOut.split('T')[0]) {
      const remaining = Math.max(1, Math.round((new Date(b.checkOut.split('T')[0]).getTime() - new Date(today).getTime()) / 86400000))
      setEarlyTarget({ bookingId, gName: getGuestDisplayName(b, guests), roomNo: rooms.find((x) => x.id === b.roomId)?.number ?? '-', remaining })
      return
    }
    proceedCheckOut(bookingId)
  }

  function proceedCheckOut(bookingId: string) {
    // อ่าน state สดเสมอ (เผื่อเพิ่งปรับยอดออกก่อนกำหนด) เพื่อคำนวณยอดค้างให้ตรง
    const st = useHotelStore.getState()
    const b = st.bookings.find((x) => x.id === bookingId)
    const outstanding = b ? calcOutstanding(b, st.bookingAddOns) : 0
    if (outstanding > 0) {
      const gName = b ? getGuestDisplayName(b, guests) : '-'
      const roomNo = rooms.find((x) => x.id === b?.roomId)?.number ?? '-'
      // booking องค์กรที่เครดิตพอ → เช็คเอาต์จะตัดเครดิตอัตโนมัติ ไม่ใช่ค้างชำระจริง → แจ้งให้ชัด
      let corporateCharge: { amount: number; company: string } | null = null
      if (b?.corporateAccountId) {
        const acc = st.corporateAccounts.find((a) => a.id === b.corporateAccountId)
        if (acc && acc.availableBalance >= outstanding) corporateCharge = { amount: outstanding, company: acc.companyName }
      }
      setCheckoutTarget({ bookingId, gName, roomNo, outstanding, corporateCharge })
      return
    }
    doCheckOut(bookingId)
  }

  function handleEarlyAdjust() {
    if (!earlyTarget) return
    if (!canRefund) { toast.error('ต้องมีสิทธิ์จัดการการเงินเพื่อปรับยอด/คืนเงิน'); return }
    const res = adjustForEarlyCheckout(earlyTarget.bookingId)
    if (res.ok) {
      logAudit({ category: 'booking', action: 'early_checkout', summary: `ออกก่อนกำหนด — ปรับเป็น ${res.newNights} คืน`, entityId: earlyTarget.bookingId })
      toast.success(`ปรับเป็น ${res.newNights} คืน${res.refunded ? ` · คืนเงิน ${formatCurrency(res.refunded)}` : ''}`)
    } else {
      toast.error(res.error ?? 'ปรับยอดไม่สำเร็จ')
    }
    const id = earlyTarget.bookingId
    setEarlyTarget(null)
    proceedCheckOut(id)
  }

  function doCheckOut(bookingId: string) {
    const b = bookings.find((x) => x.id === bookingId)
    const r = rooms.find((x) => x.id === b?.roomId)
    const gName = b ? getGuestDisplayName(b, guests) : '-'
    updateBookingStatus(bookingId, 'checked_out')
    logAudit({ category: 'booking', action: 'check_out', summary: `เช็คเอาต์ ${gName} ห้อง ${r?.number ?? '-'}`, entityId: bookingId })
    toast.success(`เช็คเอาต์สำเร็จ — ${gName}`, {
      description: 'สร้างใบแจ้งหนี้ + งานทำความสะอาดอัตโนมัติแล้ว',
    })
  }

  function handleQuickPay() {
    if (!payDialog || !user) return
    if (payAmount <= 0) return
    if (payAmount > payDialog.outstanding) {
      toast.error(`จำนวนเกินยอดค้างชำระ (${formatCurrency(payDialog.outstanding)})`)
      return
    }
    const result = recordPayment(payDialog.bookingId, payAmount, payMethod, user.staff.id)
    if (!result.ok) {
      toast.error(result.error ?? 'รับชำระไม่สำเร็จ')
      return
    }
    logAudit({ category: 'payment', action: 'record', summary: `รับชำระ ${payAmount.toLocaleString()} บาท (${payMethod})`, entityId: payDialog.bookingId })
    toast.success(`บันทึกการชำระ ${formatCurrency(payAmount)}`)
    setPayDialog(null)
    setPayAmount(0)
    setPayMethod('cash')
  }

  function handleWalkIn() {
    if (walkInBusy.current) return // กดซ้ำระหว่างทำรายการ → ข้าม (กัน guest/booking ซ้ำ)
    if (!walkInRoomId || !user) return
    const room = rooms.find((r) => r.id === walkInRoomId)
    if (!room) return
    if (form.adults + form.children > room.maxGuests) {
      toast.error('จำนวนผู้เข้าพักเกินความจุห้อง')
      return
    }
    if (newGuestMode && !newGuest.name) return
    if (!newGuestMode && !form.guestId) return

    walkInBusy.current = true
    try {
    // ตรึงเป็น "วันปฏิทิน" (UTC-midnight) เหมือน create-booking — กัน timezone off-by-one
    // (เวลาเช็คอินจริงยังอยู่ใน audit log + payment record)
    const checkInDate = new Date()
    const checkIn = calendarDateToISO(checkInDate)
    const checkOutDate = new Date(checkInDate)
    checkOutDate.setDate(checkOutDate.getDate() + form.nights)
    const checkOut = calendarDateToISO(checkOutDate)

    // เช็ค conflict ก่อนสร้าง guest — กันสร้าง guest ขยะ + toast หลอกเมื่อห้องชนการจองอื่น
    // (createBooking ยังตรวจซ้ำแบบ atomic อีกชั้นเป็น safety net)
    if (roomHasConflict(bookings, walkInRoomId, checkIn, checkOut)) {
      toast.error('ห้องนี้มีการจองอื่นทับช่วงวันที่เลือกแล้ว')
      return
    }

    // ลูกค้าใหม่ (walk-in) = แขกชั่วคราว → เก็บเป็น guestSnapshot บน booking ไม่บันทึกลง CRM
    // (dropdown "เลือกลูกค้าเดิม" จึงมีแค่ลูกค้าประจำ — ลูกค้าประจำเพิ่มผ่านหน้าลูกค้าเอง)
    const guestId = newGuestMode ? undefined : form.guestId
    const guestSnapshot = newGuestMode
      ? { name: newGuest.name, phone: newGuest.phone, nationality: newGuest.nationality, idNumber: newGuest.idNumber || undefined }
      : undefined
    if (!newGuestMode && !guestId) return

    const total = calcBookingTotal(room.type, checkIn, checkOut, room.pricePerNight, dynamicPricing)
    // ชำระเต็ม หรือ มัดจำ (ระบุยอด, clamp ไม่ให้เกินยอดรวม/ติดลบ) — ที่เหลือเป็นยอดค้างชำระ
    const paid = form.payMode === 'deposit' ? Math.min(Math.max(0, form.deposit), total) : total
    const result = createBooking({
      roomId: walkInRoomId,
      guestId,
      guestSnapshot,
      checkIn,
      checkOut,
      nights: form.nights,
      status: 'checked_in',
      source: 'walk_in',
      totalAmount: total,
      paidAmount: paid,
      adults: form.adults,
      children: form.children,
      specialRequests: '',
      paymentMethod: form.paymentMethod,
    })
    if (!result.ok) {
      toast.error(result.error ?? 'Walk-in ไม่สำเร็จ')
      return
    }
    setWalkInRoomId(null)
    setForm({ guestId: '', nights: 1, adults: 1, children: 0, paymentMethod: 'cash', payMode: 'full', deposit: 0 })
    setNewGuestMode(false)
    setNewGuest({ name: '', phone: '', nationality: 'ไทย', idNumber: '' })
    const guestName = guests.find((x) => x.id === guestId)?.name ?? newGuest.name ?? '-'
    logAudit({ category: 'booking', action: 'walk_in', summary: `Walk-in ${guestName} ห้อง ${room.number} ${form.nights} คืน` })
    toast.success(`Walk-in สำเร็จ ห้อง ${room.number}`)
    } finally {
      walkInBusy.current = false
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <Header title="เคาน์เตอร์หน้าบ้าน" subtitle="จัดการเช็คอิน · เช็คเอาต์ · Walk-in" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'รอเช็คอิน', value: checkInsRemaining, sub: `เช็คอินไปแล้ว ${checkInsDoneToday}`, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100 dark:bg-blue-950/40 dark:border-blue-900' },
            { label: 'รอเช็คเอาต์', value: checkOutsRemaining, sub: `เช็คเอาต์ไปแล้ว ${checkOutsDoneToday}`, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100 dark:bg-amber-950/40 dark:border-amber-900' },
            { label: 'ห้องว่างตอนนี้', value: availableRooms.length, sub: 'พร้อมรับ walk-in', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-900' },
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
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Left: queues */}
          <div className="lg:col-span-3 space-y-4">

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
                    const guestName = getGuestDisplayName(booking, guests)
                    const room = rooms.find((r) => r.id === booking.roomId)
                    const isDue = booking.checkIn.split('T')[0] <= today
                    return (
                      <div
                        key={booking.id}
                        className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors ${isDue ? 'border-l-4 border-amber-400' : 'border-l-4 border-transparent'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-slate-800">{guestName}</span>
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
                    const guestName = getGuestDisplayName(booking, guests)
                    const room = rooms.find((r) => r.id === booking.roomId)
                    const isDueToday = booking.checkOut.split('T')[0] <= today
                    const outstanding = outstandingOf(booking.id)
                    return (
                      <div
                        key={booking.id}
                        className={`flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors ${isDueToday ? 'border-l-4 border-red-400' : 'border-l-4 border-transparent'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="font-semibold text-slate-800">{guestName}</span>
                            {isDueToday && (
                              <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                                เช็คเอาต์วันนี้
                              </span>
                            )}
                            {outstanding > 0 && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                                ค้าง {formatCurrency(outstanding)}
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
                        {outstanding > 0 && (
                          <button
                            onClick={() => { setPayDialog({ bookingId: booking.id, outstanding }); setPayAmount(outstanding); setPayMethod('cash') }}
                            className="shrink-0 px-3 py-2 min-h-[40px] bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors"
                          >
                            รับชำระ
                          </button>
                        )}
                        <button
                          onClick={() => handleCheckOut(booking.id)}
                          className="shrink-0 px-3 py-2 min-h-[40px] bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors"
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
          <div className="lg:col-span-2">
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
                  {availableRooms.map((room) => {
                    const expanded = walkInRoomId === room.id
                    return (
                      <div key={room.id} className={expanded ? 'bg-amber-50/40' : ''}>
                        <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-800">ห้อง {room.number}</div>
                            <div className="text-xs text-slate-500">
                              {getRoomTypeLabel(room.type)} · ชั้น {room.floor} · {formatCurrency(room.pricePerNight)}/คืน
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if (expanded) {
                                setWalkInRoomId(null)
                              } else {
                                setWalkInRoomId(room.id)
                                setForm({ guestId: '', nights: 1, adults: 1, children: 0, paymentMethod: 'cash', payMode: 'full', deposit: 0 })
                                setNewGuestMode(true)
                                setNewGuest({ name: '', phone: '', nationality: 'ไทย', idNumber: '' })
                              }
                            }}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-2 min-h-[40px] bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium transition-colors"
                          >
                            {expanded ? <><X size={14} /> ปิด</> : <><UserPlus size={14} /> Walk-in</>}
                          </button>
                        </div>
                        {expanded && (
                          <div className="px-5 pb-4 space-y-3 border-t border-amber-100">
                            <div className="flex items-center justify-between pt-3">
                              <div className="text-xs text-slate-500">
                                {newGuestMode ? 'ลูกค้าใหม่' : 'ลูกค้าเดิม'}
                              </div>
                              <button type="button" onClick={() => setNewGuestMode(!newGuestMode)}
                                className="text-xs text-amber-600 hover:text-amber-700 font-medium">
                                {newGuestMode ? 'เลือกจากรายการเดิม →' : '← เพิ่มลูกค้าใหม่'}
                              </button>
                            </div>
                            {newGuestMode ? (
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  value={newGuest.name}
                                  onChange={(e) => setNewGuest({ ...newGuest, name: e.target.value })}
                                  placeholder="ชื่อ-นามสกุล *" aria-label="ชื่อ-นามสกุลลูกค้าใหม่"
                                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                  autoFocus
                                />
                                <input
                                  value={newGuest.phone}
                                  onChange={(e) => setNewGuest({ ...newGuest, phone: e.target.value })}
                                  placeholder="เบอร์โทร" aria-label="เบอร์โทรลูกค้าใหม่"
                                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                                <input
                                  value={newGuest.idNumber}
                                  onChange={(e) => setNewGuest({ ...newGuest, idNumber: e.target.value })}
                                  placeholder="เลขบัตรประชาชน / พาสปอร์ต" aria-label="เลขบัตรประชาชนหรือพาสปอร์ตลูกค้าใหม่"
                                  className="col-span-2 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                            ) : (
                              <select
                                value={form.guestId}
                                onChange={(e) => setForm({ ...form, guestId: e.target.value })}
                                aria-label="เลือกลูกค้าเดิม"
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                              >
                                <option value="">เลือกลูกค้า</option>
                                {guests.map((g) => (
                                  <option key={g.id} value={g.id}>{g.name} — {g.phone}</option>
                                ))}
                              </select>
                            )}
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label htmlFor="fd-walkin-nights" className="block text-[11px] text-slate-500 mb-0.5">คืน</label>
                                <input id="fd-walkin-nights" type="number" min={1} max={30} value={form.nights}
                                  onChange={(e) => setForm({ ...form, nights: Math.max(1, +e.target.value) })}
                                  className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
                                />
                              </div>
                              <div>
                                <label htmlFor="fd-walkin-adults" className="block text-[11px] text-slate-500 mb-0.5">ผู้ใหญ่</label>
                                <input id="fd-walkin-adults" type="number" min={1} max={10} value={form.adults}
                                  onChange={(e) => setForm({ ...form, adults: Math.max(1, +e.target.value) })}
                                  className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
                                />
                              </div>
                              <div>
                                <label htmlFor="fd-walkin-children" className="block text-[11px] text-slate-500 mb-0.5">เด็ก</label>
                                <input id="fd-walkin-children" type="number" min={0} max={10} value={form.children}
                                  onChange={(e) => setForm({ ...form, children: Math.max(0, +e.target.value) })}
                                  className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
                                />
                              </div>
                            </div>
                            <div className={`text-[11px] ${form.adults + form.children > room.maxGuests ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                              เข้าพัก {form.adults + form.children} คน · ความจุห้อง {room.maxGuests} คน
                              {form.adults + form.children > room.maxGuests && ' — เกินความจุ'}
                            </div>
                            {(() => {
                              const { maxNights, conflictDate } = maxNightsBeforeConflict(bookings, room.id, calendarDateToISO(new Date()))
                              if (maxNights === null || form.nights <= maxNights) return null
                              return (
                                <div className="flex items-start gap-1.5 text-[11px] text-red-600 font-medium bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                                  <AlertTriangle size={13} className="mt-px shrink-0" />
                                  <span>
                                    {maxNights === 0
                                      ? `ห้องนี้มีการจองคร่อมวันนี้ (เริ่ม ${formatDate(conflictDate!)}) — walk-in ไม่ได้`
                                      : `ชนการจองวันที่ ${formatDate(conflictDate!)} — เลือกได้สูงสุด ${maxNights} คืน`}
                                  </span>
                                </div>
                              )
                            })()}
                            <div>
                              <label htmlFor="fd-walkin-method" className="block text-[11px] text-slate-500 mb-0.5">ชำระ</label>
                              <select id="fd-walkin-method"
                                value={form.paymentMethod}
                                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}
                                className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
                              >
                                <option value="cash">เงินสด</option>
                                <option value="credit_card">บัตร</option>
                                <option value="qr_code">QR</option>
                                <option value="bank_transfer">โอน</option>
                              </select>
                            </div>
                            {(() => {
                              const ci = calendarDateToISO(new Date())
                              const coDate = new Date(); coDate.setDate(coDate.getDate() + form.nights)
                              const total = calcBookingTotal(room.type, ci, calendarDateToISO(coDate), room.pricePerNight, dynamicPricing)
                              const paid = form.payMode === 'deposit' ? Math.min(Math.max(0, form.deposit), total) : total
                              const due = total - paid
                              return (
                                <>
                                  <div>
                                    <label className="block text-[11px] text-slate-500 mb-0.5">การชำระ</label>
                                    <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                                      {([['full', 'ชำระเต็ม'], ['deposit', 'มัดจำ']] as const).map(([mode, label]) => (
                                        <button key={mode} type="button"
                                          onClick={() => setForm({ ...form, payMode: mode, deposit: mode === 'deposit' ? (form.deposit || Math.min(room.pricePerNight, total)) : 0 })}
                                          className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${form.payMode === mode ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
                                          {label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  {form.payMode === 'deposit' && (
                                    <div>
                                      <label htmlFor="fd-walkin-deposit" className="block text-[11px] text-slate-500 mb-0.5">เงินมัดจำ (บาท)</label>
                                      <input id="fd-walkin-deposit" type="number" min={0} max={total} value={form.deposit || ''}
                                        onChange={(e) => setForm({ ...form, deposit: Math.max(0, +e.target.value) })}
                                        placeholder="0" className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                                    </div>
                                  )}
                                  <div className="bg-amber-100 rounded-lg px-3 py-2 space-y-0.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-amber-700">รวม {form.nights} คืน</span>
                                      <span className="font-bold text-amber-800">{formatCurrency(total)}</span>
                                    </div>
                                    {form.payMode === 'deposit' && (
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-amber-700">ค้างชำระหลังมัดจำ</span>
                                        <span className="font-semibold text-amber-800">{formatCurrency(due)}</span>
                                      </div>
                                    )}
                                  </div>
                                </>
                              )
                            })()}
                            {(() => {
                              const { maxNights } = maxNightsBeforeConflict(bookings, room.id, calendarDateToISO(new Date()))
                              const hasConflict = maxNights !== null && form.nights > maxNights
                              const overCapacity = form.adults + form.children > room.maxGuests
                              return (
                                <button
                                  onClick={handleWalkIn}
                                  disabled={(newGuestMode ? !newGuest.name : !form.guestId) || overCapacity || hasConflict}
                                  title={overCapacity ? 'จำนวนผู้เข้าพักเกินความจุห้อง' : hasConflict ? 'จำนวนคืนชนกับการจองอื่น' : undefined}
                                  className="w-full px-4 py-2.5 min-h-[44px] bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                  ยืนยัน Walk-in
                                </button>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick payment dialog */}
      {payDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPayDialog(null)}>
          <div ref={payTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-sm focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">บันทึกรับชำระเงิน</h2>
              <button onClick={() => setPayDialog(null)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm flex justify-between">
                <span className="text-slate-500">ยอดค้างชำระ</span>
                <span className="font-bold text-red-600">{formatCurrency(payDialog.outstanding)}</span>
              </div>
              <div>
                <label htmlFor="fd-pay-amount" className="block text-sm font-medium text-slate-700 mb-1.5">จำนวนที่รับ (บาท)</label>
                <input id="fd-pay-amount"
                  type="number" min={1} max={payDialog.outstanding} value={payAmount}
                  onChange={(e) => setPayAmount(Math.min(payDialog.outstanding, Math.max(0, +e.target.value)))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {payAmount > 0 && payAmount < payDialog.outstanding && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    ชำระบางส่วน — ยังค้างอีก {formatCurrency(payDialog.outstanding - payAmount)} (แขกจะเช็คเอาต์พร้อมยอดค้าง)
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="fd-pay-method" className="block text-sm font-medium text-slate-700 mb-1.5">ช่องทาง</label>
                <select id="fd-pay-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none">
                  <option value="cash">เงินสด</option>
                  <option value="credit_card">บัตรเครดิต</option>
                  <option value="debit_card">บัตรเดบิต</option>
                  <option value="qr_code">QR Code</option>
                  <option value="bank_transfer">โอนเงิน</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setPayDialog(null)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={handleQuickPay} disabled={payAmount <= 0}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {earlyTarget && (
        <EarlyCheckoutDialog
          guestName={earlyTarget.gName}
          roomNumber={earlyTarget.roomNo}
          remainingNights={earlyTarget.remaining}
          canRefund={canRefund}
          onClose={() => setEarlyTarget(null)}
          onAdjust={handleEarlyAdjust}
          onKeepFull={() => { const id = earlyTarget.bookingId; setEarlyTarget(null); proceedCheckOut(id) }}
        />
      )}

      {checkoutTarget && (
        <CheckoutConfirmDialog
          guestName={checkoutTarget.gName}
          roomNumber={checkoutTarget.roomNo}
          outstanding={checkoutTarget.outstanding}
          corporateCharge={checkoutTarget.corporateCharge}
          onClose={() => setCheckoutTarget(null)}
          onPayFirst={() => {
            setPayDialog({ bookingId: checkoutTarget.bookingId, outstanding: checkoutTarget.outstanding })
            setPayAmount(checkoutTarget.outstanding)
            setPayMethod('cash')
            setCheckoutTarget(null)
          }}
          onProceed={() => {
            doCheckOut(checkoutTarget.bookingId)
            setCheckoutTarget(null)
          }}
        />
      )}
    </div>
  )
}
