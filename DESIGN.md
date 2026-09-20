---
version: alpha
colors:
  background: "#fcf0fc"
  primary: "#fac3f6"
  foreground: "#2b262b"
  accent: "#fc9af6"
  blush: "#ffd5d9"
  rose: "#cc5a79"
  muted: "#675363"
  paper: "#fffaff"
  line: "#e5d8e3"
  danger: "#982544"
  dangerHover: "#73203b"
  primaryHover: "#51414f"
  onPinkMuted: "#574150"
  scrollbar: "#aa839f"
  inactive: "#bba4b7"
  footerLine: "#5c4e5b"
  white: "#ffffff"
  coverShadow: "#aa739012"
  toastShadow: "#2b262b26"
  dialogShadow: "#2b262b33"
typography:
  arabic:
    fontFamily: "Cairo Variable, sans-serif"
  latin:
    fontFamily: "Manrope Variable, sans-serif"
rounded:
  card: "16px"
  control: "8px"
  compact: "12px"
  panel: "10px"
  thumbnail: "5px"
  indicator: "4px"
  pill: "20px"
spacing:
  base: "8px"
components:
  button:
    height: "44px"
---

# Clinic visual identity

## Overview
User-approved offer cover plus catalog. A pink cosmetics campaign spread anchored by a precise wholesale index. Public pages combine brand expression and catalog utility; admin prioritizes operations. No generic SaaS metrics hero. The signature is a wide photographic campaign cover with restrained slide movement.

The 2026-09-20 extension places a branded sign-in surface before the magazine. Preserve the existing palette, fonts and refined logo: a desktop campaign image accompanies a calm, focused login form; on phones the form takes priority. Company search is prominent after sign-in. Product detail pages expose image and product links without making purchase claims. Admin management shares the same controls and tokens with denser content and a navigable narrow-screen layout.

## Colors
Use the supplied palette. Charcoal text on pink and pale surfaces. Rose is decorative, never small text on pale pink. CSS tokens in src/styles/tokens.css own runtime values and map directly to this document.

## Typography
Self-host Cairo for Arabic and Manrope for Latin. Fluid display sizes; Arabic has generous line height, no added tracking. Prices have tabular numerals.

## Layout
Maximum content width 1320px, fluid gutters 20–64px. Logo physically left regardless of direction. Desktop campaign image and copy share a wide surface. Mobile stacks campaign copy and imagery. Brand tiles are quiet typographic signatures, product cards emphasize photographs. Admin uses natural document scrolling with bounded table overflow.

## Elevation & Depth
Soft offset campaign shadow only. Other surfaces use subtle borders without competing shadows.

## Shapes
16px campaign and card corners, 8px inputs, round icon controls. Face-and-heartbeat logo is flat vector geometry.

## Components
Shared buttons, forms, dialogs, search, pagination and feedback. All interactive targets at least 44px high. Native selects intentionally accept OS popup geometry. Carousel has buttons, dots, keyboard and swipe; no autoplay.

## Do's and Don'ts
Use real raster product compositions for offers. Label seed data as demo. Do not invent commercial claims or use emoji icons. Support visible focus, reduced motion and RTL. Global scrollbars, caret and selection use palette tokens. All layout/motion colors flow from CSS tokens.
