# Real Craig Multitrack Call Evidence Contract

Task 208 consumes one explicitly authorized local Craig export. The raw data
file contributes only its bounded leading JSON object; its trailing Ogg/Opus
payload is neither parsed nor decoded. Exported AAC tracks are mapped to Craig
metadata strictly by ordinal and normalized locally to PCM 16 kHz mono without
removing timeline silence.

Each track attribution has status `track_attributed`. This means the identity
came from Craig source-track metadata. It does not mean biometric identity,
real-world identity or speaker intent was verified. Participants present in
the recording are not automatically members of the same team.

Energy/RMS regions are temporal locators, not speech facts or calls. Regions
from different tracks remain independent when they overlap; the pipeline does
not merge speakers and performs no diarization. Only 18 deterministic,
temporally distributed clips receive the Task 205-comparable Faster Whisper
small/CPU/int8 configuration. Full-recording transcription is outside scope.

AAC, WAV, raw metadata, Discord identifiers, usernames, display names,
transcript text, word text, clips and absolute paths remain under `.local`.
Versioned outputs use only `track_01` through `track_09` plus compact aggregate
measurements. No replay, VOD or candidate time axis exists in this task.

Human semantic classification remains authoritative. Until the 18 samples are
classified, ASR quality is `pending` and the gate only establishes readiness
for human validation.
