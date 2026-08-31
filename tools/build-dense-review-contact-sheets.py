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
PAGE_CAPACITY = 25


def relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def format_seconds(value: float) -> str:
    minutes = int(value // 60)
    seconds = value - (minutes * 60)
    return f"{minutes:02d}:{seconds:04.1f}"


def build_page(
    window: dict[str, Any],
    frames: list[dict[str, Any]],
    output_path: Path,
    storyboard_id: str,
    page_number: int,
    page_count: int,
) -> dict[str, Any]:
    cv2 = _import_cv2()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    columns = 5
    thumbnail_width = 320
    thumbnail_height = 134
    label_height = 32
    header_height = 72
    rows = max(1, math.ceil(len(frames) / columns))
    sheet = np.full(
        (header_height + rows * (thumbnail_height + label_height), columns * thumbnail_width, 3),
        255,
        dtype=np.uint8,
    )
    header = (
        f"{window['candidateWindowId']} | replay approx "
        f"{format_seconds(window['replayStartSeconds'])}-{format_seconds(window['replayEndSeconds'])} | "
        f"priority {window['priorityTier']}"
    )
    detail = (
        f"sync uncertainty +/-{window['syncEstimatedErrorSeconds']}s | "
        f"storyboard {page_number}/{page_count}"
    )
    cv2.putText(sheet, header, (12, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.56, (0, 0, 0), 1, cv2.LINE_AA)
    cv2.putText(sheet, detail, (12, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.54, (0, 0, 0), 1, cv2.LINE_AA)
    for index, frame in enumerate(frames):
        image_path = ROOT / frame["localPath"]
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            raise RuntimeError(f"Unable to read extracted frame: {image_path}")
        thumbnail = cv2.resize(image, (thumbnail_width, thumbnail_height), interpolation=cv2.INTER_AREA)
        column = index % columns
        row = index // columns
        x = column * thumbnail_width
        y = header_height + row * (thumbnail_height + label_height)
        sheet[y : y + thumbnail_height, x : x + thumbnail_width] = thumbnail
        label = f"VOD {format_seconds(frame['requestedVodSeconds'])} | {frame['denseFrameId'].split('_')[-1]}"
        cv2.putText(
            sheet,
            label,
            (x + 7, y + thumbnail_height + 22),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 0, 0),
            1,
            cv2.LINE_AA,
        )
    written = cv2.imwrite(str(output_path), sheet, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    if not written:
        raise RuntimeError(f"Unable to write contact sheet: {output_path}")
    return {
        "storyboardId": storyboard_id,
        "candidateWindowId": window["candidateWindowId"],
        "reviewTargetId": window["reviewTargetId"],
        "pageNumber": page_number,
        "pageCount": page_count,
        "denseFrameIds": [frame["denseFrameId"] for frame in frames],
        "localPath": relative(output_path),
        "sha256": sha256_file(output_path),
        "sizeBytes": output_path.stat().st_size,
        "layout": {
            "columns": columns,
            "rows": rows,
            "thumbnailWidth": thumbnail_width,
            "thumbnailHeight": thumbnail_height,
            "frameCapacity": PAGE_CAPACITY,
        },
    }


def build_contact_sheets(source: dict[str, Any], output_root: Path) -> dict[str, Any]:
    review_target_id = source["reviewTargetId"]
    windows = []
    all_pages = []
    for window in source["windows"]:
        frames = sorted(window["frames"], key=lambda frame: (frame["requestedTimestampMs"], frame["denseFrameId"]))
        page_count = math.ceil(len(frames) / PAGE_CAPACITY) if frames else 0
        pages = []
        for start in range(0, len(frames), PAGE_CAPACITY):
            chunk = frames[start : start + PAGE_CAPACITY]
            page_number = len(pages) + 1
            storyboard_id = f"{window['candidateWindowId']}_storyboard_{page_number:03d}"
            output_path = output_root / review_target_id / "contact-sheets" / f"{storyboard_id}.jpg"
            page = build_page(window, chunk, output_path, storyboard_id, page_number, page_count)
            pages.append(page)
            all_pages.append(page)
        windows.append({"candidateWindowId": window["candidateWindowId"], "pages": pages})
    return {
        "schemaVersion": 1,
        "reviewTargetId": review_target_id,
        "storagePolicy": "local_untracked_do_not_commit_images",
        "windowCount": len(windows),
        "pageCount": len(all_pages),
        "windows": windows,
        "pages": all_pages,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build local dense review storyboards")
    parser.add_argument("--source", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()
    source = json.loads(Path(args.source).read_text(encoding="utf-8"))
    result = build_contact_sheets(source, Path(args.output_root))
    manifest = Path(args.manifest)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"storyboard_pages={result['pageCount']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
