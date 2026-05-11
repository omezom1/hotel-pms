'use client'
import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="text-red-600" size={28} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">เกิดข้อผิดพลาด</h2>
        <p className="text-sm text-slate-600 mb-1">
          ระบบไม่สามารถโหลดหน้านี้ได้ในขณะนี้
        </p>
        {error.message && (
          <p className="text-xs text-slate-400 font-mono mb-5 break-words">{error.message}</p>
        )}
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          <RefreshCw size={16} />
          ลองใหม่อีกครั้ง
        </button>
      </div>
    </div>
  )
}
