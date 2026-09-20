# Clinic magazine

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-approved vanilla HTML, CSS Modules, JavaScript ES modules and Vite. Supabase Auth/Postgres, Supabase Storage, and authenticated Edge Functions for user management. Hash routes remain portable, with a direct /admin entry supported by host fallback.

## Users

Wholesale cosmetics buyers in Asyut, Egypt, browsing brands, offers and pack quantities on mobile and desktop.

## Product Purpose

A bilingual login-protected B2B magazine with offers, searchable companies and linked product details. Administrators manage catalog content and approved buyer accounts.

## Capabilities and Constraints

Arabic default with English switching. EGP prices. Username/password login precedes all catalog access. Supabase Auth stores password hashes; application users and admin membership are separate from credentials. Admin-created accounts are the default; no public self-registration. Companies support optional parent relationships as requested on 2026-09-20. Quantity means units per pack. Discounts are percentages; final price is authoritative. Uploaded raster images are converted to WebP in the browser, uploaded directly to the admin-protected Supabase Storage bucket, and their public links stored in Supabase. Product pages have shareable internal links and optional admin-entered external links (default while clarification is pending). No ordering or checkout.

## Infrastructure Decisions

The user confirmed the existing Supabase project online catalog (twllyczdtmitsupfvjgx) in Nova Solutions, and then explicitly deferred its proposed rename. Its public schema and Auth users were empty at inspection. User authorized an initial admin account; its supplied password must never be recorded in project docs/source. The `clinic-images` Storage bucket migration must be applied before live image uploads work. Never mistake local integration code or explicit preview mode for a verified live connection. All remote changes use the confirmed project.

## Brand Commitments

User supplied six-color pink palette and temporary green logo. Approved refinement preserves face and heartbeat in a flat pink/charcoal SVG. Logo stays physically top-left in both locales. Approved offer-cover-and-catalog composition and code-first workflow.

## Evidence on Hand

assets/color palette.txt and assets/logo_temp.jpg. No real catalog, offers or prices supplied; all seed content must be labeled sample and must not be silently seeded into the live database. Preview mode is explicit and separate from production.

## Product Principles

Image-led discovery; quickly find brands; clear pack sizes and prices; honest sample content; consistent bilingual controls.

## Accessibility & Inclusion

Target WCAG 2.2 AA, keyboard alternatives to swipe, reduced motion, RTL and readable touch layouts.
