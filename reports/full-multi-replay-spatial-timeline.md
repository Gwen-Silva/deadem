# Full Multi-Replay Spatial Timeline

## Extraction method

The task sampled each replay at one canonical game-second resolution, reconciled the 12 real player controllers, linked controller-to-pawn coordinates at each second, and projected valid coordinates onto the frozen structural lane-axis polylines.

Rows are stored as JSONL beside a compact JSON manifest for each replay. This preserves complete rows without exceeding the 10 MiB per-output JSON limit.

## Results

- replay_002: 4404 player-second rows, 99.73% direct, 0% carried, 0.27% missing, projection coverage 99.73%.
- replay_003: 5472 player-second rows, 99.78% direct, 0% carried, 0.22% missing, projection coverage 99.78%.
- replay_004: 4836 player-second rows, 99.75% direct, 0% carried, 0.25% missing, projection coverage 99.75%.

## Cross-replay comparison

- Comparability: comparable_with_observed_limitations
- Direct coverage range: 99.73..99.78%
- Projection coverage range: 99.73..99.78%

## Allowed downstream use

- Frozen model generalization tests without recalibration.
- Coordinate coverage, projection quality, and movement-feature audits.

## Prohibited conclusions

- Stable lane occupancy.
- Transition readiness.
- Semantic lane correctness.
- Strategic lane assignment or optimality.
- Replay 005 evidence.

## Gate result

`full_spatial_timeline_ready_with_limitations`
