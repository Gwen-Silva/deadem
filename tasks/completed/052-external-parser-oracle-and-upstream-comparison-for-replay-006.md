# Task 052: External Parser Oracle And Upstream Comparison For Replay 006

Status: completed
Execution mode: autonomous
Project stage: parser compatibility
Related experiment: replay 006 parser/protocol support
Priority: medium
Depends on: task 051 completed
Unlocked by: explicit user authorization to create and execute this task
Blocks: replay 006 parser/protocol support

## Objective

Evaluate independent Source 2 and Deadlock demo parsers as external structural/state oracles for replay 006, and compare the current repository against upstream or related implementations.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/PARSER_FAILURE_CATALOG.md`
- `reports/replay-006-entity-lifecycle-state-refresh-gap.md`
- `output/parser-compatibility/replay-006-index-decoder-comparison.json`
- `output/parser-compatibility/replay-006-entity-5594-provenance.json`
- `output/parser-compatibility/replay-006-entity-lifecycle-gate.json`

## Work requested

- Inventory external parser candidates.
- Pin exact commits and licenses.
- Test or reject candidates with documented reasons.
- Compare replay 001, replay 002, and replay 006 where viable.
- Compare tick 3808 / packet loop 29 / entity 5594 behavior where observable.
- Compare current fork with upstream for packet entity lifecycle handling.
- Produce compact structured outputs and a report.

## Constraints

- Do not process replay 005.
- Do not add another internal skip or placeholder recovery.
- Do not vendor external repositories.
- Do not commit cloned repositories, caches, binaries, replay files, full traces, videos, frames, or dependencies.
- Do not copy external code into production during oracle assessment.

## Acceptance criteria

- Candidate inventory is complete for the requested candidates.
- Viable execution and rejection decisions are documented.
- Replay 001/002 controls and replay 006 behavior are reported for viable parsers.
- Upstream/fork comparison is focused on packet entity lifecycle handling.
- Gate result is one of the task-defined external oracle gates.

## Required validation

- Engine tests.
- Structural-pass tests.
- Video-pipeline tests.
- ESLint.
- JSON validation.
- Replay 001/002 control verification.
- Replay 005 exclusion verification.
- Task queue validation.
- Documentation-link validation.
- Git status validation.

## Gate result

`external_oracle_comparison_ready_without_resolution`

## Completion notes

- Upstream `Igor-Losev/deadem` commit `207fe497e8bf909a1208ac6b9a62f43b640a781a` parsed controls `partida_001.dem` and `partida_002.dem`.
- Upstream failed `partida_006.dem` with the same missing entity 5594 UPDATE path.
- `demofile-net`, `source2-demo`, and `DemLockSharp` remain credible independent oracle candidates but did not produce loop-level evidence in this environment.
- No production parser fix was included.
- Replay 005 was not processed.
