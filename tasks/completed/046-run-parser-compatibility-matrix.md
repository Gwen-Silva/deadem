# Task 046: Run Parser Compatibility Matrix

Status: completed
Execution mode: autonomous
Project stage: parser compatibility
Related experiment: match 91119257 parser diagnostics
Priority: high
Depends on: task 045 completed with gate baseline_709_protocol_support_blocked
Unlocked by: explicit user authorization to switch from serial symptom repair to parser compatibility assessment
Blocks: complete match 91119257 telemetry extraction

## Objective

Create and execute a parser compatibility matrix across locally available Deadlock replay files, explicitly excluding replay 005, to determine whether the replay 006 parser failure pattern is replay-specific, build-specific, duration-dependent, configuration-dependent, or evidence of broader unsupported parser/protocol behavior.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `reports/match-91119257-baseline-709-parser-continuation.md`
- `output/match_91119257/baseline-709-gate.json`
- `output/match_91119257/baseline-709-before-after.json`
- Parser handler code directly responsible for already implemented diagnostic recoveries.

## Work requested

- Discover local `.dem` files and exclude replay 005/final holdout.
- Run default parser and diagnostic recovery modes on eligible replays.
- Assess metadata-only structural pass feasibility without implementing a full structural parser.
- Normalize parser failures and compare clusters across replays.
- Create a parser failure catalog and parser-investigation policy.
- Create a blocked structural-pass follow-up task if current code cannot run metadata/envelope-only parsing without entity materialization.

## Constraints

- Do not process replay 005.
- Do not perform semantic gameplay analysis.
- Do not perform video processing.
- Do not create class-891-specific recovery.
- Do not add another parser skip to the current path.
- Do not fabricate entities, baselines, classes, or telemetry.
- Do not commit replay files, videos, frames, raw full parser logs, caches, or virtual environments.

## Inputs

- `samples/*.dem`
- Task 044 and 045 reports and structured outputs.
- Existing parser implementation and already implemented opt-in diagnostic recoveries.

## Outputs

- `output/parser-compatibility/replay-inventory.json`
- `output/parser-compatibility/parser-compatibility-matrix.json`
- `output/parser-compatibility/parser-compatibility-matrix.csv`
- `output/parser-compatibility/failure-clusters.json`
- `output/parser-compatibility/protocol-build-summary.json`
- `output/parser-compatibility/structural-pass-feasibility.json`
- `output/parser-compatibility/parser-compatibility-gate.json`
- `docs/PARSER_FAILURE_CATALOG.md`
- `reports/parser-compatibility-matrix.md`

## Acceptance criteria

- All eligible local replays except replay 005 are represented in the matrix.
- Replay 005 exclusion is explicitly validated.
- Default and diagnostic recovery modes are compared without adding new recovery behavior.
- First failures are normalized into the documented failure taxonomy.
- The replay 006 sequence is cataloged as sequentially exposed blockers at the same parser boundary.
- The report states the best-supported compatibility model and corpus-diversity limitation.

## Required validation

- Run parser test suite.
- Run video-pipeline tests.
- Run ESLint for changed JavaScript.
- Validate JSON and CSV outputs.
- Verify replay 005 exclusion.
- Run deterministic rerun on at least one eligible replay.
- Run task queue validation.
- Verify Git status excludes `.dem`, MP4, frames, caches, and virtual environments.

## Gate result

parser_compatibility_matrix_ready_with_insufficient_diversity

## Documentation updates

- Add or update parser-investigation policy in a project document.
- Create `docs/PARSER_FAILURE_CATALOG.md`.
- Update `docs/PROJECT_STATE.md` and `reports/latest.md`.

## Git scope

Stage only diagnostic code, structured outputs, reports, documentation, and task files.

## Expected report

Summarize replay inventory, parser modes, failure categories, failure clusters, replay 006 comparison, structural-pass feasibility, and next blocked parser-support work.

## Stop conditions

Stop after the compatibility matrix is committed and pushed. Do not execute blocked structural-pass work automatically.
