import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    AudioCallSourceAdapter,
    CraigMultitrackAdapter,
    MixedVodAudioAdapter,
    assertAudioReviewTarget,
    candidateImmutableFingerprint,
    deterministicJson,
    linkSegmentsToCandidates,
    representAsrFailure
} from '../tools/audio-call-source-adapters.mjs';

const sync = { estimatedErrorSeconds: 9, segments: [{ videoStartSeconds: 100, videoEndSeconds: 200, interceptSeconds: 100, slope: 1 }] };
const raw = [{ startSeconds: 1, endSeconds: 3, text: 'fala sintética', language: 'pt', engine: 'faster-whisper', model: 'small', device: 'cpu', computeType: 'int8', vadApplied: true, words: [{ startSeconds: 1, endSeconds: 1.5, word: 'fala', probability: 0.9 }] }];

test('common adapter is abstract', () => assert.throws(() => new AudioCallSourceAdapter('x'), /abstract/u));
test('mixed VOD adapter retains unknown mixed speaker and VAD/word representation', () => {
    const [segment] = new MixedVodAudioAdapter({ reviewTargetId: 'review_match_001', videoOffsetSeconds: 100, syncModel: sync }).normalize(raw);
    assert.equal(segment.speaker.status, 'unknown/mixed');
    assert.equal(segment.speaker.sourceSpeakerId, null);
    assert.equal(segment.transcriptionMetadata.vadApplied, true);
    assert.equal(segment.words.length, 1);
});
test('Task200 inverse mapping and sync error propagation remain separate from ASR uncertainty', () => {
    const [segment] = new MixedVodAudioAdapter({ reviewTargetId: 'review_match_001', videoOffsetSeconds: 100, syncModel: sync }).normalize(raw);
    assert.equal(segment.videoStartSeconds, 101);
    assert.equal(segment.replayApproxStartSeconds, 1);
    assert.equal(segment.syncEstimatedErrorSeconds, 9);
    assert.equal(segment.asrTimestampUncertainty.separateFromReplayVideoSync, true);
});
test('candidate overlap linkage uses visual and replay ranges without mutation', () => {
    const windows = [{ candidateWindowId: 'w1', reviewTargetId: 'review_match_001', replayObservedFacts: { replayElapsedRangeSeconds: { start: 0, end: 10 } }, derivedMetrics: { priorityTier: 'high', sourceFamilies: ['damage'] }, videoEvidence: { visualVodRangeSeconds: { start: 100, end: 110 } } }];
    const before = candidateImmutableFingerprint(windows);
    const segments = new MixedVodAudioAdapter({ reviewTargetId: 'review_match_001', videoOffsetSeconds: 100, syncModel: sync }).normalize(raw);
    const links = linkSegmentsToCandidates(windows, segments);
    assert.equal(links[0].callSegmentCount, 1);
    assert.equal(links[0].replayRangeCallEvidenceRefs.length, 1);
    assert.equal(candidateImmutableFingerprint(windows), before);
});
test('Craig fixture preserves isolated speakers, global order and overlap', async () => {
    const fixture = JSON.parse(await readFile('tests/fixtures/audio-call-evidence/craig-multitrack.json', 'utf8'));
    const segments = new CraigMultitrackAdapter(fixture).normalize();
    assert.deepEqual([...new Set(segments.map(segment => segment.speaker.sourceSpeakerId))].sort(), ['fixture_alpha', 'fixture_beta']);
    assert.deepEqual(segments.map(segment => segment.recordingStartSeconds), [1, 2.2, 4, 5]);
    assert.ok(segments[0].recordingEndSeconds > segments[1].recordingStartSeconds);
});
test('protected aliases fail before filesystem access', () => {
    for (const value of ['replay_005', 'partida_006', 'review_match_008']) assert.throws(() => assertAudioReviewTarget(value), /protected/u);
});
test('ASR failure is represented without transcript or interpretation', () => {
    const failure = representAsrFailure({ reviewTargetId: 'review_match_001', stage: 'transcription', message: 'synthetic' });
    assert.equal(failure.status, 'failed');
    assert.equal(failure.transcriptTextVersioned, false);
    assert.equal(failure.semanticInterpretationProduced, false);
});
test('normalized serialization is deterministic', () => assert.equal(deterministicJson({ b: 1, a: 2 }), deterministicJson({ a: 2, b: 1 })));
test('real compact output preserves 102 candidates and zero privacy/semantic counters', async () => {
    const summary = JSON.parse(await readFile('output/local-replay-processing/audio-call-evidence/task205-bounded2/summary.json', 'utf8'));
    assert.equal(summary.aggregate.candidateWindows, 102);
    for (const key of ['replayAccessCount', 'protectedAccessCount', 'rawAudioVersionedCount', 'fullTranscriptVersionedCount', 'realSpeakerIdentityVersionedCount', 'analystInferenceCount', 'gameplayInterpretationCount']) assert.equal(summary.aggregate[key], 0);
});
test('real candidate linkage retains all candidate IDs and declared sync uncertainty', async () => {
    const candidates = JSON.parse(await readFile('output/local-replay-processing/audio-call-evidence/task205-bounded2/candidate-call-summary.json', 'utf8'));
    assert.equal(new Set(candidates.rows.map(row => row.candidateWindowId)).size, 102);
    const coverage = JSON.parse(await readFile('output/local-replay-processing/audio-call-evidence/task205-bounded2/coverage.json', 'utf8'));
    assert.deepEqual(coverage.targets.map(target => target.syncEstimatedErrorSeconds), [9, 2]);
});
test('real gate declares pending manual audio comparison rather than fabricating usable rate', async () => {
    const gate = JSON.parse(await readFile('output/local-replay-processing/audio-call-evidence/task205-bounded2/gate.json', 'utf8'));
    assert.equal(gate.technicalGateStatus, 'two_match_audio_call_evidence_ready_with_asr_gaps');
    assert.ok(gate.blockers.includes('manual_audio_transcript_validation_pending'));
});
