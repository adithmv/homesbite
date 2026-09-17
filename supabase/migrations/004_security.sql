-- Run only after 001, 002 and 003 on the matching HomeBite database.
-- Additive and safe to rerun. Never drops or resets application tables.
begin;
do $$ begin
  if to_regclass('public.restaurants') is null or to_regclass('public.menu_items') is null
    or to_regclass('public.riders') is null or to_regclass('public.rider_locations') is null
    or to_regclass('public.service_areas') is null
    or to_regprocedure('private.is_admin()') is null then
    raise exception 'HomeBite base schema is missing or incompatible. Verify the project and apply migrations 001-003 before 004. Do not reset existing tables.';
  end if;
end $$;

-- This predicate is used by both RLS and all admin mutation RPCs.
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

-- Separate committed request: denied HTTP calls cannot roll back their quota consumption.
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

-- Database triggers cannot be bypassed by calling the Supabase RPC directly.
-- These count committed mutations; failed transactions roll their counters back.
create or replace function private.limit_mutation() returns trigger language plpgsql security definer set search_path='' as $$
declare action text := tg_table_name; maximum integer := 60;
begin
  if auth.uid() is null then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name='riders' then
    -- Always allow a rider to stop sharing their location.
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

-- Limit repeated dispatcher RPCs without disrupting the scheduled service-role call.
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
