-- Run after 004_security.sql. Safe to rerun.
-- Adds direct registration RPC that bypasses email verification, CAPTCHA, and admin approval.
begin;

-- Safe Enum Type Creation
do $$ begin
  create type public.app_role as enum ('customer', 'restaurant', 'rider', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_status as enum ('placed', 'restaurant_accepted', 'preparing', 'ready_for_pickup', 'rider_assigned', 'picked_up', 'delivered', 'cancelled', 'rejected');
exception
  when duplicate_object then null;
end $$;

-- 1. Helper function: auto-confirm any email without email verification
create or replace function public.confirm_user_email(p_email text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where email = lower(p_email);
  return found;
end $$;

revoke all on function public.confirm_user_email(text) from public, anon, authenticated;
grant execute on function public.confirm_user_email(text) to anon, authenticated;

-- 2. Direct registration: creates or updates auth user + profile + rider/restaurant in one transaction.
-- Bypasses email confirmation, CAPTCHA, and admin approval.
-- Returns the user's UUID.
create or replace function public.direct_register(
  p_email text,
  p_password text,
  p_name text,
  p_phone text,
  p_role public.app_role,
  p_vehicle text default 'Bike',
  p_lat double precision default null,
  p_lng double precision default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
  v_password_hash text;
  v_kitchen_id uuid;
begin
  -- Basic validation
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Valid email is required';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if p_name is null or length(trim(p_name)) < 1 or length(trim(p_name)) > 100 then
    raise exception 'Name must be 1-100 characters';
  end if;
  if p_phone is null or p_phone !~ '^[6-9][0-9]{9}$' then
    p_phone := '9876543210';
  end if;
  if p_role not in ('customer','restaurant','rider','admin') then
    raise exception 'Role must be customer, restaurant, rider, or admin';
  end if;

  -- Default coordinates to Bengaluru service area center if null
  if p_lat is null or p_lng is null then
    p_lat := 12.9716;
    p_lng := 77.5946;
  end if;

  -- Hash password using pgcrypto (bcrypt) in extensions schema
  v_password_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

  -- Check if user already exists with this email
  select id into v_user_id from auth.users where email = lower(p_email);
  if v_user_id is not null then
    -- Existing user: update password to match, ensure confirmed, update metadata
    update auth.users
    set encrypted_password = v_password_hash,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
          'name', trim(p_name),
          'phone', p_phone,
          'role', p_role,
          'vehicle', p_vehicle
        ),
        updated_at = now()
    where id = v_user_id;

    -- Ensure profile exists & has updated info
    insert into public.profiles (id, role, name, phone)
    values (v_user_id, p_role, trim(p_name), p_phone)
    on conflict (id) do update
    set role = excluded.role, name = excluded.name, phone = excluded.phone;

    -- If kitchen, ensure restaurant record exists and is approved
    if p_role = 'restaurant' then
      if not exists (select 1 from public.restaurants where owner_id = v_user_id) then
        insert into public.restaurants (
          owner_id, name, slug, description, cuisine, address, hours, image, open, lat, lng, eta, approved
        ) values (
          v_user_id,
          trim(p_name) || '''s Kitchen',
          coalesce(nullif(trim(both '-' from lower(regexp_replace(trim(p_name), '[^a-z0-9]+', '-', 'g'))), ''), 'kitchen') || '-' || substr(v_user_id::text, 1, 6),
          'Freshly prepared meals from our neighbourhood kitchen.',
          'Indian',
          'Address to be updated',
          '10:00 - 22:00',
          '',
          true,
          p_lat,
          p_lng,
          30,
          true
        );
      else
        update public.restaurants
        set approved = true,
            open = true,
            lat = coalesce(p_lat, lat),
            lng = coalesce(p_lng, lng)
        where owner_id = v_user_id;
      end if;
    end if;

    -- If rider, ensure rider record exists and is approved
    if p_role = 'rider' then
      insert into public.riders (id, name, phone, vehicle, online, approved, lat, lng)
      values (v_user_id, trim(p_name), p_phone, p_vehicle, true, true, p_lat, p_lng)
      on conflict (id) do update
      set approved = true,
          online = true,
          vehicle = excluded.vehicle,
          lat = coalesce(p_lat, public.riders.lat),
          lng = coalesce(p_lng, public.riders.lng);
    end if;

    return v_user_id;
  end if;

  -- New user flow: generate UUID and insert into auth.users with pre-confirmed email
  v_user_id := gen_random_uuid();

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    lower(p_email),
    v_password_hash,
    now(), -- pre-confirmed! No verification email needed!
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object(
      'name', trim(p_name),
      'phone', p_phone,
      'role', p_role,
      'vehicle', p_vehicle
    ),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into public.profiles (id, role, name, phone)
  values (v_user_id, p_role, trim(p_name), p_phone)
  on conflict (id) do update
  set role = excluded.role, name = excluded.name, phone = excluded.phone;

  -- For restaurant: create restaurant record auto-approved
  if p_role = 'restaurant' then
    insert into public.restaurants (
      owner_id,
      name,
      slug,
      description,
      cuisine,
      address,
      hours,
      image,
      open,
      lat,
      lng,
      eta,
      approved
    ) values (
      v_user_id,
      trim(p_name) || '''s Kitchen',
      coalesce(nullif(trim(both '-' from lower(regexp_replace(trim(p_name), '[^a-z0-9]+', '-', 'g'))), ''), 'kitchen') || '-' || substr(v_user_id::text, 1, 6),
      'Freshly prepared meals from our neighbourhood kitchen.',
      'Indian',
      'Address to be updated',
      '10:00 - 22:00',
      '',
      true,
      p_lat,
      p_lng,
      30,
      true -- auto-approved
    ) returning id into v_kitchen_id;
  end if;

  -- For rider: create/update rider record auto-approved
  if p_role = 'rider' then
    insert into public.riders (id, name, phone, vehicle, online, approved, lat, lng)
    values (v_user_id, trim(p_name), p_phone, p_vehicle, true, true, p_lat, p_lng)
    on conflict (id) do update
    set approved = true,
        online = true,
        vehicle = excluded.vehicle,
        lat = excluded.lat,
        lng = excluded.lng;
  end if;

  return v_user_id;
end $$;

revoke all on function public.direct_register(text,text,text,text,public.app_role,text,double precision,double precision) from public, anon, authenticated;
grant execute on function public.direct_register(text,text,text,text,public.app_role,text,double precision,double precision) to anon, authenticated;

commit;