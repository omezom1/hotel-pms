---
name: audit-business-logic-state
description: Business-logic, async/race, and permission findings from full-system audit 2026-06-04
metadata:
  type: project
---

Full audit 2026-06-04. Store actions in `lib/store.ts` are generally solid (exhaustive guards, double-action protection in updateBookingStatus via `status===status` and closed-status early returns).

**Double-click / race exposure (MEDIUM):** front-desk + booking-detail action buttons (check-in, check-out, walk-in, record payment, deposit, add corporate) are NOT disabled during in-flight. Store guards make most idempotent:
- updateBookingStatus: re-entry blocked (status equality + closed-status returns) → check-in/checkout safe.
- createBooking / handleWalkIn: NOT guarded against rapid double-submit — re-checks roomHasConflict but two clicks before re-render can both pass conflict and create TWO bookings same room (and bookingId `b${Date.now()}` can collide within same ms). Overbooking risk. Recommend disabling button on submit / useRef in-flight guard.
- recordPayment: clamped to outstanding; second click after first reduces outstanding so mostly safe, but rapid double could both read stale outstanding. LOW.

**Permission gap (MEDIUM):** `app/bookings/[id]` (booking detail) has NO entry in `route-permissions.ts`. `getRequiredPermission('/bookings/xyz')` longest-prefix matches `/bookings` → canManageBookings, so detail IS guarded. But `/invoice/[id]` matches `/invoice` (canViewFinance) — fine. No real hole found; route-permissions longest-prefix works. Reception (canManageBookings) can reach finance-derived invoice print only via canViewFinance — confirm intended.

**adjustForEarlyCheckout:** recomputes nights from todayLocal − checkIn; writes checkOut=now (real timestamp, deliberate). avgNightly*actualNights ignores dynamic per-night pricing (uses flat average) — minor revenue drift if pricing varies by night. LOW.

**cancelBooking financial:** zeroes paidAmount + writes negative refund payment + refunds corp credit + marks invoice refunded. Consistent. Guest totalSpend NOT decremented on cancel-after-checkout is impossible (cancel blocked on checked_out). OK.

**Realtime/CAS (read-only, DO NOT TOUCH):** echo suppression via _writer===CLIENT_ID and applyingRemote flag is correct. mergeState union-by-id revives deleted entities in conflict window (documented PROGRESS §3c). lastSeenVersion monotonic setter correct. No new issues.

Related: [[kpi-formulas-and-buckets]] [[project-date-convention]]
</content>
</invoke>
