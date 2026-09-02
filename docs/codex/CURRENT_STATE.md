# Current Codex State

Policy version: 1 (`AUTONOMOUS_COORDINATION_POLICY.md`). Branch: `main`.

Last accepted task: Task 207 at
`ea5361c292c0419c50ae9382d390b3970fbbd827`. ChatGPT Work accepted
`assisted_review_workspace_ux_hardening_ready` and resolved
`assisted_review_workspace_ux_gaps`.

The bounded 16-sample human validation recorded 4 correct, 3
usable-with-minor-error, 9 materially wrong, and 0 unintelligible transcripts:
43.75 percent usable. Mixed-VOD ASR remains useful as a temporal speech locator
and editable draft; human validation is required for semantic use.

Active candidate: Task 208, `Validate Real Craig Multitrack Call Evidence`. Coordination
status: `VALIDATING`. The technical gate claim is
`real_craig_multitrack_call_evidence_canary_ready_for_human_validation`.

The real Craig package maps nine AAC files to nine source metadata tracks by
ordinal. The bounded parser consumed exactly the 1,888-byte leading JSON object
without decoding the trailing raw payload. All tracks decoded as AAC 48 kHz
stereo and normalized locally to PCM 16 kHz mono while retaining timeline
silence.

The canary selected exactly 18 deterministic temporal regions, two per track,
and ran Faster Whisper small/CPU/int8 only on those clips. ASR quality remains
pending human classification. Identities, filenames, media and transcript text
remain local-only; compact outputs contain only pseudonymous track references
and aggregate measurements. No replay, VOD, candidate integration, diarization
or protected input access occurred.

Task 202 selectivity and Task 200 synchronization blockers remain active.
ChatGPT Work must independently validate Task 208. No Task 209 exists.

Machine-readable state: `data/project-coordination-state.json`.
