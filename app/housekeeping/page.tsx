'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { formatDateTime, getPriorityLabel, getRoomStatusLabel } from '@/lib/utils'
import type { HousekeepingStatus } from '@/types'
import { Plus, X, Clock, CheckCircle2, Circle } from 'lucide-react'
import { toast } from 'sonner'

const priorityColors: Record<string, string> = {
  low: 'text-slate-500 bg-slate-100',
  normal: 'text-blue-600 bg-blue-100',
  high: 'text-amber-700 bg-amber-100',
  urgent: 'text-red-700 bg-red-100',
}

const columns: { key: HousekeepingStatus; label: string; icon: React.ReactNode }[] = [
  { key: 'pending', label: 'รอดำเนินการ', icon: <Circle size={16} className="text-slate-400" /> },
  { key: 'in_progress', label: 'กำลังดำเนินการ', icon: <Clock size={16} className="text-amber-500" /> },
  { key: 'completed', label: 'เสร็จแล้ว', icon: <CheckCircle2 size={16} className="text-emerald-500" /> },
]

export default function HousekeepingPage() {
  const { housekeepingTasks, rooms, staff, addHousekeepingTask, updateTaskStatus, logAudit } = useHotelStore()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ roomId: '', staffId: '', priority: 'normal', notes: '', scheduledAt: '' })

  const housekeepers = staff.filter((s) => s.role === 'housekeeper')

  function handleAdd() {
    if (!form.roomId || !form.staffId) return
    const room = rooms.find((r) => r.id === form.roomId)
    const hk = staff.find((s) => s.id === form.staffId)
    if (!room || !hk) return
    if (room.status === 'occupied' && !confirm(`ห้อง ${room.number} มีผู้เข้าพักอยู่\nยืนยันมอบหมายงานทำความสะอาดให้ ${hk.name}?`)) return
    addHousekeepingTask({
      roomId: form.roomId, roomNumber: room.number,
      assignedTo: hk.name, staffId: form.staffId,
      status: 'pending', priority: form.priority as 'low' | 'normal' | 'high' | 'urgent',
      notes: form.notes, scheduledAt: form.scheduledAt || new Date().toISOString(),
    })
    logAudit({ category: 'housekeeping', action: 'assign', summary: `มอบหมายงานทำความสะอาดห้อง ${room.number} ให้ ${hk.name}` })
    toast.success(`มอบหมายงานห้อง ${room.number} ให้ ${hk.name}`)
    setShowModal(false)
    setForm({ roomId: '', staffId: '', priority: 'normal', notes: '', scheduledAt: '' })
  }

  return (
    <div className="flex flex-col h-screen">
      <Header title="แม่บ้าน" subtitle="จัดการงานทำความสะอาดห้องพัก" />
      <div className="flex-1 overflow-y-auto p-6">

        <div className="flex justify-end mb-5">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> มอบหมายงาน
          </button>
        </div>

        <div className="grid grid-cols-3 gap-5">
          {columns.map(({ key, label, icon }) => {
            const tasks = housekeepingTasks.filter((t) => t.status === key)
            return (
              <div key={key} className="bg-slate-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  {icon}
                  <span className="font-semibold text-slate-700">{label}</span>
                  <span className="ml-auto text-xs font-medium text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">{tasks.length}</span>
                </div>
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
                      <div className="flex items-start justify-between mb-2">
                        <div className="font-semibold text-slate-800">ห้อง {task.roomNumber}</div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${priorityColors[task.priority]}`}>
                          {getPriorityLabel(task.priority)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mb-1">มอบหมายให้: {task.assignedTo}</div>
                      {task.notes && <div className="text-xs text-slate-400 mb-2 italic">&ldquo;{task.notes}&rdquo;</div>}
                      <div className="text-xs text-slate-400 mb-3">
                        {task.completedAt ? `เสร็จ: ${formatDateTime(task.completedAt)}` :
                          task.startedAt ? `เริ่ม: ${formatDateTime(task.startedAt)}` :
                            `นัด: ${formatDateTime(task.scheduledAt)}`}
                      </div>
                      <div className="no-print flex gap-1.5">
                        {key === 'pending' && (
                          <button onClick={() => { updateTaskStatus(task.id, 'in_progress'); logAudit({ category: 'housekeeping', action: 'start', summary: `เริ่มทำความสะอาดห้อง ${task.roomNumber}`, entityId: task.id }); toast.info(`เริ่มทำห้อง ${task.roomNumber}`) }}
                            className="text-xs px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors font-medium">
                            เริ่มทำ
                          </button>
                        )}
                        {key === 'in_progress' && (
                          <button onClick={() => { updateTaskStatus(task.id, 'completed'); logAudit({ category: 'housekeeping', action: 'complete', summary: `ทำความสะอาดห้อง ${task.roomNumber} เสร็จ`, entityId: task.id }); toast.success(`ห้อง ${task.roomNumber} พร้อมใช้งานแล้ว`) }}
                            className="text-xs px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors font-medium">
                            ✓ เสร็จแล้ว
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {tasks.length === 0 && (
                    <div className="text-center py-6 text-sm text-slate-400">ไม่มีงาน</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Add Task Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">มอบหมายงานทำความสะอาด</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">ห้องพัก *</label>
                <select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">เลือกห้อง</option>
                  {[...rooms].sort((a, b) => (a.status === 'occupied' ? 1 : 0) - (b.status === 'occupied' ? 1 : 0)).map((r) => (
                    <option key={r.id} value={r.id}>
                      ห้อง {r.number} ({getRoomStatusLabel(r.status)}){r.status === 'occupied' ? ' ⚠️' : ''}
                    </option>
                  ))}
                </select>
                {form.roomId && rooms.find((r) => r.id === form.roomId)?.status === 'occupied' && (
                  <p className="text-xs text-amber-600 mt-1.5">⚠️ ห้องนี้มีผู้เข้าพักอยู่ — ระบบจะถามยืนยันอีกครั้งก่อนมอบหมาย</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">มอบหมายให้ *</label>
                <select value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">เลือกพนักงาน</option>
                  {housekeepers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">หมายเหตุ</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={handleAdd} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors">มอบหมาย</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
