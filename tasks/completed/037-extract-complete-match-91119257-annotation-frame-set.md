# Task 037: Extract Complete Match 91119257 Annotation Frame Set

Status: completed
Execution mode: autonomous
Project stage: visual evidence processing
Related experiment: match 91119257 video packet
Priority: high
Depends on: video_pipeline_runtime_ready
Unlocked by: CPython 3.12 local runtime and OpenCV base pipeline validated
Blocks: visual annotation review task

## Objective

Process the complete 88-event visual annotation packet for match 91119257 using the validated OpenCV base video pipeline, producing deterministic frame manifests and local review contact sheets without semantic interpretation.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `data/evidence/match_91119257/raw/match_91119257_events.csv`
- `output/match_91119257/input-file-manifest.json`
- `output/match_91119257/video-frame-index.json`
- `python/deadem/video_pipeline/`

## Work requested

- Verify the preserved annotation CSV hash and load exactly 88 unique source annotations.
- Generate start, midpoint, end, context-before, and context-after frame requests for every annotation when in video range.
- Preserve both E088 candidate windows, `23:50-23:55` and `24:50-24:55`, as alternate candidates.
- Extract frames through `.venv-video\Scripts\python.exe` and the OpenCV backend.
- Save extracted images and contact sheets under `output-local/`.
- Create tracked manifests, summaries, seek audit, WPF comparison, quality audit, gate output, and report.
- Create a separate blocked follow-up task for visual validation if the frame set is ready or ready with limitations.

## Constraints

- Do not install or enable OCR, YOLO, PaddleOCR, PaddlePaddle, VLM, ByteTrack official, GPU packages, or other heavy optional dependencies.
- Do not process replay 005.
- Do not resolve parser entity 5594.
- Do not perform semantic interpretation, macro analysis, lane transitions, rotations, fight detection, decision evaluation, or visual conclusions.
- Do not commit MP4, DEM, extracted frames, contact-sheet images, `.venv-video`, model files, or caches.

## Inputs

- `samples/videos/Partida_006_Replay.mp4`
- `data/evidence/match_91119257/raw/match_91119257_events.csv`
- `output/match_91119257/input-file-manifest.json`
- `output/match_91119257/video-frame-index.json`

## Outputs

- `output/match_91119257/annotation-frame-requests.json`
- `output/match_91119257/annotation-frame-manifest.jsonl`
- `output/match_91119257/annotation-frame-summary.json`
- `output/match_91119257/video-seek-audit.json`
- `output/match_91119257/wpf-opencv-frame-comparison.json`
- `output/match_91119257/contact-sheet-manifest.json`
- `output/match_91119257/annotation-frame-quality.json`
- `output/match_91119257/annotation-frame-extraction-gate.json`
- `reports/match-91119257-complete-annotation-frame-extraction.md`

## Acceptance criteria

- Exactly 88 source annotations are represented.
- Annotation IDs are unique and source order is preserved separately from chronological order.
- Required start, midpoint, and end requests are generated for every annotation.
- Contextual requests are generated only when within the valid video range.
- E088 original and corrected candidate windows are preserved separately.
- Every request has a manifest row with requested timestamp, decoded timestamp, timestamp error, frame ID, path, SHA-256, status, and warnings.
- Frame images and contact sheets are local and untracked.
- WPF comparison is reported without requiring pixel equality.
- Determinism is checked by a repeated representative extraction.

## Required validation

- Run Python video-pipeline tests.
- Validate JSON and JSONL outputs.
- Validate annotation count equals 88.
- Validate request count reconciliation.
- Validate timestamp ordering.
- Validate output sizes.
- Validate deterministic extraction subset.
- Run task queue validation.
- Confirm replay 005, MP4, DEM, frames, and contact sheets are not committed.

## Gate result

Allowed results:

- `annotation_frame_set_ready`
- `annotation_frame_set_ready_with_limitations`
- `annotation_frame_set_incomplete`
- `annotation_video_decode_blocked`

## Documentation updates

- Update `docs/PROJECT_STATE.md` with the gate result.
- Update `reports/latest.md`.

## Git scope

Stage explicit paths only. Commit code, manifests, summaries, reports, docs, and queue files. Do not stage local frames or media.

## Expected report

Report annotation count, request count, unique frames, failures, deduplication, seek errors, WPF comparison, contact sheets, E088 status, determinism, gate result, and remaining limitations.

## Stop conditions

- Stop after completing this task and creating the follow-up visual-validation task.
- Stop if video decoding is blocked.
- Stop if the frame set is materially incomplete.
- Do not execute the follow-up visual-validation task in the same run.
