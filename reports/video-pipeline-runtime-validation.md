# Video Pipeline Runtime Validation

## Result

Gate: `video_pipeline_runtime_ready`

## Python

- Installed/found: CPython 3.12.10 x64
- Executable used: `.venv-video/Scripts/python.exe`
- Architecture: `64bit WindowsPE`
- Installation method: `winget install --exact --id Python.Python.3.12 --scope user` after Windows reboot
- Environment: `.venv-video`

The `py` launcher was not reliable in the active shell, so validation used the real CPython path to create the venv and then the venv Python directly.

## Packages

Installed only base/development dependencies:

- `numpy 2.5.0`
- `pydantic 2.13.4`
- `opencv-python-headless 4.13.0.92`
- `pytest 9.1.1`

Not installed: `ultralytics`, `paddleocr`, `paddlepaddle`, `torch`, `transformers`, `VideoLLaMA3`, or official ByteTrack.

## Tests

Command:

```powershell
.\.venv-video\Scripts\python.exe -m pytest tests\video_pipeline -v
```

Result: 12 passed.

One implementation defect was corrected: `Protocol` imports now come from `typing` instead of `collections.abc`. A second small defect was corrected so `result.json` appears in `output_files`.

## Synthetic Video

Created a small deterministic local video under `output-local/video-pipeline-smoke/`.

- Regular extraction: 3 frames
- Timestamp extraction: 4 frames
- Requested, decoded, and error timestamps were recorded
- Observed seek errors: `0ms` in the smoke outputs

The synthetic video and frames are local and not committed.

## Match 91119257 MP4

Opened `samples/videos/Partida_006_Replay.mp4` through the OpenCV backend and extracted a maximum of 10 requested frames, deduplicated to 8 unique timestamps from the task 035 WPF manifest.

- Output: `output-local/match_91119257/video-opencv-base/`
- OCR: disabled
- YOLO/detection: disabled
- Tracking: disabled
- VLM: disabled
- Replay 005: not processed

The OpenCV sample uses the same requested timestamps as the WPF manifest. Hashes differ as expected because decoder, image format, and output resolution differ.

## Remaining Limitations

- `py` launcher availability may require a fresh terminal/PATH refresh; venv execution does not depend on it.
- Optional visual AI integrations remain intentionally uninstalled.
- No video output is ground truth.
- This validation does not resolve the parser blocker from task 035.

