-- ====================================================================
-- HOMEBITE: COMPLETE FIX & LIVE SEED SCRIPT
-- Run this ONCE in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/bstdacbvdxliighczurp/sql/new
-- ====================================================================

begin;

-- 1. FIX: Update direct_register to use extensions.crypt and extensions.gen_salt
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

  -- Use extensions.crypt and extensions.gen_salt for pgcrypto
  v_password_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

  v_user_id := gen_random_uuid();

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', lower(p_email), v_password_hash, now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object(
      'name', trim(p_name),
      'phone', p_phone,
      'role', p_role,
      'vehicle', p_vehicle
    ),
    now(), now(), '', '', '', ''
  );

  if p_role = 'restaurant' then
    insert into public.restaurants (
      owner_id, name, slug, description, cuisine, address, hours, image, open, lat, lng, eta, approved
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
      true
    ) returning id into v_kitchen_id;
  end if;

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

-- 2. Ensure Service Area Exists
insert into public.service_areas (id, name, lat, lng, radius_km)
values ('f1b8db65-e92d-49bb-99d3-b181ef564155', 'Bengaluru', 12.9716, 77.5946, 12)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, radius_km = excluded.radius_km;

-- 3. Seed Partner Kitchen 1: The Everyday Kitchen
do $$
declare v_id uuid;
begin
  if not exists (select 1 from auth.users where email = 'everydaykitchen@homesbite.com') then
    v_id := public.direct_register(
      p_email := 'everydaykitchen@homesbite.com',
      p_password := 'KitchenPass123!',
      p_name := 'Everyday Kitchen Owner',
      p_phone := '9876543201',
      p_role := 'restaurant'::public.app_role,
      p_lat := 12.975,
      p_lng := 77.601
    );
  end if;
end $$;

update public.restaurants
set name = 'The Everyday Kitchen',
    slug = 'the-everyday-kitchen',
    description = 'Comfort food, cooked with care. Freshly made Indian favourites from our neighbourhood kitchen.',
    cuisine = 'South Indian',
    address = '12, Church Street, Bengaluru',
    hours = '10:00–22:00',
    open = true,
    approved = true,
    lat = 12.975,
    lng = 77.601,
    eta = 25
where owner_id = (select id from auth.users where email = 'everydaykitchen@homesbite.com');

insert into public.menu_items (restaurant_id, name, description, category, price, veg, available, image)
select r.id, 'Homestyle veg thali', 'Dal, seasonal sabzi, fluffy rice, two rotis, pickle & a little sweet.', 'Kitchen favourites', 18900, true, true, ''
from public.restaurants r where r.slug = 'the-everyday-kitchen'
on conflict do nothing;

insert into public.menu_items (restaurant_id, name, description, category, price, veg, available, image)
select r.id, 'Paneer butter masala', 'Soft paneer in a rich tomato gravy. Served with two butter rotis.', 'Kitchen favourites', 22900, true, true, ''
from public.restaurants r where r.slug = 'the-everyday-kitchen'
on conflict do nothing;

insert into public.menu_items (restaurant_id, name, description, category, price, veg, available, image)
select r.id, 'Chicken rice bowl', 'Pepper chicken, steamed rice, crunchy onions & house chutney.', 'Rice & bowls', 24900, false, true, ''
from public.restaurants r where r.slug = 'the-everyday-kitchen'
on conflict do nothing;

insert into public.menu_items (restaurant_id, name, description, category, price, veg, available, image)
select r.id, 'Lemon rice', 'A bright South Indian classic with peanuts and curry leaves.', 'Rice & bowls', 11900, true, true, ''
from public.restaurants r where r.slug = 'the-everyday-kitchen'
on conflict do nothing;

-- 4. Seed Partner Kitchen 2: Biryani & Beyond
do $$
declare v_id uuid;
begin
  if not exists (select 1 from auth.users where email = 'biryani@homesbite.com') then
    v_id := public.direct_register(
      p_email := 'biryani@homesbite.com',
      p_password := 'KitchenPass123!',
      p_name := 'Biryani Specialist',
      p_phone := '9876543202',
      p_role := 'restaurant'::public.app_role,
      p_lat := 12.978,
      p_lng := 77.638
    );
  end if;
end $$;

update public.restaurants
set name = 'Biryani & Beyond',
    slug = 'biryani-and-beyond',
    description = 'Slow-cooked rice, fragrant spices, and generous portions. A little celebration in every order.',
    cuisine = 'Biryani',
    address = 'Indiranagar, Bengaluru',
    hours = '11:00–23:00',
    open = true,
    approved = true,
    lat = 12.978,
    lng = 77.638,
    eta = 35
where owner_id = (select id from auth.users where email = 'biryani@homesbite.com');

insert into public.menu_items (restaurant_id, name, description, category, price, veg, available, image)
select r.id, 'Dum chicken biryani', 'Fragrant basmati, tender chicken, cooling raita & salan.', 'Biryani', 27900, false, true, ''
from public.restaurants r where r.slug = 'biryani-and-beyond'
on conflict do nothing;

insert into public.menu_items (restaurant_id, name, description, category, price, veg, available, image)
select r.id, 'Vegetable dum biryani', 'Slow-cooked vegetables and basmati with whole spices.', 'Biryani', 21900, true, true, ''
from public.restaurants r where r.slug = 'biryani-and-beyond'
on conflict do nothing;

-- 5. Seed Partner Kitchen 3: Green Bowl Co.
do $$
declare v_id uuid;
begin
  if not exists (select 1 from auth.users where email = 'greenbowl@homesbite.com') then
    v_id := public.direct_register(
      p_email := 'greenbowl@homesbite.com',
      p_password := 'KitchenPass123!',
      p_name := 'Green Bowl Chef',
      p_phone := '9876543203',
      p_role := 'restaurant'::public.app_role,
      p_lat := 12.967,
      p_lng := 77.599
    );
  end if;
end $$;

update public.restaurants
set name = 'Green Bowl Co.',
    slug = 'green-bowl-co',
    description = 'Colourful bowls and seasonal ingredients, made fresh for your everyday.',
    cuisine = 'Healthy',
    address = 'Lavelle Road, Bengaluru',
    hours = '09:00–21:00',
    open = true,
    approved = true,
    lat = 12.967,
    lng = 77.599,
    eta = 20
where owner_id = (select id from auth.users where email = 'greenbowl@homesbite.com');

insert into public.menu_items (restaurant_id, name, description, category, price, veg, available, image)
select r.id, 'Roasted paneer bowl', 'Herbed rice, roasted paneer, greens & mint dressing.', 'Fresh bowls', 23900, true, true, ''
from public.restaurants r where r.slug = 'green-bowl-co'
on conflict do nothing;

insert into public.menu_items (restaurant_id, name, description, category, price, veg, available, image)
select r.id, 'Chickpea crunch bowl', 'Spiced chickpeas, cucumber, pickled onion & tahini.', 'Fresh bowls', 19900, true, true, ''
from public.restaurants r where r.slug = 'green-bowl-co'
on conflict do nothing;

-- 6. Seed Demo Rider (Sam)
do $$
declare v_id uuid;
begin
  if not exists (select 1 from auth.users where email = 'sam.rider@homesbite.com') then
    v_id := public.direct_register(
      p_email := 'sam.rider@homesbite.com',
      p_password := 'RiderPass123!',
      p_name := 'Sam Delivery',
      p_phone := '9876543211',
      p_role := 'rider'::public.app_role,
      p_vehicle := 'Bike',
      p_lat := 12.973,
      p_lng := 77.600
    );
  end if;
end $$;

update public.riders
set online = true,
    approved = true,
    lat = 12.973,
    lng = 77.600,
    location_updated_at = now()
where phone = '9876543211';

-- 7. Seed Platform Admin User
do $$
declare v_id uuid;
begin
  if not exists (select 1 from auth.users where email = 'agronilife@gmail.com') then
    v_id := public.direct_register(
      p_email := 'agronilife@gmail.com',
      p_password := 'Admin..123456',
      p_name := 'Platform Admin',
      p_phone := '9876543210',
      p_role := 'admin'::public.app_role,
      p_lat := 12.9716,
      p_lng := 77.5946
    );
  end if;
end $$;

commit;
