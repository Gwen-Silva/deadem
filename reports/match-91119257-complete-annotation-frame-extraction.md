# Match 91119257 Complete Annotation Frame Extraction

Date: 2026-06-28

## Scope

Task 037 extracted deterministic OpenCV frame evidence for the preserved 88-event visual annotation packet. This task produced frame manifests, contact-sheet manifests, quality checks, a seek audit, and a WPF metadata comparison only. It did not run OCR, detection, VLM, tracking, parser recovery, video-demo alignment, or semantic interpretation.

## Inputs

- Video: `samples/videos/Partida_006_Replay.mp4`
- Annotation CSV: `data/evidence/match_91119257/raw/match_91119257_events.csv`
- CSV SHA-256 verified against preserved packet: `True`
- WPF manifest: `output/match_91119257/video-frame-index.json`

## Results

- Source annotations loaded: 88
- Unique annotation IDs: 88
- Frame requests generated: 446
- Successful frame rows: 446
- Failed frame rows: 0
- Unique frame hashes: 437
- Duplicate hash references: 15
- Contact sheets generated locally: 10
- Readable frames: 446 / 446

## Timing

- Video duration: 1843966 ms
- FPS reported: 30.0
- Frame count reported: 55319
- Seek error median/p90/max: 0.0 / 0.0 / 0.0 ms
- Seek error growth: `stable`

## WPF Comparison

- Shared comparable requests: 174
- Consistent shared requests: 174
- Inconsistent shared requests: 0

This comparison checks metadata and availability only. Pixel equality and visual differences are intentionally not evaluated.

## E088

E088 includes the original `23:50-23:55` candidate and the probable `24:50-24:55` correction as separate alternate-candidate frame requests. This task preserves both windows and does not resolve the annotation.

## Determinism

- Mode: `representative_subset`
- Subset request count: 30
- Deterministic: True

## Gate

`annotation_frame_set_ready`

## Limitations

- Actual frames and contact-sheet images are stored under `output-local/` and are intentionally untracked.
- No visual element, HUD text, minimap content, structure type, side alias, lane color alias, or game-clock value was interpreted.
- The parser entity-5594 failure remains separate and unresolved.
- Replay 005 was not processed.

## Outputs

- `output/match_91119257/annotation-frame-requests.json`
- `output/match_91119257/annotation-frame-manifest.jsonl`
- `output/match_91119257/annotation-frame-summary.json`
- `output/match_91119257/video-seek-audit.json`
- `output/match_91119257/wpf-opencv-frame-comparison.json`
- `output/match_91119257/contact-sheet-manifest.json`
- `output/match_91119257/annotation-frame-quality.json`
- `output/match_91119257/annotation-frame-extraction-gate.json`
