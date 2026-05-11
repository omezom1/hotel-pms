'use client'
import { useParams } from 'next/navigation'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate, getBookingStatusLabel } from '@/lib/utils'
import type { BookingStatus } from '@/types'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle } from 'lucide-react'

const statusColors: Record<BookingStatus, string> = {
  confirmed: 'text-blue-700 bg-blue-100',
  checked_in: 'text-emerald-700 bg-emerald-100',
  checked_out: 'text-slate-600 bg-slate-100',
  cancelled: 'text-red-700 bg-red-100',
  pending: 'text-amber-700 bg-amber-100',
}

export default function GuestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { guests, bookings, rooms } = useHotelStore()
  const guest = guests.find((g) => g.id === id)
  if (!guest) return <div className="p-8 text-slate-500">ไม่พบข้อมูลแขก</div>

  const guestBookings = bookings.filter((b) => b.guestId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="flex flex-col h-screen">
      <Header title={guest.name} subtitle="โปรไฟล์แขก" />
      <div className="flex-1 overflow-y-auto p-6">
        <Link href="/guests" className="no-print inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-5">
          <ArrowLeft size={15} /> กลับไปรายชื่อแขก
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-5">
            {/* Profile card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <div className="flex flex-col items-center text-center mb-4">
                <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 text-2xl mb-3">
                  {guest.name.charAt(0)}
                </div>
                <div className="font-bold text-lg text-slate-800">{guest.name}</div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">อีเมล</span><span className="font-medium text-right">{guest.email}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">โทรศัพท์</span><span>{guest.phone}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">สัญชาติ</span><span>{guest.nationality}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">เลขบัตร</span><span className="text-xs">{guest.idNumber}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">สมาชิกตั้งแต่</span><span>{formatDate(guest.joinedAt)}</span></div>
              </div>
            </div>

            {/* Preferences */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h2 className="font-semibold text-slate-800 mb-3">ความชอบส่วนตัว</h2>
              <div className="space-y-2 text-sm">
                {guest.preferences.pillow && <div><span className="text-slate-500">หมอน: </span><span>{{ soft: 'นุ่ม', firm: 'แข็ง', high: 'สูง' }[guest.preferences.pillow]}</span></div>}
                {guest.preferences.floor && <div><span className="text-slate-500">ชั้น: </span><span>{{ low: 'ชั้นต่ำ', high: 'ชั้นสูง' }[guest.preferences.floor]}</span></div>}
                {guest.preferences.bedType && <div><span className="text-slate-500">เตียง: </span><span>{{ single: 'เตียงเดี่ยว', double: 'เตียงคู่', twin: 'เตียงแฝด' }[guest.preferences.bedType]}</span></div>}
                {guest.preferences.foodAllergies.length > 0 && (
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />
                    <div><span className="text-slate-500">แพ้อาหาร: </span><span className="text-red-600">{guest.preferences.foodAllergies.join(', ')}</span></div>
                  </div>
                )}
                {guest.preferences.specialRequests.map((r, i) => (
                  <div key={i} className="text-slate-600">• {r}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Stay history */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-100">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-800">ประวัติการเข้าพัก</h2>
                <div className="flex gap-4 text-sm text-slate-500">
                  <span>ทั้งหมด <strong className="text-slate-800">{guest.totalStays}</strong> ครั้ง</span>
                  <span>รวม <strong className="text-slate-800">{formatCurrency(guest.totalSpend)}</strong></span>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {guestBookings.map((b) => {
                  const room = rooms.find((r) => r.id === b.roomId)
                  return (
                    <div key={b.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-slate-800">ห้อง {room?.number} — {room?.type}</div>
                          <div className="text-sm text-slate-500 mt-0.5">
                            {formatDate(b.checkIn)} → {formatDate(b.checkOut)} ({b.nights} คืน)
                          </div>
                          {b.specialRequests && <div className="text-xs text-slate-400 mt-1">&ldquo;{b.specialRequests}&rdquo;</div>}
                        </div>
                        <div className="text-right">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[b.status]}`}>
                            {getBookingStatusLabel(b.status)}
                          </span>
                          <div className="font-semibold text-slate-800 mt-1.5">{formatCurrency(b.totalAmount)}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {guestBookings.length === 0 && (
                  <div className="text-center py-10 text-slate-400">ยังไม่มีประวัติการเข้าพัก</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
