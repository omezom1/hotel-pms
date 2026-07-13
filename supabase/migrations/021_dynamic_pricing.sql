-- 021_dynamic_pricing.sql — Phase 4 (retire blob): dynamicPricing cutover (slice สุดท้าย)
-- dynamicPricing = กฎราคาตามฤดูกาล ต่อประเภทห้อง (config-like, CRUD ผ่าน Seasonal Rate Manager)
-- ต่างจาก entity อื่น: **ตารางยังไม่มี** (ไม่ได้อยู่ใน 001) → CREATE ใหม่ = fresh table ไม่มี orphan seed
--   → reconcile everWritten=false → upsert 3 rules จาก blob ตรง ๆ ไม่มี divergence
-- mutable CRUD (add/update/delete=soft-delete) แพทเทิร์น staff/expenses
-- รันผ่าน MCP execute_sql (management creds รัน DDL ได้)

-- ── 1) ตาราง dynamic_pricing (id/timestamp client-generate; start/end เป็น text 'YYYY-MM-DD') ──
CREATE TABLE IF NOT EXISTS public.dynamic_pricing (
  id          TEXT PRIMARY KEY,
  room_type   TEXT NOT NULL CHECK (room_type IN ('single','double','triple')),
  name        TEXT NOT NULL,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  price       NUMERIC NOT NULL,
  description TEXT,
  writer_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ── 2) trigger set_updated_at (function กลางจาก 005) ──
DROP TRIGGER IF EXISTS trg_set_updated_at ON public.dynamic_pricing;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.dynamic_pricing
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3) เปิด Realtime (idempotent DO block ตาม 003/013/…) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dynamic_pricing'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dynamic_pricing;
  END IF;
END $$;

-- ── 4) ส่ง row เต็มมากับ event (UPDATE/DELETE พก writer_id + deleted_at ครบ) ──
ALTER TABLE public.dynamic_pricing REPLICA IDENTITY FULL;

-- ── 5) RLS: anon select + insert + update (soft-delete = update; ไม่มี hard delete) ──
--    แพทเทิร์น active-table ใน 012 (fresh table → เปิด RLS + grant เอง)
ALTER TABLE public.dynamic_pricing ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.dynamic_pricing TO anon, authenticated;
CREATE POLICY "anon_select_dynamic_pricing" ON public.dynamic_pricing FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_dynamic_pricing" ON public.dynamic_pricing FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_dynamic_pricing" ON public.dynamic_pricing FOR UPDATE TO anon USING (true) WITH CHECK (true);
