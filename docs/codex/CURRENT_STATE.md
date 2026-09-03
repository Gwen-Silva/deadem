# Current Codex State

Policy version: 1. Branch: main. Last accepted Task211:
`03de4f108d125237428faab417b8e68530d2824c`, ACCEPTED supplied externally under
`two_new_review_targets_replay_vod_craig_timeline_ready`.

Active Task212: Bring Review Matches 003 and 004 Into Assisted Review Workspace.
Status: VALIDATING. Technical claim:
`review_matches_003_004_assisted_workspace_ready`.

003/004 have 48/57 candidates using unchanged Task202 heuristics. Every candidate
is inside Task211 coverage; 5/11 unmapped seeds are ignored for review generation.
Priorities high/medium/low are 34/6/8 and 38/7/12. Candidate coverage remains
95.7975%/88.4622%: inherited review_candidate_selectivity_low is not resolved.

Local visual evidence: 2577/3046 deduplicated physical frames, 145/164 storyboards,
zero failures and complete first/representative/last for every new candidate.
Fixed-slot VOD SHA/size was checked against accepted Task211 before extraction.
No replay was reopened. No protected access, ASR, new mapping or interpretation.

The additive Task212 provider brings the workspace to four targets and 207
candidates. The original 102 retain their immutable fingerprints, mixed-VOD calls
and existing review/export behavior. New targets instead expose scrimContextEvidence
with an explicit safe URL into accepted Task210 real sessions and 10s pre-roll.
All nine tracks remain registered; ended tracks are inactive, never fabricated.

Browser technical canaries passed early/mid/late in 003/004, correct Scrim session
and seek, mixer, local save/segment/export/reopen, and legacy0015. Canary state is
isolated from existing human review; it is not human semantic validation.
Replay/VOD errors remain 2.140625/1.187500s, composed Craig errors
2.341750/1.441000s, separately from browser drift.

Task210 is accepted and human-validated, operationally completed. Task208 remains
ACCEPTED_WITH_BLOCKER:
craig_multitrack_asr_semantic_accuracy_insufficient_for_automatic_call_evidence.
No ASR is used for 003/004. All media, screenshots, state and exports stay local.

Next objective: independent ChatGPT Work validation of Task212 only.
No Task213. Machine state: data/project-coordination-state.json.
