from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import numpy as np

from deadem.video_pipeline.metadata import _import_cv2
from deadem.video_pipeline.serialization import sha256_file


ROOT = Path(__file__).resolve().parents[1]


def relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def format_seconds(value: float) -> str:
    minutes = int(value // 60)
    seconds = int(value % 60)
    return f"{minutes:02d}:{seconds:02d}"


def build_sheet(
    frames: list[dict[str, Any]],
    output_path: Path,
    sheet_id: str,
    review_target_id: str,
) -> dict[str, Any]:
    cv2 = _import_cv2()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    columns = 5
    thumbnail_width = 320
    thumbnail_height = 134
    label_height = 32
    header_height = 42
    rows = max(1, math.ceil(len(frames) / columns))
    sheet = np.full(
        (header_height + rows * (thumbnail_height + label_height), columns * thumbnail_width, 3),
        255,
        dtype=np.uint8,
    )
    cv2.putText(
        sheet,
        f"{review_target_id} whole-match visual overview",
        (12, 28),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.68,
        (0, 0, 0),
        2,
        cv2.LINE_AA,
    )
    for index, frame in enumerate(frames):
        image_path = ROOT / frame["localFramePath"]
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            raise RuntimeError(f"Unable to read extracted frame: {image_path}")
        thumbnail = cv2.resize(image, (thumbnail_width, thumbnail_height), interpolation=cv2.INTER_AREA)
        column = index % columns
        row = index // columns
        x = column * thumbnail_width
        y = header_height + row * (thumbnail_height + label_height)
        sheet[y : y + thumbnail_height, x : x + thumbnail_width] = thumbnail
        label = (
            f"R {format_seconds(frame['replayElapsedSeconds'])}  "
            f"V {format_seconds(frame['mappedVideoTimestampSeconds'])}"
        )
        cv2.putText(
            sheet,
            label,
            (x + 7, y + thumbnail_height + 22),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.47,
            (0, 0, 0),
            1,
            cv2.LINE_AA,
        )
    written = cv2.imwrite(str(output_path), sheet, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    if not written:
        raise RuntimeError(f"Unable to write contact sheet: {output_path}")
    size_bytes = output_path.stat().st_size
    return {
        "sheetId": sheet_id,
        "reviewTargetId": review_target_id,
        "replayRange": {
            "startSeconds": frames[0]["replayElapsedSeconds"],
            "endSeconds": frames[-1]["replayElapsedSeconds"],
        },
        "frameIds": [frame["visualIndexFrameId"] for frame in frames],
        "localPath": relative(output_path),
        "sha256": sha256_file(output_path),
        "sizeBytes": size_bytes,
        "layout": {
            "columns": columns,
            "rows": rows,
            "thumbnailWidth": thumbnail_width,
            "thumbnailHeight": thumbnail_height,
            "frameCapacity": 25,
        },
    }


def build_contact_sheets(source: dict[str, Any], output_root: Path) -> dict[str, Any]:
    review_target_id = source["reviewTargetId"]
    frames = [frame for frame in source["frames"] if frame["extractionStatus"] == "decoded"]
    sheets = []
    for start in range(0, len(frames), 25):
        chunk = frames[start : start + 25]
        index = len(sheets) + 1
        sheet_id = f"{review_target_id}_sheet_{index:03d}"
        output_path = output_root / review_target_id / "contact-sheets" / f"{sheet_id}.jpg"
        sheets.append(build_sheet(chunk, output_path, sheet_id, review_target_id))
    return {
        "schemaVersion": 1,
        "reviewTargetId": review_target_id,
        "storagePolicy": "local_untracked_do_not_commit_images",
        "contactSheetCount": len(sheets),
        "frameCount": len(frames),
        "sheets": sheets,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build local whole-match visual overview contact sheets")
    parser.add_argument("--source", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()
    source = json.loads(Path(args.source).read_text(encoding="utf-8"))
    result = build_contact_sheets(source, Path(args.output_root))
    manifest = Path(args.manifest)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"contact_sheets={result['contactSheetCount']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
