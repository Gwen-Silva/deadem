# Replay build and map compatibility

## Summary

Task 019 extracted deterministic structural fingerprints for the five replay inventory without using occupancy performance, transition evidence, model quality, or replay 005 outcomes.

Gate result:

```text
build_map_compatibility_ready_for_pipeline_parameterization
```

Direct build and map metadata remain absent from parser-exposed metadata for all five replays. This absence is recorded as uncertainty, not as evidence of different builds or maps.

## Direct metadata

Direct build metadata:

- `replay_001`: absent from parser-exposed metadata
- `replay_002`: absent from parser-exposed metadata
- `replay_003`: absent from parser-exposed metadata
- `replay_004`: absent from parser-exposed metadata
- `replay_005`: absent from parser-exposed metadata

Direct map metadata:

- `replay_001`: absent from parser-exposed metadata
- `replay_002`: absent from parser-exposed metadata
- `replay_003`: absent from parser-exposed metadata
- `replay_004`: absent from parser-exposed metadata
- `replay_005`: absent from parser-exposed metadata

Missing parser properties were not treated as proof that replay metadata does not exist in the file.

## Schema compatibility

All five replays share the same structural schema fingerprint:

```text
653ba0e9ef31d98c349582b834933d7b6a00f5edf7f467f621ef800da9216174
```

The fingerprint uses stable parser/schema evidence: class names, serializer counts, string-table names, parser message inventory, critical class signatures, and non-volatile serializer field summaries.

Approved pre-geometry conclusion: parser/schema/timeline/identity stages can be parameterized safely with replay-specific inputs and output directories.

## Geometry compatibility

Each replay currently has a distinct geometry fingerprint:

- `replay_001`: `e8c0ebb45b69032ad707af97596ff7386b12e30e8466d700009895984709629d`
- `replay_002`: `e4bd639fafea9fbfd13658c261db47d820ef87391469d387dbee6fde2aa00b13`
- `replay_003`: `a01caf57a09f8b688ba62ca9fd3f130e764eb674c70ca6a579fa65692c7a2459`
- `replay_004`: `9c73a888cbad2be5058679ef03139b62fe1451e5d305aec8ba23f87aeb773789`
- `replay_005`: `9218296417b3b602e8ac5ad21b7c55076e59683301366abc09b288e7c547319d`

These geometry fingerprints are structural and conservative. They do not prove different maps; they prove only that geometry-profile reuse is not yet validated.

No geometry profile is named `build_6592`.

## Pairwise compatibility

Pairwise matrix checks passed symmetry validation.

All replay pairs have:

- direct build agreement: `insufficient_evidence`
- direct map agreement: `insufficient_evidence`
- schema fingerprint agreement: true
- critical field signature agreement: true
- event descriptor agreement: true
- common pipeline code may be reused: true

No replay pair currently has shared geometry-profile reuse approved.

## Stage decisions

Approved for pre-geometry parameterization:

- replay loading
- player field discovery
- snapshot normalization
- controller/pawn lifecycle
- clock discovery
- tick reconciliation
- data-quality audit
- canonical timeline
- hero identity
- direct build identification
- raw movement coordinates

Still gated by geometry profiles:

- lane mapping
- topology
- spatial regions
- movement region interpretation
- occupancy

## Replay 005 protection

Replay 005 was inspected only for parser metadata, structural schema, map identity evidence, and geometry fingerprint components.

It was not used for thresholds, geometry calibration, model selection, occupancy quality, episode metrics, transition candidates, or strategy outcomes.

Metadata compatibility does not consume its final-holdout role.

## Next executable task

Task 020 should parameterize and run only the pre-geometry common pipeline first on `replay_002`, then on `replay_003` and `replay_004` if replay 002 succeeds.

Do not process replay 005 beyond existing metadata.

## Validation

Commands run:

```bash
node scripts\replay-build-map-compatibility.js
```

Additional validation commands are recorded in the task completion commit.
