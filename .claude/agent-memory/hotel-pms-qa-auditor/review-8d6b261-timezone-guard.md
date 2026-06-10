---
name: review-8d6b261-timezone-guard
description: Audit findings for commit 8d6b261 (calendarDateToISO + maxNightsBeforeConflict walk-in guard) — residual native-input min bug
metadata:
  type: project
---

Audited commit 8d6b261 (2026-06-03). Core logic SOUND: `calendarDateToISO` correct for month/year/leap boundaries and 00:00–07:00 ICT window; `maxNightsBeforeConflict` off-by-one is correct (back-to-back same-day allowed, diffDays = max nights). UI guard matches backend `roomHasConflict` semantics.

**Residual issue (low/medium):** `app/bookings/page.tsx` native date inputs still set `min={new Date().toISOString().split('T')[0]}` (lines ~409, ~423) — the same UTC-shift the commit fixed everywhere else. During 00:00–06:59 ICT this min reads yesterday, letting a user pick a past date the picker should block. Stored value is correct (uses `${e.target.value}T00:00:00.000Z`); only the min boundary is affected. Recommend `todayLocal()`.

**Minor:** walk-in conflict guard recomputes `maxNightsBeforeConflict` three times per render (warning block, button block, and inline). Pure/cheap, not a bug — could memo.

**No race/double-click risk** beyond existing: createBooking re-checks `roomHasConflict` at submit, so UI disable is advisory only and a stale guard can't overbook.

Related: [[project-date-convention]]
