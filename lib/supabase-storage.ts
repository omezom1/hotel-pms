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
    return data ? JSON.stringify(data.data) : null
  },

  setItem: async (name, value) => {
    const { error } = await supabase
      .from(TABLE)
      .upsert({
        id: name,
        data: JSON.parse(value),
        updated_at: new Date().toISOString(),
      })

    if (error) console.error('[supabaseStorage] setItem:', error.message)
  },

  removeItem: async (name) => {
    const { error } = await supabase.from(TABLE).delete().eq('id', name)
    if (error) console.error('[supabaseStorage] removeItem:', error.message)
  },
}
