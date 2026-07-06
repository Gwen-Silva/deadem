from __future__ import annotations

import time
from pathlib import Path
from typing import Any


class BrowserBridgeError(RuntimeError):
    pass


ALLOWED_CHANNELS = {"", "chrome", "msedge"}
ALLOWED_MODES = {"launch", "cdp"}

COMPOSER_SELECTORS = [
    'textarea[data-testid="prompt-textarea"]',
    'div.ProseMirror[contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]',
    'textarea',
]
SEND_BUTTON_SELECTORS = [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Send message"]',
]
STOP_BUTTON_SELECTORS = [
    'button[data-testid="stop-button"]',
    'button[aria-label*="Stop"]',
]
ASSISTANT_MESSAGE_SELECTORS = [
    '[data-message-author-role="assistant"]',
    'div.markdown',
    'article',
]


class BrowserBridge:
    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        self._playwright = None
        self._browser = None
        self._context = None
        self._owns_context = False

    def __enter__(self) -> "BrowserBridge":
        self.open()
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        self.close()

    def open(self) -> None:
        try:
            from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise BrowserBridgeError(
                "Playwright is not installed. Run `py -m pip install playwright` and "
                "`py -m playwright install chromium`."
            ) from exc

        self.PlaywrightTimeoutError = PlaywrightTimeoutError
        self._playwright = sync_playwright().start()
        mode = browser_mode(self.config)
        if mode == "launch":
            user_data_dir = Path(self.config["user_data_dir"]).resolve()
            user_data_dir.mkdir(parents=True, exist_ok=True)
            launch_options = build_launch_options(self.config)
            self._context = self._playwright.chromium.launch_persistent_context(**launch_options)
            self._owns_context = True
            return

        cdp_url = cdp_url_from_config(self.config)
        try:
            self._browser = self._playwright.chromium.connect_over_cdp(cdp_url)
        except Exception as exc:
            raise BrowserBridgeError(
                f"Could not connect to Chrome DevTools at {cdp_url}. Start Chrome with "
                "`--remote-debugging-port=9222` and try again."
            ) from exc
        self._context = self._browser.contexts[0] if self._browser.contexts else self._browser.new_context()
        self._owns_context = False

    def close(self) -> None:
        if self._context is not None and self._owns_context:
            self._context.close()
        self._context = None
        if self._browser is not None and self._owns_context:
            self._browser.close()
        self._browser = None
        if self._playwright is not None:
            self._playwright.stop()
            self._playwright = None
        self._owns_context = False

    def login(self) -> None:
        page = self._page()
        page.goto("https://chatgpt.com/", wait_until="domcontentloaded")

    def send_prompt(self, chat_url: str, prompt: str) -> str:
        if not chat_url:
            raise BrowserBridgeError("Missing ChatGPT chat URL in ai-flow/config.json.")
        page = self._page()
        page.goto(chat_url, wait_until="domcontentloaded")
        previous_count = self._assistant_count(page)
        previous_text = self.get_latest_assistant_message(page)
        composer = self.find_composer(page)
        composer.fill(prompt)
        self.submit_message(page, composer)
        self.wait_for_generation_complete(page, previous_count, previous_text)
        return self.get_latest_assistant_message(page)

    def _page(self):
        if self._context is None:
            raise BrowserBridgeError("Browser context is not open.")
        if self._context.pages:
            return self._context.pages[0]
        return self._context.new_page()

    def find_composer(self, page):
        timeout_ms = 15000
        for selector in COMPOSER_SELECTORS:
            locator = page.locator(selector).last
            try:
                locator.wait_for(state="visible", timeout=timeout_ms)
                return locator
            except self.PlaywrightTimeoutError:
                continue
        raise BrowserBridgeError("Could not find the ChatGPT message composer.")

    def submit_message(self, page, composer) -> None:
        for selector in SEND_BUTTON_SELECTORS:
            button = page.locator(selector).last
            try:
                button.wait_for(state="visible", timeout=2000)
                if button.is_enabled():
                    button.click()
                    return
            except self.PlaywrightTimeoutError:
                continue
        composer.press("Enter")

    def wait_for_generation_complete(self, page, previous_count: int, previous_text: str) -> None:
        timeout_seconds = int(self.config.get("response_timeout_seconds", 300))
        poll_seconds = float(self.config.get("poll_interval_seconds", 2))
        deadline = time.monotonic() + timeout_seconds
        last_text = ""
        stable_count = 0
        saw_new_response = False

        while time.monotonic() < deadline:
            current_count = self._assistant_count(page)
            current_text = self.get_latest_assistant_message(page)
            if current_count > previous_count or (current_text and current_text != previous_text):
                saw_new_response = True

            if saw_new_response and not self._is_generating(page):
                if current_text and current_text == last_text:
                    stable_count += 1
                else:
                    stable_count = 0
                    last_text = current_text
                if stable_count >= 1:
                    return

            page.wait_for_timeout(int(poll_seconds * 1000))

        raise BrowserBridgeError(f"Timed out waiting {timeout_seconds} seconds for ChatGPT response.")

    def get_latest_assistant_message(self, page) -> str:
        for selector in ASSISTANT_MESSAGE_SELECTORS:
            locator = page.locator(selector)
            try:
                count = locator.count()
            except Exception:
                continue
            if count:
                text = locator.nth(count - 1).inner_text(timeout=2000).strip()
                if text:
                    return text
        return ""

    def _assistant_count(self, page) -> int:
        for selector in ASSISTANT_MESSAGE_SELECTORS:
            try:
                count = page.locator(selector).count()
            except Exception:
                continue
            if count:
                return count
        return 0

    def _is_generating(self, page) -> bool:
        for selector in STOP_BUTTON_SELECTORS:
            locator = page.locator(selector)
            try:
                if locator.count() and locator.last.is_visible(timeout=500):
                    return True
            except Exception:
                continue
        return False


def build_launch_options(config: dict[str, Any]) -> dict[str, Any]:
    channel = str(config.get("channel", "") or "")
    if channel not in ALLOWED_CHANNELS:
        raise BrowserBridgeError("browser.channel must be one of: '', 'chrome', 'msedge'.")
    options: dict[str, Any] = {
        "user_data_dir": str(Path(config["user_data_dir"]).resolve()),
        "headless": bool(config.get("headless", False)),
    }
    if channel:
        options["channel"] = channel
    return options


def browser_mode(config: dict[str, Any]) -> str:
    mode = str(config.get("mode", "cdp") or "cdp")
    if mode not in ALLOWED_MODES:
        raise BrowserBridgeError("browser.mode must be one of: 'launch', 'cdp'.")
    return mode


def cdp_url_from_config(config: dict[str, Any]) -> str:
    cdp_url = str(config.get("cdp_url", "") or "").strip()
    if not cdp_url:
        raise BrowserBridgeError("browser.cdp_url is required when browser.mode is 'cdp'.")
    return cdp_url


def format_cdp_pages(browser) -> list[str]:
    lines: list[str] = []
    for context_index, context in enumerate(browser.contexts):
        for page_index, page in enumerate(context.pages):
            try:
                title = page.title()
            except Exception:
                title = "<title unavailable>"
            try:
                url = page.url
            except Exception:
                url = "<url unavailable>"
            lines.append(f"[context {context_index} page {page_index}] {title} - {url}")
    return lines


def cdp_check(config: dict[str, Any]) -> list[str]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise BrowserBridgeError(
            "Playwright is not installed. Run `py -m pip install playwright` and "
            "`py -m playwright install chromium`."
        ) from exc

    cdp_url = cdp_url_from_config(config)
    playwright = sync_playwright().start()
    try:
        browser = playwright.chromium.connect_over_cdp(cdp_url)
        lines = format_cdp_pages(browser)
        return lines or ["Connected to Chrome DevTools. No pages are currently open."]
    except Exception as exc:
        raise BrowserBridgeError(
            f"Could not connect to Chrome DevTools at {cdp_url}. Start Chrome with "
            "`--remote-debugging-port=9222` and try again."
        ) from exc
    finally:
        playwright.stop()
