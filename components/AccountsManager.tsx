'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth-store'
import { supabase } from '@/lib/supabase'
import { rowToUser } from '@/lib/row-mappers'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { useConfirm } from '@/components/ConfirmProvider'
import { formatDateTime } from '@/lib/utils'
import { KeyRound, Trash2, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { User } from '@/types'

// จัดการบัญชีล็อกอิน (Supabase Auth) — งานสร้าง/ตั้งรหัสใหม่/ลบ ต้องใช้ service_role
// จึงยิงผ่าน /api/accounts (server) พร้อม access token ของผู้ใช้ปัจจุบันให้ฝั่ง server ตรวจสิทธิ์ซ้ำ
async function callAccountsApi(payload: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, error: 'เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่' }
  try {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: String(json.error ?? 'ทำรายการไม่สำเร็จ') }
    return { ok: true }
  } catch {
    return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ' }
  }
}

export default function AccountsManager() {
  const { users, staff } = useHotelStore()
  const currentUserId = useAuthStore((s) => s.user?.userId)
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ staffId: '', username: '', password: '' })
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const addTrapRef = useFocusTrap<HTMLDivElement>(addOpen, () => setAddOpen(false))
  const resetTrapRef = useFocusTrap<HTMLDivElement>(!!resetTarget, () => setResetTarget(null))

  const staffName = (staffId: string) => staff.find((s) => s.id === staffId)?.name ?? '(ไม่พบพนักงาน)'
  // พนักงานที่ยังไม่มีบัญชีล็อกอิน = ตัวเลือกตอนสร้างบัญชีใหม่ (1 คน 1 บัญชี)
  const staffWithoutAccount = staff.filter((s) => s.isActive && !users.some((u) => u.staffId === s.id))

  // ดึงรายการบัญชีจากตารางมาทับ state — ปกติ realtime ส่งมาให้อยู่แล้ว แต่การเขียนจากฝั่ง server
  // ไม่มี writer_id ให้ยึด จึง refresh ตรง ๆ กันกรณี event มาช้า/หลุด
  async function refreshUsers() {
    const { data } = await supabase.from('users').select('*').is('deleted_at', null)
    if (data) useHotelStore.setState({ users: data.map(rowToUser) })
  }

  async function submitAdd() {
    setBusy(true)
    const res = await callAccountsApi({
      action: 'create',
      staffId: addForm.staffId,
      username: addForm.username.trim().toLowerCase(),
      password: addForm.password,
    })
    setBusy(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(`สร้างบัญชี "${addForm.username.trim().toLowerCase()}" แล้ว`)
    setAddOpen(false)
    setAddForm({ staffId: '', username: '', password: '' })
    void refreshUsers()
  }

  async function submitReset() {
    if (!resetTarget) return
    setBusy(true)
    const res = await callAccountsApi({ action: 'reset-password', userId: resetTarget.id, password: newPassword })
    setBusy(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(`ตั้งรหัสผ่านใหม่ให้ "${resetTarget.username}" แล้ว — แจ้งรหัสให้พนักงานแล้วให้เปลี่ยนเองภายหลัง`)
    setResetTarget(null)
    setNewPassword('')
  }

  async function removeAccount(u: User) {
    if (!(await confirm({
      title: `ลบบัญชี "${u.username}"?`,
      message: `${staffName(u.staffId)} จะเข้าสู่ระบบไม่ได้อีก (ข้อมูลพนักงานและประวัติการทำงานยังอยู่ครบ)`,
      danger: true, confirmText: 'ลบบัญชี',
    }))) return
    setBusy(true)
    const res = await callAccountsApi({ action: 'delete', userId: u.id })
    setBusy(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.info(`ลบบัญชี "${u.username}" แล้ว`)
    void refreshUsers()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100">
      <div className="flex items-center justify-between p-5 border-b border-slate-100">
        <div>
          <h2 className="font-semibold text-slate-800">บัญชีผู้ใช้งานระบบ</h2>
          <p className="text-xs text-slate-500 mt-0.5">บัญชีสำหรับเข้าสู่ระบบ — 1 บัญชีต่อพนักงาน 1 คน</p>
        </div>
        <button onClick={() => { setAddForm({ staffId: staffWithoutAccount[0]?.id ?? '', username: '', password: '' }); setAddOpen(true) }}
          disabled={staffWithoutAccount.length === 0}
          title={staffWithoutAccount.length === 0 ? 'พนักงานที่ใช้งานอยู่ทุกคนมีบัญชีแล้ว' : 'สร้างบัญชีล็อกอินใหม่'}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
          <UserPlus size={16} /> เพิ่มบัญชี
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {['ชื่อผู้ใช้', 'พนักงาน', 'เข้าใช้ล่าสุด', 'จัดการ'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {u.username}
                  {u.id === currentUserId && <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">คุณ</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{staffName(u.staffId)}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{u.lastLogin ? formatDateTime(u.lastLogin) : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => { setNewPassword(''); setResetTarget(u) }} disabled={busy}
                      title={`ตั้งรหัสผ่านใหม่ให้ ${u.username}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-amber-600 disabled:opacity-30">
                      <KeyRound size={15} />
                    </button>
                    <button onClick={() => removeAccount(u)} disabled={busy || u.id === currentUserId}
                      title={u.id === currentUserId ? 'ลบบัญชีของตัวเองไม่ได้' : `ลบบัญชี ${u.username}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">ยังไม่มีบัญชีผู้ใช้งาน</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* เพิ่มบัญชี */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setAddOpen(false)}>
          <div ref={addTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-md focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">เพิ่มบัญชีผู้ใช้งาน</h2>
              <button onClick={() => setAddOpen(false)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="acc-staff" className="block text-sm font-medium text-slate-700 mb-1.5">พนักงาน *</label>
                <select id="acc-staff" value={addForm.staffId} onChange={(e) => setAddForm({ ...addForm, staffId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none bg-white">
                  {staffWithoutAccount.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — {s.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="acc-username" className="block text-sm font-medium text-slate-700 mb-1.5">ชื่อผู้ใช้ *</label>
                <input id="acc-username" value={addForm.username} onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                  placeholder="เช่น somchai (a-z, 0-9, . _ -)" autoComplete="off"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                <p className="text-xs text-slate-400 mt-1">ใช้เข้าสู่ระบบด้วยอีเมล <span className="font-mono">{(addForm.username.trim().toLowerCase() || 'ชื่อผู้ใช้')}@pruksatara.local</span></p>
              </div>
              <div>
                <label htmlFor="acc-password" className="block text-sm font-medium text-slate-700 mb-1.5">รหัสผ่านเริ่มต้น *</label>
                <input id="acc-password" type="text" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  placeholder="อย่างน้อย 8 ตัวอักษร" autoComplete="new-password"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                <p className="text-xs text-slate-400 mt-1">แจ้งรหัสนี้ให้พนักงาน แล้วให้เปลี่ยนรหัสเองที่เมนู &ldquo;เปลี่ยนรหัสผ่าน&rdquo;</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setAddOpen(false)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={submitAdd} disabled={busy || !addForm.staffId || addForm.username.trim().length < 3 || addForm.password.length < 8}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? 'กำลังสร้าง…' : 'สร้างบัญชี'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ตั้งรหัสผ่านใหม่ */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setResetTarget(null)}>
          <div ref={resetTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-sm focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">ตั้งรหัสผ่านใหม่ — {resetTarget.username}</h2>
              <button onClick={() => setResetTarget(null)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-slate-600">ใช้เมื่อพนักงานลืมรหัสผ่าน — รหัสเดิมจะใช้ไม่ได้ทันที</p>
              <div>
                <label htmlFor="acc-newpw" className="block text-sm font-medium text-slate-700 mb-1.5">รหัสผ่านใหม่ *</label>
                <input id="acc-newpw" type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="อย่างน้อย 8 ตัวอักษร" autoComplete="new-password"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setResetTarget(null)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={submitReset} disabled={busy || newPassword.length < 8}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? 'กำลังบันทึก…' : 'ตั้งรหัสผ่านใหม่'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
