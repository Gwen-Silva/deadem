# Task 044: Investigate Match 91119257 Entity 5594 Parser Recovery

Status: completed
Execution mode: autonomous
Project stage: parser recovery
Related experiment: match 91119257 visual/demo calibration
Priority: high
Depends on: task 043 completed with gate e088_mapping_resolved_with_source_correction
Unlocked by: visual calibration branch sufficiently complete and parser entity 5594 failure still blocking demo telemetry
Blocks: complete match 91119257 telemetry extraction

## Objective

Determine the exact parser state transition that makes entity index 5594 unavailable or inconsistent near tick 3808 / approximately 119 seconds, and test bounded recovery strategies without performing semantic analysis.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `reports/match-91119257-visual-demo-calibration.md`
- `reports/match-91119257-human-visual-review-final.md`
- `reports/match-91119257-e088-timestamp-record-resolution.md`
- `tasks/completed/035-recover-match-91119257-video-frame-and-demo-telemetry-alignment.md`
- `tasks/completed/042-ingest-match-91119257-human-visual-review.md`
- `tasks/completed/043-resolve-match-91119257-e088-timestamp-and-record-mapping.md`
- Existing parser diagnostics and recovery logs for entity 5594.
- Parser handler code directly responsible for entity create/update/delete lookup failures.

## Work requested

- Trace entity index 5594 through a bounded replay window around the failure.
- Record creation, update, deletion, reference, registry lookup, parser exception, and recovery events when observable.
- Evaluate the required hypotheses independently.
- Build the smallest deterministic reproduction possible.
- Test experimental recovery strategies separately.
- Compare baseline and recovered parser behavior.
- Validate only broad continuity against already validated visual timing anchors.

## Constraints

- Do not process replay 005.
- Do not perform video-demo alignment.
- Do not resume visual review.
- Do not implement macro analysis, lane occupancy, rotations, fights, objectives, or decision inference.
- Do not silently fabricate entity properties.
- Keep raw debug dumps bounded and structured.

## Inputs

- `samples/partida_006.dem`
- Existing task 035 parser diagnostics and recovery outputs.
- Parser engine source directly involved in entity packet handling.

## Outputs

- `output/match_91119257/entity-5594-trace.jsonl`
- `output/match_91119257/entity-5594-registry-snapshots.json`
- `output/match_91119257/entity-5594-failure-reproduction.json`
- `output/match_91119257/entity-5594-hypothesis-evaluation.json`
- `output/match_91119257/entity-5594-recovery-experiments.json`
- `output/match_91119257/parser-recovery-before-after.json`
- `output/match_91119257/parser-recovery-validation.json`
- `output/match_91119257/parser-recovery-gate.json`
- `reports/match-91119257-entity-5594-parser-recovery.md`

## Acceptance criteria

- The first failing tick/time and exception origin are recorded.
- Entity 5594 lifecycle evidence is recorded as far as observable.
- Hypotheses are evaluated with evidence or explicit unknowns.
- Recovery experiments preserve unresolved references and do not fabricate entity properties.
- Before/after behavior is compared.
- A final gate is produced.

## Required validation

- Run existing parser/package tests when available.
- Run existing Python video-pipeline tests.
- Validate JSON and JSONL outputs.
- Validate entity 5594 trace schema.
- Validate replay 005 protection.
- Validate no heavy optional dependencies were installed.
- Run task queue validation.
- Check Git status before staging.

## Gate result

entity_5594_root_cause_confirmed

## Documentation updates

- Update `docs/PROJECT_STATE.md`.
- Update `reports/latest.md`.

## Git scope

Stage only task, bounded structured outputs, report, tests, and necessary small code changes. Do not commit `.dem`, MP4, frames, `.venv-video`, caches, or raw unbounded debug dumps.

## Expected report

Summarize root cause, first failing packet, entity 5594 lifecycle, recovery experiments, before/after telemetry, validation, limitations, and final gate.

## Stop conditions

Stop after committing and pushing this task. Create only a blocked follow-up full-telemetry extraction task if the gate permits it.
