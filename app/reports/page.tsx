'use client'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { formatCurrency, todayLocal, toLocalDateKey, bookingOccupiesDay, sumRealizedRevenue, sellableRoomCount } from '@/lib/utils'
import type { Booking, BookingAddOn } from '@/types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'
import { TrendingUp, DollarSign, BarChart2, Users } from 'lucide-react'

const COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#8b5cf6', '#ef4444']

function buildDailyStats(bookings: Booking[], addOns: BookingAddOn[], totalRooms: number, days: number) {
  const today = new Date()
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (days - 1 - i))
    const day = toLocalDateKey(d)
    const revenue = sumRealizedRevenue(bookings, addOns, (b) => b.checkOut.startsWith(day))
    const occupied = bookings.filter((b) => bookingOccupiesDay(b, day)).length
    const occupancy = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0
    return { date: day, revenue, occupancy }
  })
}

export default function ReportsPage() {
  const { rooms, guests, bookings, bookingAddOns } = useHotelStore()

  // ประเภทห้องของ booking = snapshot ตอนจอง (กันรายได้เพี้ยนถ้าย้ายห้องข้ามประเภท);
  // booking เก่าที่ไม่มี snapshot fallback เป็นประเภทห้องปัจจุบัน
  const roomTypeOf = (b: Booking) =>
    b.roomTypeAtBooking ?? rooms.find((r) => r.id === b.roomId)?.type
  const revenueByType = (['single', 'double', 'triple'] as const).map((type) => {
    // นับเฉพาะ booking ที่ยังไม่ถูกยกเลิก สำหรับ "จำนวนการจอง" (ปริมาณงานที่รับเข้ามา)
    const typeBookings = bookings.filter((b) =>
      roomTypeOf(b) === type && b.status !== 'cancelled'
    )
    return {
      type: { single: 'เตียงเดี่ยว', double: 'เตียงคู่', triple: '3 เตียง' }[type],
      // รายได้ = เฉพาะที่รับรู้แล้ว (เช็คเอาท์) ให้ตรงกับ Dashboard/Finance/Daily-report
      รายได้: sumRealizedRevenue(typeBookings, bookingAddOns),
      จำนวนการจอง: typeBookings.length,
    }
  }).filter((d) => d.จำนวนการจอง > 0)

  const sourceData = ['direct', 'walk_in'].map((src) => ({
    name: { direct: 'จองตรง', walk_in: 'Walk-in' }[src]!,
    value: bookings.filter((b) => b.source === src && b.status !== 'cancelled').length,
  })).filter((d) => d.value > 0)

  // occupancy หารด้วยห้องที่ขายได้จริง (ตัดห้องปิดปรับปรุงออก) — ตัวหารมาตรฐานเดียวกันทุกหน้า
  const sellableRooms = sellableRoomCount(rooms)
  const dailyStats = buildDailyStats(bookings, bookingAddOns, sellableRooms, 30)

  const occupancyData = dailyStats.map((d) => ({
    date: format(parseISO(d.date), 'dd MMM', { locale: th }),
    occupancy: d.occupancy,
  }))

  const topGuests = [...guests]
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 5)

  // KPI — รายได้ใช้เกณฑ์ "รับรู้แล้ว" (เช็คเอาท์) ให้ตรงกับทุกหน้า
  const today = todayLocal()
  const totalRevenue = sumRealizedRevenue(bookings, bookingAddOns)
  const todayRevenue = sumRealizedRevenue(bookings, bookingAddOns, (b) => b.checkOut.startsWith(today))
  const occupancyNow = sellableRooms > 0
    ? (rooms.filter((r) => r.status === 'occupied').length / sellableRooms) * 100
    : 0

  return (
    <div className="flex flex-col h-screen">
      <Header title="รายงาน & วิเคราะห์ข้อมูล" subtitle="สรุปยอด KPI และแนวโน้มธุรกิจ" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* KPI Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'รายได้สะสมทั้งหมด', value: formatCurrency(totalRevenue), icon: <DollarSign size={18} className="text-emerald-600" />, bg: 'bg-emerald-100' },
            { label: 'Occupancy ตอนนี้', value: `${occupancyNow.toFixed(1)}%`, icon: <BarChart2 size={18} className="text-blue-600" />, bg: 'bg-blue-100' },
            { label: 'รายได้วันนี้', value: formatCurrency(todayRevenue), icon: <TrendingUp size={18} className="text-amber-600" />, bg: 'bg-amber-100' },
            { label: 'สมาชิกทั้งหมด', value: `${guests.length} ราย`, icon: <Users size={18} className="text-purple-600" />, bg: 'bg-purple-100' },
          ].map(({ label, value, icon, bg }) => (
            <div key={label} className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-500">{label}</span>
                <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}>{icon}</div>
              </div>
              <div className="text-2xl font-bold text-slate-800">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Occupancy Trend */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Occupancy Rate (30 วันย้อนหลัง)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={occupancyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} formatter={(v) => [`${v}%`, 'Occupancy']} />
                <Area type="monotone" dataKey="occupancy" stroke="#3b82f6" strokeWidth={2} fill="url(#occGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue by Room Type */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">รายได้ตามประเภทห้อง</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenueByType} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="type" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'รายได้']} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="รายได้" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue by Channel */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">สัดส่วนการจองตามช่องทาง</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={sourceData} cx="50%" cy="50%" outerRadius={75} dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false} fontSize={10}>
                  {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Guests */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Top 5 แขก (ยอดรวมสูงสุด)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['อันดับ', 'ชื่อ', 'สัญชาติ', 'ครั้งที่พัก', 'ยอดรวม'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {topGuests.map((guest, i) => (
                  <tr key={guest.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-400 text-lg">#{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{guest.name}</td>
                    <td className="px-4 py-3 text-slate-500">{guest.nationality}</td>
                    <td className="px-4 py-3">{guest.totalStays} ครั้ง</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600">{formatCurrency(guest.totalSpend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
