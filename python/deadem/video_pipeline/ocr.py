from __future__ import annotations

from collections.abc import Iterable, Protocol

from .errors import OptionalDependencyUnavailable
from .roi import RegionOfInterest
from .schemas import ConfidenceLevel, FrameData, OCRBackend, OCRResult, Provenance


class OCRProvider(Protocol):
    def read_frame(self, frame: FrameData, regions: list[RegionOfInterest] | None = None) -> list[OCRResult]:
        ...

    def read_batch(self, frames: Iterable[FrameData], regions: list[RegionOfInterest] | None = None) -> Iterable[OCRResult]:
        ...


class PaddleHudOCR:
    def __init__(self, language: str = "en", model_dir: str | None = None, device: str = "cpu") -> None:
        try:
            from paddleocr import PaddleOCR  # type: ignore
        except Exception as exc:  # pragma: no cover - optional dependency
            raise OptionalDependencyUnavailable("paddleocr", "HUD OCR") from exc
        self.language = language
        self.model_name = "paddleocr"
        self.ocr = PaddleOCR(lang=language, use_gpu=device != "cpu", det_model_dir=model_dir)

    def read_frame(self, frame: FrameData, regions: list[RegionOfInterest] | None = None) -> list[OCRResult]:
        if not frame.image_path:
            return []
        raw = self.ocr.ocr(frame.image_path, cls=False)
        output: list[OCRResult] = []
        for group in raw or []:
            for item in group or []:
                points, text_conf = item
                text, confidence = text_conf
                xs = [point[0] for point in points]
                ys = [point[1] for point in points]
                from .schemas import BoundingBox

                output.append(
                    OCRResult(
                        frame_id=frame.frame_id,
                        frame_index=frame.source_frame_index,
                        timestamp_ms=frame.decoded_timestamp_ms or frame.requested_timestamp_ms,
                        region_id=None,
                        text=text,
                        confidence=float(confidence),
                        bbox=BoundingBox(x1=min(xs), y1=min(ys), x2=max(xs), y2=max(ys), coordinate_space="pixel"),
                        language=self.language,
                        backend=OCRBackend.PADDLE,
                        model_name=self.model_name,
                        provenance=Provenance(
                            source="paddleocr",
                            method="ocr_candidate",
                            confidence=ConfidenceLevel.LOW,
                            limitations=["OCR text is not silently corrected and is not ground truth."],
                        ),
                    )
                )
        return output

    def read_batch(self, frames: Iterable[FrameData], regions: list[RegionOfInterest] | None = None) -> Iterable[OCRResult]:
        for frame in frames:
            yield from self.read_frame(frame, regions)


def unavailable_ocr_error() -> dict:
    return {
        "stage": "ocr",
        "error_code": "optional_dependency_unavailable",
        "message": "OCR requires optional paddleocr and a compatible Paddle runtime. paddlepaddle is platform-specific and not installed by the universal extra.",
        "recoverable": True,
    }

