from __future__ import annotations

import csv
import hashlib
import json
import math
import statistics
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2  # type: ignore
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
VIDEO_PATH = ROOT / "samples" / "videos" / "Partida_006_Replay.mp4"
CSV_PATH = ROOT / "data" / "evidence" / "match_91119257" / "raw" / "match_91119257_events.csv"
OUTPUT_DIR = ROOT / "output" / "match_91119257"
LOCAL_DIR = ROOT / "output-local" / "match_91119257" / "dense-manual-review"
FRAME_DIR = LOCAL_DIR / "frames"
SHEET_DIR = LOCAL_DIR / "contact-sheets"
REPORT_PATH = ROOT / "reports" / "match-91119257-dense-manual-review-rebuild.md"
LATEST_REPORT_PATH = ROOT / "reports" / "latest.md"

MINIMIZED_REVIEW = OUTPUT_DIR / "minimized-manual-review.json"
MANUAL_FORM = OUTPUT_DIR / "manual-review-form.json"


PROVISIONAL_OBSERVATIONS = {
    "E001": {
        "observations": [
            "Original selected frames do not represent the spawn well.",
            "User sees allied Hidden King base, three ziplines converging, Hidden King in the background, shop behind the player, and the player in the southern-central base.",
        ],
        "betterObservedFrames": ["frame_000005_0000024000ms", "frame_000006_0000025000ms", "frame_000007_0000027500ms"],
        "status": "provisional_pending_dense_reselection",
    },
    "E002": {
        "observations": [
            "User sees an allied speaker-like Shrine emitting circular waves, on the left side of Hidden King base, associated with Yellow lane.",
        ],
        "betterObservedFrames": ["frame_000010_0000044000ms"],
        "status": "provisional_pending_dense_reselection",
    },
    "E003": {
        "observations": [
            "Same speaker-like allied Shrine, on the right side of Hidden King base, associated with Green lane.",
        ],
        "betterObservedFrames": ["frame_000013_0000050000ms", "frame_000014_0000051000ms", "frame_000015_0000059000ms"],
        "status": "provisional_pending_dense_reselection",
    },
    "E004": {
        "observations": [
            "User sees two tall allied Base Guardians with health bars, protecting an entrance/exit crossed by Yellow lane.",
        ],
        "betterObservedFrames": ["frame_000020_0000069000ms", "frame_000021_0000070000ms", "frame_000022_0000072500ms"],
        "status": "provisional_pending_dense_reselection",
    },
    "E005": {
        "observations": ["User could not locate it in the current review file."],
        "betterObservedFrames": [],
        "status": "review_record_or_selection_missing",
    },
    "E006": {
        "observations": ["User sees the allied Green lane Base Guardians from a distance."],
        "betterObservedFrames": ["frame_000029_0000086000ms"],
        "status": "provisional_pending_dense_reselection",
    },
    "E009": {
        "observations": ["No current selected frame shows the annotated allied Yellow lane shop."],
        "betterObservedFrames": [],
        "status": "annotation_not_represented_by_current_frame_selection",
    },
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def rel(path: str | Path | None) -> str | None:
    if path is None:
        return None
    value = Path(path)
    try:
        return value.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return value.as_posix()


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_timestamp(value: str) -> int:
    parts = [int(part) for part in value.split(":")]
    if len(parts) == 2:
        return (parts[0] * 60 + parts[1]) * 1000
    if len(parts) == 3:
        return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
    raise ValueError(value)


def load_source_annotations() -> dict[str, dict[str, Any]]:
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    output = {}
    for index, row in enumerate(rows):
        output[row["event_id"]] = {
            "sourceOrder": index,
            "annotationId": row["event_id"],
            "videoStart": row["video_start"],
            "videoEnd": row["video_end"],
            "startMs": parse_timestamp(row["video_start"]),
            "endMs": parse_timestamp(row["video_end"]),
            "eventGroup": row["event_group"],
            "objectType": row["object_type"],
            "objectTier": row["object_tier"],
            "elementTeam": row["allegiance"] or None,
            "laneColor": row["lane_reference"] or None,
            "mapSide": row["map_sector"] or None,
            "verticalLevel": row["vertical_level"] or None,
            "sourceLabel": row["description_pt_br"],
            "validationStatus": row["validation_status"],
            "validationNote": row["validation_note"],
        }
    return output


def load_review_ids() -> list[str]:
    data = json.loads(MINIMIZED_REVIEW.read_text(encoding="utf-8"))
    return [item["annotationId"] for item in data["items"]]


def video_duration_ms() -> int:
    cap = cv2.VideoCapture(str(VIDEO_PATH))
    if not cap.isOpened():
        raise RuntimeError("Could not open video")
    try:
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        return int((frames / fps) * 1000)
    finally:
        cap.release()


def build_requests(review_ids: list[str], source: dict[str, dict[str, Any]], duration_ms: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    requests: list[dict[str, Any]] = []
    escalations = []
    force_escalate = {"E009", "E088"}
    for annotation_id in review_ids:
        ann = source[annotation_id]
        for window_kind, pad in (("initial_pm5s", 5000),):
            start = max(0, ann["startMs"] - pad)
            end = min(duration_ms, ann["endMs"] + pad)
            timestamp = start
            while timestamp <= end:
                requests.append(make_request(annotation_id, ann, timestamp, window_kind, start, end))
                timestamp += 500
        if annotation_id in force_escalate:
            start = max(0, ann["startMs"] - 10000)
            end = min(duration_ms, ann["endMs"] + 10000)
            escalations.append(
                {
                    "annotationId": annotation_id,
                    "reason": "forced_by_user_observation" if annotation_id == "E009" else "corrected_timestamp_case_requires_wider_context",
                    "fromWindow": "start-5s_to_end+5s",
                    "toWindow": "start-10s_to_end+10s",
                    "status": "executed",
                }
            )
            timestamp = start
            while timestamp <= end:
                requests.append(make_request(annotation_id, ann, timestamp, "escalated_pm10s", start, end))
                timestamp += 500
        if annotation_id == "E088":
            # Preserve the visually supported corrected candidate window from task 038.
            start = 1490000 - 10000
            end = 1495000 + 10000
            escalations.append(
                {
                    "annotationId": annotation_id,
                    "reason": "include_task038_corrected_24m50_24m55_window",
                    "fromWindow": "source_original_timestamp",
                    "toWindow": "corrected_window_pm10s",
                    "status": "executed",
                }
            )
            timestamp = start
            while timestamp <= end:
                requests.append(make_request(annotation_id, ann, timestamp, "corrected_candidate_pm10s", start, end))
                timestamp += 500
    requests.sort(
        key=lambda item: (
            item["annotationId"],
            item["requestedTimestampMs"],
            item["denseWindowKind"],
            item["requestId"],
        )
    )
    return requests, escalations


def make_request(annotation_id: str, ann: dict[str, Any], timestamp: int, window_kind: str, window_start: int, window_end: int) -> dict[str, Any]:
    return {
        "requestId": f"{annotation_id}_{window_kind}_{timestamp:07d}",
        "annotationId": annotation_id,
        "originalStartMs": ann["startMs"],
        "originalEndMs": ann["endMs"],
        "denseWindowKind": window_kind,
        "denseWindowStartMs": window_start,
        "denseWindowEndMs": window_end,
        "requestedTimestampMs": timestamp,
        "relativeOffsetFromAnnotationStartMs": timestamp - ann["startMs"],
    }


def extract_frames(requests: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cap = cv2.VideoCapture(str(VIDEO_PATH))
    if not cap.isOpened():
        return [{**request, "decodeStatus": "video_open_failed", "warnings": ["OpenCV could not open video."]} for request in requests]
    rows = []
    try:
        for index, request in enumerate(requests):
            annotation_dir = FRAME_DIR / request["annotationId"]
            annotation_dir.mkdir(parents=True, exist_ok=True)
            path = annotation_dir / f"{request['requestId']}.jpg"
            cap.set(cv2.CAP_PROP_POS_MSEC, request["requestedTimestampMs"])
            ok, frame = cap.read()
            if not ok:
                rows.append(
                    {
                        **request,
                        "frameId": f"dense_frame_{index:06d}",
                        "decodedTimestampMs": None,
                        "timestampErrorMs": None,
                        "framePath": None,
                        "frameSha256": None,
                        "decodeStatus": "seek_failed",
                        "warnings": ["OpenCV seek/read failed."],
                    }
                )
                continue
            cv2.imwrite(str(path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            decoded = int(cap.get(cv2.CAP_PROP_POS_MSEC) or request["requestedTimestampMs"])
            rows.append(
                {
                    **request,
                    "frameId": f"dense_frame_{index:06d}",
                    "decodedTimestampMs": decoded,
                    "timestampErrorMs": decoded - request["requestedTimestampMs"],
                    "framePath": rel(path),
                    "frameSha256": sha256_file(path),
                    "width": int(frame.shape[1]),
                    "height": int(frame.shape[0]),
                    "decodeStatus": "decoded",
                    "warnings": [],
                }
            )
    finally:
        cap.release()
    return rows


def metrics_for(path: Path) -> dict[str, Any]:
    image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if image is None:
        return {"readable": False}
    lap = cv2.Laplacian(image, cv2.CV_64F)
    return {
        "readable": True,
        "sharpness": float(lap.var()),
        "brightness": float(image.mean()),
        "nearBlackRatio": float((image <= 8).mean()),
        "variance": float(image.var()),
    }


def add_metrics(rows: list[dict[str, Any]]) -> None:
    previous_by_annotation: dict[str, np.ndarray] = {}
    for row in rows:
        if not row.get("framePath"):
            row["candidateMetrics"] = {"readable": False}
            continue
        path = ROOT / row["framePath"]
        metrics = metrics_for(path)
        image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        change = None
        stability = None
        if image is not None:
            small = cv2.resize(image, (64, 36), interpolation=cv2.INTER_AREA).astype("float32")
            prev = previous_by_annotation.get(row["annotationId"])
            if prev is not None:
                change = float(np.mean(np.abs(small - prev)))
                stability = "stable" if change < 10 else "moving" if change < 35 else "large_change"
            previous_by_annotation[row["annotationId"]] = small
        midpoint = (row["originalStartMs"] + row["originalEndMs"]) / 2
        metrics.update(
            {
                "distanceFromAnnotationMidpointMs": abs(row["requestedTimestampMs"] - midpoint),
                "visualChangeFromPrevious": change,
                "cameraStabilityEstimate": stability,
                "duplicateSimilarityKey": row.get("frameSha256"),
            }
        )
        row["candidateMetrics"] = metrics


def shortlist(rows: list[dict[str, Any]], source: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    by_ann: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_ann[row["annotationId"]].append(row)
    output = {}
    selected_rows = {}
    for annotation_id, ann_rows in by_ann.items():
        decoded = [row for row in ann_rows if row["decodeStatus"] == "decoded"]
        if not decoded:
            output[annotation_id] = []
            selected_rows[annotation_id] = []
            continue
        ann = source[annotation_id]
        midpoint = (ann["startMs"] + ann["endMs"]) / 2
        buckets = [
            ("before", min(decoded, key=lambda row: abs(row["requestedTimestampMs"] - (ann["startMs"] - 2500)))),
            ("near_start", min(decoded, key=lambda row: abs(row["requestedTimestampMs"] - ann["startMs"]))),
            ("midpoint", min(decoded, key=lambda row: abs(row["requestedTimestampMs"] - midpoint))),
            ("near_end", min(decoded, key=lambda row: abs(row["requestedTimestampMs"] - ann["endMs"]))),
            ("after", min(decoded, key=lambda row: abs(row["requestedTimestampMs"] - (ann["endMs"] + 2500)))),
            (
                "highest_visual_change",
                max(decoded, key=lambda row: row.get("candidateMetrics", {}).get("visualChangeFromPrevious") or -1),
            ),
        ]
        seen = set()
        candidates = []
        selected = []
        for reason, row in buckets:
            if row["requestId"] in seen:
                continue
            seen.add(row["requestId"])
            candidate = {
                "selectionReason": reason,
                "frameId": row["frameId"],
                "requestId": row["requestId"],
                "framePath": row["framePath"],
                "requestedTimestampMs": row["requestedTimestampMs"],
                "relativeOffsetFromAnnotationStartMs": row["relativeOffsetFromAnnotationStartMs"],
                "denseWindowKind": row["denseWindowKind"],
                "metrics": row["candidateMetrics"],
                "representativeCandidateStatus": representative_status(annotation_id),
            }
            candidates.append(candidate)
            selected.append(row)
        output[annotation_id] = candidates[:6]
        selected_rows[annotation_id] = selected[:6]
    return output, selected_rows


def representative_status(annotation_id: str) -> str:
    if annotation_id == "E009":
        return "requires_human_confirmation_after_dense_reselection"
    if annotation_id == "E088":
        return "corrected_candidate_available_requires_human_confirmation"
    if annotation_id in PROVISIONAL_OBSERVATIONS and annotation_id != "E005":
        return "provisional_human_observation_available"
    return "candidate_shortlist_requires_human_review"


def make_contact_sheet(annotation_id: str, rows: list[dict[str, Any]], source: dict[str, Any], kind: str) -> str | None:
    images = [row for row in rows if row.get("framePath")]
    if not images:
        return None
    SHEET_DIR.mkdir(parents=True, exist_ok=True)
    cols = 4
    cell_w, cell_h = 420, 275
    img_h = 220
    sheet_rows = math.ceil(len(images) / cols)
    sheet = 255 * np.ones((sheet_rows * cell_h + 70, cols * cell_w, 3), dtype="uint8")
    title = f"{annotation_id} {kind} {source['sourceLabel'][:90]}"
    cv2.putText(sheet, title, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1, cv2.LINE_AA)
    cv2.putText(sheet, f"source interval {source['videoStart']}-{source['videoEnd']}", (12, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 0, 0), 1, cv2.LINE_AA)
    for index, row in enumerate(images):
        image = cv2.imread(str(ROOT / row["framePath"]), cv2.IMREAD_COLOR)
        if image is None:
            continue
        x = (index % cols) * cell_w
        y = 70 + (index // cols) * cell_h
        sheet[y : y + img_h, x : x + cell_w] = cv2.resize(image, (cell_w, img_h), interpolation=cv2.INTER_AREA)
        marker = " START" if row["requestedTimestampMs"] == source["startMs"] else " END" if row["requestedTimestampMs"] == source["endMs"] else ""
        label = f"{row['requestedTimestampMs']/1000:.1f}s off {row['relativeOffsetFromAnnotationStartMs']/1000:+.1f}s{marker}"
        cv2.putText(sheet, label, (x + 6, y + img_h + 24), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (0, 0, 0), 1, cv2.LINE_AA)
    path = SHEET_DIR / f"{annotation_id}_{kind}.jpg"
    cv2.imwrite(str(path), sheet, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    return rel(path)


def build_outputs(rows: list[dict[str, Any]], review_ids: list[str], source: dict[str, dict[str, Any]], escalations: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    add_metrics(rows)
    candidates, selected_rows = shortlist(rows, source)
    by_ann: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_ann[row["annotationId"]].append(row)
    annotations_summary = []
    form_records = []
    csv_rows = []
    unresolved = []
    representative_count = 0
    for idx, annotation_id in enumerate(review_ids, 1):
        ann_rows = sorted(by_ann[annotation_id], key=lambda row: (row["requestedTimestampMs"], row["denseWindowKind"]))
        ann = source[annotation_id]
        sheet = make_contact_sheet(annotation_id, ann_rows, ann, "dense")
        shortlist_sheet = make_contact_sheet(annotation_id, selected_rows.get(annotation_id, []), ann, "shortlist")
        escalation = [item for item in escalations if item["annotationId"] == annotation_id]
        candidate_status = "candidate_shortlist_requires_human_review"
        if any(candidate["representativeCandidateStatus"] != "candidate_shortlist_requires_human_review" for candidate in candidates.get(annotation_id, [])):
            candidate_status = candidates[annotation_id][0]["representativeCandidateStatus"]
        if annotation_id == "E009":
            candidate_status = "representative_candidates_generated_but_user_confirmation_required"
        if annotation_id == "E088":
            candidate_status = "corrected_window_candidates_generated_but_user_confirmation_required"
        has_candidate = bool(candidates.get(annotation_id))
        if has_candidate:
            representative_count += 1
        else:
            unresolved.append(annotation_id)
        annotations_summary.append(
            {
                "annotationId": annotation_id,
                "sourceAnnotation": ann,
                "denseWindowStartMs": min(row["denseWindowStartMs"] for row in ann_rows),
                "denseWindowEndMs": max(row["denseWindowEndMs"] for row in ann_rows),
                "requestCount": len(ann_rows),
                "decodedCount": sum(1 for row in ann_rows if row["decodeStatus"] == "decoded"),
                "failedCount": sum(1 for row in ann_rows if row["decodeStatus"] != "decoded"),
                "escalated": bool(escalation),
                "escalationRecords": escalation,
                "denseContactSheetPath": sheet,
                "shortlistContactSheetPath": shortlist_sheet,
                "candidateCount": len(candidates.get(annotation_id, [])),
                "representativeCandidateStatus": candidate_status if has_candidate else "no_representative_frame_found",
                "provisionalUserObservation": PROVISIONAL_OBSERVATIONS.get(annotation_id),
            }
        )
        record = {
            "reviewId": f"MR91119257V2-{idx:03d}",
            "annotationId": annotation_id,
            "sourceAnnotation": ann,
            "denseContactSheetPath": sheet,
            "shortlistContactSheetPath": shortlist_sheet,
            "candidateFrames": candidates.get(annotation_id, []),
            "originalAnnotationInterval": {"startMs": ann["startMs"], "endMs": ann["endMs"], "label": f"{ann['videoStart']}-{ann['videoEnd']}"},
            "expandedExtractionInterval": {
                "startMs": min(row["denseWindowStartMs"] for row in ann_rows),
                "endMs": max(row["denseWindowEndMs"] for row in ann_rows),
            },
            "escalationRequired": bool(escalation),
            "escalationRecords": escalation,
            "provisionalUserObservation": PROVISIONAL_OBSERVATIONS.get(annotation_id),
            "questions": [
                "Which candidate frame best represents the annotated target?",
                "Does that frame independently show the target named in the source annotation?",
                "If not, what corrected target, lane, side, or interval should be used?",
            ],
            "allowedResponses": ["confirmed", "corrected", "still_ambiguous", "not_visible", "not_enough_context"],
            "userResponse": None,
            "notes": None,
        }
        form_records.append(record)
        csv_rows.append(
            {
                "review_id": record["reviewId"],
                "annotation_id": annotation_id,
                "source_label": ann["sourceLabel"],
                "dense_contact_sheet": sheet or "",
                "shortlist_contact_sheet": shortlist_sheet or "",
                "candidate_frame_paths": " | ".join(candidate["framePath"] for candidate in candidates.get(annotation_id, [])),
                "original_interval": f"{ann['videoStart']}-{ann['videoEnd']}",
                "expanded_interval_ms": f"{record['expandedExtractionInterval']['startMs']}-{record['expandedExtractionInterval']['endMs']}",
                "escalation_required": str(bool(escalation)).lower(),
                "provisional_observation_status": (PROVISIONAL_OBSERVATIONS.get(annotation_id) or {}).get("status", ""),
                "response_status": "",
                "corrected_element_type": "",
                "corrected_map_side": "",
                "corrected_lane_color": "",
                "corrected_element_team": "",
                "corrected_timestamp_window": "",
                "notes": "",
            }
        )
    summary = {
        "schemaVersion": 1,
        "kind": "match_91119257_dense_review_annotation_summary",
        "createdAt": now_iso(),
        "reviewAnnotationCount": len(review_ids),
        "representativeCandidateAnnotations": representative_count,
        "unresolvedAnnotations": unresolved,
        "annotations": annotations_summary,
        "e005Investigation": investigate_e005(review_ids, source),
        "e009RepresentativeFrameResult": next((item for item in annotations_summary if item["annotationId"] == "E009"), None),
    }
    form = {
        "schemaVersion": 2,
        "kind": "match_91119257_manual_review_form_v2",
        "createdAt": now_iso(),
        "reviewCount": len(form_records),
        "supersedes": rel(OUTPUT_DIR / "manual-review-form.json"),
        "warning": "Do not ingest v1 answers as final confirmations. Use this dense package instead.",
        "records": form_records,
        "replay005Protection": {"processed": False, "status": "preserved"},
    }
    manifest = {
        "schemaVersion": 1,
        "kind": "match_91119257_manual_review_package_v2_manifest",
        "createdAt": now_iso(),
        "gate": "dense_manual_review_package_ready" if not unresolved else "dense_manual_review_package_ready_with_unresolved_frames",
        "reviewAnnotationCount": len(review_ids),
        "denseRequestCount": len(rows),
        "framesExtracted": sum(1 for row in rows if row["decodeStatus"] == "decoded"),
        "escalationCount": len(escalations),
        "representativeCandidateAnnotations": representative_count,
        "unresolvedAnnotations": unresolved,
        "outputs": [
            rel(OUTPUT_DIR / "dense-review-frame-manifest.jsonl"),
            rel(OUTPUT_DIR / "dense-review-annotation-summary.json"),
            rel(OUTPUT_DIR / "dense-review-candidate-shortlist.json"),
            rel(OUTPUT_DIR / "dense-review-escalations.json"),
            rel(OUTPUT_DIR / "provisional-human-review-observations.json"),
            rel(OUTPUT_DIR / "manual-review-form-v2.json"),
            rel(OUTPUT_DIR / "manual-review-form-v2.csv"),
        ],
        "localAssets": {"frameDirectory": rel(FRAME_DIR), "contactSheetDirectory": rel(SHEET_DIR), "committed": False},
        "replay005Protection": {"processed": False, "status": "preserved"},
    }
    return summary, {"schemaVersion": 1, "kind": "match_91119257_dense_review_candidate_shortlist", "createdAt": now_iso(), "candidatesByAnnotation": candidates}, form, csv_rows, manifest


def investigate_e005(review_ids: list[str], source: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {
        "existsInSourceCsv": "E005" in source,
        "existsInMinimizedReviewSet": "E005" in review_ids,
        "sourceAnnotation": source.get("E005"),
        "result": "source_annotation_exists_but_not_selected_in_task038_minimized_review",
        "userObservationStatus": PROVISIONAL_OBSERVATIONS["E005"]["status"],
        "nextAction": "Consider adding E005 explicitly to a future review package if the user wants all early allied base guardians reviewed.",
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    columns = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def deterministic_check(requests: list[dict[str, Any]]) -> dict[str, Any]:
    subset = requests[:20]
    first = extract_frames(subset)
    second = extract_frames(subset)
    projection = lambda rows: [(row["requestId"], row["decodedTimestampMs"], row["frameSha256"], row["decodeStatus"]) for row in rows]
    return {
        "mode": "first_20_requests",
        "subsetCount": len(subset),
        "deterministic": projection(first) == projection(second),
    }


def write_report(summary: dict[str, Any], manifest: dict[str, Any], deterministic: dict[str, Any]) -> None:
    e005 = summary["e005Investigation"]
    e009 = summary["e009RepresentativeFrameResult"]
    report = f"""# Match 91119257 Dense Manual Review Rebuild

Date: 2026-06-28

## Scope

Task 041 suspended ingestion of the current manual-review package and rebuilt the review package with dense temporal windows for the 24 minimized annotations. It did not install OCR, YOLO, VLM, tracking, or other heavy dependencies, did not resume parser recovery, and did not process replay 005.

## Results

- Review annotations processed: {manifest['reviewAnnotationCount']}
- Dense requests generated: {manifest['denseRequestCount']}
- Frames extracted: {manifest['framesExtracted']}
- +/-10 second escalation records: {manifest['escalationCount']}
- Annotations with candidate shortlists: {manifest['representativeCandidateAnnotations']}
- Unresolved annotations: {manifest['unresolvedAnnotations']}
- Gate: `{manifest['gate']}`
- Deterministic subset: {deterministic['deterministic']}

## E005

E005 exists in the source CSV but is not present in the task 038 minimized review set. Result: `{e005['result']}`.

## E009

E009 was force-escalated because the previous selected frames did not show the allied Yellow lane shop. Dense candidate frames were generated, but human confirmation is still required. Representative status: `{e009['representativeCandidateStatus']}`.

## Outputs

- `output/match_91119257/dense-review-frame-manifest.jsonl`
- `output/match_91119257/dense-review-annotation-summary.json`
- `output/match_91119257/dense-review-candidate-shortlist.json`
- `output/match_91119257/dense-review-escalations.json`
- `output/match_91119257/provisional-human-review-observations.json`
- `output/match_91119257/manual-review-form-v2.json`
- `output/match_91119257/manual-review-form-v2.csv`
- `output/match_91119257/manual-review-package-v2-manifest.json`

Local dense frames and contact sheets are stored under `output-local/` and are intentionally untracked.
"""
    REPORT_PATH.write_text(report, encoding="utf-8")
    LATEST_REPORT_PATH.write_text(rel(REPORT_PATH) + "\n", encoding="utf-8")


def main() -> None:
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    source = load_source_annotations()
    review_ids = load_review_ids()
    duration = video_duration_ms()
    requests, escalations = build_requests(review_ids, source, duration)
    rows = extract_frames(requests)
    summary, candidates, form, csv_rows, manifest = build_outputs(rows, review_ids, source, escalations)
    deterministic = deterministic_check(requests)
    manifest["deterministicSubset"] = deterministic

    write_jsonl(OUTPUT_DIR / "dense-review-frame-manifest.jsonl", rows)
    write_json(OUTPUT_DIR / "dense-review-annotation-summary.json", summary)
    write_json(OUTPUT_DIR / "dense-review-candidate-shortlist.json", candidates)
    write_json(OUTPUT_DIR / "dense-review-escalations.json", {"schemaVersion": 1, "kind": "match_91119257_dense_review_escalations", "createdAt": now_iso(), "escalations": escalations})
    write_json(OUTPUT_DIR / "provisional-human-review-observations.json", {"schemaVersion": 1, "kind": "match_91119257_provisional_human_review_observations", "createdAt": now_iso(), "observations": PROVISIONAL_OBSERVATIONS, "finalConfirmationStatus": "not_ingested"})
    write_json(OUTPUT_DIR / "manual-review-form-v2.json", form)
    write_csv(OUTPUT_DIR / "manual-review-form-v2.csv", csv_rows)
    write_json(OUTPUT_DIR / "manual-review-package-v2-manifest.json", manifest)
    write_report(summary, manifest, deterministic)
    print(json.dumps({"gate": manifest["gate"], "reviewAnnotations": len(review_ids), "denseRequests": len(rows), "framesExtracted": manifest["framesExtracted"], "escalations": manifest["escalationCount"], "unresolved": manifest["unresolvedAnnotations"], "e005": summary["e005Investigation"]["result"], "e009": summary["e009RepresentativeFrameResult"]["representativeCandidateStatus"]}, indent=2))


if __name__ == "__main__":
    main()
