from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from .annotations import build_annotation_frame_requests, load_annotations
from .detector import YoloDetector
from .errors import OptionalDependencyUnavailable, VideoPipelineError
from .frame_extractor import build_timestamp_frame_requests, extract_frames
from .metadata import probe_video
from .ocr import PaddleHudOCR
from .schemas import (
    ConfidenceLevel,
    FrameExtractionMode,
    OCRResult,
    PIPELINE_VERSION,
    ProcessingError,
    ProcessingStatus,
    Provenance,
    StageMetric,
    TrackerBackend,
    VideoPipelineResult,
    VideoProcessingConfig,
)
from .serialization import write_json, write_jsonl
from .tracker import IoUFallbackTracker
from .vlm import UnconfiguredVideoLLaMA3Adapter


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _metric(stage: str, started_at: datetime, items_in: int, items_out: int, warnings: int, errors: int, backend: str | None = None, device: str | None = None) -> StageMetric:
    finished_at = _now()
    return StageMetric(
        stage=stage,
        started_at=started_at,
        finished_at=finished_at,
        duration_ms=int((finished_at - started_at).total_seconds() * 1000),
        items_in=items_in,
        items_out=items_out,
        warnings=warnings,
        errors=errors,
        backend=backend,
        device=device,
    )


def _error_from_exception(stage: str, exc: Exception, *, recoverable: bool = True) -> ProcessingError:
    if isinstance(exc, VideoPipelineError):
        return ProcessingError(stage=stage, error_code=exc.error_code, message=str(exc), exception_type=type(exc).__name__, recoverable=recoverable, details=exc.details)
    return ProcessingError(stage=stage, error_code="unexpected_error", message=str(exc), exception_type=type(exc).__name__, recoverable=recoverable)


def process_video(config: VideoProcessingConfig) -> VideoPipelineResult:
    config.output_dir.mkdir(parents=True, exist_ok=True)
    output_files: dict[str, str] = {}
    warnings: list[str] = []
    errors: list[ProcessingError] = []
    metrics: list[StageMetric] = []

    started = _now()
    metadata = None
    try:
        metadata = probe_video(config)
        output_files["metadata"] = str(config.output_dir / "metadata.json")
        write_json(Path(output_files["metadata"]), metadata)
        metrics.append(_metric("metadata", started, 1, 1, len(metadata.metadata_warnings), 0, backend=metadata.decoder_backend.value, device=config.device))
        warnings.extend(metadata.metadata_warnings)
    except Exception as exc:
        errors.append(_error_from_exception("metadata", exc, recoverable=False))
        result = VideoPipelineResult(
            status=ProcessingStatus.FAILED_FATAL,
            video_metadata=None,
            config=config,
            provenance=[Provenance(source=str(config.video_path), method="metadata_probe", confidence=ConfidenceLevel.UNRESOLVED)],
            warnings=warnings,
            errors=errors,
            stage_metrics=metrics,
            output_files=output_files,
        )
        write_json(config.output_dir / "result.json", result)
        return result

    annotations = []
    frame_requests = None
    if config.annotation_file:
        started = _now()
        try:
            annotations = load_annotations(config.annotation_file)
            frame_requests = build_annotation_frame_requests(
                annotations,
                include_start="start" in config.annotation_frames,
                include_midpoint="midpoint" in config.annotation_frames,
                include_end="end" in config.annotation_frames,
                margin_ms=config.annotation_margin_ms,
            )
            output_files["frame_requests"] = str(config.output_dir / "frame-requests.json")
            write_json(Path(output_files["frame_requests"]), {"annotations": [a.model_dump(mode="json") for a in annotations], "frame_requests": [r.model_dump(mode="json") for r in frame_requests]})
            metrics.append(_metric("annotations", started, len(annotations), len(frame_requests), 0, 0))
        except Exception as exc:
            errors.append(_error_from_exception("annotations", exc))
    elif config.extraction_mode == FrameExtractionMode.TIMESTAMPS:
        frame_requests = build_timestamp_frame_requests(config)

    started = _now()
    frames = []
    try:
        frames = extract_frames(config, frame_requests)
        frame_manifest = config.output_dir / "frame-manifest.jsonl"
        output_files["frame_manifest"] = str(frame_manifest)
        write_jsonl(frame_manifest, frames)
        metrics.append(_metric("frames", started, len(frame_requests or []), len(frames), sum(len(f.warnings) for f in frames), 0, backend=config.decoder_backend.value, device=config.device))
    except Exception as exc:
        errors.append(_error_from_exception("frames", exc, recoverable=False))

    detections = []
    if config.enable_detection:
        started = _now()
        try:
            detector = YoloDetector(config.detection_model, config.device, config.detection_confidence, config.detection_iou, allow_download=config.allow_model_download)
            detections = list(detector.detect_batch(frames))
            path = config.output_dir / "detections.jsonl"
            output_files["detections"] = str(path)
            write_jsonl(path, detections)
            metrics.append(_metric("detection", started, len(frames), len(detections), 0, 0, backend="yolo", device=config.device))
        except OptionalDependencyUnavailable as exc:
            errors.append(_error_from_exception("detection", exc))
            metrics.append(_metric("detection", started, len(frames), 0, 1, 1, backend="yolo", device=config.device))
    else:
        output_files["detections"] = str(config.output_dir / "detections.jsonl")
        write_jsonl(Path(output_files["detections"]), [])

    ocr_results: list[OCRResult] = []
    if config.enable_ocr:
        started = _now()
        try:
            ocr = PaddleHudOCR(config.ocr_language, device=config.device)
            ocr_results = list(ocr.read_batch(frames, None))
            path = config.output_dir / "ocr-results.jsonl"
            output_files["ocr_results"] = str(path)
            write_jsonl(path, ocr_results)
            metrics.append(_metric("ocr", started, len(frames), len(ocr_results), 0, 0, backend="paddleocr", device=config.device))
        except OptionalDependencyUnavailable as exc:
            errors.append(_error_from_exception("ocr", exc))
            metrics.append(_metric("ocr", started, len(frames), 0, 1, 1, backend="paddleocr", device=config.device))
    else:
        output_files["ocr_results"] = str(config.output_dir / "ocr-results.jsonl")
        write_jsonl(Path(output_files["ocr_results"]), [])

    tracks = []
    if config.enable_tracking:
        started = _now()
        if config.tracker_backend == TrackerBackend.IOU_FALLBACK:
            tracker = IoUFallbackTracker(**config.tracker_config)
            for frame in frames:
                frame_detections = [d for d in detections if d.frame_id == frame.frame_id]
                tracks.extend(tracker.update(frame, frame_detections))
        path = config.output_dir / "tracks.jsonl"
        output_files["tracks"] = str(path)
        write_jsonl(path, tracks)
        metrics.append(_metric("tracking", started, len(detections), len(tracks), 0, 0, backend=config.tracker_backend.value, device=config.device))
    else:
        output_files["tracks"] = str(config.output_dir / "tracks.jsonl")
        write_jsonl(Path(output_files["tracks"]), [])

    vlm_notes = []
    if config.enable_vlm:
        note = UnconfiguredVideoLLaMA3Adapter(config.vlm_config).describe_clip(str(config.video_path), config.start_ms, config.end_ms or config.start_ms, "Describe visible evidence without interpreting strategy.")
        vlm_notes.append(note)
    output_files["vlm_notes"] = str(config.output_dir / "vlm-notes.jsonl")
    write_jsonl(Path(output_files["vlm_notes"]), vlm_notes)

    output_files["errors"] = str(config.output_dir / "errors.jsonl")
    write_jsonl(Path(output_files["errors"]), errors)

    status = ProcessingStatus.COMPLETE if not errors and frames else ProcessingStatus.COMPLETE_WITH_WARNINGS if frames else ProcessingStatus.FAILED_RECOVERABLE
    result = VideoPipelineResult(
        status=status,
        video_metadata=metadata,
        config=config,
        frame_manifest=output_files.get("frame_manifest"),
        detections=output_files["detections"],
        ocr_results=output_files["ocr_results"],
        tracks=output_files["tracks"],
        vlm_notes=output_files["vlm_notes"],
        provenance=[
            Provenance(
                source=str(config.video_path),
                method="local_video_processing",
                confidence=ConfidenceLevel.LOW,
                limitations=["Visual evidence is not ground truth and clocks are not synchronized to demo time by this pipeline."],
            )
        ],
        warnings=warnings,
        errors=errors,
        stage_metrics=metrics,
        output_files=output_files,
    )
    output_files["result"] = str(config.output_dir / "result.json")
    write_json(Path(output_files["result"]), result)
    return result

