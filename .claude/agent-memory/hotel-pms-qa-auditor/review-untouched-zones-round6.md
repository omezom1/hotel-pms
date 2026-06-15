---
name: review-untouched-zones-round6
description: 2026-06-06 audit of previously-unaudited pages (inventory/housekeeping/maintenance/expenses/calendar/corporate) — inventory has 2 HIGH bugs; occupancy denominator is a cross-file question.
metadata:
  type: project
---

Audit of zones not covered by rounds 1-5 (branch fix/revenue-consolidation-double-submit, 2026-06-06).

**Why:** Prior QA rounds (see [[kpi-formulas-and-buckets]], [[review-round5-postc8733cb]]) deeply audited bookings/front-desk/finance/revenue but never inventory/housekeeping/maintenance/expenses/calendar.

**How to apply:** Next time inventory/occupancy is touched, re-verify these.

Findings (none fixed — report-only round):
- HIGH-2: app/inventory/page.tsx:536-537 — itemHistory "รับเข้า/จ่ายออก" totals bucket by sign of tx.quantity, so an `adjust` (reconciliation) pollutes restock-received / issued-out totals. Fix: bucket by tx.type (restock vs use/waste), not sign. Per-row balanceAfter running balance IS correct (deltas are signed; adjustStock stores quantity=diff at store.ts:764).
- HIGH-1: app/inventory/page.tsx:36 (getStockLevel) & :214 (pct bar) — divide by item.maxStock with no guard; emptyForm.maxStock=0 and handleSaveItem (line 98) has no maxStock validation → Infinity/NaN, broken bar + unreachable 'low' tier. lowItems alert (line 73) only uses 'critical' so partly shielded.
- MED-1 (CROSS-FILE, needs product decision): occupancy/RevPAR denominators all use rooms.length (total), counting maintenance rooms as available → understates occupancy/RevPAR. Sites: dashboard:32, reports:24+76 (buildDailyStats), daily-report:68. If "available rooms" def intended, use rooms.filter(r=>r.status!=='maintenance').length consistently. CONFIRM definition with user first.
- MED-2: daily-report:24-27 checkInsToday filters on scheduled b.checkIn date, not actual check-in event (no checkedInAt timestamp on booking). Late/early arrivals misreported. Needs store/type change.
- MED-3 (LOW/latent): expenses:107 uses new Date(form.date).toISOString() — currently SAFE (input is YYYY-MM-DD parsed as UTC) but violates project convention; footgun if switched to a Date picker. See [[project-date-convention]].
- MED-4: dashboard:72-77 dateBooked/dateAvailable subtract current room.status==='maintenance' even for non-today viewDate; "ปิด K" count is always today's. Display-only.

Verified CORRECT (no bug): updateTaskStatus/updateMaintenanceStatus/removeMaintenanceLog room-status coupling guards (won't clobber occupied/maintenance, store.ts:618-702); useInventoryItem re-checks stock+blocks negatives; calendar isEnd checkout-exclusivity (no off-by-one); revenueByType uses sumRealizedRevenue (consistent). Corporate = display of stored aggregates only (no corporate page; finance tab reads acc.totalDeposited/availableBalance).
