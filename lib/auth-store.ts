'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Staff, StaffPermissions } from '@/types'
import { useHotelStore } from './store'

export interface SessionUser {
  userId: string
  username: string
  staff: Staff
  loginAt: string
}

interface AuthStore {
  user: SessionUser | null
  hydrated: boolean
  setHydrated: () => void
  login: (username: string, password: string) => { ok: true } | { ok: false; error: string }
  logout: () => void
  hasPermission: (key: keyof StaffPermissions) => boolean
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),

      login: (username, password) => {
        // บัญชีผู้ใช้ + พนักงาน อยู่บน cloud (hotel store) — ตรวจกับชุดนั้น
        // หมายเหตุ: AppShell/หน้า login รอ hotel store hydrate ก่อนเปิดให้กดเข้าสู่ระบบ
        const { users, staff: staffList } = useHotelStore.getState()
        const u = users.find(
          (m) => m.username.toLowerCase() === username.trim().toLowerCase()
        )
        if (!u) return { ok: false, error: 'ไม่พบชื่อผู้ใช้นี้ในระบบ' }
        if (u.password !== password) return { ok: false, error: 'รหัสผ่านไม่ถูกต้อง' }

        const staff = staffList.find((s) => s.id === u.staffId)
        if (!staff) return { ok: false, error: 'ไม่พบข้อมูลพนักงานที่เชื่อมโยง' }
        if (!staff.isActive) return { ok: false, error: 'บัญชีนี้ถูกระงับการใช้งาน' }

        set({
          user: {
            userId: u.id,
            username: u.username,
            staff,
            loginAt: new Date().toISOString(),
          },
        })
        // บันทึกเวลาเข้าใช้งานล่าสุดกลับขึ้น cloud (sync ทุกเครื่อง)
        useHotelStore.getState().recordLogin(u.id)
        return { ok: true }
      },

      logout: () => set({ user: null }),

      hasPermission: (key) => {
        const u = get().user
        if (!u) return false
        return u.staff.permissions[key] === true
      },
    }),
    {
      name: 'hotel-pms-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated()
      },
    }
  )
)
