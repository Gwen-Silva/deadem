# Task 079: Acquire Replay 009 Walker Lane-Only Identity Capture

Status: completed

Execution mode: autonomous after explicit authorization and new lane-specific evidence

Blocked by: direct non-coordinate evidence linking at least one named-team Walker handle to Yellow, Blue, or Green lane

Unlocked by: explicit user authorization plus new non-coordinate lane evidence for at least one replay-009 `CNPC_Boss_Tier2` handle

## Objective

Acquire the smallest missing non-coordinate evidence that links at least one replay-009 `CNPC_Boss_Tier2` Walker handle with supported named team identity to a named lane Walker landmark.

## Constraints

Do not use coordinate signs, map positions, symmetry, nearest landmarks, residuals, permutation search, regions, proximity, mechanic effects, replay 005, or bot fixtures 006-008.

## Acceptance Criteria

At least one Walker handle has a named faction and lane identity before any transform fitting, or the task documents that the evidence remains unavailable.

## Required outputs

- `output/replay-009-walker-lane-controlled-evidence/source-availability.json`
- `output/replay-009-walker-lane-controlled-evidence/replay-client-compatibility.json`
- `output/replay-009-walker-lane-controlled-evidence/map-identity-extraction.json`
- `output/replay-009-walker-lane-controlled-evidence/controlled-video-observations.json`
- `output/replay-009-walker-lane-controlled-evidence/transferability-assessment.json`
- `output/replay-009-walker-lane-controlled-evidence/walker-lane-decisions.json`
- `output/replay-009-walker-lane-controlled-evidence/transform-prerequisite-decision.json`
- `output/replay-009-walker-lane-controlled-evidence/summary.json`
- `output/replay-009-walker-lane-controlled-evidence/gate.json`
- `output/replay-009-walker-lane-controlled-evidence/README.md`
- `reports/replay-009-walker-lane-controlled-evidence.md`

## Required validation

- Six-Walker coverage tests.
- New-source requirement tests.
- Replay/build compatibility tests.
- Exact identifier join tests.
- Visual-correlation uniqueness tests.
- Transferability-boundary tests.
- No-coordinate-derived identity tests.
- No-permutation tests.
- No-residual tests.
- No-transform tests.
- Fit/validation eligibility tests.
- JSON validation.
- Deterministic rerun.
- ESLint.
- `npm.cmd test`.
- Task queue validation.
- Markdown/link validation.
- Git status validation.

## Stop conditions

Stop with a bounded evidence-unavailable or capture-blocked gate if permitted
new sources cannot provide replay-009-specific handle-to-lane identity. Do not
repeat broad identity searches from Tasks 077-078 without genuinely new source
evidence.
