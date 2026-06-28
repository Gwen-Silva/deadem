from pathlib import Path

import pytest

from deadem.video_pipeline.frame_extractor import build_regular_frame_requests, build_timestamp_frame_requests
from deadem.video_pipeline.schemas import FrameExtractionMode, VideoProcessingConfig


def test_regular_requests(tmp_path: Path) -> None:
    config = VideoProcessingConfig(video_path=tmp_path / "tiny.mp4", output_dir=tmp_path / "out", interval_ms=500, max_frames=3)
    requests = build_regular_frame_requests(config, duration_ms=5000)
    assert [request.requested_timestamp_ms for request in requests] == [0, 500, 1000]


def test_timestamp_requests_are_sorted_and_limited(tmp_path: Path) -> None:
    config = VideoProcessingConfig(
        video_path=tmp_path / "tiny.mp4",
        output_dir=tmp_path / "out",
        extraction_mode=FrameExtractionMode.TIMESTAMPS,
        timestamps_ms=[2000, 0, 1000],
        max_frames=2,
    )
    requests = build_timestamp_frame_requests(config)
    assert [request.requested_timestamp_ms for request in requests] == [0, 1000]


def test_missing_video_error_is_typed(tmp_path: Path) -> None:
    from deadem.video_pipeline.metadata import probe_video
    from deadem.video_pipeline.errors import VideoDecodeError

    config = VideoProcessingConfig(video_path=tmp_path / "missing.mp4", output_dir=tmp_path / "out")
    with pytest.raises(VideoDecodeError) as error:
        probe_video(config)
    assert error.value.error_code == "video_not_found"

