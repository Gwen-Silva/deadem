import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    buildExtractionPlans,
    buildTargetExtractionPlan,
    buildWindowEvidence,
    buildWindowTimestampRequests,
    cadenceMsForTier,
    deterministicJson,
    mergeFrameExtraction,
    paginateFrames,
    selectRepresentativeFrame,
    validateCandidatePreservation
} from '../tools/emit-dense-visual-review-evidence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function candidate(overrides = {}) {
    const reviewTargetId = overrides.reviewTargetId ?? 'review_match_001';
    const candidateWindowId = overrides.candidateWindowId ?? `${reviewTargetId}_window_0001`;
    return {
        candidateWindowId,
        reviewTargetId,
        candidateSemantics: 'review_attention_region_not_gameplay_event',
        priorityTier: 'medium',
        prioritySemantics: 'review_priority_heuristic_not_probability',
        replayStartSeconds: 10,
        replayEndSeconds: 20,
        sourceFamilies: ['lifecycle'],
        videoMapping: {
            mapped: true,
            visualEvidenceStartSeconds: 100,
            visualEvidenceEndSeconds: 110,
            syncEstimatedErrorSeconds: reviewTargetId === 'review_match_001' ? 9 : 2
        },
        ...overrides
    };
}

function extracted(plan, failedTimestamp = null) {
    return plan.rows.map(row => ({
        requested_timestamp_ms: row.requestedTimestampMs,
        decoded_timestamp_ms: row.requestedTimestampMs,
        timestamp_error_ms: 0,
        sha256: row.requestedTimestampMs === failedTimestamp ? null : 'a'.repeat(64),
        image_path: `C:/repo/.local/frame-${row.requestedTimestampMs}.jpg`,
        width: 1920,
        height: 1080,
        decode_status: row.requestedTimestampMs === failedTimestamp ? 'seek_failed' : 'decoded'
    }));
}

test('tier-to-cadence mapping is fixed and the one-time adjustment only changes high', () => {
    assert.equal(cadenceMsForTier('high'), 1000);
    assert.equal(cadenceMsForTier('medium'), 2000);
    assert.equal(cadenceMsForTier('low'), 5000);
    assert.equal(cadenceMsForTier('high', 1), 1500);
    assert.equal(cadenceMsForTier('medium', 1), 2000);
    assert.equal(cadenceMsForTier('low', 1), 5000);
});

test('visual range planning includes exact boundaries and center for a short low window', () => {
    const window = candidate({ priorityTier: 'low', videoMapping: { mapped: true, visualEvidenceStartSeconds: 100.2, visualEvidenceEndSeconds: 101.1, syncEstimatedErrorSeconds: 9 } });
    const request = buildWindowTimestampRequests(window);
    assert.deepEqual(request.timestampsMs, [100200, 100650, 101100]);
});

test('higher density wins in overlap and physical timestamps are deduplicated', () => {
    const windows = [
        candidate({ priorityTier: 'low', candidateWindowId: 'review_match_001_window_0001' }),
        candidate({ priorityTier: 'high', candidateWindowId: 'review_match_001_window_0002', videoMapping: { mapped: true, visualEvidenceStartSeconds: 104, visualEvidenceEndSeconds: 106, syncEstimatedErrorSeconds: 9 } })
    ];
    const plan = buildTargetExtractionPlan('review_match_001', windows);
    const at105 = plan.rows.find(row => row.requestedTimestampMs === 105000);
    assert.equal(at105.highestRequiredPriority, 'high');
    assert.equal(at105.requiredCadenceSeconds, 1);
    assert.deepEqual(at105.windowsReferencing, ['review_match_001_window_0001', 'review_match_001_window_0002']);
    assert.ok(plan.deduplicationSavings > 0);
    assert.equal(new Set(plan.rows.map(row => row.requestedTimestampMs)).size, plan.rows.length);
});

test('frame IDs, ordering and JSON are deterministic', () => {
    const windows = [candidate()];
    const first = buildTargetExtractionPlan('review_match_001', windows);
    const second = buildTargetExtractionPlan('review_match_001', windows);
    assert.equal(deterministicJson(first), deterministicJson(second));
    assert.match(first.rows[0].denseFrameId, /^review_match_001_dense_00001$/u);
});

test('cross-target plans remain isolated', () => {
    const windows = [candidate(), candidate({ reviewTargetId: 'review_match_002', candidateWindowId: 'review_match_002_window_0001' })];
    const first = buildTargetExtractionPlan('review_match_001', windows);
    const second = buildTargetExtractionPlan('review_match_002', windows);
    assert.ok(first.rows.every(row => row.reviewTargetId === 'review_match_001' && row.windowsReferencing.every(id => id.startsWith('review_match_001_'))));
    assert.ok(second.rows.every(row => row.reviewTargetId === 'review_match_002' && row.windowsReferencing.every(id => id.startsWith('review_match_002_'))));
});

test('representative selection uses nearest timestamp with deterministic tie break', () => {
    const frames = [{ requestedTimestampMs: 1000, denseFrameId: 'a' }, { requestedTimestampMs: 3000, denseFrameId: 'b' }];
    assert.equal(selectRepresentativeFrame(frames, 2000).denseFrameId, 'a');
});

test('extraction failures are represented and reverse window references survive', () => {
    const window = candidate();
    const plan = buildTargetExtractionPlan('review_match_001', [window]);
    const failedTimestamp = plan.rows[1].requestedTimestampMs;
    const frames = mergeFrameExtraction(plan, extracted(plan, failedTimestamp));
    assert.equal(frames.find(frame => frame.requestedTimestampMs === failedTimestamp).extractionStatus, 'seek_failed');
    assert.ok(frames.every(frame => frame.windowsReferencing.includes(window.candidateWindowId)));
});

test('window evidence preserves Task202 semantics, priority, ranges, source families and sync error', () => {
    const window = candidate();
    const plan = buildTargetExtractionPlan('review_match_001', [window]);
    const frames = mergeFrameExtraction(plan, extracted(plan));
    const evidence = buildWindowEvidence(window, frames);
    assert.equal(evidence.candidateSemantics, 'review_attention_region_not_gameplay_event');
    assert.equal(evidence.priorityTier, window.priorityTier);
    assert.deepEqual(evidence.sourceFamilies, window.sourceFamilies);
    assert.equal(evidence.syncEstimatedErrorSeconds, 9);
    assert.equal(evidence.boundaryEvidence.complete, true);
    assert.ok(evidence.firstFrameId && evidence.representativeFrameId && evidence.lastFrameId);
    assert.equal(validateCandidatePreservation([window], [evidence]), true);
});

test('contact sheet pagination stays within 20-30 thumbnails', () => {
    const frames = Array.from({ length: 61 }, (_, index) => ({ index }));
    const pages = paginateFrames(frames);
    assert.deepEqual(pages.map(page => page.length), [25, 25, 11]);
    assert.throws(() => paginateFrames(frames, 31), /between 20 and 30/u);
});

test('density adjustment happens at most once and leaves medium/low unchanged', () => {
    const windows = [
        candidate({ priorityTier: 'high', videoMapping: { mapped: true, visualEvidenceStartSeconds: 0, visualEvidenceEndSeconds: 7000, syncEstimatedErrorSeconds: 9 } }),
        candidate({ reviewTargetId: 'review_match_002', candidateWindowId: 'review_match_002_window_0001', priorityTier: 'low', videoMapping: { mapped: true, visualEvidenceStartSeconds: 0, visualEvidenceEndSeconds: 10, syncEstimatedErrorSeconds: 2 } })
    ];
    const plans = buildExtractionPlans(windows);
    assert.equal(plans.densityAdjustmentCount, 1);
    assert.equal(plans.targets[0].cadenceSeconds.high, 1.5);
    assert.equal(plans.targets[0].cadenceSeconds.medium, 2);
    assert.equal(plans.targets[1].cadenceSeconds.low, 5);
});

test('real compact artifacts preserve 102 candidates, local-only images and VOD hash bridge when emitted', async () => {
    const output = path.join(ROOT, 'output/local-replay-processing/dense-review-evidence/task203-bounded2');
    const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
    const windows = JSON.parse(await readFile(path.join(output, 'window-evidence-index.json'), 'utf8'));
    const provenance = JSON.parse(await readFile(path.join(output, 'provenance-audit.json'), 'utf8'));
    assert.equal(manifest.vodIdentityBridges.length, 2);
    assert.ok(manifest.vodIdentityBridges.every(bridge => bridge.expectedSha256 === bridge.observedSha256));
    assert.equal(windows.candidateWindowCount, 102);
    assert.ok(windows.windows.every(window => window.candidateSemantics === 'review_attention_region_not_gameplay_event'));
    assert.equal(manifest.counts.imagesVersioned, 0);
    assert.equal(provenance.replayAccessCount, 0);
    assert.equal(provenance.protectedAccessCount, 0);
    assert.deepEqual(provenance.prohibitedVisualStagesExecuted, []);
});
