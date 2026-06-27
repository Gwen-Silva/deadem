# Project State

Last updated: 2026-06-27

## Latest Work

Latest completed task: `016-define-replay-intake-and-compatibility-protocol`

Script: `scripts/replay-intake.js`

Primary outputs:

- `data/replay-manifest.json`
- `output/replay-intake-summary.json`
- `output/replay-compatibility-matrix.json`
- `output/replay-processing-plan.json`
- `output/replay-script-parameterization-audit.json`

## Current Objective

Build reliable derived datasets from a five-replay local study while preserving replay-specific output isolation and final-holdout protection.

The current investigation is focused on improving lane occupancy quality before using it to detect rotations, combat context, or macro events.

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
- `replay_005` is reserved final holdout and must not influence thresholds, rule design, geometry calibration, architecture selection, debugging based on expected outputs, or best-model selection.
- Hero, item, lane, and event labels remain derived or partially validated unless a report marks them as confirmed.

## Open Questions

- Which lane occupancy model remains precise enough after autonomous evidence-driven revision?
- How should brief contacts and deployment-area samples be represented in the canonical timeline?
- Which fields or derived metrics are reliable enough for combat/objective analysis?
- Which Explorer observations can validate only the minimized unresolved semantic questions?

## Likely Next Investigation

Stop lane-transition work. The current single-replay diagnostic evidence is exhausted for tested lane-episode architectures. A methodological decision is required before acquiring a compatible second replay, designing minimized semantic review, or redefining the lane-episode target; do not request broad human labels or build transition, combat, objective, or macro-event detectors from the failed holdout revision.

For multi-replay work, the next executable task is build/map/fingerprint compatibility abstraction only. Do not run the common pipeline, movement, occupancy, or downstream models until geometry compatibility is resolved.
