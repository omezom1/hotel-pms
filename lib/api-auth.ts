import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AuditCategory, StaffPermissions } from '@/types'

// ตัวช่วยฝั่ง server ที่ route handler ทุกตัวใช้ร่วมกัน (/api/accounts, /api/backup)
// แยกไว้ที่เดียวเพราะด่านตรวจสิทธิ์คือจุดที่ห้ามเขียนต่างกันคนละแบบ — เพี้ยนที่เดียวคือรูรั่ว

// client สิทธิ์สูง (service_role) — ใช้เฉพาะตอนลงมือเขียน/อ่านข้ามสิทธิ์จริง
export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

// client ที่สวมสิทธิ์ของผู้เรียก (anon key + token ของเขา) — ใช้ตรวจว่าใครเรียกและมีสิทธิ์ไหม
// แยกจาก service_role โดยตั้งใจ: ด่านตรวจสิทธิ์ต้องทำงานได้แม้ยังไม่ได้ตั้งคีย์ service_role
// (คนที่ไม่มีสิทธิ์จึงโดนปฏิเสธเสมอ ไม่ใช่ได้ข้อความว่าระบบยังไม่ได้ตั้งค่า)
export function callerClient(token: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

export function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status })
}

export type ApiCaller = { staffId: string; staffName: string }

// ตรวจสิทธิ์ผู้เรียก: token → auth user → users row → staff → ต้องมีสิทธิ์ที่ระบุ และยัง active
// (ตรวจฝั่ง server — role gate ที่ client อย่างเดียวเลี่ยงได้ด้วยการยิง API ตรง)
export async function requireStaffPermission(
  req: Request,
  permission: keyof StaffPermissions,
  deniedMessage: string,
): Promise<{ error: NextResponse } | { callerUserId: string; caller: ApiCaller }> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return { error: bad(401, 'ไม่พบสิทธิ์การเข้าใช้งาน — กรุณาเข้าสู่ระบบใหม่') }
  const caller = callerClient(token)
  if (!caller) return { error: bad(503, 'ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล') }
  const { data: authData, error: authErr } = await caller.auth.getUser(token)
  if (authErr || !authData.user) return { error: bad(401, 'เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่') }
  const { data: urow } = await caller
    .from('users').select('id, staff_id').eq('auth_id', authData.user.id).is('deleted_at', null).maybeSingle()
  if (!urow) return { error: bad(403, 'บัญชีนี้ไม่ได้ผูกกับพนักงาน') }
  const { data: srow } = await caller
    .from('staff').select('id, name, permissions, is_active').eq('id', urow.staff_id).is('deleted_at', null).maybeSingle()
  const perms = (srow?.permissions ?? {}) as Record<string, boolean>
  if (!srow || srow.is_active !== true || perms[permission] !== true) {
    return { error: bad(403, deniedMessage) }
  }
  return { callerUserId: String(urow.id), caller: { staffId: String(srow.id), staffName: String(srow.name) } }
}

// เขียน audit ฝั่ง server (ตารางเดียวกับในแอป) — งานที่ทำผ่าน service_role ต้องมีร่องรอยเสมอ
export async function logServerAudit(
  admin: SupabaseClient,
  caller: ApiCaller,
  action: string, summary: string, entityId: string,
  category: AuditCategory = 'auth',
) {
  const now = new Date().toISOString()
  const { error } = await admin.from('audit_logs').insert({
    id: `a${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
    staff_id: caller.staffId,
    staff_name: caller.staffName,
    category,
    action,
    summary,
    entity_id: entityId,
    created_at: now,
  })
  // audit เขียนไม่ผ่านไม่ควรทำให้คำสั่งที่สำเร็จแล้วดูเหมือนล้มเหลว — log ไว้ที่ server แทน
  if (error) console.error('[api-auth] audit insert:', error.message)
}
