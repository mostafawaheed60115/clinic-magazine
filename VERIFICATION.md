# Verification

- Production build: passed (`npm run build`).
- Formatting: passed (`npm run format:check`).
- Playwright on Microsoft Edge: **14 tests passed** (including direct `/admin` entry).
- Built static preview: `/admin` and `/admin/` both render the login flow from compiled entry points; the redesigned login was reviewed at mobile and 1440px desktop sizes with no horizontal overflow.
- Automated axe scans: no WCAG A/AA violations detected on public offers, brand directory, product catalog, demo sign-in and the product editor.
- Premium UI strict audit: zero findings, errors or warnings.
- DESIGN.md lint: zero errors. Advisory orphan-token warnings reflect documented CSS-owned tokens rather than generated component references.
- Impeccable detector: executed once. Corrected the width animation and font-name drift; documented the supporting palette and corner sizes.
- Desktop Arabic/English and mobile Arabic visually inspected. No horizontal overflow at 390px; the long Arabic-name scenario also passes at 320px. Reduced motion and themed scrollbars verified.

## Behavior covered

Carousel buttons, indicator selection, keyboard and pointer swipe; public and admin search, pagination, route history, unknown routes, image fallback; create/edit/delete for brands, products and offers; image file decoding and size/type validation; IndexedDB persistence; deletion dependency checks; reset; masked demo password; unsaved navigation; failed writes; cross-tab revision conflicts; no-results and empty states; safe text escaping; locale dictionary parity.

The browser’s native image drag initially swallowed carousel pointerup; preventing native drag resolved it. Immediate local search now keeps its URL query during fast edit/delete actions. All tests were rerun successfully after those changes.

## Limits

The frontend has a live Supabase adapter and an explicit local demo adapter. The catalog migration and follow-up hardening SQL were applied to the selected `online catalog` project and verified before the current MCP session lost mutation access. The Supabase Storage migration, Edge Function deployment, and first-admin provisioning still require an authenticated Supabase deployment session; no live credentials are stored in this repository. Until the Storage migration and admin setup are completed, live image upload reports a clear storage-configuration error and preserves the form. Desktop Edge and emulated narrow viewports were tested; real iOS/Android devices and manual screen-reader testing were not performed. Automated accessibility scans do not establish complete WCAG conformance. Original data assets supplied were only a logo and palette; catalog content and generated product photography are illustrative.
