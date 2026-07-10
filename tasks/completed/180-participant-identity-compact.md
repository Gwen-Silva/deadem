# Task 180 - Participant Identity Compact

Status: completed

Gate: `participant_identity_compact_bounded32_ready`

## Result

Task 180 created the compact `participant_identity` schema and runner, added
unit tests, ran the 4-replay mini-pilot, and then ran the bounded-32 active
baseline from Task 177.

The mini-pilot emitted 4 compact artifacts and passed schema validation, output
policy, size audit, and protection audit.

The bounded-32 run emitted 32 compact artifacts and passed schema validation,
output policy, size audit, and protection audit.

## Files Added

- `schemas/participant-identity-compact.schema.json`
- `tools/emit-participant-identity-compact-artifacts.mjs`
- `tests/participant-identity-compact-schema.test.mjs`
- `tests/emit-participant-identity-compact-artifacts.test.mjs`
- `reports/participant-identity-compact-task180.md`
- `output/local-replay-processing/participant-identity-compact/task180-gate.json`
- `output/local-replay-processing/participant-identity-compact/task180-summary.json`
- `output/local-replay-processing/participant-identity-compact/task180-pilot/`
- `output/local-replay-processing/participant-identity-compact/task180-bounded32/`

## Scope Confirmation

Processed only explicit Task 180 manifests:

- pilot: `replay_010`, `replay_011`, `replay_021`, `replay_036`
- bounded-32: `replay_001`, `replay_002`, `replay_003`, `replay_004`,
  `replay_009`, and `replay_010` through `replay_036`

Did not access or process:

- `replay_005`
- `replay_006` through `replay_008`
- any replay outside the manifests

Did not emit:

- new `death_validation.json`
- new `semantic_foundation.json`
- death events
- respawn events
- timelines
- objective lifecycle
- player, hero, or team names
- raw entity IDs
- raw handles
- account IDs
- Steam IDs
- raw player slots
- raw hero IDs
- raw team numbers
- field values
- map positions
- event rows
- attribution
- source/canonical/match final facts
- gameplay interpretation

Did not modify parser/engine behavior or `packages/deadem/**`.

## Readiness

Bounded-32 coverage:

- participant identity: available for 32/32
- hero refs: available for 32/32
- team refs: available for 32/32
- time foundation: available for 32/32
- life-state foundation: available for 32/32
- active replay-sourced transition baseline: Task 182
- normalized death-event candidate baseline: Task 183
- replay-sourced corroboration evidence consumer: Task 184
- final death facts and attribution: not ready
- attribution: not ready

## Next Step

Build the first policy-safe `alive_dead_respawn` artifact. Do not jump directly
to canonical death events, attribution, or teamfight detection.
