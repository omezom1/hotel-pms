# PROGRESS / HANDOFF — Hotel PMS (Pruksatara Park & Resort)

> ไฟล์นี้คือ "บันทึกส่งต่องาน" สำหรับเปิดแชท/เซสชันใหม่ที่ยังไม่รู้บริบทอะไรเลย
> อ่านไฟล์นี้ก่อนเริ่มงาน จะเข้าใจว่าระบบทำงานยังไง ทำอะไรไปแล้ว และเหลืออะไร
> อัปเดตล่าสุด: 2026-07-02

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
- `012_rls_lockdown.sql` — **P2 security (interim, no Supabase Auth)**: ปิด anon access. **orphan tables 12 ตัว** (users/guests/bookings/invoices/payments/staff/corporate_*/rooms/housekeeping_tasks/booking_add_ons/ota_channels — แอปไม่แตะ, `.from()` อยู่ใน `lib/supabase-api.ts` ที่ dead code) → DROP policy (RLS เปิด+ไม่มี policy = ปิดสนิท, ข้อมูลยังอยู่ reversible). **active tables** จำกัด command `TO anon`: audit_logs/inventory_transactions = select+insert (append-only กันแก้/ลบกลบรอย), expenses/inventory_items/maintenance_logs/add_on_items = select+insert+update (soft-delete). **app_state คง anon ALL** (irreducible). — ✅ รันแล้ว (2026-06-18, **ผ่าน MCP execute_sql**)
> **อัปเดต 2026-06-10:** MCP `execute_sql` **รัน DDL ได้** (ใช้สิทธิ์ management ไม่ใช่ anon key) — ไม่ต้องไปวางใน Dashboard เองอีก. (กฎเก่าว่า "MCP ถูกบล็อก" ใช้กับ `apply_migration` tool เท่านั้น; `execute_sql` รัน ALTER/DO/etc. ได้)

## 4b. Deployment (Vercel) — ⚠️ ตั้งค่าครั้งเดียว อย่าลืม
- โปรเจกต์ Vercel: **hotel-pms** (org "Wasin's projects") → domain `hotel-pms-henna.vercel.app`
- **Production track branch `main`** → push main = auto-deploy production
- **ต้องตั้ง Environment Variables ใน Vercel** (Settings → Environments → Production):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - ค่าอยู่ในไฟล์ `.env.local` (gitignore — ไม่ขึ้น GitHub) ต้องใส่มือใน Vercel
- **บั๊กที่เคยเจอ (2026-06-01) — ✅ แก้ถาวรในโค้ดแล้ว (2026-06-15):** เดิมถ้า env var หาย build
  **error ตอน prerender** `Error: supabaseUrl is required` เพราะ `lib/supabase.ts` สร้าง client ตอน
  build time. **แก้:** ใส่ placeholder fallback (`'https://placeholder.supabase.co'` / `'placeholder-anon-key'`)
  ใน `createClient` → build/prerender ไม่ throw แม้ env ว่าง (Preview build เขียวโดยไม่ต้องตั้ง Preview env);
  Production (main) ยัง bake ค่าจริงตอน build ตามเดิม → runtime ไม่กระทบ
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

### 2026-06-12 (ops-review 2 batch + เคาะ P3 + browser-verify ครบ)
ปิด P3 ที่ค้าง (move-room reprice, finance gate) + รัน ops-reviewer รอบ housekeeping/maintenance/inventory แล้วเก็บที่เลือก
- **batch #1 (4 commits):**
  - `2dba6d3` maintenance honest-msg: แจ้งซ่อมห้อง occupied เดิม toast บอก "ปิดห้องอัตโนมัติ" แต่ store ไม่ปิดห้อง occupied (โกหก) → แก้ข้อความตามจริง + **checkout ห้องที่มี maintenance log ค้าง (status≠resolved) → ห้อง→maintenance แทน cleaning + ข้าม HK task** (ห้องเสียห้ามขายต่อ)
  - `135cda2` inventory adjust: โชว์บรรทัดส่วนต่างสด + confirm เมื่อปรับ**ลด** (กันพิมพ์ 40→4)
  - `96c2220` move-room reprice: `moveBooking(…, reprice?)` + `MoveRoomDialog` (ย้ายข้ามประเภทราคาต่าง → เลือก "ปรับเป็นราคาใหม่"=reprice+คืนเงินส่วนเกิน / "คงราคาเดิม"=อัพเกรดฟรี); ราคาเท่ากันไม่เด้ง
  - `c311f10` finance gate (เฉพาะคืนเงิน): block cancel-booking(จ่ายแล้ว)/early-checkout-adjust/cancel-addon/move-reprice เมื่อไม่มี `canManageFinance`; รับเงิน (recordPayment) คงที่ `canManageBookings`. `EarlyCheckoutDialog`+`MoveRoomDialog` รับ prop `canRefund` disable ปุ่ม
- **batch #2 (3 commits):**
  - `e3e5957` maintenance: เพิ่มปุ่ม "ยกเลิก" บน ticket `in_progress` (reuse handleCancel = soft-delete + audit cancel) — เดิมยกเลิกได้แค่ตอน open
  - `d515c93` inventory delete write-off เลือกเหตุผล: `deleteInventoryItem(id,staff,reason)` → ของเสีย→tx `waste`, โอนออก/เลิกใช้→tx `adjust` (ไม่เฟ้อรายงานของเสีย; ใช้ enum เดิม ไม่แตะ DDL)
  - `0b09b90` inventory adjust บังคับหมายเหตุ (ปุ่ม disable จนใส่) + dialog อ่าน **stock สดจาก store** (ไม่ใช่ snapshot) กันโชว์เลขเก่าเมื่ออีกแท็บแก้
- **ตัดออก 2 ข้อ (housekeeping):** HK auto-task invisibility + scheduledAt input — ผู้ใช้ drop เพราะแม่บ้านไม่ใช้แอป (รื้อเมื่อ usage เปลี่ยน)
- **Browser-verify ผ่าน 7/7** (CDP→Windows Chrome, ดู memory reference-browser-verify-handle): finance gate (reception=disabled/admin=enabled), move-reprice dialog (B4 1,500→B1 2,100 ส่วนต่าง +600), inventory adjust/delete reason, maintenance occupied-msg + cancel in_progress. checkout→maintenance ตรวจ code-reasoning (real checkout กู้ยาก)
- **⚠️ verify hazard เจอ+กู้:** กดปุ่มเช็คเอาต์แรกใน front-desk → booking checkout-วันนี้+จ่ายเต็ม (rA7, walk-in) checkout จริงไม่มี dialog → revert ครบผ่าน MCP (booking→checked_in, room→occupied, ลบ ghost invoice/HK + audit row check_out; walk-in/guestSnapshot ไม่แตะ guest). **verify ครั้งหน้า: เล็ง booking checkout-อนาคต ผ่าน /bookings/[id]**
- tsc clean (4 errors เดิม). branch **นำ origin 28 commits, ยังไม่ push** (gh ยังไม่ auth)
- ⏳ **NEXT:** push/PR · migration **Tier B/guests** (mutable + side-effect checkout totalStays/totalSpend → dual-write แบบ maintenance, reconcile await-ก่อน-rehydrate)

### 2026-06-15/16 (PR #8 merged + env-fix + tsc cleanup + security bcrypt + 3 agent ใหม่)
- **PR #8 merged → main** (squash `42f7960`, branch `fix/revenue-consolidation-double-submit` ลบแล้ว) — รวมงานสะสม 30 commits (revenue/QA/a11y + Tier A/B + ops-review). **gh authed แล้ว** (omezom1). production deploy เขียว
- **แก้ CI ที่ block PR:** `lib/supabase.ts` ใส่ placeholder fallback ให้ `createClient` ไม่ throw ตอน build เมื่อ env ว่าง (Preview build เดิมพังที่ prerender `/_not-found`) — Production ยัง bake ค่าจริง. **ปลด env-var build bug ถาวร** (ดู §4b)
- **เคลียร์ 4 pre-existing tsc errors:** bookings type `DateRange` ด้วย `DateRangeProps` (เลิก @ts-ignore) + `supabase/seed.ts` ลบ dead `mockOTAChannels` block → `tsc --noEmit` = **0 source errors**
- **+3 review agents** ใน `.claude/agents/`: `hotel-pms-security-auditor` (orange), `hotel-pms-design-reviewer` (pink), `hotel-pms-product-strategist` (cyan) — read-only, รันครบทั้ง 3 ได้ findings (product: เครื่องคิดราคา seasonal มีแล้วแค่ไม่มี UI → แนะ Seasonal Rate Manager; design: dark-mode "สีเน้น" หลุด → 3 ของกลาง useChartTheme/iconChip/StatusBadge; security: ดูด้านล่าง)
- **🔐 Security work (branch `security/bcrypt-passwords-audit`, commit `58bfe4d`, ยังไม่ push/PR):** ทิศที่เลือก = **คงเป็น public portfolio demo ข้อมูลปลอม** (ไม่ทำ Supabase Auth lockdown ใหญ่)
  - **bcrypt hashing** (`lib/auth-utils.ts`: hashPassword/verifyPassword/isHashed) — login เทียบ bcrypt, addUser/updateUser hash ตอนเขียน, seed เก็บ hash, verifyPassword มี plaintext fallback. **migrate ของจริงบน production แล้ว** ผ่าน MCP execute_sql: `app_state` blob (state.users, v→78) + ตาราง relational `users` → 6 hashed/0 plaintext (login demo เดิมยังเข้าได้)
  - **audit log** 6 account actions (addUser/updateUser/deleteUser/addStaff/updateStaff/deleteStaff) category `'auth'`
  - verify: tsc 0, build 22/22, 6 demo logins ผ่าน. guests เป็น mock ไม่มี PII จริง
- ⏳ **NEXT:** push/PR security branch · migration **Tier B/guests** · (เลือกได้) Seasonal Rate Manager / dark-mode polish

### 2026-06-18 (Security P1/P2 interim hardening — branch `security/p1-p2-hardening`)
**เปลี่ยนทิศจาก "ยอมรับ exposure" (2026-06-15/16) มา = ล็อกจริง** (ผู้ใช้เลือก "Security P1/P2"). ฐานจาก branch bcrypt เดิม (commit `58bfe4d` = P1 hash + audit account actions, ยังไม่ merge → main ยังเป็น plaintext-compare)
- **🚨 พบระเบิดเวลา:** main (deploy บน production) เทียบ plaintext แต่ blob/users ถูก hash ไปแล้ว (2026-06-15) → **login บน production พังอยู่** จนกว่าจะ merge โค้ด bcrypt เข้า main. (verify ด้วย node: bcrypt.compareSync admin123/reception/account กับ hash จริงใน seed → MATCH, รหัสผิด → no-match)
- **P2-RLS (commit `74bf69b`, `012_rls_lockdown.sql` รันบน live DB):** ปิด anon orphan 12 ตาราง + จำกัด active tables — ดู §4 migration 012. **verify (จำลอง role anon ผ่าน MCP):** users/guests/bookings/payments = 0 แถว, app_state/audit_logs/expenses ยังเข้าได้. `get_advisors(security)`: ช่องโหว่ anon-rw บน PII/orphan **หายหมด** (เหลือ INFO `rls_enabled_no_policy` = ปิดที่ตั้งใจ; WARN `rls_policy_always_true` เหลือบน active tables + app_state = residual ที่ยอมรับ)
- **P2-authz (commit `6264357`, `lib/store.ts`):** เพิ่ม `hasPerm()` + guard 6 account/staff action ด้วย `canManageStaff` (กัน bypass ผ่าน devtools). `updateUser` อนุญาต self-edit (ChangePasswordButton ทุกคนใช้ได้) แต่ห้ามแตะบัญชีคนอื่น/ย้าย staffId. = defense-in-depth ไม่ใช่ boundary จริง
- **residual risk (บันทึกชัด):** `app_state` blob ยังเปิด anon (แอปต้องอ่านตอน boot/login) → คนมี public key ยังดึงข้อมูลทั้งก้อนผ่าน blob ได้. ปิด 100% = ต้อง **Supabase Auth จริง** (งานก้อนถัดไป). + P3 ค้าง: receipts bucket list ได้, session ไม่มี expiry/revoke
- tsc clean (0 errors). ⏳ **NEXT:** push branch + PR เข้า main (gh authed) → **redeploy Vercel = ปลด login พัง** → verify login prod

### 2026-06-24 (Tier B ต่อ — guests cutover, verified)
ต่อจาก add_on_items → **guests เป็น Tier B ตัวที่ 2** (mutable + side-effect totalStays/totalSpend ตอนเช็คเอาต์) — branch `feat/tierB-guests-migration` (แตกจาก main ที่ sync แล้ว; `feat/seasonal-rate-manager` merged ไปแล้ว #12)
- **เคสเหมือน maintenance_logs เป๊ะ** (mutable + soft-delete + orphan seed เก่าในตาราง ต้อง reconcile จาก blob) **ต่างตรง side-effect ตอน checkout** + **ไม่มี FK ต้อง drop** (guests ไม่มี FK ขาออก; FK `bookings.guest_id→guests` เป็นฝั่ง parent การ upsert ไม่ละเมิด) + **ไม่มี `deleteGuest` action** (มีแค่ add/update)
- **DDL `013_guests_realtime.sql`** — ✅ **รันผ่าน MCP execute_sql**: `writer_id` + realtime publication + replica identity full + **เปิด RLS anon กลับ** (012 ปิด orphan guests ไว้) เป็น `select+insert+update` (soft-delete=update, ไม่มี hard delete) ตามแพทเทิร์น active-table ใน 012. verify: has_writer_id=1, relreplident='f', in_realtime=true, 3 policy (no delete)
- **dual-write** (`lib/store.ts`): helper `reportGuestError`(23505 idempotent)+`guestRow`; `addGuest`=insert, `updateGuest`=patch เฉพาะฟิลด์ที่เปลี่ยน (camel→snake), **checkout side-effect**=จับ closure-var `guestFx` ใน `set()` ของ `updateBookingStatus` (แพทเทิร์น `invFx`/`corpAudit`) แล้ว `.update({total_stays,total_spend,writer_id})` หลัง set(). `extend`/`earlyCheckout`/`cancel` ไม่แตะ guests
- **per-table realtime** (`AppShell.tsx`): `guests-sync` (event '*', soft-delete→ลบ/อื่นๆ upsert by id) + mapper `rowToGuest`/`guestToRow` + reconcile-from-blob (everWritten guard, bootState await-ก่อน-rehydrate) + เพิ่ม guests ใน app_state-sync strip
- **blob isolation 4 จุด**: partialize ตัด `guests`, merge บังคับ `current.guests ?? []`, app_state-sync strip, `mergeState` `delete out.guests`
- **✅ verify ผ่าน browser จริง (CDP→Windows Chrome, ดู [[reference-browser-verify-handle]]):** login admin → AppShell reconcile รัน → /guests render ครบ 6 ราย. **MCP ยืนยัน reconcile ถูกต้อง:** orphan seed เก่า stale (g001 68400/g003 185000/g004 420000) ถูกเขียนทับด้วยค่าจริงจาก blob (g001 5000/g003 5500/g004 2000) ครบ 6 ราย, ทุกแถว writer_id stamped, ไม่มี soft-delete. reconcile upsert (insert+update) สำเร็จ = ยืนยัน RLS write ใหม่ทำงาน (dual-write paths ใช้ .insert/.update เดียวกัน)
- tsc 0 error · build 22/22 routes ผ่าน. **⏳ ยังไม่ commit/push ตอนเขียนนี้** (working tree: 013 sql + store.ts + AppShell.tsx + supabase-storage.ts + PROGRESS.md)
- ✅ **commit `7012558` + push + PR #13** (base main, ยังไม่ merge — รอผู้ใช้กด = deploy prod)

### 2026-06-24 (Tier B ต่อ — staff cutover, verified)
ต่อจาก guests → **staff เป็น Tier B ตัวที่ 3** (mutable CRUD: add/update/**delete**) — branch `feat/tierB-staff-migration` (ซ้อนบน guests branch; base PR = guests branch, รอ #13 merge แล้ว rebase ลง main)
- **ง่ายกว่า guests** (ไม่มี side-effect ตอน checkout) แต่ **มี `deleteStaff`** → ทำเป็น **soft-delete** ในตาราง (blob ยัง hard-filter; ตารางเก็บ deleted_at กัน §3c resurrection + history)
- **ไม่มี FK ต้อง drop:** staff ไม่มี FK ขาออก; FK `users.staff_id→staff` เป็นฝั่ง parent (upsert/soft-delete ไม่ละเมิด; staff ย้ายก่อน users → ตอน users ย้าย parent มีครบ)
- **DDL `014_staff_realtime.sql`** — ✅ **รันผ่าน MCP**: writer_id + realtime + replica identity full + RLS anon select/insert/update (no delete). verify: has_writer_id=1, relreplident='f', in_realtime=true, 3 policy
- **dual-write** (`lib/store.ts`): helper `reportStaffError`+`staffRow`; addStaff=insert, updateStaff=patch เฉพาะฟิลด์เปลี่ยน (camel→snake; permissions jsonb, hireDate→hire_date, isActive→is_active), deleteStaff=soft-delete. permission guard `canManageStaff` + audit เดิมคงไว้
- **per-table realtime** (`AppShell.tsx`): `staff-sync` + mapper `rowToStaff`/`staffToRow` + reconcile-from-blob (everWritten guard, bootState) + เพิ่ม staff ใน app_state-sync strip
- **blob isolation 4 จุด**: partialize ตัด staff, merge `current.staff ?? []`, app_state-sync strip, `mergeState delete out.staff`
- **✅ verify ผ่าน browser (CDP→Chrome):** login admin → reconcile รัน → /staff render ครบ 6 ราย; MCP ยืนยันทุกแถว writer_id stamped, ไม่มี soft-delete, ค่าตรง (blob==table อยู่แล้ว ไม่มี divergence). tsc 0 / build 22/22
- ✅ **MERGED เข้า main + deploy prod แล้ว** (guests PR #13→`16f127f`, staff PR #15→`6e548a6`; #14 auto-close ตอน guests branch ถูกลบ → เปิด #15 ใหม่ base main, staff branch rebase `--onto main` ตัด guests commit ซ้ำออก). **✅ prod-verify PASS** (CDP→prod `hotel-pms-henna.vercel.app`): login admin→/dashboard, /guests 6/6, /staff 6/6 render จากตาราง relational บน prod — login ไม่พัง
- ⏳ **NEXT:** Tier B ที่เหลือ: **users** (auth — mutable + login เทียบ blob→ต้องระวัง: ย้าย users ต้อง deploy โค้ดที่อ่านตาราง "ก่อน/พร้อม" ย้ายข้อมูล ไม่งั้น login พังแบบ 2026-06-15) → **corporate** (accounts+tx, drop corp_tx FK→bookings/invoices) → **rooms ท้ายสุด** (พัวพัน updateRoomStatus; ย้ายเสร็จใส่ FK `maintenance_logs.room_id` กลับ)

### 2026-06-26 (Tier B ต่อ — users cutover, code-complete + DDL applied)
ต่อจาก staff → **users เป็น Tier B ตัวที่ 4** (mutable CRUD add/update/delete=soft-delete) — branch `feat/tierB-users-migration` (แตกจาก main). **สำคัญ: login อ่าน `useHotelStore.getState().users` (store slice) ไม่ได้อ่านตารางตรง ๆ** → **ไม่แตะ `auth-store.ts`**; แค่เปลี่ยน "ที่มา" ของ store slice (blob→table ผ่าน reconcile) เหมือน guests/staff. login (verifyPassword bcrypt+plaintext fallback) อ่าน store เหมือนเดิม
- **🔑 ความต่างจาก staff = password divergence:** ตาราง relational มี **bcrypt hash ถูกต้องครบ 6 ราย** แต่ blob `state.users` (v21) ถูก **reset เป็น plaintext** (admin123/reception/...) หลัง bcrypt migration 2026-06-15 (version 78→21). reconcile แบบ blob-ชนะปกติ จะเขียน plaintext ทับ hash = ถอย security. **ผู้ใช้เลือก = รักษา hash ในตาราง:** reconcile ใช้ hash เดิมในตารางถ้า id นั้นมีอยู่ (ไม่ re-hash 6 ตัวเดิม = 0 bcrypt cost), user ที่มีเฉพาะ blob (plaintext) → `hashPassword()` ก่อนเขียน (ไม่เขียน plaintext ลงตารางเลย). blob ยังเป็นเจ้าของ membership + lastLogin
- **ตาราง users ไม่มี `role` column** (role มาจาก staff ผ่าน staff_id; `User` type ก็ไม่มี role) → mapper ไม่ต้องจับ role
- **DDL `015_users_realtime.sql`** — ✅ **รันผ่าน MCP execute_sql**: writer_id + realtime + replica identity full + เปิด RLS anon กลับ (012 ปิด orphan users) เป็น select/insert/update (no delete). verify: has_writer_id=1, relreplident='f', in_realtime=1, 3 policy
- **dual-write** (`lib/store.ts`): helper `reportUserError`+`userRow`; addUser=insert, updateUser=patch เฉพาะฟิลด์เปลี่ยน (username/password[hash]/staffId→staff_id), deleteUser=**soft-delete** (เดิม hard-filter), **recordLogin=dual-write last_login**. permission guard เดิม (canManageStaff/self-edit) + audit คงไว้
- **per-table realtime** (`AppShell.tsx`): `users-sync` + mapper `rowToUser`/`userToRow` + reconcile-from-blob (everWritten guard, bootState await-ก่อน-rehydrate, hash-preserve logic) + เพิ่ม users ใน app_state-sync strip + removeChannel cleanup
- **blob isolation 4 จุด**: partialize ตัด users, merge `current.users ?? []`, app_state-sync strip, `mergeState delete out.users`. (window สั้น ๆ ก่อน reconcile เสร็จ store.users = mockUsers seed = demo accounts plaintext → login ยังเข้าได้ผ่าน fallback)
- tsc **0 error** · build 22/22 routes ผ่าน. ✅ **commit `9fb2521` + push + PR #16** (base main, ยังไม่ merge — รอผู้ใช้กด = deploy prod)
- ⚠️ **deploy ordering:** DDL รันบน live DB แล้ว (additive — main เดิมยัง read blob ไม่กระทบ login prod). โค้ด cutover ยังไม่ deploy จน merge PR (apply DDL ก่อน deploy code = กัน login พังแบบ 2026-06-15: code strip users จาก blob แต่อ่านตาราง RLS-locked ไม่ได้ → users ว่าง → login พัง)
- ✅ **browser-verify ผ่าน (CDP→Windows Chrome, isolated newContext ต่อ user, ดู [[reference-browser-verify-handle]]):** login `admin`→/dashboard, /staff render บัญชีครบ **6/6** (admin/reception/accountant/nida/mali/somsak เติมจากตาราง relational); login `reception` (fresh context)→/dashboard = bcrypt verify ผ่านสำหรับ non-admin. **MCP ยืนยัน table:** ทั้ง 6 ราย password ยัง `$2b$` len 60 (**hash ไม่ถูก downgrade**), ไม่มี soft-delete, admin/reception มี last_login อัปเดต (recordLogin dual-write ทำงาน)
- 🔎 **finding (benign):** หลัง verify มีแค่ u001/u002 (ที่ login) ได้ `writer_id` stamp — เพราะ **recordLogin dual-write stamp writer_id ตอน login "ก่อน" reconcile ประเมิน everWritten** → reconcile upsert ถูก short-circuit (everWritten เห็น u001 มี writer_id แล้ว). **ไม่เสียหาย** เพราะตาราง relational มี hash ถูกต้องครบอยู่แล้ว (blob upsert ไม่มีอะไรต้องแก้ — username/staffId ตรงกัน, ไม่มี orphan), everWritten=true → reconcile ไม่รันซ้ำ, ทุกแถวถูกต้อง. ข้อจำกัดนี้เฉพาะ users (slice เดียวที่มี write ตอน login); ถ้าอนาคตมี slice login-coupled ที่ตารางต้องพึ่ง blob-upsert แก้ข้อมูล stale ต้องระวังลำดับนี้
- ⏳ **NEXT:** ผู้ใช้ merge PR #16 → deploy prod → prod-verify login (admin+1 บัญชี non-admin ที่ไม่เคย login = พิสูจน์ store-seed-จาก-table ใช้ได้กับแถวที่ reconcile แตะ). Tier B ที่เหลือ: **corporate** (accounts+tx, drop corp_tx FK→bookings/invoices) → **rooms ท้ายสุด** (พัวพัน updateRoomStatus; ใส่ FK `maintenance_logs.room_id` กลับ)

### 2026-06-26 (Tier B ต่อ — corporate cutover, code-complete + browser-verified on prod)
ต่อจาก users → **corporate เป็น Tier B ตัวที่ 5 และซับซ้อนสุด** (2 entity + 3 lifecycle side-effects + drop 2 FK) — branch `feat/tierB-corporate-migration` (stack บน users branch; PR #16 users ยังไม่ merge)
- **2 entity:** `corporate_accounts` = mutable + soft-delete (แบบ guests/staff) · `corporate_transactions` = **append-only ledger** (แบบ inventory_transactions/audit — ไม่มี deleted_at/update)
- **DDL `016`** (รันผ่าน MCP): writer_id ทั้งคู่ + realtime + replica identity full + **DROP FK 2 ตัว** `corp_tx→invoices` + `corp_tx→bookings` (ทั้งคู่ยัง blob/Tier C ตาราง stale → ใส่กลับตอน Tier C) + **KEEP** `corp_tx→corporate_accounts` (CASCADE, ย้ายพร้อมกัน → seed accounts ก่อน tx). RLS: accounts select/insert/update, tx **select/insert เท่านั้น** (append-only). verify: replident='f', writer_id, realtime, accounts 3 policy / tx 2 policy, out_fks accounts=0 tx=1
- **dual-write 8 จุด** (`lib/store.ts`): helpers `reportCorporateError`/`corpAccountRow`/`corpTxRow`/`pushCorpAccount`(update mutable fields)/`pushCorpTx`(insert). wire: addCorporateAccount=insert, updateCorporateAccount=push, depositToAccount/chargeAccount/refundToAccount=capture {account,tx} closure→push+pushTx, **+ 3 booking-lifecycle side-effects** (checkout auto-charge ใน updateBookingStatus, cancelBooking refund, cancelAddOn refund) จับ `corpFx` closure-var (แพทเทิร์น guestFx/invFx) → dual-write หลัง set()
- **per-table realtime** (`AppShell.tsx`): `corporate_accounts-sync` (event '*', soft-delete) + `corporate_transactions-sync` (INSERT, append-only ledger upsert-by-id sort date desc) + mappers ×4 + 2 reconcile blocks + strip + cleanup. Blob isolation 4 จุด (partialize ตัด 2 slice, merge `current ?? []` ×2, app_state strip, mergeState delete ×2)
- 🐞 **บั๊กที่เจอตอน verify + แก้แล้ว:** tx reconcile เดิมใช้ `.upsert(onConflict:'id')` แต่ orphan seed 6 แถว (ctx001-006) id ซ้ำ blob → ON CONFLICT **UPDATE** branch โดน RLS deny (tx ไม่มี update policy = append-only) → tx ไม่ stamp. **fix:** gate tx reconcile ด้วย `corpEverWritten` (จาก **accounts** ที่ stamp ได้ — ย้ายพร้อมกัน) + เปลี่ยนเป็น `ignoreDuplicates:true` (INSERT…ON CONFLICT DO NOTHING, ใช้แค่ INSERT policy). orphan tx (amounts/balances ถูกต้อง, เป็น authoritative หลัง blob strip) ถูกเก็บไว้ — fresh cutover (ตารางว่าง) จะ insert+stamp ครบ
- **✅ browser-verify ผ่าน (CDP→Windows Chrome):** login admin→/dashboard, /finance "เครดิตองค์กร" tab render 3 บัญชีครบจากตาราง (ไทยพัฒนา 100k/48.5k/51.5k, ซันไรส์ 50k/38.2k/11.8k, มงคล 20k/20k/0 ระงับ; ยอดฝากรวม 170k คงเหลือ 63.3k). **MCP:** accounts 3 stamped + balance ถูก + ไม่มี soft-delete; tx 6 แถว amounts/balances ถูก. re-boot หลัง fix = clean (corpEverWritten=true → tx reconcile skip)
- tsc 0 / build 22/22 routes. ⏳ commit/push/PR กำลังทำ
- ⏳ **NEXT:** push/PR corporate (stack บน users #16) → ผู้ใช้ merge users#16 ก่อน แล้ว rebase corporate `--onto main`. Tier B เหลือตัวสุดท้าย = **rooms** (พัวพัน updateRoomStatus ทุก flow; ย้ายเสร็จใส่ FK `maintenance_logs.room_id` กลับ + re-add corp_tx FK? ไม่ — corp_tx→bookings/invoices ใส่กลับตอน Tier C)

### 2026-07-01 (Tier B เสร็จครบ — rooms cutover, verified + recovered)
ต่อจาก corporate → **rooms เป็น Tier B ตัวสุดท้าย** — branch `feat/tierB-rooms-migration` (PR #19, base main). **ปิด Tier B ครบทุก entity.**
- **ต่างจากตัวอื่น = ไม่มี record CRUD ในแอป** (rooms ชุดคงที่จาก `mockRooms`; หน้า /rooms เรียกแค่ `updateRoomStatus`, การเปลี่ยนชื่อห้อง rA5=เฮียดิเรก ทำผ่าน blob ตรง) → เปลี่ยนเฉพาะ **status + occupancy pointers** (`currentBookingId`/`currentGuestId`) ผ่าน booking/maintenance/housekeeping lifecycle **10 จุด** → dual-write ผ่าน `roomFx` closure หลัง set() (แพทเทิร์น guestFx/corpFx). helper `pushRooms` อ่าน `get().rooms` หลัง set() แล้ว `.update({status,current_booking_id,current_guest_id,writer_id})`
- **DDL `017`** (รันผ่าน MCP): writer_id + realtime + replica identity full + RLS anon select/insert/update (ไม่มี delete) + **re-add FK `maintenance_logs.room_id→rooms`** (010 drop ไว้; verify 0 orphan รวม soft-deleted) + **แก้ CHECK `rooms_type_check`**
- 🐞🐞 **บั๊กใหญ่ที่เจอตอน verify + กู้แล้ว (บทเรียนสำคัญ):** ตาราง rooms จาก **001 seed ใช้ enum เก่า** (`standard/deluxe/suite/family/penthouse`) แต่ `RoomType` จริง = `single/double/triple` (blob=mockRooms) → reconcile upsert **ชน CHECK constraint** (23514) → upsert ล้มทั้ง batch. **ซ้ำร้าย browser-verify boot แรก strip rooms ออกจาก blob ไปแล้ว** (v40→44, blob ไม่มี rooms) ทั้งที่ reconcile ยังไม่สำเร็จ → เกือบ data-loss + boot ถัดไป (blob ว่าง, everWritten ยัง false) reconcile จะ **soft-delete ห้องทั้ง 40**. **กู้:** เทียบพบ **blob rooms == mockRooms เป๊ะทุก field** (status/price/number/cbid ตรง divergence ที่ capture ไว้) → รีสร้างตารางจาก mockRooms (upsert 40 แถว + stamp writer_id) + drop→upsert→add constraint ใน transaction เดียว (ลำดับสำคัญ: MCP wrap transaction, drop+add พร้อมกันโดยยังไม่แก้ค่าจะ rollback ทั้งคู่). ตอนนี้ตาราง = 40 live, stamped ครบ, constraint ถูก, everWritten=true → reconcile skip ถาวร
- **hardening 2 จุด:** (1) เพิ่ม CHECK-fix เข้า `017` sql (fresh rebuild ผ่าน); (2) rooms reconcile **guard `blobRooms.length > 0` ก่อน soft-delete** — ถ้า blob ถูก strip แล้ว (cutover เสร็จ) แต่ everWritten หลุดเป็น false ห้ามกวาดห้องทิ้ง (rooms critical — บทเรียนจากบั๊กนี้)
- store: partialize ตัด rooms + merge `current.rooms ?? []`. AppShell: `rooms-sync` (event '*', upsert by id) + mappers rowToRoom/roomToRow + reconcile + strip + cleanup. supabase-storage: `mergeState delete out.rooms`
- **✅ browser-verify ผ่าน (CDP→Windows Chrome):** login admin → /rooms render **40/40 จากตาราง** — "เฮียดิเรก" แสดงถูก (blob-authoritative), สถิติ single 26/ว่าง22 · double 12/ว่าง7 · triple 2/ว่าง1 · ราคา ฿500/฿700, สถานะ occupied/maintenance/cleaning ครบตรง mockRooms. console ไม่มี error. tsc 0 / build 22/22
- **prod ไม่ degrade แม้ blob ถูก strip:** blob rooms == mockRooms → main เดิม (read blob) fallback เป็น mockRooms (initial state) = ข้อมูลห้องถูกอยู่แล้ว. merge PR #19 = prod อ่าน rooms จากตาราง
- ⏳ **NEXT:** ผู้ใช้ merge PR #19 → prod-verify /rooms. **Tier B ครบแล้ว → เหลือ Tier C** (bookings/invoices/housekeeping/payments/addons cluster + RPC = งานใหญ่สุด, riskiest) หรือ Supabase Auth (P1 security ก้อนถัดไป)

### 2026-07-02 (เริ่ม Tier C — housekeeping_tasks cutover = C1/3, verified)
เริ่ม **Tier C** (bookings/invoices/housekeeping/bookingAddOns + payments) = cluster สุดท้าย + riskiest. แผนเต็ม: `~/.claude/plans/delegated-watching-pillow.md` (3 PR: **C1** housekeeping dual-write → **C2** bookings+invoices+addons+payments dual-write → **C3** 9 RPCs atomicity). Decisions ล็อก: payments ฝัง jsonb ใน bookings (ไม่แยกตาราง — RPC ทำ atomic ได้อยู่แล้ว), pricing คำนวณ client ส่งเข้า RPC.
- **C1 = housekeeping_tasks** (leaf ที่สุด: FK ขาออก→rooms ที่ย้ายแล้ว, ไม่มี entity พึ่ง) — branch `feat/tierC-housekeeping-migration` (stack บน rooms PR #19). pattern เดิม (แบบ rooms/guests).
- **DDL `018`** (ผ่าน MCP): writer_id + realtime + replica identity full + RLS anon select/insert/update. enums ตรง TS แล้ว (ต่างจาก rooms — ไม่ต้องแก้ CHECK).
- **store.ts:** `reportHkError`/`hkTaskRow`; `addHousekeepingTask`=insert, `updateTaskStatus`=patch (status+timestamp) via `hkPatch` closure, + **HK สร้างใน checkout/cancel/move** จับ `hkFx` closure → insert หลัง set() (แพทเทิร์น roomFx/guestFx). partialize ตัด + merge `current ?? []`.
- **AppShell:** `rowToHkTask`/`hkTaskToRow` + `housekeeping_tasks-sync` channel (event '*') + reconcile-from-blob (everWritten + bootState + **guard blobTasks.length>0**) + app_state strip + cleanup. supabase-storage: `delete out.housekeepingTasks`.
- **✅ browser-verify ผ่าน (CDP→Chrome):** login admin → /housekeeping kanban render (รอ 3/กำลังทำ 1/เสร็จ 1). **MCP: 5 live/5 stamped**, reconcile overwrite orphan stale ด้วย blob (hk004 table rA20/completed → blob rA2/pending/high; hk005 table rB7 → blob rA19). tsc 0 / build 22/22.
- ⏳ **NEXT:** commit/push/PR C1 (stack บน #19) → **C2** (bookings hub; แก้ schema gap: `bookings/invoices.guest_id` DROP NOT NULL + `bookings.guest_snapshot` jsonb + DROP payments table; b010 walk-in orphan ใน blob → reconcile insert เอง) → **C3** (9 RPCs).

### 2026-07-03 (Tier C — C2 bookings cluster cutover: bookings + invoices + booking_add_ons)
**C2 = หัวใจของ Tier C** — 3 ตาราง (hub) ย้ายพร้อมกันเพราะ FK ผูกกันแน่น (`invoices→bookings`, `booking_add_ons→bookings`; payments ฝังเป็น jsonb ใน booking row ตาม decision ที่ล็อกไว้). ยังเป็น dual-write best-effort (ไม่ atomic — C3/RPC จะปิดท้าย). branch `feat/tierC-c2-bookings-cluster` (ต่อจาก main ที่ C1 merge แล้ว — ไม่ stack).
- **DDL `019`** (ผ่าน MCP): แก้ schema gap walk-in — `bookings.guest_id`+`invoices.guest_id` DROP NOT NULL + `bookings.guest_snapshot jsonb` (walk-in มี guestSnapshot ไม่มี guestId) · writer_id ×3 + realtime ×3 + replica identity full ×3 + RLS anon select/insert/update ×3 (soft-delete=update ไม่มี hard delete) · **DROP ตาราง `payments`** (005, ว่าง/ไม่ใช้). schema จริง verify ก่อนเขียน: `room_type_at_booking`/`updated_at`/`deleted_at` มีครบแล้ว, CHECK enums ตรง TS (source ใน DB เป็น superset — ok)
- **store.ts:** helpers `reportBookingError`/`bookingRow`/`pushBooking` (เขียน mutable fields ทั้งแถวทับด้วย id — booking ถูกแก้หลายฟิลด์พร้อมกันหลาย action), `reportInvoiceError`/`invoiceRow`, `reportAddOnError`/`bookingAddOnRow`. wire ครบ: `createBooking`=insert (`bookingFx`), `updateBookingStatus` checkin/checkout=push booking + **insert invoice** (`bookingTouched`+`invoiceFx`), `cancelBooking`=push booking + patch invoices→refunded (จับ id list ใน closure), `updateBooking`=field patch, `extendBooking`/`moveBooking`/`adjustForEarlyCheckout`/`recordPayment`=pushBooking หลัง set(), `requestAddOn`=insert, `fulfillAddOn`=patch (status/fulfilled_*), `cancelAddOn`=patch + pushBooking ถ้ามี refund. **partialize เหลือแค่ `dynamicPricing`** (slice สุดท้ายใน blob!) + merge `current ?? []` ×3
- **AppShell:** mappers 3 คู่ (`rowToBooking`/`bookingToRow` [payments/guestSnapshot jsonb→nested, isCorporate true/undefined คงรูป blob], `rowToInvoice`/`invoiceToRow` [items jsonb], `rowToBookingAddOn`/`bookingAddOnToRow`) + 3 channels (event '*', soft-delete→remove, buffer-then-live) + 3 reconcile blocks (everWritten + bootState pre-strip + guard `blob*.length>0`) **ลำดับ FK: bookings ก่อน → invoices/addons หลัง**. b010 walk-in orphan ใน blob → reconcile upsert insert เอง. supabase-storage: `delete out.bookings/invoices/bookingAddOns`
- tsc 0 / build 22/22.
- **✅ browser-verify ผ่าน (CDP→Chrome, dev+prod DB):** reconcile ครบ — ตาราง **11 bookings (10 จาก blob รวม b010 walk-in + 1 VERIFY-TEST) / 4 invoices / 3 addons ทั้งหมด stamped writer_id**; UI /bookings render จากตาราง (เห็น b010 "สมชาย ผ่านมา (ไม่ลงทะเบียน)"), /finance 4 ใบ/รายได้ตรง; **create round-trip:** จองล่วงหน้า VERIFY-TEST (paid=0 ไม่แตะเงิน/ห้อง) → insert ขึ้นตารางพร้อม guest_snapshot; **cancel round-trip:** ยกเลิกผ่าน /bookings/[id] → ตาราง status=cancelled. **blob strip แล้วเหลือ key เดียว = `dynamicPricing`** (VERIFY-TEST booking ถูกยกเลิกทิ้งไว้เป็น trace — soft-delete ไม่มี hard delete)

## 6. ⏳ งานค้าง / Backlog
1. ~~`lib/auth-store.ts` ยังใช้ localStorage~~ → ✅ บัญชีย้ายขึ้น cloud แล้ว (session คงไว้ที่ localStorage โดยตั้งใจ)
2. **bookings/invoices/housekeeping/bookingAddOns ยังเป็น blob** (rooms ย้ายแล้ว 2026-07-01 = Tier B ครบ;
   เหลือ cluster Tier C ที่พัวพันกันหนัก) — ถ้าจะทำ "ถูก 100%" (รวมแก้ปัญหา delete ถูกชุบชีวิตในข้อ 3c)
   ต้องย้าย cluster ที่เหลือ (bookings, invoices, housekeeping, payments, addons) เป็น
   proper tables + Postgres RPC ให้ checkout/cancel เป็น transaction เดียว = งานใหญ่
3. **ความปลอดภัย: RLS** — 🔶 **2026-06-18 ทำ interim hardening แล้ว** (branch `security/p1-p2-hardening`, migration 012): ปิด anon บน orphan/PII tables ทั้งหมด + จำกัด active tables + audit_logs insert-only (กันลบกลบรอย) + store-side permission guards. ดู §5 entry 2026-06-18. **เหลือ residual ที่ปิดไม่ได้แบบ anon-only:** `app_state` blob ยังเปิด anon (แอปต้องอ่าน) = ใครมี public key ยังดึงข้อมูลทั้งก้อนผ่าน blob ได้. **ปิด 100% = ต้อง Supabase Auth จริง → `anon`→`authenticated` → per-role RLS → RPC** (งานใหญ่, ก้อนถัดไป). P3 ค้าง: `receipts` bucket ยัง list ได้, session ไม่มี expiry/revoke
4. ~~รหัสผ่าน plaintext~~ → ✅ (2026-06-15) **hash ด้วย bcrypt แล้ว** (`lib/auth-utils.ts`); blob + ตาราง relational `users` migrate เป็น hash หมด (0 plaintext). export ตัด password อยู่แล้ว. account actions มี audit ครบ. ดูรายละเอียด §5 entry 2026-06-15/16
5. ~~**VAT 7% ในใบแจ้งหนี้**~~ → ❌ **ยกเลิก/ไม่ทำ** (2026-06-23) — portfolio demo ข้อมูลปลอม ไม่ต้องใช้ใบกำกับภาษี (`tax: 0` คงไว้)
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
