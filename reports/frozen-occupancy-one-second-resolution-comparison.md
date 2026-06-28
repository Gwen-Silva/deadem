# Frozen Occupancy One-Second Resolution Comparison

## Scope

The same frozen candidates were applied to one-second spatial timelines for replays 001-004. No thresholds were changed, replay 005 was not processed, and outputs remain non-semantic evidence.

## Replays

- replay_001: 35904 one-second rows.
- replay_002: 22020 one-second rows.
- replay_003: 27360 one-second rows.
- replay_004: 24156 one-second rows.

## Candidate sensitivity

- original_experiment_23_balanced: strongly_resolution_sensitive, max coverage delta 0.65, max episode-count delta 1376, max fragmentation delta 181.67.
- conservative_point_revision_combined: strongly_resolution_sensitive, max coverage delta 2.66, max episode-count delta 879, max fragmentation delta 131.22.
- hysteresis_state_machine: moderately_resolution_sensitive, max coverage delta 2.66, max episode-count delta 156, max fragmentation delta 20.53.
- windowed_evidence_accumulation: strongly_resolution_sensitive, max coverage delta 2.66, max episode-count delta 775, max fragmentation delta 115.73.
- constrained_dynamic_programming: moderately_resolution_sensitive, max coverage delta 2.66, max episode-count delta 337, max fragmentation delta 50.36.

## Gate

`one_second_frozen_comparison_resolution_sensitive`

## Allowed limited use

- Point-level physical lane proximity evidence.
- Base/deployment exclusion evidence.
- Resolution sensitivity assessment.

## Prohibited conclusions

- Semantic occupancy correctness.
- Reliable occupancy episodes.
- Transition detection or rotations.
- Strategic interpretation.
- Replay 005 conclusions.
