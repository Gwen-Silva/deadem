# Task 186 Directional Discrimination Evidence Report

## Outcome

Task 186 passed the technical pilot and bounded-32 gates under
`task185_corrected_directional_discrimination_bounded32_ready`. The new
baseline compares corrected explicit directions around Task 183 anchors with
deterministic matched non-anchor controls. It does not confirm death semantics.

## Integrity Repairs

Bounded execution validates the exact pilot identity and 4/4 technical result
before replay paths are resolved or a parser is constructed. Publication is
all-or-nothing: a failed run emits only blocked metadata in a separate
directory and leaves any successful baseline intact.

Only exact directional pairs can form inverse cycles. Signature recurrence,
unknown respawn direction, changed pawn links, and ambiguity are recurrence
evidence only. Anchor and control cohorts use identical windows and independent
reuse ledgers.

## Task 185 Correction

- Historical complete-cycle anchors: 2,552.
- Corrected anchors with an explicit inverse pair: 2,548.
- Cycle-derived evidence classes changed: 137.
- Anchors supported only by recurrence: 0.
- Corrected uncensored explicit-inverse coverage: 2,297/2,297 (1.0).
- Historical Task 185 classification: remains `partial`.

Historical Task 185 artifacts were not modified.

## Pilot

- Replays parsed: 4/4.
- Anchors/rows: 341/341.
- Controls selected: 341/341.
- Anchor multi-family direction rate: 1.0.
- Control multi-family direction rate: 0.049853.
- Uncensored anchor inverse rate: 1.0.
- Control inverse rate: 0.035191.
- Assessment: `strong`.

## Bounded-32

- Replays parsed: 32/32.
- Anchors/rows: 2,552/2,552.
- Controls selected: 2,552/2,552.
- Anchor explicit-direction rate: 1.0.
- Control explicit-direction rate: 0.038793.
- Anchor multi-family direction rate: 1.0.
- Control multi-family direction rate: 0.021552.
- Uncensored anchor explicit-inverse rate: 1.0.
- Control explicit-inverse rate: 0.021552.
- Multi-family and inverse absolute differences: 0.978448.
- Anchor/control recurrence-only rates: 0/0.002351.
- Anchor/control censored counts: 255/0.
- Anchor/control ambiguity counts: 0/1.
- Assessment: `strong`.

Health, boolean-like alive, and respawn boundary families discriminate strongly
under the operational criteria. Pawn-link presence had zero explicit-direction
coverage in both cohorts and contributed nothing to the strong result.

The run passed schema, policy, mapping, bridge, protection, reuse, control
selection, parser, and size audits. Total run content was 10,094,345 bytes,
with every per-replay artifact below 512 KiB. Final facts and attribution were
zero.

## Readiness

`readyForFinalDeathSemanticContractDesign` is true only because the predeclared
operational discrimination criteria passed. A future separately authorized
task may design further semantic validation. Ready-for-final-death,
confirmed-who-died, attribution, killer/victim, teamfight, and gameplay
interpretation states remain false.
