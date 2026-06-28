from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PIPELINE_VERSION = "0.1.0"
SCHEMA_VERSION = 1


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DecoderBackend(str, Enum):
    OPENCV = "opencv"
    FFPROBE = "ffprobe"
    WPF_EXTERNAL = "wpf_external"


class FrameExtractionMode(str, Enum):
    REGULAR = "regular"
    TIMESTAMPS = "timestamps"
    ANNOTATION_WINDOWS = "annotation_windows"
    SOURCE_FRAME_STRIDE = "source_frame_stride"


class FrameDecodeStatus(str, Enum):
    DECODED = "decoded"
    OUT_OF_TOLERANCE = "out_of_tolerance"
    SEEK_FAILED = "seek_failed"
    VIDEO_OPEN_FAILED = "video_open_failed"
    SKIPPED_EXISTING = "skipped_existing"


class ProcessingStatus(str, Enum):
    COMPLETE = "complete"
    COMPLETE_WITH_WARNINGS = "complete_with_warnings"
    SKIPPED_DISABLED = "skipped_disabled"
    SKIPPED_UNAVAILABLE = "skipped_unavailable"
    FAILED_RECOVERABLE = "failed_recoverable"
    FAILED_FATAL = "failed_fatal"


class DetectionBackend(str, Enum):
    NONE = "none"
    YOLO = "yolo"


class OCRBackend(str, Enum):
    NONE = "none"
    PADDLE = "paddleocr"


class TrackerBackend(str, Enum):
    NONE = "none"
    ULTRALYTICS_BYTETRACK = "ultralytics_bytetrack"
    IOU_FALLBACK = "iou_fallback"


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNRESOLVED = "unresolved"


class Provenance(BaseModel):
    source: str
    method: str
    confidence: ConfidenceLevel = ConfidenceLevel.UNRESOLVED
    limitations: list[str] = Field(default_factory=list)


class ProcessingError(BaseModel):
    stage: str
    error_code: str
    message: str
    exception_type: str | None = None
    recoverable: bool = True
    frame_id: str | None = None
    timestamp_ms: int | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class VideoProcessingConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    video_path: Path
    output_dir: Path
    decoder_backend: DecoderBackend = DecoderBackend.OPENCV
    device: str = "cpu"
    extraction_mode: FrameExtractionMode = FrameExtractionMode.REGULAR
    sample_fps: float | None = None
    interval_ms: int | None = None
    timestamps_ms: list[int] | None = None
    source_frame_stride: int | None = None
    start_ms: int = 0
    end_ms: int | None = None
    max_frames: int | None = None
    image_format: Literal["jpg", "jpeg", "png"] = "jpg"
    jpeg_quality: int = 90
    preserve_frame_files: bool = True
    overwrite_existing: bool = False
    deduplicate_requests: bool = True
    seek_tolerance_ms: int = 250
    enable_detection: bool = False
    enable_ocr: bool = False
    enable_tracking: bool = False
    enable_vlm: bool = False
    detection_model: str | None = None
    detection_confidence: float = 0.25
    detection_iou: float = 0.7
    ocr_language: str = "en"
    ocr_regions: list[str] = Field(default_factory=list)
    tracker_backend: TrackerBackend = TrackerBackend.IOU_FALLBACK
    tracker_config: dict[str, Any] = Field(default_factory=dict)
    annotation_file: Path | None = None
    annotation_time_domain: str = "video"
    annotation_frames: list[str] = Field(default_factory=lambda: ["start", "midpoint", "end"])
    annotation_margin_ms: int = 0
    vlm_config: dict[str, Any] = Field(default_factory=dict)
    offline: bool = True
    allow_model_download: bool = False
    log_level: str = "INFO"
    log_json: bool = False

    @field_validator("start_ms", "interval_ms", "source_frame_stride", "max_frames", "seek_tolerance_ms", mode="after")
    @classmethod
    def positive_ints(cls, value: int | None) -> int | None:
        if value is not None and value < 0:
            raise ValueError("value must be non-negative")
        return value

    @field_validator("sample_fps", "detection_confidence", "detection_iou", mode="after")
    @classmethod
    def positive_float(cls, value: float | None) -> float | None:
        if value is not None and value <= 0:
            raise ValueError("value must be positive")
        return value

    @model_validator(mode="after")
    def validate_sampling(self) -> "VideoProcessingConfig":
        if self.end_ms is not None and self.start_ms > self.end_ms:
            raise ValueError("start_ms must be <= end_ms")
        active = [
            self.sample_fps is not None,
            self.interval_ms is not None,
            bool(self.timestamps_ms),
            self.source_frame_stride is not None,
            self.annotation_file is not None and self.extraction_mode == FrameExtractionMode.ANNOTATION_WINDOWS,
        ]
        if sum(active) > 1:
            raise ValueError("sample_fps, interval_ms, timestamps_ms, source_frame_stride, and annotation windows are mutually exclusive")
        if self.enable_tracking and self.tracker_backend == TrackerBackend.NONE:
            raise ValueError("enable_tracking=True requires a tracker backend")
        if self.enable_tracking and not self.enable_detection and self.tracker_backend == TrackerBackend.ULTRALYTICS_BYTETRACK:
            raise ValueError("Ultralytics ByteTrack requires detections or an Ultralytics frame stream")
        return self


class VideoMetadata(BaseModel):
    video_path: str
    file_size_bytes: int
    sha256: str
    decoder_backend: DecoderBackend
    decoder_version: str | None = None
    container_duration_ms: int | None = None
    decoded_duration_ms: int | None = None
    fps_reported: float | None = None
    fps_mode: str = "unknown"
    frame_count_reported: int | None = None
    width: int | None = None
    height: int | None = None
    codec: str | None = None
    time_base: str | None = None
    has_audio: bool | None = None
    variable_frame_rate_status: str = "unverified"
    metadata_warnings: list[str] = Field(default_factory=list)


class FrameRequest(BaseModel):
    request_id: str = Field(default_factory=lambda: f"req_{uuid4().hex}")
    annotation_id: str | None = None
    requested_timestamp_ms: int
    request_reason: str
    window_start_ms: int | None = None
    window_end_ms: int | None = None

    @field_validator("requested_timestamp_ms", "window_start_ms", "window_end_ms", mode="after")
    @classmethod
    def non_negative_time(cls, value: int | None) -> int | None:
        if value is not None and value < 0:
            raise ValueError("timestamp must be non-negative")
        return value


class FrameData(BaseModel):
    frame_id: str
    request_id: str | None = None
    annotation_id: str | None = None
    source_frame_index: int | None = None
    requested_timestamp_ms: int
    decoded_timestamp_ms: int | None = None
    timestamp_error_ms: int | None = None
    image_path: str | None = None
    width: int | None = None
    height: int | None = None
    sha256: str | None = None
    decode_status: FrameDecodeStatus
    decoder_backend: DecoderBackend
    warnings: list[str] = Field(default_factory=list)


class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
    coordinate_space: Literal["pixel", "normalized"] = "pixel"

    @model_validator(mode="after")
    def valid_box(self) -> "BoundingBox":
        if self.x1 > self.x2 or self.y1 > self.y2:
            raise ValueError("bbox requires x1 <= x2 and y1 <= y2")
        return self


class Detection(BaseModel):
    detection_id: str = Field(default_factory=lambda: f"det_{uuid4().hex}")
    frame_id: str
    frame_index: int | None = None
    timestamp_ms: int
    label: str
    class_id: int | None = None
    confidence: float
    bbox: BoundingBox
    model_name: str | None = None
    model_version: str | None = None
    backend: DetectionBackend
    provenance: Provenance


class OCRResult(BaseModel):
    ocr_id: str = Field(default_factory=lambda: f"ocr_{uuid4().hex}")
    frame_id: str
    frame_index: int | None = None
    timestamp_ms: int
    region_id: str | None = None
    text: str
    confidence: float | None = None
    bbox: BoundingBox | None = None
    language: str | None = None
    backend: OCRBackend
    model_name: str | None = None
    preprocessing: str = "none"
    provenance: Provenance


class TrackedObject(BaseModel):
    track_id: str
    frame_id: str
    frame_index: int | None = None
    timestamp_ms: int
    label: str
    class_id: int | None = None
    confidence: float | None = None
    bbox: BoundingBox
    tracker_backend: TrackerBackend
    age_frames: int = 0
    missed_frames: int = 0
    source_detection_ids: list[str] = Field(default_factory=list)


class VLMNote(BaseModel):
    note_id: str = Field(default_factory=lambda: f"vlm_{uuid4().hex}")
    video_path: str
    start_ms: int
    end_ms: int
    prompt: str
    response: str | None = None
    model_name: str | None = None
    model_version: str | None = None
    sampling_strategy: str | None = None
    evidence_frame_ids: list[str] = Field(default_factory=list)
    status: ProcessingStatus
    warnings: list[str] = Field(default_factory=list)


class StageMetric(BaseModel):
    stage: str
    started_at: datetime
    finished_at: datetime
    duration_ms: int
    items_in: int = 0
    items_out: int = 0
    warnings: int = 0
    errors: int = 0
    peak_memory: int | None = None
    backend: str | None = None
    device: str | None = None


class VideoPipelineResult(BaseModel):
    schema_version: int = SCHEMA_VERSION
    pipeline_version: str = PIPELINE_VERSION
    created_at: datetime = Field(default_factory=utc_now)
    provenance: list[Provenance] = Field(default_factory=list)
    status: ProcessingStatus
    video_metadata: VideoMetadata | None = None
    config: VideoProcessingConfig
    frame_manifest: str | None = None
    detections: str | list[Detection] = Field(default_factory=list)
    ocr_results: str | list[OCRResult] = Field(default_factory=list)
    tracks: str | list[TrackedObject] = Field(default_factory=list)
    vlm_notes: str | list[VLMNote] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    errors: list[ProcessingError] = Field(default_factory=list)
    stage_metrics: list[StageMetric] = Field(default_factory=list)
    output_files: dict[str, str] = Field(default_factory=dict)

