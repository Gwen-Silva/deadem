import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DEFAULT_REPO_ROOT } from './data-model.mjs';
import { analyzeSyncAnchors } from './real-sync-model.mjs';

const local = path.join(DEFAULT_REPO_ROOT, '.local/deadem/review-workspace/scrim/real-sync-task210');
const compact = path.join(DEFAULT_REPO_ROOT, 'output/local-replay-processing/craig-multitrack/task210-real-sync');
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const digest = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const write = async (name, value) => writeFile(path.join(compact, name), JSON.stringify(value, null, 2) + '\n');
const canary = await read(path.join(local, 'browser-canary.json'));
const synthetic = await read(path.join(DEFAULT_REPO_ROOT, '.local/deadem/review-workspace/scrim/canary/playback-canary.json'));
const visual = await read(path.join(local, 'browser-visual-review.json'));
assert.equal(canary.passed, true);
assert.equal(synthetic.passed, true);
for (const evidence of [canary, synthetic]) for (const [file, hash] of Object.entries(evidence.sourceFingerprints)) {
    assert.equal(await digest(path.join(DEFAULT_REPO_ROOT, file)), hash, `stale_browser_evidence:${file}`);
}
assert.equal(await digest(path.join(local, 'sessions.json')), canary.sessionFingerprint);
assert.equal(visual.regionsInspected.length, 6);
const summaries = [];
for (const target of ['003', '004']) {
    const summary = await read(path.join(compact, `match-${target}-sync-summary.json`));
    const measured = await read(path.join(local, `review_match_${target}-measured-anchors.json`));
    const recomputed = analyzeSyncAnchors(measured.anchors);
    assert.equal(summary.slope, recomputed.slope);
    assert.equal(summary.interceptSeconds, recomputed.interceptSeconds);
    assert.deepEqual(summary.validationResidual, recomputed.validationResidual);
    assert.deepEqual(summary.anchors, measured.anchors);
    summary.browserCanary = canary.results.find(row => row.reviewTargetId === summary.reviewTargetId);
    assert.equal(summary.browserCanary?.passed, true);
    await write(`match-${target}-sync-summary.json`, summary);
    summaries.push(summary);
}
const valid = summaries.filter(row => row.precisionStatus !== 'alignment_precision_insufficient');
const gate = valid.length === 2 ? (valid.every(row => row.precisionStatus === 'preferred_precision')
    ? 'two_real_craig_vod_sessions_synchronized_and_player_ready' : 'real_craig_vod_sync_ready_with_limited_precision')
    : valid.length === 1 ? 'real_craig_vod_sync_partial_with_declared_gap' : 'BLOCKED_BY_REAL_CRAIG_VOD_ALIGNMENT_UNRESOLVED';
await write('validation-summary.json', { schemaVersion: 1, taskId: '210', validatedSessionCount: valid.length,
    realBrowserCanary: { passed: canary.passed, browserVersion: canary.browserVersion, results: canary.results,
        sourceFingerprints: canary.sourceFingerprints, sessionFingerprint: canary.sessionFingerprint, browserErrors: canary.browserErrors },
    syntheticRegression: { passed: synthetic.passed, readyTrackCount: synthetic.readyTrackCount,
        distributedSeekCount: synthetic.distributedSeekCount, testedPlaybackRates: synthetic.testedPlaybackRates,
        maxObservedDriftMs: synthetic.maxObservedDriftMs, injectedDriftRecovery: synthetic.injectedDriftTest.recovery,
        responsive: synthetic.responsive },
    boundedVisualReview: { inspectedRegions: 6, realVideoRendered: visual.realVideoRendered,
        mappingAndTransportSeparated: visual.mappingErrorAndTransportDriftLabeledSeparately },
    humanListeningJudgment: 'not_performed', perceptualPerfectionClaim: false,
    asrExecutionCount: 0, originalMediaMutationCount: 0, replayAccessCount: 0,
    protectedReplayAccessCount: 0, finalFactCount: 0, automaticAttributionCount: 0,
    allMetricsAreTechnicalClaimsPendingWork: true });
await write('gate.json', { schemaVersion: 1, taskId: '210', technicalGateStatus: gate, status: 'VALIDATING',
    acceptanceAuthority: 'ChatGPT Work', acceptedByCodex: false, validatedSessionCount: valid.length,
    inheritedBlocker: 'craig_multitrack_asr_semantic_accuracy_insufficient_for_automatic_call_evidence',
    remainingGaps: ['No independent human listening verdict.', 'Exact countdown values and leaderboard durations not independently observed.',
        'Per-source path latency is included in mapping error, not corrected per speaker.', 'Not all nine source tracks appear in VOD audio.'],
    nextAction: 'Independent ChatGPT Work validation of this candidate; no Task 211.' });
const metadata = await read(path.join(DEFAULT_REPO_ROOT, '.local/deadem/craig/recordings/craig_recording_task208_real_01/validation/recording-private-metadata.json'));
const forbiddenNames = metadata.tracks.map(row => row.sourceDisplayName).filter(Boolean);
const filenames = (await readdir(compact)).filter(name => name.endsWith('.json') && name !== 'privacy-audit.json');
for (const file of filenames) {
    const text = await readFile(path.join(compact, file), 'utf8');
    assert.doesNotMatch(text, /[A-Za-z]:[\\/]|file:\/\/|data:audio|data:video/u, 'private_absolute_path_or_media');
    for (const name of forbiddenNames) assert.equal(text.includes(name), false, 'private_source_name');
    const parsed = JSON.parse(text);
    const inspect = value => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            assert.ok(!['transcript', 'candidateTranscript', 'humanReferenceText', 'sourceAudioPath', 'sourceDisplayName', 'locator'].includes(key), 'private_text_field');
            inspect(child);
        }
    };
    inspect(parsed);
}
await write('privacy-audit.json', { schemaVersion: 1, taskId: '210', passed: true,
    inspectedCompactArtifactCount: filenames.length, realNamesFound: 0, transcriptFieldsFound: 0,
    absolutePathsFound: 0, embeddedMediaFound: 0, versionedMediaCount: 0,
    localOnlyClasses: ['VOD', 'Craig WAV', 'extracted audio', 'waveforms', 'human speech hypotheses', 'screenshots', 'session configuration'],
    inputPolicy: 'Only the two authorized video directories and nine normalized tracks; no replay directories or .dem opened.',
    auditScope: 'Compact output contents and fixed input allowlists; not an operating-system access trace.' });
console.log(JSON.stringify({ technicalGateStatus: gate, validatedSessionCount: valid.length, privacyAudit: 'passed' }, null, 2));
