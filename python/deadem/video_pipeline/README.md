# Deadem Video Pipeline MVP

## Objective

Transform local video files into structured visual evidence that can later be synchronized with `.dem` files, canonical Deadem timelines, CSV/SRT/VTT annotations, landmarks, structural entities, game clocks, minimap, and HUD regions.

## Non-Objectives

This module does not understand Deadlock macro. It does not classify rotations, semantic occupancy, teamfights, pickoffs, decision quality, player intent, or strategic objective preparation.

## Architecture

```text
video
-> metadata
-> frame requests
-> decoded frames
-> configurable ROIs
-> optional OCR/detection
-> optional tracking
-> optional VLM note
-> manifests and result.json
```

Every observation records provenance, confidence, warnings, and limitations. No output is automatically ground truth.

## Install

The repository Node.js workflows do not depend on this package. Install the Python subproject separately:

```bash
cd python
python -m pip install -e ".[video-base,dev]"
```

Optional extras:

- `video-detection`: installs `ultralytics`.
- `video-ocr`: installs `paddleocr`.
- `video-ffmpeg`: installs `ffmpeg-python`.
- `video-all`: installs optional Python wrappers except platform-specific Paddle runtime.

`ffmpeg-python` does not install the FFmpeg binary. The pipeline detects `ffmpeg` and `ffprobe` on `PATH` but can operate through OpenCV without them.

Do not install both `opencv-python` and `opencv-python-headless` in the same environment.

## Models And Offline Mode

Detection, OCR, and VLM are disabled by default. Heavy imports are lazy. Tests must not download weights, access the internet, require GPU, or initialize VideoLLaMA3.

Use local model paths when available. The generic YOLO architecture smoke path does not imply it recognizes Guardian, Walker, Patron, Mid Boss, Urn, Deadlock HUD, minimap icons, heroes, or structures. Deadlock-specific detection requires a labeled dataset, classes, training/fine-tuning, and independent evaluation.

## Timestamps

The pipeline keeps these domains separate:

- requested video timestamp;
- decoded timestamp;
- seek error;
- visible game clock;
- canonical demo time.

Do not treat these clocks as equivalent without an explicit alignment transform.

## Example

```bash
python -m deadem.video_pipeline.cli \
  --video samples/videos/Partida_006_Replay.mp4 \
  --output output-local/match_91119257/video \
  --annotations data/evidence/match_91119257/raw/annotations.csv \
  --annotation-frames start,midpoint,end \
  --image-format png \
  --enable-ocr \
  --ocr-region game_clock \
  --offline
```

Frames and large local evidence should live under ignored output directories and should not be committed.

## Limitations

- OpenCV seek can return the nearest decodable frame rather than the exact requested timestamp.
- OCR can misread stylized text and small HUD elements.
- IoU fallback tracking is not ByteTrack and does not validate identity.
- VLM adapters may hallucinate and must not produce confirmed facts.
- ROIs vary by resolution, aspect ratio, HUD scale, spectator mode, and replay perspective.

