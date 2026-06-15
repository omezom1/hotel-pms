'use client'
import { createContext, useContext, useCallback, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useFocusTrap } from '@/lib/useFocusTrap'

export type ConfirmOptions = {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>
const ConfirmContext = createContext<ConfirmFn>(async () => false)

// hook: const confirm = useConfirm(); if (!(await confirm({ message }))) return
export const useConfirm = () => useContext(ConfirmContext)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o)
    return new Promise<boolean>((resolve) => { resolver.current = resolve })
  }, [])

  const close = useCallback((v: boolean) => {
    resolver.current?.(v)
    resolver.current = null
    setOpts(null)
  }, [])

  // Esc = ยกเลิก (focus-trap จัดการ Esc + ขัง Tab ไว้ใน dialog + คืนโฟกัสเดิมตอนปิด)
  // ไม่ผูก Enter กับยืนยัน เพื่อกันเผลอกดยืนยันงานลบ
  const trapRef = useFocusTrap<HTMLDivElement>(!!opts, () => close(false))

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          onClick={() => close(false)}
        >
          <div
            ref={trapRef} role="dialog" aria-modal="true" tabIndex={-1}
            className="bg-white rounded-xl shadow-xl w-full max-w-sm focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-2">
                {opts.danger && <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />}
                <div>
                  {opts.title && <h2 className={`font-semibold mb-1 ${opts.danger ? 'text-red-600' : 'text-slate-800'}`}>{opts.title}</h2>}
                  <p className="text-sm text-slate-600 whitespace-pre-line">{opts.message}</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 pb-5">
              <button onClick={() => close(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">
                {opts.cancelText ?? 'ยกเลิก'}
              </button>
              <button
                autoFocus onClick={() => close(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${opts.danger ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}
              >
                {opts.confirmText ?? 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
