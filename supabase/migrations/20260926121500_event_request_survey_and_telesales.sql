-- Editable telesales and complaints destinations for the shared contact bar.
alter table public.app_settings
  add column telesales_whatsapp_phone text not null default '+201200186286'
    check (telesales_whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column complaints_phone text not null default '+201005758214'
    check (complaints_phone ~ '^\+[1-9][0-9]{7,14}$');

-- Survey rounds are retained so administrators can close one and later open
-- another without losing its submitted event requests.
create table public.event_surveys (
  id uuid primary key default gen_random_uuid(),
  is_open boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  revision integer not null default 1 check (revision > 0),
  constraint event_surveys_closed_at check (
    (is_open and ended_at is null) or (not is_open and ended_at is not null)
  )
);

create unique index event_surveys_one_open_idx
  on public.event_surveys (is_open) where is_open;
create trigger event_surveys_revision_trigger
  before update on public.event_surveys
  for each row execute function public.enforce_revision_increment();

create table public.event_requests (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.event_surveys(id) on delete restrict,
  user_id uuid references public.users(id) on delete set null,
  pharmacy_name text not null check (char_length(btrim(pharmacy_name)) between 1 and 200),
  pharmacy_code text not null check (char_length(btrim(pharmacy_code)) between 1 and 80),
  pharmacy_address text not null check (char_length(btrim(pharmacy_address)) between 1 and 500),
  doctor_name text not null check (char_length(btrim(doctor_name)) between 1 and 160),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  preferred_date date not null,
  starts_at time not null,
  ends_at time not null,
  company_ids uuid[] not null default '{}',
  company_names jsonb not null default '[]'::jsonb
    check (jsonb_typeof(company_names) = 'array'),
  activities text[] not null default '{}'
    check (
      activities <@ array['wheel', 'scratch_cards', 'analysis_discount', 'pharmacist_training']::text[]
      and cardinality(activities) <= 4
      and array_position(activities, null::text) is null
    ),
  submitted_at timestamptz not null default now(),
  constraint event_requests_time_ordered check (ends_at > starts_at),
  constraint event_requests_company_ids_no_null check (
    array_position(company_ids, null::uuid) is null
  )
);

create index event_requests_survey_submitted_idx
  on public.event_requests (survey_id, submitted_at desc, id);
create index event_requests_user_id_idx on public.event_requests (user_id);

-- Store a name snapshot alongside the selected brand IDs so historical request
-- rows stay readable if a brand is renamed or removed later.
create function public.snapshot_event_request_companies()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  matched_count integer;
begin
  if cardinality(new.company_ids) = 0 then
    new.company_names := '[]'::jsonb;
    return new;
  end if;

  select count(distinct c.id)
    into matched_count
    from public.companies as c
   where c.id = any (new.company_ids);

  if matched_count <> cardinality(new.company_ids) then
    raise exception 'invalid_company' using errcode = '23503';
  end if;

  select coalesce(
      jsonb_agg(
        jsonb_build_object('id', c.id, 'name_ar', c.name_ar, 'name_en', c.name_en)
        order by array_position(new.company_ids, c.id)
      ),
      '[]'::jsonb
    )
    into new.company_names
    from public.companies as c
   where c.id = any (new.company_ids);

  return new;
end;
$$;

create trigger event_requests_company_snapshot_trigger
  before insert on public.event_requests
  for each row execute function public.snapshot_event_request_companies();

alter table public.event_surveys enable row level security;
alter table public.event_surveys force row level security;
alter table public.event_requests enable row level security;
alter table public.event_requests force row level security;

create policy event_surveys_member_select on public.event_surveys
  for select to authenticated
  using (
    (select private.is_admin())
    or ((select private.is_active_member()) and is_open)
  );
create policy event_surveys_admin_insert on public.event_surveys
  for insert to authenticated
  with check ((select private.is_admin()));
create policy event_surveys_admin_update on public.event_surveys
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy event_requests_owner_or_admin_select on public.event_requests
  for select to authenticated
  using (
    (select private.is_admin())
    or ((select private.is_active_member()) and user_id = (select auth.uid()))
  );
create policy event_requests_member_insert on public.event_requests
  for insert to authenticated
  with check (
    (select private.is_active_member())
    and user_id = (select auth.uid())
    and exists (
      select 1 from public.event_surveys as survey
       where survey.id = survey_id and survey.is_open
    )
  );

revoke all on table public.event_surveys, public.event_requests from public, anon, authenticated;
grant select, insert, update on table public.event_surveys to authenticated;
grant select, insert on table public.event_requests to authenticated;
grant all on table public.event_surveys, public.event_requests to service_role;

revoke all on function public.snapshot_event_request_companies() from public, anon, authenticated;
grant execute on function public.snapshot_event_request_companies() to authenticated, service_role;
