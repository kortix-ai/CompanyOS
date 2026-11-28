---
title: Change requests merge by themselves by default, under a Kortix permission
status: parked, not built (Marko's intent, 2026-11-28)
owner: unassigned
updated: 2026-11-28
---

# Change requests merge by themselves by default, under a Kortix permission

## Problem

An agent's change request waits for a person to press "Merge into main" on its card. In a
long My Kortix session the agent builds, tests and reviews the change, then stops at the card.
The person has to come back, find the card and click. Marko (2026-11-28): the explicit merge
step "sucks"; by default a change request should merge itself.

## Intent

- Default: a change request merges itself once its checks pass.
- The rule is a Kortix permission, so a workspace decides it like any other grant.
- The decision can depend on who opened the change request and when.
- A person can still hold or merge by hand.

## Open questions

1. Which permission: a new one, or a mode of the existing merge permission?
2. Which signals gate it: checks, an independent review verdict, protected paths?
3. What the card shows: "Merged automatically" with an undo window, or nothing.
4. Notifications when an automatic merge fails.

## Where to look

- Change request routes and merge: `apps/api/src` (`integration-change-request-merge-by-number-http.test.ts`
  covers the merge route).
- The card: the change request card in the session transcript (`packages/ui`).
