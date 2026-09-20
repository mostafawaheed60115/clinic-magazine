import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../migrations/20260920092431_clinic_catalog_auth.sql", import.meta.url), "utf8");

for (const table of ["users", "admin", "companies", "products", "offers"]) {
  assert.match(migration, new RegExp(`create table public\\.${table}\\b`), `missing ${table} table`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `${table} RLS is not enabled`);
}
assert.match(migration, /references auth\.users\(id\)/);
assert.match(migration, /users_username_format/);
assert.match(migration, /size_unit in \('ml', 'g'\)/);
assert.match(migration, /product_url is null or product_url ~ '\^https:\/\//);
assert.match(migration, /validate_company_hierarchy/);
assert.match(migration, /a\.id <> new\.id/);
assert.match(migration, /c\.parent_id = new\.id or not c\.parent_id = any\(a\.path\)/);
assert.match(migration, /company hierarchy cannot contain a self-parent/);
assert.match(migration, /revision must increment by one/);
assert.match(migration, /revoke all on table public\.users, public\.admin, public\.companies, public\.products, public\.offers from anon/);
assert.match(migration, /revoke all on table public\.users, public\.admin from authenticated/);

console.log("Clinic Supabase schema contract passed");
