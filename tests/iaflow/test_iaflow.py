from __future__ import annotations

import json
import sys
import types
from pathlib import Path

import pytest

from iaflow import core
from iaflow.browser_bridge import (
    BrowserBridge,
    BrowserBridgeError,
    build_launch_options,
    cdp_check,
    cdp_url_from_config,
)
from iaflow.openai_client import AIResponse
from iaflow.schema import ReviewValidationError, extract_json_object, validate_product_review


def valid_review(decision: str = "APPROVE") -> dict[str, object]:
    next_state = {
        "APPROVE": "CODEX_READY",
        "APPROVE_WITH_CHANGES": "NEEDS_STRATEGIC_AMENDMENT",
        "REJECT": "REJECTED",
        "PAUSE_LINE": "PAUSED",
        "REQUEST_EXTERNAL_ORACLE": "REQUEST_EXTERNAL_ORACLE",
    }[decision]
    return {
        "decision": decision,
        "roi_score": 4,
        "uncertainty_reduction_score": 3,
        "implementation_cost": "LOW",
        "opportunity_cost": "LOW",
        "risk_of_infinite_diagnosis": "LOW",
        "blocking_issues": [],
        "required_changes": [],
        "codex_visible_instructions": [],
        "strategic_only_notes": [],
        "success_criteria_assessment": "Explicit.",
        "stop_criteria_assessment": "Explicit.",
        "roadmap_alignment": "Aligned.",
        "next_state": next_state,
    }


@pytest.fixture()
def flow_workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.chdir(tmp_path)
    core.init_flow()
    return tmp_path


def test_init_creates_files_without_overwriting(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    core.init_flow()
    config = Path("ai-flow/config.json")
    config.write_text('{"custom": true}\n', encoding="utf-8")

    core.init_flow()

    assert json.loads(config.read_text(encoding="utf-8")) == {"custom": True}
    assert Path("ai-flow/agents/strategic.system.md").exists()
    assert Path("ai-flow/README.md").exists()


def test_new_creates_task_directory_and_state(flow_workspace: Path) -> None:
    paths = core.new_task("TASK-0123", "Example task")

    state = json.loads(paths.state.read_text(encoding="utf-8"))
    assert paths.user_input.exists()
    assert state["task_id"] == "TASK-0123"
    assert state["state"] == "NEW"
    assert "Example task" in paths.user_input.read_text(encoding="utf-8")


def test_product_reviewer_validation_accepts_valid_output() -> None:
    review = validate_product_review(valid_review())

    assert review["decision"] == "APPROVE"


def test_product_reviewer_validation_rejects_invalid_enum() -> None:
    review = valid_review()
    review["decision"] = "MAYBE"

    with pytest.raises(ReviewValidationError):
        validate_product_review(review)


def test_run_codex_blocks_rejected_review(flow_workspace: Path) -> None:
    paths = core.new_task("TASK-0001", "Blocked task")
    state = json.loads(paths.state.read_text(encoding="utf-8"))
    state["state"] = "CODEX_READY"
    core.write_state(paths, state)
    paths.product_review.write_text(json.dumps(valid_review("REJECT")), encoding="utf-8")
    paths.final_prompt.write_text("# Task\n\nDo not run.\n", encoding="utf-8")

    with pytest.raises(core.FlowError, match="blocked"):
        core.run_codex("TASK-0001", dry_run=True)

    assert core.load_state(paths)["state"] == "ERROR"


def test_run_review_maps_approve_with_changes(
    flow_workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    paths = core.new_task("TASK-0002", "Needs changes")
    paths.strategic_brief.write_text("# Brief\n\nDo something bounded.\n", encoding="utf-8")

    monkeypatch.setattr(
        core,
        "ai_text_response",
        lambda **_kwargs: AIResponse(
            text=json.dumps(valid_review("APPROVE_WITH_CHANGES")),
            metadata={},
        ),
    )

    core.run_review("TASK-0002")

    assert core.load_state(paths)["state"] == "NEEDS_STRATEGIC_AMENDMENT"


def test_status_works_with_partial_artifacts(flow_workspace: Path) -> None:
    core.new_task("TASK-0003", "Partial")

    info = core.status("TASK-0003")

    assert info["state"] == "NEW"
    assert "00-user-input.md" in info["artifacts"]
    assert info["next_allowed_command"] == "run-strategic"


def test_run_codex_dry_run_command_is_argument_list(flow_workspace: Path) -> None:
    paths = core.new_task("TASK-0004", "Ready")
    state = json.loads(paths.state.read_text(encoding="utf-8"))
    state["state"] = "CODEX_READY"
    core.write_state(paths, state)
    paths.product_review.write_text(json.dumps(valid_review("APPROVE")), encoding="utf-8")
    paths.final_prompt.write_text("# Task\n\nRun safely.\n", encoding="utf-8")

    args = core.run_codex("TASK-0004", dry_run=True)

    assert isinstance(args, list)
    assert args[:2] == ["codex", "exec"]
    assert args[-1] == "-"


def test_config_defaults_to_browser_backend(flow_workspace: Path) -> None:
    config = core.load_config()

    assert core.backend_name(config) == "browser"
    assert core.browser_config(config)["mode"] == "cdp"
    assert core.browser_config(config)["cdp_url"] == "http://127.0.0.1:9222"
    assert core.browser_config(config)["channel"] == ""


def test_browser_mode_allows_launch_and_cdp(flow_workspace: Path) -> None:
    config = core.load_config()
    for mode in ("launch", "cdp"):
        config["browser"]["mode"] = mode
        assert core.browser_config(config)["mode"] == mode


def test_browser_mode_rejects_invalid_value(flow_workspace: Path) -> None:
    config = core.load_config()
    config["browser"]["mode"] = "profile"

    with pytest.raises(core.FlowError, match="browser.mode"):
        core.browser_config(config)


def test_cdp_mode_requires_cdp_url(flow_workspace: Path) -> None:
    config = core.load_config()
    config["browser"]["mode"] = "cdp"
    config["browser"]["cdp_url"] = ""

    with pytest.raises(core.FlowError, match="browser.cdp_url"):
        core.browser_config(config)

    with pytest.raises(BrowserBridgeError, match="browser.cdp_url"):
        cdp_url_from_config(config["browser"])


def test_browser_channel_allows_empty_chrome_and_msedge(flow_workspace: Path) -> None:
    config = core.load_config()
    for channel in ("", "chrome", "msedge"):
        config["browser"]["channel"] = channel
        assert core.browser_config(config)["channel"] == channel


def test_browser_channel_rejects_invalid_value(flow_workspace: Path) -> None:
    config = core.load_config()
    config["browser"]["channel"] = "firefox"

    with pytest.raises(core.FlowError, match="browser.channel"):
        core.browser_config(config)


def test_browser_launch_options_include_channel_when_configured(tmp_path: Path) -> None:
    options = build_launch_options(
        {
            "user_data_dir": str(tmp_path / "profile"),
            "headless": False,
            "channel": "msedge",
        }
    )

    assert options["channel"] == "msedge"
    assert options["headless"] is False


def test_browser_launch_options_omit_empty_channel(tmp_path: Path) -> None:
    options = build_launch_options(
        {
            "user_data_dir": str(tmp_path / "profile"),
            "headless": True,
            "channel": "",
        }
    )

    assert "channel" not in options
    assert options["headless"] is True


def test_browser_launch_options_reject_invalid_channel(tmp_path: Path) -> None:
    with pytest.raises(BrowserBridgeError, match="browser.channel"):
        build_launch_options(
            {
                "user_data_dir": str(tmp_path / "profile"),
                "channel": "firefox",
            }
        )


def test_browser_cdp_check_fails_clearly_when_connection_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeChromium:
        def connect_over_cdp(self, _url: str) -> object:
            raise RuntimeError("connection refused")

    class FakePlaywright:
        chromium = FakeChromium()

        def stop(self) -> None:
            pass

    class FakeSyncPlaywright:
        def start(self) -> FakePlaywright:
            return FakePlaywright()

    fake_sync_api = types.SimpleNamespace(sync_playwright=lambda: FakeSyncPlaywright())
    fake_playwright = types.SimpleNamespace(sync_api=fake_sync_api)
    monkeypatch.setitem(sys.modules, "playwright", fake_playwright)
    monkeypatch.setitem(sys.modules, "playwright.sync_api", fake_sync_api)

    with pytest.raises(BrowserBridgeError, match="Could not connect to Chrome DevTools"):
        cdp_check({"mode": "cdp", "cdp_url": "http://127.0.0.1:9222"})


def test_browser_cdp_check_formats_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakePage:
        url = "https://chatgpt.com/"

        def title(self) -> str:
            return "ChatGPT"

    class FakeContext:
        pages = [FakePage()]

    class FakeBrowser:
        contexts = [FakeContext()]

        def close(self) -> None:
            raise AssertionError("cdp_check should not close the real browser")

    class FakeChromium:
        def connect_over_cdp(self, _url: str) -> FakeBrowser:
            return FakeBrowser()

    class FakePlaywright:
        chromium = FakeChromium()
        stopped = False

        def stop(self) -> None:
            self.stopped = True

    class FakeSyncPlaywright:
        def start(self) -> FakePlaywright:
            return FakePlaywright()

    fake_sync_api = types.SimpleNamespace(sync_playwright=lambda: FakeSyncPlaywright())
    fake_playwright = types.SimpleNamespace(sync_api=fake_sync_api)
    monkeypatch.setitem(sys.modules, "playwright", fake_playwright)
    monkeypatch.setitem(sys.modules, "playwright.sync_api", fake_sync_api)

    assert cdp_check({"mode": "cdp", "cdp_url": "http://127.0.0.1:9222"}) == [
        "[context 0 page 0] ChatGPT - https://chatgpt.com/"
    ]


def test_browser_bridge_does_not_close_context_or_browser_in_cdp_mode() -> None:
    class FakeContext:
        closed = False

        def close(self) -> None:
            self.closed = True

    class FakeBrowser:
        closed = False

        def close(self) -> None:
            self.closed = True

    class FakePlaywright:
        stopped = False

        def stop(self) -> None:
            self.stopped = True

    context = FakeContext()
    browser = FakeBrowser()
    playwright = FakePlaywright()
    bridge = BrowserBridge({"mode": "cdp", "cdp_url": "http://127.0.0.1:9222"})
    bridge._context = context
    bridge._browser = browser
    bridge._playwright = playwright
    bridge._owns_context = False

    bridge.close()

    assert context.closed is False
    assert browser.closed is False
    assert playwright.stopped is True


def test_extract_json_from_pure_json() -> None:
    assert extract_json_object(json.dumps(valid_review()))["decision"] == "APPROVE"


def test_extract_json_from_fenced_json_block() -> None:
    raw = "Here is the review:\n```json\n" + json.dumps(valid_review("REJECT")) + "\n```"

    assert extract_json_object(raw)["decision"] == "REJECT"


def test_extract_json_failure() -> None:
    with pytest.raises(ReviewValidationError, match="parseable JSON"):
        extract_json_object("No JSON here.")


def test_browser_backend_missing_url_gives_clear_error(flow_workspace: Path) -> None:
    config = core.load_config()

    with pytest.raises(core.FlowError, match="strategic_chat_url"):
        core.browser_config(config, "strategic")


def test_run_review_stores_raw_response_before_parsing(
    flow_workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    paths = core.new_task("TASK-0005", "Raw review")
    paths.strategic_brief.write_text("# Brief\n\nDo something bounded.\n", encoding="utf-8")
    raw = "```json\n" + json.dumps(valid_review("APPROVE")) + "\n```"

    monkeypatch.setattr(
        core,
        "ai_text_response",
        lambda **_kwargs: AIResponse(text=raw, metadata={"backend": "browser"}),
    )

    core.run_review("TASK-0005")

    assert paths.product_review_raw.read_text(encoding="utf-8") == raw
    assert json.loads(paths.product_review.read_text(encoding="utf-8"))["decision"] == "APPROVE"


def test_run_review_retries_parseable_json_with_missing_unsafe_fields(
    flow_workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    paths = core.new_task("TASK-0006", "Retry review")
    paths.strategic_brief.write_text("# Brief\n\nDo something bounded.\n", encoding="utf-8")
    first = json.dumps(
        {
            "decision": "APPROVE",
            "implementation_cost": "LOW",
            "opportunity_cost": "LOW",
            "risk_of_infinite_diagnosis": "LOW",
            "next_state": "CODEX_READY",
        }
    )
    retry = json.dumps(valid_review("APPROVE"))
    responses = [first, retry]
    prompts: list[str] = []

    def fake_ai_text_response(**kwargs: object) -> AIResponse:
        prompts.append(str(kwargs["user"]))
        return AIResponse(text=responses.pop(0), metadata={"backend": "browser"})

    monkeypatch.setattr(core, "ai_text_response", fake_ai_text_response)

    core.run_review("TASK-0006")

    assert paths.product_review_raw.read_text(encoding="utf-8") == first
    assert paths.product_review_retry_raw.read_text(encoding="utf-8") == retry
    assert json.loads(paths.product_review.read_text(encoding="utf-8"))["decision"] == "APPROVE"
    assert "Validation Error" in prompts[1]


def test_run_review_retry_failure_sets_error(
    flow_workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    paths = core.new_task("TASK-0007", "Retry failure")
    paths.strategic_brief.write_text("# Brief\n\nDo something bounded.\n", encoding="utf-8")
    first = json.dumps({"decision": "APPROVE", "implementation_cost": "LOW"})
    retry = json.dumps({"decision": "APPROVE", "implementation_cost": "LOW"})
    responses = [first, retry]

    monkeypatch.setattr(
        core,
        "ai_text_response",
        lambda **_kwargs: AIResponse(text=responses.pop(0), metadata={"backend": "browser"}),
    )

    with pytest.raises(ReviewValidationError, match="after one repair retry"):
        core.run_review("TASK-0007")

    assert paths.product_review_raw.read_text(encoding="utf-8") == first
    assert paths.product_review_retry_raw.read_text(encoding="utf-8") == retry
    assert not paths.product_review.exists()
    assert core.load_state(paths)["state"] == "ERROR"


def test_safe_review_defaults_are_applied_only_to_allowed_fields() -> None:
    minimal = {
        "decision": "APPROVE",
        "roi_score": 4,
        "uncertainty_reduction_score": 3,
        "implementation_cost": "LOW",
        "opportunity_cost": "LOW",
        "risk_of_infinite_diagnosis": "LOW",
        "next_state": "CODEX_READY",
    }

    review = core.parse_validate_review_with_safe_defaults(json.dumps(minimal))

    assert review["blocking_issues"] == []
    assert review["required_changes"] == []
    assert review["codex_visible_instructions"] == []
    assert review["strategic_only_notes"] == []
    assert review["success_criteria_assessment"] == ""
    assert review["stop_criteria_assessment"] == ""
    assert review["roadmap_alignment"] == ""


def test_safe_review_defaults_do_not_invent_unsafe_fields() -> None:
    unsafe_missing = {
        "decision": "APPROVE",
        "implementation_cost": "LOW",
        "opportunity_cost": "LOW",
        "risk_of_infinite_diagnosis": "LOW",
        "next_state": "CODEX_READY",
    }

    with pytest.raises(ReviewValidationError, match="roi_score"):
        core.parse_validate_review_with_safe_defaults(json.dumps(unsafe_missing))
