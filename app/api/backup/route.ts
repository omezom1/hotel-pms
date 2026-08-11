import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, bad, logServerAudit, requireStaffPermission } from '@/lib/api-auth'
import {
  BACKUP_BUCKET, BACKUP_FILE_PREFIX, BACKUP_RETENTION_DAYS, BACKUP_TABLES, backupFileName,
} from '@/lib/backup-tables'

// สำรองข้อมูลอัตโนมัติ — free tier ไม่มี daily backup ให้ (Pro มี) จึงทำเอง:
// ดัมพ์ทุกตารางเป็นไฟล์ JSON ไฟล์เดียว เก็บใน Supabase Storage bucket `backups` (private)
//   GET  = ให้ Vercel Cron เรียกทุกคืน (ยืนยันตัวด้วย CRON_SECRET)
//   POST = ให้แอดมินในแอปเรียกเอง (run / list / download) ผ่าน access token ของตัวเอง
// กู้คืน = `scripts/restore-backup.mjs` (ดู README ในไฟล์นั้น)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// ดัมพ์ 17 ตารางแบบแบ่งหน้า อาจเกิน 10 วินาทีเมื่อ audit_logs โตขึ้น
export const maxDuration = 60

// PostgREST คืนสูงสุด 1000 แถวต่อคำขอ — ต้องไล่ทีละหน้า ไม่งั้นสำเนาจะขาดแบบเงียบ ๆ
const PAGE_SIZE = 1000

async function dumpTable(admin: SupabaseClient, table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    // order by id ให้การแบ่งหน้าเสถียร (ไม่มี order = ลำดับไม่การันตี → แถวซ้ำ/หาย)
    const { data, error } = await admin.from(table).select('*').order('id').range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`อ่านตาราง ${table} ไม่สำเร็จ: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

type BackupResult = { fileName: string; bytes: number; counts: Record<string, number>; pruned: string[] }

async function runBackup(admin: SupabaseClient): Promise<BackupResult> {
  const createdAt = new Date()
  const data: Record<string, Record<string, unknown>[]> = {}
  const counts: Record<string, number> = {}
  for (const table of BACKUP_TABLES) {
    const rows = await dumpTable(admin, table)
    data[table] = rows
    counts[table] = rows.length
  }

  const payload = {
    _app: 'hotel-pms',
    _kind: 'db-backup',
    _version: 1,
    _createdAt: createdAt.toISOString(),
    // ลำดับ insert ตอนกู้คืนติดไปกับไฟล์ — สคริปต์กู้คืนจะได้ไม่ต้องถือลิสต์ซ้ำอีกชุด
    _order: [...BACKUP_TABLES],
    counts,
    data,
  }
  const body = JSON.stringify(payload)
  const fileName = backupFileName(createdAt)

  const { error: upErr } = await admin.storage.from(BACKUP_BUCKET).upload(fileName, body, {
    contentType: 'application/json',
    upsert: true, // รันซ้ำในวันเดียวกัน = ทับไฟล์ของวันนั้น
  })
  if (upErr) throw new Error(`อัปโหลดไฟล์สำเนาไม่สำเร็จ: ${upErr.message}`)

  // byteLength ไม่ใช่ .length — ข้อความไทย 1 ตัวอักษร = 3 ไบต์ใน UTF-8 (ตัวเลขจะต่ำกว่าจริงมาก)
  return { fileName, bytes: Buffer.byteLength(body), counts, pruned: await pruneOldBackups(admin) }
}

// ลบสำเนาที่เกินอายุเก็บ — ไม่งั้นพื้นที่ storage ฟรี (1GB) จะเต็มเงียบ ๆ แล้วสำรองล้มทั้งระบบ
async function pruneOldBackups(admin: SupabaseClient): Promise<string[]> {
  const { data: files, error } = await admin.storage.from(BACKUP_BUCKET).list('', { limit: 1000 })
  if (error || !files) return []
  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const stale = files
    .filter((f) => f.name.startsWith(BACKUP_FILE_PREFIX))
    .filter((f) => {
      const stamp = f.name.slice(BACKUP_FILE_PREFIX.length, BACKUP_FILE_PREFIX.length + 10)
      const t = Date.parse(stamp)
      return Number.isFinite(t) && t < cutoff
    })
    .map((f) => f.name)
  if (stale.length > 0) await admin.storage.from(BACKUP_BUCKET).remove(stale)
  return stale
}

// ── GET: Vercel Cron เรียกทุกคืน ──────────────────────────────────
// Vercel แนบ `Authorization: Bearer $CRON_SECRET` ให้เองเมื่อมี env นี้อยู่
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return bad(503, 'ระบบยังไม่ได้ตั้งค่า CRON_SECRET — สำรองอัตโนมัติยังไม่ทำงาน')
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (token !== secret) return bad(401, 'ไม่ได้รับอนุญาต')

  const admin = adminClient()
  if (!admin) return bad(503, 'ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY — สำรองข้อมูลไม่ได้')

  try {
    const result = await runBackup(admin)
    // cron ไม่มีผู้ใช้เป็นเจ้าของการกระทำ — บันทึกในนามระบบเพื่อให้เห็นในหน้าบันทึกการใช้งาน
    await logServerAudit(
      admin, { staffId: 'system', staffName: 'ระบบ (อัตโนมัติ)' },
      'backup', `สำรองข้อมูลอัตโนมัติ ${result.fileName}`, result.fileName,
    )
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'สำรองข้อมูลไม่สำเร็จ'
    console.error('[backup] cron:', msg)
    return bad(500, msg)
  }
}

// ── POST: แอดมินสั่งเองจากหน้า "สำรองข้อมูล" ─────────────────────
export async function POST(req: Request) {
  // ตรวจสิทธิ์ก่อนเสมอ แล้วค่อยดูว่าตั้งคีย์ service_role ไว้หรือยัง
  const gate = await requireStaffPermission(req, 'canManageStaff', 'ไม่มีสิทธิ์จัดการข้อมูลสำรอง')
  if ('error' in gate) return gate.error

  const admin = adminClient()
  if (!admin) return bad(503, 'ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY — สำรองข้อมูลไม่ได้')

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return bad(400, 'รูปแบบคำขอไม่ถูกต้อง') }
  const action = String(body.action ?? '')

  // รายการไฟล์สำเนาที่มีอยู่ (ใหม่สุดก่อน)
  if (action === 'list') {
    const { data: files, error } = await admin.storage.from(BACKUP_BUCKET)
      .list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } })
    if (error) return bad(500, `อ่านรายการไฟล์สำเนาไม่สำเร็จ: ${error.message}`)
    const items = (files ?? [])
      .filter((f) => f.name.startsWith(BACKUP_FILE_PREFIX))
      .map((f) => ({
        name: f.name,
        size: Number((f.metadata as Record<string, unknown> | null)?.size ?? 0),
        createdAt: f.created_at ?? null,
      }))
    return NextResponse.json({ ok: true, items, retentionDays: BACKUP_RETENTION_DAYS, cronReady: !!process.env.CRON_SECRET })
  }

  // สำรองเดี๋ยวนี้ (เช่น ก่อนจะทำอะไรที่เสี่ยง)
  if (action === 'run') {
    try {
      const result = await runBackup(admin)
      await logServerAudit(admin, gate.caller, 'backup',
        `สำรองข้อมูลด้วยตนเอง ${result.fileName}`, result.fileName)
      return NextResponse.json({ ok: true, ...result })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'สำรองข้อมูลไม่สำเร็จ'
      console.error('[backup] manual:', msg)
      return bad(500, msg)
    }
  }

  // ลิงก์ดาวน์โหลดชั่วคราว (bucket เป็น private — เปิดตรง ๆ ไม่ได้)
  if (action === 'download') {
    const name = String(body.name ?? '')
    if (!name.startsWith(BACKUP_FILE_PREFIX) || name.includes('/')) return bad(400, 'ชื่อไฟล์ไม่ถูกต้อง')
    const { data, error } = await admin.storage.from(BACKUP_BUCKET).createSignedUrl(name, 60, { download: true })
    if (error || !data) return bad(404, 'ไม่พบไฟล์สำเนานี้')
    return NextResponse.json({ ok: true, url: data.signedUrl })
  }

  return bad(400, 'ไม่รู้จักคำสั่งนี้')
}
