# Task 041: Rebuild Match 91119257 Dense Manual Review Package

Status: completed
Execution mode: autonomous
Project stage: visual evidence review
Related experiment: match 91119257 video packet
Priority: high
Depends on: task 039 completed and task 040 completed
Unlocked by: user identified that the current task 037/039 frame selection is not representative for several annotations
Blocks: human visual review ingestion and side/lane alias validation

## Objective

Generate dense temporal review windows for all 24 minimized manual-review annotations so the replacement review package can show frames that are more likely to contain the annotated target.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `output/match_91119257/minimized-manual-review.json`
- `output/match_91119257/manual-review-form.json`
- `output/match_91119257/annotation-frame-manifest.jsonl`
- `data/evidence/match_91119257/raw/match_91119257_events.csv`
- `samples/videos/Partida_006_Replay.mp4`

## Work requested

- Preserve provisional user observations for E001, E002, E003, E004, E005, E006, and E009.
- Extract dense frames for every one of the 24 review annotations from start - 5 seconds through end + 5 seconds at 500 ms intervals.
- Escalate unresolved annotations to start - 10 seconds through end + 10 seconds at 500 ms intervals.
- Produce dense manifests, annotation summaries, candidate shortlists, escalation records, v2 review forms, manifest, and report.
- Generate local untracked dense contact sheets and shortlist sheets.

## Constraints

- Do not process replay 005.
- Do not install OCR, YOLO, VLM, tracking, or other heavy dependencies.
- Do not resume parser recovery.
- Do not ingest current natural-language answers as final confirmations.
- Do not commit extracted frames or contact sheets.

## Inputs

- `output/match_91119257/minimized-manual-review.json`
- `output/match_91119257/manual-review-form.json`
- `output/match_91119257/annotation-frame-manifest.jsonl`
- `data/evidence/match_91119257/raw/match_91119257_events.csv`
- `samples/videos/Partida_006_Replay.mp4`

## Outputs

- `output/match_91119257/dense-review-frame-manifest.jsonl`
- `output/match_91119257/dense-review-annotation-summary.json`
- `output/match_91119257/dense-review-candidate-shortlist.json`
- `output/match_91119257/dense-review-escalations.json`
- `output/match_91119257/provisional-human-review-observations.json`
- `output/match_91119257/manual-review-form-v2.json`
- `output/match_91119257/manual-review-form-v2.csv`
- `output/match_91119257/manual-review-package-v2-manifest.json`
- `reports/match-91119257-dense-manual-review-rebuild.md`

## Acceptance criteria

- Exactly 24 review annotations are processed.
- Every annotation has a dense window and decoded rows or explicit failures.
- Requests preserve annotation ID, original interval, dense interval, requested timestamp, decoded timestamp, offset, frame path, hash, and status.
- E005 record existence and source status are investigated.
- E009 receives expanded selection when necessary.
- V1 manual-review answers are not promoted.
- V2 forms reference dense sheets, shortlist sheets, exact frame paths, intervals, escalation status, and provisional user observations.

## Required validation

- Run existing Python tests.
- Validate JSON and JSONL outputs.
- Validate exactly 24 review annotations.
- Validate chronological ordering.
- Validate deterministic subset rerun.
- Verify replay 005 protection.
- Verify no heavy dependency was installed.

## Gate result

dense_manual_review_package_ready
- Run task queue validation.
- Confirm local frames/contact sheets are not staged.

## Gate result

Allowed results:

- `dense_manual_review_package_ready`
- `dense_manual_review_package_ready_with_unresolved_frames`
- `dense_manual_review_video_blocked`

## Documentation updates

- Update `docs/PROJECT_STATE.md` and `reports/latest.md`.

## Git scope

Stage explicit paths only. Do not stage MP4, extracted frames, dense contact sheets, `.venv-video`, or caches.

## Expected report

Report processed annotation count, dense request count, extracted frame count, escalations, representative candidate coverage, unresolved annotations, E005, E009, gate, validation, and output paths.

## Stop conditions

- Stop after committing this rebuild package.
- Do not resume manual-review ingestion until the replacement package has been reviewed.
