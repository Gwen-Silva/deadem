# Task 186 - Repair Directional-Cycle Integrity And Build Matched Negative-Control Discrimination Baseline

Status: completed

Gate: `task185_corrected_directional_discrimination_bounded32_ready`

Commit: pending (this task commit)

## Result

- Recorded Task 185 commit `8ca6d50fd99fdc6fc4b802ab3af2e74b06f4796e`.
- Preserved historical Task 185 artifacts and its technical gate while marking
  cycle-derived aggregates for corrected interpretation.
- Restricted inverse cycles to exact health, boolean-like alive, respawn
  boundary, and pawn-link presence direction pairs.
- Kept life-state signature, unknown respawn, changed pawn link, and ambiguous
  direction observations as recurrence only.
- Enforced the exact successful pilot gate before bounded replay-path
  resolution or parser construction.
- Verified failed runs publish zero per-replay artifacts and preserve previous
  successful run directories.
- Added deterministic same-replay, same-participant, same-quartile matched
  controls evaluated independently from the anchor cohort.

## Historical Task 185 Correction

The bounded Task 185 artifacts previously reported 2,552 anchors with a
complete-cycle family. Corrected row recalculation found 2,548 anchors with at
least one exact explicit inverse pair and changed 137 cycle-derived evidence
classes. All 2,297 uncensored anchors retained at least one corrected explicit
inverse pair. Zero anchors were supported only by recurrence, and the historical
Task 185 `partial` classification remains unchanged.

## Runs

The pilot processed only replay_010, replay_011, replay_021, and replay_036. It
completed 4/4 parsers, emitted 341 anchor rows, attempted 341 controls, selected
341 controls, and passed every technical gate.

The bounded-32 run processed replay_001 through replay_004, replay_009, and
replay_010 through replay_036, including replay_020. It completed 32/32 parsers,
emitted exactly 2,552 anchor rows, and selected 2,552 matched controls.

Bounded aggregate measurements:

- anchor multi-family explicit-direction rate: 1.0;
- matched-control multi-family direction rate: 0.021552;
- uncensored anchor explicit-inverse rate: 1.0;
- matched-control explicit-inverse rate: 0.021552;
- both anchor-minus-control differences: 0.978448;
- control-selection coverage: 1.0;
- anchor/control ambiguity counts: 0/1;
- discrimination assessment: `strong`.

Pawn-link presence produced no explicit direction in either cohort. The strong
assessment is operational discrimination evidence only, not proof of death
truth. It makes a separate semantic-contract design eligible but does not emit
or authorize final facts.

## Baselines And Boundaries

Tasks 180, 182, 183, and 184 remain active. Task 185 remains the active
observation baseline, with Task 186 correcting its cycle aggregates and
superseding it only for directional discrimination. Task 186 introduces
`death_event_directional_discrimination_evidence_bounded32_task186`.

Final deaths, confirmed who-died claims, attribution, killer/victim, teamfight
detection, and gameplay interpretation remain false. Replay 005 and bot
fixtures 006-008 remained untouched.
