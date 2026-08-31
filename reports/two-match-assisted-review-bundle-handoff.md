# Two-Match Assisted Review Bundle Handoff

## Start here

Use Layer A first. Upload the three atlas JPEGs from one packet together, review the factual cards, and return structured review records keyed by the printed `candidateWindowId`. Do not treat priority, source families or visual density as gameplay-event labels or probabilities.

For a card that needs more evidence, look up its candidate in `.local/deadem/review-bundles/<reviewTargetId>/window-review-index.json` and open only the referenced Task 203 storyboards in `videoEvidence.storyboards`. Those 318 existing pages are Layer B; they were hash validated and were not copied or regenerated.

## Exact upload packets

### review_match_001 — Archmother

`review_match_001_packet_001` (candidates 0001–0018):

- `.local/deadem/review-bundles/review_match_001/screening-atlas/review_match_001_atlas_001.jpg`
- `.local/deadem/review-bundles/review_match_001/screening-atlas/review_match_001_atlas_002.jpg`
- `.local/deadem/review-bundles/review_match_001/screening-atlas/review_match_001_atlas_003.jpg`

`review_match_001_packet_002` (candidates 0019–0036): atlas pages `004.jpg`, `005.jpg`, `006.jpg` in the same directory.

`review_match_001_packet_003` (candidates 0037–0054): atlas pages `007.jpg`, `008.jpg`, `009.jpg` in the same directory.

`review_match_001_packet_004` (candidates 0055–0067): atlas pages `010.jpg`, `011.jpg`, `012.jpg` in the same directory.

### review_match_002 — Hidden King

`review_match_002_packet_001` (candidates 0001–0018):

- `.local/deadem/review-bundles/review_match_002/screening-atlas/review_match_002_atlas_001.jpg`
- `.local/deadem/review-bundles/review_match_002/screening-atlas/review_match_002_atlas_002.jpg`
- `.local/deadem/review-bundles/review_match_002/screening-atlas/review_match_002_atlas_003.jpg`

`review_match_002_packet_002` (candidates 0019–0035): atlas pages `004.jpg`, `005.jpg`, `006.jpg` in the same directory.

The authoritative paths, hashes, candidate memberships and replay ranges for all six packets are in `output/local-replay-processing/assisted-review-bundles/task204-bounded2/upload-packet-index.json`.

## Context boundary

Match-level human context is stored in `match-context.json` with provenance `human_supplied/player_reported` and status `context_to_validate`. It must not be attached automatically to a candidate or timestamp.

- Archmother roster reported: Wraith, Lady Geist, Bebop, Mo & Krill, Rem, Shiv. The reported draft adaptation, unclear plan, close game, periods of advantage and three-Rift-fight hypothesis all remain context to validate.
- Hidden King roster reported: Lash, Shiv, Venator, Paige, Graves, Mo & Krill. The reported composition identity, Graves/Mirage substitution, Paige shadow/protection, Lash/Shiv map play and core grouping all remain context to validate.

## Structured return

For every reviewed candidate, preserve the empty protocol shape from `review-protocol-template.json` and fill only claims supported by the review. Keep `facts`, `humanContext`, `knownInformation`, `unknownInformation` and `analystInference` distinct. Use `evidenceRefs` for atlas or storyboard IDs. Unreviewed fields stay null or empty; uncertainty must remain explicit.

The chronological order supports match review. The separate priority order is only a review scheduling heuristic. No error vocabulary item is preassigned.
