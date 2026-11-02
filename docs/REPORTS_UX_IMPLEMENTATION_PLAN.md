# Reports UX Implementation Plan

**Status:** PR1–PR5 complete locally — shell UX, accuracy, pillar polish, export, exec payload consolidation, server items-sold filters, sticky columns  






**Related:** [EXECUTIVE_FINANCIALS_REPORTS_PLAN.md](./EXECUTIVE_FINANCIALS_REPORTS_PLAN.md)  
**Branch target:** `feature/update_reports_v2`

Build toward a calm executive reading experience: one sticky context bar, one job per section, progressive disclosure for detail, and clear period vs live labels. Keep the existing MUI shell (`Paper` + light borders, tabular nums, scrollable tabs) — clean it, don’t redesign from scratch.

---

## UX principles (non‑negotiable)

1. **One composition per viewport** — first screen of Executive: 4 KPIs + Working Capital only. No P&L above the fold.
2. **One job per section** — headline + one sentence + primary numbers. Tables are drill-downs or teasers (≤3 rows).
3. **Progressive disclosure** — OpEx categories, cash bridge, aging, full ledgers behind expand / “View all →”.
4. **Always label time** — `Period` · `As of {endDate}` · `Live today` chips; never mix silently.
5. **Hub vs system of record** — Executive teases; pillar tabs own full matrices.
6. **Honest states** — skeleton = loading; Alert + Retry = error; quiet empty copy = no data. Never infinite skeleton.
7. **Density with air** — section `gap: 3–3.5`; fewer nested cards; prefer dividers inside one `Paper` over card-in-card.
8. **Mobile** — scrollable tabs stay; wide tables get horizontal scroll + sticky first column; KPIs stack 2×2.

---

## Shared UI kit

Under `frontend/src/pages/reports/components/`:

| Component | Purpose |
|-----------|---------|
| `ReportContextBar` | Sticky: date range, BS chip, as-of legend |
| `ReportSection` | Title, one-line subtitle, optional deep-link, children |
| `AsOfChip` | `Period` / `Closing` / `Live` with consistent colors |
| `ReportErrorState` | Alert + Retry (Day Book pattern) |
| `ReportEmptyState` | One line + optional CTA |
| `TeaserTable` | Max 3–5 rows + footer “View all →” (PR2+) |
| `KpiStrip` / `MetricTooltip` | Shared KPI + definition tooltips (PR2+) |

Visual tokens:
- Section radius `2.5–3`, border `divider`, elevation `0`
- One accent family per section
- `fontVariantNumeric: 'tabular-nums'` on all money
- Primary CTA filled; secondary text buttons for deep links

---

## Target layouts

### Shell

```
[ Title + subtitle ]
[ Day Book ] [ Export ]

── sticky ReportContextBar ─────────────────────────
 DateRange | Nepal BS | Period · Closing · Live legend
────────────────────────────────────────────────────
 Tabs …
 Active tab content
```

### Executive (reading order)

```
① KPI strip (4)                          ← period
② Working Capital                        ← Closing | Live toggle (PR3)
③ Income vs Expenses                     ← period
④ Receivables vs Payables                ← totals + net float only
⑤ P&L waterfall                          ← + shrinkage, CapEx, bottom line (PR3)
   └ collapsed: OpEx categories, cash bridge
⑥ Action teasers: Creditors | Categories | Tender (PR2/PR4)
```

---

## Per-tab: keep / add / demote

### Executive
| Keep | Add | Demote |
|------|-----|--------|
| 4 KPIs, WC, I vs E, thin AR/AP, full P&L | Closing/Live toggle; till variance; shrinkage + CapEx + Net Earnings; tender teaser; Pay on creditors | Full aging chips; long creditor/category tables → teasers; cash bridge default collapsed |

### Sales
| Keep | Add | Demote |
|------|-----|--------|
| Chart, category matrix, product matrix, tender | KPI strip; empty state for single-day chart; zero-cost warning | Don’t duplicate Exec P&L |

### Purchasing
| Keep | Add | Demote |
|------|-----|--------|
| KPIs, aging, supplier ledger, returns | As-of label; row Pay link; cash paid → Cashflow | — (AP home) |

### Inventory
| Keep | Add | Demote |
|------|-----|--------|
| Valuation, reorder, expiry, dead stock | **Live snapshot banner**; link to Audit | — |

### Cash Flow
| Keep | Add | Demote |
|------|-----|--------|
| In/Out KPIs, statement, wallets, Day Book | Staff custody if material; rename “Live” → period movements | Full statement off Exec |

### Loss Audit
| Keep | Add | Demote |
|------|-----|--------|
| Voids, high discounts, unreconciled days | Day Book links; shrinkage total for Exec | Optional: full neg-margin/expired → KPI + jump |

### Customers
| Keep | Add | Fix |
|------|-----|-----|
| Member KPIs, top list | Period clarity or real lifetime | Rename “Lifetime” if filtered by range |

---

## Delivery PRs

| PR | Focus | Status |
|----|-------|--------|
| **PR1** | Shell context bar, as-of legend, error states, honest export, inventory live banner | **Done (local)** |
| **PR2** | Executive visual cleanup: teasers, as-of chips, demote aging; fuller `ReportSection` migration optional | **Partial (local)** |
| **PR3** | Dual WC, till variance, shrinkage/CapEx P&L, COGS last-PO fallback + tests | **Done (local)** |
| **PR4** | Pillar polish: Sales KPIs, Pay links, tender on Exec, Cashflow rename, Customers period | **Done (local)** |
| **PR5** | Perf (single exec payload), export Audit+Customers, mobile sticky columns | **Done (local)** |

---

## Explicit non-goals

- No new dashboard charts on Executive
- No purple/glow redesign; stay on divider/paper language
- No cards inside hero beyond light Papers
- No extra shell filters — local filters stay in-tab
- Don’t nest Customers under Sales until metrics are richer

---

## Definition of done (UX)

- Owner answers liquidity / profit / solvency on Executive without scrolling past WC + I vs E + P&L footer.
- Inventory never looks period-bound without the Live banner.
- Closing vs Live is one control; numbers update in place (PR3).
- Every tab recovers from API failure with Retry.
- Mobile: tabs scroll; no page overflow except intentional table scroll.
- Executive length drops via teasers instead of duplicate full tables.

---

## Open decisions

1. Inventory: keep live-only (recommended) vs historical as-of `endDate`.
2. Customers: keep top-level vs nest under Sales.
3. Pay Supplier: deep link only vs inline modal.
4. Shrinkage source: expired batches, expense write-offs, or both.
