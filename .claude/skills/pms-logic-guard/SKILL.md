---
name: pms-logic-guard
description: >-
  Fix number and business-logic bugs in a client-side PMS (Next.js App Router +
  Zustand + TypeScript) by treating them as duplicated-logic problems, not local
  typos. Use whenever a reported bug is about a number being WRONG or
  INCONSISTENT between two places — e.g. "the daily report total doesn't match
  the front-desk badge", "outstanding balance is off", "add-on revenue is
  leaking at checkout", "the paid/unpaid status is wrong", "ยอดค้างชำระไม่ตรงกัน",
  "ตัวเลขในรายงานเกินจริง". Also use when the user asks to fix one specific
  calculation but the same concept (a total, a count, a status, an availability
  check) is likely computed in several files with slightly different rules. The
  instinct to patch only the reported spot is exactly what creates these bugs;
  this skill consolidates the logic into one source of truth instead. Trigger
  even if the user just says "fix this calc" without mentioning duplication.
---

# PMS Logic Guard

## The core insight

In this PMS the painful bugs are almost never arithmetic mistakes. They are
**the same concept computed in several places with divergent rules.** One idea —
"outstanding balance", "add-on total", "is this booking paid", "rooms available"
— gets re-implemented inline by whoever built each page. Each author picks a
slightly different filter (`status === 'fulfilled'` here, `!== 'cancelled'`
there, no filter at all somewhere else). The numbers then disagree, and because
nothing crashes, the bug is **silent**: no red error, no stack trace, just a
total that looks plausible but is wrong.

This has two consequences that shape everything below:

1. **The reported location is not necessarily the broken one.** "The daily
   report is too high" might mean the report is wrong, or that it's the only
   honest one and four other places are under-counting. You cannot know until
   you have looked at all of them side by side.
2. **Patching the one reported spot makes it worse.** It adds a sixth variant of
   the rule. This is why the same bug keeps coming back in a new costume. The
   real fix is structural: collapse all the variants into one function everyone
   imports.

So the job is not "make this number right here". It is "find every place this
concept is computed, agree on one rule, and make all of them call it."

## Stack assumptions

- Next.js 14 App Router (`app/` dir), React 18, TypeScript (strict).
- `types/index.ts` is the single source of truth for the data model. Lean on it.
- State is Zustand 5 with `persist` → everything lives in `localStorage`
  (`hotel-pms-storage`). No backend; mock data in `lib/mock-data.ts`.
- A critical Zustand+persist gotcha: **derived numbers must never be stored.** If
  an outstanding balance or a "paid" flag is written into the persisted state,
  it goes stale the moment anything upstream changes, and a stale value survives
  reloads because it's in localStorage. Derived values are *computed on read*,
  never persisted. If you find a derived figure sitting in the store, that's a
  bug to flag, not a value to trust.

## Workflow

### 1. Reframe before touching anything

When a bug report names a number ("X is wrong on page Y"), do not open page Y and
fix it. First ask: *what concept is this, and where else is it computed?* Name the
concept in plain domain terms (e.g. "outstanding balance of a booking",
"total add-on revenue", "occupancy count for a date"). That name is what you'll
hunt for.

Resist the urge to fix early even if the local mistake is obvious. A local fix
that doesn't reconcile with the other call sites just relocates the bug.

### 2. Find every place the concept is computed

The concept is expressed through the data model, so search for the **fields and
predicates**, not just comments. For an add-on / payment example you'd grep for
things like:

- the field accessors: `addOns`, `.amount`, `.price`, `paid`, `payments`,
  `status`
- the literal predicates that encode the rule: `'cancelled'`, `'fulfilled'`,
  `'pending'`, and the operators around them (`=== 'fulfilled'`,
  `!== 'cancelled'`)
- the aggregation shapes: `.filter(`, `.reduce(`, `.map(` over those collections

Search broadly, then triangulate — one grep rarely finds them all. Look in the
usual habitats:

- the Zustand store (selectors, actions like `recordPayment`)
- every `app/**/page.tsx` and the components they render (badges, totals, summary
  cards)
- report / export modules (daily report, finance, the ExcelJS `.xlsx` exporters)
- the checkout / front-desk flow, where money actually changes hands

Keep going until you're confident you have all of them. Missing one is how the
bug survives the fix.

### 3. Build the divergence table

Lay the call sites side by side. This single artifact is what turns an invisible
bug into an obvious one — it's the same table a careful human would draw by hand:

| Location (file → fn) | What the user sees | Filter / rule used | Effect |
|---|---|---|---|
| `store → recordPayment` | "paid in full" check | counts only `fulfilled` | marks paid too early |
| `lib/reports → dailyReport` | daily revenue total | counts `cancelled` too | over-counts |
| `app/bookings → StatusBadge` | status pill | ignores add-ons entirely | badge disagrees |
| *intended (front-desk)* | amount owed | `status !== 'cancelled'` | the correct rule |

Present this table to the user. It makes the disagreement undeniable and frames
the real question, which is step 4.

### 4. Decide the canonical rule — and say so out loud

The correct rule is a **business decision**, and only the user truly owns it
(should a cancelled add-on count toward revenue? toward what the guest owes?).
You are consolidating automatically, but consolidating onto the *wrong* rule just
makes every page consistently wrong.

So infer the most defensible rule from the evidence — the call site the user
implies is correct, the domain meaning (an "amount owed" includes everything not
cancelled), the data model — and then **state the chosen rule explicitly at the
top of your change**, in one sentence, e.g.:

> Canonical rule: a booking's outstanding balance counts every add-on whose
> status is not `'cancelled'`. I picked this to match the front-desk view; tell
> me if cancelled-but-already-charged add-ons should still count.

This costs one sentence and lets the user veto a wrong assumption before it's
baked into ten files.

### 5. Consolidate into one source of truth

Create one canonical, **pure** function per concept and route every call site
through it.

- **Placement:** follow the existing structure. If there's already a `lib/`
  helper module for domain math, add there; if selectors live in the store, a
  selector is fine. If nothing exists, create a small module (e.g.
  `lib/calculations/booking.ts`). Co-locate related calcs (`outstandingBalance`,
  `amountPaid`, `addOnTotal`, `paymentStatus`) so the rules sit together and
  can't drift apart again.
- **Pure functions over the typed entity:** `outstandingBalance(b: Booking):
  number`. No store access, no React, no I/O — that makes it trivially testable
  and reusable from a report, a badge, and the store alike.
- **Make divergence impossible with the type system.** This is the part that
  actually stops the bug from coming back. When the rule branches on a status
  union, use an exhaustive `switch` with a `never` default:

  ```ts
  function countsTowardOwed(status: AddOnStatus): boolean {
    switch (status) {
      case 'pending':
      case 'fulfilled':
        return true
      case 'cancelled':
        return false
      default: {
        const _exhaustive: never = status
        return _exhaustive
      }
    }
  }
  ```

  Now adding a new add-on status to `types/index.ts` produces a **compile
  error** at the one place the rule lives, instead of silently doing the wrong
  thing in five places. The data-model source of truth and the logic source of
  truth reinforce each other.
- **Replace and delete.** Swap each inline computation for a call to the
  canonical function and remove the old inline logic entirely. Leaving a dead
  copy invites someone to "fix" it later and re-fork the rule.

### 6. Regression sweep

Because the failure is silent, you must actively re-check, not wait for an error.
Walk back through every consumer from the divergence table and confirm it now
reflects the canonical rule. Reason through the cases that exposed the
disagreement in the first place:

- a booking with a **cancelled** add-on
- a **fully paid** booking
- a **partially paid** booking
- a booking with **no** add-ons

Confirm the badge, the daily report, the checkout total, and the front-desk view
all agree across those cases. A tiny pure unit test over those cases is cheap and
worth adding, since the function is pure.

### 7. Leave a guardrail

State the new convention briefly so the next feature doesn't re-fork the logic:
"all add-on / balance math goes through `lib/calculations/booking.ts`; don't
inline it." If it helps, drop a one-line comment where the old logic used to
live.

## Generalize beyond money

The worked example is add-on / outstanding balance, but the pattern is the same
for any concept computed in more than one place: occupancy and availability
counts, date-range overlaps for bookings, revenue roll-ups, "is this room
free tonight". Whenever a number disagrees between two screens, suspect divergent
duplicated logic first, and run this same loop: find all sites → table → one rule
→ one pure function → sweep.

## What success looks like

The user stops playing whack-a-mole. One concept = one function = one rule, the
type system blocks future drift, and a number that's right on one screen is right
on all of them.
