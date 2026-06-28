# Video Pipeline MVP

## Summary

Created an isolated Python subproject under `python/deadem/video_pipeline/` because the repository already uses `packages/deadem` for the Node.js package and no Python project was configured. The Node.js workflows remain unchanged.

## Layout

- `python/pyproject.toml`
- `python/deadem/video_pipeline/`
- `tests/video_pipeline/`
- `output/video-pipeline-mvp-gate.json`

## Python And Platform

- Windows workspace.
- `python.exe` on PATH is the WindowsApps alias and is not executable in this environment.
- The only discovered executable Python was Unity's embedded Python `3.7.4`, which is not suitable because the subproject requires Python `>=3.10` and does not include `pydantic`, `cv2`, or `pytest`.

## Backends And Dependencies

Base dependencies are `numpy`, `pydantic>=2`, and `opencv-python-headless`.

Optional extras are:

- `video-detection`: `ultralytics`
- `video-ocr`: `paddleocr`
- `video-ffmpeg`: `ffmpeg-python`
- `video-all`: optional Python wrappers except platform-specific Paddle runtime

`ffmpeg-python` is documented as a wrapper only; it does not install the FFmpeg binaries.

## Implemented MVP

- Pydantic schemas for config, metadata, frame requests, frame data, detections, OCR, tracks, VLM notes, processing errors, stage metrics, and pipeline results.
- OpenCV metadata probe and incremental frame extraction.
- Regular sampling, timestamp lists, annotation windows, source-frame stride request generation, deterministic frame names, hashes, and JSON/JSONL persistence.
- CSV/SRT/VTT/JSON annotation loading.
- Configurable ROI profiles for HUD/minimap-style regions without universal coordinates.
- Lazy optional YOLO and PaddleOCR adapters with structured missing-dependency errors.
- IoU fallback tracker with tests.
- Unconfigured VLM adapter that returns structured unavailable notes and never installs or initializes models.
- CLI via `python -m deadem.video_pipeline.cli`.

## Tests

Tests were written for schemas, annotation parsing, frame-request generation, missing-video typed errors, optional dependency error shapes, VLM unavailable behavior, and IoU fallback tracking.

They were not executed because no suitable Python runtime is available in the current environment.

## Synthetic Video

Not processed in this run because OpenCV and pytest are unavailable locally. The tests are structured so a future Python `>=3.10` environment with `opencv-python-headless` can create or process small deterministic videos without network access.

## Instructions For Match 91119257

After installing the base environment:

```bash
cd python
python -m pip install -e ".[video-base,dev]"
python -m deadem.video_pipeline.cli \
  --video ../samples/videos/Partida_006_Replay.mp4 \
  --output ../output-local/match_91119257/video \
  --annotations ../data/evidence/match_91119257/raw/annotations.csv \
  --annotation-frames start,midpoint,end \
  --image-format png \
  --enable-ocr \
  --ocr-region game_clock \
  --offline
```

Do not commit the MP4, extracted frames, model weights, or caches. Parser telemetry remains a separate blocker from task 035.

## Limitations

- The MVP is dependency-blocked in this environment until a usable Python runtime and base packages are installed.
- YOLO, PaddleOCR, and VLM are optional and disabled by default.
- Generic YOLO does not recognize Deadlock-specific structures or HUD classes.
- OCR can misread stylized HUD text.
- IoU fallback tracking is not ByteTrack and does not validate semantic identity.
- OpenCV seek accuracy must be evaluated per video.
- No output is ground truth.
- No macro, rotations, occupancy, fights, pickoffs, decisions, intent, or strategy are inferred.

## Gate

`video_pipeline_dependency_blocked`

