# Task 059: Map Build 23916427 To Applicable Mechanic Versions

Status: blocked

Execution mode: autonomous after explicit promotion

Unlocked by: `independent_build_23916427_patch_mapping_evidence_available`

## Blocker

Requires independent evidence that maps Deadlock build `23916427` to one or
more official patches, game-data snapshots, or mechanic-version intervals.

## Objective

Resolve the build-to-patch mapping for build `23916427` so versioned mechanics
rules can be evaluated for replay 009 without assuming current mechanics apply
historically.

## Constraints

- Do not process replay 005.
- Do not process bot fixtures 006, 007, or 008.
- Do not infer patch mapping from date proximity alone.
- Do not apply current wiki rules to historical replay builds without mapping.
- Preserve competing evidence when sources disagree.

## Acceptance Criteria

- Update `knowledge/patches/build-patch-mapping.json`.
- Add or update evidence records in `knowledge/sources/source-index.json`.
- Run knowledge validation and query tests.
- Report whether build `23916427` is mapped, unresolved, or conflict-bound.
