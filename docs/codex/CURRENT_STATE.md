# Current Codex State

Policy version: 1 (`AUTONOMOUS_COORDINATION_POLICY.md`). Branch: `main`.

Last accepted task: Task 208 at
`db7cdded9b0e7539f8ac6d1ce09802fafa3b6efe`, ACCEPTED_WITH_BLOCKER.
Craig multitrack/source attribution is accepted, not automatic ASR semantics.
Human-intelligible usable rates are small 23.08%, medium 53.85%, large-v3 38.46%;
medium materially-wrong rate is 46.15%. The 75/25 gate was not reached.
`medium` is the best measured draft; all ASR is HUMAN_VALIDATION_REQUIRED under
`craig_multitrack_asr_semantic_accuracy_insufficient_for_automatic_call_evidence`.

Active candidate: Task 209, `Build Synchronized Craig Multitrack Review Playback`.
Status: `VALIDATING`. Technical claim:
`craig_multitrack_synchronized_review_player_ready_for_real_sync_canary`.

Player da scrim uses the VOD as master, streaming nine existing normalized Craig
WAVs through independent gain nodes. It supports coordinated play/pause/seek,
rates, drift correction, mute/solo/multi-solo/volume, VOD audio and isolated-call
mix restoration. The candidate-window API rejects targets without a registered
session. No candidate semantics change.

Only an explicitly synthetic local video has been mapped: slope 1.002,
intercept 2 seconds, no real sync claim. State is READY_FOR_REAL_VOD_SYNC_CANARY.
Browser canary covers nine tracks, ten seeks, 0.5/1/1.5 rates and responsive
wide/half/narrow layouts. Screenshots, real identities and all media stay local.
No new ASR, .dem, replay, original VOD or protected replay access occurred.

Task 202 selectivity and Task 200 synchronization blockers remain active.
ChatGPT Work must independently validate Task 209. No Task 210 exists.

Machine-readable state: `data/project-coordination-state.json`.
