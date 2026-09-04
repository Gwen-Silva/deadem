# Current Codex State

Policy version: 1. Branch: main. Last accepted Task 217:
`16b0d69499e92ba676495de961d575db8cfdd068`, acceptance supplied externally
under `alphaveil_mvp_showcase_polish_ready` after positive initial human
validation.

Active Task 218: Build Generic Scrim Intake V1. Status: `VALIDATING`.
Technical gate claim:
`generic_scrim_intake_v1_ready_for_first_new_match`.

The candidate adds a generic local intake for `review_match_009`–
`review_match_999`. Historical 001–004 remain outside continuous registration;
005–008 and replay aliases reject before filesystem access.

Exactly one regular non-symlink `.dem` and `.mp4` are required. The intake
performs only bounded file identity: PBDEMS2 header/summary offset, MP4
`ftyp`/`moov`/`mvhd` duration, sizes and streaming SHA-256. Craig is optional;
positive arbitrary `.aac` counts are deterministically inventoried without
decoding, ASR, synchronization or speaker inference.

Dry-run writes nothing. Register validates the private operational manifest
against the versioned schema, prevents target identity conflicts and replay+
video reuse, and publishes by atomic rename. No input is copied.

The isolated synthetic canary passed dry-run, first/second register, changed-
input conflict and bundles with and without communication. The real registry
was not created. All product cardinalities remain 4/207/102/48/57/11/15/9.
Protected access, replay processing, ASR, synchronization, candidates, frames,
media copy/versioning, gameplay facts and attribution are zero.

Next action: independent ChatGPT Work validation of Task 218 only. Do not
create Task 219 or connect Generic Factual Processing. Machine state:
`data/project-coordination-state.json`.
