# Project State

Last updated: 2026-06-28

## Latest Work

Latest completed task: `032-build-unified-descriptive-match-state-timeline`

Script: `scripts/build-unified-match-state-timeline.js`

Primary outputs:

- `output/replays/replay_001/match-state-timeline.jsonl`
- `output/replays/replay_002/match-state-timeline.jsonl`
- `output/replays/replay_003/match-state-timeline.jsonl`
- `output/replays/replay_004/match-state-timeline.jsonl`
- `output/replays/multi-replay-match-state-comparison.json`
- `output/replays/match-state-timeline-gate.json`

## Current Objective

Build reliable derived datasets from a five-replay local study while preserving replay-specific output isolation and final-holdout protection.

The current investigation has frozen semantic lane-occupancy episodes and is pivoting to independent descriptive event layers that do not require occupancy semantics.

## Trusted Outputs

- `output/03-normalized-player-snapshots.json`: normalized player/controller/pawn snapshots.
- `output/09-canonical-player-timeline.json`: canonical player timeline used by later experiments.
- `output/13-player-lane-enrichment.json`: player lane enrichment used by topology and occupancy work.
- `output/16-lane-topology-6592.json`: lane topology for replay build `6592`.
- `output/17-spatial-region-model.json`: spatial region model.
- `output/17-player-region-timeline.json`: player region timeline.
- `output/18-player-movement-metrics.json`: movement metrics used as evidence, with caution for downstream interpretation.
- `output/23-occupancy-calibration-review.json`: latest calibration review.

## Known Limitations

- Earlier output files can be large. New outputs should stay below 10 MiB unless explicitly approved.
- Experiment 21 showed that rotation candidates from earlier movement heuristics were not ready for combat or objective inference.
- Experiment 22 showed low stable lane occupancy coverage and many brief contacts.
- Experiment 23 improved coverage with calibrated models, but `readyToDetectTransitions` is still `false`.
- Experiment 24 model revision reduced point contradictions, but holdout validation failed because revised episode contradictions increased.
- Experiment 24 episode-regression diagnosis found short abstentions terminating episodes as the dominant mechanical failure, and no tested ablation advanced to fresh holdout.
- Experiment 24 uncertainty-aware episode architecture testing found that hysteresis, windowed accumulation, dynamic programming, and annotated original episodes did not resolve the point-safety versus episode-continuity trade-off on current diagnostic evidence.
- Replay intake found five local `.dem` files and all loaded through the parser, but build/content-version and map metadata were not exposed by the lightweight intake path; geometry compatibility remains unverified.
- Replay build/map compatibility found one shared schema fingerprint across all five replays, so pre-geometry stages can be parameterized; geometry fingerprints remain per-replay and topology/region/occupancy stages are still gated.
- The pre-geometry pipeline passed on replay 002, then replay 003 and replay 004, with 12 players and 12 hero IDs observed in each sampled output.
- Multi-replay geometry profiling found that replays 001-004 have directly comparable structural coordinates under identity transforms and can be grouped under `geometry_profile/schema_653ba0e9_group_a` for raw coordinate comparison, but lane-axis and topology interpretation remain unvalidated.
- Structural lane-axis topology derived three neutral physical lane axes from direct structural role fields, stable coordinates, topology graph adjacency, and cross-replay consensus. The gate is `structural_topology_ready_for_lane_mapping`; this permits lane-distance projection only, not occupancy classification.
- Lane-axis distance mapping projected replay 002 first, then replay 003 and replay 004, onto approved structural lane polylines. The gate is `lane_distance_mapping_ready`; these outputs are geometric features only and do not classify stable occupancy.
- Full multi-replay spatial timelines were built for replay 002, replay 003, and replay 004 at 5-second resolution using the approved structural lane axes. The gate is `full_spatial_timeline_ready_with_limitations`: later frozen-model tests may use these timelines, but must not evaluate sub-5-second continuity or brief-contact behavior.
- One-second replay-isolated spatial timelines were built for replays 001-004 using sequential `nextTick()` extraction, per-player JSONL shards, and cached lane-axis geometry. The gate is `one_second_spatial_ready_with_limitations`: all four replays completed with 12-player reconciliation, direct coordinate rows, deterministic replay 002 repeatability, and finite projections, but existing five-second artifacts do not align exactly for all comparable fields. Use the one-second outputs for resolution-controlled frozen-candidate comparison before making any final-holdout decision.
- The descriptive spatial-evidence layer is now formalized as non-semantic point evidence only: high-confidence lane proximity, ambiguous lane proximity, base/deployment, neutral/unclassified, and missing/invalid. These classes must not be interpreted as semantic occupancy, rotations, or strategic lane assignments.
- Frozen candidates applied to one-second timelines remain resolution-sensitive for episode behavior. The task 028 gate is `one_second_frozen_comparison_resolution_sensitive`: point coverage changes are small, but episode counts and fragmentation change enough that reliable occupancy episodes, transitions, and replay 005 final-holdout processing remain prohibited.
- Semantic lane-occupancy episodes are frozen for autonomous development. One-second extraction removed the main technical resolution confound, but episode count and fragmentation remain materially architecture- and resolution-sensitive. No further autonomous occupancy architecture search, threshold retuning, or episode-merging work is authorized without a new methodological decision.
- Point-level spatial evidence is approved for limited descriptive use: direct coordinates, physical lane-axis projections, nearest-lane distance, lane-separation evidence, base/deployment exclusion, descriptive spatial-evidence classes, movement measurements, and resolution-sensitivity analysis. It is a factual spatial evidence layer, not a semantic occupancy layer.
- The multi-replay death/assist/respawn layer is the active independent event branch. It may use player identity reconciliation and descriptive spatial context, but it must not infer rotations, strategic lane assignment, fight quality, or semantic occupancy.
- The multi-replay death/assist/respawn layer gate is `death_event_layer_ready_with_limitations`: death and respawn timing reconcile without validation errors across replays 001-004, with killer/assist linkage derived from same-second counters and some respawn recovery inferred where direct signals are incomplete.
- The damage/healing field discovery gate is `damage_healing_fields_ready_with_limitations`: `m_iHeroDamage`, `m_iObjectiveDamage`, `m_iHeroHealing`, and `m_iSelfHealing` provide reproducible cumulative counter deltas across replays 001-004. Source-target damage logs were not exposed by this task path, so these fields support descriptive deltas and feasibility only, not fight grouping or combat-quality claims.
- The objective lifecycle gate is `objective_lifecycle_ready_with_limitations`: replays 001-004 each expose 47 stable objective or objective-adjacent entities with consistent structural roles, health/state timelines, lifecycle events, and lane-axis relationships. Guardian, walker, base-structure, Patron, Mid Boss, and urn-related coverage is present, but exact objective-damage attribution and optional phase/protection semantics remain limited.
- The unified descriptive match-state timeline gate is `match_state_timeline_ready`: replays 001-004 now have per-second, replay-isolated timelines combining player positions, alive/dead intervals, death/respawn events, net worth, damage/healing deltas, and objective states. This layer answers factual state questions only and does not define fights, evaluate decisions, infer strategy, use semantic lane occupancy, or process replay 005.
- `replay_005` is reserved final holdout and must not influence thresholds, rule design, geometry calibration, architecture selection, debugging based on expected outputs, or best-model selection.
- Hero, item, lane, and event labels remain derived or partially validated unless a report marks them as confirmed.

## Open Questions

- Which fields or derived metrics are reliable enough for combat/objective analysis?
- Which Explorer observations can validate only the minimized unresolved semantic questions?

## Likely Next Investigation

Stop lane-transition and semantic occupancy-episode work. Continue only independent descriptive event layers that do not depend on occupancy semantics. Death/assist/respawn, damage/healing counters, and objective lifecycle are now available with limitations. A unified descriptive match-state timeline may combine these validated layers for factual state questions, but must not group fights, judge decisions, infer strategic intent, or process replay 005.
