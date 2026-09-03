# Task 211 — factual replay onboarding and bounded unified time

Authorized targets are exactly `review_match_003` and `review_match_004`.
Association is by the explicitly supplied target folder, never by filename.
Resolve one regular `.dem` and one regular `.mp4` non-recursively in each fixed
slot; reject target aliases before filesystem calls and reject redirected paths.
Validate streaming SHA-256, PBDEMS2 magic and the in-file summary pointer; decode
the VOD container duration. Headers do not establish build, date, identity or result.

## Factual telemetry

The Task 199 sampler is exposed with an optional closed target validator and
read-only observation hook. Default 001/002 allowlist, sampling and output behavior
are unchanged. Its snapshot/derivation helpers are exported for synthetic tests.
Use `deadem.Player`, forward-only, 1Hz replay elapsed. Objective-like rows retain
the accepted 5-second cadence. No parser, engine or UI package is modified.

Controller/pawn/team/hero values are replay-local references, not confirmed people.
Life-state, health, deaths-named source counters and raw structure states are
observations, not final facts. Counter deltas are positive aggregates with no
attacker/victim attribution. Available raw vector positions retain coordinates,
displacement and approximate speed without named regions. Both real inputs have
no positions through the accepted field set; this is a declared availability gap,
not proof that positions do not exist elsewhere in the replay.

Large JSON/JSONL stays under the two authorized local telemetry directories.
Only compact counts, availability, coverage and artifact identities enter Git.
`analystInference` is empty; human context never enters factual replay sampling.

## Independent temporal evidence

`anchor-plan.json` fixes even-index fit / odd-index validation before fitting:
six of each per target, distributed start/early/mid/late/end. One unreadable
003 validation timer at VOD 2100s was replaced with 2150s before any fit; its
original frame and reason remain available. No numeric residual caused removal.

Visual timers are independent cross-surface synchronization cues, NOT factual
game-clock labels for replay elapsed. The raw replay timing fields use a different
origin from the parser tick. `calibrateRawOrigin` intersects 1Hz intervals of
observed state/pause transitions against their raw timestamps, with no VOD input.
Only the observed stable raw state value 7 and non-paused intervals produce timer
coordinates. The derived cue coordinate is:

`displayed_timer + 0.5 + raw_game_start + completed_paused_ticks / tick_rate - calibrated_raw_origin`.

The 0.5 is a one-second display-bin midpoint, not a new factual timestamp.
Ambiguous coordinates and inconsistent origin intervals fail closed. A supplemental
forward-only temporal-field pass was necessary because the accepted Task 199
family sampler did not retain completed-paused-tick or raw transition-time fields.
It did not regenerate or overwrite the already emitted factual families.

Rounded two-team HUD counters are unordered coarse sanity checks, not identities,
fit inputs or semantic ground truth. Seven additional multi-second VOD brackets
corroborate 004 pause transitions after fitting; no parameter is adjusted from them.
Pauses are retained on both elapsed axes. No unmatched discontinuity was observed.

## Models and coverage

Fit offset-only and affine using fit anchors only. Prefer offset unless affine
improves validation MAE by at least 0.1s AND 20%, without worsening validation max.
Segmented models require independent discontinuity evidence, separately populated
fit/validation per segment and the same material validation gain. They are not
used for the real Task 211 mappings.

Preferred validation MAE/p90/max: 0.5/1/2 seconds. Usable-limited: 1/2/3 seconds.
Worse precision returns no mapped time. Coverage is strictly between the extreme
observed anchors, not the whole replay. Early and late regions remain explicitly
uncovered. Endpoints are inclusive; every exterior/gap rejects extrapolation.

Small residuals of integer visual timers DO NOT demonstrate sub-second empirical
accuracy. Operational error is maximum observed fit/validation residual plus
0.5s display quantization, 0.5s UI refresh allowance, and calibrated-origin halfwidth.
It is a conservative operational estimate, not a statistical confidence bound.

## Task 210 and composition

Read only the five authorized compact Task 210 artifacts. Compare their bytes
against exact accepted Git commit `aeb68e3ea6b9c5cc74b0f78171796728541b0b8b`;
record hashes and validate target, success gate, separated validation, model,
positive slope, error and algebraically consistent Craig/VOD coverage.
The new intake VOD duration must agree. No Craig refit, private audio read,
playback change or transport-drift tuning occurs.

```js
mapReplayToReviewContext(timeline, { reviewTargetId, replayElapsedSeconds })
// { replayElapsedSeconds,
//   vod: { mapped, seconds, operationalErrorSeconds },
//   craig: { mapped, recordingSeconds, operationalErrorSeconds },
//   semantics: { replay: 'replay_elapsed_time',
//                vod: 'vod_media_time', craig: 'craig_recording_time' } }
```

Use `vod = replayModel(replay)` and
`craig = (vod - craigVodIntercept) / craigVodSlope` from the loaded bridge.
The general contract supports slopes other than one. Craig bounds are also
checked. Outside replay coverage both mappings return false with
`reason: outside_covered_region`; outside only the Craig bridge, VOD may stay mapped.

Keep errors separate, expressed in VOD seconds. Composed Craig-clock error is
`(replayVodError + craigVodError) / abs(craigVodSlope)`, labeled
`conservative_operational_sum_not_statistical_confidence_bound`.
Browser transport drift is not included. No source-track identities are duplicated.

## Operation and boundaries

`intake-telemetry.mjs` explicitly processes the two authorized real inputs.
`sample-timing.mjs` explicitly reads their supplemental raw temporal states.
`media.py` extracts at most 80 requested visual timing frames per invocation;
all frames/crops stay local. It never opens audio or replay inputs.
`emit.mjs` consumes existing local observations and regenerates only the eight
compact Task 211 outputs and Task 211 local anchor descriptions, without parsing
or ASR. Tests consume synthetic fixtures and compact accepted artifacts only.

The reusable contract is delivered without workspace candidate integration,
candidate generation/ranking, dense visual evidence, review bundles, ASR,
gameplay interpretation or attribution. Protected replay 005–008 is never used.
Task 210 playback is externally accepted and human-validated operationally;
Task 208 automatic semantic-ASR blocker remains. Task 211 ends VALIDATING, with
independent ChatGPT Work acceptance pending. No Task 212 is authorized or created.
