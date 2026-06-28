from __future__ import annotations

from pydantic import BaseModel, Field

from .schemas import BoundingBox


class RegionOfInterest(BaseModel):
    region_id: str
    name: str
    bbox: BoundingBox
    coordinate_space: str = "normalized"
    enabled_for_ocr: bool = False
    enabled_for_detection: bool = False
    preprocessing_profile: str = "none"
    warnings: list[str] = Field(default_factory=list)


def default_roi_profiles() -> dict[str, RegionOfInterest]:
    full = BoundingBox(x1=0, y1=0, x2=1, y2=1, coordinate_space="normalized")
    # These are deliberately broad placeholders; HUD coordinates must be
    # configured per resolution, aspect ratio, spectator mode, and HUD scale.
    return {
        "full_frame": RegionOfInterest(region_id="full_frame", name="Full frame", bbox=full, enabled_for_ocr=True, enabled_for_detection=True),
        "game_clock": RegionOfInterest(region_id="game_clock", name="Game clock", bbox=BoundingBox(x1=0.44, y1=0.0, x2=0.56, y2=0.08, coordinate_space="normalized"), enabled_for_ocr=True, warnings=["Profile is a configurable default, not universal."]),
        "minimap": RegionOfInterest(region_id="minimap", name="Minimap", bbox=BoundingBox(x1=0.68, y1=0.35, x2=1.0, y2=0.82, coordinate_space="normalized"), enabled_for_detection=True, warnings=["Profile varies by HUD scale and aspect ratio."]),
        "player_souls": RegionOfInterest(region_id="player_souls", name="Player souls", bbox=full),
        "team_status": RegionOfInterest(region_id="team_status", name="Team status", bbox=full),
        "ability_cooldowns": RegionOfInterest(region_id="ability_cooldowns", name="Ability cooldowns", bbox=full),
        "objective_status": RegionOfInterest(region_id="objective_status", name="Objective status", bbox=full),
        "kill_feed": RegionOfInterest(region_id="kill_feed", name="Kill feed", bbox=full),
        "center_screen": RegionOfInterest(region_id="center_screen", name="Center screen", bbox=BoundingBox(x1=0.25, y1=0.2, x2=0.75, y2=0.8, coordinate_space="normalized")),
    }

