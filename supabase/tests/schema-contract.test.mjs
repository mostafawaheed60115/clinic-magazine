import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../migrations/20260920092431_clinic_catalog_auth.sql",
    import.meta.url,
  ),
  "utf8",
);
const storageMigration = await readFile(
  new URL("../migrations/20260920112430_clinic_storage.sql", import.meta.url),
  "utf8",
);
const consultationMigration = await readFile(
  new URL(
    "../migrations/20260923202639_exclusive_brands_consultation_settings.sql",
    import.meta.url,
  ),
  "utf8",
);
const eventsMigration = await readFile(
  new URL(
    "../migrations/20260924170925_clinic_events_contact.sql",
    import.meta.url,
  ),
  "utf8",
);
const eventRequestMigration = await readFile(
  new URL(
    "../migrations/20260927193913_event_request_survey_and_telesales.sql",
    import.meta.url,
  ),
  "utf8",
);
const readIndexesMigration = await readFile(
  new URL(
    "../migrations/20260927193918_catalog_read_indexes.sql",
    import.meta.url,
  ),
  "utf8",
);
const ordersMigration = await readFile(
  new URL(
    "../migrations/20260927205319_clinic_orders_and_reports.sql",
    import.meta.url,
  ),
  "utf8",
);
const orderReliabilityMigration = await readFile(
  new URL(
    "../migrations/20260927210312_order_submission_idempotency.sql",
    import.meta.url,
  ),
  "utf8",
);

for (const table of ["users", "admin", "companies", "products", "offers"]) {
  assert.match(
    migration,
    new RegExp(`create table public\\.${table}\\b`),
    `missing ${table} table`,
  );
  assert.match(
    migration,
    new RegExp(`alter table public\\.${table} enable row level security`),
    `${table} RLS is not enabled`,
  );
}
assert.match(migration, /references auth\.users\(id\)/);
assert.match(migration, /users_username_format/);
assert.match(migration, /size_unit in \('ml', 'g'\)/);
assert.match(migration, /product_url is null or product_url ~ '\^https:\/\//);
assert.match(migration, /validate_company_hierarchy/);
assert.match(migration, /a\.id <> new\.id/);
assert.match(
  migration,
  /c\.parent_id = new\.id or not c\.parent_id = any\(a\.path\)/,
);
assert.match(migration, /company hierarchy cannot contain a self-parent/);
assert.match(migration, /revision must increment by one/);
assert.match(
  migration,
  /revoke all on table public\.users, public\.admin, public\.companies, public\.products, public\.offers from anon/,
);
assert.match(
  migration,
  /revoke all on table public\.users, public\.admin from authenticated/,
);
assert.match(storageMigration, /insert into storage\.buckets/);
assert.match(storageMigration, /'clinic-images'/);
assert.match(storageMigration, /file_size_limit/);
assert.match(storageMigration, /image\/webp/);
assert.match(storageMigration, /private\.is_admin\(\)/);
assert.match(storageMigration, /name like 'clinic\/%'/);
assert.match(storageMigration, /for insert to authenticated/);
assert.match(storageMigration, /for update to authenticated/);
assert.match(storageMigration, /for delete to authenticated/);
assert.match(
  consultationMigration,
  /add column is_exclusive boolean not null default false/,
);
assert.match(consultationMigration, /create table public\.app_settings/);
assert.match(
  consultationMigration,
  /alter table public\.app_settings enable row level security/,
);
assert.match(consultationMigration, /app_settings_member_select/);
assert.match(consultationMigration, /app_settings_admin_update/);
assert.match(
  consultationMigration,
  /with check \(\(select private\.is_admin\(\)\)\)/,
);
assert.match(
  consultationMigration,
  /grant select, update on table public\.app_settings to authenticated/,
);
for (const table of ["events", "event_participants"]) {
  assert.match(
    eventsMigration,
    new RegExp(`create table public\\.${table}\\b`),
  );
  assert.match(
    eventsMigration,
    new RegExp(`alter table public\\.${table} enable row level security`),
  );
}
assert.match(eventsMigration, /primary key \(event_id, user_id\)/);
assert.match(eventsMigration, /user_id = \(select auth\.uid\(\)\)/);
assert.match(eventsMigration, /private\.is_active_member\(\)/);
assert.match(eventsMigration, /event_participants_insert/);
assert.match(eventRequestMigration, /telesales_whatsapp_phone/);
assert.match(eventRequestMigration, /complaints_phone/);
assert.match(eventRequestMigration, /create table public\.event_surveys\b/);
assert.match(eventRequestMigration, /create table public\.event_requests\b/);
assert.match(eventRequestMigration, /event_surveys_one_open_idx/);
assert.match(eventRequestMigration, /private\.is_active_member\(\)/);
assert.match(eventRequestMigration, /user_id = \(select auth\.uid\(\)\)/);
assert.match(eventRequestMigration, /survey\.is_open/);
assert.match(eventRequestMigration, /company_names jsonb/);
assert.match(eventRequestMigration, /pharmacist_training/);
assert.match(eventRequestMigration, /event_requests_owner_or_admin_select/);
assert.match(eventRequestMigration, /event_requests_member_insert/);
assert.match(
  eventRequestMigration,
  /alter table public\.event_requests enable row level security/,
);
for (const table of ["companies", "products", "offers"]) {
  assert.match(
    readIndexesMigration,
    new RegExp(`create index if not exists ${table}_name_en_id_idx`),
  );
}
assert.match(readIndexesMigration, /event_surveys_started_at_id_idx/);
assert.match(readIndexesMigration, /event_requests_submitted_at_id_idx/);
for (const table of ["orders", "order_items"]) {
  assert.match(
    ordersMigration,
    new RegExp(`create table public\\.${table}\\b`),
  );
  assert.match(
    ordersMigration,
    new RegExp(`alter table public\\.${table} enable row level security`),
  );
  assert.match(
    ordersMigration,
    new RegExp(`alter table public\\.${table} force row level security`),
  );
}
assert.match(ordersMigration, /orders_owner_or_admin_select/);
assert.match(ordersMigration, /order_items_owner_or_admin_select/);
assert.match(
  ordersMigration,
  /create function public\.place_order\(p_items jsonb\)/,
);
assert.match(ordersMigration, /private\.is_active_member\(\)/);
assert.match(ordersMigration, /for share/);
assert.match(ordersMigration, /create function public\.update_order_status/);
assert.match(
  ordersMigration,
  /create function public\.get_admin_order_reports/,
);
assert.match(ordersMigration, /order_row\.status = 'fulfilled'/);
assert.match(ordersMigration, /'Africa\/Cairo'/);
assert.match(
  ordersMigration,
  /revoke all on function public\.place_order\(jsonb\) from public, anon, authenticated/,
);
assert.match(
  ordersMigration,
  /grant execute on function public\.get_admin_order_reports\(date, date\)\s+to authenticated/,
);
assert.match(
  orderReliabilityMigration,
  /drop index if exists public\.order_items_order_id_idx/,
);
assert.match(
  orderReliabilityMigration,
  /create unique index orders_user_submission_id_idx/,
);
assert.match(
  orderReliabilityMigration,
  /create or replace function public\.place_order\([\s\S]*p_submission_id uuid/,
);
assert.match(
  orderReliabilityMigration,
  /on conflict \(user_id, submission_id\) do nothing/,
);
assert.match(
  orderReliabilityMigration,
  /drop function public\.place_order\(jsonb\)/,
);

console.log("Clinic Supabase schema contract passed");
