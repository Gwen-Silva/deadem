from __future__ import annotations

from collections.abc import Protocol

from .schemas import ProcessingStatus, VLMNote


class VideoLanguageModelAdapter(Protocol):
    def describe_clip(self, video_path: str, start_ms: int, end_ms: int, prompt: str) -> VLMNote:
        ...


class UnconfiguredVideoLLaMA3Adapter:
    def __init__(self, config: dict | None = None) -> None:
        self.config = config or {}

    def describe_clip(self, video_path: str, start_ms: int, end_ms: int, prompt: str) -> VLMNote:
        return VLMNote(
            video_path=video_path,
            start_ms=start_ms,
            end_ms=end_ms,
            prompt=prompt,
            response=None,
            model_name="VideoLLaMA3",
            model_version=None,
            sampling_strategy="unconfigured",
            status=ProcessingStatus.SKIPPED_UNAVAILABLE,
            warnings=[
                "VideoLLaMA3 is not installed or configured.",
                "No model downloads or GPU initialization were attempted.",
                "VLM responses must never be stored as confirmed ground truth.",
            ],
        )

