# Match 91119257 Baseline 709 Parser Continuation

Date: 2026-06-29

## Scope

Task 045 investigated `Baseline not found [ 709 ]` after the entity-5594 missing-update recovery. It did not process replay 005, perform video-demo alignment, or perform semantic gameplay analysis.

## Root Cause

baseline_709_is_referenced_by_entity_create_but_never_registered_in_instancebaseline_store_before_use

Baseline 709 is requested by a CREATE operation after the entity-5594 payload skip, but no instancebaseline table create/update for key 709 is observed before use. The class metadata for class 709 is present enough to name the serializer/class in the packet path, so the immediate failure is missing baseline storage, not missing class metadata.

## Relationship To Entity 5594

The baseline 709 failure is in the same packet sequence after the 5594 recovery, but it is not caused by losing state from the entity-local skip. It is the next independently exposed parser/protocol blocker.

## Recovery

The tested limited recovery records the unresolved baseline dependency and skips only the dependent CREATE payload. It does not register the entity, does not create an empty baseline, does not copy neighboring baselines, and does not fabricate properties.

That recovery is not accepted for full telemetry extraction: after the skip, the parser remains at the 3807/3808 boundary and reaches `Class not found [ 891 ]`, which indicates unresolved packet/protocol synchronization support rather than a safe continuation path.

## Before / After

- Default parser final tick/time: 3807 / 118s
- Entity-only recovery final tick/time: 3807 / 118s
- Baseline-limited recovery final tick/time: 3807 / 118s
- Baseline-limited recovery final error: Class not found [ 891 ]
- Telemetry rows after limited recovery: 118
- Unresolved baseline refs: 1

## Validation

- Later messages decode: false
- Player identities stable: false
- Unresolved baseline-dependent entities flagged: true
- No semantic properties invented: true

## Gate

`baseline_709_protocol_support_blocked`

## Outputs

- `output/match_91119257/baseline-709-trace.jsonl`
- `output/match_91119257/baseline-709-store-snapshots.json`
- `output/match_91119257/baseline-709-failure-reproduction.json`
- `output/match_91119257/baseline-neighborhood-audit.json`
- `output/match_91119257/baseline-709-raw-message-audit.json`
- `output/match_91119257/baseline-709-hypothesis-evaluation.json`
- `output/match_91119257/baseline-709-recovery-experiments.json`
- `output/match_91119257/baseline-709-before-after.json`
- `output/match_91119257/baseline-709-validation.json`
- `output/match_91119257/baseline-709-gate.json`
