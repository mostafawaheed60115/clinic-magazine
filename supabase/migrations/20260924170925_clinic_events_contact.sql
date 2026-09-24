-- Contact details are optional until Clinic supplies the actual phone numbers.
alter table public.app_settings
  add column customer_service_phone text check (customer_service_phone is null or customer_service_phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column contact_phone text check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  description text not null check (char_length(btrim(description)) between 1 and 3000),
  start_date date not null,
  end_date date not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  constraint events_dates_ordered check (end_date >= start_date)
);

create index events_start_date_idx on public.events (start_date desc);
create trigger events_revision_trigger before update on public.events
for each row execute function public.enforce_revision_increment();

create table public.event_participants (
  event_id uuid not null references public.events(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  username text not null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  phone text not null check (char_length(btrim(phone)) between 7 and 30),
  registered_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_participants_user_id_idx on public.event_participants (user_id);

-- The username snapshot always comes from the authenticated account.
create function public.set_event_participant_username()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  select username into new.username from public.users where id = new.user_id and active;
  if new.username is null then
    raise exception 'An active account is required to register';
  end if;
  return new;
end;
$$;

create trigger event_participant_username_trigger
before insert on public.event_participants
for each row execute function public.set_event_participant_username();

alter table public.events enable row level security;
alter table public.events force row level security;
alter table public.event_participants enable row level security;
alter table public.event_participants force row level security;

create policy events_member_select on public.events for select to authenticated
using ((select private.is_active_member()));
create policy events_admin_insert on public.events for insert to authenticated
with check ((select private.is_admin()));
create policy events_admin_update on public.events for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy events_admin_delete on public.events for delete to authenticated
using ((select private.is_admin()));

create policy event_participants_select on public.event_participants for select to authenticated
using ((select private.is_admin()) or ((select private.is_active_member()) and user_id = (select auth.uid())));
create policy event_participants_insert on public.event_participants for insert to authenticated
with check (
  (select private.is_active_member())
  and user_id = (select auth.uid())
  and exists (
    select 1 from public.events e
    where e.id = event_id
      and (now() at time zone 'Africa/Cairo')::date between e.start_date and e.end_date
  )
);

revoke all on public.events, public.event_participants from public, anon, authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert on public.event_participants to authenticated;
grant all on public.events, public.event_participants to service_role;
