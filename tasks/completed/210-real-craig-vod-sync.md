# Task 210 — Validate Real Craig to VOD Synchronization

Status: completed
Coordination status: VALIDATING. Work acceptance pending.
Base: `6a8fa7433f75f6cd94499e7e32e31f4e81da86d8` on main.
Candidate: resolved by `.local/codex/210/post-commit-attestation.json`.

Technical claim: `two_real_craig_vod_sessions_synchronized_and_player_ready`.

Two real local VODs were matched to separate chronological ranges in the
accepted Craig recording using measured audio correlation. Match 003 has
12 fit/11 validation anchors; match 004 has 11 fit/10 validation anchors.
Held-out MAE is 148.318/117.750ms and maximum 168.250/221.750ms. Offset-only
was preferred after independent validation against affine. No fit outliers;
1/3 source-group regions were rejected by frozen correlation-quality rules.

The player now offers both real sessions. Start/middle/end playback, seek,
play/pause, mute, solo, multi-solo, VOD audio and 1x/1.5x passed. Maximum
transport drift was 83.580/64.934ms; mapping error is separately displayed.
A session-loading race was corrected. Task 209 synthetic regression remains
passing with nine tracks, ten seeks, three rates and injected drift recovery.

Media, source names, human speech hypotheses, session config and screenshots
remain local. No ASR, replay or .dem access; protected aliases 005–008 untouched.
No original media changes, no new factual results or semantic attribution.
Human listening, exact countdowns and leaderboard durations remain gaps.
Task 208 ASR blocker persists. No Task 211 exists.

See `reports/real-craig-vod-sync-task210.md` and the six compact artifacts in
`output/local-replay-processing/craig-multitrack/task210-real-sync/`.
