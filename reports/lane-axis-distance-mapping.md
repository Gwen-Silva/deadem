# Lane Axis Distance Mapping

## Summary

Task 023 projected sampled raw movement coordinates onto the approved structural lane-axis polylines for replays 002-004. Replay 002 was processed first as the smoke test.

- replay_002: pass, 48 coordinate rows, output `output/replays/replay_002/lane-axis-distance-mapping.json`.
- replay_003: pass, 48 coordinate rows, output `output/replays/replay_003/lane-axis-distance-mapping.json`.
- replay_004: pass, 48 coordinate rows, output `output/replays/replay_004/lane-axis-distance-mapping.json`.

## Gate result

`lane_distance_mapping_ready`

## Limits

- No stable occupancy classification was produced.
- No transition detection was run.
- Replay 005 was not processed.
- Lane colors and strategic labels remain prohibited.
