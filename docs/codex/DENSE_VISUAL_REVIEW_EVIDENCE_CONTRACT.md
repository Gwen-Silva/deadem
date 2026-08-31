# Dense Visual Review Evidence Contract

## Purpose

Task 203 converts the 102 Task 202 review-attention windows into local, navigable visual sequences and storyboards. Frames are evidence for later review; they are not gameplay events, probability estimates, final facts or attribution.

## Inputs And Invariants

- Task 198 supplies the two VOD identities and local paths. Size and SHA-256 are revalidated before extraction.
- Task 200 supplies immutable replay-to-VOD synchronization uncertainty: 9 seconds for `review_match_001` and 2 seconds for `review_match_002`.
- Task 201 remains a coarse navigation index. Its images are not inspected or copied by Task 203.
- Task 202 supplies candidate IDs, priority tiers, source families and `visualEvidenceStartSeconds`/`visualEvidenceEndSeconds`. These fields are preserved without reclassification.
- `candidateSemantics` is always `review_attention_region_not_gameplay_event`.

## Density And Deduplication

The extraction cadence is determined only by Task 202 priority: high 1.0 second, medium 2.0 seconds and low 5.0 seconds. Each window also requests its exact first, center and last timestamp. A global plan is created per target before decoding, higher density prevails in overlaps and every physical timestamp is extracted once.

If the initial deduplicated plan exceeds 6,000 frames, high cadence changes once to 1.5 seconds. Medium and low never change, and no iterative tuning is allowed.

## Local Evidence

Full frame indexes, JPEG frames, per-window manifests and storyboard pages live under `.local/deadem/dense-review/`. Storyboards contain at most 25 thumbnails per page and use factual timing, priority and synchronization-uncertainty labels only. No image is versioned.

Every successful frame records its requested and decoded timestamps, decoder seek error, SHA-256, dimensions, local path, reverse window references, highest required priority and provenance. Sync error and decoder seek error remain separate quantities.

## Compact Artifacts

The versioned directory `output/local-replay-processing/dense-review-evidence/task203-bounded2/` contains eight deterministic compact artifacts. The complete frame-level index stays local and is represented by its path, size, hash and aggregate counts.

## Epistemic And Access Limits

Task 203 performs no OCR, recognition, tracking, VLM, semantic labeling, strategy analysis, death confirmation or L3 burst extraction. It opens no replay and never accesses replay 005–008. Visual content cannot change Task 202 priority or candidate semantics.
