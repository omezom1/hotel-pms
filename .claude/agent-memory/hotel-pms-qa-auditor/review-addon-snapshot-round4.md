---
name: review-addon-snapshot-round4
description: Round-4 audit (2026-06-05) verifying MED-1 add-on-fulfilled-only + MED-2 roomTypeAtBooking snapshot + early-checkout/extend; plus new get()-then-set() race findings in recordPayment/fulfillAddOn.
metadata:
  type: project
---

Round-4 QA audit on branch fix/revenue-consolidation-double-submit (uncommitted), 2026-06-05. Audit only.

**Part 1 fixes — ALL VERIFIED PASS:**
- MED-1 add-on charge = fulfilled only: `addOnCountsTowardCharge` (utils.ts) now fulfilled=true, requested/cancelled=false (exhaustive switch). checkout `chargeableAddOns` (store.ts:244) + `calcAddOnTotal` (invoice combinedTotal, store.ts:247) + cancelAddOn `otherAddOnTotal` (store.ts:1083) all route through it. Invoice line items == combinedTotal == calcOutstanding everywhere. Display lists in app/rooms/page.tsx:220,269 still use `!== 'cancelled'` but that's a roster display (shows requested+fulfilled), NOT a charge calc — acceptable.
- MED-2 roomTypeAtBooking: type field added (types/index.ts:60, optional). createBooking snapshots from state.rooms (store.ts:185). Walk-in uses SAME createBooking → gets snapshot. reports groups by `b.roomTypeAtBooking ?? rooms.find()?.type` (reports:36) — fallback correct for legacy bookings. Fixes the moveBooking mis-attribution noted in [[review-numbers-round3]].
- LOW-1 early-checkout: `adjustForEarlyCheckout` uses calcBookingTotal(checkIn → addNightsISO(checkIn, actualNights)) (store.ts:569-571). actualNights = round((todayLocal - checkInKey)/86400000), min 1; nights count exact, no off-by-one. overpaid refund clamps paidAmount. PASS — supersedes the LOW flat-avg note in [[review-numbers-round3]] (#6 now actually fixed).
- LOW-2/3/4 extend: extendBooking uses addNightsISO + calcBookingTotal(oldCheckOut → newCheckOut). nights priced = additionalNights exactly (checkOut exclusive). conflict check uses newCheckOut, excludes self. PASS.

**NEW finding — MED: get()-then-set() race (overpayment / stock oversell).** Same class as the createBooking double-submit bug, NOT yet fixed in these two:
- `recordPayment` (store.ts:950-958): validates `amount <= outstanding` via get() OUTSIDE set(); two rapid payments both pass stale check then both apply inside their own set() → paidAmount can exceed total (overpayment, negative outstanding). Pay dialogs only `disabled={amount<=0}`, no in-flight lock.
- `fulfillAddOn` (store.ts:1011-1018): stock pre-check OUTSIDE set(); deduction inside set() does NOT re-check `s.currentStock >= deduct` → two rapid fulfills off same low-stock item drive stock negative.
- Canonical fix = move validation INSIDE set() and return result, exactly like createBooking ([[review-73e7a37-revenue-doublesubmit]]). Manual inventory "use" dialog IS clamped (inventory page) so only the add-on path is exposed.

**Verified OK (Part 2):** finance totalRevenue=sumRealizedRevenue, pendingAmount clamps per-invoice. expenses page self-contained (UTC-midnight date convention consistent). guests page reads stored totalSpend/totalStays (incremented once at checkout w/ newPaidAmount). cancelBooking does NOT decrement guest stats BUT cancel UI is gated to confirmed|pending only (bookings list:231, detail:238) so checked_out can't be cancelled → stats can't inflate; store lacks defensive guard (LOW defense-in-depth). requestAddOn blocks closed bookings.

**NEW finding — LOW: no P&L anywhere.** Finance shows revenue, expenses page shows costs, but NOTHING computes net (revenue − expenses). User expected "รายจ่ายหักรายได้/ยอดสุทธิ" — it's a missing feature, not a wrong number.

**NEW finding — LOW: invoice [id] mixes frozen snapshot + live paidAmount.** Invoice items/amount/total frozen at checkout; "ชำระแล้ว/ค้างชำระ" (invoice [id]:136-141) read LIVE booking.paidAmount. Post-checkout addon/refund/cancel desyncs the printed invoice. Also status badge (line 85) renders 'refunded' raw (not "คืนเงินแล้ว").

Related: [[kpi-formulas-and-buckets]] [[review-numbers-round3]] [[review-73e7a37-revenue-doublesubmit]] [[audit-business-logic-state]]
