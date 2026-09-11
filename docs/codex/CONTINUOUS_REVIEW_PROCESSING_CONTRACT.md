# Continuous Review Processing V1

## Public entry point and authority

`npm.cmd run review:process -- --target review_match_009 --sync-evidence <metadata.json>`

Production reads only the existing registration at
`.local/deadem/continuous-review/intakes/<target>/manifest.json` for targets
009–999. No arbitrary replay/video CLI paths, source discovery, copying,
registration repair, Product registration or UI registry scanning is provided.
The manifest schema and fingerprints are revalidated. Replay, VOD and supplied
Craig track hashes must match; replay header and VOD duration must agree.
Duplicate registered replay/VOD pairs fail closed. Missing sources have no fallback.

Input identity classification runs before filesystem primitives. Ancestors are
checked individually and links/junctions rejected before following them. Protected
005–008 targets cannot be used even as historical canaries. Historical documents
mentioning those identities are not the protected inputs.

## Explicit historical-canary adapter

`npm.cmd run review:process -- --historical-canary --target review_match_003`

Only 003/004 are accepted here. The adapter reads the already accepted Task211
manifest and explicit private input references; it compares accepted metadata
with Git base `61d1ac0586e45009b7672bf33643a3924ed260a0`. It never invokes intake
registration, weakens its namespace, discovers replacement inputs or overwrites
Task211/212 data. Both modes converge on one normalized descriptor and orchestrator.
Canary-only baseline values are loaded for comparisons after extraction/fitting.

## Synchronization evidence

Production requires a separate JSON evidence document, not an arbitrary video:

```json
{
  "schemaVersion": 1,
  "reviewTargetId": "review_match_009",
  "replaySha256": "64 lowercase hex characters from the intake",
  "videoSha256": "64 lowercase hex characters from the intake",
  "provenance": "human_supplied/independently_observed_timer_anchors",
  "anchors": []
}
```

The empty list is intentionally invalid. Supply at least six `fit` and six
`validation` anchors, with distinct IDs and replay times, both groups distributed
across start/early/mid/late/end. Each anchor includes `anchorId`, `role`, `region`,
`replayElapsedSeconds`, `vodTimeSeconds`, `uncertaintySeconds`, and separate
`evidence.replay`/`evidence.vod` provenance. Retain the observation plan and evidence.
The processor does not manufacture cross-surface observations from candidate counts.

Canaries reuse the accepted raw Task211 timer observations as explicit evidence,
not the accepted intercept/error. The unchanged Task211 model selector fits
offset/affine parameters using only fit anchors; held-out anchors evaluate/select
the model. Accepted model values are compared afterwards. This is independent
refitting from accepted observations, not new human observation of the VOD timers.
Bounds, uncovered replay ranges and operational uncertainty are retained; no
silent extrapolation or statistical-confidence claim.

## Stages and provenance

One orchestration command runs:

1. `INTAKE_RESOLVED`: factual file identities plus human-supplied association.
2. `FACTUAL_PROCESSING_READY`: unchanged forward-only 1 Hz accepted sampler,
   with injected verified input and isolated output directory. Tick metadata,
   references, raw state, counter deltas, structural observations and absent
   positions retain their original epistemic limits.
3. `REPLAY_VOD_SYNC_READY`: evidence-backed mapping and operational uncertainty.
4. `CANDIDATES_READY`: direct imports from Task202; 5 s bins, nearest-rank p75
   nonzero activity, mandatory lifecycle/objective-like, 15 s merge, 12 s
   padding, maximum 90 s. Priority is family count, never probability.
5. `VISUAL_EVIDENCE_READY`: first/representative/last frames for every candidate,
   mapped only by validated synchronization, requested/decoded timestamps and
   hashes recorded. Required frame decoding error must not exceed 100 ms.
6. `REVIEW_BUNDLE_READY`: typed links, uncertainty, provenance and an empty human
   review template. No downstream stage is invoked after a required failure.

All successful stage envelopes validate against
`schemas/continuous-review-processing-stage.schema.json` and carry a hash chain,
source identity, epistemic type and `automaticSemanticPromotion: false`.
Stage-specific validation is also performed in the typed stage functions.
Detailed factual rows retain accepted source fields and provenance; summaries
do not convert life-state changes to deaths or objective-like rows to completion.

## Review and optional communication

The bundle imports the accepted 11 review fields and 15 error classes unchanged.
Human fields start null/empty and unreviewed. Candidate priority is a heuristic;
candidate regions are not gameplay events. Outcome does not establish decision
quality and ASR cannot fill `teamCall` automatically.

Craig is not required. Missing input remains `not_supplied`; supplied tracks are
identity-checked but no new generic Craig timing algorithm or ASR is claimed in
V1. Their timing attachment remains `timing_not_validated`. Historical canaries
explicitly do not exercise the optional accepted Craig/VOD bridge. Semantic
communication interpretation always remains `HUMAN_VALIDATION_REQUIRED`.

## Storage, publication and reruns

All runs are isolated below `.local/deadem/continuous-review/processing/`:

- `registered/<target>/<runId>/` for production;
- `task223-canaries/<target>/<runId>/` for historical validation.

Run identity hashes processor version, target/mode, intake identity, normalized
manifest identity and synchronization evidence. Stage JSON is atomically renamed;
an exclusive target lock prevents concurrent publication of different identities.
An orphaned lock fails closed and is not automatically cleared.
`result.json` and the target's `current.json` are published only after all required
stages pass. Partial runs retain a failure record and cannot be reused as success.
An existing successful identity is integrity-checked and reused, never overwritten.
A different identity conflicts with an existing current pointer; no silent switch
to a different source or synchronization evidence occurs. A new processor with
changed output semantics must change its version.

Dense telemetry and JPEGs stay local. Only compact Task223 summaries, comparisons,
stage contracts and gates belong in `artifacts/continuous-review/task223/`.
No `output/` files or accepted runtime artifacts are modified.

## Limits

The visual V1 representation is three representative frames per candidate, not
the older dense storyboard cadence. It demonstrates complete required coverage,
not full visual coverage of every second or semantic relevance.
The optional communication bridge and Automatic Match Onboarding are absent.
The milestone may reach `PROCESSING_V1_READY`, never `CONTINUOUS_PIPELINE_READY`
from this task. Task224 is not created. Only Work accepts the candidate.
