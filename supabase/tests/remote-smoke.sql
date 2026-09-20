-- Rollback-only verification for the Clinic migration.
-- Replace the two UUID placeholders with existing Auth-linked rows before running
-- in the Supabase SQL editor as postgres. This script never commits catalog rows.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

-- The Data API surface is explicit: anon cannot read catalog tables, while the
-- authenticated role can reach rows only through RLS.
do $$
begin
  if has_table_privilege('anon', 'public.companies', 'SELECT')
     or has_table_privilege('anon', 'public.products', 'SELECT')
     or has_table_privilege('anon', 'public.offers', 'SELECT') then
    raise exception 'anon catalog privilege unexpectedly granted';
  end if;
  if not has_table_privilege('authenticated', 'public.companies', 'SELECT') then
    raise exception 'authenticated catalog privilege missing';
  end if;
  if not has_table_privilege('authenticated', 'public.admin', 'SELECT') then
    raise exception 'authenticated own-admin privilege missing';
  end if;
end;
$$;

select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('users', 'admin', 'companies', 'products', 'offers')
order by relname;

-- Temporary hierarchy rows prove that a three-node cycle is rejected.
insert into public.companies (id, name, name_ar, name_en)
values
  ('00000000-0000-0000-0000-0000000000a1', 'Smoke A', 'Smoke A', 'Smoke A'),
  ('00000000-0000-0000-0000-0000000000a2', 'Smoke B', 'Smoke B', 'Smoke B'),
  ('00000000-0000-0000-0000-0000000000a3', 'Smoke C', 'Smoke C', 'Smoke C');
update public.companies set parent_id = '00000000-0000-0000-0000-0000000000a1', revision = 2
where id = '00000000-0000-0000-0000-0000000000a2' and revision = 1;
update public.companies set parent_id = '00000000-0000-0000-0000-0000000000a2', revision = 2
where id = '00000000-0000-0000-0000-0000000000a3' and revision = 1;

do $$
begin
  begin
    update public.companies
    set parent_id = '00000000-0000-0000-0000-0000000000a3', revision = 2
    where id = '00000000-0000-0000-0000-0000000000a1' and revision = 1;
    raise exception 'three-node hierarchy cycle was accepted';
  exception when check_violation then
    null;
  end;
end;
$$;

-- Stale revision updates affect zero rows; a matching revision advances by one.
set local role authenticated;
select set_config('request.jwt.claim.sub', '<CLINIC_ADMIN_UUID>', true);

do $$
declare
  changed integer;
begin
  update public.companies
  set name = 'stale update', revision = 99
  where id = '00000000-0000-0000-0000-0000000000a1' and revision = 99;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'stale update unexpectedly changed a row'; end if;

  update public.companies
  set name = 'current update', revision = 2
  where id = '00000000-0000-0000-0000-0000000000a1' and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'current revision update did not change one row'; end if;
end;
$$;

select id, username, active
from public.users
where id = '<CLINIC_ADMIN_UUID>'::uuid;
select id from public.admin where id = '<CLINIC_ADMIN_UUID>'::uuid;

rollback;
