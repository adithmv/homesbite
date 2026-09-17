-- Run after 002_service_area.sql. Preserves existing area and active orders. Safe to rerun.
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

-- Keep the legacy read endpoint usable during rolling deployments.
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
  -- Lock and price menu rows on the server. No client-supplied prices or totals are trusted.
  for line in select value from jsonb_array_elements(payload->'items') loop
    if (line->>'quantity') !~ '^[0-9]+$' then raise exception 'Invalid quantity'; end if;
    qty := (line->>'quantity')::integer;
    select * into item from public.menu_items where id=(line->>'id')::uuid and restaurant_id=kitchen.id and available for share;
    if not found or qty is null or qty not between 1 and 20 then raise exception 'Item unavailable or invalid quantity'; end if;
    subtotal_value := subtotal_value + item.price * qty;
  end loop;
  -- Serialize checkout per customer to reject concurrent double submissions.
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

create or replace function private.dispatch() returns void language plpgsql security definer set search_path = '' as $$
declare job record; chosen uuid; matching_radius double precision; begin
  perform pg_advisory_xact_lock(841392);

  -- Expired offers are released before choosing another rider. Declined riders are excluded for this order.
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
