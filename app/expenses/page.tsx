'use client'
import { useMemo, useState } from 'react'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate, todayLocal } from '@/lib/utils'
import type { Expense, ExpenseCategory } from '@/types'
import { Plus, X, Pencil, Trash2, AlertTriangle, Receipt } from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'
import { toast } from 'sonner'

const categoryLabels: Record<ExpenseCategory, string> = {
  salary: 'เงินเดือนพนักงาน',
  utilities_electric: 'ค่าไฟฟ้า กฟภ./กฟน.',
  utilities_water: 'ค่าน้ำประปา',
  utilities_internet: 'ค่าอินเทอร์เน็ต',
  maintenance: 'ค่าซ่อมบำรุง',
  cleaning: 'ค่าทำความสะอาด',
  tax: 'ภาษีโรงเรือน',
  marketing: 'ค่าการตลาด',
  supplies: 'ค่าวัสดุสิ้นเปลือง',
  other: 'ค่าใช้จ่ายอื่นๆ',
}

const categoryBadge: Record<ExpenseCategory, string> = {
  salary: 'text-violet-700 bg-violet-100',
  utilities_electric: 'text-amber-700 bg-amber-100',
  utilities_water: 'text-blue-700 bg-blue-100',
  utilities_internet: 'text-cyan-700 bg-cyan-100',
  maintenance: 'text-orange-700 bg-orange-100',
  cleaning: 'text-emerald-700 bg-emerald-100',
  tax: 'text-red-700 bg-red-100',
  marketing: 'text-pink-700 bg-pink-100',
  supplies: 'text-teal-700 bg-teal-100',
  other: 'text-slate-600 bg-slate-100',
}

const CATEGORY_ORDER: ExpenseCategory[] = [
  'salary', 'utilities_electric', 'utilities_water', 'utilities_internet',
  'maintenance', 'cleaning', 'tax', 'marketing', 'supplies', 'other',
]

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

const now = new Date()
const ymKey = (iso: string) => iso.slice(0, 7) // YYYY-MM
const emptyForm = {
  date: todayLocal(),
  category: 'other' as ExpenseCategory,
  description: '',
  payee: '',
  amount: 0,
  note: '',
}

export default function ExpensesPage() {
  const { expenses, addExpense, updateExpense, deleteExpense, logAudit } = useHotelStore()
  // ดูได้ด้วย canViewFinance แต่ "จัดการ" (เพิ่ม/แก้/ลบ) ต้องมี canManageFinance
  const canManage = useAuthStore((s) => s.user?.staff.permissions.canManageFinance ?? false)
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)

  const periodKey = `${year}-${String(month).padStart(2, '0')}`

  // ปีที่มีในข้อมูล + ปีปัจจุบัน (สำหรับ dropdown)
  const years = useMemo(() => {
    const set = new Set<number>([now.getFullYear()])
    expenses.forEach((e) => set.add(Number(e.date.slice(0, 4))))
    return Array.from(set).sort((a, b) => b - a)
  }, [expenses])

  const periodExpenses = useMemo(
    () => expenses.filter((e) => ymKey(e.date) === periodKey).sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, periodKey]
  )
  const total = periodExpenses.reduce((s, e) => s + e.amount, 0)

  // แยกตามหมวด + %
  const byCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>()
    periodExpenses.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + e.amount))
    return Array.from(map, ([category, amount]) => ({ category, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount)
  }, [periodExpenses, total])

  function openAdd() {
    setEditId(null)
    setForm({ ...emptyForm, date: `${periodKey}-15` })
    setShowForm(true)
  }
  function openEdit(e: Expense) {
    setEditId(e.id)
    setForm({ date: e.date.split('T')[0], category: e.category, description: e.description, payee: e.payee ?? '', amount: e.amount, note: e.note ?? '' })
    setShowForm(true)
  }

  function handleSave() {
    if (!form.description.trim()) { toast.error('กรุณาระบุรายการ'); return }
    if (form.amount <= 0) { toast.error('จำนวนเงินต้องมากกว่า 0'); return }
    const payload = {
      date: new Date(form.date).toISOString(),
      category: form.category,
      description: form.description.trim(),
      payee: form.payee.trim() || undefined,
      amount: form.amount,
      note: form.note.trim() || undefined,
    }
    if (editId) {
      updateExpense(editId, payload)
      logAudit({ category: 'expense', action: 'edit', summary: `แก้ไขรายจ่าย "${payload.description}" ${formatCurrency(payload.amount)}`, entityId: editId })
      toast.success('บันทึกการแก้ไขแล้ว')
    } else {
      addExpense(payload)
      logAudit({ category: 'expense', action: 'add', summary: `เพิ่มรายจ่าย "${payload.description}" ${formatCurrency(payload.amount)}` })
      toast.success('เพิ่มรายจ่ายแล้ว')
    }
    setShowForm(false)
    setEditId(null)
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteExpense(deleteTarget.id)
    logAudit({ category: 'expense', action: 'delete', summary: `ลบรายจ่าย "${deleteTarget.description}"`, entityId: deleteTarget.id })
    toast.success('ลบรายจ่ายแล้ว')
    setDeleteTarget(null)
  }

  return (
    <div className="flex flex-col h-screen">
      <Header title="รายจ่าย" subtitle="ติดตามต้นทุนดำเนินงานแยกตามหมวดและงวดเดือน" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Period summary + controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500">งวด {month}/{year}</div>
            <div className="text-2xl font-bold text-slate-800">รวม {formatCurrency(total)}</div>
          </div>
          <div className="flex items-center gap-2">
            <select value={month} onChange={(e) => setMonth(+e.target.value)}
              className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500">
              {TH_MONTHS.map((m, i) => <option key={i} value={i + 1}>เดือน {m}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(+e.target.value)}
              className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {canManage && (
              <button onClick={openAdd}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0">
                <Plus size={16} /> เพิ่มรายจ่าย
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Expense list */}
          <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">รายการรายจ่าย <span className="text-xs font-normal text-slate-400">{periodExpenses.length} รายการ</span></h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {['วันที่', 'หมวด', 'รายการ', 'ผู้รับ', 'จำนวน', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {periodExpenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatDate(e.date)}</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${categoryBadge[e.category]}`}>{categoryLabels[e.category]}</span></td>
                      <td className="px-4 py-3 text-slate-700">
                        {e.description}
                        {e.note && <div className="text-xs text-slate-400 mt-0.5">{e.note}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{e.payee || '-'}</td>
                      <td className="px-4 py-3 font-semibold text-red-600 whitespace-nowrap">{formatCurrency(e.amount)}</td>
                      <td className="px-4 py-3">
                        {canManage ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(e)} title="แก้ไข" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"><Pencil size={14} /></button>
                            <button onClick={() => setDeleteTarget(e)} title="ลบ" className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {periodExpenses.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-14 text-slate-400">
                      <Receipt size={28} className="mx-auto mb-2 opacity-40" />
                      ไม่มีรายจ่ายในงวด {month}/{year}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Breakdown by category */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">แยกตามหมวด</h2>
            {byCategory.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">ยังไม่มีข้อมูล</div>
            ) : (
              <div className="space-y-4">
                {byCategory.map(({ category, amount, pct }) => (
                  <div key={category}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="text-slate-700">{categoryLabels[category]}</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(amount)} <span className="text-xs font-normal text-slate-400">({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
                <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="font-semibold text-slate-700">รวมทั้งงวด</span>
                  <span className="font-bold text-red-600">{formatCurrency(total)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit dialog */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{editId ? 'แก้ไขรายจ่าย' : 'เพิ่มรายจ่าย'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">วันที่ *</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">หมวด *</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none">
                    {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">รายการ *</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="เช่น ค่าไฟฟ้ารวมเดือน" autoFocus
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">ผู้รับเงิน</label>
                  <input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })}
                    placeholder="เช่น การไฟฟ้านครหลวง"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">จำนวนเงิน (บาท) *</label>
                  <input type="number" min={0} step="0.01" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: +e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">หมายเหตุ</label>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={handleSave} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <AlertTriangle size={18} />
                <h2 className="font-semibold">ยืนยันการลบ</h2>
              </div>
              <p className="text-sm text-slate-600 mt-2">ลบรายจ่าย <span className="font-semibold">&ldquo;{deleteTarget.description}&rdquo;</span> ({formatCurrency(deleteTarget.amount)})?</p>
            </div>
            <div className="flex justify-end gap-3 p-4">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium">ลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
