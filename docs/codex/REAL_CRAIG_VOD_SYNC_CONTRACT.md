# Real Craig to VOD Synchronization — Task 210

## Authority and inputs

Work accepted Task 209 at `6a8fa7433f75f6cd94499e7e32e31f4e81da86d8`.
This separate task authorizes only `review_match_003/video/` and
`review_match_004/video/` under the ignored review-target root, plus the nine
existing normalized Task 208 WAVs. No replay directory or `.dem` is opened.
Original media is read-only. No normalization or ASR is repeated.

## Measurement

The local tool decodes all three audio streams per VOD into temporary mono
8kHz signals, preserving presentation timestamps. The nine normalized 16kHz
WAVs remain unchanged; analysis windows are downsampled in memory. NumPy FFT
implements zero-mean normalized cross-correlation. A 50Hz RMS envelope provides
coarse location over the multi-match recording. Alternative peaks are retained.

Before fitting, twelve distributed regions are frozen at fractions
0, .025, .10, .20, .30, .40, .50, .60, .70, .80, .90, 1 of the usable span.
Even regions are fit; odd regions are validation. Each region searches two
source groups: non-track-06 voices in VOD audio stream 2 and track_06 in stream
3. These streams were identified by coarse signal correlation, not transcript.
Eight-second individual-track templates are searched within ±3 seconds of
coarse alignment. Up to five fixed candidate windows per source are evaluated.
NCC must be at least .25 and exceed the next peak outside ±.15s by .08.
The highest-quality eligible waveform match is retained for each group/region.
Missing or silent regions are explicitly rejected by this frozen signal-quality
rule, never by poor validation residual. No ASR string matching is used.

The two source paths have different audio latency. One recording-clock model
balances them; nine tracks are not proof of nine independently measured paths.
Only measured track references carry direct audio-match evidence. Other tracks
inherit the accepted normalized recording clock, with this limitation retained.

## Fit and independent validation

`vod = slope * craig + intercept`. At least six anchors in each split are
required, distributed over more than 300 seconds. Fit outliers use a robust
fit-only Theil–Sen initializer and a threshold of max(.5s, 4.5 × 1.4826 × MAD).
All validation anchors remain in validation, including large residuals.

Offset-only uses the median fit offset. Affine uses least squares on retained
fit anchors. Affine is selected only when held-out MAE improves by at least
20ms AND 20 percent, without a worse held-out maximum. Otherwise offset-only
wins. The validation set selects between these two frozen models; it does not
change either model's fitted parameters. No iterative threshold tuning.

Residual sign is predicted VOD minus observed VOD. MAE, median, p90 and maximum
are absolute residual statistics. Start/end residuals are signed means of the
first/last validation quartiles. Preferred limits are .150/.250/.500 seconds
for MAE/p90/max and at most .250s regional change. Limited precision allows
.250/.400/.750 and .400s regional change. Worse mappings cannot be registered.
Operational estimated error is max(observed fit max, validation max) + .020s;
this is an operational estimate, not a statistical bound on unseen audio.

## Provenance and clocks

Human speech recollections remain `human_supplied_anchor` hypotheses in local
storage. Measured waveform anchors are `audio_measured_anchor`; visual readings
are `visual_clock_observation`; fitted mappings are `derived_sync_model`.
Only audio-measured Craig-to-VOD pairs enter fitting. VOD timestamps, Craig
timestamps, in-game clocks, countdowns and leaderboard duration are separate.
The observed pause in match 004 explicitly disproves a single wall-clock/game
clock equivalence. Leaderboard values were not independently observed in the
bounded frames. No remembered phrase becomes subframe ground truth.

## Real session registration and playback

Local session configuration lives under the Task 210 evidence directory.
The backend accepts only target-specific opaque source refs for 003 and 004,
validates independent metrics and precision labels, then resolves exactly one
MP4 inside each authorized video directory. The browser cannot supply a path.
Symlinks, traversal, replay directories, `.dem` and protected aliases fail closed.
HTTP Range remains streaming with bounded 64KiB chunks. Media never enters Git.

Real sessions use `syncStatus=validated`, `validationStatus=validated` and
`method=audio_cross_correlation`. Synthetic fixtures retain synthetic labels.
The initial seek must finish before transport controls become available.
Ended source tracks remain visible but paused/outside-track, not padded.

Run `npm.cmd run review:scrim` to select either real session. VOD audio is
independent and muted by default; enabling it can duplicate Discord voices.
The UI separates mapping error from transport drift and discloses limited
precision when applicable. Browser canary covers start/middle/end, mixing,
play/pause, seeking, 1x/1.5x and actual decoded frames/audio. Synthetic regression
retains ten seeks, 0.5x/1x/1.5x, injected drift recovery and responsive layouts.
Automated playback and visual inspection are not a human listening verdict.

## Artifacts and regeneration

`measure-real-craig-sync.py` stages: `extract`, `coarse`, `anchors`, `frames`.
`prepare-real-sync.mjs` fits once and writes compact summaries/local sessions.
`real-sync-browser-canary.mjs` measures real playback with a supplied Playwright
module path. `scrim-browser-canary.mjs` retains the synthetic regression.
`npm.cmd run emit:real-craig-vod-sync-readiness` verifies fingerprints and emits
compact validation, privacy and gate claims. Reusing it does not rerun audio.
Never run the Task 209 emitter to overwrite its accepted versioned artifacts.

Only pseudonymous numeric anchors, metrics, code, tests and reports are
versioned. Audio, VODs, waveforms, speech hypotheses, source names, screenshots
and session configuration remain local. Final status is VALIDATING; acceptance
belongs to ChatGPT Work. No Task 211, ASR benchmark or semantic promotion.
