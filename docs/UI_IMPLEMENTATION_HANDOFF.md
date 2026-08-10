# UI Implementation Handoff

Last updated: July 27, 2026

This document translates the locked Stitch design system into implementation work for the current app.

Primary design source:

- [DESIGN.md](C:/Users/USER/Desktop/onchainintelligence/memecoin-intelligence-terminal/docs/DESIGN.md)

## 1. Scope

Current target:

- implement the locked `Aegis Terminal` design language in the existing Next.js app
- preserve existing Phase 2 backend integrations
- avoid turning the UI work into a disconnected static redesign

Current route inventory in the app:

- `/dashboard`
- `/scanner`
- `/alerts`
- `/tokens/[address]`
- `/wallets`
- `/watchlists`
- `/strategies`
- `/terminal`
- `/settings`

## 2. Screen-to-Route Mapping

Locked Stitch exports map to app routes as follows:

- `unified_terminal_dashboard_desktop` -> `/dashboard`
- `unified_terminal_dashboard_mobile` -> `/dashboard` mobile layout
- `scanner_desktop` -> `/scanner`
- `scanner_mobile` -> `/scanner` mobile layout
- `token_research_wif_desktop` -> `/tokens/[address]`
- `token_research_mobile` -> `/tokens/[address]` mobile layout
- `wallet_intelligence_desktop` and `wallets_desktop` -> `/wallets`
- `alerts_desktop`, `alerts_triage_desktop`, and `alerts_mobile` -> `/alerts`
- `watchlists_desktop` and `watchlists_mobile` -> `/watchlists`
- `strategies_desktop` and `strategies_mobile` -> `/strategies`
- `terminal_desktop` and `terminal_mobile` -> `/terminal`
- `settings_desktop` and `settings_mobile` -> `/settings`

## 3. Token and Theme Work

The current app theme in [globals.css](C:/Users/USER/Desktop/onchainintelligence/memecoin-intelligence-terminal/apps/web/src/styles/globals.css) is too generic and does not match the locked Stitch exports.

Required theme upgrade:

- replace broad default Tailwind token values with Aegis surface tokens
- add named semantic tokens for `stale`, `success`, `warning`, `error`, `outline`, and layered surface containers
- add typography variables for `Hanken Grotesk` and `JetBrains Mono`
- add utility support for tabular numerals
- tighten default radius values to match the final exports

Recommended token groups:

- shell
- surfaces
- text
- semantic state
- spacing
- radius
- shadows

## 4. Shared UI Primitives to Build First

These should be created before rewriting individual pages:

1. `AppShell`
2. `SidebarNav`
3. `TopStatusBar`
4. `BottomUtilityStrip`
5. `PageHeader`
6. `ModuleCard`
7. `StatusBadge`
8. `MetricChip`
9. `QuickInspectPanel`
10. `TableShell`
11. `EmptyStateBlock`
12. `StaleStateBlock`
13. `DegradedStateBlock`

Rationale:

- the Stitch screens share a strong shell and module grammar
- page-by-page implementation will be slow and inconsistent unless the primitives land first

## 5. Page Build Order

Recommended order:

1. Dashboard
2. Scanner
3. Token Research
4. Wallets
5. Alerts
6. Watchlists
7. Strategies
8. Terminal
9. Settings

Why this order:

- `Dashboard`, `Scanner`, and `Token Research` define the core product identity
- `Wallets` and `Alerts` reuse most of the shell, cards, and state patterns
- the rest can be built faster once those foundations exist

## 6. Dashboard Implementation Notes

Existing page:

- [dashboard/page.tsx](C:/Users/USER/Desktop/onchainintelligence/memecoin-intelligence-terminal/apps/web/src/app/dashboard/page.tsx)

Problems with the current page:

- card-grid admin layout
- weak hierarchy
- no final shell system
- no quick inspection panel
- no strong live-state treatment

Target structure:

- top market/system strip in shared top bar
- left column with ranked opportunities
- center column with critical alerts and wallet flow
- right quick-inspect panel
- bottom persistent utility strip

Implementation note:

- keep the current `/api/v1/dashboard` data source, but reshape it into opinionated UI modules rather than generic stat cards

## 7. Scanner Implementation Notes

Existing page exists, but it should move to the locked design structure:

- filter rail at top
- dense table with fixed column hierarchy
- explicit selected row state
- quick inspect panel on desktop
- card/list adaptation on mobile

Important product behavior:

- do not reshuffle rows while the user is reading
- expose a deferred "apply updates" or equivalent ranking refresh control

## 8. Token Research Implementation Notes

Route:

- `/tokens/[address]`

This page should become the product hub.

Required sections:

- token identity and trust strip
- large chart area
- factor or signal cards
- wallet evidence table
- stale or degraded module example
- integrated trade-prep panel

Implementation note:

- the mock chart shell is acceptable initially, but the page structure must support real overlays later

## 9. Wallets and Alerts Notes

Wallets:

- keep qualification factors prominent
- recent trades need table-first presentation on desktop
- add freshness and sync-state presentation early

Alerts:

- severity must drive layout and scanability
- mobile alerts should be first-class, not an afterthought
- alert cards should link outward into research, wallets, and terminal context

## 10. Mobile Rules

The final exports confirm that mobile should not be a collapsed desktop shell.

Required mobile implementation rules:

- use route-aware bottom navigation
- reduce columns into stacked modules
- move complex filters and secondary actions into sheets
- preserve the same semantic color logic as desktop
- keep key actions reachable with one thumb

## 11. Data-State Coverage

Every major page should implement these states intentionally:

- loading
- empty
- stale
- degraded
- error

Do not treat these as polish work. The final design language depends on trust signals being visible.

## 12. Immediate Work Plan

The next implementation phase should be:

1. Refactor global theme and layout shell.
2. Build shared primitives.
3. Rebuild `/dashboard` in the Aegis layout.
4. Rebuild `/scanner` using the same shell and panel system.
5. Rebuild `/tokens/[address]` as the canonical research page.

## 13. Non-Goals for This UI Pass

Do not spend the first pass on:

- visual experimentation
- animation-heavy polish
- perfect chart rendering
- exotic theming systems
- premature light mode completion

The correct priority is structural fidelity to the locked Stitch system and proper binding to live product data.
