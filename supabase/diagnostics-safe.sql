-- ============================================================
-- HOMEBITE SUPABASE DIAGNOSTIC SCRIPT (SAFE VERSION)
-- Handles missing tables gracefully
-- ============================================================

-- 1. LIST ALL TABLES IN PUBLIC SCHEMA
select table_name, table_type
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- 2. CHECK CORE TABLES EXISTENCE
select 
  'profiles' as table_name, to_regclass('public.profiles') is not null as exists
union all select 'restaurants', to_regclass('public.restaurants') is not null
union all select 'menu_items', to_regclass('public.menu_items') is not null
union all select 'riders', to_regclass('public.riders') is not null
union all select 'rider_locations', to_regclass('public.rider_locations') is not null
union all select 'orders', to_regclass('public.orders') is not null
union all select 'order_items', to_regclass('public.order_items') is not null
union all select 'order_events', to_regclass('public.order_events') is not null
union all select 'addresses', to_regclass('public.addresses') is not null
union all select 'service_area', to_regclass('public.service_area') is not null
union all select 'service_areas', to_regclass('public.service_areas') is not null;

-- 3. CHECK service_area TABLE (safe - won't error if missing)
do $$
begin
  if to_regclass('public.service_area') is not null then
    raise notice 'service_area table EXISTS';
    raise notice 'Row count: %', (select count(*) from public.service_area);
    raise notice 'Data: %', (select json_agg(row_to_json(t)) from (select * from public.service_area) t);
  else
    raise notice 'service_area table DOES NOT EXIST';
  end if;
end $$;

-- 4. CHECK service_areas TABLE (safe)
do $$
begin
  if to_regclass('public.service_areas') is not null then
    raise notice 'service_areas table EXISTS';
    raise notice 'Row count: %', (select count(*) from public.service_areas);
    raise notice 'Data: %', (select json_agg(row_to_json(t)) from (select * from public.service_areas) t);
  else
    raise notice 'service_areas table DOES NOT EXIST';
  end if;
end $$;

-- 5. CHECK RLS POLICIES ON SERVICE AREA TABLES
select schemaname, tablename, policyname, permissive, roles, cmd, qual
from pg_policies
where tablename in ('service_area', 'service_areas')
order by tablename, policyname;

-- 6. CHECK GRANTS ON SERVICE AREA TABLES
select grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public' and table_name in ('service_area', 'service_areas')
order by table_name, grantee;

-- 7. CHECK IF RPC FUNCTIONS EXIST
select routine_name, routine_type
from information_schema.routines
where routine_schema = 'public' 
  and routine_name in ('save_service_area', 'upsert_service_area', 'delete_service_area', 'place_order', 'save_restaurant', 'dispatch_orders')
order by routine_name;

-- 8. CHECK PRIVATE SCHEMA FUNCTIONS
select routine_name, routine_type
from information_schema.routines
where routine_schema = 'private'
  and routine_name in ('is_admin', 'dispatch', 'sync_primary_area', 'take_quota', 'limit_mutation', 'km', 'new_user', 'can_read_order', 'audit_admin_change')
order by routine_name;

-- 9. CHECK CUSTOM TYPES
select typname, typcategory
from pg_type
where typname in ('app_role', 'order_status')
  and typnamespace = (select oid from pg_namespace where nspname = 'public');

-- 10. CHECK REALTIME PUBLICATION
select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('service_area', 'service_areas', 'orders', 'restaurants', 'menu_items', 'riders', 'rider_locations')
order by tablename;