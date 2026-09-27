-- Keep the survey creator foreign key efficient for user deletion and joins.
create index event_surveys_created_by_idx
  on public.event_surveys (created_by);
