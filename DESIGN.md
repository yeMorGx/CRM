---
name: Prospecta
description: CRM de prospecção preciso e sereno, com foco em leitura rápida e dados reais.
colors:
  background: "#0a0b0b"
  rail-background: "#0d0e0e"
  surface: "#151616"
  surface-soft: "#111212"
  surface-raised: "#1b1c1c"
  text: "#f0f2ed"
  muted: "#8b908b"
  faint: "#606560"
  accent: "#8ee343"
  accent-hover: "#b2f276"
  danger: "#f06464"
  line: "rgba(255,255,255,0.08)"
  line-strong: "rgba(255,255,255,0.14)"
  auth-background: "#050807"
  auth-surface: "#07100d"
  auth-text: "#edf5f0"
  auth-muted: "#879f92"
typography:
  display:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "clamp(29px, 3vw, 38px)"
    fontWeight: 620
    lineHeight: 1.08
    letterSpacing: "-0.04em"
  page-title:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "clamp(29px, 3.5vw, 41px)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-1.2px"
  title:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 620
    lineHeight: 1.3
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  compact: "8px"
  control: "10px"
  navigation: "12px"
  card: "17px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "21px"
  page: "42px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#11130f"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  dashboard-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "19px"
  search-input:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.compact}"
    height: "38px"
---

# Design System: Prospecta

## Overview

**Creative North Star: “CRM de prospecção preciso e sereno.”**

Prospecta is a compact, data-first workspace for moving real leads through a sales pipeline. The interface should feel calm and capable: a near-black canvas, clear text contrast, concise labels, and a single vivid green action color. The design is intentionally quiet so lead details, statuses, and next actions remain the focus.

The CRM shell is the visual authority for authenticated pages. Login and onboarding are separate dark surfaces, not alternate dashboard themes: preserve their media-led layout, green-gray input treatment, and white primary action. The light declarations at global `:root` do not override the dark tokens inside `.crm-shell`.

**Key Characteristics:**
- Dense enough for daily operations, with deliberate whitespace between major sections.
- Flat, border-led surfaces; depth comes from small tonal changes, not stacked shadows or blur.
- Lime is reserved for primary actions, active navigation, and meaningful progress/status.
- Empty states explain the next useful action and never imply records that do not exist.

## Colors

The dashboard palette is charcoal and neutral gray, with lime as its one strong accent. Muted reds and stage-specific colors carry status meaning only.

### Primary
- **Prospecta Lime** (`#8ee343`): primary actions, active navigation, progress, and selected data emphasis.
- **Lime Hover** (`#b2f276`): restrained hover state for primary actions.

### Neutral
- **Carbon Canvas** (`#0a0b0b`): authenticated workspace background.
- **Rail Charcoal** (`#0d0e0e`): fixed desktop navigation rail.
- **Panel Charcoal** (`#151616`): standard card and panel surface.
- **Soft Charcoal** (`#111212`): inputs and inset regions.
- **Raised Charcoal** (`#1b1c1c`): secondary controls and elevated-in-tone surfaces.
- **Fog White** (`#f0f2ed`): primary dashboard text.
- **Quiet Gray** (`#8b908b`): secondary labels and descriptions.
- **Ash Gray** (`#606560`): tertiary metadata and disabled emphasis.
- **Hairline** (`rgba(255,255,255,0.08)`): separators and quiet card outlines.
- **Strong Hairline** (`rgba(255,255,255,0.14)`): control outlines and stronger boundaries.

### Semantic
- **Signal Red** (`#f06464`): errors and negative status only; do not use as a decorative accent.
- **Auth Black** (`#050807`) and **Auth Green-Black** (`#07100d`): login/onboarding canvas and panel.
- **Auth White** (`#edf5f0`) and **Auth Sage** (`#879f92`): authentication copy hierarchy.

**The One Accent Rule.** Use lime to identify action or state, not as a large decorative wash. Keep normal dividers and secondary text neutral.

## Typography

**Display Font:** Geist, with Arial and sans-serif fallbacks.  
**Body Font:** Geist, with Arial and sans-serif fallbacks.  
**Page-title exception:** Georgia, then Times New Roman, for the legacy serif module-page heading.  
**Label/Mono Font:** Geist for labels; use the loaded Geist Mono only when a real code or identifier presentation needs it.

**Character:** UI text is compact, direct, and readable at a glance. The overview greeting is a strong sans-serif line; internal module titles retain the site's restrained serif treatment. Do not replace either with a generic Inter-first stack.

### Hierarchy
- **Display** (620, `clamp(29px, 3vw, 38px)`, 1.08): overview greeting and signed user name.
- **Page title** (500, `clamp(29px, 3.5vw, 41px)`, 1.05): module headings that use the serif exception.
- **Title** (620, 16px, 1.3): dashboard card headings.
- **Body** (400, 13px, 1.5): explanatory copy and general interface text.
- **Label** (600, 9–11px, about 1.4): KPI labels, table headers, metadata, and navigation context.

**The Real-Data Rule.** Counts, activity copy, and lead names must come from the live application state. In previews, use the true empty state or clearly label illustrative content.

## Layout

The desktop CRM uses an 82px fixed icon rail, a 75px top bar, and a fluid content canvas. The overview content caps at 1360px and starts with the greeting/action, then four pipeline KPIs, a wide pipeline card beside a narrower activity/health stack, secondary statistics, recent leads, and operational sections. Use asymmetric columns where the content warrants them; do not force every section into the same card grid.

The page rhythm is built from compact 8–15px component gaps, roughly 21–23px card insets, and 42px desktop page gutters. Keep tables information-dense, with low-contrast dividers and horizontal scrolling on narrow screens rather than shrinking labels until they are unreadable.

At 1120px, KPI tiles reduce to two columns and the main dashboard split stacks. At 760px, the desktop rail becomes a labeled navigation drawer, the top bar tightens, and the content gutter reduces to 16px. At 390px, KPI text tightens again. Calendar and lead-table layouts may retain horizontal scrolling when their information structure needs it.

## Elevation & Depth

This is a nearly flat, border-separated system. Distinguish panels using the charcoal surface steps and thin white-alpha borders. Cards usually have no shadow. Reserve the soft green shadow under a primary button and the darker broad shadow for dialogs/popovers; do not apply either treatment to every panel. Avoid blanket glassmorphism and large blurred glows.

## Shapes

Dashboard cards use 17px corners; compact lead cards and navigation use 12px; primary controls use 10px; small inputs and controls use 8px. Status chips and the health ring are pill/circular. Keep borders thin and continuous; hover should adjust the surface slightly, not invert the row to a bright block.

## Components

- **Primary button:** lime fill, near-black bold text, 10px corners, compact 10px × 14px padding. Hover brightens slightly and can rise by 1px; focus must remain visible.
- **Secondary button:** raised charcoal fill, neutral text, quiet stronger border. Lime appears on hover only when it clarifies interactivity.
- **Dashboard cards:** panel charcoal, 17px radius, subtle 8% white outline, no routine shadow. KPI values are large and tightly tracked; supporting text stays muted.
- **Inputs/search:** soft charcoal fill, stronger hairline, compact 8px radius, clear focused border/ring. Authentication `LabelInput` is a distinct 64px outline control with a lifted label; preserve its animation and dark green-black field.
- **Navigation:** desktop icon rail with 40px targets and 12px corners. The active item uses a translucent lime surface and lime icon; on mobile, expose labels in the drawer.
- **Badges/status:** compact rounded pills with semantic color at low opacity. The stage color communicates the lead's real status; do not invent status categories.
- **Login CTA:** white fill on the dark split auth card. Do not recolor it as the dashboard's lime action.

## Do's and Don'ts

### Do
- Keep the dashboard's information hierarchy compact, left-aligned, and data-first.
- Use asymmetric grids for pipeline, activity, and supporting information.
- Preserve real-data loading, empty, error, and success states.
- Use understated hover/focus treatments and maintain keyboard-visible focus.
- Keep the profile/chat identity and lead data distinct; display only source-backed details.
- Respect reduced-motion preferences for animation.

### Don't
- Don't create sample leads, fake revenue, invented activity, placeholder people, or fabricated counts.
- Don't use purple gradients, glass on every surface, or generic centered-hero compositions.
- Don't turn dashboard sections into three interchangeable cards; the existing four KPI cards are justified by distinct pipeline metrics.
- Don't make row hover bright white or use high-contrast borders as decoration.
- Don't use Inter as the default font or replace the login's white CTA with dashboard styling.
