-- 022_supabase_auth_seed.sql — Supabase Auth ขั้น A (seed accounts + link) [ADDITIVE, prod-safe]
-- ย้ายจาก mock login (เทียบ bcrypt ใน store.users) → Supabase Auth จริง (email/password)
-- ขั้นนี้ additive ล้วน: สร้าง auth.users 6 บัญชี + คอลัมน์ users.auth_id link — prod เดิม (anon) ไม่กระทบ
-- decision: email/password ล้วน (ตัด demo buttons ในโค้ด), seed 6 บัญชีคงที่ (ไม่มี create-login ใน UI)
-- รันผ่าน MCP execute_sql (management creds)

-- ── 1) คอลัมน์ link auth.users(id) ↔ public.users ──
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_id uuid;

-- ── 2) seed 6 auth accounts (email <username>@pruksatara.local + known passwords, email-confirmed) ──
--    identities.email / users.confirmed_at เป็น GENERATED → ไม่ใส่. token cols nullable → ข้าม.
--    idempotent: ข้าม email ที่มีแล้ว
DO $$
DECLARE
  r record;
  uid uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('admin',      'admin@pruksatara.local',      'admin123'),
    ('reception',  'reception@pruksatara.local',  'reception'),
    ('accountant', 'accountant@pruksatara.local', 'account'),
    ('nida',       'nida@pruksatara.local',       'nida123'),
    ('mali',       'mali@pruksatara.local',       'mali123'),
    ('somsak',     'somsak@pruksatara.local',     'somsak123')
  ) AS t(uname, email, pw)
  LOOP
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = r.email) THEN
      UPDATE public.users SET auth_id = (SELECT id FROM auth.users WHERE email = r.email)
        WHERE username = r.uname;
      CONTINUE;
    END IF;
    uid := gen_random_uuid();
    -- ⚠️ token cols ต้องเป็น '' (ไม่ใช่ NULL) — GoTrue scan เป็น Go string ไม่ใช่ NullString
    --    NULL → 500 "Database error querying schema" ตอน sign-in
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      r.email, extensions.crypt(r.pw, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', '', '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', r.email), 'email',
      now(), now(), now()
    );
    UPDATE public.users SET auth_id = uid WHERE username = r.uname;
  END LOOP;
END $$;
