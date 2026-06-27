# Project State

Last updated: 2026-06-27

## Latest Experiment

Latest completed experiment: `23-calibrate-lane-occupancy`

Script: `experiments/23-calibrate-lane-occupancy.js`

Primary outputs:

- `output/23-calibrated-lane-occupancy.json`
- `output/23-calibrated-occupancy-episodes.json`
- `output/23-occupancy-calibration-review.json`
- `output/23-occupancy-model-comparison.json`
- `output/23-occupancy-manual-review.json`

## Current Objective

Build reliable derived datasets from `samples/partida_001.dem` for player timelines, hero/lane identity, movement, lane occupancy, and later event analysis.

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
- Hero, item, lane, and event labels remain derived or partially validated unless a report marks them as confirmed.

## Open Questions

- Which lane occupancy model is precise enough for transition detection after manual review?
- How should brief contacts and deployment-area samples be represented in the canonical timeline?
- Which fields or derived metrics are reliable enough for combat/objective analysis?
- Which Explorer observations can validate hero, lane, item, and objective mappings?

## Likely Next Investigation

Review and improve lane occupancy calibration, especially initial lane agreement, brief-contact fragmentation, and deployment classification, before building higher-level rotation or macro-event detectors.
