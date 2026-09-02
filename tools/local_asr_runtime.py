"""Shared deterministic faster-whisper runtime for local bounded audio."""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

from faster_whisper import WhisperModel


@dataclass(frozen=True)
class LocalAsrConfig:
    model: str = "small"
    device: str = "cpu"
    compute_type: str = "int8"
    language: str = "pt"
    cpu_threads: int = 8
    beam_size: int = 1
    best_of: int = 1
    temperature: int = 0
    min_silence_duration_ms: int = 500
    word_timestamps: bool = True
    condition_on_previous_text: bool = False


def load_local_model(config: LocalAsrConfig, download_root: Path) -> WhisperModel:
    return WhisperModel(
        config.model,
        device=config.device,
        compute_type=config.compute_type,
        download_root=str(download_root),
        cpu_threads=config.cpu_threads,
    )


def transcribe_with_model(model: WhisperModel, audio: Path, config: LocalAsrConfig):
    started = time.perf_counter()
    iterator, info = model.transcribe(
        str(audio),
        language=config.language,
        beam_size=config.beam_size,
        best_of=config.best_of,
        temperature=config.temperature,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": config.min_silence_duration_ms},
        word_timestamps=config.word_timestamps,
        condition_on_previous_text=config.condition_on_previous_text,
    )
    segments: list[dict] = []
    words: list[dict] = []
    for segment in iterator:
        segment_words = []
        for word in segment.words or []:
            word_row = {
                "startSeconds": round(float(word.start), 3),
                "endSeconds": round(float(word.end), 3),
                "word": word.word,
                "probability": round(float(word.probability), 6),
            }
            segment_words.append(word_row)
            words.append({"segmentOrdinal": len(segments) + 1, **word_row})
        segments.append({
            "ordinal": len(segments) + 1,
            "startSeconds": round(float(segment.start), 3),
            "endSeconds": round(float(segment.end), 3),
            "text": segment.text.strip(),
            "language": info.language,
            "engine": "faster-whisper",
            "model": config.model,
            "device": config.device,
            "computeType": config.compute_type,
            "averageLogProbability": round(float(segment.avg_logprob), 6),
            "noSpeechProbability": round(float(segment.no_speech_prob), 6),
            "temperature": round(float(segment.temperature), 3),
            "vadApplied": True,
            "words": segment_words,
        })
    elapsed = time.perf_counter() - started
    metadata = {
        "engine": "faster-whisper",
        "engineVersion": __import__("faster_whisper").__version__,
        "model": config.model,
        "device": config.device,
        "computeType": config.compute_type,
        "cpuThreads": config.cpu_threads,
        "languageHint": config.language,
        "detectedLanguage": info.language,
        "detectedLanguageProbability": round(float(info.language_probability), 6),
        "vad": {"enabled": True, "minSilenceDurationMs": config.min_silence_duration_ms},
        "wordTimestamps": config.word_timestamps,
        "beamSize": config.beam_size,
        "bestOf": config.best_of,
        "temperature": config.temperature,
        "conditionOnPreviousText": config.condition_on_previous_text,
        "segmentCount": len(segments),
        "wordTimestampCount": len(words),
        "processingTimeSeconds": round(elapsed, 3),
    }
    return segments, words, metadata
