from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "match_91119257"
LOCAL_DIR = ROOT / "output-local" / "match_91119257" / "manual-review"
REPORT_PATH = ROOT / "reports" / "match-91119257-minimized-human-review-preparation.md"
LATEST_REPORT_PATH = ROOT / "reports" / "latest.md"

MINIMIZED_REVIEW = OUTPUT_DIR / "minimized-manual-review.json"
VISIBILITY_AUDIT = OUTPUT_DIR / "annotation-visibility-audit.json"
ALIAS_FEASIBILITY = OUTPUT_DIR / "visual-alias-feasibility.json"
E088_REVIEW = OUTPUT_DIR / "e088-visual-review.json"
FRAME_MANIFEST = OUTPUT_DIR / "annotation-frame-manifest.jsonl"


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


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_frame_manifest() -> dict[str, dict[str, Any]]:
    rows = {}
    with FRAME_MANIFEST.open("r", encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            rows[row["frameId"]] = row
    return rows


def questions_for(item: dict[str, Any], audit_record: dict[str, Any]) -> list[str]:
    questions: list[str] = []
    reasons = " ".join(item.get("reviewReasons", [])).lower()
    object_type = audit_record["sourceMetadata"].get("objectType")
    if audit_record["annotationSupport"] == "ambiguous" or "multiple" in reasons:
        questions.append("Are multiple plausible targets visible in this frame group?")
        questions.append("Which visible target should be associated with this annotation?")
    if object_type in {"guardian", "walker", "base_guardians", "archmother"} or "alias" in reasons:
        questions.append("Is the target Guardian, Walker, base structure, Patron, shop, camp, teleporter, or another element?")
        questions.append("Does the target belong to Archmother or Hidden King?")
    if audit_record["sourceMetadata"].get("laneColor") or "lane" in reasons:
        questions.append("Is this the Green, Blue, or Yellow lane?")
        questions.append("Is the target identity visually confirmed or only inferred from route order?")
    if item["annotationId"] == "E088":
        questions.append("Does the corrected 24:50-24:55 frame group show the intended underground enemy teleporter?")
        questions.append("Should the original duplicated 23:50-23:55 timestamp remain rejected for this annotation?")
    questions.append("Does the frame independently support the annotation?")
    if "alias" in reasons:
        questions.append("Does the frame support a side/lane alias?")
    return list(dict.fromkeys(questions))


def correction_template() -> dict[str, Any]:
    return {
        "elementType": None,
        "mapSide": None,
        "laneColor": None,
        "elementTeam": None,
        "timestampWindow": None,
        "explanation": None,
    }


def build_review_package() -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    minimized = read_json(MINIMIZED_REVIEW)
    audit = read_json(VISIBILITY_AUDIT)
    alias = read_json(ALIAS_FEASIBILITY)
    e088 = read_json(E088_REVIEW)
    frames_by_id = load_frame_manifest()
    audit_by_id = {record["annotationId"]: record for record in audit["records"]}
    records = []
    csv_rows = []
    for index, item in enumerate(minimized["items"], 1):
        annotation_id = item["annotationId"]
        audit_record = audit_by_id[annotation_id]
        candidate_frames = []
        for frame_id in item["frameIds"]:
            frame = frames_by_id.get(frame_id)
            if not frame:
                continue
            candidate_frames.append(
                {
                    "frameId": frame_id,
                    "requestId": frame.get("requestId"),
                    "requestRole": frame.get("requestRole"),
                    "candidateWindow": frame.get("candidateWindow"),
                    "requestedTimestampMs": frame.get("requestedTimestampMs"),
                    "decodedTimestampMs": frame.get("decodedTimestampMs"),
                    "framePath": frame.get("framePath"),
                    "localPathNote": "Local frame path is intentionally untracked and should be opened from the repository working tree.",
                }
            )
        review_id = f"MR91119257-{index:03d}"
        questions = questions_for(item, audit_record)
        record = {
            "reviewId": review_id,
            "annotationId": annotation_id,
            "reasonForReview": item.get("reviewReasons", []),
            "sourceAnnotation": audit_record["sourceMetadata"],
            "candidateFrames": candidate_frames,
            "contactSheetPath": minimized.get("localReviewSheet"),
            "questions": questions,
            "currentAssessment": item.get("annotationSupport"),
            "allowedResponses": ["confirmed", "corrected", "still_ambiguous", "not_visible", "not_enough_context"],
            "correctionFields": correction_template(),
            "userResponse": None,
            "notes": None,
        }
        records.append(record)
        for question in questions:
            csv_rows.append(
                {
                    "review_id": review_id,
                    "annotation_id": annotation_id,
                    "reason": " | ".join(item.get("reviewReasons", [])),
                    "frame_paths": " | ".join(frame["framePath"] for frame in candidate_frames if frame.get("framePath")),
                    "current_assessment": item.get("annotationSupport"),
                    "question": question,
                    "response_status": "",
                    "corrected_element_type": "",
                    "corrected_map_side": "",
                    "corrected_lane_color": "",
                    "corrected_element_team": "",
                    "notes": "",
                }
            )
    form = {
        "schemaVersion": 1,
        "kind": "match_91119257_manual_review_form",
        "createdAt": now_iso(),
        "reviewCount": len(records),
        "sourceFiles": {
            "minimizedReview": rel(MINIMIZED_REVIEW),
            "visibilityAudit": rel(VISIBILITY_AUDIT),
            "aliasFeasibility": rel(ALIAS_FEASIBILITY),
            "e088Review": rel(E088_REVIEW),
        },
        "allowedResponses": ["confirmed", "corrected", "still_ambiguous", "not_visible", "not_enough_context"],
        "correctionFields": ["elementType", "mapSide", "laneColor", "elementTeam", "timestampWindow", "explanation"],
        "records": records,
        "methodology": [
            "Do not mark a case confirmed unless the visible frames independently support the answer.",
            "Use corrected only when at least one structured correction field is supplied.",
            "Leave userResponse as null until the human review is actually performed.",
        ],
        "replay005Protection": {"processed": False, "status": "preserved"},
    }
    manifest = {
        "schemaVersion": 1,
        "kind": "match_91119257_manual_review_package_manifest",
        "createdAt": now_iso(),
        "gate": "manual_visual_review_package_ready" if len(records) == minimized["reviewCount"] else "manual_visual_review_package_blocked",
        "reviewCount": len(records),
        "csvQuestionRows": len(csv_rows),
        "outputs": [
            rel(OUTPUT_DIR / "manual-review-form.json"),
            rel(OUTPUT_DIR / "manual-review-form.csv"),
            rel(OUTPUT_DIR / "manual-review-instructions.md"),
            rel(OUTPUT_DIR / "manual-review-package-manifest.json"),
            rel(REPORT_PATH),
        ],
        "localAssets": {
            "minimizedReviewSheet": minimized.get("localReviewSheet"),
            "framePathsAreLocal": True,
            "imagesCommitted": False,
        },
        "aliasFeasibilitySummary": alias,
        "e088Summary": e088,
        "replay005Protection": {"processed": False, "status": "preserved"},
    }
    return form, csv_rows, manifest


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    columns = [
        "review_id",
        "annotation_id",
        "reason",
        "frame_paths",
        "current_assessment",
        "question",
        "response_status",
        "corrected_element_type",
        "corrected_map_side",
        "corrected_lane_color",
        "corrected_element_team",
        "notes",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def write_instructions(form: dict[str, Any], manifest: dict[str, Any]) -> None:
    text = f"""# Match 91119257 Minimized Manual Review Instructions

This package contains {form['reviewCount']} selected review cases from the 88 annotation groups. It is intentionally minimized: cases that were already sufficiently visible for the current evidence layer are not included.

## What To Review

Use `output/archive/match_91119257/manual-review/manual-review-form.csv` if you prefer a spreadsheet, or `output/archive/match_91119257/manual-review/manual-review-form.json` if you prefer structured JSON.

For each question, choose one response:

- `confirmed`: the visible frames independently support the current assessment.
- `corrected`: the current assessment needs a structured correction.
- `still_ambiguous`: multiple plausible interpretations remain.
- `not_visible`: the requested visual feature is not visible.
- `not_enough_context`: the frame is visible, but the context is insufficient.

For `corrected`, fill the relevant correction fields only:

- `corrected_element_type`
- `corrected_map_side`
- `corrected_lane_color`
- `corrected_element_team`
- `notes`

## Important Rules

- Do not mark a case confirmed only because the CSV label says so.
- Do not infer macro, rotations, fights, strategic intent, or semantic occupancy.
- Do not replace neutral structural IDs from this review alone.
- E088 should be reviewed as a timestamp/window question; the source CSV row remains preserved.

## Local Images

The extracted frames and review sheet are local and untracked. Main local review sheet:

`{manifest['localAssets']['minimizedReviewSheet']}`

Frame paths for each case are listed in both the JSON and CSV forms.

## Replay 005

Replay 005 was not processed.
"""
    (OUTPUT_DIR / "manual-review-instructions.md").write_text(text, encoding="utf-8")


def write_report(form: dict[str, Any], csv_rows: list[dict[str, Any]], manifest: dict[str, Any]) -> None:
    report = f"""# Match 91119257 Minimized Human Review Preparation

Date: 2026-06-28

## Scope

Task 039 prepared a human-facing review package for the minimized visual cases selected by task 038. It did not perform review, ingest answers, install OCR, resume parser recovery, or process replay 005.

## Results

- Review cases prepared: {form['reviewCount']}
- CSV question rows: {len(csv_rows)}
- Gate: `{manifest['gate']}`
- Local review sheet: `{manifest['localAssets']['minimizedReviewSheet']}`

## Outputs

- `output/archive/match_91119257/manual-review/manual-review-form.json`
- `output/archive/match_91119257/manual-review/manual-review-form.csv`
- `output/match_91119257/manual-review-instructions.md`
- `output/match_91119257/manual-review-package-manifest.json`

## Limitations

- Answers are intentionally empty; no human responses have been supplied yet.
- Images and contact sheets remain local and untracked.
- The package does not approve side/lane aliases or rewrite E088.
"""
    REPORT_PATH.write_text(report, encoding="utf-8")
    LATEST_REPORT_PATH.write_text(rel(REPORT_PATH) + "\n", encoding="utf-8")


def main() -> None:
    form, csv_rows, manifest = build_review_package()
    write_json(OUTPUT_DIR / "manual-review-form.json", form)
    write_csv(OUTPUT_DIR / "manual-review-form.csv", csv_rows)
    write_instructions(form, manifest)
    write_json(OUTPUT_DIR / "manual-review-package-manifest.json", manifest)
    write_report(form, csv_rows, manifest)
    print(json.dumps({"gate": manifest["gate"], "reviewCount": form["reviewCount"], "csvRows": len(csv_rows)}, indent=2))


if __name__ == "__main__":
    main()
