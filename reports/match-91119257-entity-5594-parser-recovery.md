# Match 91119257 Entity 5594 Parser Recovery

Date: 2026-06-29

## Scope

Task 044 investigated the parser failure near tick 3808 / 119 seconds for entity index 5594. It did not perform visual review, video-demo alignment, replay 005 processing, macro analysis, lane occupancy, rotations, fights, objectives, or decision inference.

## Root Cause

packet_entity_update_references_missing_entity_5594_before_any_observed_create_in_registry

The first observed entity-5594 packet reference is an UPDATE while entity 5594 is missing from the registry. The failure occurs before serializer/class metadata is used for that entity, so missing class metadata or baseline data are not supported as the immediate cause.

## Reproduction

- Last valid packet tick: null
- First failing tick/time: 3808 / 119s
- Error: Unable to find an entity with index [ 5594 ]
- Entity 5594 lifecycle result: no creation or deletion was observed before the missing UPDATE in the bounded trace.

## Recovery

The accepted experimental recovery skips only the invalid missing-entity UPDATE payload when serializedEntities exposes the entry payload size. It records the unresolved reference, does not create entity 5594, and preserves the rest of the packet stream.

## Before / After

- Baseline final tick/time: 3807 / 118s
- Recovered final tick/time: 3807 / 118s
- Previous whole-packet skip warnings: 1001
- Recovered unresolved references: 4
- Baseline telemetry rows: 119
- Recovered telemetry rows: 118

## Validation

- Telemetry extends beyond 150s: false
- Later visual-anchor time ranges are reachable: {"nearE083_1395s":false,"nearE088Corrected_1490s":false}
- No time reversal: true
- Catastrophic coordinate discontinuities counted: 0

## Gate

`entity_5594_root_cause_confirmed`

## Outputs

- `output/match_91119257/entity-5594-trace.jsonl`
- `output/match_91119257/entity-5594-registry-snapshots.json`
- `output/match_91119257/entity-5594-failure-reproduction.json`
- `output/match_91119257/entity-5594-hypothesis-evaluation.json`
- `output/match_91119257/entity-5594-recovery-experiments.json`
- `output/match_91119257/parser-recovery-before-after.json`
- `output/match_91119257/parser-recovery-validation.json`
- `output/match_91119257/parser-recovery-gate.json`
