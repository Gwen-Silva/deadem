# Task 016: Define Replay Intake And Compatibility Protocol

Status: completed
Execution mode: autonomous
Project stage: Multi-replay datasets
Related experiment: replay intake protocol
Priority: high
Depends on: task 014 completed with gate no_architecture_resolves_tradeoff
Unlocked by: user request to prepare a five-replay intake and compatibility pipeline
Blocks: parameterized common pipeline for experiments 01-18

## Objective

Create a reproducible replay-intake and compatibility pipeline for up to five Deadlock replays without running model recalibration, transition detection, occupancy, or the full experiment chain.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/PROJECT_ROADMAP.md`
- `tasks/active/016-define-replay-intake-and-compatibility-protocol.md`
- existing examples or scripts needed to load a replay with the repository parser
- experiments `01` through `18` only for parameterization assumptions
- `samples/` local file inventory

## Work requested

- Inventory all local `.dem` files in `samples/`.
- Assign replay IDs and initial roles:
  - `replay_001`: development
  - `replay_002`: generalization
  - `replay_003`: generalization
  - `replay_004`: generalization and stability
  - `replay_005`: final holdout
- Create `data/replay-manifest.json`.
- Create a lightweight replay-intake script that extracts metadata and compatibility evidence only.
- Create compatibility, processing-plan, and script-parameterization outputs.
- Create `reports/replay-intake-and-compatibility.md`.

## Constraints

- Do not commit `.dem` files.
- Do not overwrite existing replay 001 outputs.
- Do not assume all replays are compatible before inspecting them.
- Do not reuse build 6592 geometry automatically.
- Do not run occupancy, transition detection, model recalibration, or the full experiment chain.
- Do not process replay 005 beyond basic intake metadata.
- Use relative local paths only in the manifest.

## Inputs

- `samples/*.dem`
- package parser APIs already used by the repository
- experiments `01` through `18` for script-parameterization audit

## Outputs

- `data/replay-manifest.json`
- `output/replay-intake-summary.json`
- `output/replay-compatibility-matrix.json`
- `output/replay-processing-plan.json`
- `output/replay-script-parameterization-audit.json`
- `reports/replay-intake-and-compatibility.md`

## Acceptance criteria

- Every local `.dem` file is inventoried with replay ID, filename, relative path, size, SHA-256, modification timestamp, role, processing status, privacy/distribution status, and notes.
- Replay metadata extraction records load success, tick bounds, duration, tick rate when available, player/controller count, pawn count, hero identities when available, team distribution, critical entity classes, parser warnings, and parser errors.
- Each replay has exactly one primary compatibility status and separate compatibility dimensions.
- Future output isolation and non-destructive replay 001 migration plan are documented.
- A machine-readable processing plan exists for the minimal stages through movement, with occupancy separated as optional and blocked until geometry compatibility is confirmed.
- Experiments `01` through `18` are audited for replay-specific and build-specific assumptions.
- Exactly one allowed gate is produced:
  - `five_replays_ready_for_pipeline_refactor`
  - `partial_replay_set_ready`
  - `replays_require_build_specific_work`
  - `replay_intake_blocked`

## Required validation

- ESLint on new JavaScript.
- JSON parsing for new outputs.
- Output-size checks.
- Deterministic hash verification.
- Repeatable metadata extraction.
- Task queue validation.
- Git verification that replay files and existing outputs were not committed or modified.

## Gate result

Write the gate into `output/replay-intake-summary.json`.

## Documentation updates

Update `reports/latest.md`, `docs/PROJECT_STATE.md`, and `docs/PROJECT_ROADMAP.md` only when justified.

## Git scope

Use explicit staging. Do not stage or commit `.dem` files. Commit this task separately and push to `origin/main`.

## Expected report

Report replay inventory, assigned roles, hashes and sizes, build comparison, map comparison, compatibility matrix, parser failures, geometry risks, reusable pipeline stages, scripts requiring refactor, output-isolation plan, final-holdout protection rules, and the next executable task.

## Stop conditions

Stop when the intake task is complete and no pending task remains, or when fewer than two compatible replays can proceed, or when build-specific work is required before common processing.
