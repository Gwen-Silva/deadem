# One-Second Multi-Replay Spatial Extraction

## Timeout profile

Replay 002 was profiled with one-second sampling instrumentation. Largest measured contributors:

- playerReconciliationMs: 4317.46 ms
- entityUpdateMs: 838.15 ms
- replayParsingMs: 743.07 ms
- timelineMaterializationMs: 19.33 ms
- serializationMs: 11.96 ms
- laneProjectionMs: 7.03 ms

The optimized pipeline processes each replay sequentially with `nextTick()`, streams rows into per-player JSONL shards, precomputes lane-axis segment data, batches serialization through open file handles, and retains only quality accumulators plus current player state.

## Processing status

- replay_001: 35904 rows, 12 shards, 30.36s, 100% direct, 0% missing.
- replay_002: 22020 rows, 12 shards, 19.1s, 100% direct, 0% missing.
- replay_003: 27360 rows, 12 shards, 23.71s, 100% direct, 0% missing.
- replay_004: 24156 rows, 12 shards, 20.6s, 100% direct, 0% missing.

## Five-second alignment

- replay_001: aligned_with_expected_movement_resolution_differences, mismatches {"missingOneSecondRow":0,"identity":0,"coordinates":12,"laneProjection":6019,"structuralRegions":8,"movementComparable":6128}.
- replay_002: aligned_with_expected_movement_resolution_differences, mismatches {"missingOneSecondRow":0,"identity":0,"coordinates":12,"laneProjection":12,"structuralRegions":6,"movementComparable":3834}.
- replay_003: aligned_with_expected_movement_resolution_differences, mismatches {"missingOneSecondRow":0,"identity":0,"coordinates":12,"laneProjection":12,"structuralRegions":9,"movementComparable":4568}.
- replay_004: aligned_with_expected_movement_resolution_differences, mismatches {"missingOneSecondRow":0,"identity":0,"coordinates":12,"laneProjection":12,"structuralRegions":6,"movementComparable":4332}.

## Repeatability

Replay 002 repeatability: shard hash true, row count true, quality true.

## Gate

`one_second_spatial_ready_with_limitations`

## Prohibited conclusions

Semantic lane occupancy, reliable episodes, transitions, rotations, strategic interpretation, and replay 005 conclusions remain prohibited.
