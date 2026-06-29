# Task 039: Prepare Match 91119257 Minimized Human Visual Review

Status: completed
Execution mode: autonomous
Project stage: visual evidence review
Related experiment: match 91119257 video packet
Priority: high
Depends on: task 038 completed with gate annotation_visibility_requires_manual_review
Unlocked by: user instruction explicitly requested human-review preparation for the 24 minimized cases
Blocks: side/lane alias validation and corrected visual annotation decisions

## Objective

Prepare a compact human-facing review package for the 24 minimized match 91119257 visual cases so the user can answer targeted questions without inspecting repository internals.

## Context to read

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `output/match_91119257/minimized-manual-review.json`
- `output/match_91119257/annotation-visibility-audit.json`
- `output/match_91119257/visual-alias-feasibility.json`
- `output/match_91119257/e088-visual-review.json`
- local full-resolution frames/contact sheets under `output-local/match_91119257/`

## Work requested

- Create one review record per minimized case.
- Ask only questions relevant to each case.
- Provide allowed response vocabulary and structured correction fields.
- Produce JSON, CSV, instructions, manifest, local review sheets when useful, and report.

## Constraints

- Do not process replay 005.
- Do not install OCR, YOLO, PaddleOCR, VLM, tracking, or other optional dependencies.
- Do not resume parser recovery.
- Do not pre-fill unresolved answers as confirmed.
- Do not commit frames or contact-sheet images.

## Inputs

- `output/match_91119257/minimized-manual-review.json`
- `output/match_91119257/annotation-visibility-audit.json`
- `output/match_91119257/visual-alias-feasibility.json`
- `output/match_91119257/e088-visual-review.json`

## Outputs

- `output/archive/match_91119257/manual-review/manual-review-form.json`
- `output/archive/match_91119257/manual-review/manual-review-form.csv`
- `output/match_91119257/manual-review-instructions.md`
- `output/match_91119257/manual-review-package-manifest.json`
- `reports/match-91119257-minimized-human-review-preparation.md`

## Acceptance criteria

- The package contains exactly the minimized review cases from task 038.
- Every review record includes source annotation, candidate frames, questions, allowed responses, empty user response, and notes.
- The CSV contains review rows suitable for manual editing.
- Local review sheet paths are referenced but images are not committed.
- No semantic gameplay conclusions are added.

## Required validation

- Run existing Python video-pipeline tests.
- Validate JSON.
- Validate CSV row count.
- Validate review case count equals the minimized review count.
- Verify replay 005 protection.
- Verify local frames and sheets are not staged.
- Run task queue validation.

## Gate result

Allowed results:

- `manual_visual_review_package_ready`
- `manual_visual_review_package_ready_with_limitations`
- `manual_visual_review_package_blocked`

## Documentation updates

- Update `docs/PROJECT_STATE.md` and `reports/latest.md`.

## Git scope

Stage explicit paths only. Do not stage local frames, contact sheets, videos, DEM files, caches, or `.venv-video`.

## Expected report

Report review case count, output paths, local sheet paths, gate result, limitations, and validation commands.

## Stop conditions

- Stop this task after producing and committing the review package.
- Do not ingest answers because no answers have been supplied yet.
