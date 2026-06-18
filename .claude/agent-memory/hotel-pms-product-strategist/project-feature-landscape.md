---
name: project-feature-landscape
description: What PMS features already exist (full or half-built) vs genuine gaps — read before any "what to build next" gap analysis to avoid proposing something half-shipped
metadata:
  type: project
---

Snapshot of build state for gap analysis (verified 2026-06-15, post PR #8 merge to main / live at hotel-pms-henna.vercel.app).

**Why:** A gap analysis is only useful if it doesn't re-propose half-built things. Several "standard PMS gaps" are already partly there.

**How to apply:** Before recommending a feature, check it against this list; re-verify by grepping if recommending action.

Already SHIPPED (don't propose): dashboard KPIs, front-desk lifecycle (walk-in/deposit/early-checkout/move-room-reprice/corporate-charge), bookings, calendar, rooms, guests CRM (basic), housekeeping, inventory (ledger), maintenance (tickets), staff + per-user permission editor, finance, expenses (+receipt image upload to Supabase Storage), daily-report, reports (revenue-by-type, occupancy, source pie), audit-log, invoice (printable, redirects via /finance), login. Revenue is single-source-of-truth (isRealizedRevenue, realized only on checkout). NotificationBell counts 5 real categories.

Half-built / hidden (high-leverage to FINISH, not start):
- **Dynamic/seasonal pricing**: engine EXISTS — `getNightlyPrice` + `calcBookingTotal` in lib/utils.ts read `mockDynamicPricing`. Wired into extend/early-checkout/booking-total. BUT no UI to edit rates; rates are hardcoded mock. Gap = a rates-management screen, not the math.
- **Invoice/tax**: `Invoice.tax` exists but hardcoded `tax: 0`. VAT 7% deferred (backlog §6.5, user asked to defer). Invoice already printable.
- **Guest CRM**: Guest type has totalStays/totalSpend/preferences but it's thin — no stay history view, no per-guest booking list.

Genuine GAPS (nothing built): guest communications / booking confirmation messages, deposit/refund policy automation, housekeeping mobile board (DROPPED — staff don't use app), reporting export to Excel (NOTE: lib/export-excel.ts exists — check what it covers), multi-rate-plan, occupancy forecast / pickup report.

Deliberately removed — do NOT propose: OTA / Channel Manager (app/channels deleted).
