# Current Codex State

Policy version: 1 (`AUTONOMOUS_COORDINATION_POLICY.md`). Branch: `main`.

Last accepted task: Task 204 at `225f570a68c3d53ecfa17986e674fe21be7d2dc6`. ChatGPT Work accepted `two_match_assisted_review_bundles_ready` with blocker `contemporaneous_call_evidence_missing_for_intent_and_coordination_review`.

Active candidate: Task 205, `Timestamped Call Evidence Pipeline`. Coordination status: `VALIDATING`.

Task 205 validated both Task 198 VOD identities and processed only the Task 200 covered regions: 4,562 and 2,090 seconds. The local engine is faster-whisper 1.2.1 with model `small`, CPU/int8, Portuguese hint, VAD and word timestamps.

The execution produced 1,338/538 segments and 8,158/3,585 word timestamps with zero segment failures. All 102 immutable Task 204 candidates have `audioCallEvidenceRefs`, totaling 2,193 segment links. Task 200 uncertainty remains 9 and 2 seconds, separate from ASR boundary uncertainty.

Speaker remains `unknown/mixed`. The Craig adapter contract passed a synthetic two-track overlap fixture without real Craig data, bot, download or self-hosting.

The technical gate claim is `two_match_audio_call_evidence_ready_with_asr_gaps`. Sixteen distributed validation samples are prepared locally; this surface cannot hear audio, so classifications and usable rate remain null. Audio, complete transcript, real speaker identity, replay/protected access, gameplay interpretation and analyst inference versioned counts are zero.

ChatGPT Work must independently validate Task 205. After acceptance, complete the bounded audio sample and resume review_match_001 windows 0013, 0015 and 0016. No Task 206 exists.

Machine-readable state: `data/project-coordination-state.json`.
