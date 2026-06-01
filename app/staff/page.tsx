'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import { useAuthStore } from '@/lib/auth-store'
import Header from '@/components/layout/Header'
import { formatDate, getStaffRoleLabel } from '@/lib/utils'
import type { StaffRole, StaffPermissions, Staff } from '@/types'
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
  ['canManageInventory', 'จัดการคลังสินค้า'],
  ['canManageCorporate', 'จัดการเครดิตองค์กร'],
]

const ALL_PERMS = permissionLabels.map(([k]) => k)
function perms(on: (keyof StaffPermissions)[]): StaffPermissions {
  const base = Object.fromEntries(ALL_PERMS.map((k) => [k, false])) as unknown as StaffPermissions
  on.forEach((k) => { base[k] = true })
  return base
}
// สิทธิ์เริ่มต้นตามตำแหน่ง (ใช้ตอนเพิ่มพนักงานใหม่ — ปรับเพิ่มเองได้ภายหลัง)
const ROLE_DEFAULT_PERMISSIONS: Record<StaffRole, StaffPermissions> = {
  admin: perms(ALL_PERMS),
  receptionist: perms(['canViewDashboard', 'canManageBookings', 'canManageGuests', 'canManageMaintenance', 'canManageCorporate']),
  accountant: perms(['canViewDashboard', 'canViewFinance', 'canManageFinance', 'canViewReports', 'canManageCorporate']),
  housekeeper: perms(['canManageHousekeeping', 'canManageInventory']),
  maintenance: perms(['canManageMaintenance', 'canManageInventory']),
}
const ROLES: StaffRole[] = ['admin', 'receptionist', 'accountant', 'housekeeper', 'maintenance']

// ===== ฟอร์มเพิ่ม/แก้ไขข้อมูลพนักงาน =====
function StaffFormDialog({ editing, onClose }: { editing: Staff | null; onClose: () => void }) {
  const addStaff = useHotelStore((s) => s.addStaff)
  const updateStaff = useHotelStore((s) => s.updateStaff)
  const logAudit = useHotelStore((s) => s.logAudit)
  const [form, setForm] = useState({
    name: editing?.name ?? '',
    role: editing?.role ?? ('receptionist' as StaffRole),
    email: editing?.email ?? '',
    phone: editing?.phone ?? '',
    hireDate: (editing?.hireDate ?? new Date().toISOString()).split('T')[0],
    isActive: editing?.isActive ?? true,
  })

  function save() {
    const name = form.name.trim()
    if (!name) { toast.error('กรุณาระบุชื่อ'); return }
    const common = { name, role: form.role, email: form.email.trim(), phone: form.phone.trim(), hireDate: form.hireDate, isActive: form.isActive }
    if (editing) {
      updateStaff(editing.id, common) // หมายเหตุ: ไม่แตะ permissions (แก้ผ่าน "แก้สิทธิ์")
      logAudit({ category: 'auth', action: 'update_staff', summary: `แก้ไขข้อมูลพนักงาน ${name}`, entityId: editing.id })
      toast.success('บันทึกข้อมูลพนักงานแล้ว')
    } else {
      const id = addStaff({ ...common, permissions: ROLE_DEFAULT_PERMISSIONS[form.role] })
      logAudit({ category: 'auth', action: 'add_staff', summary: `เพิ่มพนักงาน ${name} (${getStaffRoleLabel(form.role)})`, entityId: id })
      toast.success('เพิ่มพนักงานแล้ว — ตั้งสิทธิ์เริ่มต้นตามตำแหน่งให้อัตโนมัติ')
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">{editing ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงาน'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">ชื่อ-นามสกุล *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">ตำแหน่ง</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none">
                {ROLES.map((r) => <option key={r} value={r}>{getStaffRoleLabel(r)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">วันเริ่มงาน</label>
              <input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">อีเมล</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">เบอร์โทร</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
            เปิดใช้งานบัญชี (ปิด = login ไม่ได้)
          </label>
          {!editing && (
            <p className="text-xs text-slate-400">สิทธิ์เริ่มต้นจะตั้งตามตำแหน่ง — ปรับเพิ่ม/ลดได้ที่ปุ่ม “แก้สิทธิ์” บนการ์ดพนักงาน</p>
          )}
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
          <button onClick={save} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">บันทึก</button>
        </div>
      </div>
    </div>
  )
}

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

function PermissionEditor({ member, canManageStaff, isSelf }: { member: Staff; canManageStaff: boolean; isSelf: boolean }) {
  const updateStaff = useHotelStore((s) => s.updateStaff)
  const logAudit = useHotelStore((s) => s.logAudit)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<StaffPermissions>(member.permissions)

  function start() { setDraft({ ...member.permissions }); setEditing(true) }
  function toggle(key: keyof StaffPermissions) { setDraft((d) => ({ ...d, [key]: !d[key] })) }
  function save() {
    // กันล็อกตัวเอง: ห้ามปิดสิทธิ์จัดการพนักงานของบัญชีตัวเอง (ไม่งั้นเข้าหน้านี้ไม่ได้อีก)
    if (isSelf && !draft.canManageStaff) {
      toast.error('ปิดสิทธิ์ "จัดการพนักงาน" ของตัวเองไม่ได้ (จะเข้าหน้านี้ไม่ได้)')
      return
    }
    updateStaff(member.id, { permissions: draft })
    logAudit({ category: 'auth', action: 'update_permissions', summary: `แก้สิทธิ์ของ ${member.name}`, entityId: member.id })
    toast.success(`บันทึกสิทธิ์ของ ${member.name} แล้ว`)
    setEditing(false)
  }

  return (
    <div className="border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-slate-500">สิทธิ์การเข้าถึง</div>
        {canManageStaff && (
          editing ? (
            <div className="flex items-center gap-2">
              <button onClick={save} className="flex items-center gap-1 text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-md"><Save size={12} /> บันทึก</button>
              <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
            </div>
          ) : (
            <button onClick={start} className="flex items-center gap-1 text-xs text-amber-600 hover:underline"><Pencil size={12} /> แก้สิทธิ์</button>
          )
        )}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {permissionLabels.map(([key, label]) => {
          const on = editing ? draft[key] : member.permissions[key]
          const Icon = on ? CheckCircle2 : XCircle
          const iconCls = on ? 'text-emerald-500 shrink-0' : 'text-slate-300 shrink-0'
          const textCls = on ? 'text-slate-700' : 'text-slate-400'
          return editing ? (
            <button key={key} onClick={() => toggle(key)} className="flex items-center gap-1.5 text-xs text-left hover:bg-slate-50 rounded px-1 py-0.5 -mx-1">
              <Icon size={12} className={iconCls} />
              <span className={textCls}>{label}</span>
            </button>
          ) : (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              <Icon size={12} className={iconCls} />
              <span className={textCls}>{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function StaffPage() {
  const { staff, users, deleteStaff, logAudit } = useHotelStore()
  const canManageStaff = useAuthStore((s) => s.user?.staff.permissions.canManageStaff ?? false)
  const currentStaffId = useAuthStore((s) => s.user?.staff.id)
  const [staffForm, setStaffForm] = useState<{ editing: Staff | null } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Staff | null>(null)

  function confirmDelete() {
    if (!deleteTarget) return
    deleteStaff(deleteTarget.id)
    logAudit({ category: 'auth', action: 'delete_staff', summary: `ลบพนักงาน ${deleteTarget.name}`, entityId: deleteTarget.id })
    toast.success(`ลบพนักงาน ${deleteTarget.name} แล้ว`)
    setDeleteTarget(null)
  }

  function tryDelete(member: Staff) {
    if (member.id === currentStaffId) { toast.error('ลบบัญชีพนักงานของตัวเองไม่ได้'); return }
    if (users.some((u) => u.staffId === member.id)) {
      toast.error('มีบัญชีผู้ใช้ผูกกับพนักงานนี้ — ลบบัญชีผู้ใช้ก่อน (ในส่วน “บัญชีผู้ใช้งานระบบ”)')
      return
    }
    setDeleteTarget(member)
  }

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

        {/* Staff header + add */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">พนักงานทั้งหมด <span className="text-xs font-normal text-slate-400">({staff.length} คน)</span></h2>
          {canManageStaff && (
            <button onClick={() => setStaffForm({ editing: null })}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <UserPlus size={16} /> เพิ่มพนักงาน
            </button>
          )}
        </div>

        {/* Staff Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {staff.map((member) => (
            <div key={member.id} className={`bg-white rounded-xl shadow-sm border p-5 ${member.isActive ? 'border-slate-100' : 'border-slate-200 opacity-70'}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-2">
                      {member.name}
                      {!member.isActive && <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">ปิดใช้งาน</span>}
                    </div>
                    <div className="text-sm text-slate-500">{member.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleColors[member.role]}`}>
                    {getStaffRoleLabel(member.role)}
                  </span>
                  {canManageStaff && (
                    <>
                      <button onClick={() => setStaffForm({ editing: member })} title="แก้ไขข้อมูล" className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-amber-600 transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => tryDelete(member)} title="ลบพนักงาน" disabled={member.id === currentStaffId} className="p-1.5 rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30"><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-400 mb-3">
                โทร: {member.phone} · เริ่มงาน: {formatDate(member.hireDate)}
              </div>
              <PermissionEditor member={member} canManageStaff={canManageStaff} isSelf={member.id === currentStaffId} />
            </div>
          ))}
        </div>
      </div>

      {staffForm && (
        <StaffFormDialog editing={staffForm.editing} onClose={() => setStaffForm(null)} />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-center gap-2 text-red-600 mb-1"><Trash2 size={18} /><h2 className="font-semibold">ยืนยันการลบ</h2></div>
              <p className="text-sm text-slate-600 mt-2">ลบพนักงาน <span className="font-semibold">{deleteTarget.name}</span> ออกจากระบบ?</p>
            </div>
            <div className="flex justify-end gap-3 p-4">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={confirmDelete} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium">ลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
