# Multi-Replay Geometry Profile Analysis

## Source inventory

Task 021 loaded replays 001-004 only. Replay 005 was not parsed for coordinates, structures, anchors, objectives, movement, or geometry.

- replay_001: 1427 candidate anchors, 1340 stable anchors, 270 strong structural anchors, bounds x -3943.98..7247.98, y -823.97..1951.97, z -513.52..1020.78
- replay_002: 1448 candidate anchors, 1384 stable anchors, 273 strong structural anchors, bounds x -6431.98..7247.98, y -2303.97..2303.97, z -323.97..1020.78
- replay_003: 1401 candidate anchors, 1339 stable anchors, 263 strong structural anchors, bounds x -6431.98..7247.98, y -2303.97..3151.97, z -30.11..1020.78
- replay_004: 1394 candidate anchors, 1328 stable anchors, 253 strong structural anchors, bounds x -7247.98..6431.98, y -3215.97..3151.97, z 0..1020.78

## Replay 001 provenance audit

- Direct structural geometry: 337 anchors from `output/13-map-lane-reference.json`.
- Inferred geometry: experiment 16/17 lane corridors and axes combine structural anchors with player samples, schema/UI naming, and derived centers.
- Manually named geometry: Yellow/Blue/Purple/Green labels remain aliases and are not used as proof here.
- Occupancy-dependent geometry: no occupancy quality output was used by task 021.

## Coordinate-system comparison

- replay_001 vs replay_002: transform identity, median residual 0, max residual 2894.92, comparable=true.
- replay_001 vs replay_003: transform identity, median residual 0, max residual 5499.57, comparable=true.
- replay_001 vs replay_004: transform identity, median residual 0, max residual 15012.45, comparable=true.
- replay_002 vs replay_003: transform identity, median residual 0, max residual 5255.28, comparable=true.
- replay_002 vs replay_004: transform identity, median residual 0, max residual 11128.67, comparable=true.
- replay_003 vs replay_004: transform identity, median residual 0, max residual 5255.28, comparable=true.

## Anchor matching methodology

Anchors were matched first by class, team, and lane/role-like fields, then by nearest coordinate only inside that bucket. This avoids treating nearest coordinate alone as identity evidence when structural identity disagrees.

## Topology evidence

The task found enough structural coordinate evidence to compare replay coordinate systems, but it did not derive lane axes or physical lane ordering. Existing replay 001 lane labels are historical/manual aliases and remain separated from neutral physical lane IDs.

## Profile grouping

- geometry_profile/schema_653ba0e9_group_a: members replay_001, replay_002, replay_003, replay_004, confidence medium_structural_geometry, transform identity.

## Reusable components

- Parser/schema-compatible structural entity extraction.
- Raw structural coordinate comparison for replays 001-004.
- Direct structural anchors and team/role fields where present.

## Non-reusable components

- Occupancy outcomes.
- Transition quality.
- Player movement density as lane proof.
- Color lane names as semantic topology proof.
- Replay 005 beyond existing metadata/fingerprints.

## Limitations

- Direct build/map metadata remains absent from parser-exposed metadata.
- Stable map GUIDs were not exposed for most anchors.
- Lane-axis derivation and topology ordering require a follow-up structural task.

## Gate result

`geometry_equivalent_topology_requires_validation`

## Next allowed tasks

- derive structural lane-axis and topology from objective/structure ordering with neutral physical lane IDs
