import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_REPO_ROOT } from './data-model.mjs';
import { analyzeSyncAnchors, validateClockObservation } from './real-sync-model.mjs';
import { validateRealSession, vodToCraig } from './scrim-model.mjs';

const local = path.join(DEFAULT_REPO_ROOT, '.local/deadem/review-workspace/scrim/real-sync-task210');
const compact = path.join(DEFAULT_REPO_ROOT, 'output/local-replay-processing/craig-multitrack/task210-real-sync');
const read = async name => JSON.parse(await readFile(path.join(local, name), 'utf8'));
const write = async (root, name, value) => writeFile(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`);
await mkdir(compact, { recursive: true });
const measurements = await read('measured-anchors.json');
const visual = await read('visual-observations.json');
const metadata = await read('input-metadata.json');
const policy = await read('measurement-policy.json');
visual.observations.forEach(validateClockObservation);
assert.deepEqual(measurements.map(row => row.reviewTargetId), ['review_match_003', 'review_match_004']);
const summaries = [];
const sessions = [];
for (const measurement of measurements) {
    const target = measurement.reviewTargetId;
    assert.equal(visual.association[target]?.supported, true, 'match_association_not_supported');
    const result = analyzeSyncAnchors(measurement.anchors);
    const syncModel = { slope: result.slope, interceptSeconds: result.interceptSeconds,
        method: 'audio_cross_correlation', validationStatus: 'validated' };
    const recordingDuration = Math.max(...metadata.tracks.map(row => row.durationSeconds));
    const vodRange = { start: Math.max(0, result.interceptSeconds),
        end: Math.min(measurement.vodDurationSeconds, result.slope * recordingDuration + result.interceptSeconds) };
    const craigRange = { start: vodToCraig(vodRange.start, syncModel), end: vodToCraig(vodRange.end, syncModel) };
    const summary = { schemaVersion: 1, taskId: '210', reviewTargetId: target,
        provenance: 'derived_sync_model', associationSupported: true,
        vodDurationSeconds: measurement.vodDurationSeconds, craigRangeSeconds: craigRange, vodRangeSeconds: vodRange,
        ...result, rejectedAnchorCount: measurement.rejectedAnchorCount, rejectedRegions: measurement.rejectedRegions,
        anchors: measurement.anchors, sourceTrackCount: 9,
        measuredTrackRefs: [...new Set(measurement.anchors.map(row => row.trackRef))].sort(),
        visualChecks: visual.observations.filter(row => row.reviewTargetId === target),
        humanHypothesesUsedInFit: false, leaderboardDurationIndependentlyObserved: false,
        clockDomainsConflated: false, asrStatus: 'HUMAN_VALIDATION_REQUIRED',
        limitation: 'One recording clock mapping balances source-path latency. Not all nine tracks occur in VOD audio; unmeasured source tracks inherit the normalized recording clock, not per-track accuracy proof. No human phrase transcription verification.' };
    summaries.push(summary);
    await write(compact, `match-${target.slice(-3)}-sync-summary.json`, summary);
    if (result.precisionStatus !== 'alignment_precision_insufficient') {
        const session = { vodSessionId: `task210_${target}_session`, sourceVodRef: `task210_${target}_video`,
            reviewTargetId: target, craigRange, vodRange, syncModel,
            syncEstimatedErrorSeconds: result.estimatedOperationalSyncErrorSeconds, syncStatus: 'validated',
            precisionStatus: result.precisionStatus,
            syncValidation: { provenance: 'derived_sync_model', fitAnchorCount: result.fitAnchorCount,
                validationAnchorCount: result.validationAnchorCount, validationUsedInFit: false,
                validationResidual: { mae: result.validationResidual.mae, p90: result.validationResidual.p90, max: result.validationResidual.max },
                regionResidualChangeSeconds: result.regionResidualChangeSeconds } };
        validateRealSession(session);
        sessions.push(session);
    }
}
assert.ok(summaries[0].craigRangeSeconds.end < summaries[1].craigRangeSeconds.start, 'match_order_or_overlap_gap');
await write(local, 'sessions.json', { craigRecordingId: 'craig_recording_task208_real_01', vodSessions: sessions });
await write(compact, 'manifest.json', { schemaVersion: 1, taskId: '210', baseCommit: '6a8fa7433f75f6cd94499e7e32e31f4e81da86d8',
    craigRecordingId: 'craig_recording_task208_real_01', reviewTargetIds: measurements.map(row => row.reviewTargetId),
    sourceTrackCount: 9, inputVideoCount: 2, analyzedAudioStreamCount: 6, analysisSampleRate: metadata.sampleRate,
    extraction: 'mono_PTS_preserving_local_analysis_copies', coarse: '50Hz_RMS_envelope_normalized_cross_correlation',
    fine: '8second_individual_track_waveform_normalized_cross_correlation_8kHz', measurementPolicy: policy,
    modelSelectionPolicy: 'Fit only fit anchors; require held-out MAE gain at least 20ms and 20 percent without worse max to select affine.',
    operationalErrorPolicy: 'Maximum observed fit or validation absolute residual plus 20ms analysis margin; not a confidence bound on unseen audio.',
    localEvidenceRef: '.local/deadem/review-workspace/scrim/real-sync-task210/', registeredSessionCount: sessions.length,
    asrExecutionCount: 0, replayProcessingCount: 0, finalFactCount: 0, automaticAttributionCount: 0 });
console.log(JSON.stringify(summaries.map(row => ({ target: row.reviewTargetId, precision: row.precisionStatus,
    fit: row.fitAnchorCount, validation: row.validationAnchorCount, model: row.selectedModel,
    validationMaeSeconds: row.validationResidual.mae, errorSeconds: row.estimatedOperationalSyncErrorSeconds })), null, 2));
