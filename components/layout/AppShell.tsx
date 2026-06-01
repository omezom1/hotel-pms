'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import GlobalSearch from '@/components/GlobalSearch'
import { useAuthStore } from '@/lib/auth-store'
import { useHotelStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { CLIENT_ID, applyRemoteState, setLastSeenVersion, registerSaveErrorHandler } from '@/lib/supabase-storage'
import { getRequiredPermission } from '@/lib/route-permissions'
import { toast } from 'sonner'

const STORE_KEY = 'hotel-pms-storage'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, hydrated } = useAuthStore()
  // hotel store ใช้ Supabase storage (async) + skipHydration → ต้องสั่ง rehydrate เอง
  const hotelHydrated = useHotelStore((s) => s._hasHydrated)
  const [loadTimedOut, setLoadTimedOut] = useState(false)

  const isAuthRoute = pathname?.startsWith('/login')

  // โหลด state ก้อนใหญ่จาก Supabase ครั้งเดียวตอน mount (กัน mock state เขียนทับ cloud)
  // แล้ว subscribe Realtime: ถ้าแท็บ/เครื่องอื่นเขียนข้อมูล ให้ดึงมา sync ทันที
  // (ลดความเสี่ยง last-write-wins ที่งานของกันและกันหายเมื่อเปิดหลายที่พร้อมกัน)
  useEffect(() => {
    useHotelStore.persist.rehydrate()

    // เขียนขึ้น cloud ไม่สำเร็จ → เตือนผู้ใช้ (ไม่งั้นงานหายเงียบ ๆ)
    registerSaveErrorHandler((msg) =>
      toast.error('บันทึกขึ้นคลาวด์ไม่สำเร็จ', {
        description: `${msg} — ข้อมูลล่าสุดอาจยังไม่ถูกบันทึก ลองทำรายการอีกครั้ง`,
        duration: 7000,
      })
    )

    const channel = supabase
      .channel('app_state-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_state', filter: `id=eq.${STORE_KEY}` },
        (payload) => {
          const row = payload.new as { data?: Record<string, unknown>; version?: number } | null
          // อัปเดตเลข version ที่จำไว้เสมอ (รวม echo ของเราเอง) เพื่อให้ CAS ครั้งหน้าใช้ฐานล่าสุด
          if (typeof row?.version === 'number') setLastSeenVersion(row.version)
          const data = row?.data
          // ข้าม event ที่เกิดจากการเขียนของแท็บนี้เอง (echo)
          if (!data || data._writer === CLIENT_ID) return
          const { _writer, ...envelope } = data
          const incoming = (envelope as { state?: Record<string, unknown> }).state
          if (!incoming) return
          // apply แบบไม่เขียนกลับ cloud (กัน ping-pong loop)
          applyRemoteState(() => useHotelStore.setState(incoming as never))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // ถ้าโหลดข้อมูลคลาวด์นานผิดปกติ (เน็ตหลุด/Supabase ล่ม) → แสดงปุ่มลองใหม่ ไม่ค้างถาวร
  useEffect(() => {
    if (hotelHydrated) { setLoadTimedOut(false); return }
    const t = setTimeout(() => setLoadTimedOut(true), 12000)
    return () => clearTimeout(t)
  }, [hotelHydrated])

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50">
        <div className="text-slate-500 text-sm">กำลังโหลดข้อมูลจากคลาวด์…</div>
        {loadTimedOut && (
          <div className="text-center">
            <div className="text-xs text-slate-400 mb-2">ใช้เวลานานผิดปกติ — อาจเชื่อมต่อคลาวด์ไม่ได้</div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-medium rounded-lg"
            >
              ลองใหม่
            </button>
          </div>
        )}
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
