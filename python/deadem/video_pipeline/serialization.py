from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Iterable

from pydantic import BaseModel


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def model_to_jsonable(value):
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, Path):
        return str(value)
    return value


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(model_to_jsonable(value), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: Iterable) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(model_to_jsonable(row), ensure_ascii=False) + "\n")
            count += 1
    return count


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def deterministic_frame_name(index: int, timestamp_ms: int, image_format: str) -> str:
    safe_format = "jpg" if image_format == "jpeg" else image_format
    return f"frame_{index:06d}_{timestamp_ms:010d}ms.{safe_format}"

