-- Support the stable ordered pagination used when the client refreshes the
-- catalog and when administrators review event submissions.
create index if not exists companies_name_en_id_idx
  on public.companies (name_en, id);

create index if not exists products_name_en_id_idx
  on public.products (name_en, id);

create index if not exists offers_name_en_id_idx
  on public.offers (name_en, id);

create index if not exists event_surveys_started_at_id_idx
  on public.event_surveys (started_at desc, id);

create index if not exists event_requests_submitted_at_id_idx
  on public.event_requests (submitted_at desc, id);
