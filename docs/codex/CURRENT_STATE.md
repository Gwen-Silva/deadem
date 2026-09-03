# Current Codex State

Policy version: 1 (`AUTONOMOUS_COORDINATION_POLICY.md`). Branch: `main`.

Last accepted task: Task 209 at
`6a8fa7433f75f6cd94499e7e32e31f4e81da86d8`, ACCEPTED.
Task 208 remains ACCEPTED_WITH_BLOCKER at
`db7cdded9b0e7539f8ac6d1ce09802fafa3b6efe`.
Craig multitrack/source attribution is accepted, not automatic ASR semantics.
Human-intelligible usable rates are small 23.08%, medium 53.85%, large-v3 38.46%;
medium materially-wrong rate is 46.15%. The 75/25 gate was not reached.
`medium` is the best measured draft; all ASR is HUMAN_VALIDATION_REQUIRED under
`craig_multitrack_asr_semantic_accuracy_insufficient_for_automatic_call_evidence`.

Active candidate: Task 210, `Validate Real Craig to VOD Synchronization`.
Status: `VALIDATING`. Technical claim:
`two_real_craig_vod_sessions_synchronized_and_player_ready`.

Player da scrim uses the VOD as master, streaming nine existing normalized Craig
WAVs through independent gain nodes. It supports coordinated play/pause/seek,
rates, drift correction, mute/solo/multi-solo/volume, VOD audio and isolated-call
mix restoration. The candidate-window API rejects targets without a registered
session. No candidate semantics change.

Two authorized real VODs have distinct measured Craig ranges. Target 003 uses
slope 1 and intercept 38.654500s; target 004 uses slope 1 and intercept
-4226.330875s. Validation MAE is 148.318/117.750ms with 11/10 held-out anchors
and 12/11 fit anchors. Affine did not demonstrate a material validation gain.
Operational mapping error estimates are 0.201125/0.253500s.

Real browser start/middle/end, 1x/1.5x, transport and mixing passed. Maximum
transport drift was 83.580/64.934ms, not mapping error. The Task 209 synthetic
canary still passes ten seeks, three rates, responsive layout and injected
drift recovery. A session-loading seek race was corrected and covered.
All nine tracks remain selectable; ended sources are explicitly inactive.
Screenshots, real identities, session configuration and all media stay local.
No new ASR, .dem, replay or protected replay access occurred.
Numeric countdowns, leaderboard durations and a human listening verdict are
not independently established. No gameplay facts or semantic promotion.

Task 202 selectivity and Task 200 synchronization blockers remain active.
ChatGPT Work must independently validate Task 210. No Task 211 exists.

Machine-readable state: `data/project-coordination-state.json`.
