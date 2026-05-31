'use client'
import { useState } from 'react'
import { useHotelStore } from '@/lib/store'
import Header from '@/components/layout/Header'
import { formatCurrency, formatDate, formatDateTime, getPaymentMethodLabel, getBookingSourceLabel, todayLocal, getGuestDisplayName, calcAddOnTotal, bookingOccupiesDay, bookingRevenue } from '@/lib/utils'
import { downloadExcel } from '@/lib/export-excel'
import { Printer, Calendar, LogIn, LogOut, DollarSign, ShoppingBag, Wrench, Hotel as HotelIcon, UserPlus, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
// แปลง YYYY-MM-DD → "8 พฤษภาคม 2569" (ปี พ.ศ.)
function thaiDateBE(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`)
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
}
const WING_LABEL: Record<string, string> = { front: 'อาคารหน้า', back: 'อาคารหลัง' }

export default function DailyReportPage() {
  const { bookings, guests, rooms, invoices, bookingAddOns, addOnItems, housekeepingTasks, maintenanceLogs } = useHotelStore()
  const [date, setDate] = useState(() => todayLocal())

  const onDate = (iso?: string) => !!iso && iso.split('T')[0] === date

  // Check-ins ที่เช็คอินจริงในวันนั้น (status checked_in หรือ checked_out ที่ checkIn ตรงวัน)
  const checkInsToday = bookings.filter((b) =>
    ['checked_in', 'checked_out'].includes(b.status) && onDate(b.checkIn)
  )

  // Check-outs ที่เกิดวันนี้ (checked_out + checkOut ตรงวัน)
  const checkOutsToday = bookings.filter((b) => b.status === 'checked_out' && onDate(b.checkOut))
  const checkOutRevenue = checkOutsToday.reduce((s, b) => s + bookingRevenue(b, bookingAddOns), 0)

  // Walk-ins (source walk_in + createdAt วันนี้)
  const walkInsToday = bookings.filter((b) => b.source === 'walk_in' && onDate(b.createdAt))
  const walkInRevenue = walkInsToday.reduce((s, b) => s + bookingRevenue(b, bookingAddOns), 0)

  // Payments received วันนี้
  type PaymentEntry = { bookingId: string; guestName: string; amount: number; method: string; time: string }
  const payments: PaymentEntry[] = []
  for (const b of bookings) {
    if (!b.payments) continue
    for (const p of b.payments) {
      if (onDate(p.date)) {
        payments.push({ bookingId: b.id, guestName: getGuestDisplayName(b, guests), amount: p.amount, method: p.method, time: p.date })
      }
    }
  }
  const totalPaymentsReceived = payments.reduce((s, p) => s + p.amount, 0)

  // Add-ons fulfilled วันนี้
  const addOnsToday = bookingAddOns.filter((a) => a.status === 'fulfilled' && onDate(a.fulfilledAt))
  const addOnRevenue = addOnsToday.reduce((s, a) => s + a.totalPrice, 0)

  // Housekeeping completed วันนี้
  const hkToday = housekeepingTasks.filter((t) => t.status === 'completed' && onDate(t.completedAt))

  // Maintenance reported วันนี้
  const maintToday = maintenanceLogs.filter((m) => onDate(m.reportedAt))

  // Invoices issued วันนี้
  const invoicesToday = invoices.filter((iv) => onDate(iv.issuedAt))
  const invoiceTotal = invoicesToday.reduce((s, iv) => s + iv.total, 0)

  // ห้องที่เข้าพักอยู่ในวันที่เลือก (occupancy — นับ booking ที่ครอบครองคืนนั้น)
  const occupied = bookings.filter((b) => bookingOccupiesDay(b, date)).length
  const total = rooms.length

  // ===== ส่งออก Excel: รายงานเข้าพัก + การชำระเงินรายห้อง ของวันที่เลือก =====
  function exportDailyExcel() {
    // booking ที่เกี่ยวข้องกับวันนี้ (พักอยู่ + เข้า/ออกวันนี้) ไม่รวมที่ยกเลิก
    const stays = bookings.filter((b) =>
      b.status !== 'cancelled' &&
      b.checkIn.split('T')[0] <= date &&
      b.checkOut.split('T')[0] >= date
    )
    if (stays.length === 0) {
      toast.error('ไม่มีรายการเข้าพักในวันที่เลือก')
      return
    }

    type Row = { wing: string; room: string; guest: string; ci: string; co: string; nights: number; amount: number; cash: number; transfer: number; outstanding: number; status: string }
    const computed: Row[] = stays.map((b) => {
      const room = rooms.find((r) => r.id === b.roomId)
      const addOnTotal = calcAddOnTotal(b.id, bookingAddOns)
      const totalCharge = b.totalAmount + addOnTotal
      let cash = 0, transfer = 0
      if (b.payments && b.payments.length) {
        for (const p of b.payments) { if (p.method === 'cash') cash += p.amount; else transfer += p.amount }
      } else if (b.paidAmount > 0) {
        if (b.paymentMethod === 'cash') cash = b.paidAmount; else transfer = b.paidAmount
      }
      const outstanding = Math.max(0, totalCharge - b.paidAmount)
      const status = outstanding <= 0 ? 'ชำระแล้ว' : b.paidAmount > 0 ? 'ชำระบางส่วน' : 'ค้างชำระ'
      return {
        wing: room?.wing ?? '-', room: room?.number ?? '–', guest: getGuestDisplayName(b, guests),
        ci: formatDate(b.checkIn), co: formatDate(b.checkOut), nights: b.nights,
        amount: Math.round(totalCharge * 100) / 100, cash: Math.round(cash * 100) / 100,
        transfer: Math.round(transfer * 100) / 100, outstanding: Math.round(outstanding * 100) / 100, status,
      }
    })

    const columns = [
      { header: 'ห้อง', width: 12 },
      { header: 'ชื่อผู้เข้าพัก', width: 22 },
      { header: 'เช็คอิน', width: 13, align: 'center' as const },
      { header: 'เช็คเอาต์', width: 13, align: 'center' as const },
      { header: 'จำนวนคืน', width: 9, align: 'center' as const },
      { header: 'จำนวนเงิน', width: 13, money: true },
      { header: 'สด', width: 12, money: true },
      { header: 'โอน', width: 12, money: true },
      { header: 'ค้างชำระ', width: 13, money: true },
      { header: 'สถานะ', width: 13, align: 'center' as const },
    ]
    const toDataRow = (x: Row) => [x.room, x.guest, x.ci, x.co, x.nights, x.amount, x.cash, x.transfer, x.outstanding, x.status]
    const sum = (rows: Row[], k: 'amount' | 'cash' | 'transfer' | 'outstanding') =>
      Math.round(rows.reduce((s, r) => s + r[k], 0) * 100) / 100

    // จัดกลุ่มตามอาคาร (wing) เรียงห้องในแต่ละกลุ่ม
    const wings = Array.from(new Set(computed.map((r) => r.wing)))
    const tables = wings.map((w) => {
      const items = computed.filter((r) => r.wing === w).sort((a, b) => a.room.localeCompare(b.room, 'th', { numeric: true }))
      return {
        heading: `${WING_LABEL[w] ?? w} (${items.length} ห้อง)`,
        columns,
        rows: items.map(toDataRow),
        totalRow: ['', `รวม ${items.length} ห้อง`, '', '', '', sum(items, 'amount'), sum(items, 'cash'), sum(items, 'transfer'), sum(items, 'outstanding'), ''],
      }
    })

    // แถวสรุปรวมทั้งหมด (เมื่อมีมากกว่า 1 อาคาร)
    if (wings.length > 1) {
      tables.push({
        heading: 'สรุปรวมทั้งหมด',
        columns,
        rows: [],
        totalRow: ['', `รวม ${computed.length} ห้อง`, '', '', '', sum(computed, 'amount'), sum(computed, 'cash'), sum(computed, 'transfer'), sum(computed, 'outstanding'), ''],
      })
    }

    downloadExcel({
      filename: `รายงานประจำวัน-${date}`,
      sheetName: 'ประจำวัน',
      title: `รายงานประจำวันที่ ${thaiDateBE(date)}`,
      subtitle: 'Pruksatara Park & Resort · โทร 011-344, 098-753-2109',
      tables,
    })
    toast.success(`ส่งออกรายงานประจำวัน ${computed.length} ห้องแล้ว`)
  }

  return (
    <div className="flex flex-col h-screen">
      <Header title="รายงานประจำวัน" subtitle="สรุปกิจกรรมและรายได้ของวัน" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Controls */}
        <div className="no-print flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-slate-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportDailyExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <FileSpreadsheet size={15} /> ส่งออก Excel
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Printer size={15} /> พิมพ์รายงาน
            </button>
          </div>
        </div>

        {/* Print header */}
        <div className="print-color hidden print:block text-center mb-4">
          <h1 className="font-bold text-2xl">Pruksatara Park &amp; Resort</h1>
          <h2 className="text-lg mt-1">รายงานประจำวันที่ {formatDate(date)}</h2>
        </div>

        {/* KPI Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'เช็คอินวันนี้', value: checkInsToday.length, icon: <LogIn size={18} className="text-emerald-600" />, bg: 'bg-emerald-50 border-emerald-100' },
            { label: 'เช็คเอาต์วันนี้', value: checkOutsToday.length, icon: <LogOut size={18} className="text-amber-600" />, bg: 'bg-amber-50 border-amber-100' },
            { label: 'ยอดรับเงินวันนี้', value: formatCurrency(totalPaymentsReceived), icon: <DollarSign size={18} className="text-blue-600" />, bg: 'bg-blue-50 border-blue-100', isString: true },
            { label: 'ห้องเข้าพักอยู่', value: `${occupied}/${total}`, icon: <HotelIcon size={18} className="text-purple-600" />, bg: 'bg-purple-50 border-purple-100', isString: true },
          ].map((kpi) => (
            <div key={kpi.label} className={`${kpi.bg} rounded-xl p-4 border print-color`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">{kpi.label}</span>
                {kpi.icon}
              </div>
              <div className="text-xl font-bold text-slate-800">{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Check-ins */}
        <ReportSection title="รายการเช็คอิน" icon={<LogIn size={16} className="text-emerald-500" />} count={checkInsToday.length}>
          {checkInsToday.length === 0 ? (
            <Empty text="ไม่มีเช็คอินในวันนี้" />
          ) : (
            <ReportTable headers={['เวลา', 'ลูกค้า', 'ห้อง', 'ช่องทาง']}>
              {checkInsToday.map((b) => {
                const r = rooms.find((x) => x.id === b.roomId)
                return (
                  <tr key={b.id} className="border-b border-slate-50">
                    <td className="px-3 py-2 text-slate-500 text-xs">{formatDateTime(b.checkIn)}</td>
                    <td className="px-3 py-2 font-medium">{getGuestDisplayName(b, guests)}</td>
                    <td className="px-3 py-2">ห้อง {r?.number ?? '–'}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{getBookingSourceLabel(b.source)}</td>
                  </tr>
                )
              })}
            </ReportTable>
          )}
        </ReportSection>

        {/* Check-outs */}
        <ReportSection title="รายการเช็คเอาต์" icon={<LogOut size={16} className="text-amber-500" />} count={checkOutsToday.length} extra={`รายได้รวม ${formatCurrency(checkOutRevenue)}`}>
          {checkOutsToday.length === 0 ? (
            <Empty text="ไม่มีเช็คเอาต์ในวันนี้" />
          ) : (
            <ReportTable headers={['ลูกค้า', 'ห้อง', 'จำนวนคืน', 'ยอดรวม', 'ชำระแล้ว']}>
              {checkOutsToday.map((b) => {
                const r = rooms.find((x) => x.id === b.roomId)
                return (
                  <tr key={b.id} className="border-b border-slate-50">
                    <td className="px-3 py-2 font-medium">{getGuestDisplayName(b, guests)}</td>
                    <td className="px-3 py-2">ห้อง {r?.number ?? '–'}</td>
                    <td className="px-3 py-2 text-center">{b.nights}</td>
                    <td className="px-3 py-2 font-semibold">{formatCurrency(b.totalAmount)}</td>
                    <td className="px-3 py-2 text-emerald-600">{formatCurrency(b.paidAmount)}</td>
                  </tr>
                )
              })}
            </ReportTable>
          )}
        </ReportSection>

        {/* Walk-ins */}
        <ReportSection title="Walk-in" icon={<UserPlus size={16} className="text-amber-500" />} count={walkInsToday.length} extra={`รวม ${formatCurrency(walkInRevenue)}`}>
          {walkInsToday.length === 0 ? (
            <Empty text="ไม่มี walk-in วันนี้" />
          ) : (
            <ReportTable headers={['เวลา', 'ลูกค้า', 'ห้อง', 'ยอด']}>
              {walkInsToday.map((b) => {
                const r = rooms.find((x) => x.id === b.roomId)
                return (
                  <tr key={b.id} className="border-b border-slate-50">
                    <td className="px-3 py-2 text-slate-500 text-xs">{formatDateTime(b.createdAt)}</td>
                    <td className="px-3 py-2 font-medium">{getGuestDisplayName(b, guests)}</td>
                    <td className="px-3 py-2">ห้อง {r?.number ?? '–'}</td>
                    <td className="px-3 py-2 font-semibold">{formatCurrency(b.totalAmount)}</td>
                  </tr>
                )
              })}
            </ReportTable>
          )}
        </ReportSection>

        {/* Payments */}
        <ReportSection title="ประวัติการรับชำระเงิน" icon={<DollarSign size={16} className="text-blue-500" />} count={payments.length} extra={`รวม ${formatCurrency(totalPaymentsReceived)}`}>
          {payments.length === 0 ? (
            <Empty text="ไม่มีการรับชำระเงินวันนี้" />
          ) : (
            <ReportTable headers={['เวลา', 'ลูกค้า', 'การจอง', 'ช่องทาง', 'ยอด']}>
              {payments.map((p, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="px-3 py-2 text-slate-500 text-xs">{formatDateTime(p.time)}</td>
                  <td className="px-3 py-2 font-medium">{p.guestName}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{p.bookingId}</td>
                  <td className="px-3 py-2 text-slate-600">{getPaymentMethodLabel(p.method)}</td>
                  <td className="px-3 py-2 font-semibold text-emerald-600">{formatCurrency(p.amount)}</td>
                </tr>
              ))}
            </ReportTable>
          )}
        </ReportSection>

        {/* Add-ons */}
        <ReportSection title="Add-on ที่จัดให้แขก" icon={<ShoppingBag size={16} className="text-purple-500" />} count={addOnsToday.length} extra={`รวม ${formatCurrency(addOnRevenue)}`}>
          {addOnsToday.length === 0 ? (
            <Empty text="ไม่มี add-on วันนี้" />
          ) : (
            <ReportTable headers={['เวลา', 'รายการ', 'จำนวน', 'ยอด']}>
              {addOnsToday.map((a) => {
                const item = addOnItems.find((x) => x.id === a.addOnItemId)
                return (
                  <tr key={a.id} className="border-b border-slate-50">
                    <td className="px-3 py-2 text-slate-500 text-xs">{a.fulfilledAt ? formatDateTime(a.fulfilledAt) : '–'}</td>
                    <td className="px-3 py-2">{item?.name ?? '–'}</td>
                    <td className="px-3 py-2 text-center">{a.quantity}</td>
                    <td className="px-3 py-2 font-semibold">{formatCurrency(a.totalPrice)}</td>
                  </tr>
                )
              })}
            </ReportTable>
          )}
        </ReportSection>

        {/* Housekeeping */}
        <ReportSection title="งานทำความสะอาดที่เสร็จ" icon={<HotelIcon size={16} className="text-amber-500" />} count={hkToday.length}>
          {hkToday.length === 0 ? (
            <Empty text="ไม่มีงานเสร็จในวันนี้" />
          ) : (
            <ReportTable headers={['ห้อง', 'พนักงาน', 'เสร็จเมื่อ']}>
              {hkToday.map((t) => (
                <tr key={t.id} className="border-b border-slate-50">
                  <td className="px-3 py-2 font-medium">ห้อง {t.roomNumber}</td>
                  <td className="px-3 py-2 text-slate-600">{t.assignedTo}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{t.completedAt ? formatDateTime(t.completedAt) : '–'}</td>
                </tr>
              ))}
            </ReportTable>
          )}
        </ReportSection>

        {/* Maintenance */}
        <ReportSection title="แจ้งซ่อมบำรุง" icon={<Wrench size={16} className="text-red-500" />} count={maintToday.length}>
          {maintToday.length === 0 ? (
            <Empty text="ไม่มีการแจ้งซ่อมในวันนี้" />
          ) : (
            <ReportTable headers={['ห้อง', 'ปัญหา', 'แจ้งโดย', 'สถานะ']}>
              {maintToday.map((m) => (
                <tr key={m.id} className="border-b border-slate-50">
                  <td className="px-3 py-2 font-medium">ห้อง {m.roomNumber}</td>
                  <td className="px-3 py-2">{m.issue}</td>
                  <td className="px-3 py-2 text-slate-600">{m.reportedBy}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{{ resolved: 'แก้ไขแล้ว', in_progress: 'กำลังซ่อม', open: 'รอดำเนินการ' }[m.status]}</td>
                </tr>
              ))}
            </ReportTable>
          )}
        </ReportSection>

        {/* Invoices issued */}
        <ReportSection title="ใบแจ้งหนี้ที่ออกวันนี้" icon={<DollarSign size={16} className="text-slate-500" />} count={invoicesToday.length} extra={`รวม ${formatCurrency(invoiceTotal)}`}>
          {invoicesToday.length === 0 ? (
            <Empty text="ไม่มีใบแจ้งหนี้ใหม่" />
          ) : (
            <ReportTable headers={['เลขที่', 'การจอง', 'สถานะ', 'ยอด']}>
              {invoicesToday.map((iv) => (
                <tr key={iv.id} className="border-b border-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{iv.id}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{iv.bookingId}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{{ draft: 'ร่าง', issued: 'ออกใบแจ้งหนี้', paid: 'ชำระแล้ว', refunded: 'คืนเงิน' }[iv.status]}</td>
                  <td className="px-3 py-2 font-semibold">{formatCurrency(iv.total)}</td>
                </tr>
              ))}
            </ReportTable>
          )}
        </ReportSection>
      </div>
    </div>
  )
}

function ReportSection({ title, icon, count, extra, children }: {
  title: string; icon: React.ReactNode; count: number; extra?: string; children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-100 print-color">
      <header className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
        {icon}
        <h2 className="font-semibold text-slate-800 text-sm">{title}</h2>
        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{count}</span>
        {extra && <span className="ml-auto text-xs text-slate-500 font-medium">{extra}</span>}
      </header>
      <div>{children}</div>
    </section>
  )
}

function ReportTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left px-3 py-2 font-medium text-slate-500 text-xs">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="py-6 text-center text-sm text-slate-400">{text}</div>
}
