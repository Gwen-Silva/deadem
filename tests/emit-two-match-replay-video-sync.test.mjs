import assert from 'node:assert/strict';
import test from 'node:test';

import {
    assertReviewTargetId,
    buildSegmentedModel,
    deterministicJson,
    fitLinearModel,
    mapReplayElapsed,
    residualMetrics,
    validateAnchors
} from '../tools/emit-two-match-replay-video-sync.mjs';

const evidence = {
    replay: 'synthetic replay observation',
    video: 'synthetic video observation',
    limitation: 'synthetic test only'
};

function anchor(anchorId, replayElapsedSeconds, videoSeconds, usage, source = 'manual_visual_anchor') {
    return {
        anchorId,
        reviewTargetId: 'review_match_001',
        replayElapsedSeconds,
        videoSeconds,
        source,
        usage,
        confidence: 'medium',
        status: 'usable_with_declared_uncertainty',
        uncertaintySeconds: 1,
        evidence
    };
}

function linearModel(slope = 1, interceptSeconds = 12, replayEndSeconds = 100) {
    return {
        modelType: 'linear',
        segments: [{
            segmentId: 'linear_001',
            replayStartSeconds: 0,
            replayEndSeconds,
            videoStartSeconds: interceptSeconds,
            videoEndSeconds: (slope * replayEndSeconds) + interceptSeconds,
            slope,
            interceptSeconds
        }]
    };
}

test('only the two authorized review target aliases are accepted', () => {
    assert.equal(assertReviewTargetId('review_match_001'), 'review_match_001');
    assert.equal(assertReviewTargetId('review_match_002'), 'review_match_002');
    assert.throws(() => assertReviewTargetId('review_match_003'), /unsupported review target/u);
});

test('protected replay aliases are rejected before filesystem access', () => {
    for (const value of ['replay_005', 'replay-006', 'match_007', 'partida_008']) {
        assert.throws(() => assertReviewTargetId(value), /protected replay alias rejected before filesystem access/u);
    }
});

test('anchor validation requires separately populated fit and validation sets', () => {
    const anchors = [
        anchor('fit_a', 0, 10, 'fit'),
        anchor('fit_b', 10, 20, 'fit'),
        anchor('validation_a', 20, 30, 'validation'),
        anchor('validation_b', 30, 40, 'validation')
    ];
    assert.deepEqual(validateAnchors(anchors), { fit: 2, validation: 2 });
    assert.throws(() => validateAnchors(anchors.map(item => ({ ...item, usage: 'fit' }))), /fit and validation anchors/u);
});

test('anchor validation rejects conflicting pairs and incomplete evidence', () => {
    const anchors = [
        anchor('fit_a', 0, 10, 'fit'),
        anchor('fit_b', 10, 20, 'fit'),
        anchor('validation_a', 20, 30, 'validation'),
        anchor('validation_b', 20, 31, 'validation')
    ];
    assert.throws(() => validateAnchors(anchors), /conflicting anchor pair/u);
    anchors[3] = { ...anchor('validation_b', 30, 40, 'validation'), evidence: { replay: 'present' } };
    assert.throws(() => validateAnchors(anchors), /incomplete anchor evidence/u);
});

test('linear fit recovers a deterministic scale and offset from fit anchors only', () => {
    const anchors = [
        anchor('fit_a', 0, 12, 'fit'),
        anchor('fit_b', 50, 62, 'fit'),
        anchor('fit_c', 100, 112, 'fit'),
        anchor('validation_outlier', 25, 99, 'validation')
    ];
    assert.deepEqual(fitLinearModel(anchors), { modelType: 'linear', slope: 1, interceptSeconds: 12 });
});

test('linear fit rejects degenerate replay timestamps', () => {
    assert.throws(() => fitLinearModel([
        anchor('fit_a', 10, 20, 'fit'),
        anchor('fit_b', 10, 21, 'fit')
    ]), /distinct replay timestamps/u);
});

test('mapping returns a bounded VOD timestamp inside coverage', () => {
    assert.deepEqual(mapReplayElapsed(linearModel(), 25), {
        mapped: true,
        replayElapsedSeconds: 25,
        videoSeconds: 37,
        segmentId: 'linear_001'
    });
});

test('mapping rejects invalid and uncovered timestamps without extrapolation', () => {
    assert.deepEqual(mapReplayElapsed(linearModel(), Number.NaN), { mapped: false, reason: 'invalid_replay_elapsed_seconds' });
    assert.deepEqual(mapReplayElapsed(linearModel(), 101), {
        mapped: false,
        reason: 'outside_covered_region',
        replayElapsedSeconds: 101
    });
});

test('segmented mappings choose the correct segment and reject uncovered gaps', () => {
    const model = buildSegmentedModel([
        { segmentId: 'before', replayStartSeconds: 0, replayEndSeconds: 40, slope: 1, interceptSeconds: 10 },
        { segmentId: 'after', replayStartSeconds: 50, replayEndSeconds: 100, slope: 1.1, interceptSeconds: 5 }
    ]);
    assert.equal(mapReplayElapsed(model, 20).segmentId, 'before');
    assert.equal(mapReplayElapsed(model, 75).segmentId, 'after');
    assert.deepEqual(mapReplayElapsed(model, 45), {
        mapped: false,
        reason: 'outside_covered_region',
        replayElapsedSeconds: 45
    });
});

test('segmented mappings reject overlapping replay intervals', () => {
    assert.throws(() => buildSegmentedModel([
        { replayStartSeconds: 0, replayEndSeconds: 60, slope: 1, interceptSeconds: 0 },
        { replayStartSeconds: 50, replayEndSeconds: 100, slope: 1, interceptSeconds: 0 }
    ]), /intervals overlap/u);
});

test('validation residuals remain independent from fit anchors', () => {
    const anchors = [
        anchor('fit_a', 0, 12, 'fit'),
        anchor('fit_b', 100, 112, 'fit'),
        anchor('validation_a', 20, 31, 'validation'),
        anchor('validation_b', 80, 94, 'validation')
    ];
    const metrics = residualMetrics(linearModel(), anchors);
    assert.equal(metrics.anchorCount, 2);
    assert.equal(metrics.meanAbsoluteErrorSeconds, 1.5);
    assert.equal(metrics.medianAbsoluteErrorSeconds, 1.5);
    assert.equal(metrics.maximumAbsoluteErrorSeconds, 2);
});

test('deterministic JSON recursively sorts object keys but preserves array order', () => {
    assert.equal(deterministicJson({ z: 1, a: { d: 2, b: 1 }, rows: [{ z: 3, a: 2 }] }), [
        '{',
        '  "a": {',
        '    "b": 1,',
        '    "d": 2',
        '  },',
        '  "rows": [',
        '    {',
        '      "a": 2,',
        '      "z": 3',
        '    }',
        '  ],',
        '  "z": 1',
        '}',
        ''
    ].join('\n'));
});
