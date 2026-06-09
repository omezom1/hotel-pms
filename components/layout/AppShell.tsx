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
import type { AuditLog, Expense } from '@/types'
import { toast } from 'sonner'

const STORE_KEY = 'hotel-pms-storage'

// แปลงแถว audit_logs (snake_case จาก Supabase) → AuditLog (camelCase)
function rowToAuditLog(r: Record<string, unknown>): AuditLog {
  return {
    id: String(r.id),
    timestamp: String(r.timestamp),
    staffId: String(r.staff_id ?? ''),
    staffName: String(r.staff_name ?? ''),
    category: r.category as AuditLog['category'],
    action: String(r.action ?? ''),
    summary: String(r.summary ?? ''),
    entityId: r.entity_id != null ? String(r.entity_id) : undefined,
  }
}

// แปลงแถว expenses (snake_case จาก Supabase) → Expense (camelCase)
function rowToExpense(r: Record<string, unknown>): Expense {
  return {
    id: String(r.id),
    date: String(r.date),
    category: r.category as Expense['category'],
    description: String(r.description ?? ''),
    payee: r.payee != null ? String(r.payee) : undefined,
    amount: Number(r.amount ?? 0),
    note: r.note != null ? String(r.note) : undefined,
    receiptPath: r.receipt_path != null ? String(r.receipt_path) : undefined,
    createdAt: String(r.created_at ?? r.date),
  }
}

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
          // auditLogs/expenses ย้ายไปตารางจริงแล้ว — strip ออกจาก full-state sync ของ blob
          // (ไม่งั้นจะมาทับ/ชุบชีวิตสิ่งที่ per-table sync เพิ่ง apply → 2 แท็บไม่ตรงกัน)
          const { auditLogs: _migratedAudit, expenses: _migratedExpenses, ...rest } = incoming
          // apply แบบไม่เขียนกลับ cloud (กัน ping-pong loop)
          applyRemoteState(() => useHotelStore.setState(rest as never))
        }
      )
      .subscribe()

    // ── audit_logs relational sync (Phase 1, strangler) ─────────────────────
    // entity แรกที่ย้ายจาก blob → ตารางจริง. ลำดับ: subscribe → buffer → seed
    // (event ที่เข้ามาระหว่าง boot ถูก buffer ไว้ ไม่ตกหล่น) + merge แบบ dedup-by-id
    let auditLive = false
    const auditBuffer: AuditLog[] = []

    // รวม entry ใหม่เข้ากับ auditLogs เดิมแบบ dedup ตาม id → sort เวลาใหม่→เก่า → cap 500
    // (entry เดียวกันมาได้ทั้งจาก optimistic set, realtime echo, และ seed → กันนับซ้ำ)
    const upsertAuditLogs = (incoming: AuditLog[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map<string, AuditLog>()
          for (const e of [...incoming, ...s.auditLogs]) {
            if (!byId.has(e.id)) byId.set(e.id, e)
          }
          const merged = Array.from(byId.values())
            .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
            .slice(0, 500)
          return { auditLogs: merged }
        })
      )
    }

    const auditChannel = supabase
      .channel('audit_logs-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null
          if (!row) return
          // ข้าม echo ของแท็บนี้เอง (เขียนเองมีใน state แล้วผ่าน optimistic set)
          if (row.writer_id === CLIENT_ID) return
          const entry = rowToAuditLog(row)
          if (!auditLive) {
            auditBuffer.push(entry) // ยัง seed ไม่เสร็จ → พักไว้ก่อน
            return
          }
          upsertAuditLogs([entry])
        }
      )
      .subscribe()

    // ── expenses relational sync (Tier A, strangler — entity แรกที่ mutable) ──
    // ต่างจาก audit (append-only): มี UPDATE/DELETE → ฟัง event '*' + ใช้ soft-delete
    // (deleted_at != null = ลบ → เอาออกจาก state; อื่น ๆ = upsert by id)
    let expensesLive = false
    type ExpenseEvent = { id: string; deleted: boolean; expense: Expense }
    const expensesBuffer: ExpenseEvent[] = []

    // apply ชุด event ทับ state.expenses เดิม (upsert/remove by id) → sort ใหม่→เก่า
    const applyExpenseEvents = (events: ExpenseEvent[]) => {
      applyRemoteState(() =>
        useHotelStore.setState((s) => {
          const byId = new Map(s.expenses.map((e) => [e.id, e]))
          for (const ev of events) {
            if (ev.deleted) byId.delete(ev.id)
            else byId.set(ev.id, ev.expense)
          }
          const merged = Array.from(byId.values()).sort((a, b) =>
            a.createdAt < b.createdAt ? 1 : -1
          )
          return { expenses: merged }
        })
      )
    }

    const expensesChannel = supabase
      .channel('expenses-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses' },
        (payload) => {
          // soft-delete = UPDATE(deleted_at); hard DELETE (เผื่อไว้) ใช้ payload.old
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null
          if (!row) return
          if (row.writer_id === CLIENT_ID) return // echo ของแท็บนี้เอง
          const ev: ExpenseEvent = {
            id: String(row.id),
            deleted: payload.eventType === 'DELETE' || row.deleted_at != null,
            expense: rowToExpense(row),
          }
          if (!expensesLive) {
            expensesBuffer.push(ev) // ยัง seed ไม่เสร็จ → พักไว้ก่อน
            return
          }
          applyExpenseEvents([ev])
        }
      )
      .subscribe()

    // rehydrate blob ให้เสร็จก่อน แล้วค่อย seed audit + expenses จากตาราง
    // (กัน rehydrate.merge เขียนทับสิ่งที่ seed มา — blob ยังพก slice เหล่านี้อยู่ช่วง dual-write)
    Promise.resolve(useHotelStore.persist.rehydrate()).then(async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) {
        console.error('[audit-sync] seed:', error.message)
      } else {
        const snapshot = (data ?? []).map(rowToAuditLog)
        upsertAuditLogs([...snapshot, ...auditBuffer])
      }
      auditBuffer.length = 0
      auditLive = true

      // seed expenses (กรอง soft-deleted); ถ้าตารางว่างแต่ blob มีของ → backfill ครั้งเดียว
      const { data: expData, error: expErr } = await supabase
        .from('expenses')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (expErr) {
        console.error('[expenses-sync] seed:', expErr.message)
      } else {
        let rows = expData ?? []
        // backfill: ตาราง expenses (สร้างใน 005) ว่าง แต่ของจริงยังอยู่ใน blob →
        // ยกขึ้นตารางครั้งเดียว (idempotent ด้วย upsert onConflict id) ก่อนถอด blob (step 3)
        const local = useHotelStore.getState().expenses
        if (rows.length === 0 && local.length > 0) {
          const { error: bfErr } = await supabase.from('expenses').upsert(
            local.map((e) => ({
              id: e.id, date: e.date, category: e.category, description: e.description,
              payee: e.payee ?? null, amount: e.amount, note: e.note ?? null,
              receipt_path: e.receiptPath ?? null, writer_id: CLIENT_ID,
            })),
            { onConflict: 'id' }
          )
          if (bfErr) console.error('[expenses-sync] backfill:', bfErr.message)
          else {
            const re = await supabase
              .from('expenses').select('*').is('deleted_at', null)
              .order('created_at', { ascending: false })
            rows = re.data ?? rows
          }
        }
        const snapshot = rows.map(rowToExpense)
        // seed = authoritative: แทนที่ทั้ง slice ด้วย snapshot จากตาราง (ไม่ merge ทับ initial/mock)
        // ไม่งั้น mock row ที่ user เคยลบ (ไม่มีในตาราง) จะโผล่กลับมา — ตารางเป็นแหล่งจริงคนเดียว
        applyRemoteState(() => useHotelStore.setState({ expenses: snapshot }))
        // event ที่ buffer ไว้ระหว่าง boot (แท็บอื่นแก้) apply ทับ snapshot
        if (expensesBuffer.length) applyExpenseEvents(expensesBuffer)
      }
      expensesBuffer.length = 0
      expensesLive = true
    })

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(auditChannel)
      supabase.removeChannel(expensesChannel)
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
