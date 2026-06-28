from __future__ import annotations

from collections.abc import Protocol

from .schemas import Detection, FrameData, TrackerBackend, TrackedObject


class ObjectTracker(Protocol):
    def update(self, frame: FrameData, detections: list[Detection]) -> list[TrackedObject]:
        ...

    def reset(self) -> None:
        ...


def bbox_iou(a, b) -> float:
    x1 = max(a.x1, b.x1)
    y1 = max(a.y1, b.y1)
    x2 = min(a.x2, b.x2)
    y2 = min(a.y2, b.y2)
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area_a = max(0.0, a.x2 - a.x1) * max(0.0, a.y2 - a.y1)
    area_b = max(0.0, b.x2 - b.x1) * max(0.0, b.y2 - b.y1)
    denom = area_a + area_b - inter
    return 0.0 if denom == 0 else inter / denom


class IoUFallbackTracker:
    """Simple IoU tracker. This is not ByteTrack and not validation evidence."""

    def __init__(self, iou_threshold: float = 0.3, max_missed_frames: int = 3) -> None:
        self.iou_threshold = iou_threshold
        self.max_missed_frames = max_missed_frames
        self._next_id = 1
        self._tracks: dict[str, TrackedObject] = {}

    def reset(self) -> None:
        self._next_id = 1
        self._tracks.clear()

    def update(self, frame: FrameData, detections: list[Detection]) -> list[TrackedObject]:
        assigned: set[str] = set()
        output: list[TrackedObject] = []
        for detection in detections:
            best_id = None
            best_iou = 0.0
            for track_id, track in self._tracks.items():
                if track_id in assigned or track.label != detection.label or track.class_id != detection.class_id:
                    continue
                score = bbox_iou(track.bbox, detection.bbox)
                if score > best_iou:
                    best_id = track_id
                    best_iou = score
            if best_id is None or best_iou < self.iou_threshold:
                best_id = f"track_{self._next_id:06d}"
                self._next_id += 1
                age = 1
            else:
                age = self._tracks[best_id].age_frames + 1
            tracked = TrackedObject(
                track_id=best_id,
                frame_id=frame.frame_id,
                frame_index=frame.source_frame_index,
                timestamp_ms=frame.decoded_timestamp_ms or frame.requested_timestamp_ms,
                label=detection.label,
                class_id=detection.class_id,
                confidence=detection.confidence,
                bbox=detection.bbox,
                tracker_backend=TrackerBackend.IOU_FALLBACK,
                age_frames=age,
                missed_frames=0,
                source_detection_ids=[detection.detection_id],
            )
            self._tracks[best_id] = tracked
            assigned.add(best_id)
            output.append(tracked)
        for track_id, track in list(self._tracks.items()):
            if track_id in assigned:
                continue
            missed = track.missed_frames + 1
            if missed > self.max_missed_frames:
                del self._tracks[track_id]
            else:
                self._tracks[track_id] = track.model_copy(update={"missed_frames": missed})
        return output


class UltralyticsByteTrackAdapter:
    def __init__(self, tracker_config: str = "bytetrack.yaml") -> None:
        self.tracker_config = tracker_config

    def update(self, frame: FrameData, detections: list[Detection]) -> list[TrackedObject]:
        raise RuntimeError("Ultralytics ByteTrack requires the Ultralytics tracking stream integration; use IoUFallbackTracker for dependency-light tests.")

    def reset(self) -> None:
        pass

