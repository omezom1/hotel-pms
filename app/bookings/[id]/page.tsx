'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useHotelStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth-store'
import Header from '@/components/layout/Header'
import { addNightsISO, formatCurrency, formatDate, formatDateTime, getBookingStatusLabel, getBookingSourceLabel, getPaymentMethodLabel, getRoomTypeLabel, getGuestDisplayName, roomHasConflict, calcAddOnTotal, calcOutstanding, todayLocal } from '@/lib/utils'
import { useFocusTrap } from '@/lib/useFocusTrap'
import type { BookingStatus, PaymentMethod } from '@/types'
import Link from 'next/link'
import { ArrowLeft, User, BedDouble, CalendarDays, CreditCard, MessageSquare, ShoppingBag, Plus, X, Ban, Banknote } from 'lucide-react'
import CheckoutConfirmDialog from '@/components/CheckoutConfirmDialog'
import EarlyCheckoutDialog from '@/components/EarlyCheckoutDialog'
import { useConfirm } from '@/components/ConfirmProvider'
import { toast } from 'sonner'

const statusColors: Record<BookingStatus, string> = {
  confirmed: 'text-blue-700 bg-blue-100',
  checked_in: 'text-emerald-700 bg-emerald-100',
  checked_out: 'text-slate-600 bg-slate-100',
  cancelled: 'text-red-700 bg-red-100',
  pending: 'text-amber-700 bg-amber-100',
}

const addOnStatusColors: Record<string, string> = {
  requested: 'text-amber-700 bg-amber-100',
  fulfilled: 'text-emerald-700 bg-emerald-100',
  cancelled: 'text-slate-500 bg-slate-100',
}
const addOnStatusLabels: Record<string, string> = {
  requested: 'รอดำเนินการ', fulfilled: 'จัดให้แล้ว', cancelled: 'ยกเลิก',
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { bookings, rooms, guests, addOnItems, bookingAddOns, invoices, corporateAccounts, updateBookingStatus, cancelBooking, requestAddOn, cancelAddOn, recordPayment, extendBooking, moveBooking, updateBooking, adjustForEarlyCheckout, logAudit } = useHotelStore()
  const { user } = useAuthStore()
  const confirm = useConfirm()
  const [showAddOnDialog, setShowAddOnDialog] = useState(false)
  const [addOnForm, setAddOnForm] = useState({ addOnItemId: '', quantity: 1, notes: '' })
  const [showPayDialog, setShowPayDialog] = useState(false)
  const [payForm, setPayForm] = useState({ amount: 0, method: 'cash' as PaymentMethod })
  const [extendNights, setExtendNights] = useState<number | null>(null)
  const [moveDialog, setMoveDialog] = useState(false)
  const [newRoomId, setNewRoomId] = useState('')
  const [editDialog, setEditDialog] = useState(false)
  const [editForm, setEditForm] = useState({ adults: 1, children: 0, source: 'direct' as import('@/types').BookingSource, specialRequests: '' })
  const payTrapRef = useFocusTrap<HTMLDivElement>(showPayDialog, () => setShowPayDialog(false))
  const addOnTrapRef = useFocusTrap<HTMLDivElement>(showAddOnDialog, () => setShowAddOnDialog(false))
  const extendTrapRef = useFocusTrap<HTMLDivElement>(extendNights !== null, () => setExtendNights(null))
  const editTrapRef = useFocusTrap<HTMLDivElement>(editDialog, () => setEditDialog(false))
  const moveTrapRef = useFocusTrap<HTMLDivElement>(moveDialog, () => { setMoveDialog(false); setNewRoomId('') })
  const [checkoutConfirm, setCheckoutConfirm] = useState(false)
  const [earlyConfirm, setEarlyConfirm] = useState(false)

  const booking = bookings.find((b) => b.id === id)
  if (!booking) return <div className="p-8 text-slate-500">ไม่พบข้อมูลการจอง</div>

  const guest = booking.guestId ? guests.find((g) => g.id === booking.guestId) : null
  const guestDisplayName = getGuestDisplayName(booking, guests)
  const room = rooms.find((r) => r.id === booking.roomId)
  const myAddOns = bookingAddOns.filter((a) => a.bookingId === id)
  const addOnTotal = calcAddOnTotal(id, bookingAddOns)

  function handleRequestAddOn() {
    if (!addOnForm.addOnItemId || !user) return
    const item = addOnItems.find((a) => a.id === addOnForm.addOnItemId)
    const result = requestAddOn(id, addOnForm.addOnItemId, addOnForm.quantity, user.staff.id, addOnForm.notes || undefined)
    if (!result.ok) {
      toast.error(result.error ?? 'ไม่สามารถเพิ่ม Add-on')
      return
    }
    setShowAddOnDialog(false)
    setAddOnForm({ addOnItemId: '', quantity: 1, notes: '' })
    toast.success(`บันทึกคำขอ Add-on แล้ว${item ? ` — ${item.name}` : ''}`)
  }

  const selectedAddOnItem = addOnItems.find((a) => a.id === addOnForm.addOnItemId)
  const outstanding = calcOutstanding(booking, bookingAddOns)
  const isEarly = booking.status === 'checked_in' && todayLocal() < booking.checkOut.split('T')[0]
  const remainingNights = isEarly
    ? Math.max(1, Math.round((new Date(booking.checkOut.split('T')[0]).getTime() - new Date(todayLocal()).getTime()) / 86400000))
    : 0

  function handleRecordPayment() {
    if (payForm.amount <= 0 || !booking || !user) return
    if (payForm.amount > outstanding) {
      toast.error(`จำนวนเกินยอดค้างชำระ (${formatCurrency(outstanding)})`)
      return
    }
    const result = recordPayment(booking.id, payForm.amount, payForm.method, user.staff.id)
    if (!result.ok) {
      toast.error(result.error ?? 'รับชำระไม่สำเร็จ')
      return
    }
    logAudit({ category: 'payment', action: 'record', summary: `รับชำระ ${payForm.amount.toLocaleString()} บาท (${payForm.method})`, entityId: booking.id })
    setShowPayDialog(false)
    setPayForm({ amount: 0, method: 'cash' })
    toast.success(`บันทึกการชำระ ${payForm.amount.toLocaleString()} บาทแล้ว`)
  }

  function handleExtend(nights: number) {
    const result = extendBooking(id, nights)
    if (result.ok) {
      logAudit({ category: 'booking', action: 'extend', summary: `ขยายการเข้าพักอีก ${nights} คืน`, entityId: id })
      // ขยายแล้ว totalAmount เพิ่มแต่ paidAmount เท่าเดิม → เตือนว่าเกิดยอดค้างชำระ
      const fresh = useHotelStore.getState()
      const fb = fresh.bookings.find((b) => b.id === id)
      const out = fb ? calcOutstanding(fb, fresh.bookingAddOns) : 0
      toast.success(`ขยายการเข้าพักอีก ${nights} คืน`, {
        description: out > 0
          ? `ค่าห้องเพิ่ม → ยอดค้างชำระตอนนี้ ${formatCurrency(out)} อย่าลืมเก็บส่วนต่าง`
          : 'อัพเดทยอดอัตโนมัติ',
      })
      setExtendNights(null)
    } else {
      toast.error(result.error ?? 'ขยายไม่สำเร็จ')
    }
  }

  function doCheckOut() {
    updateBookingStatus(booking!.id, 'checked_out')
    logAudit({ category: 'booking', action: 'check_out', summary: `เช็คเอาต์ ${guestDisplayName} ห้อง ${room?.number ?? '-'}`, entityId: booking!.id })
    toast.success('เช็คเอาต์สำเร็จ', { description: 'สร้างใบแจ้งหนี้ + งานทำความสะอาดอัตโนมัติแล้ว' })
  }

  function handleCheckoutClick() {
    if (isEarly) { setEarlyConfirm(true); return }
    proceedCheckout()
  }

  function proceedCheckout() {
    // อ่าน state สดเสมอ (เผื่อเพิ่งปรับยอดออกก่อนกำหนด)
    const st = useHotelStore.getState()
    const fb = st.bookings.find((b) => b.id === id)
    const out = fb ? calcOutstanding(fb, st.bookingAddOns) : 0
    if (out > 0) { setCheckoutConfirm(true); return }
    doCheckOut()
  }

  function handleEarlyAdjust() {
    const res = adjustForEarlyCheckout(id)
    if (res.ok) {
      logAudit({ category: 'booking', action: 'early_checkout', summary: `ออกก่อนกำหนด — ปรับเป็น ${res.newNights} คืน`, entityId: id })
      toast.success(`ปรับเป็น ${res.newNights} คืน${res.refunded ? ` · คืนเงิน ${formatCurrency(res.refunded)}` : ''}`)
    } else {
      toast.error(res.error ?? 'ปรับยอดไม่สำเร็จ')
    }
    setEarlyConfirm(false)
    proceedCheckout()
  }

  function handleMove() {
    if (!newRoomId) return
    const result = moveBooking(id, newRoomId)
    if (result.ok) {
      const r = rooms.find((x) => x.id === newRoomId)
      const oldRoom = rooms.find((x) => x.id === booking?.roomId)
      logAudit({ category: 'booking', action: 'move_room', summary: `ย้ายจากห้อง ${oldRoom?.number ?? '-'} → ${r?.number ?? newRoomId}`, entityId: id })
      toast.success(`ย้ายห้องเป็นห้อง ${r?.number ?? newRoomId} แล้ว`)
      setMoveDialog(false)
      setNewRoomId('')
    } else {
      toast.error(result.error ?? 'ย้ายห้องไม่สำเร็จ')
    }
  }

  function openEdit() {
    setEditForm({
      adults: booking?.adults ?? 1,
      children: booking?.children ?? 0,
      source: booking?.source ?? 'direct',
      specialRequests: booking?.specialRequests ?? '',
    })
    setEditDialog(true)
  }

  function handleSaveEdit() {
    updateBooking(id, editForm)
    logAudit({ category: 'booking', action: 'edit', summary: `แก้ไขข้อมูลการจอง`, entityId: id })
    setEditDialog(false)
    toast.success('บันทึกการแก้ไขแล้ว')
  }

  // ห้องที่ย้ายได้: ไม่ปิดปรับปรุง + ไม่ทับ booking ช่วงนี้ + ไม่ใช่ห้องเดิม
  const moveableRooms = rooms.filter((r) => {
    if (r.id === booking.roomId) return false
    if (r.status === 'maintenance') return false
    return !roomHasConflict(bookings, r.id, booking.checkIn, booking.checkOut, booking.id)
  })

  return (
    <div className="flex flex-col h-screen">
      <Header title={`การจอง #${booking.id}`} subtitle="รายละเอียดการจอง" />
      <div className="flex-1 overflow-y-auto p-6">
        <Link href="/bookings" className="no-print inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-5">
          <ArrowLeft size={15} /> กลับไปรายการจอง
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {/* Status */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-800">สถานะการจอง</h2>
                <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${statusColors[booking.status]}`}>
                  {getBookingStatusLabel(booking.status)}
                </span>
              </div>
              {booking.status !== 'cancelled' && booking.status !== 'checked_out' && (
                <div className="no-print flex flex-wrap gap-2">
                  {booking.status === 'confirmed' && (
                    <button onClick={() => {
                      updateBookingStatus(booking.id, 'checked_in')
                      logAudit({ category: 'booking', action: 'check_in', summary: `เช็คอิน ${guestDisplayName} ห้อง ${room?.number ?? '-'}`, entityId: booking.id })
                      toast.success('เช็คอินสำเร็จ')
                    }}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors">
                      เช็คอิน
                    </button>
                  )}
                  {booking.status === 'checked_in' && (
                    <button onClick={handleCheckoutClick}
                      className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors">
                      เช็คเอาต์{isEarly ? ' (ก่อนกำหนด)' : ''}
                    </button>
                  )}
                  {(booking.status === 'confirmed' || booking.status === 'checked_in') && (
                    <>
                      <button onClick={openEdit}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium transition-colors">
                        แก้ไขข้อมูล
                      </button>
                      <button onClick={() => setExtendNights(1)}
                        className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium transition-colors">
                        ขยายวันเข้าพัก
                      </button>
                      <button onClick={() => setMoveDialog(true)}
                        className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-sm font-medium transition-colors">
                        ย้ายห้อง
                      </button>
                    </>
                  )}
                  {(booking.status === 'confirmed' || booking.status === 'pending') && (
                    <button onClick={async () => {
                      if (!(await confirm({ title: 'ยกเลิกการจอง?', message: `ยกเลิกการจอง ${booking.id} ของ ${guestDisplayName}?\nการกระทำนี้ไม่สามารถย้อนกลับได้`, danger: true, confirmText: 'ยกเลิกการจอง' }))) return
                      cancelBooking(booking.id)
                      logAudit({ category: 'booking', action: 'cancel', summary: `ยกเลิกการจอง ${guestDisplayName} ห้อง ${room?.number ?? '-'}`, entityId: booking.id })
                      toast.success('ยกเลิกการจองแล้ว')
                    }}
                      className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors">
                      ยกเลิกการจอง
                    </button>
                  )}
                </div>
              )}
              {booking.status === 'checked_out' && (() => {
                const invoice = invoices.find((iv) => iv.bookingId === booking.id)
                return invoice ? (
                  <Link href={`/invoice/${invoice.id}`}
                    className="no-print inline-flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium border border-blue-200 transition-colors">
                    ดูใบแจ้งหนี้ {invoice.id}
                  </Link>
                ) : null
              })()}
            </div>

            {/* Room info */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <BedDouble size={18} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800">ข้อมูลห้องพัก</h2>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">หมายเลขห้อง: </span><span className="font-medium">{room?.number}</span></div>
                <div><span className="text-slate-500">ประเภท: </span><span className="font-medium">{getRoomTypeLabel(room?.type ?? '')}</span></div>
                <div><span className="text-slate-500">ชั้น: </span><span className="font-medium">{room?.floor}</span></div>
                <div><span className="text-slate-500">ราคา/คืน: </span><span className="font-medium">{formatCurrency(room?.pricePerNight ?? 0)}</span></div>
              </div>
            </div>

            {/* Dates */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays size={18} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800">วันที่เข้าพัก</h2>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-500 mb-1">เช็คอิน</div>
                  <div className="font-semibold text-slate-800">{formatDate(booking.checkIn)}</div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-500 mb-1">จำนวนคืน</div>
                  <div className="font-semibold text-slate-800 text-2xl">{booking.nights}</div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="text-slate-500 mb-1">เช็คเอาต์</div>
                  <div className="font-semibold text-slate-800">{formatDate(booking.checkOut)}</div>
                </div>
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                <span className="text-slate-500">ผู้ใหญ่: <span className="font-medium text-slate-800">{booking.adults}</span></span>
                <span className="text-slate-500">เด็ก: <span className="font-medium text-slate-800">{booking.children}</span></span>
              </div>
            </div>

            {booking.specialRequests && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare size={18} className="text-slate-400" />
                  <h2 className="font-semibold text-slate-800">คำขอพิเศษ</h2>
                </div>
                <p className="text-sm text-slate-600">{booking.specialRequests}</p>
              </div>
            )}
            {/* Add-ons */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={18} className="text-slate-400" />
                  <h2 className="font-semibold text-slate-800">Add-on</h2>
                  {myAddOns.length > 0 && (
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{myAddOns.length} รายการ</span>
                  )}
                </div>
                {booking.status !== 'cancelled' && booking.status !== 'checked_out' && (
                  <button
                    onClick={() => setShowAddOnDialog(true)}
                    className="flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-800 font-medium"
                  >
                    <Plus size={15} /> เพิ่ม Add-on
                  </button>
                )}
              </div>

              {myAddOns.length === 0 ? (
                <p className="text-sm text-slate-400">ยังไม่มี Add-on</p>
              ) : (
                <div className="space-y-2">
                  {myAddOns.map((ao) => {
                    const item = addOnItems.find((a) => a.id === ao.addOnItemId)
                    return (
                      <div key={ao.id} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{item?.name ?? ao.addOnItemId}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {formatCurrency(ao.unitPrice)} × {ao.quantity} = <span className="font-medium">{formatCurrency(ao.totalPrice)}</span>
                            {ao.notes && <span className="ml-2 italic">&ldquo;{ao.notes}&rdquo;</span>}
                          </div>
                          <div className="text-xs text-slate-400">{formatDateTime(ao.requestedAt)}</div>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${addOnStatusColors[ao.status]}`}>
                          {addOnStatusLabels[ao.status]}
                        </span>
                        {ao.status === 'requested' && (
                          <button
                            onClick={async () => {
                              if (!(await confirm({ title: 'ยกเลิก Add-on?', message: `ยกเลิก add-on "${item?.name ?? 'รายการนี้'}"?\nรายได้ ${formatCurrency(ao.totalPrice)} จะหายไปจากบิล`, danger: true }))) return
                              cancelAddOn(ao.id)
                              toast.info('ยกเลิก Add-on แล้ว')
                            }}
                            title="ยกเลิก"
                            className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 shrink-0"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {addOnTotal > 0 && (
                    <div className="flex justify-between text-sm pt-2 border-t border-slate-100 font-medium">
                      <span className="text-slate-600">รวม Add-on</span>
                      <span className="text-slate-800">{formatCurrency(addOnTotal)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Side info */}
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <User size={18} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800">ข้อมูลแขก</h2>
              </div>
              <div className="space-y-2 text-sm">
                <div className="font-semibold text-slate-800 text-base">{guestDisplayName}</div>
                {guest ? (
                  <>
                    <div className="text-slate-500">{guest.email}</div>
                    <div className="text-slate-500">{guest.phone}</div>
                    <div className="text-slate-500">{guest.nationality}</div>
                    <Link href={`/guests/${guest.id}`} className="inline-block text-blue-600 hover:text-blue-800 text-xs mt-2">
                      ดูโปรไฟล์แขก →
                    </Link>
                  </>
                ) : booking.guestSnapshot ? (
                  <>
                    {booking.guestSnapshot.phone && <div className="text-slate-500">{booking.guestSnapshot.phone}</div>}
                    {booking.guestSnapshot.idNumber && <div className="text-slate-500">เลขบัตร: {booking.guestSnapshot.idNumber}</div>}
                    <div className="mt-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      ไม่บันทึกเป็นลูกค้าประจำ
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard size={18} className="text-slate-400" />
                <h2 className="font-semibold text-slate-800">การชำระเงิน</h2>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">ค่าห้องพัก</span>
                  <span className="font-semibold">{formatCurrency(booking.totalAmount)}</span>
                </div>
                {addOnTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Add-on</span>
                    <span className="font-semibold">{formatCurrency(addOnTotal)}</span>
                  </div>
                )}
                {addOnTotal > 0 && (
                  <div className="flex justify-between border-t border-slate-100 pt-2">
                    <span className="text-slate-700 font-medium">รวมทั้งหมด</span>
                    <span className="font-bold text-slate-900">{formatCurrency(booking.totalAmount + addOnTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">ชำระแล้ว</span>
                  <span className="font-semibold text-emerald-600">{formatCurrency(booking.paidAmount)}</span>
                </div>
                {outstanding > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">ค้างชำระ</span>
                    <span className="font-semibold text-red-600">{formatCurrency(outstanding)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-slate-500">ช่องทาง: </span>
                  <span>{getPaymentMethodLabel(booking.paymentMethod ?? '')}</span>
                </div>
                <div>
                  <span className="text-slate-500">แหล่งจอง: </span>
                  <span>{getBookingSourceLabel(booking.source)}</span>
                </div>
                <div>
                  <span className="text-slate-500">วันที่จอง: </span>
                  <span>{formatDate(booking.createdAt)}</span>
                </div>
                {outstanding > 0 && booking.status !== 'cancelled' && (
                  <button
                    onClick={() => { setPayForm({ amount: outstanding, method: 'cash' }); setShowPayDialog(true) }}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Banknote size={15} /> บันทึกรับชำระ
                  </button>
                )}
              </div>

              {/* Payment history */}
              {booking.payments && booking.payments.length > 0 && (
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">ประวัติการชำระ</h3>
                  <div className="space-y-1.5">
                    {booking.payments.slice().reverse().map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 rounded-md px-3 py-2">
                        <div>
                          <div className="font-medium text-slate-800">{formatCurrency(p.amount)}</div>
                          <div className="text-slate-400 mt-0.5">{formatDateTime(p.date)} · {getPaymentMethodLabel(p.method)}</div>
                        </div>
                        {p.notes && <span className="text-slate-400 italic truncate ml-3">&ldquo;{p.notes}&rdquo;</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Payment dialog */}
      {showPayDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowPayDialog(false)}>
          <div ref={payTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-sm focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">บันทึกรับชำระเงิน</h2>
              <button onClick={() => setShowPayDialog(false)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm flex justify-between">
                <span className="text-slate-500">ยอดค้างชำระ</span>
                <span className="font-bold text-red-600">{formatCurrency(outstanding)}</span>
              </div>
              <div>
                <label htmlFor="bd-pay-amount" className="block text-sm font-medium text-slate-700 mb-1.5">จำนวนที่รับ (บาท)</label>
                <input id="bd-pay-amount"
                  type="number" min={1} max={outstanding} value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: Math.min(outstanding, Math.max(0, +e.target.value)) })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="bd-pay-method" className="block text-sm font-medium text-slate-700 mb-1.5">ช่องทางชำระเงิน</label>
                <select id="bd-pay-method" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value as PaymentMethod })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none">
                  <option value="cash">เงินสด</option>
                  <option value="credit_card">บัตรเครดิต</option>
                  <option value="debit_card">บัตรเดบิต</option>
                  <option value="qr_code">QR Code</option>
                  <option value="bank_transfer">โอนเงิน</option>
                </select>
              </div>
              {payForm.amount > 0 && payForm.amount < outstanding && (
                <p className="text-xs text-amber-600">ชำระบางส่วน — ยังค้างอีก {formatCurrency(outstanding - payForm.amount)}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowPayDialog(false)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={handleRecordPayment} disabled={payForm.amount <= 0}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-on dialog */}
      {showAddOnDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddOnDialog(false)}>
          <div ref={addOnTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-sm focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">เพิ่ม Add-on</h2>
              <button onClick={() => setShowAddOnDialog(false)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="bd-addon-item" className="block text-sm font-medium text-slate-700 mb-1.5">รายการ *</label>
                <select id="bd-addon-item"
                  value={addOnForm.addOnItemId}
                  onChange={(e) => setAddOnForm({ ...addOnForm, addOnItemId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">เลือก Add-on</option>
                  {addOnItems.filter((a) => a.isAvailable).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {formatCurrency(a.price)}/รายการ</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="bd-addon-qty" className="block text-sm font-medium text-slate-700 mb-1.5">จำนวน</label>
                <input id="bd-addon-qty"
                  type="number" min={1} max={10} value={addOnForm.quantity}
                  onChange={(e) => setAddOnForm({ ...addOnForm, quantity: Math.max(1, +e.target.value) })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="bd-addon-notes" className="block text-sm font-medium text-slate-700 mb-1.5">หมายเหตุ</label>
                <input id="bd-addon-notes"
                  value={addOnForm.notes}
                  onChange={(e) => setAddOnForm({ ...addOnForm, notes: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none"
                  placeholder="ไม่บังคับ"
                />
              </div>
              {selectedAddOnItem && (
                <div className="flex justify-between text-sm bg-amber-50 rounded-lg px-4 py-3 border border-amber-200">
                  <span className="text-amber-700">ราคารวม</span>
                  <span className="font-bold text-amber-800">{formatCurrency(selectedAddOnItem.price * addOnForm.quantity)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowAddOnDialog(false)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={handleRequestAddOn} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">ยืนยัน</button>
            </div>
          </div>
        </div>
      )}

      {/* Extend stay dialog */}
      {extendNights !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setExtendNights(null)}>
          <div ref={extendTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-sm focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">ขยายวันเข้าพัก</h2>
              <button onClick={() => setExtendNights(null)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="bd-extend-nights" className="block text-sm font-medium text-slate-700 mb-1.5">เพิ่มกี่คืน?</label>
                <input id="bd-extend-nights"
                  type="number" min={1} max={30} value={extendNights}
                  onChange={(e) => setExtendNights(Math.max(1, +e.target.value))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  เช็คเอาต์ใหม่: {formatDate(addNightsISO(booking.checkOut, extendNights))}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setExtendNights(null)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={() => handleExtend(extendNights)} className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium">ยืนยัน</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit booking dialog */}
      {editDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditDialog(false)}>
          <div ref={editTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-md focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">แก้ไขข้อมูลการจอง</h2>
              <button onClick={() => setEditDialog(false)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bd-edit-adults" className="block text-sm font-medium text-slate-700 mb-1.5">ผู้ใหญ่</label>
                  <input id="bd-edit-adults" type="number" min={1} max={10} value={editForm.adults}
                    onChange={(e) => setEditForm({ ...editForm, adults: Math.max(1, +e.target.value) })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="bd-edit-children" className="block text-sm font-medium text-slate-700 mb-1.5">เด็ก</label>
                  <input id="bd-edit-children" type="number" min={0} max={10} value={editForm.children}
                    onChange={(e) => setEditForm({ ...editForm, children: Math.max(0, +e.target.value) })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
              </div>
              <div>
                <label htmlFor="bd-edit-source" className="block text-sm font-medium text-slate-700 mb-1.5">ช่องทางการจอง</label>
                <select id="bd-edit-source" value={editForm.source}
                  onChange={(e) => setEditForm({ ...editForm, source: e.target.value as import('@/types').BookingSource })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none">
                  <option value="direct">จองตรง</option>
                  <option value="walk_in">Walk-in</option>
                </select>
              </div>
              <div>
                <label htmlFor="bd-edit-special" className="block text-sm font-medium text-slate-700 mb-1.5">คำขอพิเศษ</label>
                <textarea id="bd-edit-special" value={editForm.specialRequests}
                  onChange={(e) => setEditForm({ ...editForm, specialRequests: e.target.value })}
                  rows={3} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none resize-none" />
              </div>
              <p className="text-xs text-slate-400">หมายเหตุ: ห้องและวันที่ใช้ปุ่ม &ldquo;ย้ายห้อง&rdquo; / &ldquo;ขยายวันเข้าพัก&rdquo;</p>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setEditDialog(false)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={handleSaveEdit} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* Move room dialog */}
      {moveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setMoveDialog(false); setNewRoomId('') }}>
          <div ref={moveTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-md focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">ย้ายห้อง</h2>
              <button onClick={() => { setMoveDialog(false); setNewRoomId('') }} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-sm text-slate-600">
                ห้องปัจจุบัน: <span className="font-semibold">ห้อง {room?.number} ({getRoomTypeLabel(room?.type ?? '')})</span>
              </div>
              <div>
                <label htmlFor="bd-move-room" className="block text-sm font-medium text-slate-700 mb-1.5">ย้ายไปห้องใหม่ *</label>
                <select id="bd-move-room" value={newRoomId} onChange={(e) => setNewRoomId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">เลือกห้อง</option>
                  {moveableRooms.map((r) => (
                    <option key={r.id} value={r.id}>ห้อง {r.number} — {getRoomTypeLabel(r.type)} ({formatCurrency(r.pricePerNight)}/คืน)</option>
                  ))}
                </select>
                {moveableRooms.length === 0 && (
                  <p className="text-xs text-red-500 mt-1.5">ไม่มีห้องว่างในช่วงวันที่จองนี้</p>
                )}
              </div>
              <p className="text-xs text-slate-400">
                หมายเหตุ: ราคาเดิมไม่เปลี่ยน — ถ้าราคาห้องใหม่ต่างกัน ปรับยอดเองที่ &ldquo;บันทึกรับชำระ&rdquo;
              </p>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => { setMoveDialog(false); setNewRoomId('') }} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={handleMove} disabled={!newRoomId} className="px-5 py-2.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium">ยืนยันการย้าย</button>
            </div>
          </div>
        </div>
      )}

      {earlyConfirm && (
        <EarlyCheckoutDialog
          guestName={guestDisplayName}
          roomNumber={room?.number ?? '-'}
          remainingNights={remainingNights}
          onClose={() => setEarlyConfirm(false)}
          onAdjust={handleEarlyAdjust}
          onKeepFull={() => { setEarlyConfirm(false); proceedCheckout() }}
        />
      )}

      {checkoutConfirm && (
        <CheckoutConfirmDialog
          guestName={guestDisplayName}
          roomNumber={room?.number ?? '-'}
          outstanding={outstanding}
          corporateCharge={(() => {
            if (!booking?.corporateAccountId) return null
            const acc = corporateAccounts.find((a) => a.id === booking.corporateAccountId)
            return acc && acc.availableBalance >= outstanding ? { amount: outstanding, company: acc.companyName } : null
          })()}
          onClose={() => setCheckoutConfirm(false)}
          onPayFirst={() => { setPayForm({ amount: outstanding, method: 'cash' }); setShowPayDialog(true); setCheckoutConfirm(false) }}
          onProceed={() => { doCheckOut(); setCheckoutConfirm(false) }}
        />
      )}
    </div>
  )
}
