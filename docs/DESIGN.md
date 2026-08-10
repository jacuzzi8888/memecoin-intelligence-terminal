# Aegis Terminal Design System

Last updated: July 27, 2026

This document replaces the earlier exploratory UI brief. The final visual direction is locked to the Stitch exports built around the `Aegis Terminal / Institutional Grade` system.

Source artifacts used to lock this design:

- `stitch_memecoin_intelligence_terminal_design_system.zip`
- `stitch_memecoin_intelligence_terminal_design_system (1).zip`
- `stitch_memecoin_intelligence_terminal_design_system (2).zip`

These exports define the final aesthetic baseline for Phase 2 and the implementation target for the current web app.

## 1. Product Intent

Aegis Terminal is a private memecoin intelligence and trading workspace for a solo operator. The product must feel:

- precise
- disciplined
- dense where useful
- calm under heavy data volume
- crypto-native without theatrics
- structurally ready for live execution

The UI is not a growth SaaS dashboard, not an onboarding funnel, and not a generic exchange skin. It is a research and action terminal.

## 2. Locked Visual Direction

The chosen direction is a dark institutional terminal with restrained blue, green, amber, and red semantic accents.

Reference character:

- Bloomberg-style seriousness without legacy clutter
- TradingView-style workspace logic
- Nansen-style trust posture
- carefully limited crypto-native energy

Explicitly rejected:

- glassmorphism
- purple-led palettes
- neon gradient hero styling
- oversized rounded marketing cards
- decorative motion as a primary design device

## 3. Brand and Shell Language

Product naming in the locked design:

- product: `AEGIS TERMINAL`
- descriptor: `Institutional Grade`

Shell model:

- fixed left navigation rail
- compact top status bar
- fluid primary workspace canvas
- optional right contextual inspection or execution panel
- persistent bottom utility strip

The shell should read as a tool, not a website.

## 4. Final Typography

Primary UI font:

- `Hanken Grotesk`

Monospace data font:

- `JetBrains Mono`

Typography rules:

- page and section titles are compact and heavy, not oversized
- navigation labels can use uppercase micro-label treatment
- all prices, percentages, wallet addresses, scores, liquidity, and time metrics use tabular numerals
- metadata stays small but readable

Locked type scale from the Stitch exports:

- `headline-lg`: `24/32`, weight `600`
- `headline-md`: `18/24`, weight `700`
- `section-title`: `16/24`, weight `600`
- `body`: `14/20`, weight `400`
- `caption`: `12/16`, weight `400`
- `label-xs`: `11/14`, weight `500`, tracking `0.05em`
- `mono-data`: `13/18`, weight `500`, tracking `-0.01em`

## 5. Final Color System

Core surfaces:

- `background`: `#11131b`
- `surface`: `#11131b`
- `surface-container-lowest`: `#0c0e16`
- `surface-container-low`: `#191b23`
- `surface-container`: `#1d1f27`
- `surface-container-high`: `#282a32`
- `surface-container-highest`: `#32343d`
- `surface-bright`: `#373942`
- `outline`: `#434655`
- `on-surface`: `#e1e2ed`
- `on-surface-variant`: `#c3c6d7`

Primary and semantic accents:

- `primary`: `#b4c5ff`
- `primary-container`: `#2563eb`
- `success`: `#10B981`
- `warning`: `#F59E0B`
- `stale`: `#D97706`
- `error`: `#EF4444`
- `confidence-high`: `#065F46`

Color rules:

- blue is the structural accent, not a decorative glow color
- green means favorable movement, healthy trust, or positive flow
- amber means caution, medium risk, or stale/degraded state
- red means severe risk, losses, or critical alerts
- do not rely on color alone; pair with icon, label, or numeric state

## 6. Spacing, Radius, and Density

Locked spacing tokens from the exports:

- `dense-padding`: `8px`
- `standard-padding`: `16px`
- `grid-gutter`: `16px`
- `grid-margin`: `24px`
- `top-nav-height`: `64px`
- `sidebar-width`: `240px`

Radius system:

- default radius: `2px`
- `lg`: `4px`
- `xl`: `8px`
- `full`: `12px`

Density rules:

- default desktop state is dense
- tables should prefer high information throughput over decorative whitespace
- large empty dead zones should be minimized
- cards exist to structure modules, not to turn the whole app into a card gallery

## 7. Core Interaction Language

The visual system depends on these interaction patterns:

- active nav item uses a blue right-edge indicator and a raised surface state
- selected table rows or active entities use a stronger blue accent strip
- quick inspection happens in a right panel, not a modal
- critical system state is visible at all times through top and bottom shell signals
- stale and degraded states stay inside the affected module rather than blanking the whole screen

Motion rules:

- use subtle pulses only for live or active system state
- use short hover and focus transitions
- avoid ornamental motion, floating animations, and large-scale ambient effects

## 8. Information Architecture

Primary navigation remains:

1. Dashboard
2. Scanner
3. Alerts
4. Research
5. Wallets
6. Watchlists
7. Strategies
8. Terminal
9. Settings

Entity hierarchy remains:

- token
- wallet
- alert
- strategy
- watchlist
- trade preparation
- timeline event

Research is the token-centric hub. Terminal is execution-oriented but still connected to research context.

## 9. Finalized Shared Shell

### 9.1 Desktop

Left rail:

- fixed width `240px`
- product mark at top
- primary nav stack
- settings near bottom
- trader profile or account state at the bottom

Top bar:

- compact
- global search
- network and system icons
- environment pill such as `Mainnet`
- market or chain state metrics where useful

Bottom strip:

- fixed utility bar
- shows live system, latency, and chain status
- exposes logs, transactions, and network status links

### 9.2 Mobile

Locked mobile behavior from the exports:

- top compact header with Aegis brand and status icons
- bottom navigation for high-frequency destinations
- stacked content modules
- full-screen panels or sheets for complex actions

## 10. Page Baselines

### 10.1 Dashboard

The dashboard is the flagship screen. The locked export establishes:

- high-conviction opportunity board on the left
- critical alerts stack in the center
- wallet flow table below alerts
- contextual quick-inspection panel on the right
- market/system strip in the top bar

This is the canonical composition for the Phase 2 app shell.

Required implementation additions beyond the mockup:

- stronger watchlist and strategy movement modules
- explicit freshness timestamps
- module-level degraded states
- clearer "updated ranking available" state for live data changes

### 10.2 Scanner

The scanner is a dense table-first workflow with:

- chain and filter chips in a top filter bar
- large sortable table as the center of gravity
- hover-revealed secondary row actions on desktop
- right-side quick-inspection panel

Required implementation additions beyond the mockup:

- saved views
- column visibility management
- keyboard row navigation
- stable live ordering with deferred ranking updates

### 10.3 Research

The final research direction is represented by the `token_research_wif_desktop` export:

- token identity row with trust cluster
- large analytical chart block
- factor cards for explainability
- stale/degraded module treatment inside the evidence stack
- wallet evidence table
- integrated execution panel on the right

This page defines the research-to-trade product posture.

### 10.4 Wallets

The wallet page direction is:

- performance cards
- qualification factors
- recent trades table
- tracked/watchlist actions in the page header

Required implementation additions beyond the mockup:

- richer positions state
- relationship or cluster evidence
- sync freshness and error state treatment

### 10.5 Alerts

The mobile alert export is the clearest final direction:

- grouped alert feed
- strong severity hierarchy
- direct reason summaries
- compact bottom navigation

Desktop alerts should preserve the same severity logic but expand into split-pane triage.

### 10.6 Watchlists

Watchlists should use the same shell and table/list system:

- watchlist selector
- changed-since-last-review state
- compact monitoring rows
- note or tagging support

### 10.7 Strategies

Strategies should match the same terminal language:

- compact list or split-pane detail
- threshold controls
- rule builder sections
- recent matches and version history

### 10.8 Terminal

Terminal remains execution-ready, but in the final design language it should still feel like part of the same app:

- token selection and pricing context first
- execution controls second
- supporting positions and signal context nearby

The standalone mobile trading export is visually useful, but its interaction model should be adjusted to stay research-connected rather than becoming a generic exchange ticket.

### 10.9 Settings

Settings should keep the same surface logic:

- compact panels
- route and destination configuration
- display and refresh defaults
- trading defaults

## 11. Locked Component Set

The final design system should be implemented through reusable app components:

- `AppShell`
- `SidebarNav`
- `TopStatusBar`
- `BottomUtilityStrip`
- `SearchField`
- `StatusPill`
- `MetricChip`
- `ModuleCard`
- `RankedOpportunityCard`
- `ScannerTable`
- `QuickInspectPanel`
- `TrustCluster`
- `SecurityCheckList`
- `AlertFeed`
- `AlertCard`
- `MetricStatCard`
- `EvidenceCard`
- `WalletFlowTable`
- `WalletTradeTable`
- `TradePrepPanel`
- `EmptyStateBlock`
- `StaleStateBlock`
- `DegradedStateBlock`

## 12. State Patterns

Loading:

- use structural skeletons
- avoid spinner-only main views

Stale:

- amber or stale-specific treatment
- explicit lag wording
- preserve the stale metric instead of hiding it

Degraded:

- keep unaffected modules visible
- identify the affected source or worker

Critical:

- use red left borders, severity labels, and recent timestamps

Selection:

- use primary accent strips, raised surface state, or stronger border emphasis

## 13. Accessibility and Quality Bar

Required:

- WCAG 2.2 AA contrast targets
- keyboard navigable tables and actions
- clear focus states
- no hover-only critical content on mobile
- readable at 200% zoom
- semantic headings, regions, and tables

## 14. Implementation Standard

When implemented, the app should feel like the Stitch exports but with stronger product depth:

- more real data density
- better state coverage
- less placeholder whitespace
- stronger continuity between dashboard, scanner, research, wallets, and alerts

The final implementation should preserve the Aegis Terminal look while making the workflows more complete than the original mockups.
