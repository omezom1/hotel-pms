'use client'
import { ArrowLeftRight, X } from 'lucide-react'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { formatCurrency } from '@/lib/utils'

// ถามเมื่อย้ายห้องข้ามประเภทที่ราคาต่างกัน — จะปรับเป็นราคาใหม่หรือคงราคาเดิม (อัพเกรด/ย้ายฟรี)
export default function MoveRoomDialog({
  guestName,
  oldRoomNumber,
  newRoomNumber,
  oldTotal,
  newTotal,
  paidAmount,
  canRefund,
  onReprice,
  onKeepPrice,
  onClose,
}: {
  guestName: string
  oldRoomNumber: string
  newRoomNumber: string
  oldTotal: number
  newTotal: number
  paidAmount: number
  canRefund: boolean
  onReprice: () => void
  onKeepPrice: () => void
  onClose: () => void
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(true, onClose)
  const diff = newTotal - oldTotal
  const overpaid = Math.max(0, paidAmount - newTotal)
  // ปรับเป็นราคาใหม่จะคืนเงิน → ต้องมีสิทธิ์การเงิน
  const repriceBlocked = overpaid > 0 && !canRefund
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div ref={trapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-md focus:outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2 text-blue-600">
            <ArrowLeftRight size={18} />
            <h2 className="font-semibold">ย้ายห้อง — ราคาต่างกัน</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-600">{guestName} · ห้อง {oldRoomNumber} → ห้อง {newRoomNumber}</p>
          <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm space-y-1.5">
            <div className="flex justify-between"><span className="text-slate-500">ยอดเดิม</span><span className="font-medium">{formatCurrency(oldTotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">ยอดใหม่ (ตามห้องใหม่)</span><span className="font-medium">{formatCurrency(newTotal)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5">
              <span className="text-slate-500">ส่วนต่าง</span>
              <span className={`font-semibold ${diff < 0 ? 'text-emerald-600' : 'text-red-600'}`}>{diff > 0 ? '+' : ''}{formatCurrency(diff)}</span>
            </div>
          </div>
          {overpaid > 0 && (
            <p className="text-xs text-emerald-700">ถ้าปรับเป็นราคาใหม่: คืนเงินส่วนเกินที่จ่ายไว้ {formatCurrency(overpaid)} ให้อัตโนมัติ</p>
          )}
          {repriceBlocked && (
            <p className="text-xs text-red-600">การปรับราคาจะคืนเงิน — ต้องมีสิทธิ์จัดการการเงิน</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
          <button onClick={onKeepPrice} className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">คงราคาเดิม (อัพเกรด/ย้ายฟรี)</button>
          <button
            onClick={onReprice}
            disabled={repriceBlocked}
            title={repriceBlocked ? 'ต้องมีสิทธิ์จัดการการเงินเพื่อคืนเงิน' : undefined}
            className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ปรับเป็นราคาใหม่
          </button>
        </div>
      </div>
    </div>
  )
}
