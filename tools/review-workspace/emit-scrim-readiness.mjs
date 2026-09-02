import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_REPO_ROOT } from './data-model.mjs';
import { DEFAULT_SYNC_POLICY } from './scrim-model.mjs';

const canary = JSON.parse(await readFile(path.join(DEFAULT_REPO_ROOT, '.local/deadem/review-workspace/scrim/canary/playback-canary.json'), 'utf8'));
assert.equal(canary.passed, true);
assert.equal(canary.readyTrackCount, 9);
assert.equal(canary.distributedSeekCount, 10);
assert.equal(canary.realVodMappingValidated, false);
assert.ok(Object.keys(canary.sourceFingerprints ?? {}).length >= 8, 'missing_canary_source_fingerprints');
for (const [relative, expected] of Object.entries(canary.sourceFingerprints)) {
    assert.ok(relative.startsWith('tools/review-workspace/') && !relative.includes('..'));
    const actual = createHash('sha256').update(await readFile(path.join(DEFAULT_REPO_ROOT, relative))).digest('hex');
    assert.equal(actual, expected, `stale_browser_canary:${relative}`);
}
const roundNumbers = value => typeof value === 'number' ? Number(value.toFixed(3))
    : Array.isArray(value) ? value.map(roundNumbers) : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, roundNumbers(child)])) : value;
const gate = 'craig_multitrack_synchronized_review_player_ready_for_real_sync_canary';
const summary = {
    schemaVersion: 1, taskId: '209', module: 'Multitrack Call Evidence',
    technicalGateClaim: gate, readiness: 'READY_FOR_REAL_VOD_SYNC_CANARY',
    craigRecordingCount: 1, normalizedTrackCount: 9, syntheticVodSessionCount: 1, realVodSessionCount: 0,
    mapping: { slope: 1.002, interceptSeconds: 2, provenance: 'synthetic_fixture_not_real_alignment' },
    engine: 'HTMLMediaElement_per_track_MediaElementAudioSourceNode_GainNode_AudioContext',
    streaming: 'HTTP_Range_64KiB_read_streams_no_full_audio_buffer',
    playbackMetrics: { startupLatencyMs: canary.startupLatencyMs, initialLoadLatencyMs: canary.initialLoadLatencyMs,
        seekResyncLatencyMs: { min: Math.min(...canary.seekResyncLatencyMs), max: Math.max(...canary.seekResyncLatencyMs),
            mean: canary.seekResyncLatencyMs.reduce((sum, value) => sum + value, 0) / canary.seekResyncLatencyMs.length },
        maxObservedDriftMs: canary.maxObservedDriftMs, driftCorrectionCount: canary.driftCorrectionCount,
        hardSeekCorrectionCount: canary.hardSeekCorrectionCount, injectedDriftRecovery: canary.injectedDriftTest.recovery },
    operationalSyncPolicy: DEFAULT_SYNC_POLICY,
    acceptedTask208: { status: 'ACCEPTED_WITH_BLOCKER', sourceAttributionAccepted: true,
        semanticBlocker: 'craig_multitrack_asr_semantic_accuracy_insufficient_for_automatic_call_evidence',
        humanIntelligibleUsablePercent: { small: 23.08, medium: 53.85, 'large-v3': 38.46 },
        mediumMateriallyWrongPercent: 46.15, bestMeasuredDraft: 'medium', asrStatus: 'HUMAN_VALIDATION_REQUIRED' },
    privacy: { versionedRealIdentityCount: 0, versionedTranscriptCount: 0, versionedMediaCount: 0 },
    replayAccessCount: 0, protectedAccessCount: 0, realVodAccessCount: 0, asrExecutionCount: 0,
    limitations: ['No real VOD is authorized/mapped to this recording.', 'Synthetic transport metrics do not establish real sync accuracy.', 'No candidate semantics or automatic strategic interpretation.']
};
const outputs = {
    'summary.json': summary,
    'playback-canary.json': canary,
    'gate.json': { schemaVersion: 1, taskId: '209', technicalGateStatus: gate,
        readiness: 'READY_FOR_REAL_VOD_SYNC_CANARY', realVodMappingValidated: false,
        finalStatus: 'VALIDATING', finalAcceptance: 'pending_independent_work_validation' }
};
const root = path.join(DEFAULT_REPO_ROOT, 'output/local-replay-processing/craig-multitrack/task209-playback');
await mkdir(root, { recursive: true });
for (const [name, value] of Object.entries(outputs)) {
    const serialized = `${JSON.stringify(roundNumbers(value), null, 2)}\n`;
    assert.doesNotMatch(serialized, /[A-Z]:[\\/]|sourceSpeakerId|sourceDisplayName|candidateTranscript/u);
    await writeFile(path.join(root, name), serialized);
}
console.log(JSON.stringify({ gate, trackCount: 9, realVodMappingValidated: false, privacy: summary.privacy }));
