#!/usr/bin/env python3
"""Extract a bounded VOD audio range and transcribe it locally with faster-whisper."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import wave
from pathlib import Path

import av
import numpy as np
from local_asr_runtime import LocalAsrConfig, load_local_model, transcribe_with_model


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def deterministic_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(deterministic_json(value), encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def extract_audio(video: Path, output: Path, stream_index: int, start: float, end: float) -> dict:
    if end <= start:
        raise ValueError("video end must be greater than video start")
    container = av.open(str(video))
    stream = next((item for item in container.streams.audio if item.index == stream_index), None)
    if stream is None:
        raise ValueError(f"audio stream index {stream_index} not found")
    output.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 16000
    sample_count = 0
    resampler = av.AudioResampler(format="s16", layout="mono", rate=sample_rate)
    container.seek(int(start / float(stream.time_base)), stream=stream, backward=True, any_frame=False)
    with wave.open(str(output), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(sample_rate)
        done = False
        for packet in container.demux(stream):
            for frame in packet.decode():
                for converted in resampler.resample(frame):
                    if converted.pts is None:
                        continue
                    frame_start = float(converted.pts * converted.time_base)
                    frame_end = frame_start + converted.samples / sample_rate
                    if frame_end <= start:
                        continue
                    if frame_start >= end:
                        done = True
                        break
                    values = converted.to_ndarray().reshape(-1)
                    first = max(0, int(round((start - frame_start) * sample_rate)))
                    last = min(values.size, int(round((end - frame_start) * sample_rate)))
                    if last > first:
                        clipped = np.asarray(values[first:last], dtype="<i2")
                        target.writeframesraw(clipped.tobytes())
                        sample_count += int(clipped.size)
                if done:
                    break
            if done:
                break
    container.close()
    return {
        "method": "pyav_ffmpeg_library_audio_decode_and_resample",
        "audioStreamIndex": stream_index,
        "sourceCodec": stream.codec_context.name,
        "sourceSampleRate": stream.codec_context.sample_rate,
        "sourceChannels": stream.codec_context.channels,
        "videoStartSeconds": start,
        "videoEndSeconds": end,
        "requestedDurationSeconds": round(end - start, 3),
        "extractedDurationSeconds": round(sample_count / sample_rate, 3),
        "outputSampleRate": sample_rate,
        "outputChannels": 1,
        "outputFormat": "pcm_s16le_wav",
        "outputSizeBytes": output.stat().st_size,
        "outputSha256": sha256_file(output),
    }


def transcribe(args: argparse.Namespace, audio: Path) -> tuple[list[dict], list[dict], dict]:
    config = LocalAsrConfig(
        model=args.model, device=args.device, compute_type=args.compute_type,
        language=args.language, cpu_threads=args.cpu_threads,
    )
    model = load_local_model(config, args.download_root)
    return transcribe_with_model(model, audio, config)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--expected-size", type=int, required=True)
    parser.add_argument("--audio-stream-index", type=int, default=1)
    parser.add_argument("--video-start", type=float, required=True)
    parser.add_argument("--video-end", type=float, required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--language", default="pt")
    parser.add_argument("--cpu-threads", type=int, default=8)
    parser.add_argument("--output-root", type=Path, default=Path(".local/deadem/call-evidence"))
    parser.add_argument("--download-root", type=Path, default=Path(".local/deadem/call-evidence/models"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    target_root = args.output_root / args.target
    failure_path = target_root / "transcript" / "transcription-failure.json"
    try:
        if args.video.stat().st_size != args.expected_size:
            raise ValueError("source VOD size mismatch")
        source_sha = sha256_file(args.video)
        if source_sha.lower() != args.expected_sha256.lower():
            raise ValueError("source VOD SHA-256 mismatch")
        audio = target_root / "audio" / "mixed-16k-mono.wav"
        extraction = extract_audio(args.video, audio, args.audio_stream_index, args.video_start, args.video_end)
        extraction["reviewTargetId"] = args.target
        extraction["sourceVodSizeBytes"] = args.expected_size
        extraction["sourceVodSha256"] = source_sha
        write_json(target_root / "audio" / "extraction-metadata.json", extraction)
        segments, words, metadata = transcribe(args, audio)
        metadata["reviewTargetId"] = args.target
        write_jsonl(target_root / "transcript" / "raw-segments.jsonl", segments)
        write_jsonl(target_root / "transcript" / "raw-words.jsonl", words)
        write_json(target_root / "transcript" / "transcription-metadata.json", metadata)
        (target_root / "transcript" / "full-transcript.txt").write_text(
            "\n".join(segment["text"] for segment in segments) + "\n", encoding="utf-8"
        )
        if failure_path.exists():
            failure_path.unlink()
        print(deterministic_json({"target": args.target, "extraction": extraction, "transcription": metadata}), end="")
        return 0
    except Exception as error:  # noqa: BLE001 - failure must be represented locally
        write_json(failure_path, {
            "reviewTargetId": args.target,
            "status": "failed",
            "errorType": type(error).__name__,
            "message": str(error),
            "transcriptVersioned": False,
        })
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
