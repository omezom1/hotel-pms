'use client'
import { CalendarClock, X } from 'lucide-react'
import { useFocusTrap } from '@/lib/useFocusTrap'

// ถามเมื่อเช็คเอาต์ก่อนวันกำหนด — จะปรับยอดตามจำนวนคืนจริงหรือคิดตามยอดเดิม
export default function EarlyCheckoutDialog({
  guestName,
  roomNumber,
  remainingNights,
  onAdjust,
  onKeepFull,
  onClose,
}: {
  guestName: string
  roomNumber: string
  remainingNights: number
  onAdjust: () => void
  onKeepFull: () => void
  onClose: () => void
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(true, onClose)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div ref={trapRef} role="dialog" aria-modal="true" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-md focus:outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2 text-blue-600">
            <CalendarClock size={18} />
            <h2 className="font-semibold">ออกก่อนกำหนด</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-600">{guestName} · ห้อง {roomNumber}</p>
          <p className="text-sm text-slate-600">
            แขกออกก่อนกำหนด <span className="font-semibold text-slate-800">{remainingNights} คืน</span> —
            ต้องการปรับยอดค่าห้องตามจำนวนคืนที่พักจริงไหม?
          </p>
          <p className="text-xs text-slate-500">
            ถ้าปรับยอด: ค่าห้องคิดตามคืนจริง และคืนเงินส่วนเกินที่จ่ายไว้ (ถ้ามี) ให้อัตโนมัติ
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
          <button onClick={onKeepFull} className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">คิดยอดเดิม</button>
          <button onClick={onAdjust} className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium">ปรับยอดตามคืนจริง</button>
        </div>
      </div>
    </div>
  )
}
