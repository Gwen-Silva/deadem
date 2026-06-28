from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from pydantic import BaseModel, Field

from .schemas import FrameRequest


class VideoAnnotation(BaseModel):
    annotation_id: str
    video_start_ms: int | None = None
    video_end_ms: int | None = None
    game_start_seconds: float | None = None
    game_end_seconds: float | None = None
    label: str | None = None
    map_side: str | None = None
    lane_color: str | None = None
    element_type: str | None = None
    element_team: str | None = None
    notes: str | None = None
    source: str
    confidence: str = "unverified_annotation"
    extra: dict = Field(default_factory=dict)


def parse_timestamp(value: str | int | float | None) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return int(float(value) * 1000 if float(value) < 10000 else float(value))
    text = str(value).strip().replace(",", ".")
    if re.fullmatch(r"\d+(\.\d+)?", text):
        number = float(text)
        return int(number * 1000 if number < 10000 else number)
    parts = text.split(":")
    if len(parts) == 2:
        minutes, seconds = parts
        return int((int(minutes) * 60 + float(seconds)) * 1000)
    if len(parts) == 3:
        hours, minutes, seconds = parts
        return int((int(hours) * 3600 + int(minutes) * 60 + float(seconds)) * 1000)
    return None


def load_annotations(path: Path) -> list[VideoAnnotation]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return _load_csv(path)
    if suffix == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        rows = data if isinstance(data, list) else data.get("annotations", [])
        return [VideoAnnotation(**row, source=row.get("source", str(path))) for row in rows]
    if suffix == ".srt":
        return _load_srt_like(path, source_format="srt")
    if suffix == ".vtt":
        return _load_srt_like(path, source_format="vtt")
    raise ValueError(f"Unsupported annotation file type: {suffix}")


def _load_csv(path: Path) -> list[VideoAnnotation]:
    rows = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for index, raw in enumerate(reader, start=1):
            annotation_id = raw.get("annotation_id") or raw.get("id") or raw.get("event_id") or f"A{index:03d}"
            start = parse_timestamp(raw.get("video_start_ms") or raw.get("start_ms") or raw.get("video_start") or raw.get("start"))
            end = parse_timestamp(raw.get("video_end_ms") or raw.get("end_ms") or raw.get("video_end") or raw.get("end"))
            rows.append(
                VideoAnnotation(
                    annotation_id=annotation_id,
                    video_start_ms=start,
                    video_end_ms=end,
                    label=raw.get("label") or raw.get("description") or raw.get("descriptionPtBr"),
                    map_side=raw.get("map_side"),
                    lane_color=raw.get("lane_color") or raw.get("laneReference"),
                    element_type=raw.get("element_type") or raw.get("objectType"),
                    element_team=raw.get("element_team") or raw.get("allegiance"),
                    notes=raw.get("notes"),
                    source=str(path),
                    extra={key: value for key, value in raw.items() if value},
                )
            )
    return rows


def _load_srt_like(path: Path, *, source_format: str) -> list[VideoAnnotation]:
    text = path.read_text(encoding="utf-8-sig")
    blocks = re.split(r"\n\s*\n", text.strip())
    annotations = []
    for index, block in enumerate(blocks, start=1):
        lines = [line.strip() for line in block.splitlines() if line.strip() and line.strip() != "WEBVTT"]
        if not lines:
            continue
        time_line = next((line for line in lines if "-->" in line), None)
        if not time_line:
            continue
        start_raw, end_raw = [item.strip().split(" ")[0] for item in time_line.split("-->", maxsplit=1)]
        label = " ".join(line for line in lines if "-->" not in line and not line.isdigit())
        annotations.append(
            VideoAnnotation(
                annotation_id=f"{source_format.upper()}{index:03d}",
                video_start_ms=parse_timestamp(start_raw),
                video_end_ms=parse_timestamp(end_raw),
                label=label,
                source=str(path),
            )
        )
    return annotations


def build_annotation_frame_requests(
    annotations: list[VideoAnnotation],
    *,
    include_start: bool = True,
    include_midpoint: bool = True,
    include_end: bool = True,
    margin_ms: int = 0,
) -> list[FrameRequest]:
    requests = []
    for annotation in annotations:
        if annotation.video_start_ms is None:
            continue
        end_ms = annotation.video_end_ms if annotation.video_end_ms is not None else annotation.video_start_ms
        points: list[tuple[str, int]] = []
        if include_start:
            points.append(("annotation_start", max(0, annotation.video_start_ms - margin_ms)))
        if include_midpoint:
            points.append(("annotation_midpoint", int((annotation.video_start_ms + end_ms) / 2)))
        if include_end:
            points.append(("annotation_end", end_ms + margin_ms))
        for reason, timestamp_ms in points:
            requests.append(
                FrameRequest(
                    annotation_id=annotation.annotation_id,
                    requested_timestamp_ms=timestamp_ms,
                    request_reason=reason,
                    window_start_ms=annotation.video_start_ms,
                    window_end_ms=end_ms,
                )
            )
    return requests

