# Local Assisted Review Workspace Contract

## Purpose

Task 206 exposes the immutable Task 203–205 evidence through a localhost-only
human review workspace. It is an operating surface, not a detector, semantic
classifier, coaching system, or source of gameplay facts.

## Fixed scope

- Targets are exactly `review_match_001` and `review_match_002`.
- Candidate population is exactly 102 immutable Task 202 windows: 67 and 35.
- A candidate is always `review_attention_region_not_gameplay_event`.
- Existing structural priority is displayed only as `review scheduling heuristic`.
- Visual and audio inputs are existing local artifacts referenced by accepted
  compact indexes. No replay, VOD, extraction, synchronization, ranking, or ASR
  processing occurs.

## Local security boundary

The server binds only to `127.0.0.1`, performs no external requests, validates
target and candidate identifiers, rejects protected aliases and traversal, and
serves media only through opaque identifiers registered from trusted indexes.
No API accepts a filesystem path. Audio uses HTTP Range over the two allowlisted
mixed WAV files. Missing local media is an explicit availability gap and does
not prevent other evidence from loading.

## Evidence semantics

The interface keeps `replayObservedFacts`, `derivedMetrics`, `videoEvidence`,
`audioCallEvidence`, `humanSuppliedContext`, and `analystInference` separate.
Analyst inference begins empty. The mixed-VOD ASR is an immutable draft and
temporal locator labeled `ASR DRAFT — HUMAN VALIDATION REQUIRED`; it cannot
establish speaker, intent, agreement, decision quality, or call correctness.
A human transcript correction is stored separately with provenance
`human_supplied/transcript_correction`.

## Human review and segmentation

Review state is one of `unreviewed`, `in_review`, `reviewed`, or `skipped`.
Human-created segments remain within the candidate VOD range, preserve their
candidate and target identifiers, and carry provenance
`human_supplied/review_segmentation`. Overlaps are reported and never silently
merged. No error class is assigned automatically.

## Persistence and export

State is written atomically under `.local/deadem/review-workspace/state/` and
survives restart. Selected candidate/segment packets are exported locally as
JSON and Markdown under `.local/deadem/review-workspace/exports/`. Packets may
contain metadata, hashes, evidence references, ASR drafts, human corrections,
and review records, but never embed audio, images, or video. Real human review
state and exports are never versioned.

## Gate

The success gate is `two_match_local_assisted_review_workspace_ready` when all
102 candidates and their local visual/audio evidence resolve and the real
localhost smoke validates persistence, export, Range, and request protections.
The media-gaps gate is reserved for optional local media absence while the core
workspace remains operational.
