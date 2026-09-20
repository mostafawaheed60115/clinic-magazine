-- Follow-up hardening for the already-applied Clinic catalog migration.
-- This is intentionally additive/idempotent so it can be applied safely after
-- the initial schema migration.
grant usage on schema private to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin'
      and policyname = 'admin_select_own'
  ) then
    create policy admin_select_own on public.admin
    for select to authenticated
    using ((select auth.uid()) = id);
  end if;
end;
$$;

revoke all on table public.users, public.admin from authenticated;
grant select on table public.users, public.admin to authenticated;
grant select, insert, update, delete on table public.users, public.admin to service_role;
grant select, insert, update, delete on table public.companies, public.products, public.offers to service_role;

create or replace function public.validate_company_hierarchy()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  has_cycle boolean;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception using
      errcode = '23514',
      message = 'company hierarchy cannot contain a self-parent';
  end if;

  with recursive ancestors(id, path) as (
    select c.parent_id, array[new.id, c.parent_id]
    from public.companies c
    where c.id = new.parent_id
    union all
    select c.parent_id, a.path || c.parent_id
    from public.companies c
    join ancestors a on c.id = a.id
    where c.parent_id is not null
      and a.id <> new.id
      and (c.parent_id = new.id or not c.parent_id = any(a.path))
  )
  select exists (select 1 from ancestors where id = new.id)
  into has_cycle;

  if has_cycle then
    raise exception using
      errcode = '23514',
      message = 'company hierarchy cannot contain a cycle';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_revision_increment() from public, anon, authenticated;
revoke execute on function public.validate_company_hierarchy() from public, anon, authenticated;
grant execute on function public.enforce_revision_increment() to authenticated, service_role;
grant execute on function public.validate_company_hierarchy() to authenticated, service_role;
