-- 012_rls_lockdown.sql — P2 security hardening (interim, ยังไม่ใช้ Supabase Auth)
--
-- ปัญหา: ทุกตารางมี policy เดียว `allow_all_authenticated_*` ที่จริง ๆ เป็น `TO public USING(true)`
--        = anon (ใครก็ตามที่มี public key) อ่าน/เขียน/ลบได้เต็มทุกตาราง รวม PII + รหัสผ่าน + เงิน + audit
--
-- กลยุทธ์ (app ใช้ anon key ล้วน ไม่มี Supabase Auth):
--   1) ORPHAN tables (แอปไม่แตะ — .from() อยู่ใน lib/supabase-api.ts ที่เป็น dead code):
--      DROP policy ทิ้ง → RLS ยังเปิด + ไม่มี policy = anon เข้าไม่ได้เลย (ข้อมูลยังอยู่ครบ, reversible)
--   2) ACTIVE tables (แอปใช้จริง): จำกัด policy ให้เหลือเฉพาะ command ที่แอปต้องใช้ (TO anon)
--      - append-only (audit_logs, inventory_transactions): SELECT + INSERT
--      - mutable + soft-delete (expenses, inventory_items, maintenance_logs, add_on_items): SELECT + INSERT + UPDATE
--   3) app_state (blob): คง anon ALL ไว้ — แอปต้องอ่าน/เขียน blob ตอน boot/login (residual risk, ปิด 100% ต้องใช้ Supabase Auth)
--
-- รันผ่าน MCP execute_sql (management creds รัน DDL ได้)

-- ========== 1) ORPHAN tables: ปิดสนิท (drop policy, ไม่สร้างใหม่) ==========
drop policy if exists "allow_all_authenticated_users"                  on public.users;
drop policy if exists "allow_all_authenticated_guests"                 on public.guests;
drop policy if exists "allow_all_authenticated_bookings"               on public.bookings;
drop policy if exists "allow_all_authenticated_invoices"               on public.invoices;
drop policy if exists "allow_all_authenticated_payments"               on public.payments;
drop policy if exists "allow_all_authenticated_staff"                  on public.staff;
drop policy if exists "allow_all_authenticated_corporate_accounts"     on public.corporate_accounts;
drop policy if exists "allow_all_authenticated_corporate_transactions" on public.corporate_transactions;
drop policy if exists "allow_all_authenticated_rooms"                  on public.rooms;
drop policy if exists "allow_all_authenticated_housekeeping_tasks"     on public.housekeeping_tasks;
drop policy if exists "allow_all_authenticated_booking_add_ons"        on public.booking_add_ons;
drop policy if exists "allow_all_authenticated_ota_channels"           on public.ota_channels;

-- ========== 2) ACTIVE tables: จำกัด command ==========

-- audit_logs: append-only + อ่านได้ (กันลบ/แก้กลบรอย)
drop policy if exists "allow_all_authenticated_audit_logs" on public.audit_logs;
create policy "anon_select_audit_logs" on public.audit_logs for select to anon using (true);
create policy "anon_insert_audit_logs" on public.audit_logs for insert to anon with check (true);

-- inventory_transactions: ledger append-only + อ่านได้
drop policy if exists "allow_all_authenticated_inventory_transactions" on public.inventory_transactions;
create policy "anon_select_inventory_transactions" on public.inventory_transactions for select to anon using (true);
create policy "anon_insert_inventory_transactions" on public.inventory_transactions for insert to anon with check (true);

-- expenses: select + insert + update (soft-delete = update; ไม่มี hard delete)
drop policy if exists "allow_all_authenticated_expenses" on public.expenses;
create policy "anon_select_expenses" on public.expenses for select to anon using (true);
create policy "anon_insert_expenses" on public.expenses for insert to anon with check (true);
create policy "anon_update_expenses" on public.expenses for update to anon using (true) with check (true);

-- inventory_items: select + insert + update
drop policy if exists "allow_all_authenticated_inventory_items" on public.inventory_items;
create policy "anon_select_inventory_items" on public.inventory_items for select to anon using (true);
create policy "anon_insert_inventory_items" on public.inventory_items for insert to anon with check (true);
create policy "anon_update_inventory_items" on public.inventory_items for update to anon using (true) with check (true);

-- maintenance_logs: select + insert + update
drop policy if exists "allow_all_authenticated_maintenance_logs" on public.maintenance_logs;
create policy "anon_select_maintenance_logs" on public.maintenance_logs for select to anon using (true);
create policy "anon_insert_maintenance_logs" on public.maintenance_logs for insert to anon with check (true);
create policy "anon_update_maintenance_logs" on public.maintenance_logs for update to anon using (true) with check (true);

-- add_on_items: select + insert + update (catalog; แก้จาก dashboard/แท็บอื่นได้)
drop policy if exists "allow_all_authenticated_add_on_items" on public.add_on_items;
create policy "anon_select_add_on_items" on public.add_on_items for select to anon using (true);
create policy "anon_insert_add_on_items" on public.add_on_items for insert to anon with check (true);
create policy "anon_update_add_on_items" on public.add_on_items for update to anon using (true) with check (true);

-- ========== 3) app_state: ไม่แตะ (คง "anon full access app_state") ==========
