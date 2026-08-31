# Task 205 — Build Timestamped Call Evidence Pipeline

Status: completed

Base: `225f570a68c3d53ecfa17986e674fe21be7d2dc6`

Technical gate claim: `two_match_audio_call_evidence_ready_with_asr_gaps`

## Result

Both authorized Task 198 mixed-audio VODs were processed locally with faster-whisper 1.2.1, multilingual model `small`, CPU/int8, Portuguese hint, VAD and word timestamps. Task 200 covered regions were preserved exactly: 4,562 seconds for `review_match_001` and 2,090 seconds for `review_match_002`.

- `review_match_001`: 1,338 segments, 8,158 word timestamps, 1,557 candidate links and 67/67 windows with speech evidence.
- `review_match_002`: 538 segments, 3,585 word timestamps, 636 candidate links and 35/35 windows with speech evidence.
- Aggregate: 1,876 segments, 11,743 words, 2,193 links and 102/102 windows with `audioCallEvidenceRefs`.

The mixed speaker remains `unknown/mixed`. Approximate replay time consumes Task 200 without recalibration and retains 9/2-second synchronization uncertainty separately from unbounded ASR segment-boundary uncertainty. Candidate membership, priority, source families and visual evidence were not changed.

The Craig adapter contract was validated with a synthetic two-track fixture containing two distinct source speakers, overlapping speech and deterministic global ordering. No Craig integration, bot, download or real identity was used.

## Quality and privacy

Sixteen distributed local sample rows were prepared for audio/transcript comparison. This execution surface cannot perceive audio, so classifications and usable rate remain null rather than fabricated. The gap gate remains explicit as `manual_audio_transcript_validation_pending`.

Audio, complete transcripts, segment/word text and model cache remain local. Versioned audio, complete transcripts, real speaker identity, analyst inference, gameplay interpretation, replay access and protected access are all zero. Eight compact outputs were byte-identical across two emissions.

Final acceptance remains pending independent ChatGPT Work validation. No Task 206 was created. After acceptance, resume the real review at `review_match_001_window_0013`, `0015` and `0016` with local audio evidence.
