from pathlib import Path

from deadem.video_pipeline.annotations import build_annotation_frame_requests, load_annotations, parse_timestamp


def test_parse_timestamps() -> None:
    assert parse_timestamp("00:01") == 1000
    assert parse_timestamp("01:02.500") == 62500
    assert parse_timestamp("00:01:02.500") == 62500


def test_csv_annotations_to_start_mid_end(tmp_path: Path) -> None:
    csv_path = tmp_path / "annotations.csv"
    csv_path.write_text("annotation_id,start,end,label\nE001,00:10,00:20,spawn\n", encoding="utf-8")
    annotations = load_annotations(csv_path)
    requests = build_annotation_frame_requests(annotations)
    assert len(annotations) == 1
    assert [request.requested_timestamp_ms for request in requests] == [10000, 15000, 20000]
    assert all(request.annotation_id == "E001" for request in requests)

