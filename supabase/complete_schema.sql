-- ============================================================
-- HOMEBITE COMPLETE SUPABASE SCHEMA
-- Single file: run this in Supabase SQL Editor
-- Includes: 001_base + 002_service_area + 003_multi_area + 004_security + 005_direct_register
-- Safe to rerun (idempotent where possible)
-- ============================================================

-- ============================================================
-- 001_HOMEBITE.SQL - BASE SCHEMA
-- ============================================================
begin;

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum ('customer', 'restaurant', 'rider', 'admin');
create type public.order_status as enum ('placed', 'restaurant_accepted', 'preparing', 'ready_for_pickup', 'rider_assigned', 'picked_up', 'delivered', 'cancelled', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 100),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now()
);

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles,
  name text not null check (length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check (length(description) <= 1000),
  cuisine text not null default 'Indian',
  address text not null check (length(address) between 10 and 500),
  hours text not null default '10:00–22:00',
  image text not null default '',
  open boolean not null default false,
  approved boolean not null default false,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  eta integer not null default 30 check (eta between 10 and 120),
  rating numeric(2,1) check (rating between 0 and 5),
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants on delete cascade,
  name text not null check (length(name) between 2 and 100),
  description text not null default '' check (length(description) <= 500),
  category text not null default 'Favourites',
  price integer not null check (price between 100 and 1000000),
  veg boolean not null default true,
  available boolean not null default true,
  image text not null default ''
);

create table public.riders (
  id uuid primary key references public.profiles on delete cascade,
  name text not null,
  phone text not null,
  vehicle text not null check (vehicle in ('Bike', 'Scooter', 'Bicycle')),
  online boolean not null default false,
  approved boolean not null default false,
  lat double precision not null default 12.9716 check (lat between -90 and 90),
  lng double precision not null default 77.5946 check (lng between -180 and 180),
  location_updated_at timestamptz not null default '1970-01-01'
);

create table public.rider_locations (
  rider_id uuid primary key references public.riders on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles on delete cascade,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now(),
  unique(customer_id, address)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles,
  restaurant_id uuid not null references public.restaurants,
  rider_id uuid references public.riders,
  status public.order_status not null default 'placed',
  subtotal integer not null check (subtotal > 0),
  delivery_fee integer not null default 3500 check (delivery_fee >= 0),
  total integer not null check (total = subtotal + delivery_fee),
  customer_name text not null,
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  address text not null,
  lat double precision not null,
  lng double precision not null,
  notes text not null default '' check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assigned_at timestamptz,
  rider_accepted boolean not null default false,
  declined_rider_ids uuid[] not null default '{}'
);

create unique index one_active_delivery_per_rider on public.orders(rider_id) where status in ('rider_assigned', 'picked_up');
create index orders_customer_idx on public.orders(customer_id, created_at desc);
create index orders_restaurant_idx on public.orders(restaurant_id, status);
create index orders_dispatch_idx on public.orders(status, created_at);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  menu_item_id uuid references public.menu_items on delete set null,
  name text not null,
  quantity integer not null check (quantity between 1 and 20),
  price integer not null check (price > 0)
);
create index order_items_order_idx on public.order_items(order_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders on delete cascade,
  status public.order_status not null,
  actor_id uuid references public.profiles,
  created_at timestamptz not null default now()
);

-- Private helper functions
create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt()->>'aal','')='aal2'
    and exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;

create function private.can_read_order(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.orders o join public.restaurants r on r.id = o.restaurant_id
    where o.id = target and (o.customer_id = auth.uid() or o.rider_id = auth.uid() or r.owner_id = auth.uid() or private.is_admin()));
$$;

create function private.km(a double precision, b double precision, c double precision, d double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 6371 * 2 * asin(sqrt(least(1.0, greatest(0.0, power(sin(radians(c-a)/2),2) + cos(radians(a))*cos(radians(c))*power(sin(radians(d-b)/2),2)))));
$$;

create function private.new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare chosen public.app_role; begin
  chosen := case when new.raw_user_meta_data->>'role' in ('restaurant','rider') then (new.raw_user_meta_data->>'role')::public.app_role else 'customer' end;
  insert into public.profiles(id,name,phone,role) values(new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Customer'),100), new.raw_user_meta_data->>'phone', chosen);
  if chosen = 'rider' then
    insert into public.riders(id,name,phone,vehicle) values(new.id, left(new.raw_user_meta_data->>'name',100),new.raw_user_meta_data->>'phone',coalesce(new.raw_user_meta_data->>'vehicle','Bike'));
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.menu_items enable row level security;
alter table public.riders enable row level security;
alter table public.rider_locations enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or private.is_admin());
create policy restaurants_public on public.restaurants for select to anon, authenticated using (approved);
create policy restaurants_owner on public.restaurants for select to authenticated using (owner_id = auth.uid() or private.is_admin());
create policy restaurants_order_participant on public.restaurants for select to authenticated using (exists(select 1 from public.orders o where o.restaurant_id=restaurants.id and (o.customer_id=auth.uid() or o.rider_id=auth.uid())));
create policy menu_public on public.menu_items for select to anon, authenticated using (exists(select 1 from public.restaurants r where r.id = restaurant_id));
create policy riders_self_admin on public.riders for select to authenticated using (id = auth.uid() or private.is_admin());
create policy location_related on public.rider_locations for select to authenticated using (
  rider_id = auth.uid() or private.is_admin() or exists(select 1 from public.orders o where o.rider_id = rider_locations.rider_id and o.status in ('rider_assigned','picked_up') and o.customer_id = auth.uid())
);
create policy addresses_owner on public.addresses for select to authenticated using (customer_id = auth.uid());
create policy orders_related on public.orders for select to authenticated using (private.can_read_order(id));
create policy items_related on public.order_items for select to authenticated using (private.can_read_order(order_id));
create policy events_related on public.order_events for select to authenticated using (private.can_read_order(order_id));

revoke all on all tables in schema public from anon, authenticated;
grant select on public.restaurants, public.menu_items to anon, authenticated;
grant select on public.profiles,public.riders,public.rider_locations,public.addresses,public.orders,public.order_items,public.order_events to authenticated;

-- Dispatch logic (base version, updated by 002/003)
create function private.dispatch() returns void language plpgsql security definer set search_path = '' as $$
declare job record; chosen uuid; begin
  perform pg_advisory_xact_lock(841392);
  update public.orders set status='ready_for_pickup', declined_rider_ids=array_append(declined_rider_ids,rider_id), rider_id=null, assigned_at=null, rider_accepted=false, updated_at=now()
    where status='rider_assigned' and not rider_accepted and assigned_at <= now()-interval '60 seconds';
  for job in select o.id,o.declined_rider_ids,r.lat,r.lng from public.orders o join public.restaurants r on r.id=o.restaurant_id where o.status='ready_for_pickup' order by o.created_at for update of o loop
    chosen := null;
    select d.id into chosen from public.riders d where d.online and d.approved
      and d.location_updated_at > now()-interval '5 minutes'
      and not (d.id = any(job.declined_rider_ids))
      and private.km(job.lat,job.lng,d.lat,d.lng) <= 12
      and not exists(select 1 from public.orders busy where busy.rider_id=d.id and busy.status in ('rider_assigned','picked_up'))
      order by private.km(job.lat,job.lng,d.lat,d.lng),d.id limit 1 for update skip locked;
    if chosen is not null then
      update public.orders set rider_id=chosen,status='rider_assigned',assigned_at=now(),rider_accepted=false,updated_at=now() where id=job.id;
    end if;
  end loop;
end $$;

create function private.log_order() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP='INSERT' or new.status is distinct from old.status then
    insert into public.order_events(order_id,status,actor_id) values(new.id,new.status,auth.uid());
  end if;
  return new;
end $$;
create trigger order_audit after insert or update on public.orders for each row execute function private.log_order();

-- Public RPCs
create function public.place_order(payload jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare kitchen public.restaurants; item public.menu_items; line jsonb; qty integer; subtotal_value integer := 0; order_key uuid; latitude double precision; longitude double precision; begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='customer') then raise exception 'Customer account required'; end if;
  if length(trim(payload->>'customer_name')) not between 1 and 100 or payload->>'customer_name' is null then raise exception 'Name is required'; end if;
  if length(trim(payload->>'address')) not between 10 and 500 or payload->>'address' is null then raise exception 'Complete address is required'; end if;
  if coalesce(payload->>'phone','') !~ '^[6-9][0-9]{9}$' then raise exception 'Invalid Indian mobile number'; end if;
  latitude := (payload->>'lat')::double precision; longitude := (payload->>'lng')::double precision;
  if latitude is null or longitude is null or latitude not between -90 and 90 or longitude not between -180 and 180 or private.km(12.9716,77.5946,latitude,longitude)>12 then raise exception 'Outside Bengaluru delivery zone'; end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 30 then raise exception 'Invalid cart'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(payload->'items')) <> jsonb_array_length(payload->'items') then raise exception 'Duplicate cart items'; end if;
  select * into kitchen from public.restaurants where id=(payload->>'restaurant_id')::uuid for share;
  if not found or not kitchen.open or not kitchen.approved then raise exception 'Kitchen is not accepting orders'; end if;
  for line in select value from jsonb_array_elements(payload->'items') loop
    if (line->>'quantity') !~ '^[0-9]+$' then raise exception 'Invalid quantity'; end if;
    qty := (line->>'quantity')::integer;
    select * into item from public.menu_items where id=(line->>'id')::uuid and restaurant_id=kitchen.id and available for share;
    if not found or qty is null or qty not between 1 and 20 then raise exception 'Item unavailable or invalid quantity'; end if;
    subtotal_value := subtotal_value + item.price * qty;
  end loop;
  perform 1 from public.profiles where id=auth.uid() for update;
  if (select count(*) from public.orders where customer_id=auth.uid() and status not in ('delivered','cancelled','rejected')) >= 5 then raise exception 'Please complete your active orders before placing another'; end if;
  if exists(select 1 from public.orders where customer_id=auth.uid() and created_at>now()-interval '3 seconds') then raise exception 'Please wait before placing another order'; end if;
  insert into public.orders(customer_id,restaurant_id,subtotal,total,customer_name,phone,address,lat,lng,notes)
    values(auth.uid(),kitchen.id,subtotal_value,subtotal_value+3500,trim(payload->>'customer_name'),payload->>'phone',trim(payload->>'address'),latitude,longitude,coalesce(payload->>'notes','')) returning id into order_key;
  for line in select value from jsonb_array_elements(payload->'items') loop
    insert into public.order_items(order_id,menu_item_id,name,quantity,price)
      select order_key,id,name,(line->>'quantity')::integer,price from public.menu_items where id=(line->>'id')::uuid;
  end loop;
  insert into public.addresses(customer_id,address,lat,lng) values(auth.uid(),trim(payload->>'address'),latitude,longitude)
    on conflict(customer_id,address) do update set lat=excluded.lat,lng=excluded.lng;
  return order_key;
end $$;

create function public.transition_order(order_id uuid,next_status public.order_status) returns void language plpgsql security definer set search_path = '' as $$
declare job public.orders; owner_key uuid; actor public.profiles; allowed boolean := false; begin
  perform pg_advisory_xact_lock(841392);
  select * into actor from public.profiles where id=auth.uid();
  select * into job from public.orders where id=order_id for update;
  if not found then raise exception 'Order not found'; end if;
  select owner_id into owner_key from public.restaurants where id=job.restaurant_id;
  if actor.role='customer' and job.customer_id=auth.uid() then
    allowed := job.status='placed' and next_status='cancelled';
  elsif actor.role='restaurant' and owner_key=auth.uid() then
    allowed := (job.status='placed' and next_status in ('restaurant_accepted','rejected')) or (job.status='restaurant_accepted' and next_status='preparing') or (job.status='preparing' and next_status='ready_for_pickup');
  elsif actor.role='rider' and job.rider_id=auth.uid() and job.rider_accepted then
    allowed := (job.status='rider_assigned' and next_status='picked_up') or (job.status='picked_up' and next_status='delivered');
  end if;
  if not coalesce(allowed,false) then raise exception 'Order transition is not allowed'; end if;
  update public.orders set status=next_status,updated_at=now() where id=order_id;
  perform private.dispatch();
end $$;

create function public.respond_assignment(order_id uuid,accepted boolean) returns void language plpgsql security definer set search_path = '' as $$
declare job public.orders; begin
  perform pg_advisory_xact_lock(841392);
  select * into job from public.orders where id=order_id for update;
  if job.id is null or job.rider_id is distinct from auth.uid() or job.status<>'rider_assigned' or job.rider_accepted then raise exception 'Assignment unavailable'; end if;
  if job.assigned_at <= now()-interval '60 seconds' then raise exception 'Assignment expired'; end if;
  if accepted then
    update public.orders set rider_accepted=true,updated_at=now() where id=order_id;
  else
    update public.orders set status='ready_for_pickup',rider_id=null,assigned_at=null,declined_rider_ids=array_append(declined_rider_ids,auth.uid()),updated_at=now() where id=order_id;
    perform private.dispatch();
  end if;
end $$;

create function public.update_rider(is_online boolean,latitude double precision default null,longitude double precision default null) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(841392);
  if not exists(select 1 from public.riders where id=auth.uid() and approved) then raise exception 'Your rider account needs approval'; end if;
  if is_online and (latitude is null or longitude is null) then raise exception 'Location is required to go online'; end if;
  if latitude is not null and (latitude not between -90 and 90 or longitude is null or longitude not between -180 and 180) then raise exception 'Invalid location'; end if;
  update public.riders set online=is_online,lat=coalesce(latitude,lat),lng=coalesce(longitude,lng),location_updated_at=case when latitude is null then location_updated_at else now() end where id=auth.uid();
  if latitude is not null then
    insert into public.rider_locations(rider_id,lat,lng) values(auth.uid(),latitude,longitude) on conflict(rider_id) do update set lat=excluded.lat,lng=excluded.lng,updated_at=now();
  end if;
  perform private.dispatch();
end $$;

create function public.dispatch_orders() returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null and coalesce(auth.role(),'') <> 'service_role' then raise exception 'Authentication required'; end if;
  perform private.dispatch();
end $$;

create function public.save_restaurant(payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare latitude double precision; longitude double precision; begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='restaurant') then raise exception 'Restaurant account required'; end if;
  latitude := (payload->>'lat')::double precision; longitude := (payload->>'lng')::double precision;
  if latitude is null or longitude is null or latitude not between -90 and 90 or longitude not between -180 and 180 or private.km(12.9716,77.5946,latitude,longitude)>12 then raise exception 'Kitchen must be in the Bengaluru service area'; end if;
  if length(coalesce(payload->>'image',''))>2048 or (coalesce(payload->>'image','')<>'' and payload->>'image' !~ '^https://') then raise exception 'Use an HTTPS image URL'; end if;
  insert into public.restaurants(owner_id,name,slug,description,cuisine,address,hours,image,open,lat,lng,eta)
    values(auth.uid(),payload->>'name',payload->>'slug',coalesce(payload->>'description',''),payload->>'cuisine',payload->>'address',payload->>'hours',coalesce(payload->>'image',''),coalesce((payload->>'open')::boolean,false),latitude,longitude,coalesce((payload->>'eta')::integer,30))
    on conflict(owner_id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,cuisine=excluded.cuisine,address=excluded.address,hours=excluded.hours,image=excluded.image,open=excluded.open,lat=excluded.lat,lng=excluded.lng,eta=excluded.eta;
end $$;

create function public.save_menu_item(payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare kitchen_id uuid; item_key uuid; begin
  select id into kitchen_id from public.restaurants where owner_id=auth.uid();
  if kitchen_id is null then raise exception 'Set up your kitchen first'; end if;
  if length(coalesce(payload->>'image',''))>2048 or (coalesce(payload->>'image','')<>'' and payload->>'image' !~ '^https://') then raise exception 'Use an HTTPS image URL'; end if;
  item_key := coalesce((payload->>'id')::uuid,gen_random_uuid());
  if exists(select 1 from public.menu_items where id=item_key and restaurant_id<>kitchen_id) then raise exception 'Not your menu item'; end if;
  insert into public.menu_items(id,restaurant_id,name,description,category,price,veg,available,image)
    values(item_key,kitchen_id,payload->>'name',coalesce(payload->>'description',''),payload->>'category',(payload->>'price')::integer,coalesce((payload->>'veg')::boolean,true),coalesce((payload->>'available')::boolean,true),coalesce(payload->>'image',''))
    on conflict(id) do update set name=excluded.name,description=excluded.description,category=excluded.category,price=excluded.price,veg=excluded.veg,available=excluded.available,image=excluded.image where public.menu_items.restaurant_id=kitchen_id;
  if not found then raise exception 'Not your menu item'; end if;
end $$;

create function public.delete_menu_item(item_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.menu_items m using public.restaurants r where m.id=item_id and r.id=m.restaurant_id and r.owner_id=auth.uid();
  if not found then raise exception 'Menu item not found'; end if;
end $$;

create function public.approve_partner(partner_kind text,partner_id uuid,is_approved boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  if partner_kind='restaurant' then update public.restaurants set approved=is_approved where id=partner_id;
  elsif partner_kind='rider' then update public.riders set approved=is_approved,online=case when is_approved then online else false end where id=partner_id;
  else raise exception 'Invalid partner kind'; end if;
end $$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin(),private.can_read_order(uuid) to authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.place_order(jsonb),public.transition_order(uuid,public.order_status),public.respond_assignment(uuid,boolean),public.update_rider(boolean,double precision,double precision),public.dispatch_orders(),public.save_restaurant(jsonb),public.save_menu_item(jsonb),public.delete_menu_item(uuid),public.approve_partner(text,uuid,boolean) to authenticated;
grant execute on function public.dispatch_orders() to service_role;

alter publication supabase_realtime add table public.orders,public.order_items,public.restaurants,public.menu_items,public.riders,public.rider_locations;

commit;

-- ============================================================
-- 002_SERVICE_AREA.SQL - SINGLE SERVICE AREA
-- ============================================================
begin;

create table if not exists public.service_area (
  id integer primary key default 1 check (id=1),
  name text not null check (length(trim(name)) between 1 and 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_km double precision not null check (radius_km between 1 and 100),
  updated_at timestamptz not null default now()
);

insert into public.service_area(id,name,lat,lng,radius_km)
values(1,'Bengaluru',12.9716,77.5946,12) on conflict(id) do nothing;

alter table public.service_area enable row level security;
drop policy if exists service_area_read on public.service_area;
create policy service_area_read on public.service_area for select to anon,authenticated using (true);
revoke all on public.service_area from public,anon,authenticated;
grant select on public.service_area to anon,authenticated;

create or replace function public.save_service_area(payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  update public.service_area set
    name=trim(payload->>'name'),lat=(payload->>'lat')::double precision,
    lng=(payload->>'lng')::double precision,radius_km=(payload->>'radius_km')::double precision,
    updated_at=clock_timestamp() where id=1;
  if not found then raise exception 'Service area has not been initialized'; end if;
end $$;
revoke all on function public.save_service_area(jsonb) from public,anon,authenticated;
grant execute on function public.save_service_area(jsonb) to authenticated;

-- Update place_order to use service_area table
create or replace function public.place_order(payload jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare kitchen public.restaurants; item public.menu_items; line jsonb; qty integer; subtotal_value integer := 0; order_key uuid; area public.service_area; latitude double precision; longitude double precision; begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='customer') then raise exception 'Customer account required'; end if;
  if length(trim(payload->>'customer_name')) not between 1 and 100 or payload->>'customer_name' is null then raise exception 'Name is required'; end if;
  if length(trim(payload->>'address')) not between 10 and 500 or payload->>'address' is null then raise exception 'Complete address is required'; end if;
  if coalesce(payload->>'phone','') !~ '^[6-9][0-9]{9}$' then raise exception 'Invalid Indian mobile number'; end if;
  select * into strict area from public.service_area where id=1 for share;
  latitude := (payload->>'lat')::double precision; longitude := (payload->>'lng')::double precision;
  if latitude is null or longitude is null or latitude not between -90 and 90 or longitude not between -180 and 180 or private.km(area.lat,area.lng,latitude,longitude)>area.radius_km then raise exception 'Outside the configured delivery area'; end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 30 then raise exception 'Invalid cart'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(payload->'items')) <> jsonb_array_length(payload->'items') then raise exception 'Duplicate cart items'; end if;
  select * into kitchen from public.restaurants where id=(payload->>'restaurant_id')::uuid for share;
  if not found or not kitchen.open or not kitchen.approved then raise exception 'Kitchen is not accepting orders'; end if;
  if private.km(area.lat,area.lng,kitchen.lat,kitchen.lng)>area.radius_km then raise exception 'Kitchen is outside the current service area'; end if;
  for line in select value from jsonb_array_elements(payload->'items') loop
    if (line->>'quantity') !~ '^[0-9]+$' then raise exception 'Invalid quantity'; end if;
    qty := (line->>'quantity')::integer;
    select * into item from public.menu_items where id=(line->>'id')::uuid and restaurant_id=kitchen.id and available for share;
    if not found or qty is null or qty not between 1 and 20 then raise exception 'Item unavailable or invalid quantity'; end if;
    subtotal_value := subtotal_value + item.price * qty;
  end loop;
  perform 1 from public.profiles where id=auth.uid() for update;
  if (select count(*) from public.orders where customer_id=auth.uid() and status not in ('delivered','cancelled','rejected')) >= 5 then raise exception 'Please complete your active orders before placing another'; end if;
  if exists(select 1 from public.orders where customer_id=auth.uid() and created_at>now()-interval '3 seconds') then raise exception 'Please wait before placing another order'; end if;
  insert into public.orders(customer_id,restaurant_id,subtotal,total,customer_name,phone,address,lat,lng,notes)
    values(auth.uid(),kitchen.id,subtotal_value,subtotal_value+3500,trim(payload->>'customer_name'),payload->>'phone',trim(payload->>'address'),latitude,longitude,coalesce(payload->>'notes','')) returning id into order_key;
  for line in select value from jsonb_array_elements(payload->'items') loop
    insert into public.order_items(order_id,menu_item_id,name,quantity,price)
      select order_key,id,name,(line->>'quantity')::integer,price from public.menu_items where id=(line->>'id')::uuid;
  end loop;
  insert into public.addresses(customer_id,address,lat,lng) values(auth.uid(),trim(payload->>'address'),latitude,longitude)
    on conflict(customer_id,address) do update set lat=excluded.lat,lng=excluded.lng;
  return order_key;
end $$;

-- Update save_restaurant to use service_area table
create or replace function public.save_restaurant(payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare latitude double precision; longitude double precision; area public.service_area; begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='restaurant') then raise exception 'Restaurant account required'; end if;
  select * into strict area from public.service_area where id=1 for share;
  latitude := (payload->>'lat')::double precision; longitude := (payload->>'lng')::double precision;
  if latitude is null or longitude is null or latitude not between -90 and 90 or longitude not between -180 and 180 or private.km(area.lat,area.lng,latitude,longitude)>area.radius_km then raise exception 'Kitchen must be inside the configured service area'; end if;
  if length(coalesce(payload->>'image',''))>2048 or (coalesce(payload->>'image','')<>'' and payload->>'image' !~ '^https://') then raise exception 'Use an HTTPS image URL'; end if;
  insert into public.restaurants(owner_id,name,slug,description,cuisine,address,hours,image,open,lat,lng,eta)
    values(auth.uid(),payload->>'name',payload->>'slug',coalesce(payload->>'description',''),payload->>'cuisine',payload->>'address',payload->>'hours',coalesce(payload->>'image',''),coalesce((payload->>'open')::boolean,false),latitude,longitude,coalesce((payload->>'eta')::integer,30))
    on conflict(owner_id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,cuisine=excluded.cuisine,address=excluded.address,hours=excluded.hours,image=excluded.image,open=excluded.open,lat=excluded.lat,lng=excluded.lng,eta=excluded.eta;
end $$;

-- Update private.dispatch to use service_area radius
create or replace function private.dispatch() returns void language plpgsql security definer set search_path = '' as $$
declare job record; chosen uuid; matching_radius double precision; begin
  perform pg_advisory_xact_lock(841392);
  select radius_km into strict matching_radius from public.service_area where id=1;
  update public.orders set status='ready_for_pickup', declined_rider_ids=array_append(declined_rider_ids,rider_id), rider_id=null, assigned_at=null, rider_accepted=false, updated_at=now()
    where status='rider_assigned' and not rider_accepted and assigned_at <= now()-interval '60 seconds';
  for job in select o.id,o.declined_rider_ids,r.lat,r.lng from public.orders o join public.restaurants r on r.id=o.restaurant_id where o.status='ready_for_pickup' order by o.created_at for update of o loop
    chosen := null;
    select d.id into chosen from public.riders d where d.online and d.approved
      and d.location_updated_at > now()-interval '5 minutes'
      and not (d.id = any(job.declined_rider_ids))
      and private.km(job.lat,job.lng,d.lat,d.lng) <= matching_radius
      and not exists(select 1 from public.orders busy where busy.rider_id=d.id and busy.status in ('rider_assigned','picked_up'))
      order by private.km(job.lat,job.lng,d.lat,d.lng),d.id limit 1 for update skip locked;
    if chosen is not null then
      update public.orders set rider_id=chosen,status='rider_assigned',assigned_at=now(),rider_accepted=false,updated_at=now() where id=job.id;
    end if;
  end loop;
end $$;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='service_area') then
    alter publication supabase_realtime add table public.service_area;
  end if;
end $$;

commit;

-- ============================================================
-- 003_MULTIPLE_SERVICE_AREAS.SQL - MULTI-AREA SUPPORT
-- ============================================================
begin;

create table if not exists public.service_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_km double precision not null check (radius_km between 1 and 100),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.service_areas(name,lat,lng,radius_km)
select name,lat,lng,radius_km from public.service_area where id=1
and not exists(select 1 from public.service_areas);

alter table public.service_areas enable row level security;
drop policy if exists service_areas_read on public.service_areas;
create policy service_areas_read on public.service_areas for select to anon,authenticated using(true);
revoke all on public.service_areas from public,anon,authenticated;
grant select on public.service_areas to anon,authenticated;

create or replace function private.sync_primary_area() returns void language sql security definer set search_path='' as $$
  update public.service_area set name=a.name,lat=a.lat,lng=a.lng,radius_km=a.radius_km,updated_at=clock_timestamp()
  from (select * from public.service_areas order by created_at,id limit 1) a where public.service_area.id=1;
$$;
revoke all on function private.sync_primary_area() from public,anon,authenticated;

create or replace function public.upsert_service_area(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare area_key uuid := nullif(payload->>'id','')::uuid;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  perform pg_advisory_xact_lock(841393);
  if area_key is null then
    if (select count(*) from public.service_areas)>=100 then raise exception 'Maximum of 100 service areas'; end if;
    insert into public.service_areas(name,lat,lng,radius_km) values(trim(payload->>'name'),(payload->>'lat')::double precision,(payload->>'lng')::double precision,(payload->>'radius_km')::double precision) returning id into area_key;
  else
    update public.service_areas set name=trim(payload->>'name'),lat=(payload->>'lat')::double precision,lng=(payload->>'lng')::double precision,radius_km=(payload->>'radius_km')::double precision,updated_at=clock_timestamp() where id=area_key;
    if not found then raise exception 'Service area no longer exists. Refresh and try again.'; end if;
  end if;
  perform private.sync_primary_area();
  return area_key;
end $$;

create or replace function public.delete_service_area(area_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  perform pg_advisory_xact_lock(841393);
  if (select count(*) from public.service_areas)<=1 then raise exception 'Keep at least one service area'; end if;
  delete from public.service_areas where id=area_id;
  if not found then raise exception 'Service area no longer exists'; end if;
  perform private.sync_primary_area();
end $$;

create or replace function public.save_service_area(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare primary_id uuid;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  perform pg_advisory_xact_lock(841393);
  select id into strict primary_id from public.service_areas order by created_at,id limit 1;
  perform public.upsert_service_area(payload || jsonb_build_object('id',primary_id));
end $$;
revoke all on function public.upsert_service_area(jsonb),public.delete_service_area(uuid) from public,anon,authenticated;
grant execute on function public.upsert_service_area(jsonb),public.delete_service_area(uuid) to authenticated;

-- Update place_order for multi-area
create or replace function public.place_order(payload jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare kitchen public.restaurants; item public.menu_items; line jsonb; qty integer; subtotal_value integer := 0; order_key uuid;  latitude double precision; longitude double precision; begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='customer') then raise exception 'Customer account required'; end if;
  if length(trim(payload->>'customer_name')) not between 1 and 100 or payload->>'customer_name' is null then raise exception 'Name is required'; end if;
  if length(trim(payload->>'address')) not between 10 and 500 or payload->>'address' is null then raise exception 'Complete address is required'; end if;
  if coalesce(payload->>'phone','') !~ '^[6-9][0-9]{9}$' then raise exception 'Invalid Indian mobile number'; end if;
  perform pg_advisory_xact_lock(841393);
  latitude := (payload->>'lat')::double precision; longitude := (payload->>'lng')::double precision;
  if latitude is null or longitude is null or latitude not between -90 and 90 or longitude not between -180 and 180 or not exists(select 1 from public.service_areas a where private.km(a.lat,a.lng,latitude,longitude)<=a.radius_km) then raise exception 'Outside the configured delivery area'; end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 30 then raise exception 'Invalid cart'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(payload->'items')) <> jsonb_array_length(payload->'items') then raise exception 'Duplicate cart items'; end if;
  select * into kitchen from public.restaurants where id=(payload->>'restaurant_id')::uuid for share;
  if not found or not kitchen.open or not kitchen.approved then raise exception 'Kitchen is not accepting orders'; end if;
  if not exists(select 1 from public.service_areas a where private.km(a.lat,a.lng,kitchen.lat,kitchen.lng)<=a.radius_km) then raise exception 'Kitchen is outside the current service area'; end if;
  if not exists(select 1 from public.service_areas a where private.km(a.lat,a.lng,kitchen.lat,kitchen.lng)<=a.radius_km and private.km(a.lat,a.lng,latitude,longitude)<=a.radius_km) then raise exception 'Kitchen and delivery address must share a service area'; end if;
  for line in select value from jsonb_array_elements(payload->'items') loop
    if (line->>'quantity') !~ '^[0-9]+$' then raise exception 'Invalid quantity'; end if;
    qty := (line->>'quantity')::integer;
    select * into item from public.menu_items where id=(line->>'id')::uuid and restaurant_id=kitchen.id and available for share;
    if not found or qty is null or qty not between 1 and 20 then raise exception 'Item unavailable or invalid quantity'; end if;
    subtotal_value := subtotal_value + item.price * qty;
  end loop;
  perform 1 from public.profiles where id=auth.uid() for update;
  if (select count(*) from public.orders where customer_id=auth.uid() and status not in ('delivered','cancelled','rejected')) >= 5 then raise exception 'Please complete your active orders before placing another'; end if;
  if exists(select 1 from public.orders where customer_id=auth.uid() and created_at>now()-interval '3 seconds') then raise exception 'Please wait before placing another order'; end if;
  insert into public.orders(customer_id,restaurant_id,subtotal,total,customer_name,phone,address,lat,lng,notes)
    values(auth.uid(),kitchen.id,subtotal_value,subtotal_value+3500,trim(payload->>'customer_name'),payload->>'phone',trim(payload->>'address'),latitude,longitude,coalesce(payload->>'notes','')) returning id into order_key;
  for line in select value from jsonb_array_elements(payload->'items') loop
    insert into public.order_items(order_id,menu_item_id,name,quantity,price)
      select order_key,id,name,(line->>'quantity')::integer,price from public.menu_items where id=(line->>'id')::uuid;
  end loop;
  insert into public.addresses(customer_id,address,lat,lng) values(auth.uid(),trim(payload->>'address'),latitude,longitude)
    on conflict(customer_id,address) do update set lat=excluded.lat,lng=excluded.lng;
  return order_key;
end $$;

-- Update save_restaurant for multi-area
create or replace function public.save_restaurant(payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare latitude double precision; longitude double precision;  begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='restaurant') then raise exception 'Restaurant account required'; end if;
  perform pg_advisory_xact_lock(841393);
  latitude := (payload->>'lat')::double precision; longitude := (payload->>'lng')::double precision;
  if latitude is null or longitude is null or latitude not between -90 and 90 or longitude not between -180 and 180 or not exists(select 1 from public.service_areas a where private.km(a.lat,a.lng,latitude,longitude)<=a.radius_km) then raise exception 'Kitchen must be inside the configured service area'; end if;
  if length(coalesce(payload->>'image',''))>2048 or (coalesce(payload->>'image','')<>'' and payload->>'image' !~ '^https://') then raise exception 'Use an HTTPS image URL'; end if;
  insert into public.restaurants(owner_id,name,slug,description,cuisine,address,hours,image,open,lat,lng,eta)
    values(auth.uid(),payload->>'name',payload->>'slug',coalesce(payload->>'description',''),payload->>'cuisine',payload->>'address',payload->>'hours',coalesce(payload->>'image',''),coalesce((payload->>'open')::boolean,false),latitude,longitude,coalesce((payload->>'eta')::integer,30))
    on conflict(owner_id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,cuisine=excluded.cuisine,address=excluded.address,hours=excluded.hours,image=excluded.image,open=excluded.open,lat=excluded.lat,lng=excluded.lng,eta=excluded.eta;
end $$;

-- Update private.dispatch for multi-area
create or replace function private.dispatch() returns void language plpgsql security definer set search_path = '' as $$
declare job record; chosen uuid; matching_radius double precision; begin
  perform pg_advisory_xact_lock(841392);
  update public.orders set status='ready_for_pickup', declined_rider_ids=array_append(declined_rider_ids,rider_id), rider_id=null, assigned_at=null, rider_accepted=false, updated_at=now()
    where status='rider_assigned' and not rider_accepted and assigned_at <= now()-interval '60 seconds';
  for job in select o.id,o.declined_rider_ids,r.lat,r.lng from public.orders o join public.restaurants r on r.id=o.restaurant_id where o.status='ready_for_pickup' order by o.created_at for update of o loop
    chosen := null;
    select coalesce(max(a.radius_km),12) into matching_radius from public.service_areas a where private.km(a.lat,a.lng,job.lat,job.lng)<=a.radius_km;
    select d.id into chosen from public.riders d where d.online and d.approved
      and d.location_updated_at > now()-interval '5 minutes'
      and not (d.id = any(job.declined_rider_ids))
      and private.km(job.lat,job.lng,d.lat,d.lng) <= matching_radius
      and not exists(select 1 from public.orders busy where busy.rider_id=d.id and busy.status in ('rider_assigned','picked_up'))
      order by private.km(job.lat,job.lng,d.lat,d.lng),d.id limit 1 for update skip locked;
    if chosen is not null then
      update public.orders set rider_id=chosen,status='rider_assigned',assigned_at=now(),rider_accepted=false,updated_at=now() where id=job.id;
    end if;
  end loop;
end $$;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='service_areas') then
    alter publication supabase_realtime add table public.service_areas;
  end if;
end $$;

commit;

-- ============================================================
-- 004_SECURITY.SQL - SECURITY HARDENING
-- ============================================================
begin;

do $$ begin
  if to_regclass('public.restaurants') is null or to_regclass('public.menu_items') is null
    or to_regclass('public.riders') is null or to_regclass('public.rider_locations') is null
    or to_regclass('public.service_areas') is null
    or to_regprocedure('private.is_admin()') is null then
    raise exception 'HomeBite base schema is missing or incompatible. Verify the project and apply migrations 001-003 before 004. Do not reset existing tables.';
  end if;
end $$;

create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(auth.jwt()->>'aal','')='aal2'
    and exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;

create table if not exists private.request_limits (
  scope text not null,
  bucket text not null,
  window_start bigint not null,
  hits integer not null check(hits>0),
  primary key(scope,bucket,window_start)
);
create index if not exists request_limits_expiry on private.request_limits(window_start);
revoke all on private.request_limits from public,anon,authenticated;

create or replace function private.take_quota(scope_key text,bucket_key text,maximum integer,seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare stamp bigint := floor(extract(epoch from clock_timestamp())/seconds)::bigint*seconds; used integer;
begin
  delete from private.request_limits where window_start < extract(epoch from clock_timestamp())-86400;
  insert into private.request_limits(scope,bucket,window_start,hits) values(scope_key,bucket_key,stamp,1)
  on conflict(scope,bucket,window_start) do update set hits=private.request_limits.hits+1
  where private.request_limits.hits < maximum returning hits into used;
  return used is not null;
end $$;
revoke all on function private.take_quota(text,text,integer,integer) from public,anon,authenticated;

create or replace function public.consume_location_quota(bucket text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required'; end if;
  if bucket is null or bucket !~ '^[a-f0-9]{64}$' then raise exception 'Invalid bucket'; end if;
  if not private.take_quota('location-global','all',600,60) then return false; end if;
  return private.take_quota('location-ip',bucket,30,60);
end $$;
revoke all on function public.consume_location_quota(text) from public,anon,authenticated;
grant execute on function public.consume_location_quota(text) to service_role;

create or replace function private.limit_mutation() returns trigger language plpgsql security definer set search_path='' as $$
declare action text := tg_table_name; maximum integer := 60;
begin
  if auth.uid() is null then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name='riders' then
    if new.online=false then return new; end if;
    maximum:=30;
  elsif tg_table_name='orders' and tg_op='INSERT' then action:='new-order'; maximum:=6;
  elsif tg_table_name='orders' then maximum:=120;
  elsif tg_table_name='service_areas' then maximum:=30;
  end if;
  if not private.take_quota(action,auth.uid()::text,maximum,60) then
    raise exception 'Too many changes. Wait a minute and try again.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.limit_mutation() from public,anon,authenticated;
do $$ declare target text; begin
  foreach target in array array['orders','riders','restaurants','menu_items','service_areas'] loop
    execute format('drop trigger if exists security_mutation_limit on public.%I',target);
    execute format('create trigger security_mutation_limit before insert or update or delete on public.%I for each row execute function private.limit_mutation()',target);
  end loop;
end $$;

create or replace function public.dispatch_orders() returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null and coalesce(auth.role(),'')<>'service_role' then raise exception 'Authentication required'; end if;
  if auth.uid() is not null and not private.take_quota('dispatch',auth.uid()::text,12,60) then raise exception 'Too many dispatch requests'; end if;
  perform private.dispatch();
end $$;

create table if not exists private.security_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_id text not null,
  created_at timestamptz not null default clock_timestamp()
);
revoke all on private.security_events from public,anon,authenticated;

create or replace function private.audit_admin_change() returns trigger language plpgsql security definer set search_path='' as $$
declare target text; action_name text;
begin
  if tg_table_name='service_areas' then
    target := case when tg_op='DELETE' then old.id::text else new.id::text end;
    action_name := 'service_area.' || lower(tg_op);
  elsif new.approved is distinct from old.approved then
    target := new.id::text; action_name := tg_table_name || case when new.approved then '.approved' else '.suspended' end;
  else return new;
  end if;
  insert into private.security_events(actor_id,action,target_id) values(auth.uid(),action_name,target);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.audit_admin_change() from public,anon,authenticated;
drop trigger if exists security_area_audit on public.service_areas;
create trigger security_area_audit after insert or update or delete on public.service_areas for each row execute function private.audit_admin_change();
drop trigger if exists security_restaurant_audit on public.restaurants;
create trigger security_restaurant_audit after update of approved on public.restaurants for each row execute function private.audit_admin_change();
drop trigger if exists security_rider_audit on public.riders;
create trigger security_rider_audit after update of approved on public.riders for each row execute function private.audit_admin_change();

create or replace function public.read_security_events() returns table(id bigint,actor_id uuid,action text,target_id text,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'Administrator MFA verification required'; end if;
  return query select e.id,e.actor_id,e.action,e.target_id,e.created_at from private.security_events e order by e.id desc limit 100;
end $$;
revoke all on function public.read_security_events() from public,anon,authenticated;
grant execute on function public.read_security_events() to authenticated;

commit;

-- ============================================================
-- 005_DIRECT_REGISTER.SQL - QUICK REGISTRATION (NO EMAIL VERIFY)
-- ============================================================
begin;

do $$ begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.restaurants') is null
     or to_regclass('public.riders') is null
     or to_regprocedure('private.is_admin()') is null then
    raise exception 'HomeBite base schema missing. Apply migrations 001-004 first.';
  end if;
end $$;

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
  if p_role not in ('customer','restaurant','rider') then
    raise exception 'Role must be customer, restaurant, or rider';
  end if;

  if exists(select 1 from auth.users where email = lower(p_email)) then
    raise exception 'An account with this email already exists';
  end if;
  if exists(select 1 from public.profiles where phone = p_phone) then
    raise exception 'An account with this phone number already exists';
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

  v_password_hash := crypt(p_password, gen_salt('bf', 10));

  insert into auth.users (
    instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', lower(p_email), v_password_hash, now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object(
      'name', trim(p_name),
      'phone', p_phone,
      'role', p_role,
      'vehicle', p_vehicle
    ),
    now(), now(), '', '', '', ''
  ) returning id into v_user_id;

  if p_role = 'restaurant' then
    insert into public.restaurants (
      owner_id, name, slug, description, cuisine, address, hours, image, open, lat, lng, eta, approved
    ) values (
      v_user_id,
      trim(p_name) || '''s Kitchen',
      lower(regexp_replace(trim(p_name), '[^a-z0-9]+', '-', 'g')) || '-' || substr(v_user_id::text, 1, 6),
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

commit;

-- ============================================================
-- FINAL VERIFICATION
-- ============================================================
select '=== SCHEMA DEPLOYED ===' as status;
select 'Tables:' as section, count(*) as count from information_schema.tables where table_schema='public';
select 'Service Areas:' as section, json_agg(row_to_json(t)) as data from (select * from public.service_areas) t;
select 'Custom Types:' as section, string_agg(typname, ', ') as types from pg_type where typname in ('app_role','order_status') and typnamespace=(select oid from pg_namespace where nspname='public');
select 'Public RPCs:' as section, string_agg(routine_name, ', ') as functions from information_schema.routines where routine_schema='public' and routine_name in ('place_order','transition_order','respond_assignment','update_rider','dispatch_orders','save_restaurant','save_menu_item','delete_menu_item','approve_partner','save_service_area','upsert_service_area','delete_service_area','direct_register','consume_location_quota','read_security_events');
select 'Private Functions:' as section, string_agg(routine_name, ', ') as functions from information_schema.routines where routine_schema='private';
select 'Realtime Tables:' as section, string_agg(tablename, ', ') as tables from pg_publication_tables where pubname='supabase_realtime' and schemaname='public';