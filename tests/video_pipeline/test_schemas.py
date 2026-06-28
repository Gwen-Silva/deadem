from pathlib import Path

import pytest
from pydantic import ValidationError

from deadem.video_pipeline.schemas import BoundingBox, FrameExtractionMode, TrackerBackend, VideoProcessingConfig


def test_valid_config_minimal(tmp_path: Path) -> None:
    config = VideoProcessingConfig(video_path=tmp_path / "sample.mp4", output_dir=tmp_path / "out", sample_fps=1)
    assert config.extraction_mode == FrameExtractionMode.REGULAR


def test_bbox_validation() -> None:
    with pytest.raises(ValidationError):
        BoundingBox(x1=10, y1=0, x2=1, y2=5)


def test_sampling_modes_are_not_ambiguous(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        VideoProcessingConfig(
            video_path=tmp_path / "sample.mp4",
            output_dir=tmp_path / "out",
            sample_fps=1,
            interval_ms=1000,
        )


def test_start_before_end(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        VideoProcessingConfig(video_path=tmp_path / "sample.mp4", output_dir=tmp_path / "out", start_ms=2000, end_ms=1000)


def test_tracking_requires_compatible_source(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        VideoProcessingConfig(
            video_path=tmp_path / "sample.mp4",
            output_dir=tmp_path / "out",
            enable_tracking=True,
            tracker_backend=TrackerBackend.ULTRALYTICS_BYTETRACK,
        )

