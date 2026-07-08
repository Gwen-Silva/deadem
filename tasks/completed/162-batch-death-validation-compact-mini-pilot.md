# Task 162 - Batch Death Validation Compact Mini-Pilot

Status: completed

Gate: `batch_death_validation_compact_mini_pilot_emitted`

Commit message: `Run controlled batch death validation compact mini pilot`

## Summary

Task 162 implemented `tools/emit-batch-death-validation-compact-artifacts.mjs`
and the npm script `emit:batch-death-validation-compact`.

The batch runner requires a task-specific manifest with explicit allowlist,
`mode: death_validation_compact_emission`, `realArtifactsAuthorized: true`, and
`allowedArtifactClass: death_validation`. Replay protection is evaluated before
replay filesystem access.

## Emitted Artifacts

Exactly one compact `death_validation.json` artifact was emitted for each
authorized replay:

- replay_010: `eventCount: 45`, `duplicateKeyCount: 0`
- replay_011: `eventCount: 80`, `duplicateKeyCount: 0`

`eventCount` remains a compact count of source-observed death counter transition
candidates. It is not a final death count and does not imply killer, victim,
assist, fight, objective, causality, or gameplay truth.

## Validation

Schema validation passed for both artifacts using
`schemas/death-validation-compact.schema.json`.

Output policy audit passed. Size audit passed.

## Protections

Only replay_010 and replay_011 were processed. replay 005, replays 006-008,
candidates 012-020, `samples/**`, and `output/replays/**` were not accessed or
processed. No `death_events`, `respawn_events`, timelines, objective lifecycle,
player identity rows, killer/victim/assist attribution, field values, raw replay
bytes, raw payloads, raw entityData, raw serializedEntities, string values,
snapshots, full entity histories, source/canonical/match final facts, gameplay
interpretation, spatial/macro/mechanics/fight/decision/ML output,
parser/engine behavior change, `packages/deadem/**` change, recovery, skip,
placeholder, default behavior change, parser opt-in, Java, Clarity, external
parser, WSL, iaflow, Product Reviewer automation, pull, merge, cherry-pick,
rebase, or Task 163 was produced.
