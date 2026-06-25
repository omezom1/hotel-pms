-- 016_corporate_realtime.sql — Tier B (corporate cutover: 2 entities)
-- corporate_accounts       = mutable + soft-delete (แพทเทิร์น guests/staff)
-- corporate_transactions   = append-only ledger (แพทเทิร์น inventory_transactions/audit_logs)
-- ⚠️ DROP FK corp_tx→invoices + corp_tx→bookings: ทั้งคู่ยัง blob/Tier C (ตาราง stale orphan)
--    → tx ที่อ้าง booking/invoice ที่ตารางไม่มี จะ FK-violate ตอน insert (เหมือน maintenance→rooms)
--    ใส่กลับเมื่อ bookings/invoices ย้าย (Tier C). KEEP corp_tx→corporate_accounts (CASCADE,
--    ย้ายพร้อมกัน — seed accounts ก่อน tx); KEEP bookings→corporate_accounts (parent-side, soft-delete safe)
-- รันผ่าน MCP execute_sql (management creds รัน DDL ได้)

-- ── 1) คอลัมน์ writer_id (echo key) ทั้งสองตาราง ──
ALTER TABLE corporate_accounts ADD COLUMN IF NOT EXISTS writer_id TEXT;
ALTER TABLE corporate_transactions ADD COLUMN IF NOT EXISTS writer_id TEXT;

-- ── 2) DROP FK ขาออกที่ชี้ตาราง blob (idempotent) ──
ALTER TABLE corporate_transactions DROP CONSTRAINT IF EXISTS corporate_transactions_invoice_id_fkey;
ALTER TABLE corporate_transactions DROP CONSTRAINT IF EXISTS corporate_transactions_booking_id_fkey;

-- ── 3) เปิด Realtime ทั้งสองตาราง (idempotent DO block) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='corporate_accounts'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE corporate_accounts; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='corporate_transactions'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE corporate_transactions; END IF;
END $$;

-- ── 4) REPLICA IDENTITY FULL ทั้งสองตาราง (UPDATE/DELETE พก writer_id + deleted_at ครบ) ──
ALTER TABLE corporate_accounts REPLICA IDENTITY FULL;
ALTER TABLE corporate_transactions REPLICA IDENTITY FULL;

-- ── 5) เปิด RLS anon กลับ (012 ปิด orphan ไว้) ──
--    accounts = select/insert/update (mutable + soft-delete) ; transactions = select/insert (append-only ledger)
DROP POLICY IF EXISTS "anon_select_corporate_accounts" ON public.corporate_accounts;
DROP POLICY IF EXISTS "anon_insert_corporate_accounts" ON public.corporate_accounts;
DROP POLICY IF EXISTS "anon_update_corporate_accounts" ON public.corporate_accounts;
CREATE POLICY "anon_select_corporate_accounts" ON public.corporate_accounts FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_corporate_accounts" ON public.corporate_accounts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_corporate_accounts" ON public.corporate_accounts FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_corporate_transactions" ON public.corporate_transactions;
DROP POLICY IF EXISTS "anon_insert_corporate_transactions" ON public.corporate_transactions;
CREATE POLICY "anon_select_corporate_transactions" ON public.corporate_transactions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_corporate_transactions" ON public.corporate_transactions FOR INSERT TO anon WITH CHECK (true);
