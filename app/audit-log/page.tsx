'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { formatDateTime } from '@/lib/utils'
import type { AuditCategory } from '@/types'
import { Search } from 'lucide-react'

const categoryLabels: Record<AuditCategory, string> = {
  booking: 'การจอง',
  payment: 'การชำระเงิน',
  room: 'ห้องพัก',
  guest: 'แขก',
  housekeeping: 'แม่บ้าน',
  maintenance: 'ซ่อมบำรุง',
  inventory: 'คลังสินค้า',
  corporate: 'บัญชีองค์กร',
  auth: 'ระบบ',
}

const categoryColors: Record<AuditCategory, string> = {
  booking: 'bg-amber-100 text-amber-700',
  payment: 'bg-emerald-100 text-emerald-700',
  room: 'bg-blue-100 text-blue-700',
  guest: 'bg-purple-100 text-purple-700',
  housekeeping: 'bg-slate-100 text-slate-700',
  maintenance: 'bg-red-100 text-red-700',
  inventory: 'bg-orange-100 text-orange-700',
  corporate: 'bg-indigo-100 text-indigo-700',
  auth: 'bg-slate-100 text-slate-500',
}

export default function AuditLogPage() {
  const { auditLogs } = useHotelStore()
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<AuditCategory | 'all'>('all')

  const filtered = auditLogs.filter((log) => {
    if (filterCat !== 'all' && log.category !== filterCat) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      log.summary.toLowerCase().includes(q) ||
      log.staffName.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.entityId?.toLowerCase().includes(q) ?? false)
    )
  })

  return (
    <div className="flex flex-col h-screen">
      <Header title="บันทึกการใช้งาน" subtitle="ประวัติการเปลี่ยนแปลงข้อมูลในระบบ" />
      <div className="flex-1 overflow-y-auto p-6">

        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-center mb-4">
          <div className="relative flex-1 min-w-48 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหารายการ, พนักงาน, ID..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            />
          </div>
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value as AuditCategory | 'all')}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none"
          >
            <option value="all">หมวดทั้งหมด</option>
            {(Object.keys(categoryLabels) as AuditCategory[]).map((c) => (
              <option key={c} value={c}>{categoryLabels[c]}</option>
            ))}
          </select>
          <span className="ml-auto text-sm text-slate-500">
            แสดง <span className="font-semibold text-slate-700">{filtered.length}</span> / {auditLogs.length} รายการ
          </span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['เวลา', 'หมวด', 'การกระทำ', 'รายละเอียด', 'พนักงาน', 'อ้างอิง'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(log.timestamp)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColors[log.category]}`}>
                        {categoryLabels[log.category]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-600">{log.action}</td>
                    <td className="px-4 py-2.5 text-slate-800">{log.summary}</td>
                    <td className="px-4 py-2.5 text-slate-600">{log.staffName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{log.entityId ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-400">ยังไม่มีบันทึกในระบบ</div>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          ระบบเก็บประวัติ 500 รายการล่าสุดเท่านั้น รายการเก่าจะถูกลบอัตโนมัติ
        </p>
      </div>
    </div>
  )
}
