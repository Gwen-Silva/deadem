from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


class OpenAIClientError(RuntimeError):
    pass


@dataclass(frozen=True)
class AIResponse:
    text: str
    metadata: dict[str, Any]


REVIEW_JSON_SCHEMA: dict[str, Any] = {
    "name": "product_review",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "decision": {
                "type": "string",
                "enum": [
                    "APPROVE",
                    "APPROVE_WITH_CHANGES",
                    "REJECT",
                    "PAUSE_LINE",
                    "REQUEST_EXTERNAL_ORACLE",
                ],
            },
            "roi_score": {"type": "integer", "minimum": 1, "maximum": 5},
            "uncertainty_reduction_score": {"type": "integer", "minimum": 1, "maximum": 5},
            "implementation_cost": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH"]},
            "opportunity_cost": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH"]},
            "risk_of_infinite_diagnosis": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH"]},
            "blocking_issues": {"type": "array", "items": {"type": "string"}},
            "required_changes": {"type": "array", "items": {"type": "string"}},
            "codex_visible_instructions": {"type": "array", "items": {"type": "string"}},
            "strategic_only_notes": {"type": "array", "items": {"type": "string"}},
            "success_criteria_assessment": {"type": "string"},
            "stop_criteria_assessment": {"type": "string"},
            "roadmap_alignment": {"type": "string"},
            "next_state": {
                "type": "string",
                "enum": [
                    "CODEX_READY",
                    "NEEDS_STRATEGIC_AMENDMENT",
                    "REJECTED",
                    "PAUSED",
                    "REQUEST_EXTERNAL_ORACLE",
                ],
            },
        },
        "required": [
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
        ],
    },
    "strict": True,
}


class OpenAIClient:
    def __init__(self, api_key: str | None = None, timeout_seconds: int = 180) -> None:
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise OpenAIClientError("OPENAI_API_KEY is not set. Set it before running AI commands.")
        self.timeout_seconds = timeout_seconds

    def text(self, *, model: str, system: str, user: str) -> AIResponse:
        return self._call_with_retry(model=model, system=system, user=user, json_schema=None)

    def product_review_json(self, *, model: str, system: str, user: str) -> AIResponse:
        return self._call_with_retry(
            model=model,
            system=system,
            user=user,
            json_schema=REVIEW_JSON_SCHEMA,
        )

    def _call_with_retry(
        self,
        *,
        model: str,
        system: str,
        user: str,
        json_schema: dict[str, Any] | None,
    ) -> AIResponse:
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                return self._call(model=model, system=system, user=user, json_schema=json_schema)
            except Exception as exc:
                last_error = exc
                if attempt == 0 and self._is_transient(exc):
                    time.sleep(1.0)
                    continue
                break
        raise OpenAIClientError(str(last_error)) from last_error

    def _call(
        self,
        *,
        model: str,
        system: str,
        user: str,
        json_schema: dict[str, Any] | None,
    ) -> AIResponse:
        try:
            from openai import OpenAI  # type: ignore
        except ImportError:
            return self._call_http(model=model, system=system, user=user, json_schema=json_schema)

        client = OpenAI(api_key=self.api_key, timeout=self.timeout_seconds, max_retries=0)
        if not hasattr(client, "responses"):
            return self._call_http(model=model, system=system, user=user, json_schema=json_schema)
        text_format: dict[str, Any] | None = None
        if json_schema is not None:
            text_format = {"type": "json_schema", **json_schema}
        request_args: dict[str, Any] = {
            "model": model,
            "input": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if text_format is not None:
            request_args["text"] = {"format": text_format}
        try:
            response = client.responses.create(**request_args)
        except TypeError:
            fallback_args = {
                "model": model,
                "input": request_args["input"],
            }
            if json_schema is not None:
                fallback_args["response_format"] = {
                    "type": "json_schema",
                    "json_schema": json_schema,
                }
            response = client.responses.create(**fallback_args)
        text = getattr(response, "output_text", None)
        if not text:
            text = _extract_output_text(response.model_dump())
        metadata = {
            "id": getattr(response, "id", None),
            "model": model,
            "created_at": getattr(response, "created_at", None),
        }
        return AIResponse(text=text, metadata={k: v for k, v in metadata.items() if v is not None})

    def _call_http(
        self,
        *,
        model: str,
        system: str,
        user: str,
        json_schema: dict[str, Any] | None,
    ) -> AIResponse:
        payload: dict[str, Any] = {
            "model": model,
            "input": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if json_schema is not None:
            payload["text"] = {"format": {"type": "json_schema", **json_schema}}
        request = urllib.request.Request(
            "https://api.openai.com/v1/responses",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise OpenAIClientError(f"OpenAI API HTTP {exc.code}: {body[:500]}") from exc
        except urllib.error.URLError as exc:
            raise OpenAIClientError(f"OpenAI API request failed: {exc.reason}") from exc

        return AIResponse(
            text=_extract_output_text(data),
            metadata={
                "id": data.get("id"),
                "model": data.get("model", model),
                "created_at": data.get("created_at"),
            },
        )

    @staticmethod
    def _is_transient(exc: Exception) -> bool:
        text = str(exc).lower()
        return any(token in text for token in ("timeout", "temporarily", "rate limit", " 429", " 500", " 502", " 503", " 504"))


def _extract_output_text(data: dict[str, Any]) -> str:
    chunks: list[str] = []
    for item in data.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"} and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    if chunks:
        return "\n".join(chunks).strip()
    if isinstance(data.get("output_text"), str):
        return data["output_text"].strip()
    raise OpenAIClientError("OpenAI response did not contain text output")
