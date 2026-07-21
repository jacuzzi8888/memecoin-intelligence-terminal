# Accessibility & Design System

## Accessibility Requirements

### WCAG 2.2 AA Compliance

All pages must meet:
- **Perceivable**: Text alternatives, captions, adaptable content, distinguishable
- **Operable**: Keyboard accessible, enough time, no seizures, navigable, input modalities
- **Understandable**: Readable, predictable, input assistance
- **Robust**: Compatible with assistive technologies

### Specific Requirements

| Requirement | Implementation |
|-------------|----------------|
| Keyboard navigation | All interactive elements focusable, logical tab order |
| Focus visibility | Clear focus rings, never hidden |
| Color contrast | Minimum 4.5:1 for text, 3:1 for large text |
| Screen readers | Semantic HTML, ARIA labels, live regions |
| Touch targets | Minimum 44x44px |
| Reduced motion | Respect `prefers-reduced-motion` |
| Text resize | Support up to 200% zoom |
| Responsive | Works at 320px to 2560px+ |

### Testing Viewports
- 320px (mobile small)
- 360px (mobile medium)
- 390px (mobile large)
- 768px (tablet)
- 1024px (desktop)
- 1440px (large desktop)

## Design System

### Philosophy
- **Data-dense**: Designed for information-heavy trading interfaces
- **Professional**: Clean, trustworthy appearance
- **Clear under pressure**: Scannable, no ambiguity
- **Consistent**: Predictable patterns throughout
- **Dark-first**: Dark mode as default for trading context

### Color System

#### Core Tokens
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `background` | #FFFFFF | #0A0A0B | Page background |
| `foreground` | #0A0A0B | #FAFAFA | Primary text |
| `card` | #FFFFFF | #141416 | Card backgrounds |
| `border` | #E5E7EB | #27272A | Borders |
| `muted` | #F3F4F6 | #1F1F23 | Muted backgrounds |
| `muted-foreground` | #6B7280 | #9CA3AF | Secondary text |

#### Semantic Colors
| Token | Value | Usage |
|-------|-------|-------|
| `success` | #10B981 | Positive values, confirmations |
| `warning` | #F59E0B | Cautions, medium risk |
| `danger` | #EF4444 | Errors, high risk, losses |
| `info` | #3B82F6 | Informational, links |
| `signal-high` | #10B981 | High confidence signals |
| `signal-medium` | #F59E0B | Medium confidence signals |
| `signal-low` | #6B7280 | Low confidence signals |

### Typography
| Level | Font | Size | Weight | Usage |
|-------|------|------|--------|-------|
| Display | Inter | 30px | 700 | Page titles |
| H1 | Inter | 24px | 600 | Section titles |
| H2 | Inter | 20px | 600 | Subsection titles |
| H3 | Inter | 16px | 600 | Card titles |
| Body | Inter | 14px | 400 | Default text |
| Small | Inter | 12px | 400 | Captions, metadata |
| Mono | JetBrains Mono | 14px | 400 | Addresses, numbers |

### Component Library (shadcn/ui based)

#### Layout
- AppShell, Sidebar, Header, Footer
- PageContainer, Section, Card
- Grid systems (responsive)

#### Data Display
- DataTable (sortable, filterable, paginated)
- StatCard (key-value display)
- ScoreBadge (0-100 with color)
- RiskBadge (low/medium/high/critical)
- TokenIdentity (icon + symbol + address)
- WalletIdentity (address + labels)
- FreshnessIndicator (age + color)
- FactorList (positive/negative factors)

#### Feedback
- AlertCard (alert display with actions)
- EmptyState (no data)
- LoadingState (skeleton screens)
- ErrorState (error display with retry)
- Toast (notifications)

#### Forms
- Input, Select, Checkbox, Radio
- FilterBar (search + filter controls)
- SlippageInput (with presets)
- AmountInput (with max button)

#### Navigation
- Navigation (sidebar + top bar)
- Breadcrumb
- Tabs
- Pagination
- Command palette (Cmd+K)

### Design Tokens (Tailwind)

Tokens defined in `apps/web/tailwind.config.ts` and `packages/ui/` for reuse.

### Responsive Breakpoints
```
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

### Animation
- Duration: 150ms (fast), 300ms (normal), 500ms (slow)
- Easing: ease-out for entries, ease-in for exits
- Reduced motion: Disable all animations when preferred
