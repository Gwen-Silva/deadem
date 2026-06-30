# Task 068: Define Next Deadem Project Milestone

Status: completed

Blocked by: project milestone selection after Task 067

Unlocked by: next_milestone_definition_authorized

## Current validated project state

The project currently has normal replay parsing for replays 001-004 and 009, structural parsing validation, replay-009 player identity and pawn continuity, player life/death/respawn factual events, `m_iGoldNetWorth` observations, objective/structure raw entity observability, bounded objective/structure factual events, partial independent visual validation, canonical replay-009 factual schema, query CLI, static factual-state inspector, and validated review workflows.

Current gates include:

- `replay_009_telemetry_usable_with_known_gaps`
- `replay_009_factual_state_detection_ready_with_gaps`
- `replay_009_objective_structure_factual_events_ready_with_gaps`
- `replay_009_objective_structure_events_independently_validated_with_gaps`
- `replay_009_canonical_factual_state_ready_with_constraints`
- `replay_009_factual_state_inspector_ready_with_constraints`
- `replay_009_inspector_workflows_validated_with_gaps`

Current hard limitations:

- replay 005 remains protected final holdout
- replays 006-008 remain unsupported bot fixtures
- build `23916427` patch mapping is unresolved
- active-game-time and pause intervals are unavailable
- map transform is unresolved
- map regions and lanes are unavailable
- objective proximity is unavailable
- Spirit Urn identity remains unresolved
- Rejuvenator observability is unavailable
- Patron/base class identity remains ambiguous
- objective completion is not inferred
- mechanic activation and effects are blocked
- fight, rotation, pressure, macro, and decision analysis are blocked

## Objective

Define the next project milestone using evidence from completed Tasks 044-067.

Determine which missing layer blocks the largest number of downstream capabilities, which gaps are technically recoverable, which gaps require new data, which gaps require independent validation, which gaps should remain deferred, and what must be true before replay 005 can be released.

This is a planning and dependency-analysis task. It must not implement the selected milestone, release replay 005, or create speculative macro-analysis code.

## Candidate milestone tracks

Evaluate at minimum:

- Track A: spatial and map geometry foundation
- Track B: cross-replay generalization
- Track C: objective semantic observability
- Track D: build and mechanics resolution
- Track E: time-basis recovery
- Track F: combat factual layer

Do not assume combat is the best next step merely because it is strategically interesting.

## Required outputs

Create:

- `output/project-milestone-analysis/dependency-graph.json`
- `output/project-milestone-analysis/capability-blocker-matrix.json`
- `output/project-milestone-analysis/gap-recoverability.json`
- `output/project-milestone-analysis/replay-005-release-criteria.json`
- `output/project-milestone-analysis/milestone-comparison.json`
- `output/project-milestone-analysis/recommended-task-sequence.json`
- `output/project-milestone-analysis/milestone-decision.json`
- `output/project-milestone-analysis/milestone-gate.json`
- `output/project-milestone-analysis/README.md`
- `docs/NEXT_MILESTONE.md`
- `reports/deadem-next-milestone-decision.md`

## Gate

Produce exactly one:

- `deadem_next_milestone_defined`
- `deadem_next_milestone_defined_with_open_dependencies`
- `deadem_next_milestone_not_ready`
- `deadem_next_milestone_blocked`

Use `defined` only if the milestone can begin using currently available inputs.

Use `defined_with_open_dependencies` when the milestone is clear but requires explicitly named new inputs.

## Follow-up behavior

If the selected milestone can begin immediately, create exactly one blocked task for the first execution step and do not execute it automatically.

If new user input is required, create exactly one blocked acquisition task specifying precisely what the user must provide. Do not create downstream implementation tasks yet.

Do not create a macro-analysis task. Do not release replay 005.

## Validation

Run:

- dependency graph consistency tests
- blocker-matrix completeness tests
- milestone comparison schema tests
- replay-005 release-checklist tests
- proposed-task dependency validation
- JSON validation
- deterministic rerun
- task queue validation
- Markdown and README link validation
- ESLint when code changes exist
- Git status validation

No replay needs to be parsed for this task.

Verify explicitly:

- replay 005 not read
- replay 005 not processed
- replays 006-008 not processed
- no source video processed

## Documentation

Update:

- `README.md`
- `docs/PROJECT_STATE.md`
- `docs/REPOSITORY_GUIDE.md`
- `reports/INDEX.md`
- `output/README.md`

Add a concise current-direction section linking to `docs/NEXT_MILESTONE.md`.

Do not rewrite completed-history sections unnecessarily.

## Git

Use explicit staging only.

Commit only milestone-analysis outputs, planning documentation, focused validation tooling/tests, task files, and necessary index updates.

Do not commit replay files, videos, frames, speculative implementation code, mechanic effects, or strategic conclusions.
