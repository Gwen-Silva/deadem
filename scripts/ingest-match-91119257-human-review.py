from __future__ import annotations

import csv
import json
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "match_91119257"
REPORT_PATH = ROOT / "reports" / "match-91119257-human-visual-review-final.md"
LATEST_REPORT_PATH = ROOT / "reports" / "latest.md"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def rel(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


HUMAN_DECISIONS: dict[str, dict[str, Any]] = {
    "E001": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [22500],
        "representativeOffsetsMs": [7500],
        "elementType": "spawn",
        "mapSide": "hidden_king",
        "laneColor": None,
        "elementTeam": "ally",
        "confidence": "high",
        "evidenceClass": "directly_visible_and_user_known",
        "observations": [
            "Allied Hidden King base.",
            "Three ziplines converge toward the player's position.",
            "Hidden King is visible in the background.",
            "A shop is behind the player.",
            "The player is in the southern-central base region.",
        ],
    },
    "E002": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [34000, 34500, 35000],
        "representativeOffsetsMs": [9000, 9500, 10000],
        "elementType": "shrine",
        "mapSide": "hidden_king",
        "laneColor": "yellow",
        "elementTeam": "ally",
        "relativePosition": "left_of_base",
        "confidence": "high",
        "observations": [
            "Speaker-like tower with health bar.",
            "Emits circular waves.",
            "Located on the left side of the Hidden King base.",
            "Associated with Yellow lane.",
            "Player position is visible on the minimap.",
        ],
    },
    "E003": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [52500],
        "representativeOffsetsMs": [7500],
        "elementType": "shrine",
        "mapSide": "hidden_king",
        "laneColor": "green",
        "elementTeam": "ally",
        "relativePosition": "right_of_base",
        "confidence": "high",
        "observations": [
            "Same speaker-like Shrine type.",
            "Emits circular waves.",
            "Located on the right side of the Hidden King base.",
            "Associated with Green lane.",
        ],
    },
    "E004": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [67500],
        "representativeOffsetsMs": [7500],
        "elementType": "base_guardian_pair",
        "mapSide": "hidden_king",
        "laneColor": "yellow",
        "elementTeam": "ally",
        "confidence": "high",
        "observations": [
            "Two tall structures side by side.",
            "Viewed from behind.",
            "Health bars visible.",
            "Protect an entrance or exit crossed by Yellow lane.",
        ],
    },
    "E006": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [87500],
        "representativeOffsetsMs": [7500],
        "elementType": "base_guardian_pair",
        "mapSide": "hidden_king",
        "laneColor": "green",
        "elementTeam": "ally",
        "confidence": "high",
        "observations": [
            "Two tall structures side by side.",
            "Health bars visible.",
            "Protect an entrance or exit crossed by Green lane.",
        ],
    },
    "E009": {
        "responseStatus": "confirmed",
        "representativeVisualIntervalMs": {"start": 144000, "end": 148500},
        "representativeOffsetsMs": {"start": 9000, "end": 13500},
        "elementType": "curiosity_shop",
        "mapSide": "hidden_king",
        "laneColor": "yellow",
        "elementTeam": "ally",
        "confidence": "high",
        "observations": [
            "Stall-like structure.",
            "Green arrow pointing toward it.",
            "Sign reads Curiosity Shop.",
            "Round yellow lamps surround the sign.",
            "Tank or barrel on the right.",
            "Appears mounted on wheels.",
            "Small front staircase.",
        ],
    },
    "E013": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [212500],
        "additionalUsefulTimestampsMs": [211000],
        "representativeOffsetsMs": [7500],
        "elementType": "walker",
        "laneColor": "green",
        "confidence": "high",
        "observations": [
            "Large gray four-legged structure.",
            "Rounded circular and oval shapes.",
            "Health bar visible.",
            "Brown circular frontal component.",
            "White translucent aura.",
            "White range circle on the ground.",
            "Green lane line passes under it.",
            "Green lane zipline visible above.",
        ],
    },
    "E014": {
        "responseStatus": "confirmed",
        "representativeVisualIntervalMs": {"start": 223500, "end": 225000},
        "additionalUsefulTimestampsMs": [222500],
        "representativeOffsetsMs": {"start": 8500, "end": 10000},
        "elementType": "guardian",
        "confidence": "medium_high",
        "observations": [
            "Gray humanoid statue.",
            "Arms and legs visible.",
            "Head resembles an iron bowl or brazier.",
            "Holds a large staff.",
            "Approximately two to three times the size of a hero.",
        ],
    },
    "E021": {
        "responseStatus": "confirmed",
        "representativeVisualIntervalMs": {"start": 367500, "end": 372500},
        "additionalUsefulTimestampsMs": [365500],
        "representativeOffsetsMs": {"start": 2500, "end": 7500},
        "elementType": "guardian",
        "elementTeam": "enemy",
        "confidence": "high",
        "observations": [
            "Same humanoid Guardian type as E014.",
            "Viewed from the side.",
            "Fires a fire beam at the player.",
            "Red health bar visible.",
            "Player is positioned above the enemy shop, visible to the right.",
        ],
    },
    "E028": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [570000, 572500],
        "representativeOffsetsMs": [5000, 7500],
        "elementType": "shrine",
        "mapSide": "archmother",
        "laneColor": "green",
        "elementTeam": "enemy",
        "relativePosition": "right_of_lane",
        "confidence": "high",
        "observations": [
            "Blue pillar with an open blue book.",
            "Book projects light and an inverted light-blue triangle hologram.",
            "Red health bar visible.",
            "Inside the enemy base.",
        ],
    },
    "E029": {
        "responseStatus": "confirmed",
        "representativeVisualIntervalMs": {"start": 585000, "end": 586500},
        "representativeOffsetsMs": {"start": 5000, "end": 6500},
        "elementType": "shrine",
        "mapSide": "archmother",
        "laneColor": "yellow",
        "elementTeam": "enemy",
        "relativePosition": "left_of_lane",
        "confidence": "high",
        "observations": [
            "Same Archmother Shrine as E028.",
            "Viewed from behind and from the side.",
            "Located inside the enemy base.",
        ],
    },
    "E030": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [597500, 598000, 600000, 607500],
        "elementType": "patron",
        "mapSide": "archmother",
        "elementTeam": "enemy",
        "confidence": "high",
        "observations": [
            "Central Archmother statue.",
            "Spiritual translucent Archmother form surrounds it.",
            "Spiritual form extends toward the ceiling with arms open.",
            "Light-blue magical circles and symbols on the ground.",
            "Low walls and blue obelisks with light-blue symbols.",
        ],
    },
    "E031": {
        "responseStatus": "confirmed",
        "representativeVisualIntervalMs": {"start": 614500, "end": 615000},
        "representativeOffsetsMs": {"start": 9500, "end": 10000},
        "elementType": "player_death",
        "confidence": "high",
        "observations": [
            "Health reaches zero.",
            "Respawn countdown appears at screen center.",
            "Screen becomes gray.",
            "Red splashes appear in all four corners.",
        ],
    },
    "E032": {
        "responseStatus": "partially_confirmed",
        "representativeVisualIntervalMs": {"start": 622500, "end": 627500},
        "representativeOffsetsMs": {"start": 2500, "end": 7500},
        "elementType": "dead_player_spirit_at_spawn",
        "confidence": "high_for_dead_state_low_for_respawn_instant",
        "observations": [
            "Player appears as a green-tinted spirit at spawn.",
            "Green soul or aura rises from the body.",
            "Black smoke surrounds the lower body.",
            "No selected frame shows the exact respawn instant.",
        ],
        "userContextOnly": ["On respawn, the normal-colored body appears at the same position."],
        "unresolved": ["exact_respawn_frame"],
    },
    "E050": {
        "responseStatus": "confirmed",
        "representativeVisualIntervalMs": {"start": 873500, "end": 875000},
        "additionalUsefulTimestampsMs": [872500],
        "representativeOffsetsMs": {"start": 8500, "end": 10000},
        "elementType": "medium_denizen_and_sinners_sacrifice_camp",
        "confidence": "high",
        "observations": [
            "Two Medium Denizens on the left.",
            "Yellow circles under them.",
            "Health bars above them.",
            "Sinner's Sacrifice on the right.",
            "Copper rectangular machine resembling a gacha machine.",
            "Blue-green soul-like balls inside.",
            "Four black feet.",
            "Sign reads Sinner's Sacrifice.",
            "Round lights activate sequentially.",
            "Green ritual field with lit green candles.",
        ],
    },
    "E060": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [1012500],
        "representativeOffsetsMs": [7500],
        "elementType": "medium_denizen_and_sinners_sacrifice_camp",
        "confidence": "high",
        "observations": ["Same camp composition and visual characteristics as E050."],
    },
    "E077": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [1282000, 1282500],
        "representativeOffsetsMs": [7000, 7500],
        "elementType": "medium_denizen_and_sinners_sacrifice_camp",
        "confidence": "high",
        "observations": ["Same camp composition as E050.", "Seen from another angle."],
    },
    "E081": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [1364500],
        "representativeOffsetsMs": [9500],
        "elementType": "medium_denizen_and_sinners_sacrifice_camp",
        "confidence": "high",
        "observations": ["Sinner's Sacrifice is on the left.", "Medium Denizens are on the right."],
    },
    "E083": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [1395000],
        "additionalUsefulTimestampsMs": [1394500],
        "representativeOffsetsMs": [10000],
        "elementType": "bridge_buff_crystal",
        "buffColor": "purple",
        "confidence": "high_for_visual_identity",
        "observations": [
            "Floating crystal above a circular base at the center of a bridge.",
            "Purple color.",
            "Vertical light beam.",
            "White symbol inside.",
        ],
        "userContextOnly": ["Purple version increases spirit power."],
    },
    "E084": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [1422500],
        "representativeOffsetsMs": [7500],
        "elementType": "bridge_buff_crystal",
        "buffColor": "green",
        "laneColor": "green",
        "confidence": "high",
        "observations": [
            "Green crystal above Green bridge.",
            "White internal symbol.",
            "Same general visual characteristics as E083.",
        ],
        "unresolved": ["specific_green_buff_effect"],
    },
    "E085": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [1437500],
        "representativeOffsetsMs": [7500],
        "elementType": "teleporter",
        "confidence": "high",
        "observations": [
            "Located near the Secret Shop area.",
            "Entry resembles an elevator cabin.",
            "Large sign reads TELEPORTER.",
        ],
    },
    "E086": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [1452500],
        "representativeOffsetsMs": [7500],
        "elementType": "teleporter",
        "confidence": "high",
        "observations": ["Same visual identity as E085."],
    },
    "E087": {
        "responseStatus": "confirmed",
        "representativeVisualTimestampsMs": [1487500],
        "representativeOffsetsMs": [7500],
        "elementType": "teleporter",
        "confidence": "high",
        "observations": ["Same visual identity as E085."],
    },
    "E088": {
        "responseStatus": "confirmed_with_timestamp_conflict",
        "representativeVisualTimestampsMs": [1437500],
        "reportedRepresentativeOffsetMs": [7500],
        "elementType": "teleporter",
        "confidence": "high_for_element_identity",
        "evidenceClass": "directly_visible",
        "observations": [
            "Uploaded image clearly shows the TELEPORTER sign.",
            "Elevator-like cabin is visible.",
            "Minimap and gameplay context remain visible.",
        ],
        "conflict": {
            "type": "timestamp_or_record_mapping_conflict",
            "details": [
                "The user identifies 1437.5s as the best E088 frame.",
                "The same timestamp was also used for E085.",
                "Previous task 038 evidence associated E088 with a corrected 24:50-24:55 candidate window.",
                "Do not silently overwrite either source.",
            ],
        },
        "resolution": {
            "elementIdentity": "confirmed",
            "sourceRecordTimestampMapping": "unresolved",
        },
    },
}


E005_RECORD = {
    "annotationId": "E005",
    "sourceStatus": "exists_in_source_csv",
    "reviewStatus": "not_selected_for_task038_minimized_review",
    "humanReviewStatus": "not_required_in_current_24_case_ingestion",
}


def load_dense_manifest() -> dict[str, dict[int, list[dict[str, Any]]]]:
    by_annotation: dict[str, dict[int, list[dict[str, Any]]]] = {}
    with (OUTPUT_DIR / "dense-review-frame-manifest.jsonl").open(encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            by_annotation.setdefault(row["annotationId"], {}).setdefault(row["requestedTimestampMs"], []).append(row)
    return by_annotation


def all_representative_timestamps(decision: dict[str, Any]) -> list[int]:
    timestamps = list(decision.get("representativeVisualTimestampsMs", []))
    interval = decision.get("representativeVisualIntervalMs")
    if interval:
        timestamps.extend([interval["start"], interval["end"]])
    timestamps.extend(decision.get("additionalUsefulTimestampsMs", []))
    return sorted(set(timestamps))


def representative_interval(decision: dict[str, Any]) -> dict[str, Any]:
    if "representativeVisualIntervalMs" in decision:
        return {"type": "interval", **decision["representativeVisualIntervalMs"]}
    timestamps = decision.get("representativeVisualTimestampsMs", [])
    return {"type": "timestamps", "timestampsMs": timestamps}


def offset_values(decision: dict[str, Any], source_start: int) -> list[int]:
    offsets = decision.get("representativeOffsetsMs")
    if isinstance(offsets, list):
        return offsets
    if isinstance(offsets, dict):
        return [offsets["start"], offsets["end"]]
    reported = decision.get("reportedRepresentativeOffsetMs")
    if isinstance(reported, list):
        return reported
    return [timestamp - source_start for timestamp in all_representative_timestamps(decision)]


def resolve_frames(annotation_id: str, decision: dict[str, Any], dense: dict[str, dict[int, list[dict[str, Any]]]]) -> list[dict[str, Any]]:
    frames = []
    for timestamp in all_representative_timestamps(decision):
        rows = dense.get(annotation_id, {}).get(timestamp, [])
        for row in rows:
            frames.append(
                {
                    "requestedTimestampMs": timestamp,
                    "frameId": row["frameId"],
                    "requestId": row["requestId"],
                    "framePath": row["framePath"],
                    "frameSha256": row["frameSha256"],
                    "decodeStatus": row["decodeStatus"],
                    "decodedTimestampMs": row["decodedTimestampMs"],
                    "timestampErrorMs": row["timestampErrorMs"],
                    "denseWindowKind": row["denseWindowKind"],
                }
            )
    return frames


def build_records() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    form = read_json(OUTPUT_DIR / "manual-review-form-v2.json")
    summary = read_json(OUTPUT_DIR / "dense-review-annotation-summary.json")
    e088_prior = read_json(OUTPUT_DIR / "e088-visual-review.json")
    dense = load_dense_manifest()

    source_by_id = {record["annotationId"]: record for record in form["records"]}
    summary_by_id = {record["annotationId"]: record for record in summary["annotations"]}
    records = []
    missing_frame_lookups = []

    for annotation_id in sorted(HUMAN_DECISIONS):
        source_record = source_by_id[annotation_id]
        source_annotation = source_record["sourceAnnotation"]
        decision = HUMAN_DECISIONS[annotation_id]
        frames = resolve_frames(annotation_id, decision, dense)
        expected_timestamps = all_representative_timestamps(decision)
        found_timestamps = sorted({frame["requestedTimestampMs"] for frame in frames})
        missing = [timestamp for timestamp in expected_timestamps if timestamp not in found_timestamps]
        if missing:
            missing_frame_lookups.append({"annotationId": annotation_id, "missingTimestampsMs": missing})

        record = {
            "annotationId": annotation_id,
            "reviewId": source_record["reviewId"],
            "sourceLabel": source_annotation["sourceLabel"],
            "sourceAnnotation": source_annotation,
            "originalSourceIntervalMs": {"start": source_annotation["startMs"], "end": source_annotation["endMs"]},
            "denseExtractionIntervalMs": {
                "start": summary_by_id[annotation_id]["denseWindowStartMs"],
                "end": summary_by_id[annotation_id]["denseWindowEndMs"],
            },
            "representativeVisualEvidence": representative_interval(decision),
            "representativeOffsetsMs": decision.get("representativeOffsetsMs", decision.get("reportedRepresentativeOffsetMs")),
            "responseStatus": decision["responseStatus"],
            "elementType": decision.get("elementType"),
            "mapSide": decision.get("mapSide"),
            "laneColor": decision.get("laneColor"),
            "elementTeam": decision.get("elementTeam"),
            "relativePosition": decision.get("relativePosition"),
            "buffColor": decision.get("buffColor"),
            "observations": decision.get("observations", []),
            "userContextOnly": decision.get("userContextOnly", []),
            "confidence": decision.get("confidence"),
            "evidenceClass": decision.get("evidenceClass", "human_visual_review"),
            "unresolved": decision.get("unresolved", []),
            "conflicts": [decision["conflict"]] if "conflict" in decision else [],
            "resolution": decision.get("resolution", {}),
            "evidenceFrames": frames,
            "frameLookupStatus": "all_representative_timestamps_resolved" if not missing else "some_representative_timestamps_not_in_dense_manifest",
            "missingEvidenceTimestampsMs": missing,
        }
        if annotation_id == "E088":
            record["priorE088VisualReview"] = {
                "result": e088_prior.get("result"),
                "sourceRowPreserved": e088_prior.get("sourceRowPreserved"),
                "correctedCandidate": e088_prior.get("correctedCandidate"),
                "originalCandidate": e088_prior.get("originalCandidate"),
            }
        records.append(record)

    diagnostics = {
        "missingFrameLookups": missing_frame_lookups,
        "e005": E005_RECORD,
    }
    return records, diagnostics


def build_timing(records: list[dict[str, Any]]) -> dict[str, Any]:
    offsets = []
    negative = []
    over_5s = []
    over_10s = []
    for record in records:
        values = offset_values(HUMAN_DECISIONS[record["annotationId"]], record["originalSourceIntervalMs"]["start"])
        offsets.extend(values)
        if any(value < 0 for value in values):
            negative.append(record["annotationId"])
        if any(value > 5000 for value in values):
            over_5s.append(record["annotationId"])
        if any(value > 10000 for value in values):
            over_10s.append(record["annotationId"])

    return {
        "reviewedAnnotationCount": len(records),
        "withRepresentativeTimestampsOrIntervals": len(records),
        "offsetMedianMs": statistics.median(offsets),
        "offsetP90Ms": sorted(offsets)[min(len(offsets) - 1, int(0.9 * (len(offsets) - 1)))],
        "offsetMaximumMs": max(offsets),
        "annotationsRequiringMoreThanPlus5Seconds": sorted(set(over_5s)),
        "annotationsRequiringMoreThanPlus10Seconds": sorted(set(over_10s)),
        "annotationsWithNegativeOffsetUsefulFrames": sorted(set(negative)),
        "systematicDelayAssessment": "positive offsets are common in this annotation workflow; do not generalize beyond this recording",
        "offsetsMs": offsets,
    }


def build_alias_evidence(records: list[dict[str, Any]]) -> dict[str, Any]:
    by_id = {record["annotationId"]: record for record in records}
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_human_review_alias_evidence",
        "createdAt": now_iso(),
        "allowedStatuses": [
            "human_visually_confirmed",
            "human_context_confirmed",
            "partially_supported",
            "previous_task_only",
            "unresolved",
            "contradicted",
        ],
        "aliases": [
            {
                "alias": "Hidden King allied base",
                "status": "human_visually_confirmed",
                "supportingAnnotations": ["E001", "E002", "E003", "E004", "E006", "E009"],
                "evidence": [by_id[item]["observations"] for item in ["E001", "E002", "E003", "E004", "E006", "E009"]],
                "limitations": ["Observer-relative ally status is not automatically a structural team identity in other datasets."],
            },
            {
                "alias": "Archmother enemy base",
                "status": "human_visually_confirmed",
                "supportingAnnotations": ["E028", "E029", "E030"],
                "evidence": [by_id[item]["observations"] for item in ["E028", "E029", "E030"]],
                "limitations": ["Enemy status is observer-relative in this review packet."],
            },
            {
                "alias": "Yellow lane left side of Hidden King base",
                "status": "human_visually_confirmed",
                "supportingAnnotations": ["E002", "E004", "E009"],
                "evidence": [by_id[item]["observations"] for item in ["E002", "E004", "E009"]],
                "limitations": ["Do not replace neutral lane-axis IDs automatically."],
            },
            {
                "alias": "Green lane right side of Hidden King base",
                "status": "human_visually_confirmed",
                "supportingAnnotations": ["E003", "E006"],
                "evidence": [by_id[item]["observations"] for item in ["E003", "E006"]],
                "limitations": ["Do not replace neutral lane-axis IDs automatically."],
            },
            {
                "alias": "Archmother Green-lane Shrine position",
                "status": "human_visually_confirmed",
                "supportingAnnotations": ["E028"],
                "evidence": by_id["E028"]["observations"],
                "limitations": ["Lane color is validated for this reviewed visual context only."],
            },
            {
                "alias": "Archmother Yellow-lane Shrine position",
                "status": "human_visually_confirmed",
                "supportingAnnotations": ["E029"],
                "evidence": by_id["E029"]["observations"],
                "limitations": ["Lane color is validated for this reviewed visual context only."],
            },
            {
                "alias": "enemy minimap display red",
                "status": "previous_task_only",
                "supportingAnnotations": [],
                "evidence": ["Task 038 recorded enemy minimap red display as directly supported display-color evidence."],
                "limitations": ["This task did not add a new direct review decision for the red minimap display color."],
            },
        ],
    }


def csv_rows(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for record in records:
        rep = record["representativeVisualEvidence"]
        rows.append(
            {
                "annotationId": record["annotationId"],
                "responseStatus": record["responseStatus"],
                "sourceStartMs": record["originalSourceIntervalMs"]["start"],
                "sourceEndMs": record["originalSourceIntervalMs"]["end"],
                "representativeEvidenceType": rep["type"],
                "representativeTimestampsOrInterval": json.dumps(rep, ensure_ascii=False, sort_keys=True),
                "elementType": record["elementType"],
                "mapSide": record["mapSide"],
                "laneColor": record["laneColor"],
                "elementTeam": record["elementTeam"],
                "confidence": record["confidence"],
                "unresolved": "; ".join(record["unresolved"]),
                "conflicts": json.dumps(record["conflicts"], ensure_ascii=False, sort_keys=True),
                "evidenceFrameCount": len(record["evidenceFrames"]),
            }
        )
    return rows


def build_outputs() -> dict[str, Any]:
    records, diagnostics = build_records()
    timing = build_timing(records)
    alias_evidence = build_alias_evidence(records)
    form = read_json(OUTPUT_DIR / "manual-review-form-v2.json")

    completed_form = dict(form)
    completed_form["kind"] = "match_91119257_manual_review_form_v2_completed"
    completed_form["completedAt"] = now_iso()
    completed_form["humanReviewGate"] = "human_visual_review_ready_with_unresolved_timing"
    completed_form["records"] = [
        {**record, "humanResponse": HUMAN_DECISIONS[record["annotationId"]]}
        for record in records
    ]

    unresolved_items = [
        {
            "annotationId": record["annotationId"],
            "unresolved": record["unresolved"],
            "conflicts": record["conflicts"],
            "resolution": record["resolution"],
        }
        for record in records
        if record["unresolved"] or record["conflicts"]
    ]

    landmarks = {
        "schemaVersion": 1,
        "kind": "match_91119257_human_validated_visual_landmarks",
        "createdAt": now_iso(),
        "recordCount": len(records),
        "records": records,
        "e005": diagnostics["e005"],
    }

    intervals = {
        "schemaVersion": 1,
        "kind": "match_91119257_representative_visual_intervals",
        "createdAt": now_iso(),
        "timingAnalysis": timing,
        "records": [
            {
                "annotationId": record["annotationId"],
                "sourceIntervalMs": record["originalSourceIntervalMs"],
                "denseExtractionIntervalMs": record["denseExtractionIntervalMs"],
                "representativeVisualEvidence": record["representativeVisualEvidence"],
                "representativeOffsetsMs": record["representativeOffsetsMs"],
                "evidenceFrames": record["evidenceFrames"],
            }
            for record in records
        ],
    }

    gate = {
        "schemaVersion": 1,
        "kind": "match_91119257_human_review_final_gate",
        "createdAt": now_iso(),
        "gate": "human_visual_review_ready_with_unresolved_timing",
        "reviewRecordCount": len(records),
        "confirmedRecords": sum(1 for record in records if record["responseStatus"] == "confirmed"),
        "partiallyConfirmedRecords": sum(1 for record in records if record["responseStatus"] == "partially_confirmed"),
        "conflictRecords": sum(1 for record in records if record["conflicts"]),
        "e005": diagnostics["e005"],
        "unresolvedSummary": unresolved_items,
        "timingAnalysis": timing,
        "replay005Protection": {"processed": False, "status": "preserved"},
        "limitations": [
            "E032 exact respawn instant remains unresolved.",
            "E084 specific green buff effect remains unresolved.",
            "E088 element identity is confirmed but timestamp/source-record mapping remains unresolved.",
            "Human review does not resolve video-demo alignment or parser telemetry instability.",
        ],
    }

    human_responses = {
        "schemaVersion": 1,
        "kind": "match_91119257_manual_review_human_responses",
        "createdAt": now_iso(),
        "source": "user_supplied_completed_dense_manual_review",
        "records": records,
        "diagnostics": diagnostics,
    }

    unresolved = {
        "schemaVersion": 1,
        "kind": "match_91119257_human_review_unresolved_items",
        "createdAt": now_iso(),
        "items": unresolved_items,
        "e005": diagnostics["e005"],
    }

    csv_fieldnames = [
        "annotationId",
        "responseStatus",
        "sourceStartMs",
        "sourceEndMs",
        "representativeEvidenceType",
        "representativeTimestampsOrInterval",
        "elementType",
        "mapSide",
        "laneColor",
        "elementTeam",
        "confidence",
        "unresolved",
        "conflicts",
        "evidenceFrameCount",
    ]

    rows = csv_rows(records)
    write_json(OUTPUT_DIR / "manual-review-human-responses.json", human_responses)
    write_csv(OUTPUT_DIR / "manual-review-human-responses.csv", rows, csv_fieldnames)
    write_json(OUTPUT_DIR / "manual-review-form-v2-completed.json", completed_form)
    write_csv(OUTPUT_DIR / "manual-review-form-v2-completed.csv", rows, csv_fieldnames)
    write_json(OUTPUT_DIR / "human-validated-visual-landmarks.json", landmarks)
    write_json(OUTPUT_DIR / "human-review-unresolved-items.json", unresolved)
    write_json(OUTPUT_DIR / "representative-visual-intervals.json", intervals)
    write_json(OUTPUT_DIR / "human-review-alias-evidence.json", alias_evidence)
    write_json(OUTPUT_DIR / "human-review-final-gate.json", gate)

    write_report(gate, alias_evidence, timing)
    return gate


def write_report(gate: dict[str, Any], aliases: dict[str, Any], timing: dict[str, Any]) -> None:
    alias_lines = "\n".join(f"- {item['alias']}: `{item['status']}`" for item in aliases["aliases"])
    report = f"""# Match 91119257 Human Visual Review Final

Date: 2026-06-29

## Scope

Task 042 ingested the completed human review for the 24 dense manual-review annotations. It preserved source annotation intervals separately from representative visual evidence, did not process replay 005, did not install optional video dependencies, and did not resume parser recovery or video-demo alignment.

## Results

- Review records ingested: {gate['reviewRecordCount']}
- Confirmed records: {gate['confirmedRecords']}
- Partially confirmed records: {gate['partiallyConfirmedRecords']}
- Conflict records: {gate['conflictRecords']}
- Final gate: `{gate['gate']}`

## Timing

- Median offset: {timing['offsetMedianMs']} ms
- P90 offset: {timing['offsetP90Ms']} ms
- Maximum offset: {timing['offsetMaximumMs']} ms
- More than +5 seconds: {', '.join(timing['annotationsRequiringMoreThanPlus5Seconds'])}
- More than +10 seconds: {', '.join(timing['annotationsRequiringMoreThanPlus10Seconds'])}
- Negative-offset useful frames: {', '.join(timing['annotationsWithNegativeOffsetUsefulFrames']) or 'none'}

The observed positive delay is a property of this annotation workflow and recording, not a universal timing rule.

## Alias Evidence

{alias_lines}

## Unresolved

- E032: exact respawn frame remains unresolved.
- E084: specific green buff effect remains unresolved.
- E088: Teleporter element identity is confirmed, but timestamp/source-record mapping remains unresolved.
- E005: source row exists, but it was not selected for the 24-case task 038 minimized review set and is not added as a 25th reviewed case.

## Outputs

- `output/match_91119257/manual-review-human-responses.json`
- `output/match_91119257/manual-review-human-responses.csv`
- `output/match_91119257/manual-review-form-v2-completed.json`
- `output/match_91119257/manual-review-form-v2-completed.csv`
- `output/match_91119257/human-validated-visual-landmarks.json`
- `output/match_91119257/human-review-unresolved-items.json`
- `output/match_91119257/representative-visual-intervals.json`
- `output/match_91119257/human-review-alias-evidence.json`
- `output/match_91119257/human-review-final-gate.json`
"""
    REPORT_PATH.write_text(report, encoding="utf-8")
    LATEST_REPORT_PATH.write_text(rel(REPORT_PATH) + "\n", encoding="utf-8")


def main() -> None:
    gate = build_outputs()
    print(json.dumps(gate, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
