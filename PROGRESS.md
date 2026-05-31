# PROGRESS / HANDOFF — Hotel PMS (Pruksatara Park & Resort)

> ไฟล์นี้คือ "บันทึกส่งต่องาน" สำหรับเปิดแชท/เซสชันใหม่ที่ยังไม่รู้บริบทอะไรเลย
> อ่านไฟล์นี้ก่อนเริ่มงาน จะเข้าใจว่าระบบทำงานยังไง ทำอะไรไปแล้ว และเหลืออะไร
> อัปเดตล่าสุด: 2026-05-31

---

## 1. ภาพรวมโปรเจกต์
ระบบจัดการโรงแรม (PMS) ของ **Pruksatara Park & Resort** — ใช้ภายใน/ทีมเล็ก
- **Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · Zustand (+persist) · Supabase
- **โหมดข้อมูล:** "cloud เต็ม" — เก็บ state ของแอป **ทั้งก้อนเป็น JSON 1 แถว** บน Supabase
  (ไม่ใช่ proper relational tables) เปิดเครื่อง/แท็บไหนก็เห็นข้อมูลชุดเดียวกัน
- รันแอป: `npm run dev` → http://localhost:3000

## 2. สถาปัตยกรรมข้อมูล (สำคัญที่สุด — อ่านก่อน)
- **store หลัก** = `lib/store.ts` (`useHotelStore`, Zustand) เก็บทุก entity:
  rooms, guests, bookings, invoices, housekeepingTasks, maintenanceLogs, staff,
  inventory, corporate accounts, add-ons, expenses, auditLogs
- **persist adapter** = `lib/supabase-storage.ts` — เขียน/อ่าน state ทั้งก้อนลง
  Supabase ตาราง `app_state` (1 แถว, `id = 'hotel-pms-storage'`, คอลัมน์ `data` jsonb)
- **storage เป็น async** (รอ network) จึงต้องจัดการ hydration เอง (ดูข้อ 3)
- **auth store** = `lib/auth-store.ts` แยกต่างหาก **ยังใช้ localStorage** (`hotel-pms-auth`)
- seed data = `lib/mock-data.ts` (ใช้เป็น initial state ถ้า cloud ยังว่าง)

## 3. กลไกที่ระวังพิเศษ (เคยเป็นบั๊ก แก้แล้ว — อย่าทำพัง)
### 3a. Async hydration (กันข้อมูล cloud โดน mock เขียนทับ)
- `lib/store.ts`: persist ใช้ `skipHydration: true` + state `_hasHydrated` (+`setHasHydrated`)
- `components/layout/AppShell.tsx`: เรียก `useHotelStore.persist.rehydrate()` ตอน mount
  และ **gate UI** ("กำลังโหลดข้อมูลจากคลาวด์…") จนกว่า `_hasHydrated` เป็น true
- ถ้าเอา gate ออก หรือไม่ skipHydration: แอปจะ render ด้วย mock ก่อน แล้ว action ของ user
  จะเขียน mock ทับ cloud → **ข้อมูลจริงหาย**

### 3b. Realtime cross-tab sync (กัน last-write-wins)
- เก็บ state เป็น blob ก้อนเดียว ถ้า 2 แท็บเขียนพร้อมกัน อันหลังทับอันแรก → งานหาย
- แก้ด้วย Supabase Realtime: `AppShell.tsx` subscribe `postgres_changes` ของ `app_state`
  (filter `id=eq.hotel-pms-storage`) → แท็บอื่นเขียน ดึง state ใหม่มา `setState` ทันที
- กัน loop: ฝัง `_writer` (CLIENT_ID ต่อแท็บ) ลงแถวตอนเขียน, ข้าม event ของตัวเอง,
  และ `applyRemoteState()` ระงับการเขียนกลับ cloud ระหว่าง apply (ดู `lib/supabase-storage.ts`)
- **ต้องเปิด realtime ที่ DB** (migration 003) ไม่งั้นโค้ดไม่ error แต่ไม่ sync

## 4. Migrations (รันที่ Supabase Dashboard → SQL Editor)
ไฟล์อยู่ใน `supabase/migrations/` — **วาง *เนื้อใน* ไฟล์ ไม่ใช่ path**
- `002_app_state.sql` — สร้างตาราง `app_state` + RLS (anon full access) — ✅ รันแล้ว
- `003_realtime_app_state.sql` — เปิด realtime publication + replica identity full — ✅ รันแล้ว
> DDL รันผ่าน anon key ไม่ได้ ต้องทำใน Dashboard เท่านั้น

## 5. ✅ ทำเสร็จแล้ว (2026-05-31)
- ย้าย store หลักจาก localStorage → Supabase cloud (commit `c2cc40b`)
- Async hydration ปลอดภัย + gate (commit `c2cc40b`)
- Realtime cross-tab sync (commit `a46d29a`) — **ทดสอบในเบราว์เซอร์จริงแล้วใช้ได้**
- gitignore กัน `.env.local.txt` (มี Supabase key)

## 6. ⏳ งานค้าง / Backlog
1. **`lib/auth-store.ts` ยังใช้ localStorage** → login ไม่ sync ข้ามเครื่อง (ความเสี่ยงต่ำ)
2. **last-write-wins ยังเป็น blob ทั้งก้อน** — realtime ช่วยลดความเสี่ยงแล้ว แต่ถ้าจะ
   ทำให้ถูกต้องจริงต้องแยก entity หลัก (bookings/rooms) เป็น proper Supabase tables
3. ความปลอดภัย: RLS เป็น anon full access (ใครมี URL+key เข้าได้เต็ม) — เหมาะงานภายในเท่านั้น

## 7. ⚠️ Gotchas
- **อย่า `pkill -f "next dev"`** — จับ shell ของคำสั่งเองด้วย ทำให้ command ตาย
  ถ้า HMR ค้าง (โค้ดใหม่ไม่เข้า browser): `rm -rf .next` แล้วสตาร์ทใหม่ + hard refresh
  เช็คว่าโค้ดเข้า bundle ไหม: `grep -rl "<ข้อความในโค้ด>" .next/`
- เบราว์เซอร์ debug ใช้ `console.log` (ไม่ใช่ `console.debug` — ถูกซ่อนใน filter "Default levels")
- `.env.local.txt` มี key จริง — gitignore แล้ว **อย่า commit**
- หน้า `app/channels` ถูกลบทิ้งแล้ว (ไม่ใช้ OTA channels)

## 8. Git workflow
- ทำงานบน local `main` ตรงๆ แล้ว push ผ่าน PR (GitHub: omezom1)
- ปัจจุบัน local main นำ origin/main อยู่ (commit cloud migration ยังไม่ push)
- จบ commit message ด้วย `Co-Authored-By: Claude ...`

## 9. ไฟล์สำคัญ (เริ่มอ่านจากตรงนี้)
| ไฟล์ | หน้าที่ |
|------|--------|
| `lib/store.ts` | store หลัก + ทุก action + persist config |
| `lib/supabase-storage.ts` | adapter เขียน/อ่าน cloud + echo suppression |
| `lib/supabase.ts` | สร้าง Supabase client |
| `lib/auth-store.ts` | login/permission (ยัง localStorage) |
| `components/layout/AppShell.tsx` | hydration gate + realtime subscribe + auth/permission guard |
| `lib/route-permissions.ts` | สิทธิ์เข้าถึงแต่ละ route |
| `lib/mock-data.ts` | seed data |
| `supabase/migrations/` | SQL ที่ต้องรันบน Dashboard |
