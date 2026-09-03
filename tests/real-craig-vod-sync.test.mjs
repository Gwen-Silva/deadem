import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeSyncAnchors, validateClockObservation } from '../tools/review-workspace/real-sync-model.mjs';
import { validateSession, validateRealSession, craigToVod, vodToCraig } from '../tools/review-workspace/scrim-model.mjs';
import { resolveAuthorizedRealVod } from '../tools/review-workspace/scrim-media.mjs';

const anchors = (slope = 1, intercept = 3) => Array.from({ length: 24 }, (_, i) => ({
    anchorId: `anchor_${i}`, provenance: 'audio_measured_anchor', clockDomain: 'craig_to_vod',
    role: i % 2 ? 'validation' : 'fit', trackRef: 'track_03', correlationConfidence: 0.8,
    craigTimeSeconds: 100 + i * 100, vodTimeSeconds: slope * (100 + i * 100) + intercept
}));

test('offset-only wins without a substantive held-out affine gain', () => {
    const result = analyzeSyncAnchors(anchors());
    assert.equal(result.selectedModel, 'offset_only');
    assert.equal(result.slope, 1);
    assert.equal(result.interceptSeconds, 3);
    assert.equal(result.validationResidual.max, 0);
    assert.equal(result.precisionStatus, 'preferred_precision');
});

test('affine is selected against validation rather than training residual', () => {
    const result = analyzeSyncAnchors(anchors(1.002, 5));
    assert.equal(result.selectedModel, 'affine');
    assert.ok(Math.abs(result.slope - 1.002) < 1e-10);
    const data = anchors(1.002, 5);
    for (const row of data.filter(row => row.role === 'validation')) row.vodTimeSeconds = row.craigTimeSeconds + 7.4;
    assert.equal(analyzeSyncAnchors(data).selectedModel, 'offset_only');
});

test('validation changes cannot change either fitted model or hide bad residuals', () => {
    const data = anchors();
    const before = analyzeSyncAnchors(data);
    data[1].vodTimeSeconds += 5;
    const after = analyzeSyncAnchors(data);
    for (const key of ['affine', 'offset_only']) {
        assert.equal(after.comparison[key].slope, before.comparison[key].slope);
        assert.equal(after.comparison[key].interceptSeconds, before.comparison[key].interceptSeconds);
    }
    assert.equal(after.validationAnchorCount, 12);
    assert.equal(after.validationResidual.max, 5);
    assert.equal(after.precisionStatus, 'alignment_precision_insufficient');
    assert.equal(after.validationUsedInFit, false);
});

test('robust outlier rejection is fit-only and explicit', () => {
    const data = anchors(1.001, 4);
    data[8].vodTimeSeconds += 30;
    const result = analyzeSyncAnchors(data);
    assert.equal(result.outlierCount, 1);
    assert.deepEqual(result.rejectedFitAnchorIds, ['anchor_8']);
    assert.equal(result.fitAnchorCount, 11);
    assert.equal(result.validationAnchorCount, 12);
    assert.ok(result.validationResidual.max < 1e-9);
});

test('duplicate, undersized, non-distributed and non-audio populations fail closed', () => {
    assert.throws(() => analyzeSyncAnchors([...anchors(), anchors()[0]]), /duplicate/u);
    assert.throws(() => analyzeSyncAnchors(anchors().slice(0, 10)), /six_independent/u);
    const clustered = anchors().map((row, i) => ({ ...row, craigTimeSeconds: i }));
    assert.throws(() => analyzeSyncAnchors(clustered), /distributed/u);
    const remembered = anchors();
    remembered[0].provenance = 'human_supplied_anchor';
    assert.throws(() => analyzeSyncAnchors(remembered), /invalid_audio/u);
});

test('real session mapping forward/inverse and synthetic status cannot be conflated', () => {
    const model = { slope: 1.001, interceptSeconds: -3000, method: 'audio_cross_correlation', validationStatus: 'validated' };
    const session = { reviewTargetId: 'review_match_004', syncModel: model, syncStatus: 'validated',
        craigRange: { start: 3100, end: 6000 }, vodRange: { start: craigToVod(3100, model), end: craigToVod(6000, model) }, syncEstimatedErrorSeconds: 0.1 };
    assert.equal(validateSession(session), session);
    assert.ok(Math.abs(vodToCraig(craigToVod(4000, model), model) - 4000) < 1e-9);
    assert.throws(() => validateSession({ ...session, syncStatus: 'synthetic_only' }), /status_mismatch/u);
    assert.throws(() => validateSession({ ...session, syncModel: { ...model, validationStatus: 'synthetic_validated' } }), /not_validated/u);
});

test('game clock and leaderboard remain distinct observations, never fit data', () => {
    const game = { provenance: 'visual_clock_observation', clockDomain: 'in_game_clock', vodTimeSeconds: 100, displayedSeconds: 91 };
    const result = { ...game, clockDomain: 'leaderboard_duration', displayedSeconds: 82 };
    assert.notEqual(validateClockObservation(game).clockDomain, validateClockObservation(result).clockDomain);
    const data = anchors();
    data[0] = { ...data[0], ...result };
    assert.throws(() => analyzeSyncAnchors(data), /invalid_audio/u);
});

const realSession = (target = 'review_match_003') => ({
    reviewTargetId: target, sourceVodRef: `task210_${target}_video`, syncStatus: 'validated', precisionStatus: 'preferred_precision',
    syncModel: { slope: 1, interceptSeconds: 3, method: 'audio_cross_correlation', validationStatus: 'validated' },
    craigRange: { start: 0, end: 2000 }, vodRange: { start: 3, end: 2003 }, syncEstimatedErrorSeconds: 0.2,
    syncValidation: { provenance: 'derived_sync_model', fitAnchorCount: 6, validationAnchorCount: 6, validationUsedInFit: false,
        validationResidual: { mae: 0.1, p90: 0.15, max: 0.18 }, regionResidualChangeSeconds: 0.03 }
});

test('real session schema requires sufficient independent metrics and accurate precision label', () => {
    assert.equal(validateRealSession(realSession()).syncStatus, 'validated');
    for (const field of ['fitAnchorCount', 'validationAnchorCount']) {
        const session = realSession(); session.syncValidation[field] = 5;
        assert.throws(() => validateRealSession(session), /independent_validation/u);
    }
    const contaminated = realSession(); contaminated.syncValidation.validationUsedInFit = true;
    assert.throws(() => validateRealSession(contaminated), /independent_validation/u);
    const bad = realSession(); bad.syncValidation.validationResidual.max = 0.8;
    assert.throws(() => validateRealSession(bad), /precision_insufficient/u);
    const limited = realSession(); limited.syncValidation.validationResidual.mae = 0.2;
    assert.throws(() => validateRealSession(limited), /label_mismatch/u);
    limited.precisionStatus = 'usable_with_limited_sync_precision';
    assert.equal(validateRealSession(limited), limited);
});

test('untrusted targets/refs and replay paths are rejected before directory resolution', () => {
    for (const target of ['../replay', 'review_match_005', 'review_match_006', 'review_match_007', 'review_match_008', 'input.dem']) {
        assert.throws(() => resolveAuthorizedRealVod('nonexistent-root', realSession(target)), /not_authorized/u);
    }
    assert.throws(() => resolveAuthorizedRealVod('nonexistent-root', { ...realSession(), sourceVodRef: 'arbitrary.mp4' }), /not_authorized/u);
});
