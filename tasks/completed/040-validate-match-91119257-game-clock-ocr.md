# Task 040: Validate Match 91119257 Game Clock OCR

Status: completed
Execution mode: autonomous
Project stage: controlled visual OCR feasibility
Related experiment: match 91119257 video packet
Priority: high
Depends on: task 039 completed with gate manual_visual_review_package_ready
Unlocked by: user instruction requested controlled game-clock OCR after manual-review package commit
Blocks: video-game-clock to demo alignment planning

## Objective

Validate OCR feasibility only for the proposed `game_clock` ROI in match 91119257 frames, using manually transcribed clock values as validation anchors.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `output/match_91119257/video-roi-proposals.json`
- `output/match_91119257/annotation-frame-manifest.jsonl`
- `output/match_91119257/e088-visual-review.json`
- `output/match_91119257/annotation-visibility-summary.json`
- `.venv-video` Python environment

## Work requested

- Inspect OCR package/platform compatibility before installation.
- Do not install YOLO, VLM, ByteTrack, Torch, Transformers, or broad HUD tooling.
- If OCR dependency is compatible and bounded, validate the `game_clock` ROI against a manually transcribed set of at least 30 frames.
- Test bounded preprocessing profiles only.
- Apply the selected configuration to all 446 extracted request rows only if validation is acceptable.
- Estimate video time to displayed game clock from valid OCR readings.

## Constraints

- Do not process replay 005.
- Do not resume parser recovery.
- Do not OCR minimap, player names, target names, structure health, broad HUD, kill feed, souls, or cooldowns.
- Do not treat OCR as ground truth.
- Keep model caches and derived images untracked.

## Inputs

- `output/match_91119257/video-roi-proposals.json`
- `output/match_91119257/annotation-frame-manifest.jsonl`
- `output/match_91119257/e088-visual-review.json`

## Outputs

- `output/match_91119257/game-clock-ocr-environment.json`
- `output/match_91119257/game-clock-manual-ground-truth.json`
- `output/match_91119257/game-clock-ocr-candidates.jsonl`
- `output/match_91119257/game-clock-ocr-evaluation.json`
- `output/match_91119257/game-clock-ocr-results.jsonl`
- `output/match_91119257/video-game-clock-alignment.json`
- `output/match_91119257/e088-clock-ocr-review.json`
- `output/match_91119257/game-clock-ocr-gate.json`
- `reports/match-91119257-controlled-game-clock-ocr.md`

## Acceptance criteria

- OCR compatibility and installed package versions are documented.
- Manual ground truth contains at least 30 distinct frames when OCR runs.
- Raw OCR text is preserved separately from strict parsed values.
- Evaluation reports exact text accuracy, exact second accuracy, ±1 second accuracy, malformed rate, and time-error metrics.
- E088 original and corrected candidate OCR evidence is reported separately.
- Replay 005 is not processed.

## Required validation

- Run existing Python video-pipeline tests.
- Validate JSON and JSONL outputs.
- Validate manual ground-truth row count when OCR runs.
- Validate strict clock parser behavior.
- Verify replay 005 protection.
- Verify model caches, frames, videos, DEM files, and `.venv-video` are not staged.
- Run task queue validation.

## Gate result

Allowed results:

- `game_clock_ocr_ready`
- `game_clock_ocr_ready_with_limitations`
- `game_clock_ocr_not_reliable`
- `game_clock_ocr_dependency_blocked`

## Documentation updates

- Update `docs/PROJECT_STATE.md` and `reports/latest.md`.

## Git scope

Stage explicit paths only. Do not stage model caches, local frames, videos, DEM files, or `.venv-video`.

## Expected report

Report OCR backend, versions, validation count, accuracy metrics, selected preprocessing, full-frame coverage, video-to-clock transform, residuals, E088 result, gate, and limitations.

## Stop conditions

- Stop if OCR dependency installation is incompatible or excessively invasive.
- Stop after committing task 040 and creating a blocked alignment follow-up only if OCR is ready.
