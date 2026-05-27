'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, CalendarDays, Users, DollarSign,
  Wrench, UserCog, BarChart3, BedDouble, Hotel, LogOut, Package, ConciergeBell, CalendarRange, ClipboardList, RotateCcw, History
} from 'lucide-react'
import { cn, getStaffRoleLabel } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'
import type { StaffPermissions } from '@/types'
import { toast } from 'sonner'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  permission: keyof StaffPermissions
}

const navItems: NavItem[] = [
  { href: '/dashboard',    label: 'แดชบอร์ด',                icon: LayoutDashboard, permission: 'canViewDashboard' },
  { href: '/front-desk',   label: 'เคาน์เตอร์หน้าบ้าน',     icon: ConciergeBell,   permission: 'canManageBookings' },
  { href: '/rooms',        label: 'จัดการห้องพัก',           icon: BedDouble,       permission: 'canManageRooms' },
  { href: '/bookings',     label: 'การจอง',                  icon: CalendarDays,    permission: 'canManageBookings' },
  { href: '/calendar',     label: 'ปฏิทินการจอง',           icon: CalendarRange,   permission: 'canManageBookings' },
  { href: '/guests',       label: 'ข้อมูลลูกค้า',            icon: Users,           permission: 'canManageGuests' },
  { href: '/finance',      label: 'การเงิน & การชำระเงิน',  icon: DollarSign,      permission: 'canViewFinance' },
  { href: '/housekeeping', label: 'แม่บ้าน',                 icon: Hotel,           permission: 'canManageHousekeeping' },
  { href: '/maintenance',  label: 'ซ่อมบำรุง',               icon: Wrench,          permission: 'canManageMaintenance' },
  { href: '/inventory',    label: 'คลังสินค้า',              icon: Package,         permission: 'canManageInventory' },
  { href: '/staff',        label: 'พนักงาน',                 icon: UserCog,         permission: 'canManageStaff' },

  { href: '/reports',      label: 'รายงาน & วิเคราะห์',     icon: BarChart3,       permission: 'canViewReports' },
  { href: '/daily-report', label: 'รายงานประจำวัน',         icon: ClipboardList,   permission: 'canViewReports' },
  { href: '/audit-log',    label: 'บันทึกการใช้งาน',         icon: History,         permission: 'canManageStaff' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()

  if (!user) return null

  const visibleItems = navItems.filter((item) => user.staff.permissions[item.permission])

  function handleLogout() {
    logout()
    router.replace('/login')
  }

  function handleReset() {
    if (!confirm('ล้างข้อมูลทั้งหมดและโหลดข้อมูลตัวอย่างใหม่?\n(การกระทำนี้ย้อนกลับไม่ได้)')) return
    localStorage.removeItem('hotel-pms-storage')
    toast.success('ล้างข้อมูลแล้ว กำลังโหลดใหม่...')
    setTimeout(() => window.location.reload(), 500)
  }

  const initial = user.staff.name.charAt(0).toUpperCase()

  return (
    <aside className="group fixed left-0 top-0 h-screen w-16 lg:w-60 hover:w-60 bg-slate-900 text-white flex flex-col z-30 transition-[width] duration-200">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-700">
        <img src="/logo.png" alt="logo" className="w-10 h-10 object-contain rounded-lg shrink-0" />
        <div className="min-w-0 hidden group-hover:block lg:block">
          <div className="font-semibold text-sm leading-tight truncate">Pruksatara Park & Resort</div>
          <div className="text-xs text-slate-400">ระบบจัดการโรงแรม</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-3 space-y-0.5">
        {visibleItems.length === 0 && (
          <div className="px-3 py-4 text-xs text-slate-400 leading-relaxed hidden group-hover:block lg:block">
            บัญชีของคุณยังไม่มีสิทธิ์เข้าถึงเมนูใด ติดต่อผู้ดูแลระบบ
          </div>
        )}
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-amber-500 text-slate-900'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon size={17} className="shrink-0" />
              <span className="hidden group-hover:inline lg:inline whitespace-nowrap">{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-3 border-t border-slate-700">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-slate-900 font-bold text-sm shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1 hidden group-hover:block lg:block">
            <div className="text-sm font-medium truncate">{user.staff.name}</div>
            <div className="text-xs text-slate-400 truncate">{getStaffRoleLabel(user.staff.role)}</div>
          </div>
        </div>
        {user.staff.permissions.canManageStaff && (
          <button
            onClick={handleReset}
            className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-amber-300 transition-colors"
            title="ล้างข้อมูล localStorage แล้วโหลด mock data ใหม่"
          >
            <RotateCcw size={14} className="shrink-0" />
            <span className="hidden group-hover:inline lg:inline whitespace-nowrap">รีเซ็ตข้อมูลตัวอย่าง</span>
          </button>
        )}
        <button
          onClick={handleLogout}
          className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-red-500/20 hover:text-red-300 transition-colors"
          title="ออกจากระบบ"
        >
          <LogOut size={16} className="shrink-0" />
          <span className="hidden group-hover:inline lg:inline whitespace-nowrap">ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  )
}
