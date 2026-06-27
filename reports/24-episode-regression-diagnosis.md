# Experiment 24 episode regression diagnosis

## Summary

Task 013 diagnosed the failed task 006 holdout without reprocessing the replay and without human labels.

Gate result:

```text
episode_revision_failed
```

No transition detection, second replay, or human labeling task was promoted.

## Why the earlier revision appeared successful

Task 005 evaluated the conservative revision on the task 008/005 diagnostic samples. On those samples, conservative point abstention removed point contradictions and reduced point sensitivity.

The selected combined revision reduced:

- point contradictions: 35 to 0
- point instability: 63.33% to 10%
- sampled episode contradictions: 7 to 0

This made the revision look ready for holdout, but it was not semantic validation.

## Why it failed on holdout

Task 006 showed that point-level gains generalized, but episode construction did not:

- original holdout point contradictions: 50
- revised holdout point contradictions: 0
- original holdout point instability: 55
- revised holdout point instability: 19
- original holdout episode contradictions: 12
- revised holdout episode contradictions: 75

The revised episode layer over-reacted to point abstentions and continuity gaps.

## Contradiction categories

All 75 revised holdout episode contradictions were categorized:

- `short_abstention_incorrectly_terminating_episode`: 50
- `base_deployment_precedence_absorbing_lane_interval`: 8
- `episode_truncated_at_beginning`: 7
- `episode_truncated_at_end`: 5
- `episode_removed_despite_stable_spatial_interval`: 5

The strongest causal source is short abstention terminating episodes.

## Causal contribution

Base/deployment precedence contributed to 8 contradictions by absorbing seconds inside holdout episode windows.

Separation ambiguity and other abstentions were the dominant cause of bridgeable gaps. These gaps preserved point safety but broke episode continuity.

High-speed abstention was not the dominant category in the final diagnosis.

Continuity filtering did not explain the full failure alone; removing or isolating it did not produce an acceptable candidate.

## Ablation results

No ablation candidate satisfied the advancement rules.

Important candidates:

- original model: did not preserve point gains.
- point corrections only with original-style episode construction: preserved point gains but had 85 diagnostic episode contradictions.
- base/deployment precedence only: did not preserve point instability gains.
- separation ambiguity only: preserved some point gain but still had 84 diagnostic episode contradictions.
- high-speed abstention only: did not preserve point gains.
- continuity filtering only: did not preserve point gains.
- point corrections with short-gap bridging: preserved point gains but still had 83 diagnostic episode contradictions.
- point corrections with state-aware interruption tolerance: preserved point gains but still had 83 diagnostic episode contradictions.
- current combined revision: preserved point gains but had 85 diagnostic episode contradictions in the ablation metric.

## Point-versus-episode trade-off

The point corrections are useful mechanically: they reduce contradictions and instability.

The episode aggregation does not currently have a structure that can use those safer point states without either:

- truncating/removing many episodes; or
- reintroducing episode contradictions.

## Coverage-versus-abstention trade-off

The failed revision reduced lane coverage from 53.39% to 10.19%.

This abstention improved point safety but left too little stable lane evidence for the existing episode layer.

## Selected reconstruction

No reconstruction candidate was selected.

The diagnostic task therefore did not create a fresh-holdout task.

## Rejected alternatives

Short-gap bridging and state-aware gap handling were rejected because they did not reduce diagnostic episode contradictions enough to advance while preserving point gains.

Preserving original episode construction was rejected because it did not fix the episode contradiction inflation under point corrections.

Continuity-only changes were rejected because they did not preserve point-level improvements.

## Data leakage controls

The task 006 holdout is now diagnostic data because its result has been observed.

No fresh holdout was run in this task.

A future fresh holdout would need to exclude task 005, task 006, task 013 diagnostic, and any tuning samples.

## Remaining uncertainty

- No semantic correctness is established.
- Current derived evidence is enough to show mechanical episode failure, but not enough to choose a safe episode reconstruction.
- Human review is not required yet because the failure is still mechanical and unresolved at the aggregation level.

## Gate result

```text
episode_revision_failed
```

The correct stop is to avoid further automatic tuning against observed holdouts.
