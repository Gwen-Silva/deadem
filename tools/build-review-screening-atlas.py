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
CARDS_PER_PAGE = 6


def relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def format_seconds(value: float) -> str:
    minutes = int(value // 60)
    seconds = int(value % 60)
    return f"{minutes:02d}:{seconds:02d}"


def fit_text(cv2: Any, image: np.ndarray, text: str, origin: tuple[int, int], max_width: int, scale: float = 0.42) -> None:
    rendered = text
    while cv2.getTextSize(rendered, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)[0][0] > max_width and len(rendered) > 4:
        rendered = rendered[:-4] + "..."
    cv2.putText(image, rendered, origin, cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), 1, cv2.LINE_AA)


def build_card(card: dict[str, Any]) -> np.ndarray:
    cv2 = _import_cv2()
    card_width = 960
    card_height = 278
    header_height = 82
    image_width = 320
    image_height = 160
    label_height = 36
    canvas = np.full((card_height, card_width, 3), 255, dtype=np.uint8)
    fit_text(cv2, canvas, card["candidateWindowId"], (10, 22), 940, 0.50)
    replay = card["replayRange"]
    vod = card["visualVodRange"]
    line = (
        f"{card['reviewTargetId']} | priority {card['priorityTier']} | "
        f"replay {format_seconds(replay['start'])}-{format_seconds(replay['end'])} | "
        f"VOD {format_seconds(vod['start'])}-{format_seconds(vod['end'])} | sync +/-{card['syncEstimatedErrorSeconds']}s"
    )
    fit_text(cv2, canvas, line, (10, 47), 940, 0.38)
    fit_text(cv2, canvas, "sources: " + ", ".join(card["sourceFamilies"]), (10, 70), 940, 0.38)
    for index, frame in enumerate(card["visualFrames"]):
        image_path = ROOT / frame["localPath"]
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            raise RuntimeError(f"Unable to read Task203 source frame: {image_path}")
        thumbnail = cv2.resize(image, (image_width, image_height), interpolation=cv2.INTER_AREA)
        x = index * image_width
        canvas[header_height : header_height + image_height, x : x + image_width] = thumbnail
        fit_text(cv2, canvas, f"{frame['role']} | {frame['denseFrameId']}", (x + 7, card_height - 12), image_width - 14, 0.38)
    return canvas


def build_page(page: dict[str, Any], cards: list[dict[str, Any]], output_path: Path) -> dict[str, Any]:
    cv2 = _import_cv2()
    columns = 2
    rows = 3
    card_width = 960
    card_height = 278
    page_header = 46
    atlas = np.full((page_header + rows * card_height, columns * card_width, 3), 245, dtype=np.uint8)
    cv2.putText(atlas, f"{page['atlasPageId']} | chronological screening candidates", (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.70, (0, 0, 0), 2, cv2.LINE_AA)
    for index, card in enumerate(cards):
        card_image = build_card(card)
        column = index % columns
        row = index // columns
        x = column * card_width
        y = page_header + row * card_height
        atlas[y : y + card_height, x : x + card_width] = card_image
    output_path.parent.mkdir(parents=True, exist_ok=True)
    written = cv2.imwrite(str(output_path), atlas, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    if not written:
        raise RuntimeError(f"Unable to write screening atlas: {output_path}")
    return {
        "atlasPageId": page["atlasPageId"],
        "reviewTargetId": page["reviewTargetId"],
        "candidateWindowIds": page["candidateWindowIds"],
        "replayRange": page["replayRange"],
        "localPath": relative(output_path),
        "sha256": sha256_file(output_path),
        "sizeBytes": output_path.stat().st_size,
        "width": int(atlas.shape[1]),
        "height": int(atlas.shape[0]),
        "cards": [
            {
                "candidateWindowId": card["candidateWindowId"],
                "screeningCardId": card["screeningCardId"],
                "requestedSourceFrameIds": [frame["denseFrameId"] for frame in card["visualFrames"]],
                "sourceFrameHashes": [frame["sha256"] for frame in card["visualFrames"]],
            }
            for card in cards
        ],
    }


def build_atlas(source: dict[str, Any], output_root: Path) -> dict[str, Any]:
    review_target_id = source["reviewTargetId"]
    cards_by_id = {card["candidateWindowId"]: card for card in source["cards"]}
    pages = []
    for page in source["pages"]:
        cards = [cards_by_id[candidate_id] for candidate_id in page["candidateWindowIds"]]
        if len(cards) > CARDS_PER_PAGE:
            raise RuntimeError("Atlas page exceeds six screening cards")
        output_path = output_root / review_target_id / "screening-atlas" / f"{page['atlasPageId']}.jpg"
        pages.append(build_page(page, cards, output_path))
    return {
        "schemaVersion": 1,
        "reviewTargetId": review_target_id,
        "storagePolicy": "local_untracked_do_not_commit_images",
        "cardCount": len(source["cards"]),
        "pageCount": len(pages),
        "cardsPerPage": CARDS_PER_PAGE,
        "pages": pages,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build local six-card assisted review screening atlas")
    parser.add_argument("--source", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()
    source = json.loads(Path(args.source).read_text(encoding="utf-8"))
    result = build_atlas(source, Path(args.output_root))
    manifest = Path(args.manifest)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"atlas_pages={result['pageCount']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
