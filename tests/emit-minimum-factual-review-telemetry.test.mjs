import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReviewTargetId, chooseGate, deterministicJson, positiveCounterDeltas, validateMonotonicTimeline } from '../tools/emit-minimum-factual-review-telemetry.mjs';

const family = (status, rows = 0) => ({ status, rows });
const target = (time = 'available', useful = true) => ({ processingStatus: 'usable', availability: {
    time: family(time, time === 'available' ? 10 : 0), participants: family(useful ? 'available' : 'unavailable', useful ? 2 : 0),
    teams: family(useful ? 'available' : 'unavailable', useful ? 2 : 0), heroes: family('unavailable'), lifeState: family('unavailable'),
    netWorth: family('unavailable'), damage: family('unavailable'), healing: family('unavailable'), objectives: family('unavailable'), positions: family('unavailable')
} });

test('accepts only the two review targets and rejects protected replay aliases', () => {
    assert.equal(assertReviewTargetId('review_match_001'), 'review_match_001');
    assert.throws(() => assertReviewTargetId('replay_005'), /protected replay alias/u);
    assert.throws(() => assertReviewTargetId('review_match_003'), /unsupported/u);
});

test('normalized timeline detects monotonicity and gaps', () => {
    assert.deepEqual(validateMonotonicTimeline([{ elapsedSeconds: 0, sourceTick: 10 }, { elapsedSeconds: 2, sourceTick: 20 }]), {
        monotonic: true, gaps: [{ from: 0, to: 2, seconds: 1 }], firstTime: 0, lastTime: 2
    });
    assert.equal(validateMonotonicTimeline([{ elapsedSeconds: 1, sourceTick: 20 }, { elapsedSeconds: 1, sourceTick: 19 }]).monotonic, false);
});

test('delta calculation emits only positive valid aggregate counter differences', () => {
    const rows = positiveCounterDeltas({ a: 10, b: 5 }, { a: 14, b: 3 }, { reviewTargetId: 'review_match_001', participantKey: 'controller:1', elapsedSeconds: 2, sourceTick: 20, fields: ['a', 'b'] });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].delta, 4);
    assert.equal(rows[0].semanticClass, 'aggregate_counter_delta');
    assert.equal('victim' in rows[0] || 'killer' in rows[0], false);
});

test('gate requires both timelines and two useful additional families', () => {
    assert.equal(chooseGate([target(), target()]), 'two_match_review_telemetry_ready_with_declared_gaps');
    assert.equal(chooseGate([target('available', false), target()]), 'two_match_review_telemetry_partial');
    assert.equal(chooseGate([target('unavailable'), target()]), 'BLOCKED_BY_REVIEW_REPLAY_SAFE_TIMELINE_UNAVAILABLE');
    assert.equal(chooseGate([target(), target()], 1), 'BLOCKED_BY_REVIEW_REPLAY_INPUTS_NOT_ACCESSIBLE');
});

test('serialization is deterministic and keeps targets separate', () => {
    const one = { targets: [{ reviewTargetId: 'review_match_001' }, { reviewTargetId: 'review_match_002' }], z: 1, a: 2 };
    assert.equal(deterministicJson(one), deterministicJson(structuredClone(one)));
    assert.notEqual(one.targets[0].reviewTargetId, one.targets[1].reviewTargetId);
});

test('raw position vocabulary is not promoted to spatial semantics', () => {
    const text = deterministicJson({ coordinates: { x: 1, y: 2 }, provenanceClass: 'factual/replay_observed_position_with_derived_metrics' });
    for (const forbidden of ['Rift area', 'jungle', 'lane assignment', 'Mid Boss']) assert.equal(text.includes(forbidden), false);
});
