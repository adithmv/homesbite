-- ============================================================
-- SETUP ADMIN USER + CRON SECRET
-- Run in Supabase SQL Editor after complete_schema.sql
-- ============================================================

-- 1. CRON SECRET (generate once, use same in Vercel + Supabase cron)
-- Generated: a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
-- ^^^ COPY THIS STRING ^^^
-- Use in:
--   - Vercel env var: CRON_SECRET
--   - Supabase cron job Authorization header

-- 2. CREATE ADMIN USER (quick-register style, auto-approved)
-- Email: agronilife@gmail.com
-- Password: Admin..123456
-- Role: admin (bypasses email verification, no CAPTCHA)

select public.direct_register(
  p_email := 'agronilife@gmail.com',
  p_password := 'Admin..123456',
  p_name := 'Platform Admin',
  p_phone := '9876543210',
  p_role := 'admin'::public.app_role,
  p_vehicle := 'Bike',
  p_lat := 12.9716,
  p_lng := 77.5946
);

-- 3. VERIFY ADMIN CREATED
select id, email, role, created_at
from auth.users
where email = 'agronilife@gmail.com';

select id, name, role, phone
from public.profiles
where email = 'agronilife@gmail.com';

-- 4. ENABLE pg_cron + SCHEDULE DISPATCH (run once)
create extension if not exists pg_cron;

-- Replace YOUR_VERCEL_URL and CRON_SECRET below
select cron.schedule(
  'dispatch-orders',
  '* * * * *',  -- every minute
  $$
  select net.http_post(
    url := 'https://homesbite-beryl.vercel.app/api/dispatch',
    headers := jsonb_build_object(
      'Authorization', 'Bearer a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
      'Content-Type', 'application/json'
    )
  );
  $$
);

-- Verify cron job
select * from cron.job;