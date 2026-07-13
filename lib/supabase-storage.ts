'use client'
/**
 * Zustand persist adapter ที่เก็บ state ทั้งก้อนไว้บน Supabase (cloud เต็ม)
 * แทน localStorage — เปิดเครื่องไหนก็เห็นข้อมูลชุดเดียวกัน
 *
 * เก็บเป็น JSON 1 แถวในตาราง `app_state` (id = ชื่อ store, คอลัมน์ data jsonb)
 * - getItem: โหลด state จาก cloud + จำเลข version ปัจจุบันไว้
 * - setItem: เขียนแบบ optimistic concurrency (CAS) — เขียนได้เฉพาะเมื่อ version
 *   ยังตรงกับตอนที่โหลดมา ถ้ามีคนเขียนแซง (version ขยับ) → ดึงล่าสุดมา merge
 *   แบบ union-by-id แล้วเขียนซ้ำ เพื่อไม่ให้งานของกันและกันหาย (แทน last-write-wins)
 *
 * หมายเหตุ: createJSONStorage จะ stringify/parse envelope ({state, version}) ให้อยู่แล้ว
 * เราเก็บ envelope นั้นลง jsonb ตรงๆ (+ _writer) และคืนกลับเป็น JSON string
 */
import type { StateStorage } from 'zustand/middleware'
import { supabase } from './supabase'

const TABLE = 'app_state'
const MAX_MERGE_RETRY = 5

/**
 * id เฉพาะของแท็บ/หน้าต่างนี้ (อยู่ใน memory ไม่ persist)
 * ฝังลงแถวตอนเขียน เพื่อให้ Realtime แยกออกว่า event ไหนคือ "เสียงสะท้อนของตัวเอง"
 */
export const CLIENT_ID =
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) +
  '-' +
  Date.now().toString(36)

/**
 * เลข version ของแถวที่เราเห็นล่าสุด (ฐานสำหรับ CAS)
 * - getItem อัปเดตตอนโหลด
 * - setItem อัปเดตเมื่อเขียนสำเร็จ
 * - AppShell อัปเดตเมื่อ Realtime ส่ง event ของแท็บอื่นมา (กัน false conflict)
 * null = ยังไม่เคยเห็นแถว (ยังไม่มีข้อมูลใน cloud)
 */
let lastSeenVersion: number | null = null
// version ใน DB เพิ่มทีละ 1 เสมอ (monotonic) — รับเฉพาะค่าที่ใหม่กว่า
// กัน echo ของ write เก่าที่มาถึงช้าดึง version ถอยหลัง (จะทำให้ CAS ครั้งหน้า false conflict)
export function setLastSeenVersion(v: number) {
  if (lastSeenVersion === null || v > lastSeenVersion) lastSeenVersion = v
}

/**
 * ยังรัน migration 004 (เพิ่มคอลัมน์ version) หรือยัง
 * ถ้ายัง (คอลัมน์ไม่มี) จะถอยไปใช้ upsert แบบ last-write-wins เดิม เพื่อให้แอปไม่พัง
 * getItem จะตรวจให้ตอนโหลด แล้ว setItem เลือกเส้นทางตามนี้
 */
let versioningAvailable = true
const COLUMN_MISSING = '42703' // postgres: undefined_column

/**
 * ระหว่าง apply ข้อมูลจาก Realtime (แท็บอื่นเขียนมา) หรือจากผล merge เราจะ setState ทับ
 * ซึ่ง persist จะพยายามเขียนกลับ cloud ทันที → เกิด ping-pong loop
 * flag นี้สั่งให้ setItem "ข้าม" การเขียนกลับช่วงนั้น
 */
let applyingRemote = false

/** ครอบ setState จาก Realtime/merge เพื่อระงับการเขียนกลับ cloud (echo suppression) */
export function applyRemoteState(apply: () => void) {
  applyingRemote = true
  try {
    apply()
  } finally {
    applyingRemote = false
  }
}

/**
 * store ลงทะเบียนตัว apply state ไว้ที่นี่ (เลี่ยง import วน lib/store → lib/supabase-storage)
 * ใช้ตอน merge สำเร็จ เพื่ออัปเดต state ในเครื่องให้เห็นผล union ทันที
 */
type StateApplier = (state: Record<string, unknown>) => void
let stateApplier: StateApplier | null = null
export function registerStateApplier(fn: StateApplier) {
  stateApplier = fn
}

/**
 * แจ้งเตือนเมื่อเขียนขึ้น cloud ไม่สำเร็จ (เน็ตหลุด/ชน version แก้ไม่ได้)
 * AppShell ลงทะเบียน handler ที่ขึ้น toast ให้ผู้ใช้รู้ว่างานยังไม่ถูกบันทึก
 */
type SaveErrorHandler = (message: string) => void
let saveErrorHandler: SaveErrorHandler | null = null
export function registerSaveErrorHandler(fn: SaveErrorHandler) {
  saveErrorHandler = fn
}
export function reportSaveError(context: string, message: string) {
  console.error(`[supabaseStorage] ${context}:`, message)
  saveErrorHandler?.(message)
}

/** envelope ที่ zustand persist เก็บ: { state, version } (version นี้คือของ zustand migration ไม่ใช่ของแถว) */
type Envelope = { state?: Record<string, unknown>; version?: number; _writer?: string }

/** merge อาเรย์ของ entity แบบ union ตาม id — local ชนะถ้า id ซ้ำ, remote ที่ไม่ซ้ำต่อท้าย */
function mergeById(local: unknown[], remote: unknown[]): unknown[] {
  const localIds = new Set(
    local.map((x) => (x && typeof x === 'object' ? (x as { id?: unknown }).id : undefined))
  )
  const extras = remote.filter((x) => {
    const id = x && typeof x === 'object' ? (x as { id?: unknown }).id : undefined
    return id !== undefined && !localIds.has(id)
  })
  return [...local, ...extras]
}

/**
 * merge state สองชุด: ฐานคือ remote, ทับด้วย local
 * - key ที่เป็นอาเรย์ทั้งคู่ → union ตาม id (งานคนละ entity/คนละ id อยู่ครบ)
 * - key อื่น (scalar) → ใช้ค่า local (เป็น action ที่ผู้ใช้เพิ่งทำ เจตนาชัดสุด)
 */
function mergeState(
  remote: Record<string, unknown>,
  local: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...remote, ...local }
  for (const key of Object.keys(out)) {
    const l = local[key]
    const r = remote[key]
    if (Array.isArray(l) && Array.isArray(r)) {
      out[key] = mergeById(l, r)
    }
  }
  // auditLogs (Phase 1) + expenses/inventory/maintenance (Tier A) + add_on_items (Tier B) ย้ายไปตารางจริงแล้ว — ไม่ให้ blob path
  // (CAS union-merge/write-back) ยุ่งกับมัน; per-table sync เป็นเจ้าของ slice เหล่านี้คนเดียว
  // (สำคัญกับ mutable+soft-delete เป็นพิเศษ: union-merge เคยชุบชีวิตแถวที่ soft-delete ไปแล้ว = §3c)
  delete out.auditLogs
  delete out.expenses
  delete out.inventoryItems
  delete out.inventoryTransactions
  delete out.maintenanceLogs
  delete out.addOnItems
  delete out.guests
  delete out.staff
  delete out.users
  delete out.corporateAccounts
  delete out.corporateTransactions
  delete out.rooms
  delete out.housekeepingTasks
  delete out.bookings
  delete out.invoices
  delete out.bookingAddOns
  delete out.dynamicPricing
  return out
}

export const supabaseStorage: StateStorage = {
  getItem: async (name) => {
    let { data, error } = await supabase
      .from(TABLE)
      .select('data, version')
      .eq('id', name)
      .maybeSingle()

    // ยังไม่ได้รัน migration 004 → คอลัมน์ version ยังไม่มี: ถอยไปอ่านแบบเดิม
    if (error && error.code === COLUMN_MISSING) {
      versioningAvailable = false
      console.warn('[supabaseStorage] ยังไม่มีคอลัมน์ version — รัน migration 004 เพื่อเปิด optimistic concurrency')
      ;({ data, error } = await supabase
        .from(TABLE)
        .select('data')
        .eq('id', name)
        .maybeSingle())
    }

    if (error) {
      console.error('[supabaseStorage] getItem:', error.message)
      return null
    }
    if (!data) {
      lastSeenVersion = null
      return null
    }
    lastSeenVersion =
      versioningAvailable && typeof data.version === 'number' ? data.version : 0
    // ถอด _writer ออกก่อนคืนให้ zustand (envelope ต้องตรงกับที่ persist เขียน)
    const { _writer, ...envelope } = (data.data ?? {}) as Envelope
    return JSON.stringify(envelope)
  },

  setItem: async (name, value) => {
    // กำลัง apply ข้อมูลจาก remote/merge อยู่ → ไม่ต้องเขียนกลับ (กัน loop)
    if (applyingRemote) return

    const envelope = JSON.parse(value) as Envelope
    const row = { ...envelope, _writer: CLIENT_ID }
    const now = new Date().toISOString()

    // ยังไม่ได้รัน migration 004 → ใช้ upsert แบบ last-write-wins เดิม (แอปไม่พัง)
    if (!versioningAvailable) {
      const { error } = await supabase
        .from(TABLE)
        .upsert({ id: name, data: row, updated_at: now })
      if (error) reportSaveError('setItem (legacy)', error.message)
      return
    }

    // --- กรณียังไม่เคยเห็นแถว → insert ใหม่ (version เริ่มที่ 1) ---
    if (lastSeenVersion === null) {
      const { error } = await supabase
        .from(TABLE)
        .insert({ id: name, data: row, version: 1, updated_at: now })
      if (!error) {
        lastSeenVersion = 1
        return
      }
      // 23505 = unique violation → มีคนสร้างแถวไปแล้ว ถือเป็น conflict
      if (error.code !== '23505') {
        reportSaveError('setItem insert', error.message)
        return
      }
    } else {
      // --- CAS update: เขียนได้เฉพาะเมื่อ version ยังตรงกับที่โหลดมา ---
      const expected = lastSeenVersion
      const next = expected + 1
      const { data, error } = await supabase
        .from(TABLE)
        .update({ data: row, version: next, updated_at: now })
        .eq('id', name)
        .eq('version', expected)
        .select('version')
      if (error) {
        reportSaveError('setItem update', error.message)
        return
      }
      if (data && data.length > 0) {
        lastSeenVersion = next
        return
      }
      // 0 แถวถูกอัปเดต = version ขยับไปแล้ว (มีคนเขียนแซง) → ตกลงไป conflict loop
    }

    // --- Conflict: ดึงล่าสุด → merge → เขียนซ้ำด้วย CAS (ลองหลายรอบ) ---
    const localState = (envelope.state ?? {}) as Record<string, unknown>
    for (let attempt = 0; attempt < MAX_MERGE_RETRY; attempt++) {
      const { data: latest, error: fetchErr } = await supabase
        .from(TABLE)
        .select('data, version')
        .eq('id', name)
        .maybeSingle()
      if (fetchErr || !latest) {
        reportSaveError('setItem merge-fetch', fetchErr?.message ?? 'ไม่พบข้อมูลล่าสุด')
        return
      }
      const remoteEnvelope = (latest.data ?? {}) as Envelope
      const remoteState = (remoteEnvelope.state ?? {}) as Record<string, unknown>
      const remoteVersion = typeof latest.version === 'number' ? latest.version : 0

      const mergedState = mergeState(remoteState, localState)
      const mergedEnvelope: Envelope = { ...envelope, state: mergedState, _writer: CLIENT_ID }
      const mergedNext = remoteVersion + 1

      const { data: wrote, error: writeErr } = await supabase
        .from(TABLE)
        .update({ data: mergedEnvelope, version: mergedNext, updated_at: new Date().toISOString() })
        .eq('id', name)
        .eq('version', remoteVersion)
        .select('version')
      if (writeErr) {
        reportSaveError('setItem merge-write', writeErr.message)
        return
      }
      if (wrote && wrote.length > 0) {
        lastSeenVersion = mergedNext
        // อัปเดต state ในเครื่องให้เห็นผล union (ไม่เขียนกลับ cloud — กัน loop)
        if (stateApplier) applyRemoteState(() => stateApplier!(mergedState))
        return
      }
      // ยังชนอีก (มีคนเขียนแซงระหว่าง merge) → วนใหม่
    }
    reportSaveError('setItem merge', `ชนกันต่อเนื่องเกิน ${MAX_MERGE_RETRY} รอบ — ยังบันทึกไม่สำเร็จ`)
  },

  removeItem: async (name) => {
    const { error } = await supabase.from(TABLE).delete().eq('id', name)
    if (error) console.error('[supabaseStorage] removeItem:', error.message)
    lastSeenVersion = null
  },
}
