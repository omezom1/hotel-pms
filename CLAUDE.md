# CLAUDE.md — Hotel PMS (Pruksatara Park & Resort)

ไฟล์นี้ Claude Code อ่านอัตโนมัติทุกครั้งที่เปิดโปรเจกต์
**👉 อ่าน `PROGRESS.md` ก่อนเริ่มงานเสมอ** — มีสถานะงาน สถาปัตยกรรม และสิ่งที่ค้างไว้ครบ

## สรุปเร็ว
- Next.js 14 (App Router) · TypeScript · Tailwind · Zustand(+persist) · Supabase
- **ข้อมูล = cloud เต็ม:** state ทั้งก้อนเก็บเป็น JSON 1 แถวในตาราง Supabase `app_state`
  ผ่าน adapter `lib/supabase-storage.ts` (async)
- store หลัก `lib/store.ts` (`useHotelStore`) · auth `lib/auth-store.ts` (ยัง localStorage)
- realtime cross-tab sync ทำใน `components/layout/AppShell.tsx`

## คำสั่ง
- รัน dev: `npm run dev` → http://localhost:3000
- ตรวจ type: `npx tsc --noEmit` (มี pre-existing error ที่ bookings/seed — build ตั้ง ignore ไว้)

## กฎเหล็ก
- **อย่าแตะ async-hydration gate / realtime echo-suppression** โดยไม่อ่าน PROGRESS.md ข้อ 3
  (พังแล้วข้อมูลผู้ใช้หาย)
- **อย่า `pkill -f "next dev"`** — ฆ่า shell ของคำสั่งเอง; HMR ค้างให้ `rm -rf .next` แล้วสตาร์ทใหม่
- DDL ต้องรันใน Supabase Dashboard → SQL Editor (anon key รัน DDL ไม่ได้)
- `.env.local.txt` มี Supabase key — gitignore แล้ว อย่า commit
- debug เบราว์เซอร์ใช้ `console.log` ไม่ใช่ `console.debug`
- git: ทำงานบน `main` แล้ว push ผ่าน PR; จบ commit ด้วย Co-Authored-By
