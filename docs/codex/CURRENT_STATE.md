# Current Codex State

Policy version: 1 (`AUTONOMOUS_COORDINATION_POLICY.md`). Branch: `main`.

Last accepted task: Task 199 at `d5f3973d9ede6bf472f3d4e7e2130476902b0fca`. ChatGPT Work accepted `two_match_review_telemetry_ready_with_declared_gaps`.

Active candidate: Task 200, `Replay ↔ VOD Synchronization`. Coordination status: `VALIDATING`.

All four Task 198 replay/VOD identities were revalidated. Task 199 replay-elapsed seconds now map to VOD seconds for both review targets with separate fit and validation anchors.

`review_match_001` uses `video = replay + 1938` with replay coverage 0-4562 and declared error 9 seconds. `review_match_002` uses `video = replay` with coverage 0-2090 and declared error 2 seconds. The final 8 and 3 replay seconds are rejected without extrapolation.

The technical gate is `two_match_replay_video_sync_partial`. Twelve frame-backed anchors remain bounded synchronization evidence, not gameplay facts. Seven compact artifacts are deterministic; frames remain ignored under `.local/deadem/review-sync`. Replays 005-008 were not accessed, heavy binaries remain unversioned, and final-fact/attribution/interpretation counts are zero.

ChatGPT Work must independently validate Task 200. No Task 201 exists and semantic review has not started.

Machine-readable state: `data/project-coordination-state.json`.
