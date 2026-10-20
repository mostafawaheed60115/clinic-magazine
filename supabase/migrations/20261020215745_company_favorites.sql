-- Store each active member's saved brands separately and enforce ownership in
-- Postgres so clients cannot read or change another user's favorites.
create table public.company_favorites (
  user_id uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  create_date timestamptz not null default timezone('utc', now()),
  primary key (user_id, company_id)
);

create index company_favorites_company_id_idx
  on public.company_favorites (company_id);

alter table public.company_favorites enable row level security;
alter table public.company_favorites force row level security;

create policy company_favorites_select_own on public.company_favorites
for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_member())
);

create policy company_favorites_insert_own on public.company_favorites
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_active_member())
);

create policy company_favorites_delete_own on public.company_favorites
for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_active_member())
);

revoke all on table public.company_favorites from public, anon, authenticated;
grant select, insert, delete on table public.company_favorites to authenticated;
grant select, insert, update, delete on table public.company_favorites to service_role;
