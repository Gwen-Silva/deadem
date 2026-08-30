# Two-Match Replay ↔ VOD Synchronization Contract

## Purpose

Task 200 maps Task 199 replay-elapsed seconds to Task 198 VOD seconds for only
`review_match_001` and `review_match_002`. The result is a bounded review aid,
not a gameplay fact or a substitute for semantic validation.

## Identity bridge

Every execution resolves the four local inputs only through the accepted Task
198 manifest and revalidates byte size plus streaming SHA-256. Task 199 supplies
the replay-elapsed coverage. Replay 005 and replays 006-008 remain rejected
before filesystem access.

## Anchors and provenance

Each anchor records target, replay seconds, VOD seconds, source, evidence,
confidence, status, uncertainty and either `fit` or `validation` usage. Allowed
sources are:

- `manual_visual_anchor`: a bounded frame observation;
- `derived_alignment_anchor`: an explicitly limited cross-surface consistency
  point;
- `cross_surface_event_match`: two bounded observations associated for timing,
  without promoting the association to a gameplay fact.

Fit and validation anchors are declared before fitting. Validation anchors are
never inputs to the fit. Displayed game-clock text and HUD values can support a
manual consistency check but are not replay ground truth.

## Model and errors

A linear model is used when fit anchors support one stable slope and offset. A
segmented model is permitted only when independently supported discontinuities
make one linear segment insufficient. Each segment exposes replay and VOD
bounds plus its equation.

The mapping returns a VOD timestamp only inside an explicitly covered segment.
It rejects uncovered tails, inter-segment gaps and invalid values. Extrapolation
is never silent. Residual statistics and declared uncertainty remain separate:
zero arithmetic residual does not erase anchor uncertainty.

## Artifacts

Seven compact deterministic JSON artifacts are versioned under
`output/local-replay-processing/replay-video-sync/task200-bounded2/`:

- `manifest.json` — revalidated Task 198 input identities;
- `anchors.json` — complete anchor evidence and local frame hashes;
- `mapping.json` — schema-validated bounded mapping;
- `validation.json` — fit and held-out residuals plus rejection probes;
- `summary.json` — observable coverage and error bounds;
- `gate.json` — technical gate claim pending Work validation;
- `provenance-audit.json` — epistemic and replay-protection counters.

Decoded frames and timestamp plans remain ignored under
`.local/deadem/review-sync/`. Replay and VOD binaries are never versioned.

## Gate semantics

- `two_match_replay_video_sync_ready_with_declared_error`: both targets have a
  usable mapping over their full declared replay coverage.
- `two_match_replay_video_sync_partial`: both mappings are operational inside
  declared coverage, while at least one region is rejected or carries a
  material precision limitation.
- `BLOCKED_BY_REPLAY_VIDEO_SYNC_UNUSABLE`: a target has no safely usable bounded
  mapping.

All gates are Codex technical claims. ChatGPT Work remains the sole acceptance
authority. No death, attribution, fight, objective or strategy claim is emitted.
