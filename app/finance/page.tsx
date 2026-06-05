'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate, formatDateTime, getPaymentMethodLabel, toLocalDateKey, sumRealizedRevenue } from '@/lib/utils'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { downloadExcel, dateStamp } from '@/lib/export-excel'
import type { InvoiceStatus, CorporateAccount } from '@/types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'
import { Plus, X, Building2, History, Download } from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'
import { toast } from 'sonner'

const statusColors: Record<InvoiceStatus, string> = {
  draft: 'text-slate-600 bg-slate-100',
  issued: 'text-blue-700 bg-blue-100',
  paid: 'text-emerald-700 bg-emerald-100',
  refunded: 'text-red-700 bg-red-100',
}

const statusLabels: Record<InvoiceStatus, string> = {
  draft: 'ร่าง', issued: 'ออกใบแจ้งหนี้', paid: 'ชำระแล้ว', refunded: 'คืนเงินแล้ว'
}

const corpStatusColors: Record<string, string> = {
  active: 'text-emerald-700 bg-emerald-100',
  suspended: 'text-amber-700 bg-amber-100',
  closed: 'text-slate-600 bg-slate-100',
}
const corpStatusLabels: Record<string, string> = {
  active: 'ใช้งาน', suspended: 'ระงับ', closed: 'ปิดบัญชี',
}

const PAYMENT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444']

const emptyCorpForm = {
  companyName: '', contactPerson: '', contactPhone: '', contactEmail: '',
  taxId: '', address: '', status: 'active' as const, notes: '',
}

export default function FinancePage() {
  const { invoices, bookings, guests, corporateAccounts, corporateTransactions, bookingAddOns, addCorporateAccount, depositToAccount, logAudit } = useHotelStore()
  const { user } = useAuthStore()
  // หน้านี้เข้าได้ด้วย canViewFinance แต่ "จัดการ" (เพิ่มบัญชี/ฝากเงิน) ต้องมี canManageFinance
  const canManageFinance = user?.staff.permissions.canManageFinance ?? false
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'corporate'>('overview')
  // ช่วงวันที่สำหรับกรองตอนส่งออกใบแจ้งหนี้ (ตามวันที่ออกใบ)
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')

  // Corporate state
  const [showCorpForm, setShowCorpForm] = useState(false)
  const [corpForm, setCorpForm] = useState(emptyCorpForm)
  const [depositDialog, setDepositDialog] = useState<CorporateAccount | null>(null)
  const [depositAmount, setDepositAmount] = useState(0)
  const [depositNote, setDepositNote] = useState('')
  const [historyAccount, setHistoryAccount] = useState<CorporateAccount | null>(null)
  const corpTrapRef = useFocusTrap<HTMLDivElement>(showCorpForm, () => setShowCorpForm(false))
  const depositTrapRef = useFocusTrap<HTMLDivElement>(!!depositDialog, () => setDepositDialog(null))
  const historyTrapRef = useFocusTrap<HTMLDivElement>(!!historyAccount, () => setHistoryAccount(null))

  // รายได้รับรู้ทั้งหมด — เกณฑ์เดียวกับ dashboard/reports/daily-report และกราฟ 7 วันด้านล่าง
  // (รับรู้ตอนเช็คเอาท์) เพื่อไม่ให้เลข "รายได้" ในหน้าเดียวขัดกันเอง
  const totalRevenue = sumRealizedRevenue(bookings, bookingAddOns)
  // รอชำระ = เฉพาะส่วนที่ยังไม่จ่ายของแต่ละใบ (ยอดใบ − ยอดที่จ่ายของ booking นั้น) ไม่ใช่ยอดเต็มใบ
  const pendingAmount = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'refunded')
    .reduce((s, i) => {
      const b = bookings.find((x) => x.id === i.bookingId)
      const paid = b ? b.paidAmount : 0
      return s + Math.max(0, i.total - paid)
    }, 0)

  const revenueChart = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const day = toLocalDateKey(d)
    const revenue = sumRealizedRevenue(bookings, bookingAddOns, (b) => b.checkOut.startsWith(day))
    return { date: format(parseISO(day), 'dd MMM', { locale: th }), รายได้: revenue }
  })

  const paymentMethodData = [
    { name: 'บัตรเครดิต', value: bookings.filter((b) => b.paymentMethod === 'credit_card' && b.status !== 'cancelled').length },
    { name: 'QR Code', value: bookings.filter((b) => b.paymentMethod === 'qr_code' && b.status !== 'cancelled').length },
    { name: 'โอนเงิน', value: bookings.filter((b) => b.paymentMethod === 'bank_transfer' && b.status !== 'cancelled').length },
    { name: 'เงินสด', value: bookings.filter((b) => b.paymentMethod === 'cash' && b.status !== 'cancelled').length },
    { name: 'บัตรเดบิต', value: bookings.filter((b) => b.paymentMethod === 'debit_card' && b.status !== 'cancelled').length },
  ].filter((d) => d.value > 0)

  // ===== ส่งออก Excel (.xlsx) เฉพาะข้อมูลการเงิน =====
  const m = (n: number) => Math.round(n * 100) / 100 // ปัดทศนิยม 2 ตำแหน่ง กัน floating-point เพี้ยน
  const subtitleNow = `ข้อมูล ณ ${formatDate(new Date().toISOString())}`

  async function exportOverview() {
    await downloadExcel({
      filename: `การเงิน-สรุป-${dateStamp()}`,
      sheetName: 'สรุปการเงิน',
      title: 'สรุปการเงิน',
      subtitle: subtitleNow,
      tables: [
        {
          columns: [{ header: 'รายการ', width: 24 }, { header: 'จำนวนเงิน (บาท)', money: true, width: 18 }],
          rows: [
            ['รายได้ที่ชำระแล้ว', m(totalRevenue)],
            ['รอชำระ', m(pendingAmount)],
            ['จำนวนใบแจ้งหนี้', invoices.length],
          ],
        },
        {
          heading: 'รายได้ 7 วันย้อนหลัง',
          columns: [{ header: 'วันที่', width: 16 }, { header: 'รายได้ (บาท)', money: true, width: 18 }],
          rows: revenueChart.map((r) => [r.date, m(r.รายได้)]),
        },
      ],
    })
    toast.success('ส่งออกสรุปการเงินเป็น Excel แล้ว')
  }

  async function exportInvoices() {
    // กรองตามช่วงวันที่ออกใบ (ถ้าระบุ)
    const filtered = invoices.filter((inv) => {
      const day = inv.issuedAt.split('T')[0]
      if (exportFrom && day < exportFrom) return false
      if (exportTo && day > exportTo) return false
      return true
    })
    if (filtered.length === 0) {
      toast.error('ไม่มีใบแจ้งหนี้ในช่วงวันที่เลือก')
      return
    }
    const rangeLabel = exportFrom || exportTo
      ? ` (${exportFrom ? formatDate(exportFrom) : 'เริ่มต้น'} – ${exportTo ? formatDate(exportTo) : 'ปัจจุบัน'})`
      : ''
    await downloadExcel({
      filename: `ใบแจ้งหนี้-${dateStamp()}`,
      sheetName: 'ใบแจ้งหนี้',
      title: `รายการใบแจ้งหนี้${rangeLabel}`,
      subtitle: subtitleNow,
      tables: [{
        columns: [
          { header: 'เลขที่ใบแจ้งหนี้' }, { header: 'แขก' },
          { header: 'ยอดรวม (บาท)', money: true },
          { header: 'วิธีชำระ' }, { header: 'วันที่ออก' }, { header: 'สถานะ' },
        ],
        rows: filtered.map((inv) => {
          const guest = guests.find((g) => g.id === inv.guestId)
          return [
            inv.id, guest?.name ?? '-',
            m(inv.total),
            getPaymentMethodLabel(inv.paymentMethod ?? ''), formatDate(inv.issuedAt), statusLabels[inv.status],
          ]
        }),
        totalRow: ['', 'รวม', m(filtered.reduce((s, i) => s + i.total, 0)), '', '', ''],
      }],
    })
    toast.success(`ส่งออกใบแจ้งหนี้ ${filtered.length} รายการแล้ว`)
  }

  async function exportCorporate() {
    await downloadExcel({
      filename: `เครดิตองค์กร-${dateStamp()}`,
      sheetName: 'เครดิตองค์กร',
      title: 'บัญชีเครดิตองค์กร',
      subtitle: subtitleNow,
      tables: [{
        columns: [
          { header: 'บริษัท' }, { header: 'ผู้ติดต่อ' }, { header: 'เบอร์โทร' }, { header: 'เลขภาษี' },
          { header: 'ยอดฝากสะสม (บาท)', money: true }, { header: 'ยอดใช้ไป (บาท)', money: true }, { header: 'ยอดคงเหลือ (บาท)', money: true },
          { header: 'สถานะ' },
        ],
        rows: corporateAccounts.map((acc) => [
          acc.companyName, acc.contactPerson, acc.contactPhone ?? '', acc.taxId ?? '',
          m(acc.totalDeposited), m(acc.totalUsed), m(acc.availableBalance), corpStatusLabels[acc.status],
        ]),
      }],
    })
    toast.success(`ส่งออกบัญชีองค์กร ${corporateAccounts.length} รายการแล้ว`)
  }

  return (
    <div className="flex flex-col h-screen">
      <Header title="การเงิน & การชำระเงิน" subtitle="ภาพรวมรายได้และการเงิน" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="text-sm text-slate-500 mb-2">รายได้รับรู้ทั้งหมด</div>
            <div className="text-2xl font-bold text-emerald-600">{formatCurrency(totalRevenue)}</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="text-sm text-slate-500 mb-2">รอชำระ</div>
            <div className="text-2xl font-bold text-amber-600">{formatCurrency(pendingAmount)}</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="text-sm text-slate-500 mb-2">ใบแจ้งหนี้ทั้งหมด</div>
            <div className="text-2xl font-bold text-slate-800">{invoices.length} ใบ</div>
          </div>
        </div>

        {/* Tabs + Export */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
            {([['overview', 'ภาพรวม'], ['invoices', 'ใบแจ้งหนี้'], ['corporate', 'เครดิตองค์กร']] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {activeTab === 'invoices' && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>ช่วงวันที่:</span>
                <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <span>–</span>
                <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                {(exportFrom || exportTo) && (
                  <button onClick={() => { setExportFrom(''); setExportTo('') }} className="text-slate-400 hover:text-slate-600 px-1" title="ล้างช่วงวันที่">✕</button>
                )}
              </div>
            )}
            <button
              onClick={activeTab === 'overview' ? exportOverview : activeTab === 'invoices' ? exportInvoices : exportCorporate}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0"
              title="ดาวน์โหลดเป็นไฟล์ Excel (.xlsx)"
            >
              <Download size={16} /> ส่งออก Excel
            </button>
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h2 className="font-semibold text-slate-800 mb-4">รายได้ 7 วันย้อนหลัง</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'รายได้']} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="รายได้" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
              <h2 className="font-semibold text-slate-800 mb-4">สัดส่วนวิธีชำระเงิน</h2>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={paymentMethodData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                    {paymentMethodData.map((_, i) => <Cell key={i} fill={PAYMENT_COLORS[i % PAYMENT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

          </div>
        )}

        {activeTab === 'invoices' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {['เลขที่ใบแจ้งหนี้', 'แขก', 'ยอดรวม', 'วิธีชำระ', 'วันที่ออก', 'สถานะ'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {invoices.map((inv) => {
                    const guest = guests.find((g) => g.id === inv.guestId)
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{inv.id}</td>
                        <td className="px-4 py-3 font-medium">{guest?.name ?? '-'}</td>
                        <td className="px-4 py-3 font-semibold">{formatCurrency(inv.total)}</td>
                        <td className="px-4 py-3 text-slate-500">{getPaymentMethodLabel(inv.paymentMethod ?? '')}</td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(inv.issuedAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[inv.status]}`}>
                            {statusLabels[inv.status]}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'corporate' && (
          <div className="space-y-5">
            {/* KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
                <div className="text-sm text-slate-500 mb-2">บัญชีที่ใช้งาน</div>
                <div className="text-2xl font-bold text-slate-800">{corporateAccounts.filter((a) => a.status === 'active').length}</div>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
                <div className="text-sm text-slate-500 mb-2">ยอดฝากรวม</div>
                <div className="text-2xl font-bold text-blue-600">{formatCurrency(corporateAccounts.reduce((s, a) => s + a.totalDeposited, 0))}</div>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
                <div className="text-sm text-slate-500 mb-2">ยอดคงเหลือรวม</div>
                <div className="text-2xl font-bold text-emerald-600">{formatCurrency(corporateAccounts.reduce((s, a) => s + a.availableBalance, 0))}</div>
              </div>
            </div>

            {/* Table + add button */}
            {canManageFinance && (
              <div className="flex justify-end">
                <button
                  onClick={() => { setCorpForm(emptyCorpForm); setShowCorpForm(true) }}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus size={16} /> เพิ่มบัญชีองค์กร
                </button>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {['บริษัท', 'ผู้ติดต่อ', 'ยอดฝากสะสม', 'ยอดใช้ไป', 'ยอดคงเหลือ', 'สถานะ', ''].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-medium text-slate-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {corporateAccounts.map((acc) => {
                      const pct = acc.totalDeposited > 0 ? Math.round((acc.availableBalance / acc.totalDeposited) * 100) : 0
                      return (
                        <tr key={acc.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800 flex items-center gap-2"><Building2 size={14} className="text-slate-400" />{acc.companyName}</div>
                            {acc.taxId && <div className="text-xs text-slate-400 mt-0.5">เลขภาษี: {acc.taxId}</div>}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <div>{acc.contactPerson}</div>
                            <div className="text-xs text-slate-400">{acc.contactPhone}</div>
                          </td>
                          <td className="px-4 py-3 font-medium">{formatCurrency(acc.totalDeposited)}</td>
                          <td className="px-4 py-3 text-red-600">{formatCurrency(acc.totalUsed)}</td>
                          <td className="px-4 py-3 min-w-[160px]">
                            <div className="font-semibold text-emerald-700">{formatCurrency(acc.availableBalance)}</div>
                            <div className="h-1.5 bg-slate-100 rounded-full mt-1.5">
                              <div className={`h-full rounded-full transition-all ${pct > 30 ? 'bg-emerald-500' : pct > 10 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${corpStatusColors[acc.status]}`}>
                              {corpStatusLabels[acc.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {canManageFinance && (
                                <button
                                  onClick={() => { setDepositDialog(acc); setDepositAmount(0); setDepositNote('') }}
                                  className="px-2.5 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium transition-colors"
                                >
                                  ฝากเงิน
                                </button>
                              )}
                              <button
                                onClick={() => setHistoryAccount(acc)}
                                title="ประวัติธุรกรรม"
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                              >
                                <History size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {corporateAccounts.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-12 text-slate-400">ยังไม่มีบัญชีองค์กร</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add corporate account dialog */}
      {showCorpForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCorpForm(false)}>
          <div ref={corpTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">เพิ่มบัญชีองค์กร</h2>
              <button onClick={() => setShowCorpForm(false)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="fin-corp-name" className="block text-sm font-medium text-slate-700 mb-1.5">ชื่อบริษัท *</label>
                <input id="fin-corp-name" value={corpForm.companyName} onChange={(e) => setCorpForm({ ...corpForm, companyName: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="บริษัท ... จำกัด" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="fin-corp-contact" className="block text-sm font-medium text-slate-700 mb-1.5">ผู้ติดต่อ *</label>
                  <input id="fin-corp-contact" value={corpForm.contactPerson} onChange={(e) => setCorpForm({ ...corpForm, contactPerson: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="fin-corp-phone" className="block text-sm font-medium text-slate-700 mb-1.5">เบอร์โทร</label>
                  <input id="fin-corp-phone" value={corpForm.contactPhone} onChange={(e) => setCorpForm({ ...corpForm, contactPhone: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="fin-corp-email" className="block text-sm font-medium text-slate-700 mb-1.5">อีเมล</label>
                  <input id="fin-corp-email" value={corpForm.contactEmail} onChange={(e) => setCorpForm({ ...corpForm, contactEmail: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="fin-corp-taxid" className="block text-sm font-medium text-slate-700 mb-1.5">เลขประจำตัวผู้เสียภาษี</label>
                  <input id="fin-corp-taxid" value={corpForm.taxId} onChange={(e) => setCorpForm({ ...corpForm, taxId: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                </div>
              </div>
              <div>
                <label htmlFor="fin-corp-address" className="block text-sm font-medium text-slate-700 mb-1.5">ที่อยู่</label>
                <input id="fin-corp-address" value={corpForm.address} onChange={(e) => setCorpForm({ ...corpForm, address: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
              </div>
              <div>
                <label htmlFor="fin-corp-notes" className="block text-sm font-medium text-slate-700 mb-1.5">หมายเหตุ</label>
                <input id="fin-corp-notes" value={corpForm.notes} onChange={(e) => setCorpForm({ ...corpForm, notes: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowCorpForm(false)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button
                onClick={() => {
                  if (!corpForm.companyName || !corpForm.contactPerson) return
                  addCorporateAccount(corpForm)
                  logAudit({ category: 'corporate', action: 'add_account', summary: `เพิ่มบัญชีองค์กร "${corpForm.companyName}"` })
                  toast.success(`เพิ่มบัญชี "${corpForm.companyName}" แล้ว`)
                  setShowCorpForm(false)
                }}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit dialog */}
      {depositDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDepositDialog(null)}>
          <div ref={depositTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-sm focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">ฝากเงิน: {depositDialog.companyName}</h2>
              <button onClick={() => setDepositDialog(null)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-between text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-3">
                <span>ยอดคงเหลือปัจจุบัน</span>
                <span className="font-semibold text-emerald-700">{formatCurrency(depositDialog.availableBalance)}</span>
              </div>
              <div>
                <label htmlFor="fin-deposit-amount" className="block text-sm font-medium text-slate-700 mb-1.5">จำนวนเงิน (บาท) *</label>
                <input id="fin-deposit-amount" type="number" min={1} value={depositAmount || ''} onChange={(e) => setDepositAmount(+e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
              </div>
              <div>
                <label htmlFor="fin-deposit-note" className="block text-sm font-medium text-slate-700 mb-1.5">หมายเหตุ</label>
                <input id="fin-deposit-note" value={depositNote} onChange={(e) => setDepositNote(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none" placeholder="ไม่บังคับ" />
              </div>
              {depositAmount > 0 && (
                <div className="flex justify-between text-sm bg-emerald-50 rounded-lg px-4 py-3 border border-emerald-200">
                  <span className="text-emerald-700">ยอดหลังฝาก</span>
                  <span className="font-bold text-emerald-700">{formatCurrency(depositDialog.availableBalance + depositAmount)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setDepositDialog(null)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button
                onClick={() => {
                  if (!depositAmount || !user) return
                  depositToAccount(depositDialog.id, depositAmount, user.staff.id, depositNote || undefined)
                  logAudit({ category: 'corporate', action: 'deposit', summary: `ฝาก ${depositAmount.toLocaleString()} บาท เข้า ${depositDialog.companyName}`, entityId: depositDialog.id })
                  toast.success(`ฝากเงิน ${depositAmount.toLocaleString()} บาท เข้าบัญชี ${depositDialog.companyName}`)
                  setDepositDialog(null)
                }}
                className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium"
              >
                ยืนยันการฝาก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction history dialog */}
      {historyAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setHistoryAccount(null)}>
          <div ref={historyTrapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <h2 className="font-semibold text-slate-800">ประวัติธุรกรรม: {historyAccount.companyName}</h2>
              <button onClick={() => setHistoryAccount(null)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto p-5 space-y-2">
              {corporateTransactions.filter((t) => t.corporateAccountId === historyAccount.id).map((tx) => {
                const typeLabel = { deposit: 'ฝากเงิน', charge: 'ตัดเครดิต', refund: 'คืนเงิน', adjustment: 'ปรับ' }[tx.type]
                const typeColor = { deposit: 'text-blue-700 bg-blue-100', charge: 'text-red-700 bg-red-100', refund: 'text-emerald-700 bg-emerald-100', adjustment: 'text-slate-600 bg-slate-100' }[tx.type]
                return (
                  <div key={tx.id} className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${typeColor}`}>{typeLabel}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-700 truncate">{tx.notes || (tx.bookingId ? `การจอง: ${tx.bookingId}` : '-')}</div>
                      <div className="text-xs text-slate-400">{formatDateTime(tx.date)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-semibold text-sm ${tx.type === 'deposit' || tx.type === 'refund' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {tx.type === 'deposit' || tx.type === 'refund' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </div>
                      <div className="text-xs text-slate-400">คงเหลือ: {formatCurrency(tx.balanceAfter)}</div>
                    </div>
                  </div>
                )
              })}
              {corporateTransactions.filter((t) => t.corporateAccountId === historyAccount.id).length === 0 && (
                <div className="text-center py-8 text-slate-400">ยังไม่มีธุรกรรม</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
