# Task 062: Extract Replay 009 Objective And Structure Entity Observability

Status: blocked

Unlocked by: explicit user authorization after Task 060 review

Blocked by: explicit authorization after Task 060 review

## Context

Task 060 completed factual replay-state detection in partial non-spatial mode.
It validated player life/death/respawn states and net-worth endpoints, but could
not classify objective or structure factual states because compact replay-009
outputs do not expose a dedicated entity/class/property inventory for those
mechanics.

Task 061 did not validate map transform, regions, lanes, objective geometry,
structure geometry, or proximity. This task must not attempt to recover those
spatial layers.

Build `23916427` remains unresolved. Mechanic activation and mechanic effects
remain blocked.

## Objective

Create a compact non-spatial replay-009 entity observability inventory for
pilot objective and structure candidates:

- Spirit/Soul Urn
- Mid Boss
- Rejuvenator
- Guardians
- Walkers
- Patron/base structures

The task must determine which entity classes, serializers, and raw properties
are directly observable for these candidates without applying mechanic effects
or spatial interpretation.

## Constraints

- Use only replay 009.
- Do not process replay 005.
- Do not process bot fixtures 006, 007, or 008.
- Do not infer objective positions, map regions, lanes, proximity, deposits,
  contest state, pressure, or macro decisions.
- Do not apply any ambiguous mechanic rule for build `23916427`.
- Do not treat disappearance/deletion as secured/killed/claimed unless a direct
  raw property or event supports that exact factual state.

## Required Outputs

- `output/replay-009-states/objective-structure-entity-observability.json`
- `output/replay-009-states/objective-structure-property-inventory.json`
- `output/replay-009-states/objective-structure-lifecycle-candidates.jsonl`
- `output/replay-009-states/objective-structure-observability-validation.json`
- `reports/replay-009-objective-structure-entity-observability.md`

## Gate

Produce exactly one:

- `replay_009_objective_structure_observability_ready`
- `replay_009_objective_structure_observability_ready_with_gaps`
- `replay_009_objective_structure_observability_not_ready`
- `replay_009_objective_structure_observability_blocked`

## Validation

- focused entity/property inventory tests;
- JSON/JSONL validation;
- deterministic rerun;
- replay 005 exclusion verification;
- bot fixture exclusion verification;
- task queue validation;
- documentation-link validation;
- Git status validation.
