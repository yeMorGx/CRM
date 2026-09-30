# Design QA — Prospecta

## Dashboard

source visual truth path: `C:\Users\GABRIE~1\AppData\Local\Temp\codex-clipboard-94538745-0b95-4084-94ba-0b9ca08cebbb.png` (supplied dark dashboard reference, 2732 × 4096 px)
implementation screenshot path: browser-rendered CUA full-page capture of `http://localhost:3000/` after authenticating with the configured Supabase user
viewport: 935 × 672 CSS px, 1x density; full-page content measured at 920 × 1888 px
state: `/`, authenticated, empty Supabase leads table

### Full-view comparison

The dashboard now follows the supplied visual language: near-black canvas, compact icon rail, muted gray type, green status accent, rounded surface cards, top KPI strip, pipeline distribution, activity rail, secondary metrics, and lower operational sections. The reference is a finance dashboard, while Prospecta is a lead CRM, so the visible labels and values intentionally use real CRM concepts instead of invented revenue, invoices, customers, or workspaces.

### Data integrity and states

- Empty panels explicitly say when no leads or tasks exist; no demo records are rendered.
- KPI values, pipeline bars, health percentage, recent activity, and stage counts derive from the authenticated user's Supabase leads.
- “Adicionar lead” opens the existing working modal, while the Leads navigation continues to the existing table/kanban flow.
- Sidebar labels remain available through accessible names and tooltips on desktop, and expand into text navigation on mobile.

### Findings

No actionable P0, P1, or P2 visual findings remain for the dashboard at the captured state. The image-to-code comparison is intentionally a style translation rather than a literal copy of the reference's finance data.

source visual truth path: `C:\Users\GABRIE~1\AppData\Local\Temp\codex-clipboard-e6daf22d-6217-4207-aa6a-3b00bb57e25d.png`
component reference: `https://bencho.dev/blocks/confirm?c=label-input&theme=dark`
state references: `C:\Users\GABRIE~1\AppData\Local\Temp\codex-clipboard-d22caa9f-262b-4885-88dd-cd1506fbca70.png` (focused) and `C:\Users\GABRIE~1\AppData\Local\Temp\codex-clipboard-6f7c8884-655e-44d8-bf07-4862c518f680.png` (empty)
implementation screenshot path: browser-rendered CUA capture of `http://127.0.0.1:3000/login` (captured at 1280 × 900; no local screenshot export was available from the in-app browser)
viewport: 1280 × 900 CSS px, desktop, 1x density
source dimensions: 1052 × 664 px
implementation dimensions: 1280 × 900 px browser capture; card compared as the content region
density normalization: source inspected at native pixels; implementation inspected at 1x browser capture; browser chrome excluded from comparison
state: `/login`, empty form, video loaded, Supabase intentionally unconfigured

## Full-view comparison

The implementation preserves the reference's core composition: near-black page, centered rounded split card, visual media on the left, dark auth panel on the right, restrained borders, compact form controls, and a light primary action. The reference is a signup screen while the implementation is the requested private login, so copy and field count intentionally differ. The supplied MP4 replaces the static hero visual and is rendered as a muted, looping background video with a generated poster fallback. The login fields use the supplied `LabelInput` interaction: the label lifts into the outline and the focused outline darkens in place.

## Focused region comparison

The split card and login panel were inspected at full browser scale. The left media crop fills its panel without stretching; the right panel keeps a readable hierarchy and clear focus states. No additional focused region was required because the input, password visibility control, error state, and primary action are all visible at the comparison scale.

## Required fidelity surfaces

- Fonts and typography: compact sans-serif UI hierarchy matches the reference mood; the main heading uses a restrained weight and tight tracking.
- Spacing and layout rhythm: rounded card, equal visual/form split, inset controls, and generous panel padding are aligned to the reference structure.
- Colors and visual tokens: near-black background, deep green-black panel, muted green-gray secondary text, thin translucent borders, and off-white CTA are preserved.
- Image quality and asset fidelity: the requested remote MP4 is used directly as video; `/public/login-hero.png` is only a fallback poster.
- Copy and content: copy is intentionally Portuguese and reflects a private two-user CRM; no fabricated business records, metrics, tasks, messages, or workspace labels are rendered.

## Findings

No actionable P0, P1, or P2 visual findings remain.

## Comparison history

- Initial implementation used a static light login card. Replaced it with a dark split layout and a real visual media region.
- The user then supplied a new MP4. Replaced the left image content with the supplied remote video and retained the generated image only as poster fallback.
- Rechecked the revised browser-rendered login at the same desktop viewport. No actionable P0/P1/P2 findings remained.
- Compared the empty and filled `LabelInput` states against the supplied Bencho reference. Corrected the empty state so the outline stays whole and the top gap appears only when the label rises.
- Matched the reference field proportions more closely: large centered empty labels, 64px control height, 14px corners, and compact raised labels in the focused state.
- Applied the supplied ring-motion rules: every outline path darkens on focus, the top gap retracts from the center with a 320ms dash transition, and the raised label uses the reference transform.
- Added autofill-aware label and gap styling so browser-managed email/password values do not remain visually in the empty state.

## Implementation checklist

- [x] Split-card login composition
- [x] Responsive mobile stacking
- [x] Real video source with muted autoplay, loop, and poster fallback
- [x] Working email/password authentication flow
- [x] Floating-label outline interaction on email and password fields
- [x] Password visibility control
- [x] Empty-state and configuration-safe behavior
- [x] No demo records or workspace selector

final result: passed
