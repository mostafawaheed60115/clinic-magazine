# Clinic Magazine

A bilingual, authenticated cosmetics catalog for Clinic, Asyut. Vanilla JavaScript, Vite and CSS Modules preserve the supplied pink palette. Arabic is the default; English changes direction while the logo stays top-left. Ordering and checkout are outside this product.

## Local setup

Requires Node.js 22.12+ or 24+.

```powershell
npm ci
Copy-Item .env.example .env.local
# Configure the Supabase URL and publishable key in .env.local.
npm run dev
```

The selected Supabase project is `online catalog` (`twllyczdtmitsupfvjgx`). Its name remains unchanged at the user's request. Frontend configuration uses a public publishable key; service-role keys must never use a `VITE_` variable or enter the browser bundle. The selected project URL and publishable key are also safe browser defaults in `src/cloud.js`, so a Vercel build remains connected when environment variables were not added; `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` override those defaults for another project.

For a separate local interface preview, leave Supabase variables empty and explicitly set `VITE_DEMO_MODE=true`. Demo accounts and sample catalog data are only for development; see the sign-in screen for preview credentials. Real authentication failures never fall back to demo mode. Never use a real password in preview mode.

```powershell
npm run build
npm run preview
```

`dist` contains the static site. Serve it over HTTP; ES modules do not work by double-clicking `index.html`. Hash routes work on ordinary static hosting. The build includes compiled `/admin.html` and `/admin/index.html` entry points, so direct `/admin` access works on hosts that do not apply SPA rewrites. No public frontend deployment is included.

## Access and pages

The entry screen requires a username and password. Supabase Auth stores password hashes; application tables contain profiles and admin membership, never plaintext passwords. Accounts are provisioned by an administrator; there is no public registration screen. Database row-level security separately enforces active-member reads and administrator writes.

- `#/offers`: manually controlled, swipeable offer cover.
- `#/brands`: searchable company directory with pagination.
- `#/brand/<id>`: company products, sizes, pack quantities, discounts and authoritative EGP final prices.
- Product links: shareable catalog detail and an optional external HTTPS product link.
- `#/admin`: companies, products, offers and user access management.

Search and pagination are kept in route parameters. The catalog supports Arabic and English, keyboard controls and reduced-motion preferences. No crossed-out price is invented from a discount.

## Data and images

Companies support phone, an optional parent company, and `logo_url`. Products use `company_id`, numeric `size_value` with `size_unit` (`ml` or `g`), optional units-per-pack `qty`, optional percentage `discount`, authoritative `final_price`, and optional `product_url`. Offers also use `company_id`. Revision checks reject stale catalog edits.

Admin image selection creates a preview and converts raster images to WebP in the browser. Saving uploads the WebP directly to the Supabase Storage `clinic-images` bucket through the authenticated Supabase client; Storage RLS allows writes only for active administrators. The resulting public object URL is saved in Supabase. Uploads cannot complete until the bucket migration is applied; a failure keeps the editor available for correction.

See [backend setup](supabase/README.md) for migrations, account provisioning, Storage policies and Edge Functions used for user management. The original supplied palette and logo assets are preserved. Refined SVGs and the supplied PNG logo are in `public/assets`. Preview brands, products, prices and offer artwork are explicitly illustrative and are not automatically inserted into the live database.

See [UI-UX-AUDIT.md](UI-UX-AUDIT.md) for the sizing, spacing, component, responsive, and accessibility review with captured desktop and mobile evidence.

## Code and checks

- `src/auth.js`, `cloud.js`: authentication and Supabase transport.
- `src/store.js`, `demo-store.js`: live and explicit preview repositories.
- `src/upload.js`: image preparation and authenticated upload.
- `src/main.js`, `pages.js`, `admin.js`: routes, magazine and management UI.
- `src/ui.js`, `i18n.js`, `styles/`: shared controls, translations and scoped styling.
- `supabase/`: schema, policies, server functions and backend setup.
- `PRODUCT.md`, `DESIGN.md`, `UX-CONTRACT.md`: implementation decisions.

```powershell
npm test
npm run format:check
npm run build
```

Playwright uses installed Microsoft Edge. Tests run against explicit demo configuration on a separate port. `VERIFICATION.md` records completed checks and configuration limits; it distinguishes local preview tests from live backend tests. Secrets, local environment files and temporary provisioning artifacts are excluded from delivery archives.

## Vercel Deployment

The project includes `vercel.json` pre-configured with SPA route rewrites, immutable asset caching, and HTTP security headers.

1. Import the repository in [Vercel](https://vercel.com).
2. Framework preset: **Vite** (Build command: `npm run build`, Output directory: `dist`).
3. Set the following **Environment Variables** in project settings:
   - `VITE_SUPABASE_URL`: `https://twllyczdtmitsupfvjgx.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: `sb_publishable_z4d37t9sfGZyrXRquZCXDA_5UfPVqZ5`
   - `VITE_DEMO_MODE`: `false`

# clinic-magazine
