# AI Flow

`iaflow` is a local, plain-file workflow for coordinating Strategic GPT, Product
Reviewer, and Codex without manual copy/paste between chats.

The default backend is `browser`: prompts are sent to your own ChatGPT web
conversations through Playwright. The OpenAI API backend remains available by
setting `"backend": "api"` in `ai-flow/config.json`.

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
py -m iaflow init
py -m iaflow browser-login
py -m iaflow browser-cdp-check
py -m iaflow browser-test strategic
py -m iaflow browser-test reviewer
py -m iaflow new TASK-0123 --title "Replay parser prior art triage"
py -m iaflow run-strategic TASK-0123
py -m iaflow run-review TASK-0123
py -m iaflow finalize TASK-0123
py -m iaflow run-codex TASK-0123
py -m iaflow ingest TASK-0123
py -m iaflow status TASK-0123
py -m iaflow run-cycle TASK-0123
```

## Browser Backend

Recommended setup uses CDP mode. `iaflow` connects to a Chrome instance that
you start and log into manually.

Step 1: start Chrome manually:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$PWD\.iaflow-real-chrome"
```

Step 2: log into ChatGPT manually in that Chrome. Do not automate around login,
captcha, Google auth, or platform checks.

Step 3: create one Strategic GPT chat and one Product Reviewer chat in ChatGPT.
Paste their conversation URLs into `ai-flow/config.json`:

```json
{
  "backend": "browser",
  "browser": {
    "mode": "cdp",
    "cdp_url": "http://127.0.0.1:9222",
    "provider": "chatgpt_web",
    "user_data_dir": ".iaflow-browser",
    "channel": "",
    "headless": false,
    "strategic_chat_url": "https://chatgpt.com/c/...",
    "reviewer_chat_url": "https://chatgpt.com/c/...",
    "response_timeout_seconds": 300,
    "poll_interval_seconds": 2
  }
}
```

Step 4: validate the connection and both chats:

```bash
py -m iaflow browser-cdp-check
py -m iaflow browser-test strategic
py -m iaflow browser-test reviewer
```

Each browser test sends `Reply with exactly: IAFLOW_BROWSER_OK` and prints the
captured response.

Launch mode remains available with `"mode": "launch"`, but it is no longer the
recommended default because ChatGPT auth can block Playwright-launched browsers.

Known limitations:

- ChatGPT web selectors can break if the UI changes.
- Login is manual and may need to be repeated.
- Captchas or platform checks require manual intervention.
- ChatGPT plan message limits still apply.
- Browser automation is less reliable than the API backend.

## Browser Troubleshooting

If the CDP port is unavailable, close old Chrome debug windows and start Chrome
again with `--remote-debugging-port=9222`.

If login fails, open normal Chrome manually and confirm the account works.

Do not automate captcha, Cloudflare verification, Google auth, or platform
checks. Do not use launch mode if Cloudflare or auth blocks it.

For launch mode only, you can choose an installed browser channel instead of
bundled Chromium:

```json
{
  "browser": {
    "mode": "launch",
    "channel": "chrome"
  }
}
```

Allowed values are `""`, `"chrome"`, and `"msedge"`. Use `""` for Playwright's
bundled Chromium, `"chrome"` for installed Google Chrome, or `"msedge"` for
installed Microsoft Edge.

After changing the channel:

1. Delete `.iaflow-browser`.
2. Run `py -m iaflow browser-login` again.
3. Complete login manually in the opened browser.

`iaflow` does not attempt to bypass Cloudflare, Google auth, captcha, or other
platform checks.

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

Step-by-step:

```bash
py -m iaflow run-strategic TASK-0123
py -m iaflow run-review TASK-0123
py -m iaflow finalize TASK-0123
py -m iaflow run-codex TASK-0123
py -m iaflow ingest TASK-0123
```

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

Run `py -m iaflow status <TASK-ID>` and inspect `state.json`, `events.jsonl`,
and any `*.log`, `*.raw.md`, or `*.raw-error.txt` files. Fix the missing
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

## API Backend

Set `"backend": "api"` in `ai-flow/config.json` to use the OpenAI API backend.
Set `OPENAI_API_KEY` in the environment before running AI commands.

## Manual Codex Run

If needed, inspect `04-codex-final-prompt.md` and run Codex manually with the
same sandbox and approval settings from `ai-flow/config.json`. Paste or pipe the
prompt to Codex, then save the result as `05-codex-report.md` before running
`ingest`.
