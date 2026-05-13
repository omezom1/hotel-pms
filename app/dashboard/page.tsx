'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate, getRoomStatusLabel, getRoomTypeLabel, todayLocal, toLocalDateKey } from '@/lib/utils'
import type { RoomStatus } from '@/types'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { TrendingUp, BedDouble, LogIn, DollarSign, CalendarSearch } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'


export default function DashboardPage() {
  const { rooms, bookings, guests, updateRoomStatus } = useHotelStore()
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)
  const [viewDate, setViewDate] = useState(() => todayLocal())

  const stats = {
    total: rooms.length,
    available: rooms.filter((r) => r.status === 'available').length,
    occupied: rooms.filter((r) => r.status === 'occupied').length,
    cleaning: rooms.filter((r) => r.status === 'cleaning').length,
    maintenance: rooms.filter((r) => r.status === 'maintenance').length,
  }
  const today = todayLocal()
  const checkInQueue = bookings.filter((b) => b.status === 'confirmed' && b.checkIn.startsWith(today)).length
  const checkOutToday = bookings.filter((b) => b.status === 'checked_in' && b.checkOut.startsWith(today)).length
  const occupancyRate = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0
  // รายได้วันนี้ = ยอดรวมของ booking ที่ check-out วันนี้
  const todayRevenue = bookings
    .filter((b) => b.status === 'checked_out' && b.checkOut.startsWith(today))
    .reduce((sum, b) => sum + b.totalAmount, 0)
  // RevPAR (มาตรฐาน) = รายได้วันนี้ ÷ ห้องทั้งหมด
  const revpar = stats.total > 0 ? Math.round(todayRevenue / stats.total) : 0

  const chartData = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (13 - i))
    const day = toLocalDateKey(d)
    const occupied = bookings.filter((b) =>
      b.status !== 'cancelled' &&
      b.checkIn.split('T')[0] <= day &&
      b.checkOut.split('T')[0] > day
    ).length
    return {
      dateLabel: format(parseISO(day), 'dd MMM', { locale: th }),
      occupancy: rooms.length > 0 ? Math.round((occupied / rooms.length) * 100) : 0,
    }
  })

  const selectedRoomData = rooms.find((r) => r.id === selectedRoom)

  function getBookingOnDate(roomId: string, date: string) {
    return bookings.find((b) =>
      b.roomId === roomId &&
      ['confirmed', 'checked_in', 'pending'].includes(b.status) &&
      b.checkIn.split('T')[0] <= date &&
      b.checkOut.split('T')[0] > date
    ) ?? null
  }

  function getRoomColorForDate(room: typeof rooms[0]) {
    if (room.status === 'maintenance') return 'bg-red-500 hover:bg-red-600'
    // วันนี้: ใช้ room.status เป็นหลัก (อัพเดทจริงจาก check-in/out)
    if (viewDate === today) {
      if (room.status === 'cleaning') return 'bg-amber-400 hover:bg-amber-500'
      if (room.status === 'occupied') return 'bg-blue-500 hover:bg-blue-600'
      const booking = getBookingOnDate(room.id, today)
      if (booking) return booking.status === 'checked_in' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-purple-500 hover:bg-purple-600'
      return 'bg-emerald-500 hover:bg-emerald-600'
    }
    // วันอื่น: ดูจาก booking
    const booking = getBookingOnDate(room.id, viewDate)
    if (!booking) return 'bg-emerald-500 hover:bg-emerald-600'
    if (booking.status === 'checked_in') return 'bg-blue-500 hover:bg-blue-600'
    return 'bg-purple-500 hover:bg-purple-600'
  }

  function isRoomBookedOnDate(room: typeof rooms[0]) {
    if (viewDate === today) return room.status === 'occupied' || !!getBookingOnDate(room.id, today)
    return !!getBookingOnDate(room.id, viewDate)
  }
  const dateAvailable = rooms.filter((r) => r.status !== 'maintenance' && !isRoomBookedOnDate(r)).length
  const dateBooked = rooms.filter((r) => r.status !== 'maintenance' && isRoomBookedOnDate(r)).length

  return (
    <div className="flex flex-col h-screen">
      <Header title="แดชบอร์ด" subtitle="ภาพรวมสถานะโรงแรมแบบเรียลไทม์" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-500">อัตราการเข้าพัก</span>
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <BedDouble size={18} className="text-blue-600" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-800">{occupancyRate}%</div>
            <div className="text-xs text-slate-400 mt-1">{stats.occupied}/{stats.total} ห้อง</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-500">รายได้วันนี้</span>
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                <DollarSign size={18} className="text-emerald-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800">{formatCurrency(todayRevenue)}</div>
            <div className="text-xs text-slate-400 mt-1">จากห้องที่เข้าพักอยู่</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-500">RevPAR</span>
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                <TrendingUp size={18} className="text-amber-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800">{formatCurrency(revpar)}</div>
            <div className="text-xs text-slate-400 mt-1">รายได้เฉลี่ยต่อห้อง</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-500">เช็คอินวันนี้</span>
              <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
                <LogIn size={18} className="text-purple-600" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-800">{checkInQueue}</div>
            <div className="text-xs text-slate-400 mt-1">เช็คเอาต์วันนี้: {checkOutToday}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Room Grid */}
          <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800">สถานะห้องพัก</h2>
              <div className="flex items-center gap-2">
                <CalendarSearch size={15} className="text-slate-400" />
                <input
                  type="date"
                  value={viewDate}
                  onChange={(e) => { setViewDate(e.target.value); setSelectedRoom(null) }}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {viewDate !== today && (
                  <button onClick={() => { setViewDate(today); setSelectedRoom(null) }}
                    className="text-xs text-slate-500 hover:text-slate-800 underline">วันนี้</button>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-slate-500 mb-3 flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500" />ว่าง</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500" />กำลังเข้าพัก</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-500" />มีการจอง</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400" />ทำความสะอาด</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500" />ปิดปรับปรุง</span>
              <span className="ml-auto font-medium text-slate-700">ว่าง {dateAvailable} · จอง {dateBooked} · ปิด {rooms.filter(r => r.status === 'maintenance').length}</span>
            </div>

            <p className="no-print text-xs text-slate-400 mb-3">คลิกห้องเพื่อดูรายละเอียดและเปลี่ยนสถานะ</p>
            <div className="grid grid-cols-4 gap-2">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoom(selectedRoom === room.id ? null : room.id)}
                  title={`ห้อง ${room.number} — ${getRoomStatusLabel(room.status)}`}
                  className={`${getRoomColorForDate(room)} text-white rounded-lg px-3 py-3 min-h-[56px] text-left transition-all ${selectedRoom === room.id ? 'ring-2 ring-offset-2 ring-slate-800 scale-105' : ''}`}
                >
                  <div className="font-bold text-sm">{room.number}</div>
                  <div className="text-[10px] opacity-80">{getRoomTypeLabel(room.type)}</div>
                </button>
              ))}
            </div>

            {/* Room detail panel */}
            {selectedRoomData && (() => {
              const booking = getBookingOnDate(selectedRoomData.id, viewDate)
              const guest = booking ? guests.find((g) => g.id === booking.guestId) : null
              return (
                <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-slate-800">ห้อง {selectedRoomData.number} — {getRoomTypeLabel(selectedRoomData.type)}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{selectedRoomData.description}</div>
                    </div>
                    {booking ? (
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${booking.status === 'checked_in' ? 'text-blue-700 bg-blue-100' : 'text-purple-700 bg-purple-100'}`}>
                        {booking.status === 'checked_in' ? 'กำลังเข้าพัก' : 'มีการจอง'}
                      </span>
                    ) : (
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium text-emerald-700 bg-emerald-100">ว่าง</span>
                    )}
                  </div>

                  {booking && guest ? (
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-20 shrink-0">ลูกค้า:</span>
                        <span className="font-semibold text-slate-800">{guest.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-20 shrink-0">เบอร์:</span>
                        <span>{guest.phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-20 shrink-0">เช็คอิน:</span>
                        <span>{formatDate(booking.checkIn)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-20 shrink-0">เช็คเอาต์:</span>
                        <span>{formatDate(booking.checkOut)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-20 shrink-0">ราคารวม:</span>
                        <span className="font-semibold">{formatCurrency(booking.totalAmount)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500 space-y-1">
                      <div><span className="text-slate-400">ราคา/คืน: </span>{formatCurrency(selectedRoomData.pricePerNight)}</div>
                      <div><span className="text-slate-400">รองรับ: </span>{selectedRoomData.maxGuests} ท่าน · ชั้น {selectedRoomData.floor}</div>
                      {viewDate === today && (
                        <div className="pt-2 flex gap-2 flex-wrap">
                          {(['available', 'occupied', 'cleaning', 'maintenance'] as RoomStatus[]).map((s) => (
                            <button key={s} onClick={() => updateRoomStatus(selectedRoomData.id, s)}
                              className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${selectedRoomData.status === s ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-300 text-slate-600 hover:border-slate-500'}`}>
                              {getRoomStatusLabel(s)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Occupancy Summary */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">สรุปสถานะห้อง</h2>
            <div className="space-y-3">
              {[
                { label: 'ว่าง', count: stats.available, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
                { label: 'มีผู้เข้าพัก', count: stats.occupied, color: 'bg-blue-500', textColor: 'text-blue-600' },
                { label: 'ทำความสะอาด', count: stats.cleaning, color: 'bg-amber-400', textColor: 'text-amber-600' },
                { label: 'ปิดปรับปรุง', count: stats.maintenance, color: 'bg-red-500', textColor: 'text-red-600' },
              ].map(({ label, count, color, textColor }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${color}`} />
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600">{label}</span>
                      <span className={`font-semibold ${textColor}`}>{count} ห้อง</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${color} transition-all`}
                        style={{ width: `${(count / stats.total) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <div className="flex justify-between text-sm text-slate-600 mb-1">
                <span>อัตราการเข้าพัก</span>
                <span className="font-bold text-slate-800">{occupancyRate}%</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                  style={{ width: `${occupancyRate}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Occupancy Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">แนวโน้ม Occupancy Rate (14 วันย้อนหลัง)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorOcc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" domain={[0, 100]} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                formatter={(v) => [`${v}%`, 'Occupancy']}
              />
              <Area type="monotone" dataKey="occupancy" stroke="#3b82f6" strokeWidth={2} fill="url(#colorOcc)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  )
}
