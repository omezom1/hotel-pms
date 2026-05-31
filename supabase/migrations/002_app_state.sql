-- ============================================================
-- App State (cloud-เต็ม) — Pruksatara Park & Resort
-- เก็บ state ของแอปทั้งก้อนเป็น JSON 1 แถว แทน localStorage
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → Run
-- ============================================================

create table if not exists app_state (
  id         text        primary key,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

-- เปิด RLS แล้วอนุญาตให้ anon (publishable key) เข้าถึงได้เต็ม
-- หมายเหตุ: เหมาะกับงานภายใน/ทีมเล็ก — ใครได้ URL+key ก็เข้าได้
alter table app_state enable row level security;

drop policy if exists "anon full access app_state" on app_state;
create policy "anon full access app_state"
  on app_state
  for all
  to anon
  using (true)
  with check (true);
