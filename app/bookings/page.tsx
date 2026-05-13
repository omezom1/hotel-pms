'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import {
  formatCurrency, formatDate, getBookingStatusLabel, getBookingSourceLabel, calcBookingTotal, calcNights
} from '@/lib/utils'
import type { BookingStatus, BookingSource, PaymentMethod } from '@/types'
import { Plus, Search, X, Eye, Ban } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { th } from 'date-fns/locale'
// @ts-ignore
const DateRange = dynamic(() => import('react-date-range').then((m: any) => m.DateRange), { ssr: false })

const statusColors: Record<BookingStatus, string> = {
  confirmed: 'text-blue-700 bg-blue-100',
  checked_in: 'text-emerald-700 bg-emerald-100',
  checked_out: 'text-slate-600 bg-slate-100',
  cancelled: 'text-red-700 bg-red-100',
  pending: 'text-amber-700 bg-amber-100',
}

export default function BookingsPage() {
  const { bookings, rooms, guests, corporateAccounts, createBooking, cancelBooking, logAudit } = useHotelStore()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<BookingStatus | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [dateRange, setDateRange] = useState([{ startDate: new Date(), endDate: new Date(), key: 'selection' }])
  const [form, setForm] = useState({
    roomId: '', guestId: '', checkIn: '', checkOut: '',
    source: 'direct' as BookingSource, adults: 1, children: 0,
    specialRequests: '', paymentMethod: 'credit_card' as PaymentMethod,
    corporateAccountId: '', isCorporate: false,
  })

  const filtered = bookings.filter((b) => {
    const guest = guests.find((g) => g.id === b.guestId)
    const room = rooms.find((r) => r.id === b.roomId)
    const matchSearch = !search ||
      guest?.name.toLowerCase().includes(search.toLowerCase()) ||
      room?.number.includes(search) || b.id.includes(search)
    const matchStatus = filterStatus === 'all' || b.status === filterStatus
    return matchSearch && matchStatus
  })

  function calcTotal() {
    if (!form.roomId || !form.checkIn || !form.checkOut) return 0
    const room = rooms.find((r) => r.id === form.roomId)
    if (!room) return 0
    return calcBookingTotal(room.type, form.checkIn, form.checkOut, room.pricePerNight)
  }

  function handleCreate() {
    if (!form.roomId || !form.checkIn || !form.checkOut) return
    const nights = calcNights(form.checkIn, form.checkOut)
    const total = calcTotal()
    createBooking({
      ...form, nights, status: 'confirmed',
      totalAmount: total,
      paidAmount: form.paymentMethod === 'pay_later' ? 0 : total,
      source: form.source,
    })
    setShowModal(false)
    setDateRange([{ startDate: new Date(), endDate: new Date(), key: 'selection' }])
    setForm({ roomId: '', guestId: '', checkIn: '', checkOut: '', source: 'direct', adults: 1, children: 0, specialRequests: '', paymentMethod: 'credit_card', corporateAccountId: '', isCorporate: false })
    const room = rooms.find((r) => r.id === form.roomId)
    const guest = guests.find((g) => g.id === form.guestId)
    logAudit({ category: 'booking', action: 'create', summary: `สร้างการจอง ${guest?.name ?? 'walk-in'} ห้อง ${room?.number ?? '-'} ${nights} คืน · ${total.toLocaleString()} บาท` })
    toast.success('สร้างการจองสำเร็จ', { description: `${nights} คืน · ${total.toLocaleString()} บาท` })
  }

  // ห้องที่ใช้จองได้ในช่วงวันที่เลือก: ไม่ปิดปรับปรุง + ไม่มี booking active ทับช่วง
  const availableRooms = rooms.filter((r) => {
    if (r.status === 'maintenance') return false
    if (!form.checkIn || !form.checkOut) return r.status === 'available'
    const ci = form.checkIn.split('T')[0]
    const co = form.checkOut.split('T')[0]
    const conflict = bookings.some((b) =>
      b.roomId === r.id &&
      ['confirmed', 'checked_in', 'pending'].includes(b.status) &&
      b.checkIn.split('T')[0] < co &&
      b.checkOut.split('T')[0] > ci
    )
    return !conflict
  })

  return (
    <div className="flex flex-col h-screen">
      <Header title="การจอง" subtitle="จัดการการจองทั้งหมด" />
      <div className="flex-1 overflow-y-auto p-6">

        {/* Controls */}
        <div className="no-print flex flex-wrap gap-3 mb-5 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อแขก, หมายเลขห้อง..."
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <select
            value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as BookingStatus | 'all')}
            className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none"
          >
            <option value="all">สถานะทั้งหมด</option>
            <option value="confirmed">ยืนยันแล้ว</option>
            <option value="checked_in">เช็คอินแล้ว</option>
            <option value="checked_out">เช็คเอาต์แล้ว</option>
            <option value="cancelled">ยกเลิกแล้ว</option>
            <option value="pending">รอยืนยัน</option>
          </select>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> สร้างการจองใหม่
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {[
                    { label: 'รหัสการจอง', cls: 'hidden xl:table-cell' },
                    { label: 'ชื่อแขก', cls: '' },
                    { label: 'ห้อง', cls: '' },
                    { label: 'เช็คอิน', cls: '' },
                    { label: 'เช็คเอาต์', cls: '' },
                    { label: 'คืน', cls: 'hidden md:table-cell' },
                    { label: 'ราคารวม', cls: '' },
                    { label: 'ช่องทาง', cls: 'hidden xl:table-cell' },
                    { label: 'สถานะการชำระ', cls: 'hidden lg:table-cell' },
                    { label: 'สถานะ', cls: '' },
                    { label: '', cls: '' },
                  ].map(({ label, cls }) => (
                    <th key={label || 'actions'} className={`text-left px-4 py-3 font-medium text-slate-500 whitespace-nowrap ${cls}`}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((b) => {
                  const guest = guests.find((g) => g.id === b.guestId)
                  const room = rooms.find((r) => r.id === b.roomId)
                  return (
                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                      <td className="hidden xl:table-cell px-4 py-3 font-mono text-xs text-slate-500">{b.id}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{guest?.name ?? '-'}</td>
                      <td className="px-4 py-3">ห้อง {room?.number ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(b.checkIn)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(b.checkOut)}</td>
                      <td className="hidden md:table-cell px-4 py-3 text-center">{b.nights}</td>
                      <td className="px-4 py-3 font-semibold">{formatCurrency(b.totalAmount)}</td>
                      <td className="hidden xl:table-cell px-4 py-3 text-slate-500">{getBookingSourceLabel(b.source)}</td>
                      <td className="hidden lg:table-cell px-4 py-3">
                        {b.paidAmount >= b.totalAmount
                          ? <span className="text-xs px-2.5 py-1 rounded-full font-medium text-emerald-700 bg-emerald-100">ชำระแล้ว</span>
                          : b.paidAmount > 0
                            ? <span className="text-xs px-2.5 py-1 rounded-full font-medium text-amber-700 bg-amber-100">ชำระบางส่วน</span>
                            : <span className="text-xs px-2.5 py-1 rounded-full font-medium text-red-700 bg-red-100">ค้างชำระ</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[b.status]}`}>
                          {getBookingStatusLabel(b.status)}
                        </span>
                      </td>
                      <td className="no-print px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link href={`/bookings/${b.id}`} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
                            <Eye size={15} />
                          </Link>
                          {(b.status === 'confirmed' || b.status === 'pending') && (
                            <button
                              onClick={() => {
                                if (!confirm(`ยืนยันยกเลิกการจอง ${b.id} ของ ${guest?.name ?? 'walk-in'}?\nการกระทำนี้ไม่สามารถย้อนกลับได้`)) return
                                cancelBooking(b.id)
                                logAudit({ category: 'booking', action: 'cancel', summary: `ยกเลิกการจอง ${b.id}`, entityId: b.id })
                                toast.success('ยกเลิกการจองแล้ว')
                              }}
                              className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                              title="ยกเลิกการจอง"
                            >
                              <Ban size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-400">ไม่พบข้อมูลการจอง</div>
            )}
          </div>
        </div>
      </div>

      {/* Create Booking Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <h2 className="font-semibold text-slate-800">สร้างการจองใหม่</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">ห้องพัก *</label>
                  <select
                    value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">เลือกห้อง</option>
                    {availableRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        ห้อง {r.number} — {r.type} ({formatCurrency(r.pricePerNight)}/คืน)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">แขก *</label>
                  <select
                    value={form.guestId} onChange={(e) => setForm({ ...form, guestId: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— ไม่ระบุ (Walk-in) —</option>
                    {guests.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">วันเช็คอิน – เช็คเอาต์ *</label>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <DateRange
                    ranges={dateRange}
                    onChange={(item) => {
                      const sel = item.selection
                      setDateRange([{ startDate: sel.startDate ?? new Date(), endDate: sel.endDate ?? new Date(), key: 'selection' }])
                      setForm({
                        ...form,
                        checkIn: sel.startDate ? sel.startDate.toISOString() : '',
                        checkOut: sel.endDate ? sel.endDate.toISOString() : '',
                      })
                    }}
                    months={2}
                    direction="horizontal"
                    locale={th}
                    minDate={new Date()}
                    showMonthAndYearPickers={false}
                    rangeColors={['#f59e0b']}
                    className="w-full"
                  />
                </div>
                {form.checkIn && form.checkOut && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    {formatDate(form.checkIn)} → {formatDate(form.checkOut)} · {calcNights(form.checkIn, form.checkOut)} คืน
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">ผู้ใหญ่</label>
                  <input type="number" min={1} max={4} value={form.adults} onChange={(e) => setForm({ ...form, adults: +e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">เด็ก</label>
                  <input type="number" min={0} max={4} value={form.children} onChange={(e) => setForm({ ...form, children: +e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">ช่องทาง</label>
                  <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as BookingSource })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none">
                    <option value="direct">จองตรง</option>
                    <option value="agoda">Agoda</option>
                    <option value="booking_com">Booking.com</option>
                    <option value="expedia">Expedia</option>
                    <option value="walk_in">Walk-in</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">บัญชีองค์กร (ถ้ามี)</label>
                <select
                  value={form.corporateAccountId}
                  onChange={(e) => setForm({ ...form, corporateAccountId: e.target.value, isCorporate: !!e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none"
                >
                  <option value="">— ไม่ใช้เครดิตองค์กร —</option>
                  {corporateAccounts.filter((a) => a.status === 'active').map((a) => (
                    <option key={a.id} value={a.id}>{a.companyName} (คงเหลือ: {a.availableBalance.toLocaleString()} บาท)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">วิธีชำระเงิน</label>
                <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}
                  className={`w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none ${form.isCorporate ? 'opacity-50' : ''}`}
                  disabled={form.isCorporate}
                >
                  <option value="credit_card">บัตรเครดิต</option>
                  <option value="debit_card">บัตรเดบิต</option>
                  <option value="qr_code">QR Code</option>
                  <option value="bank_transfer">โอนเงิน</option>
                  <option value="cash">เงินสด</option>
                  <option value="pay_later">ชำระภายหลัง</option>
                  {form.isCorporate && <option value="corporate_credit">เครดิตองค์กร</option>}
                </select>
                {form.isCorporate && <p className="text-xs text-blue-600 mt-1">ตัดจากเครดิตองค์กรอัตโนมัติเมื่อเช็คเอาต์</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">คำขอพิเศษ</label>
                <textarea value={form.specialRequests} onChange={(e) => setForm({ ...form, specialRequests: e.target.value })}
                  rows={2} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none resize-none" placeholder="เช่น หมอนเพิ่ม, เตียงเสริม..." />
              </div>
              {calcTotal() > 0 && (
                <div className="flex justify-between items-center py-3 px-4 bg-amber-50 rounded-lg border border-amber-200">
                  <span className="text-sm font-medium text-amber-800">ราคารวม</span>
                  <span className="text-lg font-bold text-amber-800">{formatCurrency(calcTotal())}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition-colors">ยกเลิก</button>
              <button onClick={handleCreate} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors">ยืนยันการจอง</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
