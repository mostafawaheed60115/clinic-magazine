---
version: alpha
colors:
  background: "#fcf7fc"
  primary: "#75af8e"
  foreground: "#1e3328"
  accent: "#439a62"
  blush: "#dcebe0"
  rose: "#2f7448"
  muted: "#4f6558"
  paper: "#fffdf9"
  line: "#d4ded6"
  danger: "#963f45"
  dangerHover: "#713136"
  primaryHover: "#2f7448"
  onGreenMuted: "#1e3328"
  scrollbar: "#75af8e"
  inactive: "#96a39a"
  footerLine: "#3f5a49"
  white: "#ffffff"
  coverShadow: "#439a6226"
  toastShadow: "#1e332826"
  dialogShadow: "#1e332833"
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

User-approved offer cover plus catalog. An editorial cosmetics campaign spread on a soft orchid canvas and botanical green, with tactile paper depth and crisp dimensional accents. Public pages combine brand expression and catalog utility; admin prioritizes operations. No generic SaaS metrics hero. The signature is a wide photographic campaign cover with a restrained layered/parallax-like hover and purposeful slide movement.

The 2026-09-20 extension places a branded sign-in surface before the magazine. Preserve the green action palette, fonts and supplied logo while the global canvas uses #fcf7fc: a desktop campaign image accompanies a calm, focused login form; on phones the form takes priority. Company search is prominent after sign-in. Product detail pages expose image and product links without making purchase claims. Admin management shares the same controls and tokens with denser content and a navigable narrow-screen layout.

The operations-desk refresh adds a visible brand identity (mark plus localized name), per-brand CSV actions, and an image-library utility. CSV workflows are preview-first and explain row-level errors before applying changes. The image library keeps filenames and resulting public URLs together so URLs can be copied or downloaded as a mapping file without losing context. Admin is a calm studio desk: clearly grouped navigation, expressive but legible status, dimensional collection tiles, and responsive tables/forms that retain their full workflow on phones.

## Colors

Use the supplied palette. Deep green text on the orchid canvas and parchment surfaces. Shamrock green carries actions; muted teal and sage support surfaces. CSS tokens in src/styles/tokens.css own runtime values and map directly to this document.

## Typography

Self-host Cairo for Arabic and Manrope for Latin. Fluid display sizes; Arabic has generous line height, no added tracking. Prices have tabular numerals.

## Layout

Maximum content width 1320px, fluid gutters 20–64px. Logo physically left regardless of direction. Desktop campaign image and copy share a wide surface. Mobile stacks campaign copy and imagery. Brand tiles are quiet typographic signatures with the name always visible beside the mark, product cards emphasize photographs. Admin uses natural document scrolling with bounded table overflow; the mobile sidebar becomes a scrollable navigation rail while content remains width-safe.

## Elevation & Depth

Use a three-step elevation scale owned by `--elevation-1`, `--elevation-2`, and `--elevation-3`: quiet lift for interactive controls, soft offset shadows for primary surfaces, and deeper shadow only for hero/sign-in layers. Pair the shadow with the `--edge-highlight` token. The shared navigation is a tactile paper control rail: active links sit slightly raised, with restrained 3D hover/press feedback on hover-capable devices. Small 3D rotations and translate-Z are also reserved for campaign/product imagery, the brand identity plaque, and collection tiles; never make content wobble or require hover to read it.

## Shapes

16px campaign and card corners, 8px inputs, round icon controls. Face-and-heartbeat logo is flat vector geometry.

## Components

Shared buttons, forms, dialogs, search, pagination and feedback. All interactive targets at least 44px high. Native selects intentionally accept OS popup geometry. Carousel has buttons, dots, keyboard and swipe; no autoplay. Motion communicates hierarchy/state: a brief brand-hero arrival, tactile navigation and image hover/press feedback, and no perpetual animation. Honor reduced motion and avoid 3D transforms on touch-first layouts.

## Do's and Don'ts

Use real raster product compositions for offers. Label seed data as demo. Do not invent commercial claims or use emoji icons. Support visible focus, reduced motion and RTL. Global scrollbars, caret and selection use palette tokens. All layout/motion colors flow from CSS tokens.
