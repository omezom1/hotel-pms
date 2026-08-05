#!/usr/bin/env node
/**
 * กู้คืนข้อมูลจากไฟล์สำเนาที่ /api/backup สร้างไว้
 *
 *   # ดูว่ามีสำเนาอะไรบ้าง
 *   node scripts/restore-backup.mjs --list
 *
 *   # ซ้อมก่อน (dry-run — ไม่เขียนอะไรเลย บอกแค่ว่าจะทับอะไรด้วยอะไร)
 *   node scripts/restore-backup.mjs latest
 *   node scripts/restore-backup.mjs hotel-pms-2026-08-05.json
 *   node scripts/restore-backup.mjs ./ที่เก็บในเครื่อง/hotel-pms-2026-08-05.json
 *
 *   # ลงมือจริง (ลบข้อมูลปัจจุบันทุกตารางแล้วใส่ของจากไฟล์แทน)
 *   node scripts/restore-backup.mjs latest --yes
 *
 * ⚠️ การกู้คืนคือการ "ย้อนเวลาทั้งระบบ" — งานที่เกิดหลังเวลาของไฟล์จะหายไปด้วย
 *    ก่อนกู้ สคริปต์จะสำรองสถานะปัจจุบันไว้ให้ก่อนเสมอ (ไฟล์ .pre-restore ในเครื่อง)
 *
 * ต้องมี env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (อ่านจาก .env.local ให้เอง)
 *
 * 📌 ไม่ครอบคลุม: บัญชีล็อกอิน (Supabase Auth) — ตาราง `users` กู้กลับมา แต่ตัวบัญชี auth
 *    กับรหัสผ่านอยู่คนละที่ ถ้าฐานข้อมูลถูกล้างจริง ๆ ให้สร้างบัญชีใหม่ผ่านหน้า "พนักงาน"
 *    (หรือ supabase/migrations/022_supabase_auth_seed.sql) แล้วค่อยกู้ข้อมูลส่วนที่เหลือ
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'backups'
const CHUNK = 500

// ── env ────────────────────────────────────────────────────────────
function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('✗ ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY (ใน .env.local หรือ env)')
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

// ── args ───────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const apply = args.includes('--yes')
const target = args.find((a) => !a.startsWith('--'))

async function listBackups() {
  const { data, error } = await db.storage.from(BUCKET).list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } })
  if (error) throw new Error(`อ่านรายการไฟล์สำเนาไม่สำเร็จ: ${error.message}`)
  return (data ?? []).filter((f) => f.name.startsWith('hotel-pms-'))
}

if (args.includes('--list') || !target) {
  const files = await listBackups()
  if (files.length === 0) {
    console.log('ยังไม่มีไฟล์สำเนาใน bucket นี้')
  } else {
    console.log(`สำเนาที่มีอยู่ (${files.length} ไฟล์):`)
    for (const f of files) {
      const mb = ((f.metadata?.size ?? 0) / 1024 / 1024).toFixed(2)
      console.log(`  ${f.name}  ${mb} MB  (${f.created_at ?? '—'})`)
    }
  }
  if (!target) console.log('\nกู้คืน: node scripts/restore-backup.mjs latest [--yes]')
  process.exit(0)
}

// ── หาไฟล์ที่จะกู้ ──────────────────────────────────────────────────
async function loadPayload(name) {
  // ไฟล์ในเครื่องก่อน (เผื่อกรณีที่คลาวด์เองมีปัญหา แล้วใช้สำเนาที่โหลดเก็บไว้)
  const localPath = resolve(process.cwd(), name)
  if (name.includes('/') || name.includes('\\') || existsSync(localPath)) {
    console.log(`อ่านจากไฟล์ในเครื่อง: ${localPath}`)
    return JSON.parse(readFileSync(localPath, 'utf8'))
  }
  let fileName = name
  if (name === 'latest') {
    const files = await listBackups()
    if (files.length === 0) throw new Error('ไม่มีไฟล์สำเนาให้กู้')
    fileName = files[0].name
  }
  console.log(`ดาวน์โหลดจากคลาวด์: ${fileName}`)
  const { data, error } = await db.storage.from(BUCKET).download(fileName)
  if (error || !data) throw new Error(`ดาวน์โหลดไม่สำเร็จ: ${error?.message ?? 'ไม่พบไฟล์'}`)
  return JSON.parse(await data.text())
}

async function countRows(table) {
  const { count, error } = await db.from(table).select('id', { count: 'exact', head: true })
  return error ? null : (count ?? 0)
}

async function main() {
  const payload = await loadPayload(target)
  if (payload._app !== 'hotel-pms' || payload._kind !== 'db-backup') {
    throw new Error('ไฟล์นี้ไม่ใช่สำเนาข้อมูลของระบบ (ตรวจ _app/_kind ไม่ผ่าน)')
  }
  // ลำดับ insert ติดมากับไฟล์ — ไม่ต้องเดา FK เอง และไฟล์เก่ากู้ได้แม้ลำดับในโค้ดจะเปลี่ยนไปแล้ว
  const order = payload._order
  if (!Array.isArray(order) || order.length === 0) throw new Error('ไฟล์สำเนาไม่มี _order (ลำดับตาราง)')

  console.log(`\nสำเนานี้สร้างเมื่อ: ${payload._createdAt}`)
  console.log('─'.repeat(58))
  console.log('ตาราง'.padEnd(26) + 'ตอนนี้'.padStart(12) + 'จะกลายเป็น'.padStart(16))
  console.log('─'.repeat(58))
  for (const table of order) {
    const now = await countRows(table)
    const after = (payload.data[table] ?? []).length
    const mark = now === after ? ' ' : '*'
    console.log(`${mark}${table.padEnd(25)}${String(now ?? '?').padStart(12)}${String(after).padStart(16)}`)
  }
  console.log('─'.repeat(58))

  if (!apply) {
    console.log('\n(ซ้อมเฉย ๆ — ยังไม่เขียนอะไร) ใส่ --yes เพื่อกู้คืนจริง')
    return
  }

  // สำรองสถานะปัจจุบันก่อนทับ — ถ้ากู้ผิดไฟล์ ยังมีทางถอยกลับ
  const preName = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const pre = { _app: 'hotel-pms', _kind: 'db-backup', _version: 1, _createdAt: new Date().toISOString(), _order: order, data: {} }
  for (const table of order) {
    const rows = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select('*').order('id').range(from, from + 999)
      if (error) throw new Error(`สำรองก่อนกู้ล้มเหลวที่ ${table}: ${error.message}`)
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    pre.data[table] = rows
  }
  writeFileSync(resolve(process.cwd(), preName), JSON.stringify(pre, null, 2))
  console.log(`\n✓ สำรองสถานะปัจจุบันไว้ที่ ${preName} (เผื่อต้องถอยกลับ)`)

  // ลบย้อนลำดับ (ลูกก่อนพ่อแม่) ไม่งั้น FK จะกัน
  console.log('\nลบข้อมูลปัจจุบัน...')
  for (const table of [...order].reverse()) {
    const { error } = await db.from(table).delete().not('id', 'is', null)
    if (error) throw new Error(`ลบ ${table} ไม่สำเร็จ: ${error.message}`)
    process.stdout.write(`  ${table}\n`)
  }

  // ใส่กลับตามลำดับ (พ่อแม่ก่อนลูก)
  console.log('\nใส่ข้อมูลจากสำเนา...')
  for (const table of order) {
    const rows = payload.data[table] ?? []
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await db.from(table).insert(rows.slice(i, i + CHUNK))
      if (error) throw new Error(`ใส่ ${table} ไม่สำเร็จ (แถวที่ ${i}+): ${error.message}`)
    }
    process.stdout.write(`  ${table.padEnd(25)} ${rows.length} แถว\n`)
  }

  console.log('\n✓ กู้คืนเสร็จแล้ว — ให้ทุกเครื่องที่เปิดแอปค้างไว้ refresh (แท็บที่เปิดอยู่ยังถือข้อมูลเก่า)')
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`)
  process.exit(1)
})
