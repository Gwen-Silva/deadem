from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from .errors import VideoDecodeError
from .schemas import DecoderBackend, VideoMetadata, VideoProcessingConfig
from .serialization import sha256_file


def _import_cv2():
    try:
        import cv2  # type: ignore

        return cv2
    except Exception as exc:  # pragma: no cover - depends on env
        raise VideoDecodeError("opencv_unavailable", "OpenCV is required for the base video pipeline.", details={"exception": repr(exc)}) from exc


def probe_ffmpeg_tools() -> dict:
    result: dict[str, object] = {"ffmpeg": None, "ffprobe": None, "warnings": []}
    for name in ("ffmpeg", "ffprobe"):
        binary = shutil.which(name)
        if not binary:
            result["warnings"].append(f"{name} not found on PATH")
            continue
        try:
            completed = subprocess.run([binary, "-version"], check=False, capture_output=True, text=True, timeout=5)
            result[name] = {"path": binary, "version": completed.stdout.splitlines()[0] if completed.stdout else None}
        except Exception as exc:  # pragma: no cover - environment-specific
            result[name] = {"path": binary, "version": None, "error": repr(exc)}
    return result


def probe_video(config: VideoProcessingConfig) -> VideoMetadata:
    video_path = Path(config.video_path)
    if not video_path.exists():
        raise VideoDecodeError("video_not_found", f"Video file does not exist: {video_path}")
    if video_path.suffix.lower() != ".mp4":
        raise VideoDecodeError("unsupported_video_extension", "MVP accepts .mp4 files only.", details={"suffix": video_path.suffix})

    cv2 = _import_cv2()
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise VideoDecodeError("video_open_failed", f"OpenCV could not open video: {video_path}")
    try:
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0) or None
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) or None
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0) or None
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0) or None
        decoded_duration = int((frame_count / fps) * 1000) if frame_count and fps else None
    finally:
        cap.release()

    warnings = []
    ffmpeg = probe_ffmpeg_tools()
    warnings.extend(ffmpeg.get("warnings", []))
    if fps is not None:
        warnings.append("FPS is container/backend reported; constant frame rate is not proven.")

    return VideoMetadata(
        video_path=str(video_path),
        file_size_bytes=video_path.stat().st_size,
        sha256=sha256_file(video_path),
        decoder_backend=DecoderBackend.OPENCV,
        decoder_version=getattr(cv2, "__version__", None),
        container_duration_ms=decoded_duration,
        decoded_duration_ms=decoded_duration,
        fps_reported=fps,
        fps_mode="reported_unverified",
        frame_count_reported=frame_count,
        width=width,
        height=height,
        codec=None,
        time_base="milliseconds via OpenCV CAP_PROP_POS_MSEC",
        has_audio=None,
        variable_frame_rate_status="unverified",
        metadata_warnings=warnings,
    )

