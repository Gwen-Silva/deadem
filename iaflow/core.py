from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .browser_bridge import BrowserBridge, BrowserBridgeError, cdp_check
from .openai_client import AIResponse, OpenAIClient
from .schema import (
    ReviewValidationError,
    extract_json_object,
    normalize_safe_review_defaults,
    parse_and_validate_product_review,
    validate_product_review,
)


ROOT = Path("ai-flow")
AGENTS = ROOT / "agents"
ROADMAP = ROOT / "roadmap"
TASKS = ROOT / "tasks"

STATES = {
    "NEW",
    "STRATEGIC_BRIEF_READY",
    "PRODUCT_REVIEW_READY",
    "NEEDS_STRATEGIC_AMENDMENT",
    "CODEX_READY",
    "CODEX_RUNNING",
    "CODEX_DONE",
    "STRATEGIC_GATE_REVIEW_READY",
    "ACCEPTED",
    "REJECTED",
    "PAUSED",
    "REQUEST_EXTERNAL_ORACLE",
    "ERROR",
}

BLOCKING_DECISIONS = {"REJECT", "PAUSE_LINE", "REQUEST_EXTERNAL_ORACLE"}
REVIEW_STATE_MAP = {
    "APPROVE": "CODEX_READY",
    "APPROVE_WITH_CHANGES": "NEEDS_STRATEGIC_AMENDMENT",
    "REJECT": "REJECTED",
    "PAUSE_LINE": "PAUSED",
    "REQUEST_EXTERNAL_ORACLE": "REQUEST_EXTERNAL_ORACLE",
}
GATE_STATE_MAP = {
    "ACCEPTED": "ACCEPTED",
    "NEEDS_FOLLOWUP": "STRATEGIC_GATE_REVIEW_READY",
    "REJECTED": "REJECTED",
    "PAUSED": "PAUSED",
    "REQUEST_EXTERNAL_ORACLE": "REQUEST_EXTERNAL_ORACLE",
}

DEFAULT_CONFIG = {
    "backend": "browser",
    "browser": {
        "mode": "cdp",
        "cdp_url": "http://127.0.0.1:9222",
        "provider": "chatgpt_web",
        "user_data_dir": ".iaflow-browser",
        "channel": "",
        "headless": False,
        "strategic_chat_url": "",
        "reviewer_chat_url": "",
        "response_timeout_seconds": 300,
        "poll_interval_seconds": 2,
    },
    "openai_model_strategic": "gpt-5.5",
    "openai_model_reviewer": "gpt-5.5",
    "codex_command": "codex",
    "codex_sandbox": "workspace-write",
    "codex_approval": "on-request",
    "workspace_root": ".",
    "api_timeout_seconds": 180,
    "codex_timeout_seconds": 3600,
}

DEFAULT_FILES = {
    ROOT / "config.json": json.dumps(DEFAULT_CONFIG, indent=2) + "\n",
    AGENTS / "strategic.system.md": """# Strategic GPT

You are the technical strategy agent for Deadem.

Responsibilities:
- analyze evidence and preserve uncertainty;
- separate facts, hypotheses, and conclusions;
- decide gates from available evidence;
- define the next bounded task;
- avoid broadening scope;
- define success criteria and stop criteria;
- produce Codex-ready execution briefs only after Product Reviewer approval;
- never execute code.
""",
    AGENTS / "product-reviewer.system.md": """# Product Reviewer

You are an independent Product Owner reviewer for Deadem.

Evaluate whether the proposed task creates product value. Consider ROI, uncertainty
reduction, roadmap impact, opportunity cost, risk of infinite diagnosis, and scope
creep. Check that success and stop criteria are explicit. Reject tasks that only
create diagnostic churn without moving the product forward.

Return structured JSON only. Do not include Markdown or prose outside the JSON.
""",
    AGENTS / "codex-executor.contract.md": """# Codex Executor Contract

Codex receives only an approved execution task.

- Execute only the approved task.
- Do not make strategic decisions.
- Do not broaden scope.
- Do not refactor unrelated areas.
- Run validations.
- Stop if the task requires unclear product decisions.
- Produce a final report with summary, files changed, commands run, validation
  results, evidence, risks, commit hash, and suggested next step.
""",
    ROADMAP / "product-vision.md": "# Product Vision\n\nTODO\n",
    ROADMAP / "current-state.md": "# Current State\n\nTODO\n",
    ROADMAP / "decision-principles.md": "# Decision Principles\n\nTODO\n",
    ROADMAP / "open-risks.md": "# Open Risks\n\nTODO\n",
    TASKS / ".gitkeep": "",
    ROOT / "README.md": """# AI Flow

`iaflow` is a local, plain-file workflow for coordinating Strategic GPT, Product
Reviewer, and Codex without manual copy/paste between chats.

## Requirements

- Python 3.10+
- Playwright for the default browser backend
- Codex CLI installed for `run-codex`

Install Playwright:

```bash
py -m pip install playwright
py -m playwright install chromium
```

The optional API backend reads `OPENAI_API_KEY` from the environment and does
not write API keys to logs.

## Commands

```bash
python -m iaflow init
python -m iaflow browser-login
python -m iaflow browser-cdp-check
python -m iaflow browser-test strategic
python -m iaflow browser-test reviewer
python -m iaflow new TASK-0123 --title "Replay parser prior art triage"
python -m iaflow run-strategic TASK-0123
python -m iaflow run-review TASK-0123
python -m iaflow finalize TASK-0123
python -m iaflow run-codex TASK-0123
python -m iaflow ingest TASK-0123
python -m iaflow status TASK-0123
python -m iaflow run-cycle TASK-0123
```

## Normal Flow

1. Run `init` once.
2. Start Chrome manually with `--remote-debugging-port=9222`.
3. Log into ChatGPT manually in that Chrome.
4. Fill `browser.strategic_chat_url` and `browser.reviewer_chat_url`.
5. Run `browser-cdp-check`.
6. Run both `browser-test` commands.
7. Create a task with `new`.
8. Edit `ai-flow/tasks/<TASK-ID>/00-user-input.md`.
9. Run `run-cycle` or each command step-by-step.
10. Inspect artifacts in the task directory.

The normal state path is `NEW` -> `STRATEGIC_BRIEF_READY` -> `CODEX_READY` ->
`CODEX_DONE` -> a final gate state.

## Blocked States

Codex will not run when Product Reviewer returns `REJECT`, `PAUSE_LINE`, or
`REQUEST_EXTERNAL_ORACLE`. These map to `REJECTED`, `PAUSED`, and
`REQUEST_EXTERNAL_ORACLE`.

`APPROVE_WITH_CHANGES` maps to `NEEDS_STRATEGIC_AMENDMENT`; `finalize` asks
Strategic GPT to write `03-strategic-amendment.md` before generating the final
Codex prompt.

## Resume After Failure

Run `python -m iaflow status <TASK-ID>` and inspect `state.json`,
`events.jsonl`, and any `*.log` or `*.raw-error.txt` files. Fix the missing
configuration, artifact, or prompt issue, then rerun the failed command when the
state machine permits it.

## Artifacts

Each task stores:

- `00-user-input.md`
- `01-strategic-brief.md`
- `02-product-review.raw.md`
- `02-product-review.retry.raw.md`
- `02-product-review.json`
- `03-strategic-amendment.md`
- `04-codex-final-prompt.md`
- `05-codex-report.md`
- `05-codex-stderr.log`
- `06-strategic-gate-review.md`
- `state.json`
- `events.jsonl`

## Customization

Edit prompt files under `ai-flow/agents/` and roadmap context under
`ai-flow/roadmap/`. Re-run `init --force` only when you intentionally want to
restore starter files.

## Browser Backend

The default backend is `browser` with `browser.mode = "cdp"`. Install
Playwright, then manually start Chrome with
`chrome.exe --remote-debugging-port=9222 --user-data-dir=.iaflow-real-chrome`.
Log in manually, paste the Strategic GPT and Product Reviewer chat URLs into
config, then run `browser-cdp-check` and both browser tests.

Launch mode remains available with `browser.mode = "launch"`. Set
`browser.channel` to `"chrome"` or `"msedge"` to launch an installed browser
channel instead of Playwright's bundled Chromium. Do not use launch mode if
Cloudflare/auth blocks it. `iaflow` does not attempt to bypass Cloudflare,
Google auth, captcha, or other platform checks.

Known limitations: selectors can break if ChatGPT web changes, login is manual,
captchas require manual intervention, plan message limits still apply, and the
browser backend is less reliable than the API backend.

## API Backend

Set `"backend": "api"` in `ai-flow/config.json` and set `OPENAI_API_KEY` in the
environment to use the optional OpenAI API backend.

## Manual Codex Run

If needed, inspect `04-codex-final-prompt.md` and run Codex manually with the
same sandbox and approval settings from `ai-flow/config.json`. Paste or pipe the
prompt to Codex, then save the result as `05-codex-report.md` before running
`ingest`.
""",
}


class FlowError(RuntimeError):
    pass


@dataclass(frozen=True)
class TaskPaths:
    task_id: str
    root: Path

    @property
    def user_input(self) -> Path:
        return self.root / "00-user-input.md"

    @property
    def strategic_brief(self) -> Path:
        return self.root / "01-strategic-brief.md"

    @property
    def product_review(self) -> Path:
        return self.root / "02-product-review.json"

    @property
    def product_review_raw(self) -> Path:
        return self.root / "02-product-review.raw.md"

    @property
    def product_review_retry_raw(self) -> Path:
        return self.root / "02-product-review.retry.raw.md"

    @property
    def amendment(self) -> Path:
        return self.root / "03-strategic-amendment.md"

    @property
    def final_prompt(self) -> Path:
        return self.root / "04-codex-final-prompt.md"

    @property
    def codex_report(self) -> Path:
        return self.root / "05-codex-report.md"

    @property
    def codex_stderr(self) -> Path:
        return self.root / "05-codex-stderr.log"

    @property
    def gate_review(self) -> Path:
        return self.root / "06-strategic-gate-review.md"

    @property
    def state(self) -> Path:
        return self.root / "state.json"

    @property
    def events(self) -> Path:
        return self.root / "events.jsonl"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def init_flow(*, force: bool = False) -> list[Path]:
    created: list[Path] = []
    for directory in (ROOT, AGENTS, ROADMAP, TASKS):
        directory.mkdir(parents=True, exist_ok=True)
    for path, content in DEFAULT_FILES.items():
        if path.exists() and not force:
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        created.append(path)
    return created


def task_paths(task_id: str) -> TaskPaths:
    return TaskPaths(task_id=task_id, root=TASKS / task_id)


def new_task(task_id: str, title: str, *, force: bool = False) -> TaskPaths:
    paths = task_paths(task_id)
    paths.root.mkdir(parents=True, exist_ok=True)
    if paths.user_input.exists() and not force:
        raise FlowError(f"Task {task_id} already exists. Use --force to overwrite starter files.")
    paths.user_input.write_text(
        f"# {task_id} - {title}\n\n"
        "## User intent\n\nTODO\n\n"
        "## Known context\n\nTODO\n\n"
        "## Constraints\n\nTODO\n",
        encoding="utf-8",
    )
    state = {
        "task_id": task_id,
        "title": title,
        "state": "NEW",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "last_error": None,
    }
    write_state(paths, state)
    if not paths.events.exists() or force:
        paths.events.write_text("", encoding="utf-8")
    append_event(paths, "new", None, "NEW", "success", f"Created task: {title}")
    return paths


def load_config() -> dict[str, Any]:
    config_path = ROOT / "config.json"
    if not config_path.exists():
        raise FlowError("Missing ai-flow/config.json. Run `python -m iaflow init` first.")
    with config_path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    return deep_merge(DEFAULT_CONFIG, config)


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for key, value in base.items():
        if isinstance(value, dict):
            merged[key] = deep_merge(value, {})
        else:
            merged[key] = value
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_state(paths: TaskPaths) -> dict[str, Any]:
    if not paths.state.exists():
        raise FlowError(f"Missing task state: {paths.state}")
    with paths.state.open("r", encoding="utf-8") as handle:
        state = json.load(handle)
    if state.get("state") not in STATES:
        raise FlowError(f"Invalid task state: {state.get('state')}")
    return state


def write_state(paths: TaskPaths, state: dict[str, Any]) -> None:
    state["updated_at"] = now_iso()
    paths.state.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def transition(paths: TaskPaths, next_state: str, *, last_error: str | None = None) -> tuple[str, str]:
    if next_state not in STATES:
        raise FlowError(f"Invalid next state: {next_state}")
    state = load_state(paths)
    previous = state["state"]
    state["state"] = next_state
    state["last_error"] = last_error
    write_state(paths, state)
    return previous, next_state


def append_event(
    paths: TaskPaths,
    command: str,
    previous_state: str | None,
    next_state: str | None,
    status: str,
    notes: str = "",
) -> None:
    event = {
        "timestamp": now_iso(),
        "task_id": paths.task_id,
        "command": command,
        "previous_state": previous_state,
        "next_state": next_state,
        "status": status,
        "notes": notes,
    }
    paths.events.parent.mkdir(parents=True, exist_ok=True)
    with paths.events.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")


def fail_command(paths: TaskPaths, command: str, previous: str | None, message: str) -> None:
    next_state = "ERROR"
    try:
        _, next_state = transition(paths, "ERROR", last_error=message)
    finally:
        append_event(paths, command, previous, next_state, "error", message)


def read_text(path: Path, *, required: bool = True) -> str:
    if not path.exists():
        if required:
            raise FlowError(f"Missing required artifact: {path}")
        return ""
    return path.read_text(encoding="utf-8")


def roadmap_context() -> str:
    parts: list[str] = []
    for name in ("product-vision.md", "current-state.md", "decision-principles.md", "open-risks.md"):
        path = ROADMAP / name
        parts.append(f"## {path.as_posix()}\n\n{read_text(path, required=False)}")
    return "\n\n".join(parts)


def write_response(path: Path, response: AIResponse) -> None:
    path.write_text(response.text.rstrip() + "\n", encoding="utf-8")
    metadata_path = path.with_suffix(path.suffix + ".metadata.json")
    metadata_path.write_text(json.dumps(response.metadata, indent=2) + "\n", encoding="utf-8")


def client_from_config(config: dict[str, Any]) -> OpenAIClient:
    return OpenAIClient(timeout_seconds=int(config["api_timeout_seconds"]))


def backend_name(config: dict[str, Any]) -> str:
    backend = str(config.get("backend", "browser"))
    if backend not in {"api", "browser"}:
        raise FlowError(f"Invalid backend `{backend}`. Expected `api` or `browser`.")
    return backend


def browser_config(config: dict[str, Any], role: str | None = None) -> dict[str, Any]:
    browser = config.get("browser")
    if not isinstance(browser, dict):
        raise FlowError("Missing browser configuration in ai-flow/config.json.")
    if browser.get("provider") != "chatgpt_web":
        raise FlowError("Only browser provider `chatgpt_web` is supported.")
    mode = str(browser.get("mode", "cdp") or "cdp")
    if mode not in {"launch", "cdp"}:
        raise FlowError("browser.mode must be one of: 'launch', 'cdp'.")
    if mode == "cdp" and not str(browser.get("cdp_url", "") or "").strip():
        raise FlowError("browser.cdp_url is required when browser.mode is 'cdp'.")
    channel = str(browser.get("channel", "") or "")
    if channel not in {"", "chrome", "msedge"}:
        raise FlowError("browser.channel must be one of: '', 'chrome', 'msedge'.")
    if role is not None:
        key = "strategic_chat_url" if role == "strategic" else "reviewer_chat_url"
        if not browser.get(key):
            raise FlowError(
                f"Missing browser.{key} in ai-flow/config.json. Paste the {role} ChatGPT chat URL "
                "before using the browser backend."
            )
    return browser


def ai_text_response(
    *,
    config: dict[str, Any],
    role: str,
    system: str,
    user: str,
    structured_review: bool = False,
) -> AIResponse:
    if backend_name(config) == "api":
        client = client_from_config(config)
        if structured_review:
            return client.product_review_json(
                model=config["openai_model_reviewer"],
                system=system,
                user=user,
            )
        return client.text(model=config["openai_model_strategic"], system=system, user=user)

    browser = browser_config(config, role)
    chat_url = browser["strategic_chat_url"] if role == "strategic" else browser["reviewer_chat_url"]
    prompt = f"# System Instructions\n\n{system}\n\n# User Prompt\n\n{user}"
    with BrowserBridge(browser) as bridge:
        return AIResponse(text=bridge.send_prompt(chat_url, prompt), metadata={"backend": "browser"})


def browser_login() -> None:
    config = load_config()
    browser = browser_config(config)
    with BrowserBridge(browser) as bridge:
        bridge.login()
        print("Log in manually in the opened browser. After login is complete, press Enter here.")
        input()


def browser_test(role: str) -> str:
    config = load_config()
    browser = browser_config(config, role)
    chat_url = browser["strategic_chat_url"] if role == "strategic" else browser["reviewer_chat_url"]
    with BrowserBridge(browser) as bridge:
        return bridge.send_prompt(chat_url, "Reply with exactly: IAFLOW_BROWSER_OK")


def browser_cdp_check() -> list[str]:
    config = load_config()
    browser = browser_config(config)
    return cdp_check(browser)


def parse_validate_review_with_safe_defaults(raw: str) -> dict[str, Any]:
    data = extract_json_object(raw)
    normalized = normalize_safe_review_defaults(data)
    return validate_product_review(normalized)


def run_strategic(task_id: str, *, force: bool = False) -> None:
    paths = task_paths(task_id)
    state = load_state(paths)
    previous = state["state"]
    command = "run-strategic"
    try:
        allowed = {"NEW", "CODEX_DONE"}
        forced_allowed = {"STRATEGIC_GATE_REVIEW_READY", "REJECTED", "PAUSED"}
        if previous not in allowed and not (force and previous in forced_allowed):
            raise FlowError(f"{command} cannot run from state {previous}")
        config = load_config()
        system = read_text(AGENTS / "strategic.system.md")
        if previous == "CODEX_DONE":
            user = build_gate_review_prompt(paths)
            response = ai_text_response(config=config, role="strategic", system=system, user=user)
            write_response(paths.gate_review, response)
            next_state = "STRATEGIC_GATE_REVIEW_READY"
        else:
            user = build_strategic_brief_prompt(paths)
            response = ai_text_response(config=config, role="strategic", system=system, user=user)
            write_response(paths.strategic_brief, response)
            next_state = "STRATEGIC_BRIEF_READY"
        transition(paths, next_state)
        append_event(paths, command, previous, next_state, "success")
    except Exception as exc:
        fail_command(paths, command, previous, str(exc))
        raise


def run_review(task_id: str) -> None:
    paths = task_paths(task_id)
    state = load_state(paths)
    previous = state["state"]
    command = "run-review"
    try:
        if not paths.strategic_brief.exists():
            raise FlowError("run-review requires 01-strategic-brief.md")
        config = load_config()
        response = ai_text_response(
            config=config,
            role="reviewer",
            system=read_text(AGENTS / "product-reviewer.system.md"),
            user=build_review_prompt(paths),
            structured_review=True,
        )
        paths.product_review_raw.write_text(response.text, encoding="utf-8")
        try:
            review = parse_validate_review_with_safe_defaults(response.text)
        except ReviewValidationError as first_error:
            if backend_name(config) != "browser":
                raw_path = paths.root / "02-product-review.raw-error.txt"
                raw_path.write_text(response.text, encoding="utf-8")
                raise
            try:
                invalid_json = extract_json_object(response.text)
            except ReviewValidationError:
                raw_path = paths.root / "02-product-review.raw-error.txt"
                raw_path.write_text(response.text, encoding="utf-8")
                raise
            retry_response = ai_text_response(
                config=config,
                role="reviewer",
                system=read_text(AGENTS / "product-reviewer.system.md"),
                user=build_review_retry_prompt(first_error, invalid_json),
                structured_review=True,
            )
            paths.product_review_retry_raw.write_text(retry_response.text, encoding="utf-8")
            try:
                review = parse_validate_review_with_safe_defaults(retry_response.text)
            except ReviewValidationError as retry_error:
                raw_path = paths.root / "02-product-review.raw-error.txt"
                raw_path.write_text(retry_response.text, encoding="utf-8")
                raise ReviewValidationError(
                    "Product Reviewer JSON validation failed after one repair retry: "
                    f"{retry_error}. See 02-product-review.raw.md and "
                    "02-product-review.retry.raw.md."
                ) from retry_error
        paths.product_review.write_text(json.dumps(review, indent=2) + "\n", encoding="utf-8")
        (paths.product_review.with_suffix(".json.metadata.json")).write_text(
            json.dumps(response.metadata, indent=2) + "\n",
            encoding="utf-8",
        )
        next_state = REVIEW_STATE_MAP[review["decision"]]
        transition(paths, next_state)
        append_event(paths, command, previous, next_state, "success", f"decision={review['decision']}")
    except Exception as exc:
        fail_command(paths, command, previous, str(exc))
        raise


def finalize(task_id: str) -> None:
    paths = task_paths(task_id)
    state = load_state(paths)
    previous = state["state"]
    command = "finalize"
    try:
        if not paths.product_review.exists():
            raise FlowError("finalize requires 02-product-review.json")
        review = load_review(paths)
        if review["decision"] in BLOCKING_DECISIONS:
            raise FlowError(f"Cannot finalize blocked review decision: {review['decision']}")
        if review["decision"] == "APPROVE_WITH_CHANGES":
            if previous != "NEEDS_STRATEGIC_AMENDMENT":
                raise FlowError("APPROVE_WITH_CHANGES requires state NEEDS_STRATEGIC_AMENDMENT")
            config = load_config()
            response = ai_text_response(
                config=config,
                role="strategic",
                system=read_text(AGENTS / "strategic.system.md"),
                user=build_amendment_prompt(paths, review),
            )
            write_response(paths.amendment, response)
        elif previous != "CODEX_READY":
            raise FlowError(f"APPROVE finalize requires state CODEX_READY, got {previous}")

        prompt = build_codex_prompt(paths, review)
        paths.final_prompt.write_text(prompt, encoding="utf-8")
        transition(paths, "CODEX_READY")
        append_event(paths, command, previous, "CODEX_READY", "success")
    except Exception as exc:
        fail_command(paths, command, previous, str(exc))
        raise


def run_codex(task_id: str, *, dry_run: bool = False) -> list[str]:
    paths = task_paths(task_id)
    state = load_state(paths)
    previous = state["state"]
    command = "run-codex"
    try:
        if previous != "CODEX_READY":
            raise FlowError(f"run-codex requires state CODEX_READY, got {previous}")
        if not paths.final_prompt.exists():
            raise FlowError("run-codex requires 04-codex-final-prompt.md")
        review = load_review(paths)
        if review["decision"] in BLOCKING_DECISIONS:
            raise FlowError(f"Codex blocked by Product Reviewer decision: {review['decision']}")
        config = load_config()
        args = build_codex_args(config, paths.final_prompt)
        if dry_run:
            append_event(paths, command, previous, previous, "success", "dry-run")
            return args

        transition(paths, "CODEX_RUNNING")
        append_event(paths, command, previous, "CODEX_RUNNING", "success", "started")
        try:
            with paths.final_prompt.open("r", encoding="utf-8") as stdin:
                result = subprocess.run(
                    args,
                    stdin=stdin,
                    capture_output=True,
                    text=True,
                    timeout=int(config["codex_timeout_seconds"]),
                    check=False,
                )
        except subprocess.TimeoutExpired as exc:
            stdout = exc.stdout or ""
            stderr = exc.stderr or ""
            if isinstance(stdout, bytes):
                stdout = stdout.decode("utf-8", errors="replace")
            if isinstance(stderr, bytes):
                stderr = stderr.decode("utf-8", errors="replace")
            paths.codex_report.write_text(stdout, encoding="utf-8")
            paths.codex_stderr.write_text(stderr, encoding="utf-8")
            raise FlowError(f"Codex timed out after {config['codex_timeout_seconds']} seconds") from exc
        paths.codex_report.write_text(result.stdout, encoding="utf-8")
        paths.codex_stderr.write_text(result.stderr, encoding="utf-8")
        if result.returncode == 0:
            transition(paths, "CODEX_DONE")
            append_event(paths, command, "CODEX_RUNNING", "CODEX_DONE", "success", "returncode=0")
        else:
            message = f"Codex exited with return code {result.returncode}"
            transition(paths, "ERROR", last_error=message)
            append_event(paths, command, "CODEX_RUNNING", "ERROR", "error", message)
            raise FlowError(message)
        return args
    except Exception as exc:
        current = load_state(paths)["state"]
        if current != "ERROR":
            fail_previous = "CODEX_RUNNING" if current == "CODEX_RUNNING" else previous
            fail_command(paths, command, fail_previous, str(exc))
        raise


def ingest(task_id: str) -> None:
    paths = task_paths(task_id)
    state = load_state(paths)
    previous = state["state"]
    command = "ingest"
    try:
        if not paths.codex_report.exists():
            raise FlowError("ingest requires 05-codex-report.md")
        config = load_config()
        response = ai_text_response(
            config=config,
            role="strategic",
            system=read_text(AGENTS / "strategic.system.md"),
            user=build_ingest_prompt(paths),
        )
        text = response.text.rstrip() + "\n"
        decision = parse_gate_decision(text)
        paths.gate_review.write_text(text, encoding="utf-8")
        (paths.gate_review.with_suffix(".md.metadata.json")).write_text(
            json.dumps(response.metadata, indent=2) + "\n",
            encoding="utf-8",
        )
        next_state = GATE_STATE_MAP[decision]
        transition(paths, next_state)
        append_event(paths, command, previous, next_state, "success", f"gate={decision}")
    except Exception as exc:
        fail_command(paths, command, previous, str(exc))
        raise


def status(task_id: str) -> dict[str, Any]:
    paths = task_paths(task_id)
    state = load_state(paths)
    artifacts = [
        path.name
        for path in (
            paths.user_input,
            paths.strategic_brief,
            paths.product_review_raw,
            paths.product_review_retry_raw,
            paths.product_review,
            paths.amendment,
            paths.final_prompt,
            paths.codex_report,
            paths.codex_stderr,
            paths.gate_review,
            paths.events,
        )
        if path.exists()
    ]
    review_decision = None
    if paths.product_review.exists():
        review_decision = load_review(paths).get("decision")
    gate_decision = None
    if paths.gate_review.exists():
        try:
            gate_decision = parse_gate_decision(paths.gate_review.read_text(encoding="utf-8"))
        except FlowError:
            gate_decision = None
    return {
        "task_id": task_id,
        "title": state.get("title", ""),
        "state": state["state"],
        "artifacts": artifacts,
        "product_review_decision": review_decision,
        "gate_decision": gate_decision,
        "next_allowed_command": next_allowed_command(paths, state["state"]),
    }


def run_cycle(task_id: str) -> None:
    run_strategic(task_id)
    run_review(task_id)
    review = load_review(task_paths(task_id))
    if review["decision"] in BLOCKING_DECISIONS:
        return
    finalize(task_id)
    run_codex(task_id)
    ingest(task_id)


def build_codex_args(config: dict[str, Any], prompt_path: Path) -> list[str]:
    workspace_root = str(Path(config["workspace_root"]).resolve())
    return [
        str(config["codex_command"]),
        "exec",
        "--cd",
        workspace_root,
        "--sandbox",
        str(config["codex_sandbox"]),
        "--ask-for-approval",
        str(config["codex_approval"]),
        "-",
    ]


def build_strategic_brief_prompt(paths: TaskPaths) -> str:
    return (
        "# Assignment\n\nCreate the Strategic GPT execution brief for this task.\n\n"
        "# Roadmap Context\n\n"
        f"{roadmap_context()}\n\n"
        "# Task State\n\n"
        f"{json.dumps(load_state(paths), indent=2)}\n\n"
        "# User Input\n\n"
        f"{read_text(paths.user_input)}\n"
    )


def build_gate_review_prompt(paths: TaskPaths) -> str:
    return (
        "# Assignment\n\nReview the Codex result and produce a gate review. "
        "The first line must be `Gate Decision: <VALUE>` where VALUE is one of "
        "ACCEPTED, NEEDS_FOLLOWUP, REJECTED, PAUSED, REQUEST_EXTERNAL_ORACLE.\n\n"
        f"# Roadmap Context\n\n{roadmap_context()}\n\n"
        f"# Strategic Brief\n\n{read_text(paths.strategic_brief)}\n\n"
        f"# Product Review\n\n{read_text(paths.product_review, required=False)}\n\n"
        f"# Codex Report\n\n{read_text(paths.codex_report)}\n"
    )


def build_review_prompt(paths: TaskPaths) -> str:
    return (
        "# Assignment\n\nReview this proposed Strategic GPT task for product value. "
        "Return exactly one complete JSON object and nothing else. Missing fields will fail "
        "the local workflow. Do not include commentary before or after the JSON. Do not use "
        "Markdown unless you return a single fenced ```json block containing only the object.\n\n"
        "# Required JSON Schema\n\n"
        f"{product_review_schema_prompt()}\n\n"
        f"# Roadmap Context\n\n{roadmap_context()}\n\n"
        f"# Strategic Brief\n\n{read_text(paths.strategic_brief)}\n"
    )


def build_review_retry_prompt(error: Exception, invalid_json: dict[str, Any]) -> str:
    return (
        "# Repair Required\n\n"
        "Your previous Product Reviewer response was parseable JSON, but it failed local "
        "validation. Return exactly one corrected complete JSON object and nothing else. "
        "Do not include commentary before or after the JSON. Missing fields will fail the "
        "workflow again.\n\n"
        "# Validation Error\n\n"
        f"{error}\n\n"
        "# Invalid JSON You Returned\n\n"
        f"{json.dumps(invalid_json, indent=2)}\n\n"
        "# Required JSON Schema\n\n"
        f"{product_review_schema_prompt()}\n"
    )


def product_review_schema_prompt() -> str:
    return """{
  "decision": "APPROVE | APPROVE_WITH_CHANGES | REJECT | PAUSE_LINE | REQUEST_EXTERNAL_ORACLE",
  "roi_score": "integer 1-5",
  "uncertainty_reduction_score": "integer 1-5",
  "implementation_cost": "LOW | MEDIUM | HIGH",
  "opportunity_cost": "LOW | MEDIUM | HIGH",
  "risk_of_infinite_diagnosis": "LOW | MEDIUM | HIGH",
  "blocking_issues": ["string"],
  "required_changes": ["string"],
  "codex_visible_instructions": ["string"],
  "strategic_only_notes": ["string"],
  "success_criteria_assessment": "string",
  "stop_criteria_assessment": "string",
  "roadmap_alignment": "string",
  "next_state": "CODEX_READY | NEEDS_STRATEGIC_AMENDMENT | REJECTED | PAUSED | REQUEST_EXTERNAL_ORACLE"
}

Decision to next_state mapping:
- APPROVE -> CODEX_READY
- APPROVE_WITH_CHANGES -> NEEDS_STRATEGIC_AMENDMENT
- REJECT -> REJECTED
- PAUSE_LINE -> PAUSED
- REQUEST_EXTERNAL_ORACLE -> REQUEST_EXTERNAL_ORACLE

All fields are required."""


def build_amendment_prompt(paths: TaskPaths, review: dict[str, Any]) -> str:
    return (
        "# Assignment\n\nCreate a Strategic GPT amendment that incorporates the Product Reviewer "
        "required changes before Codex receives the final task. Do not execute code.\n\n"
        f"# Roadmap Context\n\n{roadmap_context()}\n\n"
        f"# Strategic Brief\n\n{read_text(paths.strategic_brief)}\n\n"
        f"# Product Review JSON\n\n{json.dumps(review, indent=2)}\n"
    )


def build_codex_prompt(paths: TaskPaths, review: dict[str, Any]) -> str:
    amendment = read_text(paths.amendment, required=False)
    reviewer_instructions = "\n".join(f"- {item}" for item in review["codex_visible_instructions"])
    source = read_text(paths.strategic_brief)
    if amendment:
        source = f"{source}\n\n# Strategic Amendment\n\n{amendment}"
    return (
        f"{read_text(AGENTS / 'codex-executor.contract.md')}\n\n"
        "# Task\n\n"
        f"{source}\n\n"
        "# Scope\n\n"
        "## Allowed\n\nUse the allowed scope from the approved Strategic GPT brief and reviewer instructions.\n\n"
        "## Not allowed\n\nDo not execute blocked follow-up work, broaden scope, or alter unrelated files.\n\n"
        "# Evidence required\n\nPreserve factual evidence, uncertainty, and validation output in the report.\n\n"
        "# Commands to run\n\nRun the validations specified in the approved brief. If a command cannot run, report why.\n\n"
        "# Success criteria\n\nUse the success criteria from the approved brief and any reviewer-visible instructions.\n\n"
        "# Stop criteria\n\nUse the stop criteria from the approved brief. Stop if unclear product decisions are required.\n\n"
        "# Product Reviewer Instructions Visible To Codex\n\n"
        f"{reviewer_instructions or '- None'}\n\n"
        "# Report format\n\n"
        "Include: summary, files changed, commands run, validation results, evidence, risks, "
        "commit hash, and suggested next step.\n"
    )


def build_ingest_prompt(paths: TaskPaths) -> str:
    return (
        "# Assignment\n\nClassify the Codex result. The first line must be exactly "
        "`Gate Decision: <VALUE>` where VALUE is one of ACCEPTED, NEEDS_FOLLOWUP, "
        "REJECTED, PAUSED, REQUEST_EXTERNAL_ORACLE.\n\n"
        f"# Roadmap Context\n\n{roadmap_context()}\n\n"
        f"# Strategic Brief\n\n{read_text(paths.strategic_brief)}\n\n"
        f"# Product Review\n\n{read_text(paths.product_review)}\n\n"
        f"# Final Codex Prompt\n\n{read_text(paths.final_prompt)}\n\n"
        f"# Codex Report\n\n{read_text(paths.codex_report)}\n"
    )


def load_review(paths: TaskPaths) -> dict[str, Any]:
    return parse_and_validate_product_review(read_text(paths.product_review))


def parse_gate_decision(text: str) -> str:
    first = text.splitlines()[0].strip() if text.splitlines() else ""
    prefix = "Gate Decision:"
    if not first.startswith(prefix):
        raise FlowError("Gate review first line must be `Gate Decision: <VALUE>`")
    decision = first[len(prefix) :].strip()
    if decision not in GATE_STATE_MAP:
        raise FlowError(f"Invalid gate decision: {decision}")
    return decision


def next_allowed_command(paths: TaskPaths, state: str) -> str:
    if state == "NEW":
        return "run-strategic"
    if state == "STRATEGIC_BRIEF_READY":
        return "run-review"
    if state == "NEEDS_STRATEGIC_AMENDMENT":
        return "finalize"
    if state == "CODEX_READY":
        return "run-codex"
    if state == "CODEX_DONE":
        return "ingest"
    if state in {"REJECTED", "PAUSED", "REQUEST_EXTERNAL_ORACLE", "ACCEPTED", "ERROR"}:
        return "manual intervention"
    if state == "STRATEGIC_GATE_REVIEW_READY":
        return "manual strategic decision"
    if state == "CODEX_RUNNING":
        return "wait for Codex or inspect failure"
    return "unknown"


def format_status(info: dict[str, Any]) -> str:
    lines = [
        f"Task: {info['task_id']}",
        f"Title: {info['title']}",
        f"State: {info['state']}",
        f"Artifacts: {', '.join(info['artifacts']) if info['artifacts'] else 'none'}",
        f"Product Reviewer decision: {info['product_review_decision'] or 'n/a'}",
        f"Gate decision: {info['gate_decision'] or 'n/a'}",
        f"Next allowed command: {info['next_allowed_command']}",
    ]
    return "\n".join(lines)
