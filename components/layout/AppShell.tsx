'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import GlobalSearch from '@/components/GlobalSearch'
import { useAuthStore } from '@/lib/auth-store'
import { useHotelStore } from '@/lib/store'
import { getRequiredPermission } from '@/lib/route-permissions'
import { toast } from 'sonner'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, hydrated } = useAuthStore()
  // hotel store ใช้ Supabase storage (async) + skipHydration → ต้องสั่ง rehydrate เอง
  const hotelHydrated = useHotelStore((s) => s._hasHydrated)

  const isAuthRoute = pathname?.startsWith('/login')

  // โหลด state ก้อนใหญ่จาก Supabase ครั้งเดียวตอน mount (กัน mock state เขียนทับ cloud)
  useEffect(() => {
    useHotelStore.persist.rehydrate()
  }, [])

  // AuthGuard: redirect ไป /login ถ้ายังไม่ login
  useEffect(() => {
    if (!hydrated) return
    if (!user && !isAuthRoute) {
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : ''
      router.replace(`/login${next}`)
    }
  }, [hydrated, user, isAuthRoute, pathname, router])

  // PermissionGuard: ถ้า user ไม่มีสิทธิ์เข้าหน้านี้ → ส่งกลับ dashboard
  useEffect(() => {
    if (!hydrated || !user || isAuthRoute || !pathname) return
    const required = getRequiredPermission(pathname)
    if (required && !user.staff.permissions[required]) {
      toast.error('คุณไม่มีสิทธิ์เข้าถึงหน้านี้')
      router.replace('/dashboard')
    }
  }, [hydrated, user, pathname, isAuthRoute, router])

  // หน้า login: render เต็มจอ ไม่มี sidebar
  if (isAuthRoute) {
    return <>{children}</>
  }

  // ระหว่างรอ hydrate: auth (localStorage) + ข้อมูลโรงแรม (Supabase, async)
  // ต้องรอ cloud ให้เสร็จก่อน ไม่งั้น component จะเห็น mock state แล้ว action จะเขียนทับ cloud
  if (!hydrated || !hotelHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 text-sm">กำลังโหลดข้อมูลจากคลาวด์…</div>
      </div>
    )
  }

  // ยังไม่ login — แสดง loading ระหว่าง redirect
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 text-sm">กำลังนำทางไปหน้าเข้าสู่ระบบ…</div>
      </div>
    )
  }

  // login แล้ว — แสดง layout ปกติ
  return (
    <>
      <Sidebar />
      <main className="ml-16 lg:ml-60 min-h-screen">{children}</main>
      <GlobalSearch />
    </>
  )
}
