'use client'
import { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

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

  // Esc = ยกเลิก (ไม่ผูก Enter กับยืนยัน เพื่อกันเผลอกดยืนยันงานลบ)
  useEffect(() => {
    if (!opts) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opts, close])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          role="dialog" aria-modal="true"
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          onClick={() => close(false)}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
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
