# Local Replay Pre-Recovery Payload Consumption Baseline

Gate: `local_replay_pre_recovery_payload_consumption_baseline_ready`

## Default And Diagnostic Passes

Default failure reproduced: `true`
Diagnostic failure reproduced without recovery: `true`
First boundary: `UPDATE 2905`

## Pre-Recovery Baseline

Packets summarized: `954`
Present UPDATEs compared: `1940`
Exact after-command matches: `1936`
Mismatches before any recovery: `4`
Mismatch rate: `0.002061855670103093`
Largest absolute delta: `280`

## Task 109 Comparison

Task 109 loop 21 mismatch: `true`
Hypothesis impact: `sustains_task109_not_recovery_contaminated`

## Risk

Direct skip status: `unsafe`
Recovery recommendation: `diagnostic_only_do_not_use_as_safe_skip`
Parser fix recommended now: `false`

## Protection

Replay 005 processed: `false`
Bots 006-008 processed: `false`
Candidates 011-020 touched: `false`
Automatic recovery added: `false`
Canonical package constructed: `false`
Factual artifacts emitted: `false`

Summary output: `output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/`

Task 112 was not created.
