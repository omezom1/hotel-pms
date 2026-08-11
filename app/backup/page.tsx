'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/layout/Header'
import { formatDateTime } from '@/lib/utils'
import { AlertTriangle, Download, DatabaseBackup, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

// หน้า "สำรองข้อมูล" — ดูสำเนาที่ระบบทำอัตโนมัติทุกคืน, สั่งสำรองเดี๋ยวนี้, โหลดเก็บลงเครื่อง
// งานจริงทำที่ /api/backup (ต้องใช้ service_role ซึ่งห้ามอยู่ฝั่งเบราว์เซอร์)

type BackupItem = { name: string; size: number; createdAt: string | null }

async function callBackupApi<T>(payload: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) return { ok: false, error: 'เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่' }
  try {
    const res = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: String(json.error ?? 'ทำรายการไม่สำเร็จ') }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ' }
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

// ชื่อไฟล์ hotel-pms-YYYY-MM-DD.json → "5 ส.ค. 2569"
function fileDateLabel(name: string): string {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return name
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${Number(m[1]) + 543}`
}

export default function BackupPage() {
  const [items, setItems] = useState<BackupItem[]>([])
  const [retentionDays, setRetentionDays] = useState(30)
  const [cronReady, setCronReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await callBackupApi<{ items: BackupItem[]; retentionDays: number; cronReady: boolean }>({ action: 'list' })
    if (res.ok) {
      setItems(res.data.items)
      setRetentionDays(res.data.retentionDays)
      setCronReady(res.data.cronReady)
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function runNow() {
    setRunning(true)
    const res = await callBackupApi<{ fileName: string }>({ action: 'run' })
    setRunning(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(`สำรองข้อมูลแล้ว: ${res.data.fileName}`)
    void refresh()
  }

  async function download(name: string) {
    setDownloading(name)
    const res = await callBackupApi<{ url: string }>({ action: 'download', name })
    setDownloading(null)
    if (!res.ok) { toast.error(res.error); return }
    // ลิงก์มีอายุ 60 วินาที — เปิดทันที ไม่เก็บไว้ใน state
    window.location.href = res.data.url
  }

  return (
    <div className="flex flex-col h-screen">
      <Header title="สำรองข้อมูล" subtitle="สำเนาข้อมูลทั้งระบบที่ใช้กู้คืนได้จริง" />
      <div className="flex-1 overflow-y-auto p-6">

        {/* คำอธิบายสั้น ๆ ว่าอันนี้คืออะไร — คนที่เข้ามาหน้านี้อาจไม่ใช่คนที่ตั้งค่าไว้ */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
          <div className="flex items-start gap-3">
            <DatabaseBackup size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-600 leading-relaxed">
              <p className="font-medium text-slate-900 mb-1">ระบบก๊อปข้อมูลทั้งหมดเก็บไว้ทุกคืน (ตี 3)</p>
              <p>
                เก็บย้อนหลัง {retentionDays} วัน — ถ้ามีใครเผลอลบหรือแก้ข้อมูลผิด
                กู้กลับไปเป็นของวันไหนก็ได้ในช่วงนี้ ไฟล์เก็บอยู่บนคลาวด์ ไม่ต้องกดอะไรเอง
              </p>
              <p className="mt-1">
                ถ้าอยากมีสำเนาไว้ในเครื่องตัวเองด้วย กด <span className="font-medium">ดาวน์โหลด</span> ที่แถวไหนก็ได้
                (แนะนำเดือนละครั้ง เผื่อกรณีที่บัญชีคลาวด์เองมีปัญหา)
              </p>
            </div>
          </div>
        </div>

        {!cronReady && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-sm text-amber-900">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">การสำรองอัตโนมัติยังไม่ทำงาน</p>
              <p className="mt-0.5">ยังไม่ได้ตั้งค่า <code className="text-xs">CRON_SECRET</code> บน Vercel — ตอนนี้สำรองได้เฉพาะกดปุ่มเอง</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={runNow}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 rounded-lg text-sm font-medium transition-colors"
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <DatabaseBackup size={15} />}
            {running ? 'กำลังสำรอง...' : 'สำรองเดี๋ยวนี้'}
          </button>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg text-sm text-slate-600 transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            รีเฟรช
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {error ? (
            <div className="p-8 text-center text-sm text-red-600">{error}</div>
          ) : loading ? (
            <div className="p-8 text-center text-sm text-slate-400">กำลังโหลดรายการ...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              ยังไม่มีสำเนา — กด &ldquo;สำรองเดี๋ยวนี้&rdquo; เพื่อสร้างไฟล์แรก
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left font-medium px-5 py-3">ข้อมูล ณ วันที่</th>
                  <th className="text-left font-medium px-5 py-3">สร้างเมื่อ</th>
                  <th className="text-right font-medium px-5 py-3">ขนาด</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.name} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{fileDateLabel(item.name)}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {item.createdAt ? formatDateTime(item.createdAt) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-500 tabular-nums">{formatSize(item.size)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => void download(item.name)}
                        disabled={downloading === item.name}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-white disabled:opacity-50 rounded-lg text-xs text-slate-600 transition-colors"
                      >
                        {downloading === item.name
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Download size={13} />}
                        ดาวน์โหลด
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-slate-400 mt-4 leading-relaxed">
          การกู้คืนต้องทำโดยผู้ดูแลระบบผ่านสคริปต์ <code>scripts/restore-backup.mjs</code> —
          เป็นงานที่เขียนทับข้อมูลปัจจุบันทั้งหมด จึงไม่เปิดเป็นปุ่มในแอปโดยตั้งใจ
        </p>
      </div>
    </div>
  )
}
