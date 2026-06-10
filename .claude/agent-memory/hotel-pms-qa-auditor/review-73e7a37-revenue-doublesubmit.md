---
name: review-73e7a37-revenue-doublesubmit
description: Audit of commit 73e7a37 (revenue consolidation + double-submit guard); confirmed-correct atomic conflict check, residual orphan-guest + walkInRevenue findings.
metadata:
  type: project
---

Audit of commit 73e7a37 on branch fix/revenue-consolidation-double-submit (2026-06-05). Audit only, fixes applied by orchestrator.

**HIGH #2 double-submit/overbooking — CONFIRMED CORRECT (canonical pattern):**
- `lib/store.ts` `createBooking`: `roomHasConflict` moved INSIDE the `set((state)=>{...})` updater is the correct atomic guard. Vanilla Zustand runs updaters synchronously and serially, so a 2nd rapid call sees the 1st's committed booking. Returning `{}` on conflict = valid no-op, does NOT clobber state.
- The `let result` outside `set()` + `return result` after pattern is safe BECAUSE set() is sync — result is assigned before return. No desync path.
- Conflict set: `roomHasConflict`→`bookingOverlapsRange`→`isActiveReservation` (true for confirmed/checked_in/pending; false for cancelled/checked_out). Correct buckets for overbooking.
- ids: `b${Date.now()}-${Math.random().toString(36).slice(2,7)}`; pay reuses same uid. Fine, ids are opaque strings, no parsing assumptions found.

**Why:** This is the authoritative overbooking protection. The `useRef` busy-flags in bookings/front-desk handlers do NOT block cross-tick double-clicks (sync handler resets flag same tick); they only stop sync re-entrancy. Real protection = the atomic check.
**How to apply:** Treat the in-set() conflict check as the canonical anti-overbooking pattern. Do not suggest replacing it with a pre-check alone. If real double-click UX blocking is wanted, use a disabled button state, not the ref.

**Residual findings I reported (orchestrator to fix):**
- MED: `app/front-desk/page.tsx` walk-in creates guest via `addGuest` BEFORE `createBooking`; if createBooking returns {ok:false} (conflict), orphaned guest persists + misleading toast. Fix: pre-check roomHasConflict before addGuest, or roll back guest. Bookings page uses guestSnapshot so it's NOT affected.
- LOW: `app/daily-report/page.tsx` `walkInRevenue` correctly left on raw bookingRevenue (different concept = walk-in business today) but lacks `status !== 'cancelled'` guard.

**HIGH #1 revenue consolidation — CONFIRMED CORRECT.** See [[kpi-formulas-and-buckets]] — now superseded the "reports overstates revenue" note: reports KPI totalRevenue now uses sumRealizedRevenue (checked_out only) matching dashboard/finance/daily-report. `isRealizedRevenue`/`sumRealizedRevenue` in lib/utils.ts is the single source of truth (exhaustive switch w/ never guard). reports keeps `!== 'cancelled'` only for COUNTS (จำนวนการจอง), not revenue — correct distinction.
