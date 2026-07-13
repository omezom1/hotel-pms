'use client'
import { create } from 'zustand'
import type { Staff, StaffPermissions } from '@/types'
import { supabase } from './supabase'
import { rowToStaff } from './row-mappers'

export interface SessionUser {
  userId: string
  username: string
  staff: Staff
  loginAt: string
}

interface AuthStore {
  user: SessionUser | null
  authUserId: string | null   // auth.users.id ของ session ปัจจุบัน (trigger hydration ใน AppShell)
  hydrated: boolean           // auth ตรวจ session เสร็จแล้ว (getSession resolve)
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => Promise<void>
  hasPermission: (key: keyof StaffPermissions) => boolean
}

// map auth user (auth.users.id) → SessionUser (app users→staff→permissions).
// query ตรง (ไม่พึ่ง hotel store hydration) → ได้ session ก่อน/พร้อมกับข้อมูลก้อนใหญ่
// คืน false ถ้า: ไม่มี users row ผูก auth_id / ไม่มี staff / staff ถูกระงับ (→ caller signOut)
async function resolveSession(authUserId: string): Promise<SessionUser | null> {
  const { data: urow } = await supabase
    .from('users').select('*').eq('auth_id', authUserId).is('deleted_at', null).maybeSingle()
  if (!urow) return null
  const { data: srow } = await supabase
    .from('staff').select('*').eq('id', urow.staff_id).is('deleted_at', null).maybeSingle()
  if (!srow || srow.is_active !== true) return null
  // บันทึกเวลาเข้าใช้งานล่าสุด (best-effort dual-write; ไม่รอผล)
  void supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', urow.id)
  return {
    userId: String(urow.id),
    username: String(urow.username),
    staff: rowToStaff(srow),
    loginAt: new Date().toISOString(),
  }
}

function mapAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
  if (/email not confirmed/i.test(msg)) return 'บัญชีนี้ยังไม่ยืนยันอีเมล'
  return msg || 'เข้าสู่ระบบไม่สำเร็จ'
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  authUserId: null,
  hydrated: false,

  // เรียกครั้งเดียวตอน AppShell mount: กู้ session เดิม + subscribe การเปลี่ยนแปลง auth
  init: async () => {
    const { data } = await supabase.auth.getSession()
    const authUser = data.session?.user ?? null
    if (authUser) {
      const session = await resolveSession(authUser.id)
      if (session) set({ user: session, authUserId: authUser.id })
      else { await supabase.auth.signOut(); set({ user: null, authUserId: null }) }
    }
    set({ hydrated: true })

    // ฟังการเปลี่ยน auth (token refresh / signOut จากแท็บอื่น). login/logout ในแท็บนี้ set เองแล้ว
    supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null
      if (!uid) { set({ user: null, authUserId: null }); return }
      if (uid !== get().authUserId) {
        resolveSession(uid).then((s) => {
          if (s) set({ user: s, authUserId: uid })
        })
      }
    })
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password,
    })
    if (error || !data.user) return { ok: false, error: mapAuthError(error?.message ?? '') }
    const session = await resolveSession(data.user.id)
    if (!session) {
      await supabase.auth.signOut()
      return { ok: false, error: 'บัญชีนี้ไม่ได้ผูกกับพนักงาน หรือถูกระงับการใช้งาน' }
    }
    set({ user: session, authUserId: data.user.id })
    return { ok: true }
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, authUserId: null })
  },

  hasPermission: (key) => {
    const u = get().user
    if (!u) return false
    return u.staff.permissions[key] === true
  },
}))
