'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { useFocusTrap } from '@/lib/useFocusTrap'
import type { InventoryCategory, InventoryItem, InventoryUnit, InventoryTransaction } from '@/types'
import { Plus, X, AlertTriangle, RefreshCw, Minus, Edit2, Trash2, History, Search } from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'
import { toast } from 'sonner'

const txTypeLabel: Record<InventoryTransaction['type'], string> = {
  restock: 'เติมสต็อก', use: 'เบิกใช้', adjust: 'ปรับยอด', waste: 'เสียหาย',
}
const txTypeColor: Record<InventoryTransaction['type'], string> = {
  restock: 'text-emerald-700 bg-emerald-100',
  use: 'text-amber-700 bg-amber-100',
  adjust: 'text-blue-700 bg-blue-100',
  waste: 'text-red-700 bg-red-100',
}

const categoryLabels: Record<InventoryCategory, string> = {
  room_amenities: 'อุปกรณ์ห้องพัก',
  minibar: 'มินิบาร์',
  cleaning_supplies: 'วัสดุทำความสะอาด',
}

const unitLabels: Record<InventoryUnit, string> = {
  piece: 'ชิ้น', bottle: 'ขวด', pack: 'แพ็ค', set: 'ชุด', liter: 'ลิตร', kg: 'กก.'
}

function getStockLevel(item: InventoryItem): 'critical' | 'low' | 'ok' {
  if (item.currentStock <= item.minStock) return 'critical'
  const pct = item.currentStock / item.maxStock
  if (pct < 0.25) return 'low'
  return 'ok'
}

const stockColors = {
  critical: { bar: 'bg-red-500',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700' },
  low:      { bar: 'bg-amber-400',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700' },
  ok:       { bar: 'bg-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
}

const emptyForm = {
  name: '', category: 'room_amenities' as InventoryCategory, unit: 'piece' as InventoryUnit,
  currentStock: 0, minStock: 0, maxStock: 0, costPerUnit: 0, supplier: '', notes: '',
}

export default function InventoryPage() {
  const store = useHotelStore()
  const { inventoryItems, inventoryTransactions, staff, addInventoryItem, updateInventoryItem, deleteInventoryItem, restockItem, adjustStock, logAudit } = store
  const consumeInventory = store.useInventoryItem
  const { user } = useAuthStore()

  const [activeTab, setActiveTab] = useState<'all' | InventoryCategory>('all')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [stockDialog, setStockDialog] = useState<{ item: InventoryItem; mode: 'restock' | 'use' | 'adjust' } | null>(null)
  const [stockQty, setStockQty] = useState(0)
  const [stockNote, setStockNote] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [deleteConfirm, setDeleteConfirm] = useState<InventoryItem | null>(null)
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null)
  const addTrapRef = useFocusTrap<HTMLDivElement>(showAddDialog, () => { setShowAddDialog(false); setEditItem(null) })
  const stockTrapRef = useFocusTrap<HTMLDivElement>(!!stockDialog, () => setStockDialog(null))
  const deleteTrapRef = useFocusTrap<HTMLDivElement>(!!deleteConfirm, () => setDeleteConfirm(null))
  const historyTrapRef = useFocusTrap<HTMLDivElement>(!!historyItem, () => setHistoryItem(null))
  const [historyType, setHistoryType] = useState<'all' | InventoryTransaction['type']>('all')
  const [historySearch, setHistorySearch] = useState('')

  const filtered = inventoryItems.filter((i) => activeTab === 'all' || i.category === activeTab)
  const lowItems = inventoryItems.filter((i) => getStockLevel(i) === 'critical')

  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? id

  // เรียงตามวันที่ใหม่→เก่า (ไม่พึ่งลำดับการ insert)
  const sortedTx = [...inventoryTransactions].sort((a, b) => b.date.localeCompare(a.date))

  // ประวัติของสินค้าหนึ่งรายการ พร้อมยอดคงเหลือหลังแต่ละรายการ (ไล่ย้อนจากสต็อกปัจจุบัน)
  function itemHistory(item: InventoryItem) {
    const txs = sortedTx.filter((t) => t.itemId === item.id)
    let balance = item.currentStock
    return txs.map((t) => {
      const balanceAfter = balance
      balance = balanceAfter - t.quantity // ย้อนกลับไปยอดก่อนหน้า
      return { tx: t, balanceAfter }
    })
  }

  const globalFilteredTx = sortedTx.filter((t) => {
    if (historyType !== 'all' && t.type !== historyType) return false
    if (!historySearch) return true
    const item = inventoryItems.find((i) => i.id === t.itemId)
    return (item?.name ?? '').toLowerCase().includes(historySearch.toLowerCase())
  })

  function handleSaveItem() {
    if (!form.name) return
    if (editItem) {
      updateInventoryItem(editItem.id, form)
      toast.success('บันทึกการแก้ไขแล้ว')
    } else {
      addInventoryItem({ ...form, lastRestocked: new Date().toISOString() })
      toast.success('เพิ่มรายการสต็อกแล้ว')
    }
    setShowAddDialog(false)
    setEditItem(null)
    setForm(emptyForm)
  }

  function handleDelete() {
    if (!deleteConfirm) return
    deleteInventoryItem(deleteConfirm.id)
    logAudit({ category: 'inventory', action: 'delete', summary: `ลบรายการ "${deleteConfirm.name}"`, entityId: deleteConfirm.id })
    toast.success(`ลบ "${deleteConfirm.name}" แล้ว`)
    setDeleteConfirm(null)
  }

  function openEdit(item: InventoryItem) {
    setEditItem(item)
    setForm({
      name: item.name, category: item.category, unit: item.unit,
      currentStock: item.currentStock, minStock: item.minStock, maxStock: item.maxStock,
      costPerUnit: item.costPerUnit, supplier: item.supplier ?? '', notes: item.notes ?? '',
    })
    setShowAddDialog(true)
  }

  function handleStockAction() {
    if (!stockDialog || !user) return
    const { item, mode } = stockDialog
    if (mode === 'restock') {
      restockItem(item.id, stockQty, user.staff.id, stockNote || undefined)
      logAudit({ category: 'inventory', action: 'restock', summary: `เติมสต็อก ${item.name} +${stockQty}`, entityId: item.id })
      toast.success(`เติมสต็อก ${item.name} +${stockQty} ${unitLabels[item.unit]}`)
    } else if (mode === 'use') {
      const result = consumeInventory(item.id, stockQty, user.staff.id, undefined, stockNote || undefined)
      if (!result.ok) {
        toast.error(result.error ?? 'เบิกสต็อกไม่สำเร็จ')
        return
      }
      logAudit({ category: 'inventory', action: 'use', summary: `เบิก ${item.name} -${stockQty}`, entityId: item.id })
      toast.success(`เบิก ${item.name} -${stockQty} ${unitLabels[item.unit]}`)
    } else {
      adjustStock(item.id, stockQty, user.staff.id, stockNote || undefined)
      logAudit({ category: 'inventory', action: 'adjust', summary: `ปรับสต็อก ${item.name} เป็น ${stockQty}`, entityId: item.id })
      toast.success(`ปรับสต็อก ${item.name} เป็น ${stockQty} ${unitLabels[item.unit]}`)
    }
    setStockDialog(null)
    setStockQty(0)
    setStockNote('')
  }

  const tabs: Array<{ key: 'all' | InventoryCategory; label: string }> = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'room_amenities', label: 'อุปกรณ์ห้องพัก' },
    { key: 'minibar', label: 'มินิบาร์' },
    { key: 'cleaning_supplies', label: 'วัสดุทำความสะอาด' },
  ]

  return (
    <div className="flex flex-col h-screen">
      <Header title="คลังสินค้า" subtitle="ติดตามสต็อกอุปกรณ์และวัสดุสิ้นเปลือง" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Low stock alert */}
        {lowItems.length > 0 && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
            <AlertTriangle size={18} className="text-red-600 shrink-0" />
            <span className="text-sm text-red-700 font-medium">
              มี {lowItems.length} รายการที่สต็อกต่ำกว่าเกณฑ์ขั้นต่ำ:{' '}
              <span className="font-semibold">{lowItems.map((i) => i.name).join(', ')}</span>
            </span>
          </div>
        )}

        {/* Tabs + Add button */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setEditItem(null); setForm(emptyForm); setShowAddDialog(true) }}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            <Plus size={16} /> เพิ่มสินค้า
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['ชื่อสินค้า', 'หมวดหมู่', 'สต็อกปัจจุบัน', 'ขั้นต่ำ / สูงสุด', 'ต้นทุน/หน่วย', 'ผู้จัดจำหน่าย', 'เติมสต็อกล่าสุด', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((item) => {
                  const level = getStockLevel(item)
                  const colors = stockColors[level]
                  const pct = Math.min(100, Math.round((item.currentStock / item.maxStock) * 100))
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{item.name}</div>
                        {item.notes && <div className="text-xs text-slate-400 mt-0.5">{item.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{categoryLabels[item.category]}</td>
                      <td className="px-4 py-3 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${colors.text}`}>{item.currentStock}</span>
                          <span className="text-slate-400 text-xs">{unitLabels[item.unit]}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 w-24">
                          <div className={`h-full rounded-full ${colors.bar} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className={`text-xs mt-1 ${colors.text}`}>
                          {level === 'critical' ? 'ต่ำกว่าเกณฑ์' : level === 'low' ? 'ใกล้หมด' : 'ปกติ'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        <div>ขั้นต่ำ: {item.minStock}</div>
                        <div>สูงสุด: {item.maxStock}</div>
                      </td>
                      <td className="px-4 py-3">{formatCurrency(item.costPerUnit)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{item.supplier ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDateTime(item.lastRestocked)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setStockDialog({ item, mode: 'restock' }); setStockQty(0); setStockNote('') }}
                            title="เติมสต็อก"
                            className="p-1.5 rounded hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors"
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            onClick={() => { setStockDialog({ item, mode: 'use' }); setStockQty(0); setStockNote('') }}
                            title="ใช้สต็อก"
                            className="p-1.5 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <button
                            onClick={() => { setStockDialog({ item, mode: 'adjust' }); setStockQty(item.currentStock); setStockNote('') }}
                            title="ปรับสต็อก"
                            className="p-1.5 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <RefreshCw size={14} />
                          </button>
                          <button
                            onClick={() => setHistoryItem(item)}
                            title="ดูประวัติทั้งหมด"
                            className="p-1.5 rounded hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors"
                          >
                            <History size={14} />
                          </button>
                          <button
                            onClick={() => openEdit(item)}
                            title="แก้ไข"
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(item)}
                            title="ลบ"
                            className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">ไม่มีสินค้าในหมวดนี้</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Movement history log */}
        {inventoryTransactions.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold text-slate-800">ประวัติการเคลื่อนไหว
                <span className="ml-2 text-xs font-normal text-slate-400">{globalFilteredTx.length} รายการ</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="ค้นหาชื่อสินค้า..."
                    className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 w-44"
                  />
                </div>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                  {([['all', 'ทั้งหมด'], ['restock', 'เติม'], ['use', 'เบิก'], ['adjust', 'ปรับ']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setHistoryType(k)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${historyType === k ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-3 font-medium">ประเภท</th>
                    <th className="py-2 pr-3 font-medium">สินค้า</th>
                    <th className="py-2 pr-3 font-medium text-right">จำนวน</th>
                    <th className="py-2 pr-3 font-medium hidden md:table-cell">ผู้ทำรายการ</th>
                    <th className="py-2 pr-3 font-medium hidden lg:table-cell">หมายเหตุ</th>
                    <th className="py-2 font-medium text-right">วันเวลา</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {globalFilteredTx.slice(0, 50).map((tx) => {
                    const item = inventoryItems.find((i) => i.id === tx.itemId)
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${txTypeColor[tx.type]}`}>{txTypeLabel[tx.type]}</span></td>
                        <td className="py-2.5 pr-3 text-slate-700">{item?.name ?? tx.itemId}</td>
                        <td className={`py-2.5 pr-3 text-right font-semibold ${tx.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{tx.quantity > 0 ? '+' : ''}{tx.quantity}</td>
                        <td className="py-2.5 pr-3 text-slate-500 hidden md:table-cell">{staffName(tx.performedBy)}</td>
                        <td className="py-2.5 pr-3 text-slate-400 hidden lg:table-cell">{tx.notes || (tx.referenceId ? `อ้างอิง: ${tx.referenceId}` : '–')}</td>
                        <td className="py-2.5 text-slate-400 text-xs text-right whitespace-nowrap">{formatDateTime(tx.date)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {globalFilteredTx.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">ไม่พบรายการที่ตรงกับเงื่อนไข</div>
              )}
              {globalFilteredTx.length > 50 && (
                <p className="text-center text-xs text-slate-400 pt-3">แสดง 50 รายการล่าสุด — ใช้ค้นหา/ตัวกรองเพื่อดูเฉพาะที่ต้องการ</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowAddDialog(false); setEditItem(null) }}>
          <div ref={addTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{editItem ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
              <button onClick={() => { setShowAddDialog(false); setEditItem(null) }} className="p-2 rounded-lg hover:bg-slate-100 transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="inv-name" className="block text-sm font-medium text-slate-700 mb-1.5">ชื่อสินค้า *</label>
                <input id="inv-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="เช่น สบู่ก้อน" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="inv-category" className="block text-sm font-medium text-slate-700 mb-1.5">หมวดหมู่</label>
                  <select id="inv-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as InventoryCategory })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none">
                    <option value="room_amenities">อุปกรณ์ห้องพัก</option>
                    <option value="minibar">มินิบาร์</option>
                    <option value="cleaning_supplies">วัสดุทำความสะอาด</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="inv-unit" className="block text-sm font-medium text-slate-700 mb-1.5">หน่วย</label>
                  <select id="inv-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as InventoryUnit })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none">
                    <option value="piece">ชิ้น</option>
                    <option value="bottle">ขวด</option>
                    <option value="pack">แพ็ค</option>
                    <option value="set">ชุด</option>
                    <option value="liter">ลิตร</option>
                    <option value="kg">กก.</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="inv-current" className="block text-sm font-medium text-slate-700 mb-1.5">สต็อกปัจจุบัน</label>
                  <input id="inv-current" type="number" min={0} value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: +e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="inv-min" className="block text-sm font-medium text-slate-700 mb-1.5">ขั้นต่ำ</label>
                  <input id="inv-min" type="number" min={0} value={form.minStock} onChange={(e) => setForm({ ...form, minStock: +e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="inv-max" className="block text-sm font-medium text-slate-700 mb-1.5">สูงสุด</label>
                  <input id="inv-max" type="number" min={0} value={form.maxStock} onChange={(e) => setForm({ ...form, maxStock: +e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="inv-cost" className="block text-sm font-medium text-slate-700 mb-1.5">ต้นทุน/หน่วย (บาท)</label>
                  <input id="inv-cost" type="number" min={0} value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: +e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="inv-supplier" className="block text-sm font-medium text-slate-700 mb-1.5">ผู้จัดจำหน่าย</label>
                  <input id="inv-supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" placeholder="ชื่อบริษัท" />
                </div>
              </div>
              <div>
                <label htmlFor="inv-notes" className="block text-sm font-medium text-slate-700 mb-1.5">หมายเหตุ</label>
                <input id="inv-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => { setShowAddDialog(false); setEditItem(null) }} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={handleSaveItem} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* Stock action dialog */}
      {stockDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setStockDialog(null)}>
          <div ref={stockTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-sm focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">
                {stockDialog.mode === 'restock' ? 'เติมสต็อก' : stockDialog.mode === 'use' ? 'ใช้สต็อก' : 'ปรับสต็อก'}: {stockDialog.item.name}
              </h2>
              <button onClick={() => setStockDialog(null)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-between text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-3">
                <span>สต็อกปัจจุบัน</span>
                <span className="font-semibold">{stockDialog.item.currentStock} {unitLabels[stockDialog.item.unit]}</span>
              </div>
              <div>
                <label htmlFor="inv-stock-qty" className="block text-sm font-medium text-slate-700 mb-1.5">
                  {stockDialog.mode === 'adjust' ? 'สต็อกใหม่' : 'จำนวน'}
                </label>
                <input id="inv-stock-qty"
                  type="number"
                  min={0}
                  max={stockDialog.mode === 'use' ? stockDialog.item.currentStock : undefined}
                  value={stockQty}
                  onChange={(e) => {
                    const v = Math.max(0, +e.target.value)
                    setStockQty(stockDialog.mode === 'use' ? Math.min(stockDialog.item.currentStock, v) : v)
                  }}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {stockDialog.mode === 'use' && (
                  <p className="text-xs text-slate-400 mt-1.5">ใช้ได้สูงสุด {stockDialog.item.currentStock} {unitLabels[stockDialog.item.unit]}</p>
                )}
              </div>
              <div>
                <label htmlFor="inv-stock-note" className="block text-sm font-medium text-slate-700 mb-1.5">หมายเหตุ</label>
                <input id="inv-stock-note" value={stockNote} onChange={(e) => setStockNote(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" placeholder="ไม่บังคับ" />
              </div>
              {/* Recent transactions for this item */}
              {inventoryTransactions.filter((t) => t.itemId === stockDialog.item.id).length > 0 && (
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-2">ประวัติล่าสุด</div>
                  {inventoryTransactions.filter((t) => t.itemId === stockDialog.item.id).slice(0, 3).map((tx) => (
                    <div key={tx.id} className="flex justify-between text-xs text-slate-500 py-1 border-b border-slate-50">
                      <span>{{ restock: 'เติม', use: 'ใช้', adjust: 'ปรับ', waste: 'เสีย' }[tx.type]}</span>
                      <span className={tx.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}>{tx.quantity > 0 ? '+' : ''}{tx.quantity}</span>
                      <span>{formatDateTime(tx.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setStockDialog(null)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button
                onClick={handleStockAction}
                className={`px-5 py-2.5 text-white rounded-lg text-sm font-medium ${stockDialog.mode === 'restock' ? 'bg-emerald-500 hover:bg-emerald-600' : stockDialog.mode === 'use' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-500 hover:bg-blue-600'}`}
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeleteConfirm(null)}>
          <div ref={deleteTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-sm focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <AlertTriangle size={18} />
                <h2 className="font-semibold">ยืนยันการลบ</h2>
              </div>
              <p className="text-sm text-slate-600 mt-2">
                ลบรายการ <span className="font-semibold">&ldquo;{deleteConfirm.name}&rdquo;</span> ออกจากคลังถาวร?
              </p>
              <p className="text-xs text-slate-400 mt-1">การกระทำนี้ย้อนกลับไม่ได้</p>
            </div>
            <div className="flex justify-end gap-3 p-4">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium">ลบถาวร</button>
            </div>
          </div>
        </div>
      )}

      {/* Per-item full history ledger */}
      {historyItem && (() => {
        const ledger = itemHistory(historyItem)
        const restockTotal = ledger.filter((r) => r.tx.quantity > 0).reduce((s, r) => s + r.tx.quantity, 0)
        const outTotal = ledger.filter((r) => r.tx.quantity < 0).reduce((s, r) => s + r.tx.quantity, 0)
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setHistoryItem(null)}>
            <div ref={historyTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col focus:outline-none" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div>
                  <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                    <History size={17} className="text-violet-600" /> ประวัติการเคลื่อนไหว: {historyItem.name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    สต็อกปัจจุบัน <span className="font-semibold text-slate-600">{historyItem.currentStock} {unitLabels[historyItem.unit]}</span>
                    {' · '}{ledger.length} รายการ
                    {' · '}<span className="text-emerald-600">รับเข้า +{restockTotal}</span>
                    {' · '}<span className="text-red-600">จ่ายออก {outTotal}</span>
                  </p>
                </div>
                <button onClick={() => setHistoryItem(null)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
              </div>
              <div className="overflow-y-auto p-5">
                {ledger.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">ยังไม่มีประวัติการเคลื่อนไหวของสินค้านี้</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                        <th className="py-2 pr-3 font-medium">ประเภท</th>
                        <th className="py-2 pr-3 font-medium text-right">จำนวน</th>
                        <th className="py-2 pr-3 font-medium text-right">คงเหลือหลังรายการ</th>
                        <th className="py-2 pr-3 font-medium">ผู้ทำรายการ</th>
                        <th className="py-2 pr-3 font-medium">หมายเหตุ</th>
                        <th className="py-2 font-medium text-right">วันเวลา</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {ledger.map(({ tx, balanceAfter }) => (
                        <tr key={tx.id} className="hover:bg-slate-50">
                          <td className="py-2.5 pr-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${txTypeColor[tx.type]}`}>{txTypeLabel[tx.type]}</span></td>
                          <td className={`py-2.5 pr-3 text-right font-semibold ${tx.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{tx.quantity > 0 ? '+' : ''}{tx.quantity}</td>
                          <td className="py-2.5 pr-3 text-right font-medium text-slate-700">{balanceAfter} {unitLabels[historyItem.unit]}</td>
                          <td className="py-2.5 pr-3 text-slate-500">{staffName(tx.performedBy)}</td>
                          <td className="py-2.5 pr-3 text-slate-400">{tx.notes || (tx.referenceId ? `อ้างอิง: ${tx.referenceId}` : '–')}</td>
                          <td className="py-2.5 text-slate-400 text-xs text-right whitespace-nowrap">{formatDateTime(tx.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
                <button onClick={() => setHistoryItem(null)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ปิด</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
