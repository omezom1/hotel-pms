'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useHotelStore } from '@/lib/store'
import { Search, BedDouble, User, CalendarDays, X } from 'lucide-react'
import { formatDate, getRoomTypeLabel, getBookingStatusLabel } from '@/lib/utils'

type Result =
  | { type: 'guest'; id: string; title: string; subtitle: string; href: string }
  | { type: 'room'; id: string; title: string; subtitle: string; href: string }
  | { type: 'booking'; id: string; title: string; subtitle: string; href: string }

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const router = useRouter()
  const { guests, rooms, bookings } = useHotelStore()

  // เปิด/ปิดด้วย Ctrl+K หรือ Cmd+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
    }
  }, [open])

  const results = useMemo<Result[]>(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const out: Result[] = []

    for (const g of guests) {
      if (
        g.name.toLowerCase().includes(q) ||
        g.email.toLowerCase().includes(q) ||
        g.phone.includes(q)
      ) {
        out.push({
          type: 'guest', id: g.id,
          title: g.name,
          subtitle: `${g.phone} · ${g.email || g.nationality}`,
          href: `/guests/${g.id}`,
        })
      }
    }

    for (const r of rooms) {
      if (r.number.toLowerCase().includes(q) || r.type.toLowerCase().includes(q)) {
        // ถ้าห้องมี currentBookingId → ลิงก์ไป booking detail (เห็นข้อมูลแขกที่พัก)
        // ไม่มี → ไปหน้า /rooms (จัดการห้องพัก)
        const href = r.currentBookingId ? `/bookings/${r.currentBookingId}` : '/rooms'
        out.push({
          type: 'room', id: r.id,
          title: `ห้อง ${r.number}`,
          subtitle: `${getRoomTypeLabel(r.type)} · ชั้น ${r.floor}${r.currentBookingId ? ' · มีแขกพัก' : ''}`,
          href,
        })
      }
    }

    for (const b of bookings) {
      const guest = guests.find((g) => g.id === b.guestId)
      const room = rooms.find((r) => r.id === b.roomId)
      const matchId = b.id.toLowerCase().includes(q)
      const matchGuest = guest?.name.toLowerCase().includes(q)
      const matchRoom = room?.number.toLowerCase().includes(q)
      if (matchId || matchGuest || matchRoom) {
        out.push({
          type: 'booking', id: b.id,
          title: `${b.id} · ${guest?.name ?? 'ไม่ระบุ'}`,
          subtitle: `ห้อง ${room?.number ?? '-'} · ${formatDate(b.checkIn)} → ${formatDate(b.checkOut)} · ${getBookingStatusLabel(b.status)}`,
          href: `/bookings/${b.id}`,
        })
      }
    }

    return out.slice(0, 20)
  }, [query, guests, rooms, bookings])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const r = results[activeIdx]
      if (r) go(r.href)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-24 px-4" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Search size={18} className="text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
            onKeyDown={onInputKey}
            placeholder="ค้นหาแขก, ห้อง, หรือการจอง..."
            className="flex-1 text-sm outline-none placeholder:text-slate-400"
          />
          <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-slate-100">
            <X size={15} className="text-slate-500" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {!query.trim() ? (
            <div className="p-8 text-center text-sm text-slate-400">
              <Search size={28} className="mx-auto mb-2 text-slate-300" />
              พิมพ์เพื่อค้นหาแขก, ห้อง, หรือการจอง
              <div className="mt-3 text-xs text-slate-400">
                <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px]">↑↓</kbd> เลื่อน{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px]">↵</kbd> เปิด{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px]">Esc</kbd> ปิด
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">ไม่พบผลการค้นหา</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {results.map((r, i) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => go(r.href)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-colors ${i === activeIdx ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    r.type === 'guest' ? 'bg-blue-100 text-blue-600' :
                    r.type === 'room' ? 'bg-emerald-100 text-emerald-600' :
                    'bg-amber-100 text-amber-600'
                  }`}>
                    {r.type === 'guest' ? <User size={14} /> : r.type === 'room' ? <BedDouble size={14} /> : <CalendarDays size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-800 truncate">{r.title}</div>
                    <div className="text-xs text-slate-500 truncate">{r.subtitle}</div>
                  </div>
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">{r.type}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
