'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { getRoomTypeLabel, toLocalDateKey, getGuestDisplayName, bookingActiveOnDay } from '@/lib/utils'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'

const statusBg: Record<string, string> = {
  confirmed: 'bg-blue-500',
  checked_in: 'bg-emerald-500',
  pending: 'bg-amber-400',
}

export default function CalendarPage() {
  const { rooms, bookings, guests } = useHotelStore()
  const [anchor, setAnchor] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [daysToShow, setDaysToShow] = useState(14)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayKey = toLocalDateKey(today)

  const days = Array.from({ length: daysToShow }, (_, i) => {
    const d = new Date(anchor)
    d.setDate(d.getDate() + i)
    return d
  })

  const sortedRooms = [...rooms].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))

  function bookingOnDay(roomId: string, dayDate: Date) {
    const key = toLocalDateKey(dayDate)
    return bookings.find((b) => b.roomId === roomId && bookingActiveOnDay(b, key)) ?? null
  }

  function shift(days: number) {
    const d = new Date(anchor)
    d.setDate(d.getDate() + days)
    setAnchor(d)
  }

  return (
    <div className="flex flex-col h-screen">
      <Header title="ปฏิทินการจอง" subtitle="ภาพรวมห้องและการจองตามวัน" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg">
            <button onClick={() => shift(-7)} className="p-2 hover:bg-slate-50 rounded-l-lg"><ChevronLeft size={16} /></button>
            <button onClick={() => setAnchor(today)} className="px-3 py-1.5 text-sm hover:bg-slate-50 border-x border-slate-200">วันนี้</button>
            <button onClick={() => shift(7)} className="p-2 hover:bg-slate-50 rounded-r-lg"><ChevronRight size={16} /></button>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <CalendarDays size={15} className="text-slate-400" />
            {format(anchor, 'd MMM yyyy', { locale: th })} – {format(days[days.length - 1], 'd MMM yyyy', { locale: th })}
          </div>
          <select
            value={daysToShow}
            onChange={(e) => setDaysToShow(+e.target.value)}
            className="ml-auto px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value={7}>7 วัน</option>
            <option value={14}>14 วัน</option>
            <option value={30}>30 วัน</option>
          </select>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" />กำลังเข้าพัก</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500" />ยืนยันแล้ว</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400" />รอยืนยัน</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500" />ปิดปรับปรุง</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-100 border border-slate-300" />ว่าง</span>
        </div>

        {/* Calendar grid */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Header row */}
            <div className="flex sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <div className="w-20 shrink-0 px-3 py-2 text-xs font-semibold text-slate-500 border-r border-slate-200">ห้อง</div>
              {days.map((d, i) => {
                const key = toLocalDateKey(d)
                const isToday = key === todayKey
                const isWeekend = d.getDay() === 0 || d.getDay() === 6
                return (
                  <div
                    key={i}
                    className={`w-12 shrink-0 px-1 py-2 text-center border-r border-slate-100 ${isToday ? 'bg-amber-100 dark:bg-amber-500/25' : isWeekend ? 'bg-slate-50' : ''}`}
                  >
                    <div className={`text-[10px] ${isToday ? 'text-amber-700 dark:text-amber-300 font-bold' : 'text-slate-400'}`}>
                      {format(d, 'EEE', { locale: th })}
                    </div>
                    <div className={`text-sm font-medium ${isToday ? 'text-amber-700 dark:text-amber-300' : 'text-slate-700'}`}>
                      {d.getDate()}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Room rows */}
            {sortedRooms.map((room) => (
              <div key={room.id} className="flex border-b border-slate-100 hover:bg-slate-50/50">
                <div className="w-20 shrink-0 px-3 py-3 border-r border-slate-200">
                  <div className="font-semibold text-sm text-slate-800">{room.number}</div>
                  <div className="text-[10px] text-slate-400">{getRoomTypeLabel(room.type)}</div>
                </div>
                {days.map((d, i) => {
                  const key = toLocalDateKey(d)
                  const isToday = key === todayKey
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6

                  if (room.status === 'maintenance') {
                    return (
                      <div key={i} className="w-12 shrink-0 border-r border-slate-100 p-1">
                        <div className="h-full rounded bg-red-500 opacity-50" title="ปิดปรับปรุง" />
                      </div>
                    )
                  }

                  const booking = bookingOnDay(room.id, d)
                  const cellBg = isToday ? 'bg-amber-50 dark:bg-amber-500/15' : isWeekend ? 'bg-slate-50/40 dark:bg-slate-700/25' : ''

                  if (!booking) {
                    // คลิกช่องว่าง = สร้างจองห้องนี้วันนี้ (prefill ที่หน้า /bookings)
                    return (
                      <Link
                        key={i}
                        href={`/bookings?roomId=${room.id}&date=${key}`}
                        title={`สร้างการจอง ห้อง ${room.number} · ${key}`}
                        className={`w-12 shrink-0 border-r border-slate-100 hover:bg-amber-100/60 transition-colors ${cellBg}`}
                      />
                    )
                  }

                  const guestName = getGuestDisplayName(booking, guests)
                  const isStart = booking.checkIn.split('T')[0] === key
                  const isEnd = (() => {
                    const next = new Date(d)
                    next.setDate(next.getDate() + 1)
                    return booking.checkOut.split('T')[0] === toLocalDateKey(next)
                  })()

                  return (
                    <Link
                      key={i}
                      href={`/bookings/${booking.id}`}
                      title={`${guestName} · ${booking.nights} คืน`}
                      className={`w-12 shrink-0 border-r border-slate-100 p-0.5 ${cellBg}`}
                    >
                      <div
                        className={`h-7 text-white text-[10px] font-medium flex items-center justify-center px-1 truncate ${statusBg[booking.status]} ${isStart ? 'rounded-l' : ''} ${isEnd ? 'rounded-r' : ''} hover:opacity-80 transition-opacity`}
                      >
                        {isStart ? (guestName.split(' ')[0] || '–') : ''}
                      </div>
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
