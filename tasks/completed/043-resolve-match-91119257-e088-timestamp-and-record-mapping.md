# Task 043: Resolve Match 91119257 E088 Timestamp and Record Mapping

Status: completed
Execution mode: autonomous
Project stage: visual evidence review
Related experiment: match 91119257 video packet
Priority: medium
Depends on: task 042 completed with gate human_visual_review_ready_with_unresolved_timing
Unlocked by: explicit user authorization to investigate the E088 timestamp/source-record mapping conflict
Blocks: applying E088-specific canonical teleporter timestamp aliases

## Objective

Resolve, if possible, whether E088 should remain tied to the original source CSV interval or to the previously proposed corrected window, without changing visual element identity evidence or video-demo alignment state.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `output/match_91119257/manual-review-human-responses.json`
- `output/match_91119257/human-review-final-gate.json`
- `output/match_91119257/e088-visual-review.json`
- `output/match_91119257/dense-review-frame-manifest.jsonl`
- `output/match_91119257/annotation-frame-manifest.jsonl`
- `data/evidence/match_91119257/raw/match_91119257_events.csv`
- task 035 WPF evidence outputs, if explicitly listed by a future authorization

## Work requested

- Compare source CSV E085-E088 rows.
- Compare dense manifests and task 035 WPF evidence.
- Compare task 038 E088 candidate windows.
- Preserve the user-confirmed 1437.5s Teleporter image evidence.
- Compare neighboring annotations, video clock evidence, and source-order continuity.

## Constraints

- Do not execute this task until explicitly authorized.
- Do not process replay 005.
- Do not resume parser recovery or video-demo alignment.
- Do not overwrite the source CSV.
- Do not delete previous corrected-window evidence.
- Do not downgrade E088 element identity: it remains Teleporter-confirmed.

## Inputs

- Human review outputs from task 042.
- E088 visual review outputs from task 038.
- Dense frame manifests from task 041.
- Original match 91119257 CSV packet.

## Outputs

- A structured E088 timestamp/source-record mapping decision packet.
- A short report documenting evidence, conflicts, and any remaining unresolved mapping.

## Acceptance criteria

- E088 visual identity remains `element_identity_confirmed`.
- Timestamp/source-record mapping is either resolved with evidence or remains explicitly unresolved.
- Original, corrected, and user-confirmed timestamp evidence are all preserved.

## Required validation

- Validate JSON outputs.
- Validate E085-E088 source-row continuity.
- Validate no replay 005 processing.
- Run task queue validation.

## Gate result

e088_mapping_resolved_with_source_correction

## Documentation updates

- Update `docs/PROJECT_STATE.md` and `reports/latest.md` only if this task is later executed.

## Git scope

Stage only task, report, and structured output files when executed.

## Expected report

Explain whether E088's timestamp/source-row mapping can be resolved without using demo alignment.

## Stop conditions

Stop if evidence remains ambiguous or a video-demo alignment task would be required.
