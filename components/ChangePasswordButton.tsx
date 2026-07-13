'use client'
import { useState } from 'react'
import { KeyRound, X } from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'
import { supabase } from '@/lib/supabase'
import { useFocusTrap } from '@/lib/useFocusTrap'
import { toast } from 'sonner'

// ปุ่ม + dialog ให้ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง (ผ่าน Supabase Auth)
export default function ChangePasswordButton() {
  const userId = useAuthStore((s) => s.user?.userId)
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const trapRef = useFocusTrap<HTMLDivElement>(open, () => setOpen(false))

  if (!userId) return null

  function reset() { setCurrent(''); setNext(''); setConfirm('') }

  async function submit() {
    if (saving) return
    if (!next) { toast.error('กรุณาตั้งรหัสผ่านใหม่'); return }
    if (next.length < 6) { toast.error('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัว'); return }
    if (next !== confirm) { toast.error('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน'); return }
    setSaving(true)
    // ตรวจรหัสผ่านปัจจุบันด้วยการ re-authenticate (Supabase Auth ไม่บังคับ current pw ตอน updateUser)
    const { data: au } = await supabase.auth.getUser()
    const email = au.user?.email
    if (!email) { toast.error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); setSaving(false); return }
    const { error: verr } = await supabase.auth.signInWithPassword({ email, password: current })
    if (verr) { toast.error('รหัสผ่านปัจจุบันไม่ถูกต้อง'); setSaving(false); return }
    const { error: uerr } = await supabase.auth.updateUser({ password: next })
    if (uerr) { toast.error(uerr.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ'); setSaving(false); return }
    toast.success('เปลี่ยนรหัสผ่านแล้ว')
    reset()
    setSaving(false)
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true) }}
        className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-amber-300 transition-colors"
        title="เปลี่ยนรหัสผ่านของฉัน"
      >
        <KeyRound size={16} className="shrink-0" />
        <span className="hidden group-hover:inline lg:inline whitespace-nowrap">เปลี่ยนรหัสผ่าน</span>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 text-slate-800" onClick={() => setOpen(false)}>
          <div ref={trapRef} role="dialog" aria-modal="true" aria-label="เปลี่ยนรหัสผ่าน" tabIndex={-1} className="bg-white rounded-xl shadow-xl w-full max-w-sm focus:outline-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2"><KeyRound size={18} className="text-amber-500" /><h2 className="font-semibold">เปลี่ยนรหัสผ่าน</h2></div>
              <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="cpw-current" className="block text-sm font-medium text-slate-700 mb-1.5">รหัสผ่านปัจจุบัน</label>
                <input id="cpw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label htmlFor="cpw-next" className="block text-sm font-medium text-slate-700 mb-1.5">รหัสผ่านใหม่</label>
                <input id="cpw-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label htmlFor="cpw-confirm" className="block text-sm font-medium text-slate-700 mb-1.5">ยืนยันรหัสผ่านใหม่</label>
                <input id="cpw-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
                  onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setOpen(false)} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">ยกเลิก</button>
              <button onClick={submit} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
