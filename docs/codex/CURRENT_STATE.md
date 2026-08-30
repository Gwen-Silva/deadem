# Current Codex State

Policy version: 1 (`AUTONOMOUS_COORDINATION_POLICY.md`). Branch: `main`.

Last accepted task: Task 198 at `f6bc2d857481738629a50f4dadc05c1eb098e391`. ChatGPT Work accepted `two_match_review_targets_ready_with_declared_metadata_gaps` with the non-invalidating blocker `secondary_review_factual_metadata_unavailable`.

Active candidate: Task 199, `Minimum Factual Review Telemetry`. Coordination status: `VALIDATING`.

Both accepted replay inputs were revalidated against their Task 198 streaming SHA-256 and processed forward-only. `review_match_001` has a continuous replay-elapsed timeline from 0 through 4,570 seconds; `review_match_002` covers 0 through 2,093 seconds. Neither axis is represented as the displayed game clock.

Replay-local participant, team and hero references, lifecycle-related raw state, net-worth samples, aggregate damage/healing counter deltas and objective/structure-like raw observations are available or partial for both targets. Position is explicitly unavailable. No killer, victim, assist, fight, strategy, lane, named region, objective completion or gameplay interpretation is emitted.

The technical gate is `two_match_review_telemetry_ready_with_declared_gaps`. Detailed telemetry and caches remain ignored under `.local/deadem/review-telemetry`; only five deterministic compact artifacts are versioned. Replays 005-008 were not accessed, heavy binaries remain unversioned, and final-fact/attribution counts are zero.

ChatGPT Work must independently validate Task 199. No Task 200 exists and replay-to-VOD synchronization has not started.

Machine-readable state: `data/project-coordination-state.json`.
