# Synchronized Craig Review Playback

The local workspace exposes **Player da scrim** at `/scrim`; start it with
`npm.cmd run review:scrim` (scrim-only) or `npm.cmd run review:workspace`.
Task 209 never loads replay files, ASR, transcript content or original VODs.

## Source and session boundary

One `craigRecordingId` owns nine independent source tracks and zero or more
`vodSessions`. Each session carries `vodSessionId`, `sourceVodRef`, optional
`reviewTargetId`, `craigRange`, `vodRange`, `syncModel`,
`syncEstimatedErrorSeconds` and `syncStatus`. A recording is not a match.

The reusable model is `vod = slope * craig + interceptSeconds`;
inverse time is `(vod - interceptSeconds) / slope`, and slave rate is
`vod.playbackRate / slope`. Positive finite slope, finite intercept, ordered
ranges and consistent endpoints are required. Methods are `manual_anchors`,
`audio_cross_correlation`, `hybrid_fit` or `synthetic_fixture`. Production
methods require `validationStatus=validated`; a synthetic model requires
`synthetic_validated` and must be labeled `synthetic_only` throughout the UI.
This contract validates structure, not the empirical truth of real anchors.

Task 209 registers only the nine existing normalized Task 208 WAVs and one
explicitly synthetic local video. Its illustrative model has slope 1.002 and
intercept 2 seconds; its zero error is a fixture property, never a real Craig
↔ VOD measurement. No original VOD is authorized/mapped for this recording.
Readiness remains `READY_FOR_REAL_VOD_SYNC_CANARY`.

## Transport and mixing

The VOD is master. Play, pause, native seeking/seeked, ratechange, ended and
buffering events coordinate slave media elements. A readiness barrier pauses
all elements for seeks/buffering and resumes only when active tracks are ready.
Obsolete async operations cannot resume a paused/newer transport. Out-of-range
tracks remain paused rather than being clamped/repeated as if evidence existed.

Each track streams through HTMLAudioElement → MediaElementAudioSourceNode →
GainNode → AudioContext. No `AudioBuffer` or full-file PCM preload is used.
The default operational monitor interval is 100 ms; drift ≤80 ms is left alone,
80–300 ms uses signed rate adjustment bounded to ±4%, and ≥300 ms invokes a
coordinated hard resync. These configurable engineering thresholds are not a
methodological claim about perceptual or empirical alignment quality.

Mute overrides solo. With no solo, all unmuted tracks are audible; with one or
more solos, only unmuted solo tracks are audible. Per-track volume, mute all,
unmute all, clear solo and reset are independent of the VOD audio row. VOD audio
starts muted to avoid accidental double Discord audio; it may contain mixed
Discord, not just game sound. Reset restores all track volumes to 1, clears
mute/solo and restores VOD muted/volume 1.

Isolated-call mode saves the full prior mix, solos a track over a bounded Craig
range and restores the previous mix on explicit exit or range end. It does not
interpret the selected audio as a correct call.

`window.openScrimPlayer({reviewTargetId, vodTimeSeconds, preRollSeconds})`
selects only a registered session matching the review target. Unknown targets
fail explicitly; default pre-roll is configurable (10 s). No candidate linkage
is fabricated for the synthetic session, which has a null reviewTargetId.

## Local privacy and media safety

The backend owns the exact allowlist. The browser receives random opaque media
IDs and local display names, never paths or Discord IDs. The media route accepts
GET/HEAD only, no arbitrary file path/query import. Traversal, protected aliases,
`.dem`, unregistered files and symlinks are rejected. HTTP Range serving uses
`createReadStream`, 64 KiB chunks, and closes streams when clients disconnect.

Private sessions live under `.local/deadem/review-workspace/scrim/`; real names,
screenshots and all media remain local. Compact canary outputs include only
aggregate performance, pseudonymous IDs and explicit synthetic provenance.

## Verification and limits

Unit and HTTP tests cover clock mapping, nine-track readiness, transport,
mixing/restoration, drift, Range and allowlists. The browser canary runs nine
real normalized WAVs against the synthetic master: continuous playback,
pause/resume, ten distributed seeks, 0.5×/1×/1.5×, mute/solo/multi-solo/volume,
VOD mixing, reset, injected drift recovery and wide/half/narrow layouts.
Performance includes startup and seek resync latency, maximum observed drift
and correction counts; deliberately injected drift is reported separately.

Craig/source attribution remains accepted. `medium` is the best measured ASR
draft, not semantic truth. The inherited blocker is
`craig_multitrack_asr_semantic_accuracy_insufficient_for_automatic_call_evidence`.
All ASR remains `HUMAN_VALIDATION_REQUIRED`; no benchmark or automatic strategic
interpretation is part of this task. Work alone accepts the Task 209 candidate.
