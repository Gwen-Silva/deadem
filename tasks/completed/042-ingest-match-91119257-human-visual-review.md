# Task 042: Ingest Match 91119257 Human Visual Review

Status: completed
Execution mode: autonomous
Project stage: visual evidence review
Related experiment: match 91119257 video packet
Priority: high
Depends on: task 041 completed with gate dense_manual_review_package_ready
Unlocked by: user supplied completed natural-language review decisions for all 24 dense manual-review annotations
Blocks: E088 timestamp mapping follow-up and any future alias application

## Objective

Ingest the completed human review of the 24 dense manual-review annotations into structured, versioned outputs while preserving source annotations, original intervals, representative visual timestamps, uncertainty, conflicts, and unresolved fields.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `output/archive/match_91119257/manual-review/manual-review-form-v2.json`
- `output/archive/match_91119257/manual-review/manual-review-form-v2.csv`
- `output/match_91119257/dense-review-frame-manifest.jsonl`
- `output/match_91119257/dense-review-annotation-summary.json`
- `output/match_91119257/dense-review-candidate-shortlist.json`
- `output/archive/match_91119257/manual-review/provisional/provisional-human-review-observations.json`
- `output/match_91119257/e088-visual-review.json`

## Work requested

- Encode the 24 supplied human review decisions as authoritative structured input for this task.
- Preserve original source annotation intervals separately from representative visual timestamps or intervals.
- Resolve evidence frame paths from the dense manifest when possible.
- Create completed manual-review forms in JSON and CSV.
- Create human-validated visual landmark, unresolved-item, representative-interval, alias-evidence, final-gate, and report outputs.
- Create one blocked follow-up task for resolving E088 timestamp and record mapping.

## Constraints

- Do not process replay 005.
- Do not install OCR, YOLO, VLM, tracking, or other optional dependencies.
- Do not resume parser recovery or video-demo alignment.
- Do not infer additional semantic facts beyond the supplied human review decisions.
- Do not replace neutral IDs in unrelated datasets.

## Inputs

- Completed human review decisions supplied by the user for the 24 dense manual-review annotations.
- Dense review outputs from task 041.

## Outputs

- `output/match_91119257/manual-review-human-responses.json`
- `output/match_91119257/manual-review-human-responses.csv`
- `output/match_91119257/manual-review-form-v2-completed.json`
- `output/match_91119257/manual-review-form-v2-completed.csv`
- `output/match_91119257/human-validated-visual-landmarks.json`
- `output/match_91119257/human-review-unresolved-items.json`
- `output/match_91119257/representative-visual-intervals.json`
- `output/match_91119257/human-review-alias-evidence.json`
- `output/match_91119257/human-review-final-gate.json`
- `reports/match-91119257-human-visual-review-final.md`
- `tasks/blocked/043-resolve-match-91119257-e088-timestamp-and-record-mapping.md`

## Acceptance criteria

- Exactly 24 completed review records are ingested.
- E005 is recorded separately and not added as a 25th reviewed case.
- E032 preserves unresolved exact respawn instant.
- E084 preserves unresolved green buff effect.
- E088 preserves element identity as confirmed and timestamp mapping as unresolved.
- Alias evidence uses only the allowed status values.
- Representative visual timestamps are looked up in the dense manifest when available.
- The final gate is one allowed value.

## Required validation

- Run existing Python video-pipeline tests.
- Validate JSON and JSONL outputs.
- Validate exactly 24 completed review records.
- Validate source annotation reconciliation.
- Validate representative timestamp lookup in dense manifests.
- Validate E005 exclusion.
- Validate E032, E084, and E088 unresolved/conflict preservation.
- Verify no heavy dependency was installed.
- Verify replay 005 protection.
- Run task queue validation.
- Check Git status before staging.

## Gate result

human_visual_review_ready_with_unresolved_timing

## Documentation updates

- Update `docs/PROJECT_STATE.md`.
- Update `reports/latest.md`.

## Git scope

Stage only task, script, report, documentation, and structured output files. Do not commit uploaded images, dense frames, contact sheets, MP4, DEM, `.venv-video`, caches, or model files.

## Expected report

Summarize records ingested, timing offsets, aliases, unresolved items, E005 exclusion, E088 conflict, validation commands, and final gate.

## Stop conditions

Stop after committing and pushing this task and creating the blocked E088 follow-up task. Do not execute the blocked follow-up automatically.
