# Task 218 — Build Generic Scrim Intake V1

Status: completed
Coordination status: `VALIDATING`

Base: `16b0d69499e92ba676495de961d575db8cfdd068`

Task 218 adds the first bounded capability of the AlphaVeil Continuous Review
Pipeline: a generic local intake for new `review_match_009`–`review_match_999`
bundles. Historical targets 001–004 remain unchanged; 005–008 reject before
filesystem access.

The intake requires exactly one regular, non-symlink `.dem` and one regular,
non-symlink `.mp4`. It performs only Source 2 header/summary-offset validation,
MP4 container/duration validation and streaming SHA-256 identity. Optional
Craig tracks are inventoried and hashed without decoding, ASR, synchronization
or speaker inference.

Dry-run writes nothing. Register validates the deterministic manifest against
the versioned schema, protects target and bundle identity, and publishes with a
temporary file plus atomic rename. Media remains referenced in place and is
never copied.

The isolated synthetic canary covered dry-run, first registration, repeated
idempotent registration, changed-input conflict and successful bundles with and
without communication. No real match was registered.

Technical gate claim:
`generic_scrim_intake_v1_ready_for_first_new_match`.

Final acceptance remains pending independent ChatGPT Work validation. Task 219
was not created.
