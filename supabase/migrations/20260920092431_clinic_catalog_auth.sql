-- Clinic catalog/auth foundation.
-- Auth owns password hashes; public.users deliberately contains no password field.
create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  phone text,
  create_date timestamptz not null default timezone('utc', now()),
  active boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  constraint users_username_format check (
    username = lower(username)
    and username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'
  )
);

create index users_active_idx on public.users (active) where active;

create table public.admin (
  id uuid primary key references public.users(id) on delete cascade,
  create_date timestamptz not null default timezone('utc', now())
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  name_ar text not null check (char_length(btrim(name_ar)) between 1 and 200),
  name_en text not null check (char_length(btrim(name_en)) between 1 and 200),
  phone text,
  parent text,
  parent_id uuid references public.companies(id) on delete restrict,
  logo_url text,
  revision integer not null default 1 check (revision > 0),
  create_date timestamptz not null default timezone('utc', now())
);

create index companies_parent_id_idx on public.companies (parent_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 240),
  name_ar text not null check (char_length(btrim(name_ar)) between 1 and 240),
  name_en text not null check (char_length(btrim(name_en)) between 1 and 240),
  qty integer check (qty is null or qty > 0),
  size_value numeric(12, 3) not null check (size_value > 0),
  size_unit text not null check (size_unit in ('ml', 'g')),
  img_url text,
  discount numeric(5, 2) check (discount is null or discount between 0 and 100),
  final_price numeric(12, 2) not null check (final_price >= 0),
  product_url text check (
    product_url is null or product_url ~ '^https://[^[:space:]]+$'
  ),
  revision integer not null default 1 check (revision > 0),
  create_date timestamptz not null default timezone('utc', now())
);

create index products_company_id_idx on public.products (company_id);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name_ar text not null check (char_length(btrim(name_ar)) between 1 and 240),
  name_en text not null check (char_length(btrim(name_en)) between 1 and 240),
  name text not null check (char_length(btrim(name)) between 1 and 240),
  description_ar text not null check (char_length(btrim(description_ar)) between 1 and 2000),
  description_en text not null check (char_length(btrim(description_en)) between 1 and 2000),
  img_link text,
  revision integer not null default 1 check (revision > 0),
  create_date timestamptz not null default timezone('utc', now())
);

create index offers_company_id_idx on public.offers (company_id);

-- These helpers are the only authorization path used by catalog RLS. They read
-- live tables on every request and never trust JWT user_metadata/app metadata.
create or replace function private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.active = true
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.admin a
    join public.users u on u.id = a.id
    where a.id = auth.uid()
      and u.active = true
  );
$$;

revoke all on function private.is_active_member() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_active_member() to authenticated;
grant execute on function private.is_admin() to authenticated;

-- Every mutable record advances exactly one revision. Clients include the old
-- revision in the update predicate, so a stale edit affects zero rows.
create or replace function public.enforce_revision_increment()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.revision <> old.revision + 1 then
    raise exception using
      errcode = '40001',
      message = 'revision must increment by one';
  end if;
  return new;
end;
$$;

create trigger users_revision_trigger
before update on public.users
for each row execute function public.enforce_revision_increment();

create trigger companies_revision_trigger
before update on public.companies
for each row execute function public.enforce_revision_increment();

create trigger products_revision_trigger
before update on public.products
for each row execute function public.enforce_revision_increment();

create trigger offers_revision_trigger
before update on public.offers
for each row execute function public.enforce_revision_increment();

-- parent_id is authoritative. The legacy parent text is retained for import
-- compatibility, while this trigger rejects self-links and longer cycles.
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

create trigger companies_hierarchy_trigger
before insert or update of parent_id on public.companies
for each row execute function public.validate_company_hierarchy();

-- Expose only the rows needed by the browser. The admin edge function uses a
-- server-only key for management operations; it never grants client writes to
-- users/admin tables.
alter table public.users enable row level security;
alter table public.users force row level security;
alter table public.admin enable row level security;
alter table public.admin force row level security;
alter table public.companies enable row level security;
alter table public.companies force row level security;
alter table public.products enable row level security;
alter table public.products force row level security;
alter table public.offers enable row level security;
alter table public.offers force row level security;

create policy users_select_own on public.users
for select to authenticated
using ((select auth.uid()) = id);

create policy admin_select_own on public.admin
for select to authenticated
using ((select auth.uid()) = id);

create policy companies_member_select on public.companies
for select to authenticated
using ((select private.is_active_member()) or (select private.is_admin()));

create policy companies_admin_insert on public.companies
for insert to authenticated
with check ((select private.is_admin()));

create policy companies_admin_update on public.companies
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy companies_admin_delete on public.companies
for delete to authenticated
using ((select private.is_admin()));

create policy products_member_select on public.products
for select to authenticated
using ((select private.is_active_member()) or (select private.is_admin()));

create policy products_admin_insert on public.products
for insert to authenticated
with check ((select private.is_admin()));

create policy products_admin_update on public.products
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy products_admin_delete on public.products
for delete to authenticated
using ((select private.is_admin()));

create policy offers_member_select on public.offers
for select to authenticated
using ((select private.is_active_member()) or (select private.is_admin()));

create policy offers_admin_insert on public.offers
for insert to authenticated
with check ((select private.is_admin()));

create policy offers_admin_update on public.offers
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy offers_admin_delete on public.offers
for delete to authenticated
using ((select private.is_admin()));

-- Data API grants are explicit. No anon grants means anonymous catalog access
-- is denied even if a future policy is accidentally added.
revoke all on table public.users, public.admin, public.companies, public.products, public.offers from anon;
revoke all on table public.users, public.admin from authenticated;
grant select on table public.users to authenticated;
grant select on table public.companies, public.products, public.offers to authenticated;
grant insert, update, delete on table public.companies, public.products, public.offers to authenticated;
grant select, insert, update, delete on table public.users, public.admin to service_role;
grant select, insert, update, delete on table public.companies, public.products, public.offers to service_role;

-- Keep the private schema and helpers out of the exposed Data API surface.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
grant select on table public.admin to authenticated;

revoke execute on function public.enforce_revision_increment() from public, anon, authenticated;
revoke execute on function public.validate_company_hierarchy() from public, anon, authenticated;
grant execute on function public.enforce_revision_increment() to authenticated, service_role;
grant execute on function public.validate_company_hierarchy() to authenticated, service_role;
