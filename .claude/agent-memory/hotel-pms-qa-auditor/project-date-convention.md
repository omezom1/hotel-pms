---
name: project-date-convention
description: Hotel PMS canonical date convention — check-in/out stored as UTC-midnight YYYY-MM-DDT00:00:00.000Z; helpers and known timezone pitfalls
metadata:
  type: project
---

Check-in/check-out dates in the Hotel PMS are stored as **UTC-midnight** strings (`YYYY-MM-DDT00:00:00.000Z`). All date math keys off `day(iso) = iso.split('T')[0]`, so the whole system compares date-only.

**Why:** react-date-range / native date inputs hand back a Date at *local* midnight. Calling `.toISOString()` in TZ +07 shifts the day back by one (Jun 3 00:00 +07 → Jun 2 17:00 UTC). The fix (commit 8d6b261) added `calendarDateToISO(d)` in `lib/utils.ts` which reads local Y/M/D and pins to UTC-midnight. Bookings DateRange + walk-in now use it.

**How to apply when auditing:**
- Any picker Date that flows into stored `checkIn`/`checkOut` MUST go through `calendarDateToISO`, never raw `.toISOString()`.
- `todayLocal()` / `toLocalDateKey()` are the local-date helpers; `new Date().toISOString().split('T')[0]` is a red flag (returns UTC date, wrong 00:00–06:59 ICT).
- `extendBooking` (store.ts ~471) and `adjustForEarlyCheckout` operate on the date-only key and use getUTC*/setUTCDate, so they stay consistent. `adjustForEarlyCheckout` writes `checkOut: now` (a real timestamp) on early checkout — a deliberate exception, not UTC-midnight.
- Backend conflict guard is `roomHasConflict` (calls `bookingOverlapsRange`, half-open `[checkIn, checkOut)`). Hotel rule: same-day checkout==next check-in is NOT a conflict.

Related: [[review-8d6b261-timezone-guard]]
