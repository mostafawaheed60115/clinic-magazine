# Clinic Supabase backend

The migration creates Auth-linked `public.users` and `public.admin` membership tables plus the private catalog tables `companies`, `products`, and `offers`. Passwords are stored only by Supabase Auth. The deterministic Auth email alias is `${username}@users.clinic.invalid`; the browser should collect and send the username, then pass the alias only to Auth login.

The catalog Data API is closed to `anon`. An active `public.users` row can read the catalog; only a current active `public.admin` row can insert, update, or delete catalog records. Authorization helpers run as `SECURITY DEFINER` in the unexposed `private` schema with an explicit `search_path`, and they query current membership rows rather than JWT metadata. Every mutable row has a `revision`; update requests should include `.eq('revision', expectedRevision)` and set `revision` to `expectedRevision + 1`.

## Edge function contracts

`clinic-admin-users` requires a real Supabase JWT in `Authorization: Bearer ...` and an active admin membership. JSON requests use one of these actions:

```ts
type AdminUserRequest =
  | { action: "list"; page?: number; pageSize?: number }
  | { action: "create"; username: string; name: string; phone?: string; password: string; active?: boolean }
  | { action: "update" | "edit" | "set_active"; userId: string; expectedRevision: number; name?: string; phone?: string; active?: boolean }
  | { action: "reset_password"; userId: string; password: string };

type AdminUserResponse =
  | { ok: true; users: UserSummary[] }
  | { ok: true; user: UserSummary }
  | { ok: true; userId: string }
  | { ok: false; error: { code: string; message: string } };
```

`create` never creates an admin membership. The ordinary user endpoint does not change any admin membership, which prevents self-disable and last-admin races; admin membership changes remain a separate controlled operation. Lists are paged at 100 rows by default (`hasMore` indicates another request). Auth errors and stale revisions use stable error codes; password values are never returned or persisted in public tables.

`clinic-upload` accepts `POST multipart/form-data` with a `file` field. The file must be a structurally valid RIFF/WEBP image no larger than 5 MB. It uploads under the server-owned `clinic/<uuid>.webp` prefix using R2 credentials held in Edge Function secrets and returns:

```ts
type UploadResponse =
  | { ok: true; url: string; key: `clinic/${string}.webp` }
  | { ok: false; error: { code: string; message: string } };
```

The browser never supplies an object key. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, and `ALLOWED_ORIGINS` as function secrets. If `ALLOWED_ORIGINS` is omitted, only local Vite ports 5173 and 4173 on loopback are accepted for development; configure explicit HTTPS origins before production use.

## First administrator

Do not put an administrator password or service key in the repository. The preferred customer-run path is the environment-only script:

```powershell
$env:SUPABASE_URL = 'https://<project-ref>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<secret held outside the repo>'
$env:CLINIC_BOOTSTRAP_USERNAME = 'admin'
$env:CLINIC_BOOTSTRAP_PASSWORD = '<temporary password held outside the repo>'
$env:CLINIC_BOOTSTRAP_NAME = 'Clinic Administrator'
npx deno run --allow-env supabase/scripts/bootstrap-admin.ts
```

The script aborts if any admin already exists and cleans up the newly created Auth user if profile or membership insertion fails. `clinic-bootstrap-admin/index.ts` is an optional one-time Edge Function alternative: deploy it with `verify_jwt=false`, a high-entropy token whose SHA-256 digest is stored as `CLINIC_BOOTSTRAP_TOKEN_SHA256`, `CLINIC_BOOTSTRAP_ENABLED=true`, and the normal Supabase service secret. Invoke it once with the initial credentials in the request body, then disable the flag and remove or replace the function with a 410 stub immediately. Never log or commit the token or password.
