---
name: project-migration-gating
description: Which migration tier / security item gates which features — use to sequence the roadmap so high-value low-risk features don't get blocked behind the riskiest migration
metadata:
  type: project
---

The blob→relational strangler migration state (per PROGRESS.md, as of 2026-06-15) and what it gates.

**Why:** Features that only touch already-migrated or blob-only slices are safe to build now; features needing transactional integrity (checkout/cancel atomicity, server-side money) should wait for Tier C + RPC.

**How to apply:** When sequencing, tag each feature with its data dependency.

Tier state:
- Tier A DONE: audit_logs, expenses, inventory (items + transactions), maintenance_logs.
- Tier B STARTED: add_on_items done (read-only catalog). NEXT in Tier B = **guests** (mutable + checkout side-effect totalStays/totalSpend), then staff, users(auth), corporate, rooms last.
- Tier C (NOT started, riskiest): bookings, invoices, payments + Postgres RPC so checkout/cancel is one transaction.

Security enablers (backlog, not done): plaintext passwords → need bcrypt hash; RLS is anon-full-access (internal-only safe). Both gate anything multi-tenant or externally exposed (e.g. a guest-facing page).

Gating rules:
- Features reading/writing ONLY blob slices (e.g. seasonal-rate editor writing a new pricing slice, invoice VAT field) = buildable NOW on current architecture.
- Guest-history/CRM deepening = safer AFTER Tier B/guests (guests slice becomes a real table), but read-only views work on blob now.
- Anything that sends data to a guest (confirmation email/SMS, guest-facing link) crosses the security boundary — needs at least a thought-through auth/secret story; don't gate the whole feature on it but flag it.
- Server-authoritative money / atomic refunds = wait for Tier C + RPC.
