# Task 038: Validate Match 91119257 Annotation Frame Visibility

Status: blocked
Execution mode: mixed
Project stage: visual evidence review
Related experiment: match 91119257 video packet
Priority: high
Depends on: task 037 completed with gate annotation_frame_set_ready or annotation_frame_set_ready_with_limitations
Unlocked by: explicit user authorization to begin visual or model-assisted review of extracted annotation frames
Blocks: visual-demo calibration and alias validation decisions

## Objective

Review the extracted annotation frame groups for match 91119257 to determine whether the frames visibly support later OCR, landmark, minimap, and side/lane alias work.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `tasks/completed/037-extract-complete-match-91119257-annotation-frame-set.md`
- `reports/match-91119257-complete-annotation-frame-extraction.md`
- `output/match_91119257/annotation-frame-requests.json`
- `output/match_91119257/annotation-frame-manifest.jsonl`
- `output/match_91119257/contact-sheet-manifest.json`
- local frames under `output-local/match_91119257/annotation-frames-opencv/`

## Work requested

- Determine whether each annotation group visibly shows game clock, minimap, lane color, structure type, structure team, and landmark context.
- Preserve uncertainty and distinguish visible evidence from interpretation.
- Consider OCR only after measuring clock and HUD visibility.
- Do not install OCR, detection, VLM, or tracking dependencies unless a later task explicitly authorizes them.

## Constraints

- Do not process replay 005.
- Do not infer macro, rotations, fights, semantic lane occupancy, strategic intent, or decision quality.
- Do not resolve parser entity 5594 in this task.
- Do not treat visual observations as ground truth unless independently validated.

## Inputs

- Tracked task 037 manifests.
- Local untracked task 037 frames and contact sheets.

## Outputs

- A visual visibility audit.
- A minimized list of annotations requiring manual review or OCR.
- Updated report.

## Acceptance criteria

- All 88 annotation groups are considered.
- Visibility statuses are recorded separately for clock, minimap, lane color, structure type, structure team, and landmark context.
- E088 remains explicitly split between original and corrected candidate windows.
- No semantic gameplay conclusions are made.

## Required validation

- Validate JSON/JSONL outputs.
- Confirm no replay 005 processing.
- Confirm no heavy optional dependencies were installed.
- Run task queue validation.

## Gate result

Allowed results:

- `annotation_visibility_ready_for_ocr_planning`
- `annotation_visibility_requires_manual_review`
- `annotation_visibility_insufficient`

## Documentation updates

- Update `docs/PROJECT_STATE.md` and `reports/latest.md` only after execution.

## Git scope

Stage explicit paths only. Do not stage local frames or contact sheets.

## Expected report

Report visibility coverage, unresolved annotations, E088 status, whether OCR is justified, and remaining limitations.

## Stop conditions

- Stop until explicit user authorization promotes this task.
- Stop if visual review requires human judgment unavailable to Codex.
