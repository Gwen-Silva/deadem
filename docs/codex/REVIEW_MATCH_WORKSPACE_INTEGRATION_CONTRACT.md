# Task 212: additive assisted review integration

Base: `03de4f108d125237428faab417b8e68530d2824c` (externally accepted Task211).
Work alone accepts. Task212 remains VALIDATING until independent review.

## Inputs and safety

Only accepted Task211 compact artifacts and five local telemetry families for
003/004 feed generation. Compact artifacts are compared with accepted Git blobs;
local telemetry uses exact allowlisted paths and Task211 byte/hash identities.
No replay is opened. Protected 005–008 aliases reject before filesystem access.
No ASR, human selection, identity inference or gameplay interpretation.

## Candidate and visual contract

Task202 functions are reused with an explicit new-target validator; legacy
defaults remain 001/002. Five-second bins, nonzero p75 activity thresholds,
mandatory lifecycle/objective-like seeds, merge gap <=15s, padding12s, maximum90s,
and high>=3/medium2/low1 family tiers are unchanged. Priority is scheduling,
never probability. `review_candidate_selectivity_low` remains inherited.
Unmapped seeds are retained locally as ignored-for-review-generation.
Candidates are clamped to accepted Task211 replay coverage, never extrapolated.

Task211 estimatedOperationalReplayVodErrorSeconds expands visual bounds, clipped
to mapped VOD coverage. Validation MAE is not used as operational precision.
Task203 cadence high1s/medium2s/low5s uses zero density adjustments. Requests are
deduplicated per target. SHA/size of the fixed-slot VOD are verified before
video-only PyAV extraction. Images and 25-frame navigable storyboards stay local.
Every usable candidate has first, representative and last frame references.

## Providers and review state

Legacy Task203/204 normalization and all 102 candidate fingerprints remain
unchanged. Task212 is a separate optional provider with fixed local indexes;
it adds 003/004 without Task204 dependencies for those targets. Global legacy
sourceFingerprint is preserved. New candidates are deeply immutable and contain
empty humanSuppliedContext and analystInference arrays.

New candidates have scrimContextEvidence, not fabricated audioCallEvidence.
It carries VOD bounds, suggested open time, pre-roll and separate replay/VOD,
Craig/VOD and composed operational errors. This is listening context, not a
transcript or confirmed call. Browser transport drift is separate.
All four targets support existing review states, structured fields, error
classes, human segments and local JSON/Markdown export. Transcript correction
exists only for actual legacy ASR draft calls. Human context is never invented.

## Scrim navigation

`/scrim?reviewTargetId=review_match_003&vodTimeSeconds=1388.359&preRollSeconds=10`

Only 003/004, finite nonnegative times and pre-roll0–120s are accepted. Unknown
parameters, duplicate parameters and filesystem paths reject. Server and browser
use the same pure validation. A unique internally registered real session is
required. Requested time outside its VOD range explicitly rejects; pre-roll alone
may clamp to the session start. Existing mixer/synchronization code is untouched.
Nine rows remain registered; tracks outside their real duration remain inactive.

## Reproduction and evidence

Run `node tools/review-integration/candidates.mjs`, then
`node tools/review-integration/dense.mjs`. The latter verifies VOD identity and
extracts only video. `--reuse-frames` is for unchanged already-extracted local
evidence. Run browser-canary.mjs with an installed Playwright module path, then
readiness.mjs. Technical canary state/exports are isolated under `.local/codex/212`,
never mixed into existing human state. Six compact outputs contain metrics and
references only. No media or human exports are committed.
