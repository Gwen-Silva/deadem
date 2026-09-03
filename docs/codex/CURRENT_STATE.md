# Current Codex State

Policy version: 1 (`AUTONOMOUS_COORDINATION_POLICY.md`). Branch: `main`.

Last accepted task: Task 210 at
`aeb68e3ea6b9c5cc74b0f78171796728541b0b8b`, ACCEPTED, supplied externally.
Gate: `two_real_craig_vod_sessions_synchronized_and_player_ready`.
Subsequent human playback validation found both sessions comfortable, functional
and suitable for review. Synchronized Craig Multitrack Playback is operationally
completed. No new Craig/VOD fitting, playback, mixer, drift or ASR tuning.

Task 208 remains ACCEPTED_WITH_BLOCKER:
`craig_multitrack_asr_semantic_accuracy_insufficient_for_automatic_call_evidence`.
Craig/source attribution is accepted; ASR is only a HUMAN_VALIDATION_REQUIRED draft.

Active candidate: Task 211,
`Onboard Review Matches 003 and 004 Into the Factual Replay Timeline`.
Status: `VALIDATING`. Technical claim:
`two_new_review_targets_replay_vod_craig_timeline_ready`.

Four exclusive-folder local inputs have SHA-256 identities; both replays have
valid PBDEMS2 headers. Forward-only 1Hz safe timelines cover elapsed 0–2836 and
0–3735 seconds: 2837/3736 samples, zero gaps. Each contains 14 participant local
refs, 3 team refs and 13 hero refs, not confirmed people. Life-state, net-worth,
aggregate damage/healing deltas and raw objective-like states are observed.
Positions are unavailable through the accepted field set. No map semantics.

Replay/raw-clock origins were calibrated from observed replay transition
intervals independently of VOD values. Six fit and six held-out visual timing
anchors per target select offset-only: VOD = replay + 17.359375 / 21.328125s.
Validation MAE is 0.500000/0.072917s, p90 1.000000/0.109375s. Small quantized
timer residuals are NOT proof of sub-second accuracy. Operational replay/VOD
errors are 2.140625/1.187500s, including visual and origin uncertainty.

Covered replay ranges: 47.640625–2792.640625 and 53.578125–3688.781250 seconds.
Outside coverage maps false; no silent extrapolation. Seven additional pause
brackets corroborate that 004 pauses remain on both axes; no segmented model.

Five Task210 compact artifacts are byte-identical to the accepted commit.
The loaded Craig bridges compose without refit; operational composed errors
are 2.341750/1.441000s. Browser drift remains a separate runtime metric.
The reusable timeline function supports non-unit Craig slopes and dual coverage.

Heavy telemetry, visual timing frames and real media remain local. No ASR,
candidate windows, dense evidence, bundles, workspace import, final facts or
automatic attribution. Accepted Task199/200/210 outputs are unchanged.
Protected replay 005–008 access: zero. No package modifications.

ChatGPT Work must independently validate Task 211. No Task 212 exists.
Machine-readable state: `data/project-coordination-state.json`.
