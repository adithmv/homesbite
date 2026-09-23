-- ============================================================
-- SUPABASE NUKE SCRIPT - COMPLETE WIPE (FIXED)
-- Run this FIRST in Supabase SQL Editor to clean everything
-- Then run complete_schema.sql
-- ============================================================
-- WARNING: This DESTROYS ALL DATA in public/private schemas
-- Does NOT touch auth.users, storage, or Supabase internal schemas

-- 1. Drop all triggers first (to avoid dependency errors)
do $$
declare r record;
begin
  for r in
    select event_object_schema, event_object_table, trigger_name
    from information_schema.triggers
    where trigger_schema = 'public'
  loop
    execute format('drop trigger if exists %I on %I.%I', r.trigger_name, r.event_object_schema, r.event_object_table);
  end loop;
end $$;

-- 2. Drop all policies (RLS)
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 3. Drop all tables in public schema (CASCADE removes FKs, indexes, etc.)
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
end $$;

-- 4. Drop all functions in public schema (fixed: use explicit columns)
do $$
declare
  r record;
  func_name text;
  func_args text;
begin
  for r in
    select p.proname as routine_name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    func_name := r.routine_name;
    func_args := r.args;
    execute format('drop function if exists public.%I(%s)', func_name, func_args);
  end loop;
end $$;

-- 5. Drop all functions in private schema (fixed)
do $$
declare
  r record;
  func_name text;
  func_args text;
begin
  for r in
    select p.proname as routine_name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
  loop
    func_name := r.routine_name;
    func_args := r.args;
    execute format('drop function if exists private.%I(%s)', func_name, func_args);
  end loop;
end $$;

-- 6. Drop private schema (and everything in it)
drop schema if exists private cascade;

-- 7. Drop custom types in public schema
do $$
declare r record;
begin
  for r in
    select typname from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e'  -- enum types only
  loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;
end $$;

-- 8. Remove all tables from realtime publication
do $$
declare r record;
begin
  for r in
    select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
  loop
    execute format('alter publication supabase_realtime drop table if exists public.%I', r.tablename);
  end loop;
end $$;

-- 9. Verify cleanup
select '=== CLEANUP COMPLETE ===' as status;
select 'Remaining public tables:' as check, count(*) as count from pg_tables where schemaname='public';
select 'Remaining public functions:' as check, count(*) as count from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
select 'Remaining private functions:' as check, count(*) as count from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private';
select 'Remaining public types:' as check, count(*) as count from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e';
select 'Realtime tables:' as check, string_agg(tablename, ', ') as tables from pg_publication_tables where pubname='supabase_realtime' and schemaname='public';

-- Note: auth.users, auth.roles, storage.objects, etc. are PRESERVED
-- If you want to wipe auth users too, run in Supabase Dashboard: Authentication → Users → "Delete all users"