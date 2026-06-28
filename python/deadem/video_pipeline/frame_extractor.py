from __future__ import annotations

from pathlib import Path

from .errors import VideoDecodeError
from .metadata import _import_cv2, probe_video
from .schemas import DecoderBackend, FrameData, FrameDecodeStatus, FrameExtractionMode, FrameRequest, VideoProcessingConfig
from .serialization import deterministic_frame_name, sha256_file


def build_regular_frame_requests(config: VideoProcessingConfig, duration_ms: int | None = None) -> list[FrameRequest]:
    start_ms = config.start_ms
    end_ms = config.end_ms if config.end_ms is not None else duration_ms
    if end_ms is None:
        raise VideoDecodeError("duration_required", "Regular extraction requires a video duration or explicit end_ms.")
    if config.sample_fps:
        step_ms = int(1000 / config.sample_fps)
    elif config.interval_ms:
        step_ms = config.interval_ms
    else:
        step_ms = 1000
    requests = []
    t = start_ms
    while t <= end_ms:
        requests.append(FrameRequest(requested_timestamp_ms=t, request_reason="regular_sampling"))
        t += step_ms
        if config.max_frames and len(requests) >= config.max_frames:
            break
    return requests


def build_timestamp_frame_requests(config: VideoProcessingConfig) -> list[FrameRequest]:
    if not config.timestamps_ms:
        return []
    timestamps = [ts for ts in sorted(config.timestamps_ms) if ts >= config.start_ms and (config.end_ms is None or ts <= config.end_ms)]
    if config.max_frames:
        timestamps = timestamps[: config.max_frames]
    return [FrameRequest(requested_timestamp_ms=ts, request_reason="timestamp_list") for ts in timestamps]


def build_stride_frame_requests(config: VideoProcessingConfig, fps: float | None, frame_count: int | None) -> list[FrameRequest]:
    if not config.source_frame_stride or not fps or not frame_count:
        return []
    requests = []
    for frame_index in range(0, frame_count, config.source_frame_stride):
        ts = int((frame_index / fps) * 1000)
        if ts < config.start_ms or (config.end_ms is not None and ts > config.end_ms):
            continue
        requests.append(FrameRequest(requested_timestamp_ms=ts, request_reason=f"source_frame_stride_{config.source_frame_stride}"))
        if config.max_frames and len(requests) >= config.max_frames:
            break
    return requests


def normalize_requests(config: VideoProcessingConfig, requests: list[FrameRequest]) -> list[FrameRequest]:
    ordered = sorted(requests, key=lambda item: (item.requested_timestamp_ms, item.request_id))
    if not config.deduplicate_requests:
        return ordered
    seen: set[tuple[int, str | None, str]] = set()
    unique = []
    for request in ordered:
        key = (request.requested_timestamp_ms, request.annotation_id, request.request_reason)
        if key in seen:
            continue
        seen.add(key)
        unique.append(request)
    return unique


def extract_frames(config: VideoProcessingConfig, requests: list[FrameRequest] | None = None) -> list[FrameData]:
    metadata = probe_video(config)
    if requests is None:
        if config.extraction_mode == FrameExtractionMode.TIMESTAMPS:
            requests = build_timestamp_frame_requests(config)
        elif config.extraction_mode == FrameExtractionMode.SOURCE_FRAME_STRIDE:
            requests = build_stride_frame_requests(config, metadata.fps_reported, metadata.frame_count_reported)
        else:
            requests = build_regular_frame_requests(config, metadata.decoded_duration_ms)
    requests = normalize_requests(config, requests)
    if config.max_frames:
        requests = requests[: config.max_frames]

    cv2 = _import_cv2()
    cap = cv2.VideoCapture(str(config.video_path))
    if not cap.isOpened():
        return [
            FrameData(
                frame_id="video_open_failed",
                requested_timestamp_ms=0,
                decode_status=FrameDecodeStatus.VIDEO_OPEN_FAILED,
                decoder_backend=DecoderBackend.OPENCV,
                warnings=["OpenCV could not open the video."],
            )
        ]
    frames_dir = Path(config.output_dir) / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    output = []
    try:
        for index, request in enumerate(requests):
            frame_id = f"frame_{index:06d}"
            image_path = frames_dir / deterministic_frame_name(index, request.requested_timestamp_ms, config.image_format)
            if image_path.exists() and not config.overwrite_existing:
                output.append(
                    FrameData(
                        frame_id=frame_id,
                        request_id=request.request_id,
                        annotation_id=request.annotation_id,
                        requested_timestamp_ms=request.requested_timestamp_ms,
                        decoded_timestamp_ms=request.requested_timestamp_ms,
                        timestamp_error_ms=0,
                        image_path=str(image_path),
                        sha256=sha256_file(image_path),
                        decode_status=FrameDecodeStatus.SKIPPED_EXISTING,
                        decoder_backend=DecoderBackend.OPENCV,
                        warnings=["Frame already existed and overwrite_existing=False."],
                    )
                )
                continue
            cap.set(cv2.CAP_PROP_POS_MSEC, request.requested_timestamp_ms)
            ok, frame = cap.read()
            if not ok:
                output.append(
                    FrameData(
                        frame_id=frame_id,
                        request_id=request.request_id,
                        annotation_id=request.annotation_id,
                        requested_timestamp_ms=request.requested_timestamp_ms,
                        decode_status=FrameDecodeStatus.SEEK_FAILED,
                        decoder_backend=DecoderBackend.OPENCV,
                        warnings=["OpenCV seek/read failed."],
                    )
                )
                continue
            decoded_ms = int(cap.get(cv2.CAP_PROP_POS_MSEC) or request.requested_timestamp_ms)
            frame_index = int(cap.get(cv2.CAP_PROP_POS_FRAMES) or 0) - 1
            params = []
            if config.image_format in {"jpg", "jpeg"}:
                params = [int(cv2.IMWRITE_JPEG_QUALITY), int(config.jpeg_quality)]
            cv2.imwrite(str(image_path), frame, params)
            error_ms = decoded_ms - request.requested_timestamp_ms
            status = FrameDecodeStatus.DECODED if abs(error_ms) <= config.seek_tolerance_ms else FrameDecodeStatus.OUT_OF_TOLERANCE
            output.append(
                FrameData(
                    frame_id=frame_id,
                    request_id=request.request_id,
                    annotation_id=request.annotation_id,
                    source_frame_index=frame_index,
                    requested_timestamp_ms=request.requested_timestamp_ms,
                    decoded_timestamp_ms=decoded_ms,
                    timestamp_error_ms=error_ms,
                    image_path=str(image_path),
                    width=int(frame.shape[1]),
                    height=int(frame.shape[0]),
                    sha256=sha256_file(image_path),
                    decode_status=status,
                    decoder_backend=DecoderBackend.OPENCV,
                    warnings=[] if status == FrameDecodeStatus.DECODED else ["Decoded timestamp exceeds configured tolerance."],
                )
            )
    finally:
        cap.release()
    return output

