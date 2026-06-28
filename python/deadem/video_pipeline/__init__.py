"""Reusable local-video evidence pipeline for Deadem.

The package turns local video files into structured evidence. It does not
interpret Deadlock macro, rotations, fights, intent, or decision quality.
"""

from .pipeline import process_video
from .schemas import VideoPipelineResult, VideoProcessingConfig

__all__ = ["VideoProcessingConfig", "VideoPipelineResult", "process_video"]

