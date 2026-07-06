from __future__ import annotations

import json
import re
from typing import Any


DECISIONS = {
    "APPROVE",
    "APPROVE_WITH_CHANGES",
    "REJECT",
    "PAUSE_LINE",
    "REQUEST_EXTERNAL_ORACLE",
}
COST_LEVELS = {"LOW", "MEDIUM", "HIGH"}
NEXT_STATES = {
    "CODEX_READY",
    "NEEDS_STRATEGIC_AMENDMENT",
    "REJECTED",
    "PAUSED",
    "REQUEST_EXTERNAL_ORACLE",
}

REQUIRED_REVIEW_FIELDS = {
    "decision",
    "roi_score",
    "uncertainty_reduction_score",
    "implementation_cost",
    "opportunity_cost",
    "risk_of_infinite_diagnosis",
    "blocking_issues",
    "required_changes",
    "codex_visible_instructions",
    "strategic_only_notes",
    "success_criteria_assessment",
    "stop_criteria_assessment",
    "roadmap_alignment",
    "next_state",
}

SAFE_REVIEW_DEFAULTS: dict[str, Any] = {
    "blocking_issues": [],
    "required_changes": [],
    "codex_visible_instructions": [],
    "strategic_only_notes": [],
    "success_criteria_assessment": "",
    "stop_criteria_assessment": "",
    "roadmap_alignment": "",
}


class ReviewValidationError(ValueError):
    pass


def validate_product_review(data: dict[str, Any]) -> dict[str, Any]:
    missing = sorted(REQUIRED_REVIEW_FIELDS - set(data))
    if missing:
        raise ReviewValidationError(f"Missing required review fields: {', '.join(missing)}")

    if data["decision"] not in DECISIONS:
        raise ReviewValidationError(f"Invalid decision: {data['decision']}")
    if data["implementation_cost"] not in COST_LEVELS:
        raise ReviewValidationError(f"Invalid implementation_cost: {data['implementation_cost']}")
    if data["opportunity_cost"] not in COST_LEVELS:
        raise ReviewValidationError(f"Invalid opportunity_cost: {data['opportunity_cost']}")
    if data["risk_of_infinite_diagnosis"] not in COST_LEVELS:
        raise ReviewValidationError(
            f"Invalid risk_of_infinite_diagnosis: {data['risk_of_infinite_diagnosis']}"
        )
    if data["next_state"] not in NEXT_STATES:
        raise ReviewValidationError(f"Invalid next_state: {data['next_state']}")

    for field in ("roi_score", "uncertainty_reduction_score"):
        value = data[field]
        if not isinstance(value, int) or not 1 <= value <= 5:
            raise ReviewValidationError(f"{field} must be an integer from 1 to 5")

    for field in (
        "blocking_issues",
        "required_changes",
        "codex_visible_instructions",
        "strategic_only_notes",
    ):
        if not isinstance(data[field], list) or not all(isinstance(item, str) for item in data[field]):
            raise ReviewValidationError(f"{field} must be a list of strings")

    for field in (
        "success_criteria_assessment",
        "stop_criteria_assessment",
        "roadmap_alignment",
    ):
        if not isinstance(data[field], str):
            raise ReviewValidationError(f"{field} must be a string")

    expected_next_state = {
        "APPROVE": "CODEX_READY",
        "APPROVE_WITH_CHANGES": "NEEDS_STRATEGIC_AMENDMENT",
        "REJECT": "REJECTED",
        "PAUSE_LINE": "PAUSED",
        "REQUEST_EXTERNAL_ORACLE": "REQUEST_EXTERNAL_ORACLE",
    }[data["decision"]]
    if data["next_state"] != expected_next_state:
        raise ReviewValidationError(
            f"next_state must be {expected_next_state} for decision {data['decision']}"
        )

    return data


def parse_and_validate_product_review(raw: str) -> dict[str, Any]:
    data = extract_json_object(raw)
    return validate_product_review(data)


def normalize_safe_review_defaults(data: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(data)
    for key, value in SAFE_REVIEW_DEFAULTS.items():
        if key not in normalized:
            normalized[key] = list(value) if isinstance(value, list) else value
    return normalized


def extract_json_object(raw: str) -> dict[str, Any]:
    for fenced in re.findall(r"```(?:json)?\s*(.*?)```", raw, flags=re.IGNORECASE | re.DOTALL):
        try:
            data = json.loads(fenced.strip())
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            return data

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = None
    if not isinstance(data, dict):
        decoder = json.JSONDecoder()
        for index, char in enumerate(raw):
            if char != "{":
                continue
            try:
                candidate, _ = decoder.raw_decode(raw[index:])
            except json.JSONDecodeError:
                continue
            if isinstance(candidate, dict):
                return candidate
        raise ReviewValidationError("Reviewer response did not contain a parseable JSON object")
    return data
