'use client'
import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LogIn, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/dashboard'

  const { user, hydrated, login } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ถ้า login แล้ว redirect ออก
  useEffect(() => {
    if (hydrated && user) router.replace(next)
  }, [hydrated, user, next, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const result = await login(email, password)
    if (result.ok) {
      router.replace(next)
    } else {
      setError(result.error)
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* ฟอร์มเข้าสู่ระบบ */}
      <div className="bg-white rounded-2xl shadow-2xl p-8 lg:p-10">
        <div className="flex items-center gap-3 mb-8">
          <img src="/logo.png" alt="Pruksatara Logo" className="w-14 h-14 object-contain" />
          <div>
            <div className="text-xl font-bold text-slate-900">Pruksatara Park & Resort</div>
            <div className="text-sm text-slate-500">ระบบจัดการโรงแรม PMS</div>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-1">เข้าสู่ระบบ</h1>
        <p className="text-sm text-slate-500 mb-6">กรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งาน</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1.5">อีเมล</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              placeholder="เช่น admin@pruksatara.local"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1.5">รหัสผ่าน</label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full px-4 py-2.5 pr-11 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-slate-900 font-semibold py-2.5 rounded-lg transition-colors"
          >
            <LogIn size={18} />
            {submitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-500 text-center">
          ระบบนี้ใช้สำหรับพนักงานเท่านั้น • เวอร์ชันสาธิต
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-amber-900 flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-white">กำลังโหลด…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
