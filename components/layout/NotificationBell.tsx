'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Bell, LogIn, LogOut, PackageX, Wrench, Sparkles, type LucideIcon } from 'lucide-react'
import { useHotelStore } from '@/lib/store'
import { todayLocal, calendarDay } from '@/lib/utils'

interface NotifGroup {
  key: string
  icon: LucideIcon
  label: string
  count: number
  href: string
  tone: string // tailwind text/bg color for the icon chip
}

export default function NotificationBell() {
  const { bookings, inventoryItems, maintenanceLogs, housekeepingTasks } = useHotelStore()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // ปิดเมื่อคลิกนอกกล่อง หรือกด Esc
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const today = todayLocal()

  // เช็คอินที่ยืนยันแล้วและถึง/เลยกำหนดเข้าพัก แต่ยังไม่เช็คอิน
  const pendingCheckIns = bookings.filter((b) => b.status === 'confirmed' && calendarDay(b.checkIn) <= today).length
  // เช็คเอาต์: แขกที่เช็คอินอยู่และถึง/เลยกำหนดออกแล้ว
  const dueCheckOuts = bookings.filter((b) => b.status === 'checked_in' && calendarDay(b.checkOut) <= today).length
  // สต็อกต่ำ/หมด (ถึงหรือต่ำกว่าขั้นต่ำ)
  const lowStock = inventoryItems.filter((i) => i.currentStock <= i.minStock).length
  // งานซ่อมที่ยังไม่ปิด
  const openMaint = maintenanceLogs.filter((m) => m.status !== 'resolved').length
  // งานแม่บ้านที่ยังไม่เริ่ม
  const pendingHk = housekeepingTasks.filter((t) => t.status === 'pending').length

  const groups: NotifGroup[] = [
    { key: 'checkin', icon: LogIn, label: 'รอเช็คอินวันนี้', count: pendingCheckIns, href: '/front-desk', tone: 'bg-purple-100 text-purple-600' },
    { key: 'checkout', icon: LogOut, label: 'ครบกำหนดเช็คเอาต์', count: dueCheckOuts, href: '/front-desk', tone: 'bg-blue-100 text-blue-600' },
    { key: 'stock', icon: PackageX, label: 'สต็อกต่ำ/ใกล้หมด', count: lowStock, href: '/inventory', tone: 'bg-amber-100 text-amber-600' },
    { key: 'maint', icon: Wrench, label: 'งานซ่อมค้าง', count: openMaint, href: '/maintenance', tone: 'bg-red-100 text-red-600' },
    { key: 'hk', icon: Sparkles, label: 'งานแม่บ้านค้าง', count: pendingHk, href: '/housekeeping', tone: 'bg-emerald-100 text-emerald-600' },
  ].filter((g) => g.count > 0)

  const total = groups.reduce((s, g) => s + g.count, 0)

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`การแจ้งเตือน${total > 0 ? ` (${total} รายการ)` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
      >
        <Bell size={20} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="font-semibold text-slate-800 text-sm">การแจ้งเตือน</span>
            {total > 0 && <span className="text-xs text-slate-400">{total} รายการที่ต้องดำเนินการ</span>}
          </div>

          {groups.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              ไม่มีการแจ้งเตือน — ทุกอย่างเรียบร้อยดี 🎉
            </div>
          ) : (
            <ul className="py-1 max-h-80 overflow-y-auto">
              {groups.map((g) => {
                const Icon = g.icon
                return (
                  <li key={g.key}>
                    <Link
                      href={g.href}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${g.tone}`}>
                        <Icon size={16} />
                      </div>
                      <span className="flex-1 text-sm text-slate-700">{g.label}</span>
                      <span className="text-sm font-semibold text-slate-800 tabular-nums">{g.count}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
