'use client'
import { useParams } from 'next/navigation'
import { useHotelStore } from '@/lib/store'
import { formatCurrency, formatDate, formatDateTime, getPaymentMethodLabel } from '@/lib/utils'
import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>()
  const { invoices, bookings, guests, rooms } = useHotelStore()

  const invoice = invoices.find((iv) => iv.id === id)
  if (!invoice) {
    return <div className="p-10 text-center text-slate-500">ไม่พบใบแจ้งหนี้</div>
  }

  const booking = bookings.find((b) => b.id === invoice.bookingId)
  const guest = guests.find((g) => g.id === invoice.guestId)
  const room = booking ? rooms.find((r) => r.id === booking.roomId) : null

  // invoice.amount/total แช่แข็งตอนออกใบ แต่ booking.paidAmount เป็นค่าสด (เปลี่ยนได้ถ้ามี add-on/refund หลังออกใบ)
  // → clamp ยอดชำระที่แสดงให้อยู่ในกรอบ [0, total] เพื่อให้ตัวเลขบนใบที่พิมพ์สอดคล้องกันเอง (ชำระ ≤ รวม, ค้าง ≥ 0)
  const isRefunded = invoice.status === 'refunded'
  const displayedPaid = invoice.status === 'paid'
    ? invoice.total
    : Math.min(Math.max(booking?.paidAmount ?? 0, 0), invoice.total)
  const displayedOutstanding = Math.max(0, invoice.total - displayedPaid)
  const statusLabel = invoice.status === 'paid' ? 'ชำระแล้ว'
    : invoice.status === 'issued' ? 'รอชำระ'
    : invoice.status === 'refunded' ? 'คืนเงินแล้ว'
    : invoice.status
  const statusColor = invoice.status === 'paid' ? 'text-emerald-600'
    : invoice.status === 'refunded' ? 'text-purple-600'
    : 'text-amber-600'

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Top toolbar (no-print) */}
      <div className="no-print bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link href={`/bookings/${invoice.bookingId}`} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft size={15} /> กลับ
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium"
        >
          <Printer size={15} /> พิมพ์ / บันทึก PDF
        </button>
      </div>

      {/* Invoice content */}
      <div className="max-w-3xl mx-auto p-8 my-6 bg-white shadow-sm print:shadow-none print:my-0 print:p-0 print-color">

        {/* Header */}
        <div className="flex items-start justify-between pb-6 border-b-2 border-slate-800">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="logo" className="w-14 h-14 object-contain" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Pruksatara Park &amp; Resort</h1>
              <p className="text-sm text-slate-500 mt-0.5">ระบบจัดการโรงแรม</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-slate-800 tracking-wide">INVOICE</div>
            <div className="text-xs text-slate-500 mt-1">ใบแจ้งหนี้</div>
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-6 mt-6 text-sm">
          <div>
            <div className="text-xs text-slate-500 font-medium mb-1.5">ลูกค้า</div>
            <div className="font-semibold text-slate-800">{guest?.name ?? '–'}</div>
            {guest?.phone && <div className="text-slate-600 text-xs mt-0.5">โทร: {guest.phone}</div>}
            {guest?.email && <div className="text-slate-600 text-xs">อีเมล: {guest.email}</div>}
            {guest?.idNumber && <div className="text-slate-600 text-xs">เลขบัตร: {guest.idNumber}</div>}
          </div>
          <div className="text-right">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <span className="text-slate-500">เลขที่:</span>
              <span className="font-mono font-semibold text-slate-800">{invoice.id}</span>
              <span className="text-slate-500">วันที่ออก:</span>
              <span>{formatDateTime(invoice.issuedAt)}</span>
              <span className="text-slate-500">การจอง:</span>
              <span className="font-mono">{invoice.bookingId}</span>
              {booking && (
                <>
                  <span className="text-slate-500">ห้องพัก:</span>
                  <span>ห้อง {room?.number ?? '–'}</span>
                  <span className="text-slate-500">เช็คอิน:</span>
                  <span>{formatDate(booking.checkIn)}</span>
                  <span className="text-slate-500">เช็คเอาต์:</span>
                  <span>{formatDate(booking.checkOut)}</span>
                  <span className="text-slate-500">จำนวนคืน:</span>
                  <span>{booking.nights}</span>
                </>
              )}
              <span className="text-slate-500">สถานะ:</span>
              <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="mt-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 print-color">
                <th className="text-left px-3 py-2 font-semibold text-slate-700">รายการ</th>
                <th className="text-center px-3 py-2 font-semibold text-slate-700 w-16">จำนวน</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-700 w-28">ราคา/หน่วย</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-700 w-32">รวม</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-3 py-2.5">{item.description}</td>
                  <td className="px-3 py-2.5 text-center">{item.quantity}</td>
                  <td className="px-3 py-2.5 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <div className="w-72 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">ยอดรวม</span>
              <span>{formatCurrency(invoice.amount)}</span>
            </div>
            {invoice.tax > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">ภาษี</span>
                <span>{formatCurrency(invoice.tax)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t-2 border-slate-800 font-bold text-base">
              <span>รวมทั้งสิ้น</span>
              <span>{formatCurrency(invoice.total)}</span>
            </div>
            {booking && (isRefunded ? (
              <div className="flex justify-between pt-2 font-semibold text-purple-700">
                <span>สถานะการชำระ</span>
                <span>คืนเงินแล้ว</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between pt-2 text-emerald-700">
                  <span>ชำระแล้ว</span>
                  <span>{formatCurrency(displayedPaid)}</span>
                </div>
                {displayedOutstanding > 0 && (
                  <div className="flex justify-between font-semibold text-red-600">
                    <span>ค้างชำระ</span>
                    <span>{formatCurrency(displayedOutstanding)}</span>
                  </div>
                )}
              </>
            ))}
          </div>
        </div>

        {/* Payment history */}
        {booking?.payments && booking.payments.length > 0 && (
          <div className="mt-8">
            <div className="text-xs font-semibold text-slate-700 mb-2">ประวัติการชำระเงิน</div>
            <table className="w-full text-xs border border-slate-200">
              <thead className="bg-slate-50 print-color">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium text-slate-600">วันเวลา</th>
                  <th className="text-left px-3 py-1.5 font-medium text-slate-600">ช่องทาง</th>
                  <th className="text-left px-3 py-1.5 font-medium text-slate-600">หมายเหตุ</th>
                  <th className="text-right px-3 py-1.5 font-medium text-slate-600">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {booking.payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-3 py-1.5">{formatDateTime(p.date)}</td>
                    <td className="px-3 py-1.5">{getPaymentMethodLabel(p.method)}</td>
                    <td className="px-3 py-1.5 text-slate-500 italic">{p.notes ?? '–'}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-200 text-center text-xs text-slate-500">
          ขอบคุณที่ใช้บริการ Pruksatara Park &amp; Resort
        </div>
      </div>
    </div>
  )
}
