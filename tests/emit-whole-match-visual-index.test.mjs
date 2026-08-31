import assert from 'node:assert/strict';
import test from 'node:test';

import {
    assertReviewTargetId,
    assignContactSheetMembership,
    calculateCoverage,
    consumeSyncMapping,
    deterministicJson,
    generateSamplePlan,
    mergeFrameExtraction,
    validateSamplePlan
} from '../tools/emit-whole-match-visual-index.mjs';

function model(reviewTargetId = 'review_match_001') {
    const first = reviewTargetId === 'review_match_001';
    const replayEndSeconds = first ? 4562 : 2090;
    const interceptSeconds = first ? 1938 : 0;
    return {
        reviewTargetId,
        estimatedErrorSeconds: first ? 9 : 2,
        coveredReplayRegion: { startSeconds: 0, endSeconds: replayEndSeconds },
        uncoveredReplayRegions: [{ afterSecondsExclusive: replayEndSeconds, endSecondsInclusive: first ? 4570 : 2093 }],
        segments: [{
            segmentId: `${reviewTargetId}_linear_001`,
            replayStartSeconds: 0,
            replayEndSeconds,
            videoStartSeconds: interceptSeconds,
            videoEndSeconds: replayEndSeconds + interceptSeconds,
            slope: 1,
            interceptSeconds
        }]
    };
}

test('30-second sample plans produce the exact bounded-two counts', () => {
    assert.equal(generateSamplePlan('review_match_001', model()).length, 153);
    assert.equal(generateSamplePlan('review_match_002', model('review_match_002')).length, 70);
});

test('sample plan consumes the Task 200 scale and offset unchanged', () => {
    const rows = generateSamplePlan('review_match_001', model());
    assert.deepEqual(rows[1], {
        reviewTargetId: 'review_match_001',
        visualIndexFrameId: 'review_match_001_frame_0002',
        replayElapsedSeconds: 30,
        mappedVideoTimestampSeconds: 1968,
        syncSegmentId: 'review_match_001_linear_001',
        syncEstimatedErrorSeconds: 9,
        requestedVideoTimestampMs: 1968000
    });
});

test('uncovered replay tails are excluded rather than extrapolated', () => {
    const first = generateSamplePlan('review_match_001', model());
    const second = generateSamplePlan('review_match_002', model('review_match_002'));
    assert.equal(first.at(-1).replayElapsedSeconds, 4560);
    assert.equal(second.at(-1).replayElapsedSeconds, 2070);
    assert.deepEqual(consumeSyncMapping(model(), 4563), { mapped: false, reason: 'outside_task200_covered_segment', replayElapsedSeconds: 4563 });
});

test('sample plans are strictly chronological', () => {
    const rows = generateSamplePlan('review_match_001', model());
    assert.deepEqual(validateSamplePlan(rows, 'review_match_001'), { frameCount: 153, ordered: true, crossTargetMixing: false });
    [rows[1], rows[2]] = [rows[2], rows[1]];
    assert.throws(() => validateSamplePlan(rows, 'review_match_001'), /not strictly chronological/u);
});

test('replay to video timestamp pairs cannot be silently changed', () => {
    const rows = generateSamplePlan('review_match_002', model('review_match_002'));
    rows[3].requestedVideoTimestampMs += 1;
    assert.throws(() => validateSamplePlan(rows, 'review_match_002'), /timestamp pair was not preserved/u);
});

test('sync error is propagated independently for each target', () => {
    assert.ok(generateSamplePlan('review_match_001', model()).every(row => row.syncEstimatedErrorSeconds === 9));
    assert.ok(generateSamplePlan('review_match_002', model('review_match_002')).every(row => row.syncEstimatedErrorSeconds === 2));
});

test('decoded and requested timestamps preserve seek error separately', () => {
    const plan = generateSamplePlan('review_match_002', model('review_match_002')).slice(0, 1);
    const frames = mergeFrameExtraction(plan, [{
        requested_timestamp_ms: 0,
        decoded_timestamp_ms: 33,
        timestamp_error_ms: 33,
        sha256: 'a'.repeat(64),
        image_path: '.local\\deadem\\visual-index\\review_match_002\\frames\\frame.jpg',
        decode_status: 'decoded',
        source_frame_index: 1,
        width: 1920,
        height: 1080
    }]);
    assert.equal(frames[0].seekErrorMs, 33);
    assert.equal(frames[0].syncEstimatedErrorSeconds, 2);
    assert.equal(frames[0].localFramePath, '.local/deadem/visual-index/review_match_002/frames/frame.jpg');
});

test('contact sheet membership is chronological and capped at 25', () => {
    const frames = generateSamplePlan('review_match_002', model('review_match_002')).slice(0, 27).map(row => ({ ...row, extractionStatus: 'decoded' }));
    const assigned = assignContactSheetMembership(frames);
    assert.equal(assigned[24].contactSheetId, 'review_match_002_sheet_001');
    assert.equal(assigned[24].contactSheetPosition, 24);
    assert.equal(assigned[25].contactSheetId, 'review_match_002_sheet_002');
    assert.equal(assigned[25].contactSheetPosition, 0);
});

test('visual frame and sheet IDs are deterministic', () => {
    const first = assignContactSheetMembership(generateSamplePlan('review_match_001', model()).slice(0, 30).map(row => ({ ...row, extractionStatus: 'decoded' })));
    const second = assignContactSheetMembership(generateSamplePlan('review_match_001', model()).slice(0, 30).map(row => ({ ...row, extractionStatus: 'decoded' })));
    assert.equal(deterministicJson(first), deterministicJson(second));
});

test('cross-target mixing is rejected', () => {
    const rows = generateSamplePlan('review_match_001', model()).slice(0, 2);
    rows[1].reviewTargetId = 'review_match_002';
    assert.throws(() => validateSamplePlan(rows, 'review_match_001'), /cross-target sample mixing/u);
});

test('heavy frame paths remain local-only metadata', () => {
    const plan = generateSamplePlan('review_match_001', model()).slice(0, 1);
    const frames = mergeFrameExtraction(plan, [{
        requested_timestamp_ms: 1938000,
        decoded_timestamp_ms: 1938000,
        timestamp_error_ms: 0,
        sha256: 'b'.repeat(64),
        image_path: '.local/deadem/visual-index/review_match_001/frames/frame.jpg',
        decode_status: 'decoded'
    }]);
    assert.match(frames[0].localFramePath, /^\.local\/deadem\/visual-index\//u);
    assert.equal(frames[0].provenance.semanticInterpretation, false);
});

test('protected and unsupported aliases fail before access', () => {
    for (const value of ['replay_005', 'replay-006', 'match_007', 'partida_008']) {
        assert.throws(() => assertReviewTargetId(value), /protected replay alias rejected before filesystem access/u);
    }
    assert.throws(() => assertReviewTargetId('review_match_003'), /unsupported review target/u);
});

test('coverage reports extraction and separate seek statistics', () => {
    const rows = generateSamplePlan('review_match_002', model('review_match_002')).slice(0, 3);
    const frames = rows.map((row, index) => ({ ...row, extractionStatus: 'decoded', seekErrorMs: index * 10 }));
    const coverage = calculateCoverage(frames, model('review_match_002'), 30, 1);
    assert.equal(coverage.extractionRate, 1);
    assert.equal(coverage.averageAbsoluteSeekErrorMs, 10);
    assert.equal(coverage.maximumAbsoluteSeekErrorMs, 20);
    assert.deepEqual(coverage.uncoveredReplayRanges, [{ startSecondsInclusive: 2091, endSecondsInclusive: 2093 }]);
});

test('an individual frame failure remains explicit and does not shift sheet membership', () => {
    const plan = generateSamplePlan('review_match_002', model('review_match_002')).slice(0, 3);
    const extracted = [
        { requested_timestamp_ms: 0, decoded_timestamp_ms: 0, timestamp_error_ms: 0, sha256: 'a'.repeat(64), image_path: 'a.jpg', decode_status: 'decoded' },
        { requested_timestamp_ms: 30000, decoded_timestamp_ms: null, timestamp_error_ms: null, decode_status: 'seek_failed' },
        { requested_timestamp_ms: 60000, decoded_timestamp_ms: 60000, timestamp_error_ms: 0, sha256: 'c'.repeat(64), image_path: 'c.jpg', decode_status: 'decoded' }
    ];
    const frames = assignContactSheetMembership(mergeFrameExtraction(plan, extracted));
    assert.equal(frames[1].frameSha256, null);
    assert.equal(frames[1].contactSheetId, null);
    assert.equal(frames[2].contactSheetPosition, 1);
    assert.equal(calculateCoverage(frames, model('review_match_002'), 30, 1).failedSamples, 1);
});

test('sampling outside the approved 20 to 45 second range is rejected', () => {
    assert.throws(() => generateSamplePlan('review_match_001', model(), 10), /20 through 45/u);
    assert.throws(() => generateSamplePlan('review_match_001', model(), 60), /20 through 45/u);
});
