# Death Validation Compact Schema

Gate: `death_validation_compact_schema_ready`

Task 157 defined a compact schema for `death_validation`, selected by Task 156
as the first source class safe enough for schema design.

## Schema

Schema path: `schemas/death-validation-compact.schema.json`

The artifact is a single object per replay. It records validation metadata only:
source method, event count, duplicate key count, validation status, limitations,
and policy flags. It does not contain event rows, field values, snapshots,
player arrays, attribution, or gameplay interpretation.

## Validation

Synthetic examples were added:

- `example-valid-artifact.json`
- `example-invalid-artifacts.json`

The test `tests/death-validation-compact-schema.test.mjs` checks required
fields, enum values, no additional properties, rejected invalid examples, and
the distinction between `eventCount` and final death facts.

## Next Milestone

Recommended milestone:
`emit_death_validation_compact_artifact_for_replay_010_011`

This requires a separately authorized task. Task 157 does not emit real
`death_validation` artifacts and does not process any replay.
