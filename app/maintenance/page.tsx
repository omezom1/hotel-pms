'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { formatDateTime, getPriorityLabel } from '@/lib/utils'
import type { MaintenanceStatus } from '@/types'
import { Plus, X, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

const statusColors: Record<MaintenanceStatus, string> = {
  open: 'text-red-700 bg-red-100',
  in_progress: 'text-amber-700 bg-amber-100',
  resolved: 'text-emerald-700 bg-emerald-100',
}
const statusLabels: Record<MaintenanceStatus, string> = {
  open: 'รอดำเนินการ', in_progress: 'กำลังซ่อม', resolved: 'แก้ไขแล้ว'
}
const priorityColors: Record<string, string> = {
  low: 'text-slate-500', normal: 'text-blue-600', high: 'text-amber-600', urgent: 'text-red-600 font-bold'
}

export default function MaintenancePage() {
  const { maintenanceLogs, rooms, addMaintenanceLog, updateMaintenanceStatus, logAudit } = useHotelStore()
  const [filter, setFilter] = useState<MaintenanceStatus | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ roomId: '', issue: '', description: '', priority: 'normal', reportedBy: 'พนักงานต้อนรับ' })

  const filtered = maintenanceLogs.filter((l) => filter === 'all' || l.status === filter)

  function handleAdd() {
    if (!form.roomId || !form.issue) return
    const room = rooms.find((r) => r.id === form.roomId)
    if (!room) return
    addMaintenanceLog({
      roomId: form.roomId, roomNumber: room.number,
      issue: form.issue, description: form.description,
      status: 'open', priority: form.priority as 'low' | 'normal' | 'high' | 'urgent',
      reportedBy: form.reportedBy, reportedAt: new Date().toISOString(),
    })
    logAudit({ category: 'maintenance', action: 'report', summary: `แจ้งซ่อมห้อง ${room.number}: ${form.issue}` })
    toast.success(`แจ้งซ่อมห้อง ${room.number} แล้ว`, { description: 'ห้องถูกปิดใช้งานโดยอัตโนมัติ' })
    setShowModal(false)
    setForm({ roomId: '', issue: '', description: '', priority: 'normal', reportedBy: 'พนักงานต้อนรับ' })
  }

  const stats = {
    open: maintenanceLogs.filter((l) => l.status === 'open').length,
    in_progress: maintenanceLogs.filter((l) => l.status === 'in_progress').length,
    resolved: maintenanceLogs.filter((l) => l.status === 'resolved').length,
  }

  return (
    <div className="flex flex-col h-screen">
      <Header title="ซ่อมบำรุง" subtitle="ติดตามและจัดการการซ่อมบำรุง" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'รอดำเนินการ', count: stats.open, icon: <AlertCircle size={20} className="text-red-500" />, color: 'text-red-600' },
            { label: 'กำลังซ่อม', count: stats.in_progress, icon: <Clock size={20} className="text-amber-500" />, color: 'text-amber-600' },
            { label: 'แก้ไขแล้ว', count: stats.resolved, icon: <CheckCircle2 size={20} className="text-emerald-500" />, color: 'text-emerald-600' },
          ].map(({ label, count, icon, color }) => (
            <div key={label} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-4">
              {icon}
              <div>
                <div className={`text-2xl font-bold ${color}`}>{count}</div>
                <div className="text-sm text-slate-500">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="no-print flex items-center justify-between">
          <div className="flex gap-2">
            {(['all', 'open', 'in_progress', 'resolved'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === s ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'}`}
              >
                {s === 'all' ? 'ทั้งหมด' : statusLabels[s]}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> แจ้งซ่อม
          </button>
        </div>

        {/* Log */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['ห้อง', 'ปัญหา', 'รายละเอียด', 'ความสำคัญ', 'ผู้แจ้ง', 'วันที่แจ้ง', 'ผู้รับผิดชอบ', 'สถานะ', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">ห้อง {log.roomNumber}</td>
                    <td className="px-4 py-3 font-medium">{log.issue}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-48 truncate">{log.description}</td>
                    <td className={`px-4 py-3 ${priorityColors[log.priority]}`}>{getPriorityLabel(log.priority)}</td>
                    <td className="px-4 py-3 text-slate-500">{log.reportedBy}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(log.reportedAt)}</td>
                    <td className="px-4 py-3 text-slate-500">{log.assignedTo ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[log.status]}`}>
                        {statusLabels[log.status]}
                      </span>
                    </td>
                    <td className="no-print px-4 py-3">
                      {log.status === 'open' && (
                        <button onClick={() => { updateMaintenanceStatus(log.id, 'in_progress'); logAudit({ category: 'maintenance', action: 'start', summary: `รับงานซ่อมห้อง ${log.roomNumber}`, entityId: log.id }); toast.info(`เริ่มซ่อมห้อง ${log.roomNumber}`) }}
                          className="text-xs px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded hover:bg-amber-100 transition-colors">
                          รับงาน
                        </button>
                      )}
                      {log.status === 'in_progress' && (
                        <button onClick={() => { updateMaintenanceStatus(log.id, 'resolved'); logAudit({ category: 'maintenance', action: 'resolve', summary: `ซ่อมห้อง ${log.roomNumber} เสร็จ`, entityId: log.id }); toast.success(`ซ่อมห้อง ${log.roomNumber} เสร็จแล้ว`, { description: 'คืนสถานะห้องเป็น "ว่าง" อัตโนมัติ' }) }}
                          className="text-xs px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded hover:bg-emerald-100 transition-colors">
                          แก้ไขแล้ว
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-slate-400">ไม่พบข้อมูล</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">แจ้งซ่อมบำรุง</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">ห้อง *</label>
                <select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none">
                  <option value="">เลือกห้อง</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>ห้อง {r.number}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">ปัญหา *</label>
                <input value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })}
                  placeholder="เช่น เครื่องปรับอากาศขัดข้อง"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">รายละเอียด</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">ความสำคัญ</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none">
                  <option value="low">ต่ำ</option>
                  <option value="normal">ปกติ</option>
                  <option value="high">สูง</option>
                  <option value="urgent">เร่งด่วน</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={handleAdd} className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors">แจ้งซ่อม</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
