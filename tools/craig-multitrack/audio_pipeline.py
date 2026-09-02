#!/usr/bin/env python3
"""Probe, normalize and transcribe only a deterministic Craig validation canary."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
import wave
from pathlib import Path

import av
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from local_asr_runtime import LocalAsrConfig, load_local_model, transcribe_with_model  # noqa: E402


SAMPLE_RATE = 16000
WINDOW_SECONDS = 0.25
WINDOW_SAMPLES = int(SAMPLE_RATE * WINDOW_SECONDS)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def activity_regions(rms_values: list[float], duration: float) -> tuple[list[dict], float]:
    positive = np.asarray([value for value in rms_values if value > 1], dtype=np.float64)
    threshold = 80.0 if positive.size == 0 else max(80.0, float(np.percentile(positive, 30)) * 0.4)
    active = [index for index, value in enumerate(rms_values) if value >= threshold]
    merged: list[tuple[float, float]] = []
    for index in active:
        start = index * WINDOW_SECONDS
        end = min(duration, start + WINDOW_SECONDS)
        if merged and start - merged[-1][1] <= 0.5:
            merged[-1] = (merged[-1][0], end)
        else:
            merged.append((start, end))
    regions: list[dict] = []
    for start, end in merged:
        if end - start < 0.5:
            continue
        cursor = start
        while cursor < end:
            chunk_end = min(end, cursor + 8.0)
            center = (cursor + chunk_end) / 2
            bounded_start = max(0.0, center - max(1.5, (chunk_end - cursor) / 2))
            bounded_end = min(duration, max(bounded_start + 3.0, center + max(1.5, (chunk_end - cursor) / 2)))
            bounded_start = max(0.0, bounded_end - min(10.0, bounded_end - bounded_start))
            regions.append({"startSeconds": round(bounded_start, 3), "endSeconds": round(bounded_end, 3)})
            cursor = chunk_end
    return regions, round(threshold, 3)


def normalize_track(source: Path, output: Path) -> dict:
    container = av.open(str(source))
    stream = container.streams.audio[0]
    codec = stream.codec_context.name
    source_rate = stream.codec_context.sample_rate
    source_channels = stream.codec_context.channels
    resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
    output.parent.mkdir(parents=True, exist_ok=True)
    first_timestamp = None
    last_timestamp = None
    sample_count = 0
    rms_values: list[float] = []
    pending = np.empty(0, dtype=np.int16)
    with wave.open(str(output), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(SAMPLE_RATE)
        for packet in container.demux(stream):
            for frame in packet.decode():
                if frame.pts is not None:
                    frame_start = float(frame.pts * frame.time_base)
                    frame_end = frame_start + float(frame.samples / (frame.sample_rate or source_rate))
                    first_timestamp = frame_start if first_timestamp is None else min(first_timestamp, frame_start)
                    last_timestamp = frame_end if last_timestamp is None else max(last_timestamp, frame_end)
                for converted in resampler.resample(frame):
                    values = np.asarray(converted.to_ndarray().reshape(-1), dtype="<i2")
                    target.writeframesraw(values.tobytes())
                    sample_count += int(values.size)
                    pending = np.concatenate((pending, values))
                    while pending.size >= WINDOW_SAMPLES:
                        window = pending[:WINDOW_SAMPLES].astype(np.float64)
                        pending = pending[WINDOW_SAMPLES:]
                        rms_values.append(float(math.sqrt(np.mean(window * window))))
        for converted in resampler.resample(None):
            values = np.asarray(converted.to_ndarray().reshape(-1), dtype="<i2")
            target.writeframesraw(values.tobytes())
            sample_count += int(values.size)
            pending = np.concatenate((pending, values))
        if pending.size:
            window = pending.astype(np.float64)
            rms_values.append(float(math.sqrt(np.mean(window * window))))
    container.close()
    duration = sample_count / SAMPLE_RATE
    regions, threshold = activity_regions(rms_values, duration)
    return {
        "codec": codec,
        "sampleRate": source_rate,
        "channels": source_channels,
        "durationSeconds": round(duration, 3),
        "firstTimestampSeconds": round(first_timestamp or 0.0, 3),
        "lastTimestampSeconds": round(last_timestamp or duration, 3),
        "decodeSmoke": sample_count > 0,
        "normalizedSampleRate": SAMPLE_RATE,
        "normalizedChannels": 1,
        "normalizedDurationSeconds": round(duration, 3),
        "normalizedSha256": sha256_file(output),
        "normalizedSizeBytes": output.stat().st_size,
        "activityThresholdRms": threshold,
        "activityRegions": regions,
    }


def deterministic_selection(tracks: list[dict], count: int) -> list[dict]:
    selected: list[dict] = []
    remaining: list[dict] = []
    for track in tracks:
        regions = track["activityRegions"]
        indexes = []
        if len(regions) >= 2:
            indexes = [int((len(regions) - 1) / 3), int(2 * (len(regions) - 1) / 3)]
        elif regions:
            indexes = [0]
        indexes = list(dict.fromkeys(indexes))
        for index, region in enumerate(regions):
            row = {"trackOrdinal": track["trackOrdinal"], **region}
            (selected if index in indexes else remaining).append(row)
    remaining.sort(key=lambda row: (row["startSeconds"], row["trackOrdinal"]))
    while len(selected) < count and remaining:
        selected.append(remaining.pop(0))
    if len(selected) != count:
        raise ValueError("insufficient_activity_regions_for_canary")
    selected.sort(key=lambda row: (row["startSeconds"], row["trackOrdinal"]))
    for index, row in enumerate(selected):
        row["sampleId"] = f"craig_sample_{index + 1:02d}"
    return selected


def write_clip(source_wav: Path, output: Path, start: float, end: float) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(source_wav), "rb") as source, wave.open(str(output), "wb") as target:
        target.setparams((1, 2, SAMPLE_RATE, 0, "NONE", "not compressed"))
        source.setpos(max(0, int(round(start * SAMPLE_RATE))))
        target.writeframes(source.readframes(max(1, int(round((end - start) * SAMPLE_RATE)))))


def overlap_metrics(regions: list[dict]) -> dict:
    count = 0
    duration = 0.0
    for left_index, left in enumerate(regions):
        for right in regions[left_index + 1:]:
            if left["trackOrdinal"] == right["trackOrdinal"]:
                continue
            overlap = min(left["endSeconds"], right["endSeconds"]) - max(left["startSeconds"], right["startSeconds"])
            if overlap > 0:
                count += 1
                duration += overlap
    return {"overlapPairCount": count, "overlapDurationSeconds": round(duration, 3)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--intake", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--model-root", type=Path, required=True)
    args = parser.parse_args()
    intake = json.loads(args.intake.read_text(encoding="utf-8"))
    args.output_root.mkdir(parents=True, exist_ok=True)
    normalized_root = args.output_root / "normalized"
    validation_root = args.output_root / "validation"
    processed = []
    normalization_started = time.perf_counter()
    for track in intake["tracks"]:
        normalized_path = normalized_root / f"track_{track['trackOrdinal']:02d}.wav"
        probe = normalize_track(Path(track["sourceAudioPath"]), normalized_path)
        processed.append({**track, **probe, "normalizedAudioPath": str(normalized_path.resolve()),
                          "startTimeSeconds": probe["firstTimestampSeconds"],
                          "timelineStatus": "measured" if probe["decodeSmoke"] else "invalid"})
    normalization_seconds = round(time.perf_counter() - normalization_started, 3)
    selected = deterministic_selection(processed, 18)
    config = LocalAsrConfig()
    model = load_local_model(config, args.model_root)
    samples = []
    asr_started = time.perf_counter()
    for row in selected:
        track = next(item for item in processed if item["trackOrdinal"] == row["trackOrdinal"])
        clip_path = validation_root / "clips" / f"{row['sampleId']}.wav"
        write_clip(Path(track["normalizedAudioPath"]), clip_path, row["startSeconds"], row["endSeconds"])
        segments, words, metadata = transcribe_with_model(model, clip_path, config)
        transcript = " ".join(segment["text"] for segment in segments).strip()
        shifted_words = [{**word, "recordingStartSeconds": round(row["startSeconds"] + word["startSeconds"], 3),
                          "recordingEndSeconds": round(row["startSeconds"] + word["endSeconds"], 3)} for word in words]
        samples.append({
            "sampleId": row["sampleId"], "trackOrdinal": row["trackOrdinal"],
            "speaker": {"status": "track_attributed", "sourceSpeakerId": track["sourceSpeakerId"], "displayName": track["sourceDisplayName"]},
            "recordingStartSeconds": row["startSeconds"], "recordingEndSeconds": row["endSeconds"],
            "audioClipPath": str(clip_path.resolve()), "asrTranscript": transcript, "asrWords": shifted_words,
            "asrSegments": segments, "transcriptionMetadata": metadata,
            "humanTranscript": None, "humanClassification": None, "humanNotes": None,
        })
    asr_seconds = round(time.perf_counter() - asr_started, 3)
    validation = {
        "recordingId": intake["recording"]["recordingId"],
        "allowedHumanClassifications": ["correct", "usable_with_minor_error", "materially_wrong", "unintelligible"],
        "semanticAuthority": "human_semantic_classification",
        "samples": samples,
    }
    write_json(validation_root / "validation-sheet.json", validation)
    lines = ["# Craig multitrack — validação humana", "", "Classifique semanticamente após ouvir cada clip.", ""]
    for sample in samples:
        lines.extend([f"## {sample['sampleId']} — track_{sample['trackOrdinal']:02d}",
                      f"- recording: {sample['recordingStartSeconds']}–{sample['recordingEndSeconds']}s",
                      f"- clip: `{sample['audioClipPath']}`", f"- ASR: {sample['asrTranscript']}",
                      "- humanTranscript: null", "- humanClassification: null", "- humanNotes: null", ""])
    (validation_root / "validation-sheet.md").write_text("\n".join(lines), encoding="utf-8")
    write_json(validation_root / "recording-private-metadata.json", {"recording": intake["recording"], "tracks": processed})
    all_regions = [{"trackOrdinal": track["trackOrdinal"], **region} for track in processed for region in track["activityRegions"]]
    distribution = {f"track_{track['trackOrdinal']:02d}": sum(1 for sample in samples if sample["trackOrdinal"] == track["trackOrdinal"]) for track in processed}
    result = {
        "recordingId": intake["recording"]["recordingId"],
        "trackCount": len(processed),
        "tracks": [{key: track[key] for key in ["trackOrdinal", "codec", "sampleRate", "channels", "durationSeconds", "firstTimestampSeconds", "lastTimestampSeconds", "decodeSmoke", "normalizedSampleRate", "normalizedChannels", "normalizedDurationSeconds"]} | {"trackRef": f"track_{track['trackOrdinal']:02d}", "activityRegionCount": len(track["activityRegions"])} for track in processed],
        "activityRegions": all_regions,
        "sampleCount": len(samples), "sampleDistribution": distribution,
        "normalizationProcessingTimeSeconds": normalization_seconds,
        "asrProcessingTimeSeconds": asr_seconds,
        "asrConfiguration": {"engine": "faster-whisper", "model": "small", "device": "cpu", "computeType": "int8", "language": "pt", "beamSize": 1, "bestOf": 1, "temperature": 0, "vad": True, "minSilenceDurationMs": 500, "wordTimestamps": True, "conditionOnPreviousText": False, "hotwords": False},
        **overlap_metrics(all_regions),
    }
    write_json(args.output_root / "pipeline-result.json", result)
    print(json.dumps({key: result[key] for key in ["trackCount", "sampleCount", "sampleDistribution", "normalizationProcessingTimeSeconds", "asrProcessingTimeSeconds", "overlapPairCount", "overlapDurationSeconds"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
