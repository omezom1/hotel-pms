---
name: kpi-formulas-and-buckets
description: Canonical KPI formulas, status-bucketing rules, and cross-file revenue inconsistencies in Hotel PMS
metadata:
  type: project
---

KPI helpers live in `lib/utils.ts` (single source of truth): `bookingRevenue` (=totalAmount + non-cancelled add-ons), `isRealizedRevenue`/`sumRealizedRevenue` (realized = checked_out only; the canonical revenue-sum helper — see [[review-73e7a37-revenue-doublesubmit]]), `calcOutstanding`, `calcAddOnTotal`, `bookingOccupiesDay` (status!=cancelled), `bookingActiveOnDay` (active only), `isActiveReservation`.

**Canonical "today revenue" rule (consistent across dashboard, reports, finance, daily-report):** sum `bookingRevenue` of bookings where `status==='checked_out' && checkOut.startsWith(today)`. This is consistent everywhere — good.

**Occupancy:** dashboard + reports "now" use `rooms.filter(status==='occupied')/total`. Charts + daily-report use `bookingOccupiesDay`. Two different denominators/numerators but each internally intentional (live room status vs historical night occupancy).

**CROSS-FILE INCONSISTENCY — mostly RESOLVED in commit 73e7a37 (2026-06-05).** Previously `app/reports/page.tsx` `revenueByType` + `totalRevenue` summed over ALL non-cancelled bookings (overstated). Now dashboard/daily-report/reports revenue sums + finance's 7-day chart route through `sumRealizedRevenue` = checked_out only. reports keeps `status !== 'cancelled'` ONLY for counts (จำนวนการจอง, source breakdown), not revenue — correct distinction. NOTE: reports "รายได้สะสมทั้งหมด" visibly DROPPED as a result (now realized-only); expected, not a bug. See [[review-73e7a37-revenue-doublesubmit]].

**RESOLVED in c318b0e (2026-06-05):** `app/finance/page.tsx:64` `totalRevenue` now = `sumRealizedRevenue(bookings, bookingAddOns)` — same basis as dashboard/reports/daily-report and the page's own 7-day chart. The earlier "PAID-invoice totals" divergence (3 revenue defs on one page) is gone. Finance headline = realized revenue.

**RevPAR:** dashboard/reports = todayRevenue/totalRooms. Standard-ish (usually ADR×occupancy or roomRevenue/availableRooms). Acceptable.

**daily-report `totalPaymentsReceived`:** sums ALL booking.payments dated today INCLUDING negative refund payments (cancel/early-checkout/addon-cancel write amount<0) = net cash. RESOLVED in c318b0e: label relabeled to "ยอดรับเงินสุทธิวันนี้" (net) — now matches the math. Not a bug.

**Tax:** invoices hardcode tax:0, total=amount (VAT deferred by user — known).

Related: [[audit-business-logic-state]] [[project-date-convention]]
