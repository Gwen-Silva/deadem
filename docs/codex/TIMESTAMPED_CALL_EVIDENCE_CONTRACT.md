# Timestamped Call Evidence Contract

Task 205 adds local speech evidence to the accepted two-match review workflow. Speech transcription is observed audio evidence, not a confirmed team call, speaker intent, coordination judgment or strategic conclusion.

## Adapters

`AudioCallSourceAdapter` defines a common normalization boundary. `MixedVodAudioAdapter` consumes one OBS mixed-audio track and always emits `speaker.status = unknown/mixed`. `CraigMultitrackAdapter` accepts synchronized local tracks and source-provided speaker metadata; it does not download Craig archives, operate a Discord bot or infer identity.

Mixed-VOD provenance is `audio_observed_speech/mixed_vod_asr`. Craig provenance is `audio_observed_speech/craig_multitrack_asr`.

## Time axes

For mixed VOD, audio time equals VOD time. Task 200 is consumed without recalibration to derive approximate replay time. The inherited synchronization error is 9 seconds for `review_match_001` and 2 seconds for `review_match_002`. ASR segment-boundary uncertainty is represented separately and has no fabricated numeric bound.

## Candidate linkage

Every immutable Task 204 window receives an overlay row. `audioCallEvidenceRefs` contains segments intersecting its visual VOD range; `replayRangeCallEvidenceRefs` contains segments whose valid approximate replay range intersects the candidate replay range. Candidate membership, priority, source families, visual evidence and existing bundle media are never changed.

## Privacy and storage

WAV audio, full transcripts, segment text, word text and real speaker metadata remain below `.local/deadem/call-evidence/`. Git receives only hashes, counts, durations, configuration, coverage, candidate call counts, provenance and limitations. Synthetic Craig fixture identities and text are explicitly non-real.

Forbidden semantic promotions include `team_call_confirmed`, `player_intent_confirmed`, `correct_call` and `bad_call`. `analystInference` remains empty.

## Quality gate

Task 205 does not claim perfect WER. A deterministic 16-segment human-validation queue is prepared locally. If the execution surface cannot hear audio, classifications and usable rate stay null rather than being fabricated; the truthful gate is `two_match_audio_call_evidence_ready_with_asr_gaps` until an audio-capable human review completes the sample.
