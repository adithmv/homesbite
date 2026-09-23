-- Run after 004_security.sql. Safe to rerun.
-- Adds direct registration RPC that bypasses email verification, CAPTCHA, and admin approval.
begin;

-- Verify base schema exists
do $$ begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.restaurants') is null
     or to_regclass('public.riders') is null
     or to_regprocedure('private.is_admin()') is null then
    raise exception 'HomeBite base schema missing. Apply migrations 001-004 first.';
  end if;
end $$;

-- Direct registration: creates auth user + profile + rider/restaurant in one transaction.
-- Bypasses email confirmation, CAPTCHA, and admin approval.
-- Returns the new user's UUID.
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
  v_service_area_count int;
begin
  -- Basic validation
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Valid email is required';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;
  if p_name is null or length(trim(p_name)) < 1 or length(trim(p_name)) > 100 then
    raise exception 'Name must be 1-100 characters';
  end if;
  if p_phone is null or p_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Valid 10-digit Indian mobile number required';
  end if;
  if p_role not in ('customer','restaurant','rider','admin') then
    raise exception 'Role must be customer, restaurant, rider, or admin';
  end if;

  -- Check email uniqueness
  -- If user already exists with this email, return existing user ID
  select id into v_user_id from auth.users where email = lower(p_email);
  if v_user_id is not null then
    return v_user_id;
  end if;

  -- If phone exists, clean up orphaned profile or return existing user ID
  select id into v_user_id from public.profiles where phone = p_phone;
  if v_user_id is not null then
    if not exists (select 1 from auth.users where id = v_user_id) then
      delete from public.profiles where id = v_user_id;
      v_user_id := null;
    else
      return v_user_id;
    end if;
  end if;

  -- For restaurant/rider: verify location is in service area
  if p_role in ('restaurant','rider') then
    if p_lat is null or p_lng is null then
      raise exception 'Location (lat/lng) is required for kitchen/rider accounts';
    end if;
    select count(*) into v_service_area_count
    from public.service_areas
    where private.km(lat, lng, p_lat, p_lng) <= radius_km;
    if v_service_area_count = 0 then
      raise exception 'Location must be within a configured service area';
    end if;
  end if;

  -- Hash password using pgcrypto (bcrypt) in extensions schema
  v_password_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

  -- Generate user UUID
  v_user_id := gen_random_uuid();

  -- Insert into auth.users with email pre-confirmed
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
    now(), -- email_confirmed_at = now() bypasses email verification
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

  -- The trigger on_auth_user_created will create the profile and rider row.
  -- For restaurant, we also create the restaurant record here (auto-approved).
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
      '10:00–22:00',
      '',
      true,
      p_lat,
      p_lng,
      30,
      true -- auto-approved
    ) returning id into v_kitchen_id;
  end if;

  -- For rider: the trigger creates the rider row, but we need to set approved=true and location
  if p_role = 'rider' then
    update public.riders
    set approved = true,
        lat = p_lat,
        lng = p_lng,
        location_updated_at = now(),
        vehicle = p_vehicle
    where id = v_user_id;
  end if;

  return v_user_id;
end $$;

revoke all on function public.direct_register(text,text,text,text,public.app_role,text,double precision,double precision) from public, anon, authenticated;
grant execute on function public.direct_register(text,text,text,text,public.app_role,text,double precision,double precision) to anon, authenticated;

commit;