# Deadem Next Milestone Decision

Task 068 defines the next project milestone from completed Tasks 044-067.

## Decision

- Gate: `deadem_next_milestone_defined_with_open_dependencies`
- Selected primary milestone: **spatial foundation first**
- Optional preparatory milestone: cross-replay canonical generalization if map assets are unavailable or delayed
- Highest-impact blocker: validated map geometry and coordinate transform for replay 009/build 23916427
- Technical complexity: large
- Epistemic risk: high until map/version provenance is established; medium after validated anchors

## Why Spatial First

Spatial grounding blocks the largest number of downstream capabilities: lane presence, movement paths, objective proximity, map pressure prerequisites, rotations, and later macro context. Existing replay-009 coordinates are usable with constraints, but Task 061 found no accepted transform, regions, lanes, objective geometry, structure geometry, or proximity capability.

## Why Alternatives Are Deferred

- Cross-replay generalization is valuable and should be the fallback if map inputs are unavailable, but it does not unlock spatial questions by itself.
- Objective semantic observability risks overfitting class/property meaning before map and build context.
- Build/mechanics resolution remains a research dependency without direct build mapping.
- Time-basis recovery is useful but not the largest shared blocker.
- Combat factual work remains premature without attribution and spatial context.

## Replay 005

Replay 005 release decision: `replay_005_release_not_ready`.

Replay 005 was not read or processed. Release requires more than the current replay-009 canonical path.

## Outputs

- `output/project-milestone-analysis/dependency-graph.json`
- `output/project-milestone-analysis/capability-blocker-matrix.json`
- `output/project-milestone-analysis/gap-recoverability.json`
- `output/project-milestone-analysis/replay-005-release-criteria.json`
- `output/project-milestone-analysis/milestone-comparison.json`
- `output/project-milestone-analysis/recommended-task-sequence.json`
- `docs/NEXT_MILESTONE.md`
