# Whole-Match Visual Index Contract

## Purpose

Task 201 creates a coarse navigational index for `review_match_001` and
`review_match_002`. It links Task 199 replay-elapsed seconds to Task 200 VOD
timestamps, local decoded frames and local chronological contact sheets. It
does not analyze gameplay.

## Canonical inputs

- Task 198 supplies the two accepted VOD paths and identities.
- Task 199 supplies continuous replay time, availability and factual local
  observations.
- Task 200 supplies the immutable replay-to-VOD mapping, covered regions,
  segment IDs, uncertainty and uncovered tails.

The VOD byte sizes and SHA-256 identities are revalidated. Task 200 scale,
offset and error are consumed without recalculation. Replay 005 and replays
006-008 are rejected before filesystem access.

## Sampling and mapping

The default plan uses one sample every 30 replay-elapsed seconds. A plan may
use 20-45 seconds only with a separately recorded technical reason. Samples
must fall inside a Task 200 segment. The index never fills mapping gaps or
extrapolates the final uncovered tails.

Each frame records replay and VOD time, segment, Task 200 alignment error,
requested and decoded VOD timestamps, OpenCV seek error, frame hash, local
path, extraction status and provenance. The 9-second and 2-second alignment
errors remain present even when decoder seek error is zero.

Task 199 context is limited to an observed participant count, a nearest-second
aggregate of observed net-worth counters, an objective-like raw observation
count and life-state observation availability. These fields are factual or
declared aggregates without interpretation.

## Local visual assets

The accepted `python/deadem/video_pipeline/` OpenCV decoder extracts frames.
A Python contact-sheet helper composes up to 25 chronological thumbnails per
sheet with only replay and VOD time labels. Frames and sheets remain under
`.local/deadem/visual-index/` and are never versioned.

## Compact artifacts

Seven JSON artifacts are versioned under
`output/local-replay-processing/whole-match-visual-index/task201-bounded2/`:

- `manifest.json` — canonical input bridges and identity checks;
- `frame-index.json` — the bounded 223-row lookup index;
- `contact-sheet-index.json` — sheet hashes, paths, layout and membership;
- `coverage.json` — planned/extracted counts, ranges and seek metrics;
- `summary.json` — gate, counts and determinism audit;
- `gate.json` — technical gate claim pending Work validation;
- `provenance-audit.json` — local-only and epistemic-safety evidence.

The frame index is deliberately above 100 KiB because each of the 223 required
rows preserves the complete replay/VOD/error/context contract. It remains a
small metadata index relative to the unversioned images and contains no binary
payload.

## Determinism

Frame IDs derive only from target and chronological plan position. A bounded
representative rerun compares requested timestamps, decoded timestamps and
frame hashes. Every contact sheet is built twice and its hash compared. A full
rerun must also compare all compact artifact hashes before handoff.

## Gate semantics

- `whole_match_visual_index_ready`: 2/2 targets, at least 98% extraction,
  deterministic ordering/evidence, local sheets and no policy violation.
- `whole_match_visual_index_ready_with_gaps`: 2/2 targets remain usable with at
  least 95% extraction and explicit failures.
- `whole_match_visual_index_partial`: at least one target is navigable while
  the other is materially incomplete.
- `BLOCKED_BY_VISUAL_INDEX_VIDEO_DECODE_UNAVAILABLE`: a VOD cannot produce a
  usable index.

Frames receive no automatic fight, gank, rotation, push, pickoff, objective,
position-quality or strategy label. ChatGPT Work remains the sole acceptance
authority.
