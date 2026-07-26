import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hashPassword } from '@/lib/auth-utils'

// จัดการบัญชีล็อกอิน (Supabase Auth) — ต้องใช้ service_role key ซึ่งห้ามอยู่ฝั่งเบราว์เซอร์
// จึงทำเป็น route handler: client ส่ง access token ของตัวเองมา → ตรวจว่าเป็นผู้มีสิทธิ์ canManageStaff
// ก่อนเรียก auth.admin.* (สร้าง/ตั้งรหัสใหม่/ลบบัญชี) แล้วเขียนตาราง users ให้สอดคล้องกัน
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// อีเมลภายในของระบบ — ไม่ได้ใช้ส่งเมลจริง เป็นแค่ตัวระบุบัญชีของ Supabase Auth (เหมือน seed ใน 022)
const EMAIL_DOMAIN = '@pruksatara.local'
const MIN_PASSWORD_LENGTH = 8
const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status })
}

// ตรวจสิทธิ์ผู้เรียก: token → auth user → users row → staff → ต้อง canManageStaff และยัง active
// (ตรวจฝั่ง server ด้วย service_role — role gate ที่ client อย่างเดียวเลี่ยงได้)
async function requireAdmin(req: Request, admin: SupabaseClient) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return { error: bad(401, 'ไม่พบสิทธิ์การเข้าใช้งาน — กรุณาเข้าสู่ระบบใหม่') }
  const { data: authData, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !authData.user) return { error: bad(401, 'เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่') }
  const { data: urow } = await admin
    .from('users').select('id, staff_id').eq('auth_id', authData.user.id).is('deleted_at', null).maybeSingle()
  if (!urow) return { error: bad(403, 'บัญชีนี้ไม่ได้ผูกกับพนักงาน') }
  const { data: srow } = await admin
    .from('staff').select('id, name, permissions, is_active').eq('id', urow.staff_id).is('deleted_at', null).maybeSingle()
  const perms = (srow?.permissions ?? {}) as Record<string, boolean>
  if (!srow || srow.is_active !== true || perms.canManageStaff !== true) {
    return { error: bad(403, 'ไม่มีสิทธิ์จัดการบัญชีผู้ใช้') }
  }
  return { callerUserId: String(urow.id), caller: { staffId: String(srow.id), staffName: String(srow.name) } }
}

// เขียน audit ฝั่ง server (ตารางเดียวกับในแอป) — การแตะบัญชีล็อกอินต้องมีร่องรอยเสมอ
async function logServerAudit(
  admin: SupabaseClient,
  caller: { staffId: string; staffName: string },
  action: string, summary: string, entityId: string,
) {
  const now = new Date().toISOString()
  const { error } = await admin.from('audit_logs').insert({
    id: `a${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
    staff_id: caller.staffId,
    staff_name: caller.staffName,
    category: 'auth',
    action,
    summary,
    entity_id: entityId,
    created_at: now,
  })
  // audit เขียนไม่ผ่านไม่ควรทำให้คำสั่งที่สำเร็จแล้วดูเหมือนล้มเหลว — log ไว้ที่ server แทน
  if (error) console.error('[accounts] audit insert:', error.message)
}

export async function POST(req: Request) {
  const admin = adminClient()
  if (!admin) return bad(503, 'ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY — จัดการบัญชีไม่ได้')

  const gate = await requireAdmin(req, admin)
  if ('error' in gate) return gate.error

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return bad(400, 'รูปแบบคำขอไม่ถูกต้อง') }
  const action = String(body.action ?? '')

  // ── สร้างบัญชีล็อกอินใหม่ให้พนักงาน ──────────────────────────────
  if (action === 'create') {
    const username = String(body.username ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const staffId = String(body.staffId ?? '')
    if (!USERNAME_RE.test(username)) return bad(400, 'ชื่อผู้ใช้ต้องเป็น a-z, 0-9, . _ - ยาว 3–32 ตัว')
    if (password.length < MIN_PASSWORD_LENGTH) return bad(400, `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`)
    if (!staffId) return bad(400, 'กรุณาเลือกพนักงานที่จะผูกกับบัญชีนี้')

    const { data: staffRow } = await admin
      .from('staff').select('id, name').eq('id', staffId).is('deleted_at', null).maybeSingle()
    if (!staffRow) return bad(400, 'ไม่พบพนักงานที่เลือก')

    const { data: existing } = await admin
      .from('users').select('id, username, staff_id').is('deleted_at', null)
    if ((existing ?? []).some((u) => String(u.username).toLowerCase() === username)) {
      return bad(409, `ชื่อผู้ใช้ "${username}" ถูกใช้แล้ว`)
    }
    if ((existing ?? []).some((u) => u.staff_id === staffId)) {
      return bad(409, `พนักงาน "${staffRow.name}" มีบัญชีล็อกอินอยู่แล้ว`)
    }

    const email = `${username}${EMAIL_DOMAIN}`
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (createErr || !created.user) return bad(400, `สร้างบัญชีไม่สำเร็จ: ${createErr?.message ?? 'ไม่ทราบสาเหตุ'}`)

    const userId = `u${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const { error: insErr } = await admin.from('users').insert({
      id: userId,
      username,
      password: hashPassword(password), // คอลัมน์ legacy (NOT NULL) — การล็อกอินจริงใช้ Supabase Auth
      staff_id: staffId,
      auth_id: created.user.id,
    })
    if (insErr) {
      // insert ไม่ผ่าน = บัญชี auth ที่เพิ่งสร้างจะกลายเป็นบัญชีลอย ล็อกอินได้แต่ไม่ผูกพนักงาน → ลบทิ้ง
      await admin.auth.admin.deleteUser(created.user.id)
      return bad(500, `บันทึกบัญชีไม่สำเร็จ: ${insErr.message}`)
    }
    await logServerAudit(admin, gate.caller, 'create-account',
      `สร้างบัญชีล็อกอิน "${username}" ให้ ${staffRow.name}`, userId)
    return NextResponse.json({ ok: true, id: userId, email })
  }

  // ── ตั้งรหัสผ่านใหม่ (กรณีพนักงานลืมรหัส) ────────────────────────
  if (action === 'reset-password') {
    const userId = String(body.userId ?? '')
    const password = String(body.password ?? '')
    if (password.length < MIN_PASSWORD_LENGTH) return bad(400, `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`)
    const { data: urow } = await admin
      .from('users').select('id, username, auth_id').eq('id', userId).is('deleted_at', null).maybeSingle()
    if (!urow?.auth_id) return bad(404, 'ไม่พบบัญชีนี้')

    const { error: updErr } = await admin.auth.admin.updateUserById(String(urow.auth_id), { password })
    if (updErr) return bad(400, `ตั้งรหัสผ่านใหม่ไม่สำเร็จ: ${updErr.message}`)
    await admin.from('users').update({ password: hashPassword(password) }).eq('id', userId)
    await logServerAudit(admin, gate.caller, 'reset-password',
      `ตั้งรหัสผ่านใหม่ให้บัญชี "${urow.username}"`, userId)
    return NextResponse.json({ ok: true })
  }

  // ── ลบบัญชีล็อกอิน (พนักงานลาออก/ย้ายงาน) ───────────────────────
  if (action === 'delete') {
    const userId = String(body.userId ?? '')
    if (userId === gate.callerUserId) return bad(400, 'ลบบัญชีของตัวเองไม่ได้')
    const { data: urow } = await admin
      .from('users').select('id, username, auth_id').eq('id', userId).is('deleted_at', null).maybeSingle()
    if (!urow) return bad(404, 'ไม่พบบัญชีนี้')

    // soft-delete แถว users ก่อน (แหล่งจริงของแอป) แล้วค่อยลบบัญชี auth — ถ้าลำดับกลับกันแล้วพลาด
    // จะเหลือแถวที่ล็อกอินไม่ได้แต่ยังโชว์ในระบบ
    const { error: delErr } = await admin.from('users')
      .update({ deleted_at: new Date().toISOString() }).eq('id', userId)
    if (delErr) return bad(500, `ลบบัญชีไม่สำเร็จ: ${delErr.message}`)
    if (urow.auth_id) await admin.auth.admin.deleteUser(String(urow.auth_id))
    await logServerAudit(admin, gate.caller, 'delete-account',
      `ลบบัญชีล็อกอิน "${urow.username}"`, userId)
    return NextResponse.json({ ok: true })
  }

  return bad(400, 'ไม่รู้จักคำสั่งนี้')
}
