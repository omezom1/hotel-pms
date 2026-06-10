'use client'
import { AlertTriangle, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useFocusTrap } from '@/lib/useFocusTrap'

// Modal ยืนยันเช็คเอาต์เมื่อยังค้างชำระ — ใช้ร่วมหน้า front-desk และหน้ารายละเอียดการจอง
// เลือกได้: รับชำระก่อน / เช็คเอาต์ทั้งที่ค้าง (ออกใบแจ้งหนี้สถานะค้างชำระ)
export default function CheckoutConfirmDialog({
  guestName,
  roomNumber,
  outstanding,
  corporateCharge,
  onPayFirst,
  onProceed,
  onClose,
}: {
  guestName: string
  roomNumber: string
  outstanding: number
  // ถ้า booking องค์กร + เครดิตพอ → เช็คเอาต์จะ "ตัดเครดิต" ไม่ใช่ปล่อยค้าง (แจ้งให้ชัดก่อนกด)
  corporateCharge?: { amount: number; company: string } | null
  onPayFirst: () => void
  onProceed: () => void
  onClose: () => void
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(true, onClose)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div ref={trapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-md focus:outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle size={18} />
            <h2 className="font-semibold">ยังค้างชำระ</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-600">{guestName} · ห้อง {roomNumber}</p>
          <div className="flex justify-between items-center bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <span className="text-sm text-amber-800">ยอดค้างชำระ</span>
            <span className="text-lg font-bold text-amber-700">{formatCurrency(outstanding)}</span>
          </div>
          {corporateCharge ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
              เช็คเอาต์จะ <span className="font-semibold">ตัดเครดิตองค์กร {formatCurrency(corporateCharge.amount)}</span> จากบัญชี “{corporateCharge.company}” อัตโนมัติ (ไม่ใช่ยอดค้างของแขก)
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              ถ้าเช็คเอาต์เลย ระบบจะออกใบแจ้งหนี้สถานะ “ค้างชำระ” ค้างไว้ในหน้าการเงิน
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
          {!corporateCharge && (
            <button onClick={onPayFirst} className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium">รับชำระก่อน</button>
          )}
          <button onClick={onProceed} className="px-4 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium">
            {corporateCharge ? 'เช็คเอาต์ (ตัดเครดิตองค์กร)' : 'เช็คเอาต์ทั้งที่ค้าง'}
          </button>
        </div>
      </div>
    </div>
  )
}
