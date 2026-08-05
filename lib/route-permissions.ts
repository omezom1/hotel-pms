import type { StaffPermissions } from '@/types'

// แผนที่ route → permission ที่ต้องมีถึงจะเข้าถึงได้
// ใช้ทั้งใน Sidebar (กรองเมนู) และ AppShell (block typed URL)
export const routePermissions: Array<{ href: string; permission: keyof StaffPermissions }> = [
  { href: '/dashboard',    permission: 'canViewDashboard' },
  { href: '/front-desk',   permission: 'canManageBookings' },
  { href: '/rooms',        permission: 'canManageRooms' },
  { href: '/bookings',     permission: 'canManageBookings' },
  { href: '/calendar',     permission: 'canManageBookings' },
  { href: '/guests',       permission: 'canManageGuests' },
  { href: '/finance',      permission: 'canViewFinance' },
  { href: '/expenses',     permission: 'canViewFinance' },
  { href: '/housekeeping', permission: 'canManageHousekeeping' },
  { href: '/maintenance',  permission: 'canManageMaintenance' },
  { href: '/inventory',    permission: 'canManageInventory' },
  { href: '/staff',        permission: 'canManageStaff' },
  { href: '/reports',      permission: 'canViewReports' },
  { href: '/daily-report', permission: 'canViewReports' },
  { href: '/invoice',      permission: 'canViewFinance' },
  { href: '/audit-log',    permission: 'canManageStaff' },
  { href: '/backup',       permission: 'canManageStaff' },
]

// คืน permission ที่ pathname นี้ต้องมี (longest prefix match)
export function getRequiredPermission(pathname: string): keyof StaffPermissions | null {
  const sorted = [...routePermissions].sort((a, b) => b.href.length - a.href.length)
  for (const item of sorted) {
    if (pathname === item.href || pathname.startsWith(item.href + '/')) return item.permission
  }
  return null
}
