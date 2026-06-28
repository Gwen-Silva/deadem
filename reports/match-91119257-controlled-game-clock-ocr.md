# Match 91119257 Controlled Game Clock OCR

Date: 2026-06-28

## Scope

Task 040 evaluated OCR only for the proposed `game_clock` ROI. It did not OCR minimap, player names, target names, health, kill feed, souls, cooldowns, or broad HUD regions. It did not process replay 005 or resume parser recovery.

## Backend

- Selected backend: `opencv_template_clock_ocr`
- PaddleOCR decision: `compatible_but_excessively_invasive_for_this_task`
- Packages installed by this task: []
- Model files downloaded: []

## Validation

- Manual validation frames: 30
- Selected preprocessing: `threshold`
- Exact text accuracy: 0.631578947368421
- Exact second accuracy: 0.631578947368421
- +/-1 second accuracy: 0.631578947368421
- Malformed rate: 0.0
- Median / p90 error: 0 / 644

## Full Frame Application

- Request rows processed: 0
- Valid parsed clock rows: 0
- OCR outputs are candidate evidence only, not ground truth.

## Video To Displayed Clock

- Transform: `displayed_game_time = 1.0 * video_time + None`
- Valid anchors: 0
- Residual median/p90/max: None / None / None

## E088

OCR result: `not_used_for_e088_because_ocr_gate_not_reliable`. This remains separate from task 038 visual evidence and does not establish demo alignment.

## Gate

`game_clock_ocr_not_reliable`
