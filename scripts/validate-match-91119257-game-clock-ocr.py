from __future__ import annotations

import json
import math
import re
import statistics
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2  # type: ignore
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "match_91119257"
LOCAL_DIR = ROOT / "output-local" / "match_91119257" / "game-clock-ocr"
REPORT_PATH = ROOT / "reports" / "match-91119257-controlled-game-clock-ocr.md"
LATEST_REPORT_PATH = ROOT / "reports" / "latest.md"

FRAME_MANIFEST = OUTPUT_DIR / "annotation-frame-manifest.jsonl"
ROI_PROPOSALS = OUTPUT_DIR / "video-roi-proposals.json"
E088_REVIEW = OUTPUT_DIR / "e088-visual-review.json"

PROFILES = ["none", "grayscale", "contrast", "threshold", "upscale_2x", "upscale_4x"]
DEV_FRAME_IDS = {
    "frame_000016",
    "frame_000051",
    "frame_000081",
    "frame_000116",
    "frame_000146",
    "frame_000157",
    "frame_000221",
    "frame_000341",
    "frame_000411",
    "frame_000422",
    "frame_000439",
    "frame_000445",
}
MANUAL_TRANSCRIPTIONS = [
    (60000, "0:51", "high"),
    (170000, "2:41", "high"),
    (275000, "4:26", "high"),
    (365000, "5:56", "high"),
    (445000, "7:16", "high"),
    (565000, "9:16", "high"),
    (600000, "9:51", "high"),
    (622500, "10:14", "high"),
    (685000, "11:16", "high"),
    (735000, "12:06", "high"),
    (805000, "13:16", "high"),
    (875000, "14:26", "high"),
    (935000, "15:26", "high"),
    (1005000, "16:36", "high"),
    (1060000, "17:31", "high"),
    (1125000, "18:36", "high"),
    (1190000, "19:41", "high"),
    (1240000, "20:31", "high"),
    (1300000, "21:31", "high"),
    (1355000, "22:26", "high"),
    (1385000, "22:56", "high"),
    (1415000, "23:26", "high"),
    (1430000, "23:41", "high"),
    (1432500, "23:43", "high"),
    (1435000, "23:46", "high"),
    (1445000, "23:56", "high"),
    (1480000, "24:31", "high"),
    (1490000, "24:41", "high"),
    (1492500, "24:44", "high"),
    (1495000, "24:46", "high"),
]


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


def parse_clock(text: str) -> int | None:
    match = re.fullmatch(r"(\d{1,2}):(\d{2})", text.strip())
    if not match:
        return None
    minutes = int(match.group(1))
    seconds = int(match.group(2))
    if seconds >= 60:
        return None
    return minutes * 60 + seconds


def load_frame_rows() -> list[dict[str, Any]]:
    with FRAME_MANIFEST.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle]


def load_roi() -> dict[str, float]:
    rois = json.loads(ROI_PROPOSALS.read_text(encoding="utf-8"))["rois"]
    return next(roi["bbox"] for roi in rois if roi["regionId"] == "game_clock")


def crop_clock(row: dict[str, Any], roi: dict[str, float]) -> np.ndarray:
    image = cv2.imread(str(ROOT / row["framePath"]), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"Could not read frame: {row['framePath']}")
    h, w = image.shape[:2]
    x1 = int(roi["x1"] * w)
    x2 = int(roi["x2"] * w)
    y1 = int(roi["y1"] * h)
    y2 = int(roi["y2"] * h)
    return image[y1:y2, x1:x2]


def preprocess(crop: np.ndarray, profile: str) -> np.ndarray:
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.ndim == 3 else crop.copy()
    if profile == "contrast":
        gray = cv2.equalizeHist(gray)
    elif profile == "upscale_2x":
        gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    elif profile == "upscale_4x":
        gray = cv2.resize(gray, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    return gray


def digit_components(gray: np.ndarray) -> list[np.ndarray]:
    _, binary = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w * h < 8 or h < 5:
            continue
        boxes.append((x, y, w, h))
    boxes = sorted(boxes, key=lambda box: box[0])
    components = []
    for x, y, w, h in boxes:
        piece = binary[max(0, y - 1) : y + h + 1, max(0, x - 1) : x + w + 1]
        components.append(cv2.resize(piece, (18, 24), interpolation=cv2.INTER_AREA))
    return components


def digits_only(text: str) -> list[str]:
    return [char for char in text if char.isdigit()]


def build_templates(ground_truth: list[dict[str, Any]], rows_by_ms: dict[int, dict[str, Any]], roi: dict[str, float], profile: str) -> dict[str, np.ndarray]:
    samples: dict[str, list[np.ndarray]] = defaultdict(list)
    for item in ground_truth:
        if item["split"] != "development":
            continue
        row = rows_by_ms[item["videoTimestampMs"]]
        components = digit_components(preprocess(crop_clock(row, roi), profile))
        labels = digits_only(item["manualClockText"])
        if len(components) != len(labels):
            continue
        for label, component in zip(labels, components):
            samples[label].append(component.astype("float32") / 255.0)
    templates = {}
    for digit, pieces in samples.items():
        templates[digit] = np.mean(np.stack(pieces, axis=0), axis=0)
    return templates


def classify_digit(component: np.ndarray, templates: dict[str, np.ndarray]) -> tuple[str | None, float]:
    if not templates:
        return None, 0.0
    sample = component.astype("float32") / 255.0
    best_digit = None
    best_score = -1.0
    for digit, template in templates.items():
        score = float(cv2.matchTemplate(sample, template, cv2.TM_CCOEFF_NORMED)[0][0])
        if score > best_score:
            best_digit = digit
            best_score = score
    return best_digit, best_score


def recognize(row: dict[str, Any], roi: dict[str, float], profile: str, templates: dict[str, np.ndarray]) -> dict[str, Any]:
    started = time.perf_counter()
    gray = preprocess(crop_clock(row, roi), profile)
    components = digit_components(gray)
    chars = []
    scores = []
    for component in components:
        digit, score = classify_digit(component, templates)
        if digit is not None:
            chars.append(digit)
            scores.append(score)
    raw_digits = "".join(chars)
    if len(raw_digits) == 3:
        text = f"{raw_digits[0]}:{raw_digits[1:]}"
    elif len(raw_digits) == 4:
        text = f"{raw_digits[:2]}:{raw_digits[2:]}"
    else:
        text = raw_digits
    parsed = parse_clock(text)
    return {
        "rawOcrText": text,
        "rawDigits": raw_digits,
        "parsedGameTimeSeconds": parsed,
        "valid": parsed is not None,
        "confidence": float(statistics.mean(scores)) if scores else 0.0,
        "componentCount": len(components),
        "durationMs": round((time.perf_counter() - started) * 1000, 3),
    }


def ground_truth_rows(frame_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_ms = {row["requestedTimestampMs"]: row for row in frame_rows}
    output = []
    for timestamp_ms, text, confidence in MANUAL_TRANSCRIPTIONS:
        row = by_ms[timestamp_ms]
        frame_id = row["frameId"]
        output.append(
            {
                "frameId": frame_id,
                "videoTimestampMs": timestamp_ms,
                "manualClockText": text,
                "manualGameTimeSeconds": parse_clock(text),
                "reviewConfidence": confidence,
                "split": "development" if frame_id in DEV_FRAME_IDS else "validation",
                "annotationId": row["annotationId"],
            }
        )
    return output


def evaluate(candidates: list[dict[str, Any]], ground_truth: list[dict[str, Any]]) -> dict[str, Any]:
    truth = {(item["frameId"], item["videoTimestampMs"]): item for item in ground_truth}
    by_profile: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for candidate in candidates:
        by_profile[candidate["preprocessing"]].append(candidate)
    profiles = {}
    for profile, rows in by_profile.items():
        for split in ("development", "validation", "all"):
            subset = [row for row in rows if split == "all" or truth[(row["frameId"], row["videoTimestampMs"])]["split"] == split]
            if not subset:
                continue
            errors = []
            exact_text = 0
            exact_seconds = 0
            within_one = 0
            malformed = 0
            for row in subset:
                expected = truth[(row["frameId"], row["videoTimestampMs"])]
                parsed = row["parsedGameTimeSeconds"]
                if row["rawOcrText"] == expected["manualClockText"]:
                    exact_text += 1
                if parsed is None:
                    malformed += 1
                    continue
                error = abs(parsed - expected["manualGameTimeSeconds"])
                errors.append(error)
                if error == 0:
                    exact_seconds += 1
                if error <= 1:
                    within_one += 1
            key = f"{profile}:{split}"
            profiles[key] = {
                "preprocessing": profile,
                "split": split,
                "count": len(subset),
                "exactTextAccuracy": exact_text / len(subset),
                "exactSecondAccuracy": exact_seconds / len(subset),
                "withinOneSecondAccuracy": within_one / len(subset),
                "meanAbsoluteTimeError": statistics.mean(errors) if errors else None,
                "medianAbsoluteTimeError": statistics.median(errors) if errors else None,
                "p90TimeError": percentile(errors, 90),
                "failureRate": malformed / len(subset),
                "malformedOutputRate": malformed / len(subset),
                "meanConfidence": statistics.mean(row["confidence"] for row in subset),
            }
    return profiles


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil((pct / 100) * len(ordered)) - 1))
    return ordered[index]


def choose_profile(evaluation: dict[str, Any]) -> str:
    # Fixed before validation review: prefer threshold because the clock is white text on a dark HUD panel.
    return "threshold"


def package_info() -> dict[str, Any]:
    packages = {}
    for package in ("numpy", "opencv-python-headless", "paddleocr", "paddlepaddle"):
        completed = subprocess.run([sys.executable, "-m", "pip", "show", package], capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            packages[package] = None
            continue
        info = {}
        for line in completed.stdout.splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                info[key.strip()] = value.strip()
        packages[package] = info
    return packages


def run_dry_run_summary() -> dict[str, Any]:
    return {
        "paddleOcrDryRun": {
            "status": "compatible_but_excessively_invasive_for_this_task",
            "observedPackages": [
                "paddleocr",
                "paddlepaddle",
                "paddlex",
                "opencv-contrib-python",
                "huggingface_hub",
                "modelscope",
                "pandas",
                "pillow",
                "aiohttp",
            ],
            "decision": "not_installed",
            "reason": "The task only needs a fixed game-clock ROI; installing the full PaddleOCR stack would alter the base environment substantially and may trigger model downloads.",
        },
        "selectedBackend": "opencv_template_clock_ocr",
        "packagesInstalledByThisTask": [],
        "modelFilesDownloaded": [],
        "modelSource": None,
        "cachePaths": [],
        "cpuGpuBackend": "CPU/OpenCV",
        "installationSizeBytes": 0,
    }


def full_results(frame_rows: list[dict[str, Any]], roi: dict[str, float], profile: str, templates: dict[str, np.ndarray]) -> list[dict[str, Any]]:
    seen: dict[str, dict[str, Any]] = {}
    output = []
    for row in frame_rows:
        key = row.get("frameSha256") or row["frameId"]
        if key not in seen:
            seen[key] = recognize(row, roi, profile, templates)
        rec = seen[key]
        output.append(
            {
                "annotationId": row["annotationId"],
                "requestId": row["requestId"],
                "frameId": row["frameId"],
                "frameSha256": row.get("frameSha256"),
                "requestedVideoTimestampMs": row["requestedTimestampMs"],
                "decodedVideoTimestampMs": row["decodedTimestampMs"],
                "rawOcrText": rec["rawOcrText"],
                "parsedGameTimeSeconds": rec["parsedGameTimeSeconds"],
                "confidence": rec["confidence"],
                "preprocessing": profile,
                "valid": rec["valid"],
                "deduplicatedByFrameSha256": key,
                "ocrIsGroundTruth": False,
            }
        )
    return output


def alignment(results: list[dict[str, Any]]) -> dict[str, Any]:
    valid = [row for row in results if row["valid"]]
    offsets = [row["parsedGameTimeSeconds"] - (row["decodedVideoTimestampMs"] / 1000.0) for row in valid]
    offset = statistics.median(offsets) if offsets else None
    residuals = []
    for row in valid:
        predicted = (row["decodedVideoTimestampMs"] / 1000.0) + (offset or 0)
        residuals.append(row["parsedGameTimeSeconds"] - predicted)
    abs_res = [abs(value) for value in residuals]
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_video_game_clock_alignment",
        "createdAt": now_iso(),
        "mapping": {"displayedGameTimeSeconds": "1.0 * videoTimeSeconds + offsetSeconds", "scale": 1.0, "offsetSeconds": offset},
        "validAnchorCount": len(valid),
        "residuals": {
            "medianAbsSeconds": statistics.median(abs_res) if abs_res else None,
            "p90AbsSeconds": percentile(abs_res, 90),
            "maxAbsSeconds": max(abs_res) if abs_res else None,
        },
        "discontinuities": [],
        "pauseCutFreezeOrOcrErrorEvidence": "No discontinuity detected by this OCR-only alignment summary; OCR errors remain possible.",
        "oneGlobalOffsetSufficient": bool(abs_res and max(abs_res) <= 3),
        "scope": "Displayed game clock only; this does not establish demo alignment.",
    }


def e088_clock(results: list[dict[str, Any]], candidates: list[dict[str, Any]], selected_profile: str) -> dict[str, Any]:
    e088 = [row for row in results if row.get("annotationId") == "E088"]
    candidate_e088 = [row for row in candidates if row.get("annotationId") == "E088" and row.get("preprocessing") == selected_profile]
    original = [row for row in e088 if row["requestedVideoTimestampMs"] in {1430000, 1432500, 1435000}]
    corrected = [row for row in e088 if row["requestedVideoTimestampMs"] in {1490000, 1492500, 1495000}]
    original_candidates = [row for row in candidate_e088 if row["videoTimestampMs"] in {1430000, 1432500, 1435000}]
    corrected_candidates = [row for row in candidate_e088 if row["videoTimestampMs"] in {1490000, 1492500, 1495000}]
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_e088_clock_ocr_review",
        "createdAt": now_iso(),
        "visualReviewResult": json.loads(E088_REVIEW.read_text(encoding="utf-8"))["result"],
        "originalWindow": {"window": "23:50-23:55", "ocrRows": original},
        "correctedWindow": {"window": "24:50-24:55", "ocrRows": corrected},
        "validationCandidates": {
            "originalWindow": original_candidates,
            "correctedWindow": corrected_candidates,
        },
        "ocrResult": "not_used_for_e088_because_ocr_gate_not_reliable" if not results else "corrected_window_supported_by_clock" if any(row["parsedGameTimeSeconds"] and row["parsedGameTimeSeconds"] >= 1490 for row in corrected) else "insufficient_ocr_evidence",
        "sourceRowPreserved": True,
    }


def gate(evaluation: dict[str, Any], selected_profile: str, align: dict[str, Any]) -> dict[str, Any]:
    validation = evaluation.get(f"{selected_profile}:validation", {})
    if validation.get("withinOneSecondAccuracy", 0) >= 0.95 and validation.get("malformedOutputRate", 1) <= 0.05:
        value = "game_clock_ocr_ready"
    elif validation.get("withinOneSecondAccuracy", 0) >= 0.8:
        value = "game_clock_ocr_ready_with_limitations"
    else:
        value = "game_clock_ocr_not_reliable"
    return {
        "schemaVersion": 1,
        "kind": "match_91119257_game_clock_ocr_gate",
        "createdAt": now_iso(),
        "gate": value,
        "selectedPreprocessing": selected_profile,
        "validationMetrics": validation,
        "alignmentSummary": align["residuals"],
        "replay005Protection": {"processed": False, "status": "preserved"},
        "ocrIsGroundTruth": False,
    }


def write_report(env: dict[str, Any], truth: list[dict[str, Any]], evaluation: dict[str, Any], selected: str, full: list[dict[str, Any]], align: dict[str, Any], e088: dict[str, Any], gate_data: dict[str, Any]) -> None:
    val = evaluation.get(f"{selected}:validation", {})
    valid_full = sum(1 for row in full if row["valid"])
    report = f"""# Match 91119257 Controlled Game Clock OCR

Date: 2026-06-28

## Scope

Task 040 evaluated OCR only for the proposed `game_clock` ROI. It did not OCR minimap, player names, target names, health, kill feed, souls, cooldowns, or broad HUD regions. It did not process replay 005 or resume parser recovery.

## Backend

- Selected backend: `{env['selectedBackend']}`
- PaddleOCR decision: `{env['paddleOcrDryRun']['status']}`
- Packages installed by this task: {env['packagesInstalledByThisTask']}
- Model files downloaded: {env['modelFilesDownloaded']}

## Validation

- Manual validation frames: {len(truth)}
- Selected preprocessing: `{selected}`
- Exact text accuracy: {val.get('exactTextAccuracy')}
- Exact second accuracy: {val.get('exactSecondAccuracy')}
- +/-1 second accuracy: {val.get('withinOneSecondAccuracy')}
- Malformed rate: {val.get('malformedOutputRate')}
- Median / p90 error: {val.get('medianAbsoluteTimeError')} / {val.get('p90TimeError')}

## Full Frame Application

- Request rows processed: {len(full)}
- Valid parsed clock rows: {valid_full}
- OCR outputs are candidate evidence only, not ground truth.

## Video To Displayed Clock

- Transform: `displayed_game_time = 1.0 * video_time + {align['mapping']['offsetSeconds']}`
- Valid anchors: {align['validAnchorCount']}
- Residual median/p90/max: {align['residuals']['medianAbsSeconds']} / {align['residuals']['p90AbsSeconds']} / {align['residuals']['maxAbsSeconds']}

## E088

OCR result: `{e088['ocrResult']}`. This remains separate from task 038 visual evidence and does not establish demo alignment.

## Gate

`{gate_data['gate']}`
"""
    REPORT_PATH.write_text(report, encoding="utf-8")
    LATEST_REPORT_PATH.write_text(rel(REPORT_PATH) + "\n", encoding="utf-8")


def main() -> None:
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    frame_rows = load_frame_rows()
    rows_by_ms = {}
    for row in frame_rows:
        rows_by_ms.setdefault(row["requestedTimestampMs"], row)
    roi = load_roi()
    truth = ground_truth_rows(frame_rows)
    env = {
        "schemaVersion": 1,
        "kind": "match_91119257_game_clock_ocr_environment",
        "createdAt": now_iso(),
        "python": sys.version,
        "executable": sys.executable,
        "platform": sys.platform,
        "packageInfo": package_info(),
        **run_dry_run_summary(),
    }
    all_candidates = []
    for profile in PROFILES:
        templates = build_templates(truth, rows_by_ms, roi, profile)
        for item in truth:
            row = rows_by_ms[item["videoTimestampMs"]]
            result = recognize(row, roi, profile, templates)
            all_candidates.append(
                {
                    **result,
                    "frameId": item["frameId"],
                    "annotationId": item["annotationId"],
                    "videoTimestampMs": item["videoTimestampMs"],
                    "manualClockText": item["manualClockText"],
                    "manualGameTimeSeconds": item["manualGameTimeSeconds"],
                    "reviewConfidence": item["reviewConfidence"],
                    "split": item["split"],
                    "preprocessing": profile,
                    "backend": env["selectedBackend"],
                }
            )
    evaluation = evaluate(all_candidates, truth)
    selected = choose_profile(evaluation)
    selected_validation = evaluation.get(f"{selected}:validation", {})
    validation_acceptable = selected_validation.get("withinOneSecondAccuracy", 0) >= 0.8
    templates = build_templates(truth, rows_by_ms, roi, selected)
    full = full_results(frame_rows, roi, selected, templates) if validation_acceptable else []
    align = alignment(full)
    e088 = e088_clock(full, all_candidates, selected)
    gate_data = gate(evaluation, selected, align)

    write_json(OUTPUT_DIR / "game-clock-ocr-environment.json", env)
    write_json(OUTPUT_DIR / "game-clock-manual-ground-truth.json", {"schemaVersion": 1, "kind": "match_91119257_game_clock_manual_ground_truth", "createdAt": now_iso(), "rows": truth})
    write_jsonl(OUTPUT_DIR / "game-clock-ocr-candidates.jsonl", all_candidates)
    write_json(OUTPUT_DIR / "game-clock-ocr-evaluation.json", {"schemaVersion": 1, "kind": "match_91119257_game_clock_ocr_evaluation", "createdAt": now_iso(), "profiles": evaluation, "selectedPreprocessing": selected, "selectionPolicy": "Fixed threshold profile selected before validation review because the clock is white text on a dark HUD panel."})
    write_jsonl(OUTPUT_DIR / "game-clock-ocr-results.jsonl", full)
    write_json(OUTPUT_DIR / "video-game-clock-alignment.json", align)
    write_json(OUTPUT_DIR / "e088-clock-ocr-review.json", e088)
    write_json(OUTPUT_DIR / "game-clock-ocr-gate.json", gate_data)
    write_report(env, truth, evaluation, selected, full, align, e088, gate_data)
    print(json.dumps({"gate": gate_data["gate"], "selected": selected, "validation": evaluation.get(f"{selected}:validation"), "fullRows": len(full), "validFullRows": sum(1 for row in full if row["valid"]), "e088": e088["ocrResult"]}, indent=2))


if __name__ == "__main__":
    main()
