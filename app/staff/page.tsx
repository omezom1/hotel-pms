'use client'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { formatDate, getStaffRoleLabel } from '@/lib/utils'
import type { StaffRole } from '@/types'
import { CheckCircle2, XCircle } from 'lucide-react'

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

export default function StaffPage() {
  const { staff } = useHotelStore()

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
