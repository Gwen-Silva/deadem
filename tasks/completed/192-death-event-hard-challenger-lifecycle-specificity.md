# Task 192 - Hard-Challenger Lifecycle Specificity Evidence

Status: completed
Execution mode: codex

## Objective

Compare Task 183 anchor lifecycles with replay-sourced structural challengers
outside anchor exclusion windows without treating challengers as negatives.

## Result

Pilot and bounded-32 published atomically. Bounded-32 retained the exact 32
human replay membership and 2,552 anchor rows. Only two primary-window
structural challengers survived the declared eligibility and exclusion rules.
Both completed the observed lifecycle, so the 30-second paired difference is
zero and specificity is `insufficient`.

The corrected horizon calculation uses Task 190 horizon-specific eligibility
and lifecycle fields. At 10 seconds, matched anchor/challenger rates are
0.5/1.0, rather than reusing the 30-second anchor status.

Observations at the same replay, participant and actual forward-transition
second are one structural cluster, including different control references that
converge after applying their family-specific deltas. Matching, exclusion and
reuse use that identity while preserving event and control provenance.

This is a measurement limitation, not evidence that challengers are deaths or
non-deaths. Source reuse, protected replay access, final facts and attribution
are zero. Final acceptance remains pending ChatGPT Work validation.
