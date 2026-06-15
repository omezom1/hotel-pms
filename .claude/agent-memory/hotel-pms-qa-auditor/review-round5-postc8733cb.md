---
name: review-round5-postc8733cb
description: Round-5 audit (2026-06-06) AFTER c8733cb+f74f9c2 + a11y focus-trap working tree. Verifies round-4 race fixes landed; residual duplicate-outstanding in bookings/[id], delete-resurrection still live.
metadata:
  type: project
---

Round-5 QA audit, 2026-06-06, branch fix/revenue-consolidation-double-submit (HEAD f74f9c2 + uncommitted a11y focus-trap). Audit only, scope = number/status/business-logic correctness + async/race (NOT security/VAT per user).

**Round-4 race findings NOW FIXED (verified in committed store.ts):**
- recordPayment (store.ts:950-993): validation (not-found / outstanding<=0 / amount>outstanding via calcOutstanding) moved INSIDE set(), returns result. Atomic. Double-submit overpay closed.
- fulfillAddOn (store.ts:1016-1063): status + stock re-check INSIDE set(), deduction guarded by `inv.currentStock < deduct`. Atomic. Stock-negative oversell closed.
- createBooking (156-202) still atomic conflict-in-set. All three follow same canonical pattern.

**RESIDUAL — MED: duplicate outstanding formula in app/bookings/[id]/page.tsx (NOT using calcOutstanding).**
Inlines `booking.totalAmount + addOnTotal - booking.paidAmount` at lines 79, 109, 438, 441 instead of calcOutstanding(). Same concept computed 2 ways in one file: proceedCheckout (line 136) correctly uses calcOutstanding(fb, st.bookingAddOns), but the render-time `outstanding` (79) + extend toast (109) + invoice-summary display (438/441) hand-roll it. Today they agree because calcAddOnTotal == addOnTotal, but this is exactly the project's recurring bug class — divergence risk if add-on charge policy changes again. Fix: replace inline with calcOutstanding(booking, bookingAddOns).

**RESIDUAL — LOW: daily-report inline payment-split + outstanding (app/daily-report/page.tsx:89-95).**
exportDailyExcel re-derives cash/transfer split and `outstanding = totalCharge - paidAmount` inline rather than calcOutstanding. Functionally OK (uses calcAddOnTotal for totalCharge) but another hand-rolled outstanding. Also totalPaymentsReceived (line 50) sums raw p.amount incl negative refunds = "net cash" — label says สุทธิ so intentional, but it nets refunds against same-day payments (reader caution, not a bug).

**CONFIRMED STILL LIVE — delete-resurrection race (§3c), supabase-storage.ts mergeById (97-106).**
union-by-id: local wins on dup id, remote extras appended. If tab A deletes entity X (gone from local array) while tab B holds X in a concurrent write, merge re-adds X from remote → X resurrected. Affects any delete: deleteExpense, deleteInventoryItem, deleteUser, deleteStaff, removeMaintenanceLog, cancelAddOn-as-delete. Documented known-limitation in PROGRESS §3c (real fix = tombstones/per-entity ts = big rejected work). DO NOT TOUCH mergeState/echo-suppression without PROGRESS §3. Still strictly better than LWW.

**Dashboard occupancy semantics note (NOT a bug, by design):** dashboard occupancyRate (page.tsx:32) = rooms.status==='occupied'/total (live room status, "now"). reports occupancyNow same. dashboard chart + reports trend use bookingOccupiesDay (counts checked_out too) for historical days. Two different occupancy definitions (live-room vs night-occupancy) coexist intentionally; today's bar in trend can differ from KPI card. Acceptable but a reader could be confused.

**Verified OK this round:** finance totalRevenue/pendingAmount (clamped per-invoice), reports revenueByType (roomTypeAtBooking snapshot + fallback), calendar uses bookingActiveOnDay, guests page reads stored stats only, front-desk walkInBusy ref + roomHasConflict pre-check + atomic createBooking net, invoice[id] clamps displayedPaid to [0,total] + refunded label. check-in/checkout buttons still not disabled in-flight but updateBookingStatus early-returns (status-equality + closed-status) make them idempotent.

Related: [[review-addon-snapshot-round4]] [[kpi-formulas-and-buckets]] [[audit-business-logic-state]] [[review-73e7a37-revenue-doublesubmit]]
