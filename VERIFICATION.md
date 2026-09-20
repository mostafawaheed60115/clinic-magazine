# Verification

- Production build: passed (`npm run build`).
- Formatting: passed (`npm run format:check`).
- Playwright on Microsoft Edge: **10 tests passed**.
- Automated axe scans: no WCAG A/AA violations detected on public offers, brand directory, product catalog, demo sign-in and the product editor.
- Premium UI strict audit: zero findings, errors or warnings.
- DESIGN.md lint: zero errors. Advisory orphan-token warnings reflect documented CSS-owned tokens rather than generated component references.
- Impeccable detector: executed once. Corrected the width animation and font-name drift; documented the supporting palette and corner sizes.
- Desktop Arabic/English and mobile Arabic visually inspected. No horizontal overflow at 390px; the long Arabic-name scenario also passes at 320px. Reduced motion and themed scrollbars verified.

## Behavior covered

Carousel buttons, indicator selection, keyboard and pointer swipe; public and admin search, pagination, route history, unknown routes, image fallback; create/edit/delete for brands, products and offers; image file decoding and size/type validation; IndexedDB persistence; deletion dependency checks; reset; masked demo password; unsaved navigation; failed writes; cross-tab revision conflicts; no-results and empty states; safe text escaping; locale dictionary parity.

The browser’s native image drag initially swallowed carousel pointerup; preventing native drag resolved it. Immediate local search now keeps its URL query during fast edit/delete actions. All tests were rerun successfully after those changes.

## Limits

This is a frontend demo with local browser data, not a deployed production service. Desktop Edge and emulated narrow viewports were tested; real iOS/Android devices and manual screen-reader testing were not performed. Automated accessibility scans do not establish complete WCAG conformance. Original data assets supplied were only a logo and palette; catalog content and generated product photography are illustrative.
