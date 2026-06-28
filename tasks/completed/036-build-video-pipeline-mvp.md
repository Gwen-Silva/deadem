# Task 036: Build Video Pipeline MVP

Status: completed
Execution mode: autonomous
Project stage: Reusable visual evidence infrastructure
Related experiment: video processing MVP
Priority: high
Depends on: task 035 completed with gate `visual_demo_calibration_parser_blocked`
Unlocked by: need for reusable local MP4 processing after task 035 recovered frames but not visual interpretation or demo alignment
Blocks: processing match 91119257 visual packet through a reusable module

## Objective

Create a modular MVP video-processing package for Deadem that accepts local `.mp4` files and produces structured visual evidence for later synchronization with demos, timelines, annotations, landmarks, structural entities, game clock, minimap, and HUD.

The MVP must not implement Deadlock macro interpretation, rotations, semantic occupancy, teamfights, pickoffs, strategic decisions, player intent, or objective-preparation judgments.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`
- `tasks/completed/035-recover-match-91119257-video-frame-and-demo-telemetry-alignment.md`
- `reports/match-91119257-visual-demo-calibration.md`
- repository root layout
- `.gitignore`
- existing package configuration files

## Work requested

- Inspect repository structure and create an isolated Python subproject if no Python package exists.
- Implement `python/deadem/video_pipeline/` or a coherent equivalent when `deadem/` would conflict.
- Provide Pydantic schemas for configs, metadata, frame requests, frames, detections, OCR, tracks, VLM notes, errors, and pipeline results.
- Implement OpenCV-based metadata probing and frame extraction with optional ffprobe audit when available.
- Implement regular sampling, timestamp-list extraction, annotation-window extraction, source-frame stride, deterministic names, hashes, JSON/JSONL persistence, and resumable manifests.
- Implement configurable ROIs, optional detector/OCR/tracker/VLM interfaces, lazy optional imports, structured unavailable errors, and an IoU fallback tracker.
- Implement CSV/SRT/VTT/JSON annotation loading and annotation-to-frame-request generation.
- Implement a CLI entry point for basic extraction and optional disabled-by-default stages.
- Add tests for schemas, extraction, annotations, optional dependency errors, and fallback tracking using synthetic video or fake decoder when needed.
- Add `.gitignore` entries for large local video-pipeline outputs, frames, model weights, and caches.
- Write `reports/video-pipeline-mvp.md`.

## Constraints

- Do not process replay 005.
- Do not commit MP4, DEM, large extracted frames, model weights, caches, or downloaded models.
- Do not require YOLO, PaddleOCR, VideoLLaMA3, GPU, internet access, or model downloads.
- Keep heavy imports lazy.
- Keep Node.js workflows working unchanged.
- Do not install both `opencv-python` and `opencv-python-headless`.
- Do not add `paddlepaddle` blindly to universal extras.
- Do not treat visual outputs as ground truth.

## Inputs

Repository structure, task 035 outputs, and local runtime/dependency availability.

## Outputs

- `python/pyproject.toml` or equivalent isolated Python project configuration.
- `python/deadem/video_pipeline/` package.
- `tests/video_pipeline/` tests.
- `.gitignore` updates for local visual artifacts.
- `reports/video-pipeline-mvp.md`.

## Acceptance criteria

- Base package works without optional heavy dependencies.
- Config validation prevents ambiguous sampling modes and invalid times.
- Synthetic or fake video smoke path validates metadata/frame extraction behavior.
- Timestamp extraction records requested and decoded timestamps separately.
- Results persist to JSON/JSONL with provenance, warnings, errors, and output file references.
- Missing YOLO, PaddleOCR, and VLM integrations return structured errors.
- IoU fallback tracker is tested.
- Annotation CSV can generate start/mid/end frame requests.
- No macro/strategic interpretation is produced.

## Required validation

- Python tests when a Python runtime is available.
- If no Python runtime is available, run static file/schema inspection where possible and record the blocker.
- ESLint/task queue validation for the existing repository.
- Git verification that MP4, DEM, model weights, caches, large frame files, and replay 005 outputs were not modified or committed.

## Gate result

Allowed results:

- `video_pipeline_mvp_ready`
- `video_pipeline_mvp_ready_with_limitations`
- `video_pipeline_dependency_blocked`
- `video_pipeline_architecture_blocked`

## Documentation updates

Update `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, and `reports/latest.md` when justified.

## Git scope

Use explicit staging only. Commit this task separately.

## Expected report

Summarize layout, Python/platform tested, video backend availability, dependencies, optional extras, synthetic video result, outputs, tests, limitations, 91119257 usage instructions, gate result, and replay 005 protection.

## Stop conditions

Stop after committing the MVP task and optionally creating but not executing a separate task for processing match 91119257 with the new module. Do not process replay 005.
