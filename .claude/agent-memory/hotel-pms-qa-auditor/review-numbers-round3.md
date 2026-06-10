---
name: review-numbers-round3
description: QA audit round 3 (2026-06-05) numeric/calc findings — revenueByType room-type attribution, extendBooking pricing, early-checkout avg, daily-report dedupe
metadata:
  type: project
---

QA audit focused on number correctness across all KPI/calc paths (2026-06-05, branch fix/revenue-consolidation-double-submit @ c318b0e). Most logic is solid. Confirmed NO ADR is computed anywhere in the app (spec mentions it but no code) — nothing to audit there. Residual real findings:

**MED — reports `revenueByType` attributes revenue by CURRENT room of a booking (`app/reports/page.tsx:33-45`).** Revenue/count grouped by `typeRooms.some(r => r.id === b.roomId)`. After `moveBooking` to a different room TYPE, the whole booking's realized revenue lands in the new type's bucket — chart mis-attributes. Minor (chart only), but note for accuracy. Acceptable for now.

**LOW/known — `adjustForEarlyCheckout` uses flat average `totalAmount/nights` (store.ts:580)** instead of true per-night dynamic price (backlog #6). Refund can be off when dynamic pricing varies by night. Already in backlog.

**LOW — `extendBooking` extraPrice loop (store.ts:487-501) reads dynamic pricing from `oldCheckOut` forward using getUTC* day keys** — consistent with the UTC-midnight convention ([[project-date-convention]]); verified not off-by-one. The added nights are priced from the night of oldCheckOut onward = correct (checkOut is exclusive). OK.

**Verified OK:** double-submit overbooking guard (atomic in createBooking set()) [[review-73e7a37-revenue-doublesubmit]]; check-in/checkout buttons idempotent via updateBookingStatus early-returns (status===status, closed-status guard) so double-click is safe; walk-in guarded by walkInBusy ref. recordPayment clamps to outstanding. cancelBooking zeroes paidAmount + refund payment. invoice unitPrice guards nights>0.

**daily-report potential double-count (informational):** `checkInsToday` counts status in [checked_in, checked_out] with checkIn today; `walkInsToday` counts walk_in created today. A same-day walk-in appears in BOTH check-in list AND walk-in list — intentional (different sections), but the two `extra` revenue figures (`checkOutRevenue` vs `walkInRevenue`) use different recognition bases and should not be summed by a reader. Not a bug; labels are distinct.

Related: [[kpi-formulas-and-buckets]] [[audit-business-logic-state]]
