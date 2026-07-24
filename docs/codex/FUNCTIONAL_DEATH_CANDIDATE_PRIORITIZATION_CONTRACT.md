# Functional Death-Candidate Prioritization Contract

## Status and truth boundary

Task 197 adds a deterministic V2 priority layer over the preserved Task 196 candidate artifact. Every output remains an unconfirmed structural hypothesis. A priority, rank, or tier is not a death fact, death probability, identity attribution, or confirmed non-death.

## Fixed development and validation split

The configuration was declared and frozen using only the 24 development replays. The reserved validation set is `replay_004`, `replay_012`, `replay_016`, `replay_020`, `replay_024`, `replay_028`, `replay_032`, and `replay_036`. Reserved-validation results must not change weights or thresholds.

## Frozen V2 scoring model

The score uses only five structural inputs: family count (weight 0.20, cap 3), surface count (0.25, cap 2), observed horizon (0.25, cap 180 seconds), same-surface recurrence (0.20, cap 10), and temporal density from nearest same-surface gap (0.10, cap 1,800 seconds). The selection threshold is 0.65. Priority tiers are `high >= 0.90`, `medium >= 0.78`, and `low >= 0.65`.

Known-anchor and hard-challenger labels are evaluation-only annotations copied after scoring. They are forbidden from score inputs and feature contributions.

## Baseline and success gate

The immutable V1 baseline is 2,815 clusters, 2,664 candidates, 2,552 anchors with 2,434 matches, 91 hard challengers with 85 matches, and score p50/p90 both 1.0.

The reserved-validation gate requires all of: at least 90% anchor capture; hard-challenger capture at least 10 percentage points lower; fewer V2 candidates than V1; p50 and p90 not both 1.0; non-empty high, medium, and low tiers; deterministic byte-identical replay_010 output in two executions; all 32 authorized replays represented; no protected replay access; and no final facts or attribution.

If the frozen model fails any selectivity criterion, the conclusive gate is `structural_features_insufficient_for_candidate_selectivity`. That result ends tuning on these signals and requires new semantic evidence or ground truth for the next evolution.
