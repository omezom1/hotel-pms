'use client'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const KEY = 'hotel-pms-theme'

export default function ThemeToggle() {
  const [dark, setDark] = useState(false)

  // ซิงค์สถานะกับ class บน <html> ตอน mount (เผื่อ inline script ตั้งไว้แล้ว)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem(KEY, next ? 'dark' : 'light') } catch {}
  }

  return (
    <button
      onClick={toggle}
      title={dark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
      className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-amber-300 transition-colors"
    >
      {dark ? <Sun size={14} className="shrink-0" /> : <Moon size={14} className="shrink-0" />}
      <span className="hidden group-hover:inline lg:inline whitespace-nowrap">
        {dark ? 'โหมดสว่าง' : 'โหมดมืด'}
      </span>
    </button>
  )
}
