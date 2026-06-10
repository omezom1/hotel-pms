# PROGRESS / HANDOFF — Hotel PMS (Pruksatara Park & Resort)

> ไฟล์นี้คือ "บันทึกส่งต่องาน" สำหรับเปิดแชท/เซสชันใหม่ที่ยังไม่รู้บริบทอะไรเลย
> อ่านไฟล์นี้ก่อนเริ่มงาน จะเข้าใจว่าระบบทำงานยังไง ทำอะไรไปแล้ว และเหลืออะไร
> อัปเดตล่าสุด: 2026-06-11

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
- **auth store** = `lib/auth-store.ts` แยกต่างหาก เก็บ **session** ใน localStorage (`hotel-pms-auth`)
  แต่ **บัญชีผู้ใช้ (`users`) ย้ายไปอยู่ใน cloud blob แล้ว** (ดูข้อ 5) — login เช็คกับ cloud
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

### 3c. Optimistic concurrency / version guard (2026-06-01 — กัน last-write-wins ให้แน่นขึ้น)
- เพิ่มคอลัมน์ `version` ใน `app_state` (migration 004) ทำ CAS ใน `lib/supabase-storage.ts`:
  เขียนได้เฉพาะเมื่อ `version` ยังตรงกับตอนโหลด ถ้ามีคนเขียนแซง → ดึงล่าสุดมา
  **merge แบบ union-by-id** (งานคนละ entity/คนละ id อยู่ครบ) แล้วเขียนซ้ำ + อัปเดต store
- `lastSeenVersion` (module var) เป็นฐาน CAS — getItem ตั้งตอนโหลด, setItem ตั้งเมื่อเขียนสำเร็จ,
  `AppShell` ตั้งทุกครั้งที่ Realtime ส่ง event มา (กัน false conflict); setter เป็น monotonic
- store ลงทะเบียน `registerStateApplier()` ให้ adapter apply ผล merge กลับเข้า state ได้ (เลี่ยง import วน)
- **ถ้ายังไม่รัน migration 004** โค้ดตรวจเจอ (error 42703) แล้ว **ถอยไป upsert แบบเดิมอัตโนมัติ**
  (แอปไม่พัง) → รัน 004 เมื่อไรก็ auto-upgrade ตอน reload
- **ข้อจำกัดที่รู้:** union-merge อาจ "ชุบชีวิต" รายการที่อีกแท็บลบไป (expenses/inventory/users/
  maintenance) ในหน้าต่าง conflict สั้นๆ — ยังดีกว่า LWW เดิม; แก้ถูก 100% ต้องใช้ tombstone/
  per-entity timestamp (= งานใหญ่ที่เลือกไม่ทำ ดูข้อ 6.2)

## 4. Migrations (รันที่ Supabase Dashboard → SQL Editor)
ไฟล์อยู่ใน `supabase/migrations/` — **วาง *เนื้อใน* ไฟล์ ไม่ใช่ path**
- `002_app_state.sql` — สร้างตาราง `app_state` + RLS (anon full access) — ✅ รันแล้ว
- `003_realtime_app_state.sql` — เปิด realtime publication + replica identity full — ✅ รันแล้ว
- `004_app_state_version.sql` — เพิ่มคอลัมน์ `version` (optimistic concurrency) — ✅ รันแล้ว (2026-06-01)
- `005_relational_prep.sql` — **Phase 0** relational migration: ตาราง `payments`+`expenses`, คอลัมน์ `bookings.room_type_at_booking`, `updated_at`/`deleted_at` + trigger `set_updated_at` บน 13 ตารางที่จะย้าย (additive ล้วน) — ⏳ **ยังไม่รัน**
- `006_audit_logs_realtime.sql` — **Phase 1** (audit_logs entity แรก): reconcile CHECK category (union `expense`+`staff`), เพิ่ม `writer_id`, เปิด realtime publication + replica identity full — ✅ รันแล้ว
- `007_receipts_storage.sql` — bucket `receipts` (แนบรูปบิล) public + anon read/upload/delete — ✅ รันแล้ว
- `008_expenses_realtime.sql` — **Tier A** (expenses, entity แรกที่ mutable): เพิ่มคอลัมน์ `receipt_path`+`writer_id`, เปิด realtime publication + replica identity full (รองรับ UPDATE/DELETE payload) — ✅ รันแล้ว (2026-06-09)
- `009_inventory_realtime.sql` — **Tier A** (inventory, 2 entity): เพิ่ม `writer_id` ให้ `inventory_items` (mutable, soft-delete) + `inventory_transactions` (ledger append-only), เปิด realtime publication + replica identity full ทั้งคู่ — ✅ รันแล้ว (2026-06-10)
- `010_maintenance_realtime.sql` — **Tier A** (maintenance_logs, mutable+soft-delete): เพิ่ม `writer_id`, **DROP FK `maintenance_logs_room_id_fkey`** (rooms ยัง blob/orphan — ใส่กลับเมื่อย้าย rooms ใน Tier B), เปิด realtime + replica identity full — ✅ รันแล้ว (2026-06-10)
- `011_add_on_items_realtime.sql` — **Tier B kickoff** (add_on_items, read-only catalog): เพิ่ม `writer_id`, เปิด realtime + replica identity full (คง FK `inventory_item_id→inventory_items` ไว้ — parent ย้ายแล้ว valid) — ✅ รันแล้ว (2026-06-10, **ผ่าน MCP execute_sql**)
> **อัปเดต 2026-06-10:** MCP `execute_sql` **รัน DDL ได้** (ใช้สิทธิ์ management ไม่ใช่ anon key) — ไม่ต้องไปวางใน Dashboard เองอีก. (กฎเก่าว่า "MCP ถูกบล็อก" ใช้กับ `apply_migration` tool เท่านั้น; `execute_sql` รัน ALTER/DO/etc. ได้)

## 4b. Deployment (Vercel) — ⚠️ ตั้งค่าครั้งเดียว อย่าลืม
- โปรเจกต์ Vercel: **hotel-pms** (org "Wasin's projects") → domain `hotel-pms-henna.vercel.app`
- **Production track branch `main`** → push main = auto-deploy production
- **ต้องตั้ง Environment Variables ใน Vercel** (Settings → Environments → Production):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - ค่าอยู่ในไฟล์ `.env.local` (gitignore — ไม่ขึ้น GitHub) ต้องใส่มือใน Vercel
- **บั๊กที่เคยเจอ (2026-06-01):** ถ้า env var หาย build จะ **error ตอน prerender**
  `Error: supabaseUrl is required` เพราะ `lib/supabase.ts` สร้าง client ตอน build time
  (หน้าเป็น static) → แก้โดยใส่ env var แล้ว **Redeploy** (NEXT_PUBLIC ฝังตอน build เท่านั้น)
- git push: เครื่องนี้ตั้ง credential.helper ชี้ Windows GCM แล้ว (`git config --global`
  `credential.helper '!"/mnt/c/Program Files/Git/mingw64/bin/git-credential-manager.exe"'`)
  — เครื่องใหม่ (notebook) ต้องตั้งเอง + ก๊อป `.env.local` มาด้วยมือ

## 5. ✅ ทำเสร็จแล้ว
### 2026-05-31
- ย้าย store หลักจาก localStorage → Supabase cloud (commit `c2cc40b`)
- Async hydration ปลอดภัย + gate (commit `c2cc40b`)
- Realtime cross-tab sync (commit `a46d29a`) — **ทดสอบในเบราว์เซอร์จริงแล้วใช้ได้**
- gitignore กัน `.env.local.txt` (มี Supabase key)

### 2026-06-01
- **ข้อ 1 — บัญชีผู้ใช้ขึ้น cloud:** เพิ่ม `users` ใน hotel store (seed จาก `mockUsers`),
  `auth-store.login` ตรวจกับ users/staff บน cloud + บันทึก `lastLogin` กลับ cloud,
  หน้า login รอ cloud hydrate ก่อนเปิดปุ่ม, เพิ่ม panel จัดการบัญชี (เพิ่ม/แก้/ลบ) ใน
  หน้า `/staff` (เฉพาะ `canManageStaff`) — **session ยังแยกแต่ละเครื่อง (localStorage ถูกต้อง)**
  ไฟล์: `lib/store.ts`, `lib/auth-store.ts`, `app/login/page.tsx`, `app/staff/page.tsx`
- **ข้อ 2 — version guard (optimistic concurrency):** ดูข้อ 3c — ✅ รัน migration 004 แล้ว
  > เลือกแนวนี้แทนการแยก bookings/rooms เป็น relational tables เพราะ action เช่น เช็คเอาต์
  > เขียนพร้อมกันหลาย entity (invoices/HK/guests/corporate) ที่ยังเป็น blob → hybrid จะเกิด
  > partial-write ไม่ atomic; version guard ปลอดภัยกว่าและตรงเป้า "หลายคนทำไม่ทับกันหาย"

### 2026-06-01 (รอบ 2 — quick wins + ฟีเจอร์ใช้งานจริง)
- เมนู **ซ่อมบำรุง** เข้า Sidebar + **permission editor** รายคนในหน้า /staff (ตั้งสิทธิ์ได้จริง)
- `/invoice` redirect → /finance กัน 404; บังคับ `canManageFinance` จริง (finance/expenses)
- `exportData` ตัด password ออก (กัน plaintext รั่วในไฟล์ backup)
- **เช็คเอาต์ค้างชำระ**: CheckoutConfirmDialog (รับชำระก่อน/เช็คเอาต์ค้าง) แทน confirm native
- **extend** เตือนยอดค้างใหม่; **ปุ่ม reset** แก้ให้ลบแถวบน Supabase จริง (เดิมลบ localStorage)
- **reliability**: toast เตือนเมื่อเขียน cloud ล้มเหลว (registerSaveErrorHandler) + loading timeout/retry ใน AppShell
- **แก้ข้อมูลแขก** (wire updateGuest); **เปลี่ยนรหัสผ่านตัวเอง** (ChangePasswordButton)
- **Staff CRUD** เพิ่ม/แก้/ลบพนักงาน (store: addStaff/deleteStaff) + สิทธิ์เริ่มต้นตามตำแหน่ง
- **มัดจำตอน walk-in** (ชำระเต็ม/มัดจำ) + **early check-out** ปรับยอดตามคืนจริง + คืนเงินส่วนเกิน
  (store.adjustForEarlyCheckout, EarlyCheckoutDialog ใช้ทั้ง front-desk + booking detail)
- **ConfirmProvider/useConfirm**: confirm modal กลาง (Esc/aria-modal) แทน window.confirm ทั้งแอป
- commit: 2b59348, 2b3de5a, 5b2153f, 478f63e, 2687f93, e0c6848, b9eb6e2, ea65e47 (ยังไม่ push)

### 2026-06-03
- **แก้บั๊ก timezone off-by-one ของ date-picker:** react-date-range/native date input ให้ `Date`
  เป็น "เที่ยงคืนเวลาท้องถิ่น"; เรียก `.toISOString()` ตรง ๆ ใน TZ +07 จะเลื่อนวันถอย 1
  (3 มิ.ย. 00:00 +07 → 2 มิ.ย. 17:00 UTC) ทำให้ `split('T')[0]` อ่านผิดวัน
  → เพิ่ม `calendarDateToISO()` ใน `lib/utils.ts` (อ่าน Y/M/D ท้องถิ่นแล้วตรึงเป็น UTC-midnight)
  ใช้ใน `app/bookings/page.tsx` (DateRange + native date inputs) และ walk-in ใน `app/front-desk/page.tsx`
- **กันจำนวนคืน walk-in ชนการจองถัดไป:** เพิ่ม `maxNightsBeforeConflict()` ใน `lib/utils.ts`
  → ที่ front-desk โชว์เตือน (ชนวันที่ไหน/สูงสุดกี่คืน) + disable ปุ่ม "ยืนยัน Walk-in" เมื่อเกิน
- หมายเหตุ: `store.extendBooking` / `bookings/[id]:599` บวกวันบนค่า UTC-midnight อยู่แล้ว → ไม่เพี้ยน

### 2026-06-04 → 06-05 (QA audit + แก้รอบใหญ่) — branch `fix/revenue-consolidation-double-submit`
รัน `hotel-pms-qa-auditor` หลายรอบ แก้ตามที่เจอ (tsc clean เหลือ 4 pre-existing errors เดิม)
- **revenue เป็น single source of truth** (`lib/utils.ts`): `isRealizedRevenue`/`sumRealizedRevenue`
  — รับรู้รายได้เฉพาะตอน `checked_out`. routed dashboard/reports/finance/daily-report ผ่านตัวนี้
- **กัน double-submit overbooking**: ย้าย `roomHasConflict` เข้าใน `set()` ของ `createBooking` (atomic)
- **timezone**: walk-in/date-input ใช้ `calendarDateToISO`/`todayLocal`; net-payment label; responsive grids
- **add-on charge policy** (เปลี่ยนนโยบาย): คิดเงินเฉพาะ `fulfilled` (เดิม `requested` ก็คิด) —
  คุมที่ `addOnCountsTowardCharge` จุดเดียว + จุด inline ใน store เรียก helper เดียวกัน (บิลตรงกันเป๊ะ)
- **`roomTypeAtBooking` snapshot** (`types/index.ts` + `createBooking`): reports แยกรายได้ตามประเภท
  ถูกแม้ย้ายห้องข้ามประเภท (booking เก่า fallback เป็นประเภทห้องปัจจุบัน)
- **consolidate pricing**: `extendBooking` + `adjustForEarlyCheckout` ใช้ `calcBookingTotal`
  (ราคารายคืนจริง) แทน loop ซ้ำ/ราคาเฉลี่ย → ถูกเมื่อใช้ dynamic pricing.
  เพิ่ม `addNightsISO()` (บวกคืนตรึง UTC-midnight) ใช้แทน epoch math/local setDate ทั้ง store + preview
- **race guards เพิ่ม**: ย้าย validation เข้า `set()` เดียวสำหรับ `recordPayment` (กันจ่ายเกินตอนกดรัว)
  + `fulfillAddOn` (re-check stock กันตัดเกิน stock ติดลบ) ตามแพทเทิร์น `createBooking`
- **invoice[id] display**: clamp ยอดชำระ/ค้างให้อยู่ในกรอบ `[0,total]` (ใบที่พิมพ์สอดคล้องกันเอง
  แม้มี add-on/refund หลังออกใบ) + แปลสถานะ `refunded` → "คืนเงินแล้ว"
- commits: `73e7a37`, `1f8dc19`, `c318b0e` (push แล้ว), `c8733cb` (**ยังไม่ push**)
- ⏳ **verify ผ่าน browser ยังไม่ได้ทำ**: routes ผ่าน HTTP smoke (200, ไม่มี error) แต่ flow จริง
  (จ่ายเงินกดรัว / fulfill stock / extend / invoice display) ยังไม่ได้คลิกเช็ค —
  กล่อง WSL ubuntu-26.04 ไม่มี headless Chrome (setup หลายขั้น); คลิกเช็คที่ localhost:3000 จาก Windows ได้

### 2026-06-06 (QA รอบ 6 — โซนที่ยังไม่ได้ตรวจ + แจ้งเตือนจริง)
- **inventory**: กัน `maxStock=0` หารไม่ลงตัว (NaN/Infinity) ใน `getStockLevel` + แถบ % สต็อก;
  ฟอร์มเพิ่ม/แก้ validate `maxStock>0` และ `minStock≤maxStock`; สรุป "รับเข้า/จ่ายออก" ใน modal
  ประวัติ bucket ตาม `type` (restock vs use+waste) แทนเครื่องหมาย → `adjust` (reconcile) ไม่ปนอีก
- **occupancy = ห้องที่ขายได้จริง**: เพิ่ม `sellableRoomCount()` (ตัดห้อง `maintenance`) ใน `lib/utils.ts`
  เป็นตัวหารมาตรฐานเดียวกันทั้ง dashboard/reports/daily-report (เดิมหาร `rooms.length` รวมห้องปิดปรับปรุง
  → % ต่ำเกินจริง). **ลบ RevPAR** (การ์ด KPI + กราฟ) ออกจาก dashboard+reports ตามที่ผู้ใช้เลือก
  (reports แทนด้วยการ์ด "รายได้วันนี้"); dashboard ปรับ grid KPI เป็น 3 คอลัมน์
- **กระดิ่งแจ้งเตือนใช้งานจริง**: เดิมเป็นของปลอม (badge "3" hardcode + ไม่มี onClick).
  สร้าง `components/layout/NotificationBell.tsx` นับจากข้อมูลจริง 5 หมวด (รอเช็คอิน/ครบกำหนดเช็คเอาต์/
  สต็อกต่ำ/งานซ่อมค้าง/งานแม่บ้านค้าง) → dropdown แต่ละแถวคลิกไปหน้าที่เกี่ยวข้อง, ปิดด้วย Esc/คลิกนอก,
  badge โชว์ยอดจริง (9+). เสียบแทนใน `Header.tsx` (ใช้ร่วมทุกหน้า ไม่ต้องแตะ page)
- tsc clean (เหลือ 4 pre-existing errors เดิม); ⏳ ยังไม่ verify ผ่าน browser (click-test ที่ localhost จาก Windows)
- หมายเหตุ QA ค้าง (MED, ข้าม): daily-report "เช็คอินวันนี้" กรองตาม `checkIn` ที่กำหนด ไม่ใช่เวลาเช็คอินจริง
  (ไม่มีฟิลด์ `checkedInAt`) — แก้ถูก 100% ต้องเพิ่มฟิลด์ใน data model

### 2026-06-06 (เริ่ม Relational Migration — Phase 0 + Phase 1 audit_logs)
เริ่มงานใหญ่ blob→relational แบบ **strangler** (อยู่ร่วมกับ blob, kill-switch ต่อ entity, dual-write = rollback ฟรี). แผนเต็ม: decisions ล็อก (pricing คำนวณ client ส่งเข้า RPC, payments แยกตาราง). **audit_logs เป็น entity แรก** (practice) เพราะ append-only + single writer/reader → blast radius เล็กสุด.
- **DDL** `005` (Phase 0, additive) + `006` (Phase 1 audit_logs) เขียนแล้ว — ⏳ **ผู้ใช้ต้องรันใน Dashboard** (เจอ: CHECK category ของ audit_logs ใน 001 มี `'staff'` แต่ TS มี `'expense'` — 006 union ทั้งคู่ กัน `23514`)
- **dual-write** (`lib/store.ts` `logAudit`): หลัง `set()` เดิม insert ขึ้นตาราง `audit_logs` (map cam→snake + `writer_id=CLIENT_ID`), **ไม่ silent** — fail แล้ว `reportSaveError` (export ใหม่จาก supabase-storage)
- **hydration + per-table channel** (`AppShell.tsx`): channel `'audit_logs-sync'` (INSERT) แยกจาก `app_state-sync`; ลำดับ **subscribe→buffer→seed** (rehydrate blob เสร็จก่อนค่อย seed `select…limit 500` กัน merge clobber); `upsertAuditLogs` dedup-by-id + sort + cap 500; echo-guard `writer_id===CLIENT_ID`
- **footer** `/audit-log`: แก้ "เก็บ 500…ลบอัตโนมัติ" → "แสดง 500 ล่าสุด (เก็บครบบนคลาวด์)" (retention DECIDED: ตารางเก็บครบ, hydrate 500)
- ✅ **DDL 005+006 รันแล้วบน live DB + verify ครบ** (payments/expenses/writer_id/realtime/room_type_at_booking)
- ✅ **CUTOVER เสร็จ + verify ผ่าน** (2-tab realtime ตรงกัน): พบบั๊กตอนเทสต์ — `app_state` full-state sync ส่ง `auditLogs` มาทับสิ่งที่ `audit_logs-sync` เพิ่ง apply → 2 แท็บไม่ตรงกัน. แก้ด้วยการตัด auditLogs ออกจาก blob path **3 จุด**: (1) `partialize` ใน persist (blob ไม่เก็บ auditLogs), (2) AppShell `app_state-sync` strip auditLogs จาก incoming, (3) `mergeState` `delete out.auditLogs`. ตาราง audit_logs = เจ้าของ slice นี้คนเดียวแล้ว
- QA round-7 (agent) ผ่าน: ไม่มี HIGH/MED, แก้ LOW (logAudit id entropy 4→5 ตัว + มอง 23505 เป็น idempotent ไม่เด้ง toast). tsc clean (เหลือ 4 errors เดิม)
- **NEXT:** Tier A ที่เหลือ (expenses/inventory/maintenance) ตามแพทเทิร์นเดียวกัน → Tier B → Tier C+RPC (bookings/invoices/payments, riskiest) → retire blob

### 2026-06-07 (bug fixes จาก click-test + ฟีเจอร์แนบใบเสร็จ)
- **timezone date-bucketing** (pms-logic-guard): `onDate`/`split('T')[0]` เอา timestamp จริง (UTC) ไปเทียบวัน local → walk-in/รับเงินช่วงข้ามคืนไทย (00:00–06:59) นับวันผิด (ยอดรับเงินสุทธิ=0). consolidate เป็น 2 helper ใน `lib/utils.ts`: **`calendarDay()`** (checkIn/checkOut เก็บ UTC-midnight) vs **`eventDay()`** (timestamp จริง→local). route: daily-report ×6, finance export issuedAt, staff hireDate default. NotificationBell dedup `day`→`calendarDay`. (supabase-api.ts:336 = dead code, ไม่แตะ)
- **dark mode**: การ์ด KPI daily-report ใช้ `bg-accent-50` (สว่าง ไม่โดน globals override) + ตัวเลข `text-slate-800` (โดน invert เป็นสว่าง) = มองไม่เห็น. เพิ่ม `dark:bg-{accent}-950/40` ให้ daily-report (4) + front-desk (3). (หน้าอื่นใช้ bg-white → globals จัดการแล้ว)
- **walk-in guest snapshot**: walk-in ลูกค้าใหม่เดิมเรียก `addGuest` ลง CRM → รก dropdown "ลูกค้าเดิม". เปลี่ยนเป็นเก็บ `guestSnapshot` บน booking (ไม่ลง CRM) — dropdown เหลือแค่ลูกค้าประจำ. (getGuestDisplayName/checkout-stats รองรับ snapshot อยู่แล้ว)
- **แนบรูปบิล/ใบเสร็จในรายจ่าย**: ฟิลด์ `Expense.receiptPath` + อัปโหลดเข้า **Supabase Storage bucket `receipts`** (เก็บ path ไม่ฝังลง blob). ฟอร์มมีปุ่มแนบ+thumbnail+ลบ, รายการมีลิงก์ "ดูใบเสร็จ", ลบรายจ่าย→ลบไฟล์. **DDL `007_receipts_storage.sql` รันบน Dashboard แล้ว** (bucket public + anon read/upload/delete policy)
- ทั้งหมด tsc clean (เหลือ 4 errors เดิม)

### 2026-06-09 (Tier A เริ่ม — expenses cutover, step 1+2 จาก 3)
ต่อจาก audit_logs (Phase 1, append-only practice) → **expenses เป็น entity แรกที่ mutable** (มี update+delete)
- **DDL `008_expenses_realtime.sql`** เขียนแล้ว — ⏳ **ผู้ใช้ต้องรันใน Dashboard ก่อนใช้งานหน้า /expenses** (ไม่งั้น dual-write fail → toast เตือน; blob ยังเป็นแหล่งจริง ไม่หาย): เพิ่ม `receipt_path`+`writer_id`, realtime publication, replica identity full
- **dual-write** (`lib/store.ts` expense actions): `addExpense`=insert, `updateExpense`=update (map เฉพาะฟิลด์ที่เปลี่ยน→snake), `deleteExpense`=**soft-delete** (`deleted_at=NOW()` ไม่ลบแถวจริง — กัน §3c resurrection + เก็บ history). helper `reportExpenseError` (23505 idempotent), `writer_id=CLIENT_ID`
- **per-table realtime** (`AppShell.tsx` `expenses-sync`): ฟัง event `'*'` (ต่างจาก audit ที่ INSERT อย่างเดียว — ต้องรับ UPDATE/DELETE), `deleted_at!=null`→เอาออกจาก state, อื่นๆ→upsert by id; subscribe→buffer→seed (`is('deleted_at', null)`); echo-guard `writer_id===CLIENT_ID`; mapper `rowToExpense`
- **backfill ครั้งเดียว**: ตาราง expenses (จาก 005) ว่าง แต่ของจริงอยู่ใน blob → ถ้า seed ได้ 0 แถว+blob มีของ → upsert ยกขึ้นตาราง (idempotent onConflict id) ก่อนถอด blob
- **✅ DDL 008 รันแล้วบน live DB + verify** (receipt_path/writer_id/deleted_at ครบ, realtime=true, replica identity=f). **backfill verify ผ่าน** (รายจ่ายเดิมขึ้นตารางครบ, รวมอันที่แนบ receipt_path). **add/edit/soft-delete verify ผ่านฝั่งตาราง** (deleted_at ถูกตั้ง แถวไม่หาย)
- **✅ step 3 (blob isolation) เสร็จแล้ว — 4 จุด** (เลียนแบบ auditLogs): (1) partialize ตัด expenses, (2) merge บังคับ `expenses: current.expenses ?? []` (กัน blob เก่าชุบชีวิต soft-deleted), (3) AppShell app_state-sync strip expenses จาก incoming, (4) `mergeState` `delete out.expenses`. **+ แก้ seed เป็น replace** (`setState({expenses: snapshot})` ไม่ merge ทับ mock) เพราะ initial state = mockExpenses 15 รายการ แต่ user ลบไป 9 → ถ้า merge มันจะโผล่กลับ (auditLogs ไม่เจอเพราะ initial = [])
- **บั๊กที่เจอตอนเทสต์ = หลักฐาน §3c สดๆ:** ก่อนทำ step 3 กดเพิ่ม→แก้→ลบเร็วๆ ติดกัน → CAS union-merge ของ blob ชุบชีวิตแถวที่ soft-delete กลับเข้า UI (ตาราง deleted_at ถูกต้อง แต่ UI โชว์). step 3 แก้หาย
- tsc clean (เหลือ 4 errors เดิม). ✅ **commit แล้ว `28ad744`** (expenses cutover); branch ยังนำ origin (ยังไม่ push ตอนนี้)

### 2026-06-10 (Tier A ต่อ — inventory cutover: 2 entity, code-complete)
ต่อจาก expenses → **inventory เป็น cutover ที่ซับซ้อนสุดของ Tier A** เพราะมี **2 entity ที่ต้องย้ายพร้อมกัน** (stock-movement แก้ทั้งคู่ในนาทีเดียว) + มี side-effect จาก checkout/add-on:
- **2 entity:** `inventory_items` = **mutable + soft-delete** (เหมือน expenses) · `inventory_transactions` = **append-only ledger** (เหมือน audit_logs, INSERT อย่างเดียว)
- **DDL `009_inventory_realtime.sql`** เขียนแล้ว — ⏳ **ผู้ใช้ต้องรันใน Dashboard ก่อนใช้หน้า /inventory**: เพิ่ม `writer_id` ทั้งสองตาราง, เปิด realtime + replica identity full ทั้งคู่ (ตารางสร้างใน 001 แล้ว; `deleted_at`/trigger ของ items มาจาก 005)
- **dual-write** (`lib/store.ts`): helper `reportInventoryError`(23505 idempotent) + `inventoryItemRow`/`pushInventoryStock`(update current_stock+last_restocked)/`pushInventoryTx`(insert ledger). wire ทุกจุดที่แตะสต็อก:
  - items CRUD: `addInventoryItem`=insert, `updateInventoryItem`=patch เฉพาะฟิลด์เปลี่ยน, `deleteInventoryItem`=**soft-delete**
  - stock-movement: `restockItem`/`useInventoryItem`/`adjustStock` → push stock + push tx (restructure ให้ compute ก่อน set แล้ว dual-write หลัง)
  - **side-effect จาก add-on:** `fulfillAddOn` (ตัดสต็อก) + `cancelAddOn` (คืนสต็อก) → จับค่า side-effect เป็น `invFx` ใน closure ของ set() แล้ว dual-write หลัง set (bookingAddOns ยังเป็น blob/Tier C — ย้ายเฉพาะ slice inventory). **หมายเหตุ TS:** ต้อง cast `invFx` ก่อน truthiness guard (TS ไม่ widen ตัวที่ assign ใน closure → มองเป็น never)
- **per-table realtime** (`AppShell.tsx`): `inventory_items-sync` (event `'*'`, soft-delete→ลบออก/อื่นๆ upsert, เหมือน expenses) + `inventory_transactions-sync` (INSERT, dedup-by-id sort date desc, เหมือน audit). subscribe→buffer→seed ทั้งคู่; echo-guard `writer_id===CLIENT_ID`; mapper `rowToInventoryItem`/`rowToInventoryTx`
- **backfill ครั้งเดียว** (ตาราง 001 ว่าง, ของจริงอยู่ blob): seed items ก่อน (FK) → seed tx; **tx backfill กรองเฉพาะ tx ที่อ้าง item ที่ยังอยู่** (กัน FK violation จาก orphan tx ของ item ที่ถูกลบไปแล้วใน blob). tx seed รับ default cap 1000 แถวล่าสุดของ Supabase (พอสำหรับรีสอร์ตเล็ก)
- **blob isolation 4 จุด** (เหมือน auditLogs/expenses): partialize ตัด 2 slice, merge บังคับ `current ?? []` ทั้งสอง, AppShell app_state-sync strip 2 slice, `mergeState` (supabase-storage) `delete out.inventoryItems`+`inventoryTransactions`. seed = authoritative replace (`setState` ไม่ merge ทับ mock)
- tsc clean (เหลือ 4 errors เดิม). ✅ **DDL 009 รันแล้ว + verify 2 แท็บผ่าน + commit `dba898f`** (branch ยังไม่ push)
- ⚠️ **ข้อสังเกตหลังทำ inventory (เจอตอนทำ maintenance):** backfill ใช้ guard `rows.length===0` ซึ่ง**ไม่ทำงานถ้าตารางมี orphan seed เก่าค้าง** (inventory_items มี 15 orphan จาก 001 → backfill ไม่ยิง, มีแค่ 3/15 แถวที่มี writer_id). บังเอิญ inventory ผ่านเพราะ orphan ใกล้เคียง mock; blob copy ของ inventory ถูก partialize ทิ้งไปแล้ว reconcile ย้อนหลังไม่ได้ → **แนะนำให้ผู้ใช้ไล่ดูตัวเลขสต็อก inventory ด้วยตาอีกที** (maintenance แก้ guard นี้แล้ว — ดูด้านล่าง)

### 2026-06-10 (Tier A ต่อ — maintenance_logs cutover, code-complete)
ต่อจาก inventory → **maintenance_logs** (mutable + soft-delete, 1 entity, แพทเทิร์น expenses) — มี 2 จุดต่างที่ cutover ก่อนไม่เจอ:
- **DROP FK `maintenance_logs_room_id_fkey`:** `room_id` อ้าง `rooms(id)` แต่ rooms ยังไม่ย้าย (blob/Tier B) และตาราง rooms ใน DB เป็น orphan ที่ stale (ผู้ใช้แก้/เพิ่ม/เปลี่ยนชื่อห้องใน blob เท่านั้น เช่น `rA5`=เฮียดิเรก) → log ของห้องที่ตาราง rooms ไม่มีจะ FK-violate ตอน insert. **DDL 010 ปลด FK** (ใส่กลับเมื่อย้าย rooms ใน Tier B)
- **stale orphan + one-time reconcile:** ตาราง maintenance_logs มี orphan seed 4 แถว (m001–m004 จาก 001) ที่ content เพี้ยน (verify: resolvedAt ของ m003/m004 ต่างจาก blob เพราะ `shiftMockDates`). guard `rows.length===0` แบบเดิม**ใช้ไม่ได้** (ตารางไม่ว่าง). **แก้เป็น reconcile-from-blob:** เช็ก "ยังไม่เคย cutover" = ไม่มีแถวมี `writer_id` → อ่าน slice จริงจาก `app_state.data.state.maintenanceLogs` (blob ยังพกอยู่ verify แล้ว) → upsert ทับ orphan ที่เพี้ยน + soft-delete orphan ที่ blob ไม่มี → re-select → setState replace
- **DDL `010_maintenance_realtime.sql`** เขียนแล้ว — ⏳ **ผู้ใช้ต้องรันใน Dashboard ก่อนใช้หน้า /maintenance**: writer_id + DROP FK + realtime + replica identity full (deleted_at/trigger มาจาก 005)
- **dual-write** (`lib/store.ts`): helper `reportMaintenanceError`+`maintLogRow`; `addMaintenanceLog`=insert (compute newLog ก่อน set), `updateMaintenanceStatus`=patch {status, resolved_at เมื่อ resolved}, `removeMaintenanceLog`=**soft-delete**. **room-status side-effect (ห้อง→maintenance/→available) อยู่ใน set/blob เหมือนเดิม ไม่ dual-write** (rooms ยัง Tier B) = 2 writes/action ไม่ atomic (strangler tradeoff)
- **per-table realtime** (`AppShell.tsx`): `maintenance_logs-sync` (event '*', soft-delete→ลบ/อื่นๆ upsert by id, sort reportedAt desc); subscribe→buffer→seed; echo-guard `writer_id===CLIENT_ID`; mapper `rowToMaintenanceLog`
- **blob isolation 4 จุด** (partialize ตัด maintenanceLogs, merge บังคับ `current ?? []`, app_state-sync strip, mergeState `delete out.maintenanceLogs`)
- 🐞 **บั๊กที่เจอตอน 2-tab verify (แก้แล้ว):** reconcile อ่าน `app_state` **หลัง** rehydrate → แต่ rehydrate trigger persist write ครั้งแรก (`onRehydrateStorage` setState `_hasHydrated`) ที่ partialize **ตัด maintenanceLogs ออกจาก blob ไปแล้ว** → reconcile ได้ slice ว่าง → เข้าใจผิดว่า orphan ทั้ง 4 (m001–m004) "ไม่มีใน blob" → **soft-delete ทิ้งแทนที่จะกู้**. โชคดี m001–m004 เป็น mock demo (ไม่ใช่ ticket จริง) — ผู้ใช้เลือก "ลบทิ้งไป". **fix:** ยิงอ่าน `app_state` เป็น `bootBlobPromise` **ก่อน** เรียก `rehydrate()` (request ออกก่อน strip-write ถูกสร้าง = ได้ snapshot pre-strip) แล้ว `await` ใน reconcile. **สำคัญสำหรับ Tier B** (guests/rooms มีข้อมูลจริง — แพทเทิร์น reconcile ต้องอ่าน blob ก่อน rehydrate เสมอ)
- tsc clean (เหลือ 4 errors เดิม). ✅ **DDL 010 รันแล้ว + 2-tab verify ผ่าน + commit `0e905c0`** (รวม race fix — m001–m004 เป็น mock โดน soft-delete ตอนเจอบั๊ก ผู้ใช้เลือกลบทิ้ง)

### 2026-06-10 (เริ่ม Tier B — add_on_items cutover, code-complete)
ตัวแรกของ **Tier B** (guests/rooms/staff/users/corporate/add_on_items) — เลือก **add_on_items ก่อนเพราะปลอดภัยสุด:**
- **read-only catalog:** ไม่มี action เพิ่ม/แก้/ลบในแอป (seed จาก mock, อ่านอย่างเดียวที่ bookings/[id], daily-report, rooms) → **ไม่ต้อง dual-write** เลย; cutover = realtime + reconcile + blob isolation
- **FK ปลอดภัย:** `add_on_items.inventory_item_id → inventory_items` ชี้ไป parent ที่**ย้ายแล้ว/มีข้อมูลครบ** (Tier A) → คง FK ไว้ ไม่ต้อง drop (ต่างจาก maintenance→rooms)
- **DDL `011_add_on_items_realtime.sql`** — ✅ **รันแล้วผ่าน MCP execute_sql** (writer_id + realtime + replica identity full; deleted_at/trigger มาจาก 005)
- store: partialize ตัด addOnItems + merge บังคับ `current ?? []` (ไม่มี action ให้แก้). supabase-storage: mergeState `delete out.addOnItems`
- AppShell: `add_on_items-sync` (event '*', กัน edit จาก Dashboard/แท็บอื่น) + mapper rowToAddOnItem/addOnItemToRow + reconcile-from-blob
- 🐞🐞 **บั๊กรอบ 2 (race) — เจอ+กู้+แก้ถาวร:** fix maintenance รอบแรกแค่ "ยิง read ก่อน rehydrate **แต่ไม่ await**" = ยัง race. รอบ add_on_items ปรากฏ read resolve **หลัง** strip-write → ได้ blob ว่าง → reconcile soft-delete **catalog ทั้ง 7 รายการ** (booking ไม่มี add-on ให้เลือก). **กู้แล้ว** (un-delete 7 แถวผ่าน MCP — read-only catalog, orphan==mock==ถูกต้องเป๊ะ, ปลอดภัย; ทั้ง 7 มี writer_id → reconcile skip รอบหน้า). **แก้ถาวร:** เปลี่ยนเป็น **`await` อ่าน app_state ให้เสร็จก่อนเรียก `rehydrate()`** (strip-write ยังไม่ถูกสร้าง → pre-strip การันตี 100% ไม่ใช่ race) — เก็บเป็น `bootState` ใช้ทั้ง maintenance + add_on reconcile. **สำคัญมากสำหรับ guests/staff/users/corporate/rooms ที่มีข้อมูลจริง**
- tsc clean (เหลือ 4 errors เดิม). **⚠️ ยังไม่ commit** (working tree: 011 sql, store.ts, AppShell.tsx, supabase-storage.ts, PROGRESS.md)
- ⏳ **NEXT:** ผู้ใช้ **reload แอป** → ตรวจ (เปิด booking เห็น add-on ครบ 7 + ราคาถูก, สร้าง add-on บน booking ยังได้, 2 แท็บ reload ไม่หาย) → commit → ไล่ Tier B ที่เหลือ: **guests** (mutable + side-effect totalStays/totalSpend ตอน checkout → dual-write แบบ maintenance) → **staff** → **users** (auth) → **corporate** (accounts+transactions, drop corp_tx FK→bookings/invoices) → **rooms ท้ายสุด** (พัวพัน updateRoomStatus ทุก flow; ย้ายเสร็จใส่ FK maintenance_logs.room_id กลับ)
- ✅ **inventory verify ผ่าน MCP:** 12/15 รายการที่ไม่ได้แตะ = ตรง mock เป๊ะ (orphan=ของจริง), อีก 3 = แก้จริงตอน verify (สบู่ -1, ลบน้ำดื่ม+ถั่วอบ). ไม่มีข้อมูลหาย

### 2026-06-10/11 (UX/ops fixes + agent ใหม่ — ปิดงานวัน)
รอบนี้สลับมาเก็บ "ของใช้จริง" ที่เจอตอนคลิกใช้ + สร้าง agent ช่วยหา
- **🆕 ข้อเท็จจริงสำคัญ: MCP `execute_sql` รัน DDL ได้** (ใช้สิทธิ์ management ไม่ใช่ anon key) — ใช้รัน migration 011 แล้ว. กฎเก่า "DDL ต้องทำใน Dashboard / MCP บล็อก" จริง ๆ ใช้กับ tool `apply_migration` เท่านั้น → ต่อไปรัน migration ผ่าน MCP ได้เลย
- **`327853e` วันที่ default ฟอร์มรายจ่าย:** `openAdd` เดิมตั้งวันที่ 15 ของงวดเสมอ → แก้เป็น "งวดปัจจุบัน→วันนี้, งวดย้อนหลัง→กลางงวด"
- **`163e4f9` ลบ inventory item = write-off:** ลบของที่ยังมีสต็อก → สร้าง movement `waste` (ยอด→0) ก่อน soft-delete + ตั้ง `current_stock=0` ในตาราง → ledger ครบ ไม่หายเงียบ. `deleteInventoryItem` รับ `staffId`; dialog เตือนเมื่อมีสต็อกค้าง
- **`be8b2eb` agent ใหม่ `hotel-pms-ops-reviewer`** (`.claude/agents/`): มองแอปแบบผู้ใช้งานจริง ไล่ workflow จับ operational/UX gaps (default ไม่ฉลาด/ลบแก้ไม่มีร่องรอย/friction/confirm ขาด-เกิน/edge case). read-only เสนอรายการ. **แยกบทบาทชัดจาก qa-auditor** ("ใช้จริงเวิร์กไหม" vs "เลขถูกไหม"). หมายเหตุ: agent ที่สร้างใหม่ spawn native ได้ session หน้า (รอบนี้รันผ่าน general-purpose + persona)
- **`288aa44` แก้รอบแรกจาก ops-reviewer (front-desk lifecycle):**
  - **P1 corporate auto-charge:** เช็คเอาต์ตัดเครดิตองค์กรเงียบ → เพิ่ม audit (`corporate_charge`) + CheckoutConfirmDialog แจ้ง "จะตัดเครดิตองค์กร X (บริษัท)" (ทั้ง front-desk + bookings/[id])
  - **P1 refund audit:** early-checkout / cancel-booking / cancel-add-on คืนเงินแล้วไม่มี audit ยอด → log ใน store ผ่าน `get().logAudit` หลัง set() (รับประกันทุกหน้า)
  - **P2:** walk-in เพิ่มช่องเลขบัตร/พาสปอร์ต→guestSnapshot; quick-pay เตือน "ชำระบางส่วน—ค้างอีก X"; ช่องมัดจำ default=ค่าห้อง 1 คืน
- ⏳ **ops-reviewer P3 ที่ยังไม่ทำ (รอตัดสินใจ product):** (#6) action การเงิน/คืนเงินผูกแค่ `canManageBookings` ไม่มี finance gate; (#7) ย้ายห้องข้ามประเภทไม่ปรับราคา (บางส่วนเป็นงาน qa-auditor); (#8) เช็คอินก่อนวันได้โดยไม่มี guard/confirm
- **branch `fix/revenue-consolidation-double-submit` นำ origin 13 commits (ยังไม่ push)**, tsc clean (เหลือ 4 errors เดิม)
- ⏳ **NEXT (พรุ่งนี้):** ใช้ ops-reviewer ต่อกับ workflow อื่น + เคาะ P3 ข้างบน · งาน migration ตัวถัดไป = **guests** (Tier B; mutable + side-effect checkout totalStays/totalSpend → dual-write แบบ maintenance, ใช้ reconcile แบบ await-ก่อน-rehydrate)

## 6. ⏳ งานค้าง / Backlog
1. ~~`lib/auth-store.ts` ยังใช้ localStorage~~ → ✅ บัญชีย้ายขึ้น cloud แล้ว (session คงไว้ที่ localStorage โดยตั้งใจ)
2. **bookings/rooms ยังเป็น blob** (ไม่ได้แยก relational ตามตั้งใจเดิม) — ถ้าจะทำ "ถูก 100%"
   (รวมแก้ปัญหา delete ถูกชุบชีวิตในข้อ 3c) ต้องย้าย cluster ที่พัวพันทั้งกลุ่ม
   (bookings, rooms, invoices, housekeeping, guests, corporate, payments, addons) เป็น
   proper tables + Postgres RPC ให้ checkout/cancel เป็น transaction เดียว = งานใหญ่
3. ความปลอดภัย: RLS เป็น anon full access (ใครมี URL+key เข้าได้เต็ม) — เหมาะงานภายในเท่านั้น
4. รหัสผ่านเก็บเป็น plaintext ใน blob (demo) — production ควร hash (bcrypt) + ไม่ส่งกลับ client
5. **VAT 7% ในใบแจ้งหนี้** — ยังไม่ทำ (`tax: 0` ตายตัว) ผู้ใช้ขอเลื่อนไว้ก่อน
6. ~~**accessibility** focus-trap + `<label htmlFor>`~~ → ✅ (2026-06-06) เพิ่ม hook กลาง
   `lib/useFocusTrap.ts` (ขัง Tab/Shift+Tab + Esc ปิด + คืนโฟกัสเดิม + เคารพ autoFocus เดิม)
   ใช้กับ **dialog ทุกตัว** (26 modal ใน 15 ไฟล์): component (Confirm/Checkout/EarlyCheckout/
   ChangePassword/GlobalSearch) + ทุก modal ใน app pages (bookings, bookings/[id]×5, expenses×2,
   finance×3, front-desk, guests, housekeeping, inventory×4, maintenance, staff×2) —
   ทุกตัวมี `role="dialog" aria-modal tabIndex={-1}` + คลิก backdrop ปิดได้
   ผูก `<label htmlFor>` กับ input ใน dialog form ครบแล้ว (tsc เหลือ 4 error เดิม ไม่กระทบ)
   ⏳ เหลือ label ของ inline panel (walk-in ที่ front-desk, add-user ใน staff/AccountsManager,
   filter/search ทั่วไป) — ไม่ใช่ dialog, scope รอง

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
