# Task 168 - Emit Exact 15 Death Validation Compact Artifacts

Status: completed

Gate: `exact_15_death_validation_compact_emitted`

Commit message: `Emit exact 15 death validation compact artifacts`

Task 168 added `tools/emit-exact-15-death-validation-compact-artifacts.mjs`
and the npm script `emit:exact-15-death-validation-compact`. The runner uses
the Task 167 selection at
`output/local-replay-processing/exact-15-death-validation-selection/selected-replay-set.json`,
validates the exact allowlist before filesystem access, processes only the
authorized 15 replays, validates all candidate artifacts in memory, and writes
real artifacts only after all 15 pass parser completion, schema validation,
output policy, and size audit.

Artifacts emitted:

- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_001/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_002/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_003/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_004/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_009/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_010/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_011/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_012/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_013/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_014/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_015/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_016/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_017/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_018/death_validation.json`
- `output/local-replay-processing/exact-15-death-validation-compact-emission/artifacts/replay_019/death_validation.json`

Compact results:

- replay_001: eventCount 109, duplicateKeyCount 0
- replay_002: eventCount 53, duplicateKeyCount 0
- replay_003: eventCount 117, duplicateKeyCount 0
- replay_004: eventCount 58, duplicateKeyCount 0
- replay_009: eventCount 84, duplicateKeyCount 0
- replay_010: eventCount 45, duplicateKeyCount 0
- replay_011: eventCount 80, duplicateKeyCount 0
- replay_012: eventCount 81, duplicateKeyCount 0
- replay_013: eventCount 68, duplicateKeyCount 0
- replay_014: eventCount 77, duplicateKeyCount 0
- replay_015: eventCount 102, duplicateKeyCount 0
- replay_016: eventCount 73, duplicateKeyCount 0
- replay_017: eventCount 89, duplicateKeyCount 0
- replay_018: eventCount 103, duplicateKeyCount 0
- replay_019: eventCount 60, duplicateKeyCount 0

`eventCount` remains a compact count of source-observed death-counter
transition candidates, not final death facts. The artifacts contain no event
rows, field values, identities, killer/victim/assist attribution, raw replay
bytes, raw payloads, raw entityData, raw serializedEntities, string values,
snapshots, full entity histories, source/canonical/match final facts, or
gameplay interpretation.

Only replay_001, replay_002, replay_003, replay_004, replay_009, and
replay_010 through replay_019 were processed. replay_005 was not accessed or
processed; replay_006 through replay_008 were not processed; replay_020 was
not accessed or processed. No parser/engine behavior, `packages/deadem/**`,
recovery, skip mode, placeholder, default behavior, parser opt-in,
Java/Clarity/external parser, WSL, iaflow, Product Reviewer automation,
pull/merge/cherry-pick/rebase, or Task 169 was produced.

Recommended next action:
review how the 15 compact `death_validation` artifacts should be consumed or
summarized without creating gameplay interpretation or broader
source/canonical/match facts.
