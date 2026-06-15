---
name: review-audit-phase1-round7
description: 2026-06-07 audit of relational-migration Phase 1 (audit_logs dual-write) — logAudit, AppShell audit_logs-sync channel, seed/dedup. Echo-suppression + flag-race analysis.
metadata:
  type: project
---

Round-7 audit (2026-06-07) of relational migration Phase 1 — audit_logs as first entity moved blob→table (strangler, dual-write). Branch fix/revenue-consolidation-double-submit. Audit-log files were UNCOMMITTED working-tree changes at review time (lib/store.ts logAudit, components/layout/AppShell.tsx, app/audit-log/page.tsx). tsc clean (only 4 pre-existing errors).

**Why:** verify the new dual-write path can't desync, double-count, or let the shared `applyingRemote` flag suppress a real app_state write.

**How to apply (verified-correct, don't re-flag):**
- `applyRemoteState` (supabase-storage.ts ~60) is FULLY SYNCHRONOUS (no await between flag true/false). The module-global `applyingRemote` can never straddle an await, so the audit channel's setState cannot suppress a concurrent async app_state setItem. Safe — concern (c) is a non-issue.
- `upsertAuditLogs` dedup Map first-wins over [...incoming, ...existing] = incoming(server/buffer) wins over local optimistic copy with same id. Correct, no double-render.
- rowToAuditLog snake→camel mapping correct; entity_id null→undefined correct.
- merge fn (store.ts ~1177) preserves auditLogs (p.auditLogs ?? current ?? []); seed runs AFTER rehydrate via Promise.resolve(rehydrate()).then so no clobber.
- Echo guard row.writer_id === CLIENT_ID correct; buffer-before-seed prevents lost INSERTs during boot.

**Residual findings reported (NOT yet fixed):**
- LOW: seeded server rows are setState'd under applyRemoteState (suppressed from blob write) — during dual-write the blob's auditLogs can drift from table (blob only gets entries written by THIS tab's optimistic set). Acceptable for dual-write phase; table is source-of-truth post-cutover.
- LOW: 500-cap mismatch — blob slices(0,500) AND table seed limit 500 AND upsert slice(0,500). If >500 logs, audit-log page shows newest 500 only; footer text "500 ล่าสุด" now matches reality (page.tsx ~116 confirmed correct).
- LOW/MED: logAudit id `audit${Date.now()}-${rand}` — rand is 4 hex chars (Math.random slice 2,6). Collision-resistant enough but weaker than booking ids (5 chars). Two audits same ms same tab = 1/65k collision; on collision the table insert hits PK 23505 and surfaces a (spurious) save-error toast. Minor.
- INFO: audit INSERT is fire-and-forget but error-surfaced via reportSaveError — if insert fails, blob still has the entry (optimistic), table is missing 1 row = self-healing free rollback as commented. Correct design.
