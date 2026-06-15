# Memory Index

- [Date Convention](project-date-convention.md) — check-in/out stored as UTC-midnight; use calendarDateToISO/todayLocal, never raw .toISOString() on picker Dates.
- [Review 8d6b261 Timezone Guard](review-8d6b261-timezone-guard.md) — audit of calendarDateToISO + walk-in conflict guard; residual native-input min UTC bug in bookings page.
- [KPI Formulas & Buckets](kpi-formulas-and-buckets.md) — canonical revenue/occupancy/RevPAR rules; sumRealizedRevenue is THE revenue helper; reports overstate RESOLVED in 73e7a37.
- [Audit: Business Logic & State](audit-business-logic-state.md) — double-click overbooking risk, route-perms, early-checkout pricing, realtime/CAS read-only notes (full audit 2026-06-04).
- [Review 73e7a37 Revenue+DoubleSubmit](review-73e7a37-revenue-doublesubmit.md) — atomic in-set() conflict check CONFIRMED correct; residual orphan-guest (front-desk) + walkInRevenue cancelled-guard findings.
- [Review Numbers Round 3](review-numbers-round3.md) — 2026-06-05 calc audit: revenueByType mis-attributes after moveBooking; no ADR exists; double-click/walk-in guards verified OK.
- [Review Add-on Snapshot Round 4](review-addon-snapshot-round4.md) — 2026-06-05: MED-1/MED-2/early-checkout/extend all PASS; NEW get()-then-set() race in recordPayment+fulfillAddOn; no P&L; invoice frozen-vs-live desync.
- [Review Round 5 post-c8733cb](review-round5-postc8733cb.md) — 2026-06-06: round-4 races FIXED; residual duplicate outstanding in bookings/[id]; delete-resurrection still live (§3c).
- [Review Untouched Zones Round 6](review-untouched-zones-round6.md) — 2026-06-06: inventory HIGH bugs (adjust pollutes restock/out totals; maxStock=0 div-by-zero); occupancy denominator counts maintenance rooms (cross-file).
- [Review Audit Phase1 Round 7](review-audit-phase1-round7.md) — 2026-06-07: audit_logs dual-write Phase 1. applyingRemote flag is sync=safe; dedup/merge/echo-guard correct; residual LOW blob-drift + id-collision toast.
