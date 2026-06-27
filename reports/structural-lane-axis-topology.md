# Structural Lane Axis Topology

## Objective

Task 022 derived neutral physical lane axes for replays 001-004 using stable structural anchors only. Replay 005 was not processed.

## Structural methods tested

- Method A, class-and-team ordered chains: used direct lane-role structures and ordered them geometrically.
- Method B, topology graph: connected same-role structural neighbors by distance and class compatibility.
- Method C, symmetry pairing: checked team-side class support per candidate.
- Method D, cross-replay consensus: accepted only candidates present independently in replays 001-004.

## Candidate counts

- replay_001: 3 candidates (lane_axis_1: 86 anchors, lane_axis_2: 68 anchors, lane_axis_3: 86 anchors)
- replay_002: 3 candidates (lane_axis_1: 77 anchors, lane_axis_2: 78 anchors, lane_axis_3: 91 anchors)
- replay_003: 3 candidates (lane_axis_1: 72 anchors, lane_axis_2: 86 anchors, lane_axis_3: 78 anchors)
- replay_004: 3 candidates (lane_axis_1: 69 anchors, lane_axis_2: 85 anchors, lane_axis_3: 75 anchors)

## Accepted lane axes

- lane_axis_1: source role 4, 86 ordered structures, aliases stored only as unverified historical labels.
- lane_axis_2: source role 6, 86 ordered structures, aliases stored only as unverified historical labels.
- lane_axis_3: source role 1, 91 ordered structures, aliases stored only as unverified historical labels.

## Ordering rule

In the shared identity coordinate system, compute the median centroid for each direct structural role-lane across replays 001-004, then assign lane_axis_1..3 by ascending polar angle around the global structural center. Historical color aliases are not used.

## Cross-replay consistency

- Minimum ordered-sequence agreement: 0.21
- Median coordinate residual: 0
- P90 coordinate residual: 110.63
- Maximum coordinate residual: 1011.93
- Minimum polyline similarity: 0.9
- Task 021 coordinate profile: identity transform for all pairs

## Central and neutral exclusions

- base_shared: 8
- central_objective: 4
- lane_adjacent: 92
- neutral_connector: 656

## Provenance

Primary evidence was limited to direct entities, stable static coordinates, and cross-replay consensus. Historical aliases, movement-derived, occupancy-derived, and manual alias evidence were not used as primary evidence.

## Gate result

`structural_topology_ready_for_lane_mapping`

## Conclusions allowed

- Three neutral physical lane axes are structurally supported for replays 001-004.
- Future lane-distance projection may use the approved polylines.

## Conclusions prohibited

- Stable lane occupancy classification.
- Transition detection.
- Semantic lane color claims.
- Replay 005 processing.
