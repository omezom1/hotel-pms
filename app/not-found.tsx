import Link from 'next/link'
import { FileQuestion, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <FileQuestion className="text-slate-500" size={28} />
        </div>
        <div className="text-5xl font-bold text-slate-300 mb-2">404</div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">ไม่พบหน้าที่คุณต้องการ</h2>
        <p className="text-sm text-slate-600 mb-5">
          หน้าที่คุณกำลังค้นหาอาจถูกย้ายหรือไม่มีอยู่ในระบบ
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          <Home size={16} />
          กลับหน้าแดชบอร์ด
        </Link>
      </div>
    </div>
  )
}
