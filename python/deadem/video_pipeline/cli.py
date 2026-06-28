from __future__ import annotations

import argparse
from pathlib import Path

from .schemas import FrameExtractionMode, TrackerBackend, VideoProcessingConfig
from .pipeline import process_video


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deadem local video evidence pipeline")
    parser.add_argument("--video", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--decoder", default="opencv")
    parser.add_argument("--sample-fps", type=float)
    parser.add_argument("--interval-ms", type=int)
    parser.add_argument("--timestamps-file")
    parser.add_argument("--annotations")
    parser.add_argument("--annotation-frames", default="start,midpoint,end")
    parser.add_argument("--start-ms", type=int, default=0)
    parser.add_argument("--end-ms", type=int)
    parser.add_argument("--max-frames", type=int)
    parser.add_argument("--image-format", default="jpg", choices=["jpg", "jpeg", "png"])
    parser.add_argument("--jpeg-quality", type=int, default=90)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--enable-detection", action="store_true")
    parser.add_argument("--detection-model")
    parser.add_argument("--detection-confidence", type=float, default=0.25)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--enable-ocr", action="store_true")
    parser.add_argument("--ocr-language", default="en")
    parser.add_argument("--ocr-region", action="append", default=[])
    parser.add_argument("--enable-tracking", action="store_true")
    parser.add_argument("--tracker", default="iou_fallback")
    parser.add_argument("--enable-vlm", action="store_true")
    parser.add_argument("--offline", action="store_true", default=True)
    parser.add_argument("--no-model-download", action="store_true", default=True)
    parser.add_argument("--log-level", default="INFO")
    parser.add_argument("--log-json", action="store_true")
    return parser.parse_args(argv)


def load_timestamps(path: str | None) -> list[int] | None:
    if not path:
        return None
    values = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        values.append(int(float(line)))
    return values


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    timestamps = load_timestamps(args.timestamps_file)
    mode = FrameExtractionMode.REGULAR
    if timestamps:
        mode = FrameExtractionMode.TIMESTAMPS
    if args.annotations:
        mode = FrameExtractionMode.ANNOTATION_WINDOWS
    config = VideoProcessingConfig(
        video_path=Path(args.video),
        output_dir=Path(args.output),
        decoder_backend=args.decoder,
        device=args.device,
        extraction_mode=mode,
        sample_fps=args.sample_fps,
        interval_ms=args.interval_ms,
        timestamps_ms=timestamps,
        start_ms=args.start_ms,
        end_ms=args.end_ms,
        max_frames=args.max_frames,
        image_format=args.image_format,
        jpeg_quality=args.jpeg_quality,
        overwrite_existing=args.overwrite,
        enable_detection=args.enable_detection,
        detection_model=args.detection_model,
        detection_confidence=args.detection_confidence,
        enable_ocr=args.enable_ocr,
        ocr_language=args.ocr_language,
        ocr_regions=args.ocr_region,
        enable_tracking=args.enable_tracking,
        tracker_backend=TrackerBackend(args.tracker),
        enable_vlm=args.enable_vlm,
        annotation_file=Path(args.annotations) if args.annotations else None,
        annotation_frames=[item.strip() for item in args.annotation_frames.split(",") if item.strip()],
        offline=args.offline,
        allow_model_download=not args.no_model_download,
        log_level=args.log_level,
        log_json=args.log_json,
    )
    result = process_video(config)
    print(f"status={result.status.value}")
    print(f"result={result.output_files.get('result')}")
    return 0 if not result.status.value.startswith("failed") else 1


if __name__ == "__main__":
    raise SystemExit(main())

