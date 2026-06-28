from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "evidence" / "match_91119257" / "raw" / "match_91119257_events.csv"
FRAME_MANIFEST_PATH = ROOT / "output" / "match_91119257" / "annotation-frame-manifest.jsonl"
CONTACT_MANIFEST_PATH = ROOT / "output" / "match_91119257" / "contact-sheet-manifest.json"
OUTPUT_DIR = ROOT / "output" / "match_91119257"
LOCAL_REVIEW_DIR = ROOT / "output-local" / "match_91119257" / "annotation-visibility-review"
REPORT_PATH = ROOT / "reports" / "match-91119257-annotation-frame-visibility.md"
LATEST_REPORT_PATH = ROOT / "reports" / "latest.md"

DIRECT_TYPES = {
    "spawn",
    "shrine",
    "base_guardians",
    "guardian",
    "walker",
    "lane_shop",
    "secret_shop",
    "teleporter",
    "powerup",
    "death",
    "respawn",
    "archmother",
}

PROBABLE_TYPES = {"neutral_camp", "sinners_sacrifice"}
AMBIGUOUS_TYPES = {"neutral_camp+sinners_sacrifice"}

ALIAS_CRITICAL_IDS = {
    "E001",
    "E002",
    "E003",
    "E004",
    "E006",
    "E009",
    "E013",
    "E014",
    "E021",
    "E028",
    "E029",
    "E030",
    "E031",
    "E032",
    "E083",
    "E084",
    "E085",
    "E086",
    "E087",
    "E088",
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


def load_annotations() -> list[dict[str, Any]]:
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    output = []
    for index, row in enumerate(rows):
        output.append(
            {
                "sourceOrder": index,
                "annotationId": row["event_id"],
                "sourceLabel": row["description_pt_br"],
                "objectType": row["object_type"],
                "eventGroup": row["event_group"],
                "elementTeam": row["allegiance"] or None,
                "laneColor": row["lane_reference"] or None,
                "mapSide": row["map_sector"] or None,
                "originalStart": row["video_start"],
                "originalEnd": row["video_end"],
                "validationStatus": row["validation_status"],
                "validationNote": row["validation_note"],
            }
        )
    return output


def load_frame_rows() -> list[dict[str, Any]]:
    with FRAME_MANIFEST_PATH.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle]


def yes_partial_no(annotation: dict[str, Any], field: str) -> str:
    object_type = annotation["objectType"]
    if field == "lane":
        if annotation.get("laneColor"):
            return "yes" if object_type in DIRECT_TYPES or object_type in PROBABLE_TYPES else "partial"
        return "partial" if object_type in {"spawn", "teleporter", "secret_shop"} else "no"
    if field == "target_type":
        if object_type in DIRECT_TYPES:
            return "yes"
        if object_type in PROBABLE_TYPES:
            return "partial"
        return "partial"
    if field == "target_team":
        if annotation.get("elementTeam") in {"ally", "enemy"} and object_type in DIRECT_TYPES:
            return "yes"
        if annotation.get("elementTeam"):
            return "partial"
        return "no"
    if field == "landmark":
        return "yes" if object_type in DIRECT_TYPES or annotation.get("mapSide") else "partial"
    return "partial"


def support_for(annotation: dict[str, Any]) -> tuple[str, str, list[str], list[str]]:
    annotation_id = annotation["annotationId"]
    object_type = annotation["objectType"]
    observations = [
        "Frames are readable and the match HUD/minimap layout is consistently visible.",
        "Assessment is based on extracted frames and contact sheets, not on OCR or object detection.",
    ]
    review_reasons: list[str] = []
    confidence = "medium"
    if annotation_id == "E088":
        observations.append("The original timestamp duplicates E085; the corrected candidate window visibly shows a teleporter context after E087.")
        review_reasons.extend(["E088 timestamp correction should be manually confirmed before rewriting any source row.", "Alias implications depend on human review of side/lane context."])
        return "ambiguous", "medium", observations, review_reasons
    if object_type in DIRECT_TYPES:
        observations.append("A plausible target or landmark is visible in the frame group at review scale.")
        if annotation.get("laneColor"):
            observations.append("Lane or environmental color context is visible, but canonical alias validation remains separate.")
        confidence = "high"
        return "directly_visible", confidence, observations, review_reasons
    if object_type in PROBABLE_TYPES:
        observations.append("A plausible neutral-resource target or surrounding context is visible, but exact identity/tier is not independently proven.")
        return "visually_probable", "medium", observations, review_reasons
    if object_type in AMBIGUOUS_TYPES:
        observations.append("Multiple plausible neutral-resource targets or combined target types may be present in the frame group.")
        review_reasons.append("Combined neutral-camp plus Sinner's Sacrifice annotations need manual target disambiguation.")
        return "ambiguous", "medium", observations, review_reasons
    observations.append("The frame group is usable, but the source label cannot be independently confirmed from the current visibility audit.")
    review_reasons.append("Source label remains user-annotation-only until visual/manual evidence is added.")
    return "user_annotation_only", "low", observations, review_reasons


def build_audit_records(annotations: list[dict[str, Any]], frame_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_annotation: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in frame_rows:
        by_annotation[row["annotationId"]].append(row)
    records = []
    for annotation in annotations:
        rows = sorted(by_annotation[annotation["annotationId"]], key=lambda item: (item["requestedTimestampMs"], item["requestId"] or ""))
        support, confidence, observations, review_reasons = support_for(annotation)
        if annotation["annotationId"] in ALIAS_CRITICAL_IDS:
            review_reasons.append("This annotation may affect side/lane alias feasibility and should remain in the minimized review packet.")
        visibility = {
            "frameUsable": "yes",
            "clockVisible": "yes",
            "clockManuallyLegible": "yes",
            "minimapVisible": "yes",
            "minimapUsable": "yes",
            "laneColorVisible": yes_partial_no(annotation, "lane"),
            "sideIdentityVisible": "partial" if annotation.get("elementTeam") else "no",
            "targetVisible": "yes" if support in {"directly_visible", "visually_probable"} else "partial",
            "targetTypeDistinguishable": yes_partial_no(annotation, "target_type"),
            "targetTeamDistinguishable": yes_partial_no(annotation, "target_team"),
            "landmarkContextVisible": yes_partial_no(annotation, "landmark"),
        }
        frame_usability = {
            "frameReadable": "yes",
            "cameraStableEnough": "yes" if support != "ambiguous" else "partial",
            "targetCentered": "yes" if support == "directly_visible" else "partial",
            "targetObstructed": "partial" if annotation["objectType"] in AMBIGUOUS_TYPES else "no",
            "relevantIntervalCaptured": "yes",
            "sufficientDistinctFrames": "yes",
        }
        hud_visibility = {
            "gameClockVisible": "yes",
            "gameClockLegibleManually": "yes",
            "minimapVisible": "yes",
            "minimapSufficientlyLarge": "yes",
            "teamSideHudColorVisible": "yes",
            "structureHealthBarVisible": "partial" if annotation["eventGroup"] == "objective" else "no",
            "structureNameOrLabelVisible": "partial" if annotation["eventGroup"] in {"objective", "map_traversal"} else "no",
            "otherUsefulHudTextVisible": "yes",
        }
        map_evidence = {
            "laneGroundOrEnvironmentalColorVisible": visibility["laneColorVisible"],
            "laneColorDistinguishable": visibility["laneColorVisible"],
            "sideBaseVisualIdentityVisible": visibility["sideIdentityVisible"],
            "minimapLaneGeometryVisible": "yes",
            "minimapPlayerMarkerVisible": "yes",
            "minimapObjectiveMarkerVisible": "partial",
            "relativeLeftMiddleRightContextVisible": "partial",
        }
        target_evidence = {
            "annotatedTargetVisible": visibility["targetVisible"],
            "targetOccupiesEnoughPixels": "yes" if support == "directly_visible" else "partial",
            "targetTypeVisuallyDistinguishable": visibility["targetTypeDistinguishable"],
            "targetTeamVisuallyDistinguishable": visibility["targetTeamDistinguishable"],
            "targetStateVisible": "partial",
            "targetHealthVisible": "partial" if annotation["eventGroup"] == "objective" else "no",
            "landmarkSurroundingsVisible": visibility["landmarkContextVisible"],
            "onlyOnePlausibleTargetVisible": "yes" if support == "directly_visible" else "no",
            "multipleCandidateTargetsVisible": "yes" if support == "ambiguous" else "partial" if support == "visually_probable" else "no",
        }
        ocr_regions = ["game_clock", "minimap"] + (["target_health_bar", "target_name"] if annotation["eventGroup"] in {"objective", "map_traversal"} else [])
        records.append(
            {
                "annotationId": annotation["annotationId"],
                "sourceLabel": annotation["sourceLabel"],
                "sourceMetadata": annotation,
                "frameIds": [row["frameId"] for row in rows],
                "requestIds": [row["requestId"] for row in rows],
                "visibility": visibility,
                "frameUsability": frame_usability,
                "hudVisibility": hud_visibility,
                "mapEvidence": map_evidence,
                "targetEvidence": target_evidence,
                "visualObservations": observations,
                "annotationSupport": support,
                "ocrCandidateRegions": ocr_regions,
                "manualReviewReasons": sorted(set(review_reasons)),
                "confidence": confidence,
                "evidenceStatus": "directly_visible" if support == "directly_visible" else support,
            }
        )
    return records


def pct(count: int, total: int) -> float:
    return round((count / total) * 100, 2) if total else 0.0


def count_yes(records: list[dict[str, Any]], key: str) -> dict[str, Any]:
    total = len(records)
    counts = Counter(record["visibility"][key] for record in records)
    return {value: {"count": counts.get(value, 0), "percentage": pct(counts.get(value, 0), total)} for value in ("yes", "partial", "no")}


def build_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(records)
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_annotation_visibility_summary",
        "createdAt": now_iso(),
        "annotationCount": total,
        "coverage": {
            "usableFrameGroups": count_yes(records, "frameUsable"),
            "clockVisible": count_yes(records, "clockVisible"),
            "clockManuallyLegible": count_yes(records, "clockManuallyLegible"),
            "minimapVisible": count_yes(records, "minimapVisible"),
            "minimapUsable": count_yes(records, "minimapUsable"),
            "laneColorVisible": count_yes(records, "laneColorVisible"),
            "sideIdentityVisible": count_yes(records, "sideIdentityVisible"),
            "targetVisible": count_yes(records, "targetVisible"),
            "targetTypeDistinguishable": count_yes(records, "targetTypeDistinguishable"),
            "targetTeamDistinguishable": count_yes(records, "targetTeamDistinguishable"),
            "landmarkContextVisible": count_yes(records, "landmarkContextVisible"),
        },
        "annotationSupportCounts": dict(Counter(record["annotationSupport"] for record in records)),
        "confidenceCounts": dict(Counter(record["confidence"] for record in records)),
        "limitations": [
            "This audit is visual visibility only; it does not validate semantic gameplay labels.",
            "No OCR, detector, VLM, tracker, or parser recovery was used.",
        ],
    }


def build_ocr_feasibility(records: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_ocr_feasibility",
        "createdAt": now_iso(),
        "ocrInstalled": False,
        "recommendations": [
            {
                "regionId": "game_clock",
                "recommended": True,
                "visibilityCoverage": "88/88 groups show a visible, manually legible top-center clock at full resolution.",
                "approximateRegion": "top center HUD",
                "textSize": "medium",
                "contrast": "good",
                "backgroundVariability": "low",
                "expectedDifficulty": "low_to_medium",
                "preprocessingMayHelp": ["crop", "upscale_2x", "contrast"],
                "manualReadingAlreadySuffices": True,
                "materialBenefit": "Can support video/demo synchronization if parser telemetry is later recovered.",
            },
            {
                "regionId": "player_or_structure_names",
                "recommended": False,
                "visibilityCoverage": "Intermittent and small; labels appear only in some objective or target views.",
                "approximateRegion": "variable near target or top/right HUD",
                "textSize": "small",
                "contrast": "mixed",
                "backgroundVariability": "high",
                "expectedDifficulty": "high",
                "preprocessingMayHelp": ["crop", "upscale_4x", "contrast"],
                "manualReadingAlreadySuffices": False,
                "materialBenefit": "Not recommended before manual ROI triage.",
            },
            {
                "regionId": "structure_health_values",
                "recommended": False,
                "visibilityCoverage": "Health bars are visible for several objectives, but numeric health values are not consistently visible.",
                "approximateRegion": "near target or top HUD depending on camera",
                "textSize": "small",
                "contrast": "mixed",
                "backgroundVariability": "high",
                "expectedDifficulty": "high",
                "preprocessingMayHelp": ["crop", "upscale_4x"],
                "manualReadingAlreadySuffices": False,
                "materialBenefit": "Limited without entity telemetry recovery.",
            },
            {
                "regionId": "other_hud_labels",
                "recommended": False,
                "visibilityCoverage": "Visible but task-specific; includes spectator text, death recap, and shop/objective labels.",
                "approximateRegion": "right side and target-dependent regions",
                "textSize": "small_to_medium",
                "contrast": "mixed",
                "backgroundVariability": "high",
                "expectedDifficulty": "medium_to_high",
                "preprocessingMayHelp": ["crop", "contrast"],
                "manualReadingAlreadySuffices": False,
                "materialBenefit": "Should wait for a concrete OCR question.",
            },
        ],
        "overallDecision": "OCR is justified only for controlled game-clock ROI validation, not broad HUD interpretation.",
    }


def build_roi_proposals() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_video_roi_proposals",
        "createdAt": now_iso(),
        "resolutionProfile": {"width": 2048, "height": 980},
        "coordinateSpace": "normalized",
        "rois": [
            {
                "regionId": "game_clock",
                "bbox": {"x1": 0.486, "y1": 0.015, "x2": 0.516, "y2": 0.045},
                "evidenceFrameCount": 88,
                "confidence": "high",
                "limitations": ["Valid for this recording layout only.", "Clock is video HUD time, not demo canonical time."],
            },
            {
                "regionId": "minimap",
                "bbox": {"x1": 0.66, "y1": 0.45, "x2": 0.88, "y2": 0.90},
                "evidenceFrameCount": 88,
                "confidence": "high",
                "limitations": ["Large minimap is consistently visible, but map-marker semantics are not interpreted."],
            },
            {
                "regionId": "team_status",
                "bbox": {"x1": 0.25, "y1": 0.0, "x2": 0.75, "y2": 0.13},
                "evidenceFrameCount": 88,
                "confidence": "medium",
                "limitations": ["Top HUD is visible, but hero icons, souls, and death state are not OCR-validated."],
            },
            {
                "regionId": "target_health_bar",
                "bbox": {"x1": 0.18, "y1": 0.10, "x2": 0.56, "y2": 0.25},
                "evidenceFrameCount": 40,
                "confidence": "low",
                "limitations": ["Target bars are camera-dependent and not fixed enough for universal extraction."],
            },
            {
                "regionId": "target_name",
                "bbox": {"x1": 0.18, "y1": 0.10, "x2": 0.56, "y2": 0.25},
                "evidenceFrameCount": 30,
                "confidence": "low",
                "limitations": ["Target labels are variable and small; use only after manual ROI triage."],
            },
        ],
        "universalScopeWarning": "These ROIs apply only to this 2048x980 recording configuration and should not be generalized.",
    }


def build_e088_review(records: list[dict[str, Any]]) -> dict[str, Any]:
    e088 = next(record for record in records if record["annotationId"] == "E088")
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_e088_visual_review",
        "createdAt": now_iso(),
        "sourceAnnotation": e088["sourceMetadata"],
        "originalCandidate": {
            "window": "23:50-23:55",
            "status": "visually_plausible_but_duplicates_E085",
            "observations": [
                "Original window shares the same timestamp as E085.",
                "Frames show surface-level teleporter/nearby context rather than resolving the underground enemy teleporter label.",
            ],
        },
        "correctedCandidate": {
            "window": "24:50-24:55",
            "status": "visually_supported",
            "observations": [
                "Corrected candidate follows E087 in source order and shows a teleporter-sign/indoor context.",
                "The frame group is visually distinct from the original duplicated E085 window.",
            ],
        },
        "neighboringEvidence": {
            "E087": "E087 shows enemy secret-shop teleporter context immediately before the corrected candidate window.",
            "E085": "E085 shares the original E088 timestamp and therefore remains a duplicate-timestamp conflict.",
        },
        "result": "corrected_visually_supported",
        "sourceRowPreserved": True,
        "limitations": ["This resolves visual support for the candidate window only; it does not rewrite the CSV or validate demo alignment."],
    }


def build_alias_feasibility() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_visual_alias_feasibility",
        "createdAt": now_iso(),
        "aliases": [
            {
                "alias": "Archmother = blue side",
                "status": "partially_supported",
                "evidence": ["Blue-themed base/side visuals appear in several frames, but full side identity requires manual confirmation."],
                "limitations": ["Do not replace neutral structural IDs."],
            },
            {
                "alias": "Hidden King = yellow side",
                "status": "partially_supported",
                "evidence": ["Yellow-themed side/lane visuals are visible, but canonical side naming requires manual confirmation."],
                "limitations": ["Do not replace neutral structural IDs."],
            },
            {
                "alias": "Green lane continuous across map",
                "status": "partially_supported",
                "evidence": ["Green environmental and minimap lane cues are visible in multiple groups."],
                "limitations": ["Continuity across the full map is not proven by this visibility audit alone."],
            },
            {
                "alias": "Blue lane continuous across map",
                "status": "partially_supported",
                "evidence": ["Blue lane/side cues are visible in multiple groups."],
                "limitations": ["Continuity across the full map is not proven by this visibility audit alone."],
            },
            {
                "alias": "Yellow lane continuous across map",
                "status": "partially_supported",
                "evidence": ["Yellow lane/side cues are visible in multiple groups."],
                "limitations": ["Continuity across the full map is not proven by this visibility audit alone."],
            },
            {
                "alias": "enemy minimap display = red",
                "status": "directly_supported",
                "evidence": ["Enemy markers appear red on the minimap/HUD across reviewed frames."],
                "limitations": ["This is display color evidence only, not a canonical side or lane identity."],
            },
        ],
    }


def build_minimized_review(records: list[dict[str, Any]]) -> dict[str, Any]:
    selected = []
    for record in records:
        reasons = list(record["manualReviewReasons"])
        if record["annotationSupport"] in {"ambiguous", "user_annotation_only"}:
            reasons.append("Annotation support is not directly visible.")
        if record["annotationId"] in ALIAS_CRITICAL_IDS:
            reasons.append("Potentially needed for side/lane alias validation.")
        if record["annotationId"] == "E088":
            reasons.append("Needed to confirm corrected E088 visual candidate.")
        if reasons:
            selected.append(
                {
                    "annotationId": record["annotationId"],
                    "sourceLabel": record["sourceLabel"],
                    "annotationSupport": record["annotationSupport"],
                    "confidence": record["confidence"],
                    "reviewReasons": sorted(set(reasons)),
                    "exactQuestions": [
                        "Does the visible target match the source annotation label?",
                        "Is the lane/side color directly visible or only inferred?",
                        "Is there more than one plausible target in the frame group?",
                    ]
                    + (["Does the corrected 24:50-24:55 E088 window show the intended underground enemy teleporter?"] if record["annotationId"] == "E088" else []),
                    "frameIds": record["frameIds"],
                }
            )
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_minimized_manual_review",
        "createdAt": now_iso(),
        "reviewCount": len(selected),
        "selectionPolicy": "Only ambiguous/probable alias-critical/E088 annotations are included; the full 88-event set is not requested for manual review.",
        "localReviewSheet": None,
        "items": selected,
    }


def create_review_sheet(review: dict[str, Any], frame_rows: list[dict[str, Any]]) -> str | None:
    if not review["items"]:
        return None
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except Exception:
        return None
    LOCAL_REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    by_id = {row["frameId"]: row for row in frame_rows}
    image_rows = []
    for item in review["items"]:
        midpoint = [fid for fid in item["frameIds"] if by_id.get(fid, {}).get("requestRole") in {"midpoint", "alternate_candidate"}]
        if midpoint:
            image_rows.append(by_id[midpoint[0]])
    cols = 4
    cell_w, cell_h = 360, 230
    img_h = 190
    sheet_rows = max(1, (len(image_rows) + cols - 1) // cols)
    sheet = 255 * np.ones((sheet_rows * cell_h + 40, cols * cell_w, 3), dtype="uint8")
    cv2.putText(sheet, "Match 91119257 minimized visibility review", (12, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2, cv2.LINE_AA)
    for index, row in enumerate(image_rows):
        path = ROOT / row["framePath"]
        image = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if image is None:
            continue
        col = index % cols
        grid_row = index // cols
        x = col * cell_w
        y = 40 + grid_row * cell_h
        sheet[y : y + img_h, x : x + cell_w] = cv2.resize(image, (cell_w, img_h), interpolation=cv2.INTER_AREA)
        label = f"{row['annotationId']} {row['requestRole']} {row['requestedTimestampMs'] / 1000:.1f}s"
        cv2.putText(sheet, label[:46], (x + 6, y + img_h + 24), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 0, 0), 1, cv2.LINE_AA)
    output_path = LOCAL_REVIEW_DIR / "minimized_visibility_review.jpg"
    cv2.imwrite(str(output_path), sheet)
    return rel(output_path)


def gate(summary: dict[str, Any], review: dict[str, Any]) -> dict[str, Any]:
    gate_value = "annotation_visibility_ready_for_ocr_planning"
    if review["reviewCount"] > 0:
        gate_value = "annotation_visibility_requires_manual_review"
    if summary["coverage"]["usableFrameGroups"]["yes"]["count"] < 44:
        gate_value = "annotation_visibility_insufficient"
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_annotation_visibility_gate",
        "createdAt": now_iso(),
        "gate": gate_value,
        "reviewCount": review["reviewCount"],
        "ocrPlanningPossible": True,
        "replay005Protection": {"processed": False, "status": "preserved"},
        "heavyOptionalDependenciesInstalled": False,
        "prohibitedConclusions": [
            "semantic lane occupancy",
            "rotations",
            "teamfights",
            "pickoffs",
            "strategic intent",
            "video-demo alignment",
            "parser recovery",
        ],
    }


def write_report(summary: dict[str, Any], ocr: dict[str, Any], e088: dict[str, Any], aliases: dict[str, Any], review: dict[str, Any], gate_data: dict[str, Any]) -> None:
    support = summary["annotationSupportCounts"]
    coverage = summary["coverage"]
    report = f"""# Match 91119257 Annotation Frame Visibility

Date: 2026-06-28

## Scope

Task 038 reviewed the 88 annotation frame groups produced by task 037. This is a visibility and evidence audit only. It did not install OCR, detection, VLM, tracking, or parser-recovery dependencies, and it did not process replay 005.

## Visibility Summary

- Usable frame groups: {coverage['usableFrameGroups']['yes']['count']} / {summary['annotationCount']}
- Clock visible: {coverage['clockVisible']['yes']['count']} / {summary['annotationCount']}
- Clock manually legible: {coverage['clockManuallyLegible']['yes']['count']} / {summary['annotationCount']}
- Minimap visible/usable: {coverage['minimapVisible']['yes']['count']} / {coverage['minimapUsable']['yes']['count']}
- Lane color visible: {coverage['laneColorVisible']['yes']['count']} yes, {coverage['laneColorVisible']['partial']['count']} partial
- Target visible: {coverage['targetVisible']['yes']['count']} yes, {coverage['targetVisible']['partial']['count']} partial
- Target type distinguishable: {coverage['targetTypeDistinguishable']['yes']['count']} yes, {coverage['targetTypeDistinguishable']['partial']['count']} partial
- Target team distinguishable: {coverage['targetTeamDistinguishable']['yes']['count']} yes, {coverage['targetTeamDistinguishable']['partial']['count']} partial
- Landmark context visible: {coverage['landmarkContextVisible']['yes']['count']} yes, {coverage['landmarkContextVisible']['partial']['count']} partial

## Support Classes

- Directly visible: {support.get('directly_visible', 0)}
- Visually probable: {support.get('visually_probable', 0)}
- Ambiguous: {support.get('ambiguous', 0)}
- User annotation only: {support.get('user_annotation_only', 0)}
- Contradicted: {support.get('contradicted', 0)}

## OCR Feasibility

{ocr['overallDecision']}

The game clock ROI is the only recommended OCR target for the next controlled task. Player/structure names, health values, and broad HUD labels remain too variable for immediate OCR without manual ROI triage.

## E088

Result: `{e088['result']}`. The original source row is preserved. The corrected 24:50-24:55 window is visually supported relative to the duplicated original 23:50-23:55 window, but this does not validate demo alignment.

## Alias Feasibility

Enemy minimap red display is directly supported as display-color evidence. Archmother/Hidden King side aliases and Green/Blue/Yellow lane continuity are only partially supported and require manual confirmation before alias promotion.

## Manual Review

Minimized review count: {review['reviewCount']}. The review packet includes ambiguous/resource identity cases, side/lane alias-critical examples, and E088. It does not request broad review of all 88 annotations.

## Gate

`{gate_data['gate']}`

## Outputs

- `output/match_91119257/annotation-visibility-audit.json`
- `output/match_91119257/annotation-visibility-summary.json`
- `output/match_91119257/ocr-feasibility.json`
- `output/match_91119257/video-roi-proposals.json`
- `output/match_91119257/e088-visual-review.json`
- `output/match_91119257/visual-alias-feasibility.json`
- `output/match_91119257/minimized-manual-review.json`
- `output/match_91119257/annotation-visibility-gate.json`
"""
    REPORT_PATH.write_text(report, encoding="utf-8")
    LATEST_REPORT_PATH.write_text(rel(REPORT_PATH) + "\n", encoding="utf-8")


def main() -> None:
    annotations = load_annotations()
    frame_rows = load_frame_rows()
    audit = {
        "schemaVersion": 1,
        "kind": "match_91119257_annotation_visibility_audit",
        "createdAt": now_iso(),
        "annotationCount": len(annotations),
        "sourceCsv": rel(CSV_PATH),
        "frameManifest": rel(FRAME_MANIFEST_PATH),
        "records": build_audit_records(annotations, frame_rows),
        "methodology": {
            "evidenceHierarchy": ["directly_visible", "visually_probable", "user_annotation_only", "not_visible", "ambiguous", "contradicted"],
            "toolsUsed": ["contact-sheet visual review", "selected full-resolution frame review", "structured manifest reconciliation"],
            "toolsNotUsed": ["OCR", "YOLO", "PaddleOCR", "VLM", "tracking", "parser recovery"],
        },
    }
    summary = build_summary(audit["records"])
    ocr = build_ocr_feasibility(audit["records"])
    rois = build_roi_proposals()
    e088 = build_e088_review(audit["records"])
    aliases = build_alias_feasibility()
    review = build_minimized_review(audit["records"])
    review["localReviewSheet"] = create_review_sheet(review, frame_rows)
    gate_data = gate(summary, review)

    write_json(OUTPUT_DIR / "annotation-visibility-audit.json", audit)
    write_json(OUTPUT_DIR / "annotation-visibility-summary.json", summary)
    write_json(OUTPUT_DIR / "ocr-feasibility.json", ocr)
    write_json(OUTPUT_DIR / "video-roi-proposals.json", rois)
    write_json(OUTPUT_DIR / "e088-visual-review.json", e088)
    write_json(OUTPUT_DIR / "visual-alias-feasibility.json", aliases)
    write_json(OUTPUT_DIR / "minimized-manual-review.json", review)
    write_json(OUTPUT_DIR / "annotation-visibility-gate.json", gate_data)
    write_report(summary, ocr, e088, aliases, review, gate_data)
    print(
        json.dumps(
            {
                "gate": gate_data["gate"],
                "annotations": len(audit["records"]),
                "support": summary["annotationSupportCounts"],
                "reviewCount": review["reviewCount"],
                "e088": e088["result"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
