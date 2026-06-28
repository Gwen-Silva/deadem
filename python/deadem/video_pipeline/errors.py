from __future__ import annotations

from dataclasses import dataclass
from typing import Any


class VideoPipelineError(Exception):
    """Base exception that carries a stable error code."""

    def __init__(self, error_code: str, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.details = details or {}


class OptionalDependencyUnavailable(VideoPipelineError):
    def __init__(self, dependency: str, feature: str) -> None:
        super().__init__(
            "optional_dependency_unavailable",
            f"Optional dependency '{dependency}' is required for {feature}. Install the relevant extra or disable the feature.",
            details={"dependency": dependency, "feature": feature},
        )


class ConfigurationError(VideoPipelineError):
    pass


class VideoDecodeError(VideoPipelineError):
    pass


@dataclass(frozen=True)
class StageStatus:
    stage: str
    status: str
    message: str = ""

