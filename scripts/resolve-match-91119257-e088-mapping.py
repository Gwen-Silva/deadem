from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2  # type: ignore
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "match_91119257"
LOCAL_DIR = ROOT / "output-local" / "match_91119257" / "e088-resolution"
REPORT_PATH = ROOT / "reports" / "match-91119257-e088-timestamp-record-resolution.md"
LATEST_REPORT_PATH = ROOT / "reports" / "latest.md"

SOURCE_IDS = ["E083", "E084", "E085", "E086", "E087", "E088"]
TELEPORTER_IDS = ["E085", "E086", "E087", "E088"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def rel(path: Path | str | None) -> str | None:
    if path is None:
        return None
    resolved = Path(path)
    if not resolved.is_absolute():
        resolved = ROOT / resolved
    try:
        return resolved.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return resolved.as_posix()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_source_rows() -> list[dict[str, Any]]:
    with (ROOT / "data" / "evidence" / "match_91119257" / "raw" / "match_91119257_events.csv").open(
        encoding="utf-8-sig", newline=""
    ) as handle:
        rows = list(csv.DictReader(handle))
    for index, row in enumerate(rows):
        row["sourceOrder"] = index
        row["startMs"] = int(float(row["start_seconds"]) * 1000)
        row["endMs"] = int(float(row["end_seconds"]) * 1000)
    return rows


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def source_row_audit(source_rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_id = {row["event_id"]: row for row in source_rows}
    audited = []
    for event_id in SOURCE_IDS:
        row = by_id[event_id]
        previous_row = source_rows[row["sourceOrder"] - 1] if row["sourceOrder"] > 0 else None
        next_row = source_rows[row["sourceOrder"] + 1] if row["sourceOrder"] + 1 < len(source_rows) else None
        audited.append(
            {
                "annotationId": event_id,
                "sourceOrder": row["sourceOrder"],
                "label": row["description_pt_br"],
                "startTimestamp": row["video_start"],
                "endTimestamp": row["video_end"],
                "startMs": row["startMs"],
                "endMs": row["endMs"],
                "objectType": row["object_type"],
                "eventGroup": row["event_group"],
                "locationDescription": row["description_pt_br"],
                "side": row["allegiance"] or row["map_sector"],
                "lane": row["lane_reference"],
                "verticalLevel": row["vertical_level"],
                "validationStatus": row["validation_status"],
                "validationNote": row["validation_note"],
                "previousRow": previous_row["event_id"] if previous_row else None,
                "nextRow": next_row["event_id"] if next_row else None,
                "temporalGapFromPreviousMs": None if previous_row is None else row["startMs"] - previous_row["endMs"],
                "temporalGapToNextMs": None if next_row is None else next_row["startMs"] - row["endMs"],
            }
        )

    e085 = by_id["E085"]
    e088 = by_id["E088"]
    e087 = by_id["E087"]
    classification = {
        "duplicatedTimestamp": e085["startMs"] == e088["startMs"] and e085["endMs"] == e088["endMs"],
        "duplicatedLabel": e085["description_pt_br"] == e088["description_pt_br"],
        "shiftedTimestampEvidence": {
            "e088AppearsAfterE087InSourceOrder": e088["sourceOrder"] > e087["sourceOrder"],
            "e088OriginalStartBeforeE087Start": e088["startMs"] < e087["startMs"],
            "corrected2450WouldFollowE087": 1490000 >= e087["endMs"],
        },
        "sourceOrderTranscriptionErrorEvidence": [
            "E088 duplicates E085's 23:50-23:55 timestamp exactly.",
            "E088 has a distinct enemy underground label, not a duplicated label.",
            "E088 appears after E087 in source order but its timestamp jumps backward by 55 seconds from E087 end to E088 start.",
            "The source row validation note already marks the duplicate timestamp and suggests 24:50-24:55 as likely intended.",
        ],
        "legitimateRepeatVisitEvidence": [],
        "unresolvableEvidence": [
            "No demo alignment is available in this task.",
            "The user-provided E088 image label points to 1437.5s, which is also E085's confirmed representative timestamp.",
        ],
    }
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_e088_source_row_audit",
        "createdAt": now_iso(),
        "rows": audited,
        "classification": classification,
    }


def rows_by_annotation_and_time(rows: list[dict[str, Any]]) -> dict[str, dict[int, list[dict[str, Any]]]]:
    result: dict[str, dict[int, list[dict[str, Any]]]] = {}
    for row in rows:
        annotation_id = row.get("annotationId")
        timestamp = row.get("requestedTimestampMs")
        if annotation_id is None or timestamp is None:
            continue
        result.setdefault(annotation_id, {}).setdefault(int(timestamp), []).append(row)
    return result


def find_timestamp(rows: list[dict[str, Any]], timestamp_ms: int, annotation_ids: list[str] | None = None) -> list[dict[str, Any]]:
    matches = []
    allowed = set(annotation_ids) if annotation_ids else None
    for row in rows:
        if int(row.get("requestedTimestampMs", -1)) != timestamp_ms:
            continue
        if allowed and row.get("annotationId") not in allowed:
            continue
        matches.append(row)
    return matches


def frame_digest(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "annotationId": row.get("annotationId"),
        "requestId": row.get("requestId"),
        "frameId": row.get("frameId"),
        "requestedTimestampMs": row.get("requestedTimestampMs"),
        "decodedTimestampMs": row.get("decodedTimestampMs"),
        "framePath": row.get("framePath"),
        "frameSha256": row.get("frameSha256"),
        "candidateWindow": row.get("candidateWindow"),
        "requestRole": row.get("requestRole"),
        "denseWindowKind": row.get("denseWindowKind"),
        "decodeStatus": row.get("decodeStatus"),
    }


def build_timeline(annotation_rows: list[dict[str, Any]], dense_rows: list[dict[str, Any]], human: dict[str, Any]) -> dict[str, Any]:
    human_records = {record["annotationId"]: record for record in human["records"]}
    candidates = [
        ("E085_user_confirmed", "E085", 1437500, "user_confirmed_representative_timestamp"),
        ("E086_user_confirmed", "E086", 1452500, "user_confirmed_representative_timestamp"),
        ("E087_user_confirmed", "E087", 1487500, "user_confirmed_representative_timestamp"),
        ("E088_user_uploaded_image_label", "E088", 1437500, "user_confirmed_image_label_not_authoritative_for_annotation_id"),
        ("E088_original_start", "E088", 1430000, "original_source_interval"),
        ("E088_original_midpoint", "E088", 1432500, "original_source_interval"),
        ("E088_original_end", "E088", 1435000, "original_source_interval"),
        ("E088_corrected_start", "E088", 1490000, "corrected_candidate_window"),
        ("E088_corrected_midpoint", "E088", 1492500, "corrected_candidate_window"),
        ("E088_corrected_end", "E088", 1495000, "corrected_candidate_window"),
    ]
    entries = []
    for candidate_id, annotation_id, timestamp, role in candidates:
        dense_matches = find_timestamp(dense_rows, timestamp, [annotation_id])
        annotation_matches = find_timestamp(annotation_rows, timestamp, [annotation_id])
        cross_annotation_matches = find_timestamp(dense_rows + annotation_rows, timestamp, TELEPORTER_IDS)
        entries.append(
            {
                "candidateId": candidate_id,
                "annotationId": annotation_id,
                "timestampMs": timestamp,
                "timestampSeconds": timestamp / 1000,
                "role": role,
                "sourceRecord": human_records.get(annotation_id, {}).get("sourceAnnotation"),
                "denseFrames": [frame_digest(row) for row in dense_matches],
                "annotationFrameManifestFrames": [frame_digest(row) for row in annotation_matches],
                "sameTimestampAcrossTeleporterRows": [frame_digest(row) for row in cross_annotation_matches],
                "uniqueHashesAtTimestamp": sorted({row.get("frameSha256") for row in cross_annotation_matches if row.get("frameSha256")}),
            }
        )
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_e085_e088_video_timeline",
        "createdAt": now_iso(),
        "entries": sorted(entries, key=lambda item: (item["timestampMs"], item["candidateId"])),
    }


def frame_provenance(annotation_rows: list[dict[str, Any]], dense_rows: list[dict[str, Any]], video_index: dict[str, Any]) -> dict[str, Any]:
    rows_1437500 = find_timestamp(dense_rows + annotation_rows, 1437500, TELEPORTER_IDS)
    e085_1437500 = [row for row in rows_1437500 if row.get("annotationId") == "E085"]
    e088_1437500 = [row for row in rows_1437500 if row.get("annotationId") == "E088"]
    hashes_by_annotation: dict[str, list[str]] = {}
    for row in rows_1437500:
        hashes_by_annotation.setdefault(row["annotationId"], []).append(row.get("frameSha256"))
    same_hash = bool(e085_1437500 and e088_1437500) and bool(
        {row.get("frameSha256") for row in e085_1437500} & {row.get("frameSha256") for row in e088_1437500}
    )

    wpf_1437 = [
        frame
        for frame in video_index.get("frames", [])
        if int(float(frame.get("requestedVideoTimeSeconds", -1)) * 1000) == 1437000
        or int(float(frame.get("decodedFrameTimeSeconds", -1)) * 1000) == 1437000
    ]

    return {
        "schemaVersion": 1,
        "kind": "match_91119257_e088_frame_provenance",
        "createdAt": now_iso(),
        "uploadedImageClaim": {
            "displayedElement": "teleporter",
            "label": "1437.5s off +7.5s",
            "treatedAsAuthoritativeForVisualContent": True,
            "treatedAsAuthoritativeForAnnotationId": False,
        },
        "timestamp1437500": {
            "belongsToE085DenseEvidence": bool(e085_1437500),
            "belongsToE088DenseEvidence": bool(e088_1437500),
            "sameFrameHashSharedByE085AndE088": same_hash,
            "hashesByAnnotation": hashes_by_annotation,
            "matchingFrames": [frame_digest(row) for row in rows_1437500],
            "provenanceConclusion": "1437.5s is both E085's confirmed representative timestamp and an E088 original-duplicate-window timestamp; it is not sufficient to prove the E088 source row maps to the original interval.",
        },
        "wpfVideoIndexAt1437s": wpf_1437,
        "labelOriginAssessment": {
            "likelyGeneratedFrom": "duplicated original timestamp window shared by E085 and E088",
            "e085DenseContactSheetCompatible": bool(e085_1437500),
            "e088DenseContactSheetCompatible": bool(e088_1437500),
            "copiedOrIncorrectHeadingPossible": True,
            "reason": "The same video frame hash is available under both E085 and E088 at the duplicated source timestamp.",
        },
    }


def nearby_rows(rows: list[dict[str, Any]], start_ms: int, end_ms: int, annotation_ids: list[str] | None = None) -> list[dict[str, Any]]:
    allowed = set(annotation_ids) if annotation_ids else None
    result = []
    for row in rows:
        timestamp = row.get("requestedTimestampMs")
        if timestamp is None:
            continue
        if start_ms <= int(timestamp) <= end_ms and (allowed is None or row.get("annotationId") in allowed):
            result.append(row)
    return sorted(result, key=lambda row: (row.get("requestedTimestampMs"), row.get("annotationId", ""), row.get("requestId", "")))


def make_contact_sheet(name: str, rows: list[dict[str, Any]]) -> str | None:
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    images = []
    seen_paths = set()
    for row in rows:
        path = row.get("framePath")
        if not path or path in seen_paths:
            continue
        seen_paths.add(path)
        image_path = ROOT / path
        if not image_path.exists():
            continue
        image = cv2.imread(str(image_path))
        if image is None:
            continue
        image = cv2.resize(image, (430, 180))
        label = f"{row.get('annotationId')} {int(row.get('requestedTimestampMs', 0)) / 1000:.1f}s {row.get('requestId', '')[:34]}"
        canvas = np.full((220, 430, 3), 255, dtype=np.uint8)
        canvas[:180, :] = image
        cv2.putText(canvas, label, (8, 202), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 1, cv2.LINE_AA)
        images.append(canvas)
    if not images:
        return None
    cols = 3
    rows_count = (len(images) + cols - 1) // cols
    sheet = np.full((rows_count * 220, cols * 430, 3), 255, dtype=np.uint8)
    for index, image in enumerate(images):
        y = (index // cols) * 220
        x = (index % cols) * 430
        sheet[y : y + 220, x : x + 430] = image
    out = LOCAL_DIR / f"{name}.jpg"
    cv2.imwrite(str(out), sheet, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    return rel(out)


def candidate_comparison(annotation_rows: list[dict[str, Any]], dense_rows: list[dict[str, Any]], source_audit: dict[str, Any]) -> dict[str, Any]:
    all_rows = annotation_rows + dense_rows
    around_original = nearby_rows(all_rows, 1430000, 1445000, TELEPORTER_IDS)
    around_corrected = nearby_rows(all_rows, 1490000, 1495000, TELEPORTER_IDS)
    representative = []
    for annotation_id, timestamp in [("E084", 1422500), ("E085", 1437500), ("E086", 1452500), ("E087", 1487500), ("E088", 1437500)]:
        representative.extend(find_timestamp(all_rows, timestamp, [annotation_id]))
    source_windows = nearby_rows(annotation_rows, 1415000, 1495000, SOURCE_IDS)
    contact_sheets = {
        "sourceWindowsE084ToE088": make_contact_sheet("e084_e088_source_windows", source_windows),
        "representativeHumanFrames": make_contact_sheet("e084_e088_representative_human_frames", representative),
        "e088OriginalCandidate1430To1445": make_contact_sheet("e088_original_candidate_1430_1445", around_original),
        "e088CorrectedCandidate1490To1495": make_contact_sheet("e088_corrected_candidate_1490_1495", around_corrected),
    }

    return {
        "schemaVersion": 1,
        "kind": "match_91119257_e088_candidate_comparison",
        "createdAt": now_iso(),
        "contactSheets": contact_sheets,
        "original1430To1445": {
            "frameCount": len(around_original),
            "frames": [frame_digest(row) for row in around_original],
            "assessment": [
                "This window contains E085 source timing and E088 original duplicated timing.",
                "Frames at shared timestamps have identical hashes where both annotations request the same timestamp.",
                "This supports duplicated source timing or reused frame labels, not a distinct E088 mapping by itself.",
            ],
        },
        "corrected1490To1495": {
            "frameCount": len(around_corrected),
            "frames": [frame_digest(row) for row in around_corrected],
            "assessment": [
                "This window follows E087 in source-order chronology.",
                "Task 038 recorded the corrected 24:50-24:55 candidate as visually supported.",
                "It preserves E088 as a distinct enemy underground Teleporter source row rather than a duplicate of E085.",
            ],
        },
        "sourceAuditSignals": source_audit["classification"],
    }


def mapping_decision(source_audit: dict[str, Any], provenance: dict[str, Any], comparison: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    decision = {
        "schemaVersion": 1,
        "kind": "match_91119257_e088_mapping_decision",
        "createdAt": now_iso(),
        "primaryResult": "e088_maps_to_corrected_2450_window",
        "secondaryClassification": "e088_source_row_is_transcription_error",
        "elementIdentity": "confirmed_teleporter",
        "sourceCsvModified": False,
        "decision": {
            "sourceAnnotationRow": "E088",
            "canonicalVideoWindowMs": {"start": 1490000, "end": 1495000},
            "originalCsvWindowMs": {"start": 1430000, "end": 1435000},
            "originalCsvWindowPreservedAsHistoricalEvidence": True,
            "correctedWindowIsOverlayOnly": True,
            "e085Relationship": "distinct_source_row; duplicated timestamp caused frame/provenance overlap with E085",
            "timestamp1437500BelongsTo": "both_E085_and_E088_original_duplicate_window_but_decision_assigns_it_to_E085_for_canonical_E088_mapping",
        },
        "supportingEvidence": [
            "E088 duplicates E085's 23:50-23:55 timestamp exactly but has a different enemy underground Teleporter label.",
            "E088 is source-ordered after E087 (24:40-24:45) but its original timestamp jumps backward to 23:50-23:55.",
            "The source row validation note explicitly identifies the duplicate timestamp and likely 24:50-24:55 correction.",
            "Task 038 recorded the corrected 24:50-24:55 candidate as visually supported while preserving the source row.",
            "The 1437.5s user image label can be explained by the shared duplicated timestamp/frame provenance and is not decisive for row mapping.",
        ],
        "contradictoryOrLimitingEvidence": [
            "The user-confirmed E088 image label is 1437.5s, the same timestamp used by E085.",
            "No video-demo alignment was performed, so this is a source/video annotation correction, not a demo-alignment result.",
        ],
        "inputs": {
            "sourceAudit": "output/match_91119257/e088-source-row-audit.json",
            "frameProvenance": "output/match_91119257/e088-frame-provenance.json",
            "candidateComparison": "output/match_91119257/e088-candidate-comparison.json",
        },
    }
    gate = {
        "schemaVersion": 1,
        "kind": "match_91119257_e088_resolution_gate",
        "createdAt": now_iso(),
        "gate": "e088_mapping_resolved_with_source_correction",
        "primaryResult": decision["primaryResult"],
        "elementIdentity": "confirmed_teleporter",
        "requiresVideoDemoAlignment": False,
        "sourceCsvModified": False,
        "followUpRequirement": "No immediate follow-up required for source/video annotation mapping; future video-demo alignment remains a separate blocked problem if demo timestamps are needed.",
        "replay005Protection": {"processed": False, "status": "preserved"},
    }
    return decision, gate


def write_report(source_audit: dict[str, Any], provenance: dict[str, Any], decision: dict[str, Any], gate: dict[str, Any]) -> None:
    report = f"""# Match 91119257 E088 Timestamp Record Resolution

Date: 2026-06-29

## Scope

Task 043 resolved only the E088 source-row and video timestamp mapping conflict. It did not perform video-demo alignment, did not resume parser recovery, did not process replay 005, and did not modify the source CSV. Teleporter identity remains confirmed.

## Source Row Audit

Rows audited: E083, E084, E085, E086, E087, E088.

E088 duplicates E085's `23:50-23:55` timestamp exactly, but its label is distinct: E085 is the allied Secret Shop surface Teleporter, while E088 is the enemy underground Metro Teleporter between Blue and Green. E088 appears after E087 in source order, yet its timestamp jumps backward by 55 seconds relative to E087's end. The source row already records this as `needs_confirmation` and names `24:50-24:55` as the likely intended value.

## Frame Provenance

At `1437.5s`, the frame evidence is shared by E085 and E088's original duplicated timestamp window. The uploaded image label is therefore authoritative for the visible Teleporter content, but not sufficient to assign the E088 row to the original interval. The label likely came from the duplicated timestamp/contact-sheet provenance rather than independent E088 row mapping.

## Decision

- Primary result: `{decision['primaryResult']}`
- Secondary classification: `{decision['secondaryClassification']}`
- E088 canonical overlay window: `1490.0s-1495.0s`
- Original CSV window preserved: `1430.0s-1435.0s`
- `1437.5s` assignment: `{decision['decision']['timestamp1437500BelongsTo']}`
- Source CSV modified: `{decision['sourceCsvModified']}`
- Gate: `{gate['gate']}`

## Outputs

- `output/match_91119257/e088-source-row-audit.json`
- `output/match_91119257/e085-e088-video-timeline.json`
- `output/match_91119257/e088-frame-provenance.json`
- `output/match_91119257/e088-candidate-comparison.json`
- `output/match_91119257/e088-mapping-decision.json`
- `output/match_91119257/e088-resolution-gate.json`

Local contact sheets were generated under `output-local/match_91119257/e088-resolution/` and are intentionally untracked.
"""
    REPORT_PATH.write_text(report, encoding="utf-8")
    LATEST_REPORT_PATH.write_text(rel(REPORT_PATH) + "\n", encoding="utf-8")


def main() -> None:
    source_rows = load_source_rows()
    annotation_rows = load_jsonl(OUTPUT_DIR / "annotation-frame-manifest.jsonl")
    dense_rows = load_jsonl(OUTPUT_DIR / "dense-review-frame-manifest.jsonl")
    human = read_json(OUTPUT_DIR / "manual-review-human-responses.json")
    video_index = read_json(OUTPUT_DIR / "video-frame-index.json")

    source_audit = source_row_audit(source_rows)
    timeline = build_timeline(annotation_rows, dense_rows, human)
    provenance = frame_provenance(annotation_rows, dense_rows, video_index)
    comparison = candidate_comparison(annotation_rows, dense_rows, source_audit)
    decision, gate = mapping_decision(source_audit, provenance, comparison)

    write_json(OUTPUT_DIR / "e088-source-row-audit.json", source_audit)
    write_json(OUTPUT_DIR / "e085-e088-video-timeline.json", timeline)
    write_json(OUTPUT_DIR / "e088-frame-provenance.json", provenance)
    write_json(OUTPUT_DIR / "e088-candidate-comparison.json", comparison)
    write_json(OUTPUT_DIR / "e088-mapping-decision.json", decision)
    write_json(OUTPUT_DIR / "e088-resolution-gate.json", gate)
    write_report(source_audit, provenance, decision, gate)
    print(json.dumps({"gate": gate["gate"], "primaryResult": decision["primaryResult"], "sourceCsvModified": False}, indent=2))


if __name__ == "__main__":
    main()
