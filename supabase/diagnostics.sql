-- Read-only. Share the results to diagnose the schema mismatch. No customer rows or secrets.
select expected.name as expected_table, to_regclass('public.' || expected.name) as installed
from unnest(array['profiles','restaurants','menu_items','orders','riders','rider_locations','service_area','service_areas']) as expected(name);

select table_name,column_name,data_type,udt_name,is_nullable,column_default
from information_schema.columns where table_schema='public' order by table_name,ordinal_position;

select c.relname as table_name,c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by c.relname;
