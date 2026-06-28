from pathlib import Path

from deadem.video_pipeline.detector import unavailable_detector_error
from deadem.video_pipeline.ocr import unavailable_ocr_error
from deadem.video_pipeline.schemas import BoundingBox, ConfidenceLevel, Detection, DetectionBackend, FrameData, FrameDecodeStatus, DecoderBackend, Provenance
from deadem.video_pipeline.tracker import IoUFallbackTracker
from deadem.video_pipeline.vlm import UnconfiguredVideoLLaMA3Adapter


def test_optional_dependency_error_shapes() -> None:
    assert unavailable_detector_error()["error_code"] == "optional_dependency_unavailable"
    assert unavailable_ocr_error()["error_code"] == "optional_dependency_unavailable"
    note = UnconfiguredVideoLLaMA3Adapter().describe_clip("video.mp4", 0, 1000, "describe")
    assert note.status.value == "skipped_unavailable"


def test_iou_fallback_tracker_associates_and_resets() -> None:
    frame = FrameData(
        frame_id="f1",
        requested_timestamp_ms=0,
        decoded_timestamp_ms=0,
        decode_status=FrameDecodeStatus.DECODED,
        decoder_backend=DecoderBackend.OPENCV,
    )
    det = Detection(
        frame_id="f1",
        timestamp_ms=0,
        label="box",
        class_id=1,
        confidence=0.9,
        bbox=BoundingBox(x1=0, y1=0, x2=10, y2=10),
        backend=DetectionBackend.YOLO,
        provenance=Provenance(source="test", method="synthetic", confidence=ConfidenceLevel.LOW),
    )
    tracker = IoUFallbackTracker(iou_threshold=0.1)
    first = tracker.update(frame, [det])
    second = tracker.update(frame.model_copy(update={"frame_id": "f2", "requested_timestamp_ms": 1000}), [det.model_copy(update={"frame_id": "f2", "timestamp_ms": 1000})])
    assert first[0].track_id == second[0].track_id
    tracker.reset()
    third = tracker.update(frame, [det])
    assert third[0].track_id == "track_000001"

