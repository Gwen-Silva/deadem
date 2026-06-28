from __future__ import annotations

import csv
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from deadem.video_pipeline.frame_extractor import extract_frames
from deadem.video_pipeline.metadata import _import_cv2, probe_video
from deadem.video_pipeline.schemas import FrameExtractionMode, FrameRequest, VideoProcessingConfig


ROOT = Path(__file__).resolve().parents[1]
MATCH_ID = "91119257"
VIDEO_PATH = ROOT / "samples" / "videos" / "Partida_006_Replay.mp4"
RAW_DIR = ROOT / "data" / "evidence" / "match_91119257" / "raw"
CSV_PATH = RAW_DIR / "match_91119257_events.csv"
INPUT_MANIFEST_PATH = ROOT / "output" / "match_91119257" / "input-file-manifest.json"
WPF_MANIFEST_PATH = ROOT / "output" / "match_91119257" / "video-frame-index.json"
TRACKED_OUTPUT_DIR = ROOT / "output" / "match_91119257"
LOCAL_OUTPUT_DIR = ROOT / "output-local" / "match_91119257" / "annotation-frames-opencv"
FRAMES_OUTPUT_DIR = LOCAL_OUTPUT_DIR / "main"
CONTACT_SHEET_DIR = LOCAL_OUTPUT_DIR / "contact-sheets"
DETERMINISM_DIR = LOCAL_OUTPUT_DIR / "determinism"
REPORT_PATH = ROOT / "reports" / "match-91119257-complete-annotation-frame-extraction.md"
LATEST_REPORT_PATH = ROOT / "reports" / "latest.md"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def rel(path: str | Path | None) -> str | None:
    if path is None:
        return None
    value = Path(path)
    try:
        return value.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return value.as_posix()


def parse_timestamp_to_ms(value: str) -> int:
    value = str(value).strip()
    if not value:
        raise ValueError("empty timestamp")
    if ":" not in value:
        return int(round(float(value) * 1000))
    parts = [int(part) for part in value.split(":")]
    if len(parts) == 2:
        minutes, seconds = parts
        return ((minutes * 60) + seconds) * 1000
    if len(parts) == 3:
        hours, minutes, seconds = parts
        return ((hours * 3600) + (minutes * 60) + seconds) * 1000
    raise ValueError(f"unsupported timestamp format: {value}")


def load_preserved_csv_hash() -> dict[str, Any]:
    manifest = json.loads(INPUT_MANIFEST_PATH.read_text(encoding="utf-8"))
    for entry in manifest.get("files", []):
        if entry.get("fileName") == CSV_PATH.name:
            actual = sha256_file(CSV_PATH)
            return {
                "expectedSha256": entry.get("sha256"),
                "copiedSha256": entry.get("copiedSha256"),
                "actualSha256": actual,
                "matchesPreservedPacket": actual == entry.get("sha256") == entry.get("copiedSha256"),
                "sourceManifest": rel(INPUT_MANIFEST_PATH),
            }
    return {
        "expectedSha256": None,
        "copiedSha256": None,
        "actualSha256": sha256_file(CSV_PATH),
        "matchesPreservedPacket": False,
        "sourceManifest": rel(INPUT_MANIFEST_PATH),
        "warning": "CSV was not found in input-file-manifest.json.",
    }


def load_annotations() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    annotations: list[dict[str, Any]] = []
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for index, row in enumerate(reader):
            annotation_id = row["event_id"].strip()
            start_ms = parse_timestamp_to_ms(row["video_start"])
            end_ms = parse_timestamp_to_ms(row["video_end"])
            if end_ms < start_ms:
                raise ValueError(f"{annotation_id} end is before start")
            annotation = {
                "sourceOrder": index,
                "annotationId": annotation_id,
                "originalStart": row["video_start"].strip(),
                "originalEnd": row["video_end"].strip(),
                "normalizedStartMs": start_ms,
                "normalizedEndMs": end_ms,
                "sourceLabel": row.get("description_pt_br", "").strip(),
                "mapSide": row.get("map_sector", "").strip() or None,
                "laneColor": row.get("lane_reference", "").strip() or None,
                "elementType": row.get("object_type", "").strip() or None,
                "elementTeam": row.get("allegiance", "").strip() or None,
                "eventGroup": row.get("event_group", "").strip() or None,
                "source": row.get("source", "").strip() or None,
                "validationStatus": row.get("validation_status", "").strip() or None,
            }
            annotations.append(annotation)

    ids = [item["annotationId"] for item in annotations]
    duplicate_ids = sorted([key for key, count in Counter(ids).items() if count > 1])
    chronological = sorted(annotations, key=lambda item: (item["normalizedStartMs"], item["normalizedEndMs"], item["annotationId"]))
    audit = {
        "sourcePath": rel(CSV_PATH),
        "sourceHash": load_preserved_csv_hash(),
        "annotationCount": len(annotations),
        "uniqueAnnotationIds": len(set(ids)),
        "duplicateAnnotationIds": duplicate_ids,
        "timeFieldsParseable": True,
        "sourceOrder": [item["annotationId"] for item in annotations],
        "chronologicalOrder": [item["annotationId"] for item in chronological],
        "sourceOrderMatchesChronologicalOrder": [item["annotationId"] for item in annotations] == [item["annotationId"] for item in chronological],
    }
    return annotations, audit


def make_request(
    annotation: dict[str, Any],
    request_role: str,
    timestamp_ms: int,
    source_order: int,
    candidate: str | None = None,
) -> dict[str, Any]:
    annotation_id = annotation["annotationId"]
    suffix = f"_{candidate}" if candidate else ""
    request_id = f"{annotation_id}_{request_role}{suffix}_{timestamp_ms:07d}"
    return {
        "requestId": request_id,
        "annotationId": annotation_id,
        "requestRole": request_role,
        "requestedTimestampMs": timestamp_ms,
        "requestReason": request_role if not candidate else f"{request_role}:{candidate}",
        "sourceOrder": source_order,
        "candidateWindow": candidate,
        "windowStartMs": annotation["normalizedStartMs"],
        "windowEndMs": annotation["normalizedEndMs"],
    }


def build_requests(annotations: list[dict[str, Any]], video_duration_ms: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    requests: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    order = 0
    for annotation in annotations:
        start = annotation["normalizedStartMs"]
        end = annotation["normalizedEndMs"]
        midpoint = int(round((start + end) / 2))
        for role, timestamp_ms in (
            ("start", start),
            ("midpoint", midpoint),
            ("end", end),
            ("context_before", start - 1000),
            ("context_after", end + 1000),
        ):
            if timestamp_ms < 0 or timestamp_ms > video_duration_ms:
                warnings.append(
                    {
                        "annotationId": annotation["annotationId"],
                        "requestRole": role,
                        "requestedTimestampMs": timestamp_ms,
                        "warning": "context request outside valid video range",
                    }
                )
                continue
            requests.append(make_request(annotation, role, timestamp_ms, order))
            order += 1

    e088 = next((item for item in annotations if item["annotationId"] == "E088"), None)
    if e088 is not None:
        for candidate, start, end in (
            ("original_23m50_23m55", 23 * 60 * 1000 + 50 * 1000, 23 * 60 * 1000 + 55 * 1000),
            ("corrected_24m50_24m55", 24 * 60 * 1000 + 50 * 1000, 24 * 60 * 1000 + 55 * 1000),
        ):
            for role, timestamp_ms in (
                ("alternate_candidate", start),
                ("alternate_candidate", int(round((start + end) / 2))),
                ("alternate_candidate", end),
            ):
                if 0 <= timestamp_ms <= video_duration_ms:
                    request = make_request(e088, role, timestamp_ms, order, candidate)
                    request["candidateWindowStartMs"] = start
                    request["candidateWindowEndMs"] = end
                    requests.append(request)
                    order += 1
                else:
                    warnings.append(
                        {
                            "annotationId": "E088",
                            "requestRole": role,
                            "candidateWindow": candidate,
                            "requestedTimestampMs": timestamp_ms,
                            "warning": "E088 alternate candidate request outside valid video range",
                        }
                    )
    return requests, warnings


def extract_request_frames(requests: list[dict[str, Any]], output_dir: Path) -> list[dict[str, Any]]:
    config = VideoProcessingConfig(
        video_path=VIDEO_PATH,
        output_dir=output_dir,
        extraction_mode=FrameExtractionMode.TIMESTAMPS,
        image_format="png",
        overwrite_existing=True,
        deduplicate_requests=False,
        seek_tolerance_ms=250,
        offline=True,
    )
    frame_requests = [
        FrameRequest(
            request_id=request["requestId"],
            annotation_id=request["annotationId"],
            requested_timestamp_ms=request["requestedTimestampMs"],
            request_reason=request["requestReason"],
            window_start_ms=request.get("windowStartMs"),
            window_end_ms=request.get("windowEndMs"),
        )
        for request in requests
    ]
    request_by_id = {request["requestId"]: request for request in requests}
    rows = []
    for frame in extract_frames(config, frame_requests):
        request = request_by_id.get(frame.request_id or "", {})
        rows.append(
            {
                "annotationId": request.get("annotationId", frame.annotation_id),
                "requestId": frame.request_id,
                "requestRole": request.get("requestRole"),
                "candidateWindow": request.get("candidateWindow"),
                "requestedTimestampMs": frame.requested_timestamp_ms,
                "decodedTimestampMs": frame.decoded_timestamp_ms,
                "timestampErrorMs": frame.timestamp_error_ms,
                "sourceFrameIndex": frame.source_frame_index,
                "frameId": frame.frame_id,
                "framePath": rel(frame.image_path),
                "frameSha256": frame.sha256,
                "decodeStatus": frame.decode_status.value,
                "decoderBackend": frame.decoder_backend.value,
                "width": frame.width,
                "height": frame.height,
                "deduplicatedToFrameId": None,
                "warnings": list(frame.warnings),
                "sourceOrder": request.get("sourceOrder"),
            }
        )
    return rows


def compute_hash_duplicates(rows: list[dict[str, Any]]) -> dict[str, int]:
    hashes = Counter(row["frameSha256"] for row in rows if row.get("frameSha256"))
    return {key: count for key, count in hashes.items() if count > 1}


def average_hash(gray: Any) -> str:
    cv2 = _import_cv2()
    resized = cv2.resize(gray, (8, 8), interpolation=cv2.INTER_AREA)
    threshold = float(resized.mean())
    bits = ["1" if value > threshold else "0" for value in resized.flatten()]
    return "".join(bits)


def hamming(left: str, right: str) -> int:
    return sum(1 for a, b in zip(left, right) if a != b)


def quality_audit(rows: list[dict[str, Any]]) -> dict[str, Any]:
    cv2 = _import_cv2()
    duplicate_hashes = compute_hash_duplicates(rows)
    frame_quality = []
    by_annotation: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        image_path = ROOT / row["framePath"] if row.get("framePath") else None
        readable = False
        empty = True
        metrics: dict[str, Any] = {
            "annotationId": row.get("annotationId"),
            "requestId": row.get("requestId"),
            "requestRole": row.get("requestRole"),
            "frameId": row.get("frameId"),
            "framePath": row.get("framePath"),
            "readable": False,
            "empty": True,
            "width": row.get("width"),
            "height": row.get("height"),
            "averageBrightness": None,
            "nearBlackRatio": None,
            "nearWhiteRatio": None,
            "variance": None,
            "duplicateHashCount": duplicate_hashes.get(row.get("frameSha256"), 1) if row.get("frameSha256") else 0,
            "averageHash": None,
            "warnings": [],
        }
        if image_path and image_path.exists():
            image = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
            if image is not None and image.size > 0:
                readable = True
                empty = False
                metrics.update(
                    {
                        "readable": True,
                        "empty": False,
                        "width": int(image.shape[1]),
                        "height": int(image.shape[0]),
                        "averageBrightness": float(image.mean()),
                        "nearBlackRatio": float((image <= 8).mean()),
                        "nearWhiteRatio": float((image >= 247).mean()),
                        "variance": float(image.var()),
                        "averageHash": average_hash(image),
                    }
                )
            else:
                metrics["warnings"].append("OpenCV could not read frame image.")
        else:
            metrics["warnings"].append("Frame image is missing.")
        if not readable or empty:
            metrics["warnings"].append("Frame failed basic readability check.")
        frame_quality.append(metrics)
        if metrics.get("averageHash"):
            by_annotation[str(row.get("annotationId"))].append(metrics)

    similarities = []
    for annotation_id, items in by_annotation.items():
        for left_index in range(len(items)):
            for right_index in range(left_index + 1, len(items)):
                left = items[left_index]
                right = items[right_index]
                similarities.append(
                    {
                        "annotationId": annotation_id,
                        "leftFrameId": left["frameId"],
                        "rightFrameId": right["frameId"],
                        "hammingDistance64": hamming(left["averageHash"], right["averageHash"]),
                        "method": "8x8_average_hash",
                    }
                )

    return {
        "schemaVersion": 1,
        "kind": "match_91119257_annotation_frame_quality",
        "createdAt": now_iso(),
        "frameCount": len(frame_quality),
        "readableFrames": sum(1 for item in frame_quality if item["readable"]),
        "emptyFrames": sum(1 for item in frame_quality if item["empty"]),
        "duplicateHashGroups": len(duplicate_hashes),
        "duplicateHashes": duplicate_hashes,
        "perceptualSimilarityMethod": "8x8_average_hash_hamming_within_annotation",
        "frameQuality": frame_quality,
        "withinAnnotationSimilarity": similarities,
        "limitations": [
            "Brightness, hash, and perceptual similarity checks detect extraction anomalies only.",
            "No game-content interpretation, OCR, detection, or semantic validation is performed.",
        ],
    }


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil((pct / 100) * len(ordered)) - 1))
    return ordered[index]


def video_seek_audit(metadata: Any, rows: list[dict[str, Any]]) -> dict[str, Any]:
    decoded_rows = [row for row in rows if row.get("timestampErrorMs") is not None and row.get("decodeStatus") in {"decoded", "out_of_tolerance"}]
    errors = [abs(float(row["timestampErrorMs"])) for row in decoded_rows]
    duration = metadata.decoded_duration_ms or metadata.container_duration_ms or 0
    grouped: dict[str, list[float]] = {"beginning": [], "middle": [], "end": []}
    for row in decoded_rows:
        ts = row["requestedTimestampMs"]
        region = "beginning" if ts < duration / 3 else "middle" if ts < (duration * 2) / 3 else "end"
        grouped[region].append(abs(float(row["timestampErrorMs"])))
    medians = {key: statistics.median(value) if value else None for key, value in grouped.items()}
    growth = "insufficient_data"
    if medians["beginning"] is not None and medians["end"] is not None:
        growth = "stable" if medians["end"] <= medians["beginning"] + 1 else "increases_toward_end"
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_video_seek_audit",
        "createdAt": now_iso(),
        "video": metadata.model_dump(mode="json"),
        "decodedFirstFrameTimestampMs": min((row["decodedTimestampMs"] for row in decoded_rows if row.get("decodedTimestampMs") is not None), default=None),
        "decodedFinalAvailableTimestampMs": max((row["decodedTimestampMs"] for row in decoded_rows if row.get("decodedTimestampMs") is not None), default=None),
        "requestCount": len(rows),
        "decodedRequestCount": len(decoded_rows),
        "seekErrorMs": {
            "min": min(errors) if errors else None,
            "median": statistics.median(errors) if errors else None,
            "p90": percentile(errors, 90),
            "max": max(errors) if errors else None,
        },
        "errorsByRequestedRegion": {key: {"count": len(value), "median": statistics.median(value) if value else None, "max": max(value) if value else None} for key, value in grouped.items()},
        "seekErrorGrowth": growth,
        "limitations": ["OpenCV reports decoded timestamps through CAP_PROP_POS_MSEC; exact frame-accurate seeking is not guaranteed."],
    }


def annotation_summary(annotations: list[dict[str, Any]], requests: list[dict[str, Any]], rows: list[dict[str, Any]]) -> dict[str, Any]:
    requests_by_annotation: dict[str, list[dict[str, Any]]] = defaultdict(list)
    rows_by_annotation: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for request in requests:
        requests_by_annotation[request["annotationId"]].append(request)
    for row in rows:
        rows_by_annotation[str(row.get("annotationId"))].append(row)

    duplicate_hashes = compute_hash_duplicates(rows)
    summaries = []
    for annotation in annotations:
        annotation_id = annotation["annotationId"]
        ann_rows = rows_by_annotation.get(annotation_id, [])
        generated = len(requests_by_annotation.get(annotation_id, []))
        successful = sum(1 for row in ann_rows if row.get("decodeStatus") in {"decoded", "out_of_tolerance", "skipped_existing"})
        failed = generated - successful
        max_error = max((abs(row["timestampErrorMs"]) for row in ann_rows if row.get("timestampErrorMs") is not None), default=None)
        duplicate_refs = sum(1 for row in ann_rows if row.get("frameSha256") in duplicate_hashes)
        warnings = [warning for row in ann_rows for warning in row.get("warnings", [])]
        if failed == generated:
            completeness = "failed"
        elif failed > 0:
            completeness = "partial"
        elif warnings or duplicate_refs > 0:
            completeness = "complete_with_warnings"
        else:
            completeness = "complete"
        summaries.append(
            {
                **annotation,
                "generatedRequests": generated,
                "successfulFrames": successful,
                "failedFrames": failed,
                "maximumTimestampErrorMs": max_error,
                "duplicateFrameReferences": duplicate_refs,
                "completenessStatus": completeness,
                "warnings": sorted(set(warnings)),
            }
        )

    return {
        "schemaVersion": 1,
        "kind": "match_91119257_annotation_frame_summary",
        "createdAt": now_iso(),
        "annotationCount": len(annotations),
        "requestCount": len(requests),
        "successfulFrameRows": sum(item["successfulFrames"] for item in summaries),
        "failedFrameRows": sum(item["failedFrames"] for item in summaries),
        "completenessCounts": dict(Counter(item["completenessStatus"] for item in summaries)),
        "annotations": summaries,
    }


def compare_wpf(rows: list[dict[str, Any]]) -> dict[str, Any]:
    wpf = json.loads(WPF_MANIFEST_PATH.read_text(encoding="utf-8"))
    wpf_frames = wpf.get("frames", [])
    wpf_by_key: dict[tuple[str, str, int], dict[str, Any]] = {}
    for frame in wpf_frames:
        annotation_id = frame.get("annotationId")
        role = frame.get("role")
        requested_seconds = frame.get("requestedVideoTimeSeconds")
        if annotation_id and role and requested_seconds is not None:
            wpf_by_key[(annotation_id, role, int(round(float(requested_seconds) * 1000)))] = frame

    comparisons = []
    shared = 0
    inconsistent = []
    for row in rows:
        key = (str(row.get("annotationId")), str(row.get("requestRole")), int(row.get("requestedTimestampMs") or 0))
        wpf_frame = wpf_by_key.get(key)
        if wpf_frame is None:
            continue
        shared += 1
        opencv_success = row.get("decodeStatus") in {"decoded", "out_of_tolerance", "skipped_existing"}
        wpf_success = wpf_frame.get("decodeStatus") == "decoded"
        decoded_delta = None
        if wpf_frame.get("decodedFrameTimeSeconds") is not None and row.get("decodedTimestampMs") is not None:
            decoded_delta = row["decodedTimestampMs"] - int(round(float(wpf_frame["decodedFrameTimeSeconds"]) * 1000))
        width_match = None
        height_match = None
        if row.get("width") and row.get("height"):
            width_match = row.get("width") == 2048
            height_match = row.get("height") == 980
        status = "consistent"
        notes = []
        if opencv_success != wpf_success:
            status = "inconsistent"
            notes.append("Decode success differs between WPF and OpenCV.")
        if decoded_delta is not None and abs(decoded_delta) > 250:
            status = "inconsistent"
            notes.append("Decoded timestamp differs by more than 250 ms.")
        if status == "inconsistent":
            inconsistent.append(key)
        comparisons.append(
            {
                "annotationId": key[0],
                "requestRole": key[1],
                "requestedTimestampMs": key[2],
                "opencv": {
                    "decodeStatus": row.get("decodeStatus"),
                    "success": opencv_success,
                    "width": row.get("width"),
                    "height": row.get("height"),
                    "decodedTimestampMs": row.get("decodedTimestampMs"),
                    "frameAvailable": bool(row.get("framePath")),
                },
                "wpf": {
                    "decodeStatus": wpf_frame.get("decodeStatus"),
                    "success": wpf_success,
                    "decodedTimestampMs": int(round(float(wpf_frame["decodedFrameTimeSeconds"]) * 1000)) if wpf_frame.get("decodedFrameTimeSeconds") is not None else None,
                    "frameAvailable": bool(wpf_frame.get("framePath")),
                },
                "decodedTimestampDeltaMs": decoded_delta,
                "knownDimensionCheck": {"widthIsExpected2048": width_match, "heightIsExpected980": height_match},
                "status": status,
                "notes": notes,
            }
        )

    return {
        "schemaVersion": 1,
        "kind": "match_91119257_wpf_opencv_frame_comparison",
        "createdAt": now_iso(),
        "wpfManifest": rel(WPF_MANIFEST_PATH),
        "opencvManifest": "output/match_91119257/annotation-frame-manifest.jsonl",
        "wpfRequestCount": len(wpf_frames),
        "sharedComparableRequests": shared,
        "consistentSharedRequests": shared - len(inconsistent),
        "inconsistentSharedRequests": len(inconsistent),
        "missingFromOpenCvComparison": max(0, len(wpf_by_key) - shared),
        "comparisons": comparisons,
        "limitations": [
            "Comparison checks metadata and availability only; pixel equality and visual content are intentionally not evaluated.",
            "WPF frame dimensions are inferred from prior local evidence when not explicitly stored in the manifest.",
        ],
    }


def contact_sheet(image_rows: list[dict[str, Any]], output_path: Path, title: str) -> dict[str, Any]:
    cv2 = _import_cv2()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cell_w, cell_h = 320, 210
    img_h = 170
    cols = 5
    rows_count = max(1, math.ceil(len(image_rows) / cols))
    sheet = 255 * __import__("numpy").ones((rows_count * cell_h + 40, cols * cell_w, 3), dtype="uint8")
    cv2.putText(sheet, title, (12, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2, cv2.LINE_AA)
    for index, row in enumerate(image_rows):
        image_path = ROOT / row["framePath"] if row.get("framePath") else None
        col = index % cols
        grid_row = index // cols
        x = col * cell_w
        y = 40 + grid_row * cell_h
        if image_path and image_path.exists():
            image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
            if image is not None:
                resized = cv2.resize(image, (cell_w, img_h), interpolation=cv2.INTER_AREA)
                sheet[y : y + img_h, x : x + cell_w] = resized
        label = f"{row.get('annotationId')} {row.get('requestRole')} {int(row.get('requestedTimestampMs') or 0) / 1000:.1f}s"
        if row.get("candidateWindow"):
            label = f"{row.get('annotationId')} {row.get('candidateWindow')} {int(row.get('requestedTimestampMs') or 0) / 1000:.1f}s"
        cv2.putText(sheet, label[:44], (x + 6, y + img_h + 24), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)
    cv2.imwrite(str(output_path), sheet)
    return {
        "path": rel(output_path),
        "sha256": sha256_file(output_path),
        "includedAnnotationIds": sorted(set(str(row.get("annotationId")) for row in image_rows)),
        "includedRequestIds": [row.get("requestId") for row in image_rows],
        "frameCount": len(image_rows),
    }


def build_contact_sheets(annotations: list[dict[str, Any]], rows: list[dict[str, Any]]) -> dict[str, Any]:
    required_roles = {"start", "midpoint", "end"}
    rows_by_annotation: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        rows_by_annotation[str(row.get("annotationId"))].append(row)
    sheets = []
    for start in range(0, len(annotations), 10):
        chunk = annotations[start : start + 10]
        image_rows = []
        for annotation in chunk:
            ann_rows = [row for row in rows_by_annotation[annotation["annotationId"]] if row.get("requestRole") in required_roles]
            image_rows.extend(sorted(ann_rows, key=lambda row: (row.get("requestedTimestampMs") or 0, row.get("requestId") or "")))
        title = f"Match {MATCH_ID} annotations {chunk[0]['annotationId']}-{chunk[-1]['annotationId']}"
        sheets.append(contact_sheet(image_rows, CONTACT_SHEET_DIR / f"annotations_{chunk[0]['annotationId']}_{chunk[-1]['annotationId']}.jpg", title))
    e088_rows = sorted(rows_by_annotation.get("E088", []), key=lambda row: (row.get("requestedTimestampMs") or 0, row.get("requestId") or ""))
    sheets.append(contact_sheet(e088_rows, CONTACT_SHEET_DIR / "E088_candidates.jpg", "Match 91119257 E088 candidate comparison"))
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_contact_sheet_manifest",
        "createdAt": now_iso(),
        "storagePolicy": "local_untracked_do_not_commit_images",
        "contactSheetDirectory": rel(CONTACT_SHEET_DIR),
        "contactSheetCount": len(sheets),
        "sheets": sheets,
    }


def determinism_check(requests: list[dict[str, Any]]) -> dict[str, Any]:
    subset = sorted(requests, key=lambda item: (item["requestedTimestampMs"], item["requestId"]))[:30]
    first = extract_request_frames(subset, DETERMINISM_DIR / "run_a")
    second = extract_request_frames(subset, DETERMINISM_DIR / "run_b")
    projection = lambda rows: [
        {
            "requestId": row["requestId"],
            "frameId": row["frameId"],
            "requestedTimestampMs": row["requestedTimestampMs"],
            "decodedTimestampMs": row["decodedTimestampMs"],
            "timestampErrorMs": row["timestampErrorMs"],
            "frameSha256": row["frameSha256"],
            "decodeStatus": row["decodeStatus"],
        }
        for row in rows
    ]
    first_projection = projection(first)
    second_projection = projection(second)
    return {
        "mode": "representative_subset",
        "subsetRequestCount": len(subset),
        "requestCountMatches": len(first) == len(second) == len(subset),
        "decodedTimestampsMatch": [row["decodedTimestampMs"] for row in first_projection] == [row["decodedTimestampMs"] for row in second_projection],
        "frameIdsMatch": [row["frameId"] for row in first_projection] == [row["frameId"] for row in second_projection],
        "hashesMatch": [row["frameSha256"] for row in first_projection] == [row["frameSha256"] for row in second_projection],
        "orderingMatches": [row["requestId"] for row in first_projection] == [row["requestId"] for row in second_projection],
        "failuresMatch": [row["decodeStatus"] for row in first_projection] == [row["decodeStatus"] for row in second_projection],
        "deterministic": first_projection == second_projection,
        "limitations": ["Determinism was checked on the first 30 chronologically sorted requests to avoid duplicating the full local frame set."],
    }


def gate_result(annotations: list[dict[str, Any]], requests: list[dict[str, Any]], rows: list[dict[str, Any]], determinism: dict[str, Any]) -> dict[str, Any]:
    annotation_count_ok = len(annotations) == 88 and len({item["annotationId"] for item in annotations}) == 88
    required = [request for request in requests if request["requestRole"] in {"start", "midpoint", "end"} and not request.get("candidateWindow")]
    row_by_request = {row.get("requestId"): row for row in rows}
    required_success = all(row_by_request.get(request["requestId"], {}).get("decodeStatus") in {"decoded", "out_of_tolerance", "skipped_existing"} for request in required)
    all_represented = len({row.get("annotationId") for row in rows}) == 88
    failures = [row for row in rows if row.get("decodeStatus") not in {"decoded", "out_of_tolerance", "skipped_existing"}]
    out_of_tolerance = [row for row in rows if row.get("decodeStatus") == "out_of_tolerance"]
    if not rows:
        gate = "annotation_video_decode_blocked"
    elif annotation_count_ok and all_represented and required_success and determinism.get("deterministic") and not out_of_tolerance:
        gate = "annotation_frame_set_ready"
    elif annotation_count_ok and all_represented and required_success and determinism.get("deterministic") and not failures:
        gate = "annotation_frame_set_ready_with_limitations"
    else:
        gate = "annotation_frame_set_incomplete"
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_annotation_frame_extraction_gate",
        "createdAt": now_iso(),
        "gate": gate,
        "annotationCountOk": annotation_count_ok,
        "allAnnotationsRepresented": all_represented,
        "requiredRequests": len(required),
        "requiredRequestsSuccessful": required_success,
        "failedRequests": len(failures),
        "outOfToleranceRequests": len(out_of_tolerance),
        "determinism": determinism,
        "replay005Protection": {"processed": False, "status": "preserved"},
        "prohibitedInterpretations": [
            "semantic occupancy",
            "lane transitions",
            "rotations",
            "fight detection",
            "decision evaluation",
            "video-demo alignment",
        ],
    }


def output_size_summary(paths: list[Path]) -> list[dict[str, Any]]:
    output = []
    for path in paths:
        if path.exists():
            output.append({"path": rel(path), "sizeBytes": path.stat().st_size, "under10MiB": path.stat().st_size < 10 * 1024 * 1024})
    return output


def write_report(
    annotation_audit: dict[str, Any],
    request_info: dict[str, Any],
    summary: dict[str, Any],
    seek: dict[str, Any],
    comparison: dict[str, Any],
    contacts: dict[str, Any],
    quality: dict[str, Any],
    gate: dict[str, Any],
) -> None:
    seek_error = seek["seekErrorMs"]
    report = f"""# Match 91119257 Complete Annotation Frame Extraction

Date: 2026-06-28

## Scope

Task 037 extracted deterministic OpenCV frame evidence for the preserved 88-event visual annotation packet. This task produced frame manifests, contact-sheet manifests, quality checks, a seek audit, and a WPF metadata comparison only. It did not run OCR, detection, VLM, tracking, parser recovery, video-demo alignment, or semantic interpretation.

## Inputs

- Video: `samples/videos/Partida_006_Replay.mp4`
- Annotation CSV: `{annotation_audit['sourcePath']}`
- CSV SHA-256 verified against preserved packet: `{annotation_audit['sourceHash']['matchesPreservedPacket']}`
- WPF manifest: `output/match_91119257/video-frame-index.json`

## Results

- Source annotations loaded: {annotation_audit['annotationCount']}
- Unique annotation IDs: {annotation_audit['uniqueAnnotationIds']}
- Frame requests generated: {request_info['requestCount']}
- Successful frame rows: {summary['successfulFrameRows']}
- Failed frame rows: {summary['failedFrameRows']}
- Unique frame hashes: {request_info['uniqueFrameHashes']}
- Duplicate hash references: {request_info['duplicateHashReferenceRows']}
- Contact sheets generated locally: {contacts['contactSheetCount']}
- Readable frames: {quality['readableFrames']} / {quality['frameCount']}

## Timing

- Video duration: {seek['video'].get('decoded_duration_ms')} ms
- FPS reported: {seek['video'].get('fps_reported')}
- Frame count reported: {seek['video'].get('frame_count_reported')}
- Seek error median/p90/max: {seek_error['median']} / {seek_error['p90']} / {seek_error['max']} ms
- Seek error growth: `{seek['seekErrorGrowth']}`

## WPF Comparison

- Shared comparable requests: {comparison['sharedComparableRequests']}
- Consistent shared requests: {comparison['consistentSharedRequests']}
- Inconsistent shared requests: {comparison['inconsistentSharedRequests']}

This comparison checks metadata and availability only. Pixel equality and visual differences are intentionally not evaluated.

## E088

E088 includes the original `23:50-23:55` candidate and the probable `24:50-24:55` correction as separate alternate-candidate frame requests. This task preserves both windows and does not resolve the annotation.

## Determinism

- Mode: `{gate['determinism']['mode']}`
- Subset request count: {gate['determinism']['subsetRequestCount']}
- Deterministic: {gate['determinism']['deterministic']}

## Gate

`{gate['gate']}`

## Limitations

- Actual frames and contact-sheet images are stored under `output-local/` and are intentionally untracked.
- No visual element, HUD text, minimap content, structure type, side alias, lane color alias, or game-clock value was interpreted.
- The parser entity-5594 failure remains separate and unresolved.
- Replay 005 was not processed.

## Outputs

- `output/match_91119257/annotation-frame-requests.json`
- `output/match_91119257/annotation-frame-manifest.jsonl`
- `output/match_91119257/annotation-frame-summary.json`
- `output/match_91119257/video-seek-audit.json`
- `output/match_91119257/wpf-opencv-frame-comparison.json`
- `output/match_91119257/contact-sheet-manifest.json`
- `output/match_91119257/annotation-frame-quality.json`
- `output/match_91119257/annotation-frame-extraction-gate.json`
"""
    REPORT_PATH.write_text(report, encoding="utf-8")
    LATEST_REPORT_PATH.write_text(rel(REPORT_PATH) + "\n", encoding="utf-8")


def main() -> None:
    TRACKED_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    annotations, annotation_audit = load_annotations()
    metadata = probe_video(
        VideoProcessingConfig(
            video_path=VIDEO_PATH,
            output_dir=LOCAL_OUTPUT_DIR / "metadata-probe",
            extraction_mode=FrameExtractionMode.REGULAR,
            sample_fps=1,
        )
    )
    duration_ms = metadata.decoded_duration_ms or metadata.container_duration_ms
    if duration_ms is None:
        raise RuntimeError("Video duration is required to build context requests.")

    requests, request_warnings = build_requests(annotations, duration_ms)
    rows = extract_request_frames(requests, FRAMES_OUTPUT_DIR)
    duplicate_hashes = compute_hash_duplicates(rows)
    request_info = {
        "schemaVersion": 1,
        "kind": "match_91119257_annotation_frame_requests",
        "createdAt": now_iso(),
        "videoPath": rel(VIDEO_PATH),
        "localFrameOutputDirectory": rel(FRAMES_OUTPUT_DIR / "frames"),
        "annotationAudit": annotation_audit,
        "requestCount": len(requests),
        "requiredStartMidEndRequests": sum(1 for item in requests if item["requestRole"] in {"start", "midpoint", "end"} and item.get("candidateWindow") is None),
        "contextRequests": sum(1 for item in requests if item["requestRole"].startswith("context")),
        "alternateCandidateRequests": sum(1 for item in requests if item.get("candidateWindow")),
        "uniqueFrameHashes": len({row.get("frameSha256") for row in rows if row.get("frameSha256")}),
        "duplicateHashGroups": len(duplicate_hashes),
        "duplicateHashReferenceRows": sum(count for count in duplicate_hashes.values()),
        "requestWarnings": request_warnings,
        "requests": requests,
    }
    summary = annotation_summary(annotations, requests, rows)
    seek = video_seek_audit(metadata, rows)
    comparison = compare_wpf(rows)
    contacts = build_contact_sheets(annotations, rows)
    quality = quality_audit(rows)
    determinism = determinism_check(requests)
    gate = gate_result(annotations, requests, rows, determinism)

    outputs = [
        TRACKED_OUTPUT_DIR / "annotation-frame-requests.json",
        TRACKED_OUTPUT_DIR / "annotation-frame-manifest.jsonl",
        TRACKED_OUTPUT_DIR / "annotation-frame-summary.json",
        TRACKED_OUTPUT_DIR / "video-seek-audit.json",
        TRACKED_OUTPUT_DIR / "wpf-opencv-frame-comparison.json",
        TRACKED_OUTPUT_DIR / "contact-sheet-manifest.json",
        TRACKED_OUTPUT_DIR / "annotation-frame-quality.json",
        TRACKED_OUTPUT_DIR / "annotation-frame-extraction-gate.json",
    ]
    request_info["outputSizeCheck"] = output_size_summary(outputs)
    write_json(TRACKED_OUTPUT_DIR / "annotation-frame-requests.json", request_info)
    write_jsonl(TRACKED_OUTPUT_DIR / "annotation-frame-manifest.jsonl", rows)
    write_json(TRACKED_OUTPUT_DIR / "annotation-frame-summary.json", summary)
    write_json(TRACKED_OUTPUT_DIR / "video-seek-audit.json", seek)
    write_json(TRACKED_OUTPUT_DIR / "wpf-opencv-frame-comparison.json", comparison)
    write_json(TRACKED_OUTPUT_DIR / "contact-sheet-manifest.json", contacts)
    write_json(TRACKED_OUTPUT_DIR / "annotation-frame-quality.json", quality)
    write_json(TRACKED_OUTPUT_DIR / "annotation-frame-extraction-gate.json", gate)
    write_report(annotation_audit, request_info, summary, seek, comparison, contacts, quality, gate)
    print(
        json.dumps(
            {
                "gate": gate["gate"],
                "annotations": annotation_audit["annotationCount"],
                "requests": len(requests),
                "failedRequests": gate["failedRequests"],
                "uniqueFrameHashes": request_info["uniqueFrameHashes"],
                "seekErrorMs": seek["seekErrorMs"],
                "contactSheets": contacts["contactSheetCount"],
                "deterministic": determinism["deterministic"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
