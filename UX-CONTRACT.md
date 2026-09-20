# Clinic interaction contract

## Sources
PRODUCT.md records the user-approved requirements including the 2026-09-20 authenticated catalog extension. Supabase Auth handles credentials; current users/admin records determine authorization. An explicit development preview may use isolated local data, but production never falls back to it on configuration or network failure.

## Canonical UI Map
| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | src/admin.js field builder | UX-CONTRACT.md | Native OS popup | tests/magazine.spec.js |
| Form | src/admin.js editor | UX-CONTRACT.md | Create and edit | tests/magazine.spec.js |
| Scrollbar | src/styles/tokens.css | DESIGN.md | Global baseline | tests/magazine.spec.js |
| Toast | src/ui.js notify | UX-CONTRACT.md | Success and info | tests/magazine.spec.js |
| CRUD | src/store.js and src/admin.js | PRODUCT.md | Three collections | tests/magazine.spec.js |
| Dialog | src/ui.js ask | UX-CONTRACT.md | Delete, reset, discard | tests/magazine.spec.js |

## Flows
Initial route is sign-in for unauthenticated visitors; direct protected links retain a safe internal return target. Hash routes include /offers, /brands, /brand/:id, /product/:id, /admin, /admin/:collection and create/edit children. /admin pathname enters the same admin flow. Non-admin accounts cannot access admin APIs or UI. Query and page are route parameters. Search respects IME composition; clear is immediate. Lists paginate and clamp out-of-range pages. Locale switch retains route and query. Signing out clears catalog caches and history navigation cannot recover protected content without authentication.

## Data and storage
Supabase owns production companies, products, offers, users and admin membership. RLS denies anonymous catalog access and authorizes active members to read; only admins may write catalog content. Company parent and product/offer foreign keys have indexes. Revision checks prevent stale overwrites. Referenced companies cannot be deleted. No plaintext application password columns. R2 holds only uploaded images; Supabase stores image links. Failed upload or database write preserves the editor with an actionable error; saving must not report success until the link is persisted. IndexedDB exists only in explicitly selected demo mode and never substitutes for failed Supabase calls.

## Form and feedback
Arabic and English names/descriptions are editable. Required names, positive sizes, nonnegative prices and integer pack quantity; discount 0–100. Optional product links must be HTTPS. Local JPEG/PNG/WebP files are decoded, bounded in dimensions and converted to WebP before upload; server endpoint authenticates admin status and validates payload size and WebP structure. R2 credentials stay in Edge Function secrets. Errors are field-associated. Password fields are masked with show/hide controls; password values are never returned by the API or stored in application tables. Admin users management creates or disables buyers and resets passwords through a privileged server endpoint.

## Destructive actions
Delete, disable-account and demo-only reset require app-owned dialogs naming consequences. Cancel initially focused. No production reset-data action. Dirty editors guard in-app navigation and actual page unload. Save failure does not lose input. No self-disable or self-service admin promotion. Production Auth sessions are validated before privileged operations.

## States and accessibility
Initial session check, login errors, no records, no results, image fallback, unknown route, upload/network failure and conflict use localized messages and recovery controls. Dialogs restore focus; route navigation focuses heading. Semantic links/buttons, keyboard controls, reduced motion, localized EGP/number formatting. Demo notice appears only in explicit preview mode. Login remains accessible at narrow widths; no catalog data is fetched before membership is confirmed.
