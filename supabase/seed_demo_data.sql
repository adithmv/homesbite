-- ============================================================
-- HOMEBITE LIVE SEED DATA
-- Run in Supabase SQL Editor to populate sample partner kitchens,
-- menus, and an admin user for live testing.
-- ============================================================

begin;

-- 1. Ensure service area exists
insert into public.service_areas (id, name, lat, lng, radius_km)
values ('f1b8db65-e92d-49bb-99d3-b181ef564155', 'Bengaluru', 12.9716, 77.5946, 12)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, radius_km = excluded.radius_km;

-- 2. Create Owner 1 (The Everyday Kitchen)
select public.direct_register(
  p_email := 'everydaykitchen@homesbite.com',
  p_password := 'KitchenPass123!',
  p_name := 'Everyday Kitchen Owner',
  p_phone := '9876543201',
  p_role := 'restaurant'::public.app_role,
  p_lat := 12.975,
  p_lng := 77.601
);

update public.restaurants
set name = 'The Everyday Kitchen',
    slug = 'the-everyday-kitchen',
    description = 'Comfort food, cooked with care. Freshly made Indian favourites from our neighbourhood kitchen.',
    cuisine = 'South Indian',
    address = '12, Church Street, Bengaluru',
    hours = '10:00 - 22:00',
    open = true,
    approved = true,
    lat = 12.975,
    lng = 77.601,
    eta = 25
where owner_id = (select id from auth.users where email = 'everydaykitchen@homesbite.com');

-- Menu for The Everyday Kitchen
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

-- 3. Create Owner 2 (Biryani & Beyond)
select public.direct_register(
  p_email := 'biryani@homesbite.com',
  p_password := 'KitchenPass123!',
  p_name := 'Biryani Specialist',
  p_phone := '9876543202',
  p_role := 'restaurant'::public.app_role,
  p_lat := 12.978,
  p_lng := 77.638
);

update public.restaurants
set name = 'Biryani & Beyond',
    slug = 'biryani-and-beyond',
    description = 'Slow-cooked rice, fragrant spices, and generous portions. A little celebration in every order.',
    cuisine = 'Biryani',
    address = 'Indiranagar, Bengaluru',
    hours = '11:00 - 23:00',
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

-- 4. Create Owner 3 (Green Bowl Co.)
select public.direct_register(
  p_email := 'greenbowl@homesbite.com',
  p_password := 'KitchenPass123!',
  p_name := 'Green Bowl Chef',
  p_phone := '9876543203',
  p_role := 'restaurant'::public.app_role,
  p_lat := 12.967,
  p_lng := 77.599
);

update public.restaurants
set name = 'Green Bowl Co.',
    slug = 'green-bowl-co',
    description = 'Colourful bowls and seasonal ingredients, made fresh for your everyday.',
    cuisine = 'Healthy',
    address = 'Lavelle Road, Bengaluru',
    hours = '09:00 - 21:00',
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

-- 5. Create Demo Rider (Sam)
select public.direct_register(
  p_email := 'sam.rider@homesbite.com',
  p_password := 'RiderPass123!',
  p_name := 'Sam Delivery',
  p_phone := '9876543211',
  p_role := 'rider'::public.app_role,
  p_vehicle := 'Bike',
  p_lat := 12.973,
  p_lng := 77.600
);

update public.riders
set online = true,
    approved = true,
    lat = 12.973,
    lng = 77.600,
    location_updated_at = now()
where phone = '9876543211';

-- 6. Create Platform Admin User
select public.direct_register(
  p_email := 'agronilife@gmail.com',
  p_password := 'Admin..123456',
  p_name := 'Platform Admin',
  p_phone := '9876543210',
  p_role := 'admin'::public.app_role,
  p_lat := 12.9716,
  p_lng := 77.5946
);

commit;
