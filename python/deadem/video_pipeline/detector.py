from __future__ import annotations

from collections.abc import Iterable, Protocol
from pathlib import Path

from .errors import OptionalDependencyUnavailable
from .schemas import Detection, DetectionBackend, FrameData, Provenance, ConfidenceLevel


class ObjectDetector(Protocol):
    def detect_frame(self, frame: FrameData) -> list[Detection]:
        ...

    def detect_batch(self, frames: Iterable[FrameData]) -> Iterable[Detection]:
        ...


class YoloDetector:
    def __init__(
        self,
        model_path: str | None = None,
        device: str = "cpu",
        confidence: float = 0.25,
        iou: float = 0.7,
        allow_download: bool = False,
    ) -> None:
        try:
            from ultralytics import YOLO  # type: ignore
        except Exception as exc:  # pragma: no cover - optional dependency
            raise OptionalDependencyUnavailable("ultralytics", "YOLO detection") from exc
        if model_path is None and not allow_download:
            raise OptionalDependencyUnavailable("local_yolo_model", "offline YOLO detection without automatic model download")
        self.model_path = model_path
        self.device = device
        self.confidence = confidence
        self.iou = iou
        self.model = YOLO(model_path)

    def detect_frame(self, frame: FrameData) -> list[Detection]:
        if not frame.image_path:
            return []
        results = self.model.predict(Path(frame.image_path), device=self.device, conf=self.confidence, iou=self.iou, verbose=False)
        output: list[Detection] = []
        for result in results:
            names = getattr(result, "names", {})
            for box in getattr(result, "boxes", []):
                xyxy = box.xyxy[0].tolist()
                class_id = int(box.cls[0])
                label = str(names.get(class_id, class_id))
                from .schemas import BoundingBox

                output.append(
                    Detection(
                        frame_id=frame.frame_id,
                        frame_index=frame.source_frame_index,
                        timestamp_ms=frame.decoded_timestamp_ms or frame.requested_timestamp_ms,
                        label=label,
                        class_id=class_id,
                        confidence=float(box.conf[0]),
                        bbox=BoundingBox(x1=xyxy[0], y1=xyxy[1], x2=xyxy[2], y2=xyxy[3], coordinate_space="pixel"),
                        model_name=str(self.model_path),
                        model_version=None,
                        backend=DetectionBackend.YOLO,
                        provenance=Provenance(
                            source="ultralytics_yolo",
                            method="generic_object_detection",
                            confidence=ConfidenceLevel.LOW,
                            limitations=[
                                "Generic YOLO does not validate Deadlock-specific Guardian, Walker, Patron, Mid Boss, Urn, HUD, hero, or minimap classes."
                            ],
                        ),
                    )
                )
        return output

    def detect_batch(self, frames: Iterable[FrameData]) -> Iterable[Detection]:
        for frame in frames:
            yield from self.detect_frame(frame)


def unavailable_detector_error() -> dict:
    return {
        "stage": "detection",
        "error_code": "optional_dependency_unavailable",
        "message": "Detection requires optional ultralytics and a local model path; generic YOLO is architectural only for Deadlock.",
        "recoverable": True,
    }

