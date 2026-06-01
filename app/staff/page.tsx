'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth-store'
import Header from '@/components/layout/Header'
import { formatDate, getStaffRoleLabel } from '@/lib/utils'
import type { StaffRole } from '@/types'
import { CheckCircle2, XCircle, KeyRound, UserPlus, Trash2, Eye, EyeOff, Save, X, Pencil } from 'lucide-react'
import { toast } from 'sonner'

const roleColors: Record<StaffRole, string> = {
  admin: 'text-red-700 bg-red-100',
  receptionist: 'text-blue-700 bg-blue-100',
  accountant: 'text-green-700 bg-green-100',
  housekeeper: 'text-amber-700 bg-amber-100',
  maintenance: 'text-slate-700 bg-slate-100',
}

const permissionLabels: [keyof ReturnType<typeof useHotelStore.getState>['staff'][0]['permissions'], string][] = [
  ['canViewDashboard', 'ดูแดชบอร์ด'],
  ['canManageBookings', 'จัดการการจอง'],
  ['canManageGuests', 'จัดการข้อมูลแขก'],
  ['canViewFinance', 'ดูข้อมูลการเงิน'],
  ['canManageFinance', 'จัดการการเงิน'],
  ['canManageRooms', 'จัดการห้องพัก'],
  ['canManageStaff', 'จัดการพนักงาน'],
  ['canViewReports', 'ดูรายงาน'],
  ['canManageHousekeeping', 'จัดการแม่บ้าน'],
  ['canManageMaintenance', 'จัดการซ่อมบำรุง'],
]

// ===== จัดการบัญชีผู้ใช้ (เก็บบน cloud — แก้ได้ทุกเครื่อง) =====
function AccountsManager() {
  const users = useHotelStore((s) => s.users)
  const staff = useHotelStore((s) => s.staff)
  const addUser = useHotelStore((s) => s.addUser)
  const updateUser = useHotelStore((s) => s.updateUser)
  const deleteUser = useHotelStore((s) => s.deleteUser)
  const currentUserId = useAuthStore((s) => s.user?.userId)

  const [revealId, setRevealId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')

  const [adding, setAdding] = useState(false)
  const [newStaffId, setNewStaffId] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const staffName = (staffId: string) => staff.find((s) => s.id === staffId)?.name ?? '— ไม่พบพนักงาน —'
  const staffRole = (staffId: string) => staff.find((s) => s.id === staffId)?.role
  const staffWithoutAccount = staff.filter((s) => !users.some((u) => u.staffId === s.id))

  function startEdit(id: string, username: string) {
    setEditId(id)
    setEditUsername(username)
    setEditPassword('')
  }

  function saveEdit(id: string) {
    const updates: { username?: string; password?: string } = {}
    if (editUsername.trim()) updates.username = editUsername.trim()
    if (editPassword) updates.password = editPassword
    const res = updateUser(id, updates)
    if (!res.ok) { toast.error(res.error ?? 'แก้ไขไม่สำเร็จ'); return }
    toast.success('บันทึกบัญชีแล้ว')
    setEditId(null)
  }

  function handleAdd() {
    if (!newStaffId) { toast.error('เลือกพนักงานที่จะผูกบัญชี'); return }
    const res = addUser({ username: newUsername, password: newPassword, staffId: newStaffId })
    if (!res.ok) { toast.error(res.error ?? 'เพิ่มบัญชีไม่สำเร็จ'); return }
    toast.success('เพิ่มบัญชีผู้ใช้แล้ว')
    setAdding(false)
    setNewStaffId(''); setNewUsername(''); setNewPassword('')
  }

  function handleDelete(id: string, username: string) {
    if (id === currentUserId) { toast.error('ลบบัญชีที่กำลังใช้งานอยู่ไม่ได้'); return }
    if (!confirm(`ลบบัญชี "${username}" ?`)) return
    deleteUser(id)
    toast.success('ลบบัญชีแล้ว')
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-amber-500" />
          <h2 className="font-semibold text-slate-800">บัญชีผู้ใช้งานระบบ</h2>
          <span className="text-xs text-slate-400">({users.length} บัญชี · เก็บบนคลาวด์)</span>
        </div>
        {!adding && staffWithoutAccount.length > 0 && (
          <button
            onClick={() => { setAdding(true); setNewStaffId(staffWithoutAccount[0].id) }}
            className="flex items-center gap-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-slate-900 font-medium px-3 py-1.5 rounded-lg"
          >
            <UserPlus size={15} /> เพิ่มบัญชี
          </button>
        )}
      </div>

      {adding && (
        <div className="grid sm:grid-cols-4 gap-2 items-end mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div>
            <label className="block text-xs text-slate-500 mb-1">พนักงาน</label>
            <select
              value={newStaffId}
              onChange={(e) => setNewStaffId(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm"
            >
              {staffWithoutAccount.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({getStaffRoleLabel(s.role)})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">ชื่อผู้ใช้</label>
            <input
              value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
              placeholder="username" autoComplete="off"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">รหัสผ่าน</label>
            <input
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              placeholder="password" autoComplete="off"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 flex items-center justify-center gap-1 text-sm bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg">
              <Save size={15} /> บันทึก
            </button>
            <button onClick={() => setAdding(false)} className="text-slate-400 hover:text-slate-600 px-2">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {users.map((u) => {
          const role = staffRole(u.staffId)
          const isEditing = editId === u.id
          return (
            <div key={u.id} className="py-2.5 flex items-center gap-3 flex-wrap">
              {isEditing ? (
                <>
                  <input
                    value={editUsername} onChange={(e) => setEditUsername(e.target.value)}
                    placeholder="ชื่อผู้ใช้" autoComplete="off"
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm w-36"
                  />
                  <input
                    value={editPassword} onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="รหัสผ่านใหม่ (เว้นว่าง = คงเดิม)" autoComplete="off"
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm flex-1 min-w-[180px]"
                  />
                  <button onClick={() => saveEdit(u.id)} className="flex items-center gap-1 text-sm bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg">
                    <Save size={15} /> บันทึก
                  </button>
                  <button onClick={() => setEditId(null)} className="text-slate-400 hover:text-slate-600 px-1">
                    <X size={18} />
                  </button>
                </>
              ) : (
                <>
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 text-sm shrink-0">
                    {staffName(u.staffId).charAt(0)}
                  </div>
                  <div className="min-w-[160px]">
                    <div className="font-medium text-slate-800 text-sm flex items-center gap-2">
                      {u.username}
                      {u.id === currentUserId && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">คุณ</span>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {staffName(u.staffId)}{role && ` · ${getStaffRoleLabel(role)}`}
                    </div>
                  </div>
                  <div className="font-mono text-xs text-slate-500 flex items-center gap-1.5 w-32">
                    {revealId === u.id ? u.password : '••••••••'}
                    <button onClick={() => setRevealId(revealId === u.id ? null : u.id)} className="text-slate-400 hover:text-slate-600">
                      {revealId === u.id ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <div className="text-xs text-slate-400 flex-1 min-w-[120px]">
                    เข้าใช้ล่าสุด: {u.lastLogin ? formatDate(u.lastLogin) : '—'}
                  </div>
                  <button onClick={() => startEdit(u.id, u.username)} className="text-slate-400 hover:text-amber-600 p-1" title="แก้ไข">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(u.id, u.username)} className="text-slate-400 hover:text-red-600 p-1 disabled:opacity-30" title="ลบ" disabled={u.id === currentUserId}>
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function StaffPage() {
  const { staff } = useHotelStore()
  const canManageStaff = useAuthStore((s) => s.user?.staff.permissions.canManageStaff ?? false)

  return (
    <div className="flex flex-col h-screen">
      <Header title="พนักงาน" subtitle="จัดการบทบาทและสิทธิ์การเข้าถึง" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Summary */}
        <div className="grid grid-cols-5 gap-3">
          {(['admin', 'receptionist', 'accountant', 'housekeeper', 'maintenance'] as StaffRole[]).map((role) => (
            <div key={role} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 text-center">
              <div className={`text-xs font-medium px-2 py-1 rounded-full ${roleColors[role]} mx-auto w-fit mb-2`}>
                {getStaffRoleLabel(role)}
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {staff.filter((s) => s.role === role).length}
              </div>
            </div>
          ))}
        </div>

        {/* บัญชีผู้ใช้งาน — เฉพาะผู้มีสิทธิ์จัดการพนักงาน */}
        {canManageStaff && <AccountsManager />}

        {/* Staff Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {staff.map((member) => (
            <div key={member.id} className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{member.name}</div>
                    <div className="text-sm text-slate-500">{member.email}</div>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleColors[member.role]}`}>
                  {getStaffRoleLabel(member.role)}
                </span>
              </div>
              <div className="text-xs text-slate-400 mb-3">
                โทร: {member.phone} · เริ่มงาน: {formatDate(member.hireDate)}
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs font-medium text-slate-500 mb-2">สิทธิ์การเข้าถึง</div>
                <div className="grid grid-cols-2 gap-1">
                  {permissionLabels.map(([key, label]) => (
                    <div key={key} className="flex items-center gap-1.5 text-xs">
                      {member.permissions[key]
                        ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                        : <XCircle size={12} className="text-slate-300 shrink-0" />}
                      <span className={member.permissions[key] ? 'text-slate-700' : 'text-slate-400'}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
