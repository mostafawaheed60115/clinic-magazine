-- Existing brands stay ordinary until an administrator marks them exclusive.
alter table public.companies
  add column is_exclusive boolean not null default false;

-- A single settings row keeps the consultation destination editable without
-- exposing an unauthenticated write path or storing it in the client bundle.
create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  whatsapp_phone text not null check (
    whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'
  ),
  revision integer not null default 1 check (revision > 0)
);

insert into public.app_settings (id, whatsapp_phone)
values (1, '+201062270083');

create trigger app_settings_revision_trigger
before update on public.app_settings
for each row execute function public.enforce_revision_increment();

alter table public.app_settings enable row level security;
alter table public.app_settings force row level security;

create policy app_settings_member_select on public.app_settings
for select to authenticated
using ((select private.is_active_member()) or (select private.is_admin()));

create policy app_settings_admin_update on public.app_settings
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

revoke all on table public.app_settings from public, anon, authenticated;
grant select, update on table public.app_settings to authenticated;
grant select, update on table public.app_settings to service_role;
