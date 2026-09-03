"""Local fixed-slot visual extraction only. No replay or audio decoding."""
import hashlib
import json
import sys
from pathlib import Path

import av
import cv2

ROOT = Path(__file__).resolve().parents[2]
TARGETS = ("review_match_003", "review_match_004")


def sha256_file(file):
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract(target):
    if target not in TARGETS:
        raise ValueError("unauthorized_target_before_filesystem")
    local = ROOT / ".local/deadem/dense-review" / target
    plan = json.loads((local / "extraction-plan.json").read_text(encoding="utf-8"))
    manifest = json.loads((ROOT / "output/local-replay-processing/review-onboarding/task211-matches-003-004/manifest.json").read_text(encoding="utf-8"))
    expected = next(item["video"] for item in manifest["targets"] if item["reviewTargetId"] == target)
    slot = ROOT / ".local/deadem/review-targets" / target / "video"
    if slot.resolve() != slot:
        raise ValueError("redirected_video_slot")
    files = list(slot.glob("*.mp4"))
    if len(files) != 1 or files[0].resolve().parent != slot:
        raise ValueError("ambiguous_video_slot")
    video = files[0]
    if video.stat().st_size != expected["sizeBytes"] or sha256_file(video) != expected["sha256"]:
        raise ValueError("task211_video_identity_mismatch")
    print(f"{target}: VOD identity verified", flush=True)
    frame_dir = local / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    with av.open(str(video)) as container:
        stream = container.streams.video[0]
        stream.thread_type = "AUTO"
        for index, request in enumerate(plan["rows"]):
            target_seconds = request["requestedVodSeconds"]
            container.seek(int(target_seconds / stream.time_base), stream=stream, backward=True)
            previous = None
            chosen = None
            for frame in container.decode(stream):
                if frame.time is None:
                    continue
                if frame.time >= target_seconds:
                    chosen = frame if previous is None or abs(frame.time - target_seconds) < abs(previous.time - target_seconds) else previous
                    break
                previous = frame
            chosen = chosen or previous
            row = dict(request)
            if chosen is None or abs(chosen.time - target_seconds) > 0.1:
                row.update(extractionStatus="failed", localPath=None, frameSha256=None)
            else:
                image = chosen.to_ndarray(format="bgr24")
                image = cv2.resize(image, (1280, 536), interpolation=cv2.INTER_AREA)
                file = frame_dir / f'{request["denseFrameId"]}.jpg'
                if not cv2.imwrite(str(file), image, [cv2.IMWRITE_JPEG_QUALITY, 90]):
                    raise RuntimeError("frame_write_failed")
                row.update(extractionStatus="decoded", decodedTimestampMs=round(chosen.time * 1000, 3),
                           seekErrorMs=round(chosen.time * 1000 - request["requestedTimestampMs"], 3),
                           localPath=file.relative_to(ROOT).as_posix(), frameSha256=sha256_file(file),
                           sizeBytes=file.stat().st_size, width=1280, height=536,
                           provenance="factual/local_video_decoded_frame_without_interpretation")
            rows.append(row)
            if (index + 1) % 200 == 0:
                print(f"{target}: {index + 1}/{len(plan['rows'])} frames", flush=True)
    result = {"schemaVersion": 1, "reviewTargetId": target, "videoIdentityVerified": True,
              "videoSha256": expected["sha256"], "videoSizeBytes": expected["sizeBytes"], "frames": rows}
    (local / "frame-evidence-index.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"{target}: completed {len(rows)} frames", flush=True)


if __name__ == "__main__":
    extract(sys.argv[1])
