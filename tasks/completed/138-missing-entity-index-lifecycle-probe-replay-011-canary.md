# Task 138 - Run Index Lifecycle Probe Replay 011 Canary

Status: completed

Gate: `missing_entity_index_lifecycle_probe_replay_011_canary_ready`

## Objective

Run a replay_011-only canary for the Task 136
`diagnostic_index_lifecycle_probe_only` extension on
`recovery.diagnoseMissingEntityFailClosed`.

## Result

The default pass still reaches:

`Unable to find an entity with index [ 5624 ]`

The diagnostic pass used only:

```json
{
  "recovery": {
    "diagnoseMissingEntityFailClosed": true
  }
}
```

It recorded one compact `missing_entity_fail_closed` diagnostic and still
threw the same missing-entity error.

Boundary captured:

- packet ordinal: 1052
- loop: 28
- updated entries: 34
- operation: UPDATE
- entity index: 5624
- previous entity index: 2681
- index delta: 2942
- payload bits: 133
- read counts: before index 5212, after index 5226, after command 5228, after action 5228
- entityData bit length: 5848

Lifecycle/classification result:

- `lifecycleEvidenceSummary` present
- `classificationCandidate`: `not_determined`
- `classificationConfidence`: `not_applicable`
- `rawDataCaptured`: false

## Scope Held

Only replay_011 was processed. Replay_010, replay 005, replays 006-008,
candidates 012-020, samples, and output/replays were not accessed or
processed.

Parser, engine, and `packages/deadem/**` were not modified. No recovery, skip
mode, placeholder entity, fake fields, synthetic registry state, parser
continuation after failure, canonical facts, source artifacts, match facts,
spatial/macro/mechanics/fight/decision/ML outputs, Java, Clarity, external
parser, WSL, iaflow, or Product Reviewer automation were used.
