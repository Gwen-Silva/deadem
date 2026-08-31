# Two-Match Assisted Review Bundle Contract

## Purpose

Task 204 packages accepted factual context and local visual evidence into two practically usable review bundles. Bundle readiness means evidence is ready to review; it does not mean either match has been reviewed.

## Screening Layer

Every Task 202 candidate appears once in chronological screening order. Its card contains exactly the Task 203 first, representative and last frames plus factual identifiers, priority scheduling tier, replay/VOD ranges, synchronization uncertainty and source families. Six cards form one atlas JPEG. Three atlas pages form one logical upload packet.

Screening composition is a deterministic visual transformation. Pixels do not change candidate membership, priority, labels or facts. Atlas JPEGs remain ignored below `.local/deadem/review-bundles/`.

## Deep Review Layer

Bundles reference the existing Task 203 dense storyboard pages by ID, path, SHA-256 and dense frame membership. They never copy, recreate or analyze those 318 pages.

## Provenance Separation

Each candidate record keeps `replayObservedFacts`, `derivedMetrics`, `videoEvidence`, `humanSuppliedContext` and `analystInference` separate. Human statements are match-level `human_supplied/player_reported` context without inferred timestamps. `analystInference` and every review conclusion field remain empty in Task 204.

## Review Scheduling

`chronologicalOrder` follows replay elapsed time. `priorityOrder` schedules high, medium and low candidates with chronological order inside each tier. Scheduling does not imply factual relevance or event probability.

## Access And Epistemic Limits

Task 204 reads only compact prior artifacts and the Task 203 local JPEGs needed for hash validation and atlas composition. It opens no VOD or replay, performs no OCR, VLM, recognition, tracking, synchronization, candidate tuning, gameplay classification or L3 extraction, and never accesses replay 005–008.
