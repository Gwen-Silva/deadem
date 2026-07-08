# Task 157 - Death Validation Compact Schema

Status: completed

Gate: `death_validation_compact_schema_ready`

Commit message: `Design death validation compact schema`

## Summary

Task 157 defined the compact `death_validation` schema selected by Task 156. The
schema is a single-object-per-replay contract for validation metadata only.

## Created

- `schemas/death-validation-compact.schema.json`
- `tests/death-validation-compact-schema.test.mjs`
- synthetic valid and invalid examples under
  `output/local-replay-processing/death-validation-compact-schema/`

## Key Policy

`eventCount` is a count of source-observed counter-transition candidates, not
proof of death causality and not a final death fact. The schema forbids event
rows, field values, raw values, snapshots, player arrays, killer/victim/fight
attribution, objective attribution, and gameplay interpretation strings.

## Next Milestone

Recommended next milestone:
`emit_death_validation_compact_artifact_for_replay_010_011`.

A future task may emit real compact `death_validation` summaries for replay_010
and replay_011 only if separately authorized and if it preserves one object per
replay, no event rows, no field values, schema validation, and pre/post output
policy audit.

## Protections

No replay was processed. replay_010, replay_011, replay 005, 006-008,
candidates 012-020, `samples/**`, and `output/replays/**` were not accessed or
processed. Parser/engine behavior and `packages/deadem/**` were not modified.
No extraction implementation, real `death_validation` artifact, source facts,
canonical facts, match facts, gameplay interpretation output, parser fix,
recovery, skip, placeholder, default behavior change, new opt-in, Java, Clarity,
external parser, WSL, iaflow, Product Reviewer automation, pull, merge,
cherry-pick, rebase, or Task 158 was produced.
