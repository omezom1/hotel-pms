'use client'
/**
 * Zustand persist adapter ที่เก็บ state ทั้งก้อนไว้บน Supabase (cloud เต็ม)
 * แทน localStorage — เปิดเครื่องไหนก็เห็นข้อมูลชุดเดียวกัน
 *
 * เก็บเป็น JSON 1 แถวในตาราง `app_state` (id = ชื่อ store)
 * - getItem: โหลด state จาก cloud
 * - setItem: upsert ขึ้น cloud (last-write-wins)
 *
 * หมายเหตุ: createJSONStorage จะ stringify/parse envelope ให้อยู่แล้ว
 * เราจึงเก็บ object ลง jsonb ตรงๆ และคืนกลับเป็น JSON string
 */
import type { StateStorage } from 'zustand/middleware'
import { supabase } from './supabase'

const TABLE = 'app_state'

/**
 * id เฉพาะของแท็บ/หน้าต่างนี้ (อยู่ใน memory ไม่ persist)
 * ฝังลงแถวตอนเขียน เพื่อให้ Realtime แยกออกว่า event ไหนคือ "เสียงสะท้อนของตัวเอง"
 */
export const CLIENT_ID =
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) +
  '-' +
  Date.now().toString(36)

/**
 * ระหว่าง apply ข้อมูลจาก Realtime (แท็บอื่นเขียนมา) เราจะ setState ทับ
 * ซึ่ง persist จะพยายามเขียนกลับ cloud ทันที → เกิด ping-pong loop
 * flag นี้สั่งให้ setItem "ข้าม" การเขียนกลับช่วงนั้น
 */
let applyingRemote = false

/** ครอบ setState จาก Realtime เพื่อระงับการเขียนกลับ cloud (echo suppression) */
export function applyRemoteState(apply: () => void) {
  applyingRemote = true
  try {
    apply()
  } finally {
    applyingRemote = false
  }
}

export const supabaseStorage: StateStorage = {
  getItem: async (name) => {
    const { data, error } = await supabase
      .from(TABLE)
      .select('data')
      .eq('id', name)
      .maybeSingle()

    if (error) {
      console.error('[supabaseStorage] getItem:', error.message)
      return null
    }
    if (!data) return null
    // ถอด _writer ออกก่อนคืนให้ zustand (envelope ต้องตรงกับที่ persist เขียน)
    const { _writer, ...envelope } = (data.data ?? {}) as Record<string, unknown>
    return JSON.stringify(envelope)
  },

  setItem: async (name, value) => {
    // กำลัง apply ข้อมูลจาก remote อยู่ → ไม่ต้องเขียนกลับ (กัน loop)
    if (applyingRemote) return

    const { error } = await supabase
      .from(TABLE)
      .upsert({
        id: name,
        data: { ...JSON.parse(value), _writer: CLIENT_ID },
        updated_at: new Date().toISOString(),
      })

    if (error) console.error('[supabaseStorage] setItem:', error.message)
  },

  removeItem: async (name) => {
    const { error } = await supabase.from(TABLE).delete().eq('id', name)
    if (error) console.error('[supabaseStorage] removeItem:', error.message)
  },
}
