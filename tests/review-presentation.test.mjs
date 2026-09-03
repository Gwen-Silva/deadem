import assert from 'node:assert/strict';
import test from 'node:test';
import { REVIEW_FIELD_DEFINITIONS } from '../tools/review-workspace/ux-model.mjs';
import {
    ERROR_CLASS_GROUPS,
    REVIEW_SECTIONS,
    communicationPresentation,
    formatReviewTimestamp,
    friendlyReviewUrl,
    momentIdentity,
    parseReviewTimestamp,
    queuePresentation,
    selectEvidenceFrames
} from '../tools/review-workspace/review-presentation.mjs';

const expectedFields = ['facts', 'unknownInformation', 'teamCall', 'playerIntent', 'observedAction', 'alternatives', 'immediateResult', 'longTermResult', 'decisionQuality', 'executionQuality', 'reviewNotes'];
const expectedErrors = ['mechanical_error', 'information_error', 'positioning_error', 'timing_error', 'priority_error', 'map_read_error', 'risk_evaluation_error', 'execution_error', 'planning_error', 'team_coordination_failure', 'composition_identity_failure', 'correct_decision_bad_result', 'bad_decision_favorable_result', 'not_an_error', 'uncertain'];

test('five review sections preserve all eleven persisted field keys exactly once', () => {
    const grouped = REVIEW_SECTIONS.flatMap(section => section.fields.map(field => field.key));
    assert.deepEqual(grouped, expectedFields);
    assert.deepEqual(REVIEW_FIELD_DEFINITIONS.map(field => field.key), expectedFields);
    assert.equal(new Set(grouped).size, 11);
});

test('visual chips preserve the exact accepted error-class vocabulary', () => {
    assert.deepEqual(ERROR_CLASS_GROUPS.flatMap(group => group.values.map(([value]) => value)), expectedErrors);
});

test('human review timestamps format, parse and reject invalid values', () => {
    assert.equal(formatReviewTimestamp(1122), '18:42');
    assert.equal(formatReviewTimestamp(1122.5), '18:42.5');
    assert.equal(parseReviewTimestamp('18:42'), 1122);
    assert.equal(parseReviewTimestamp('18:42.5'), 1122.5);
    assert.equal(parseReviewTimestamp('1122.5'), 1122.5);
    for (const value of ['', '-1', '18:60', 'abc', '1:2']) assert.throws(() => parseReviewTimestamp(value), /invalid_review_timestamp/u);
});

test('friendly moment identity and URL never expose the full candidate id', () => {
    assert.deepEqual(momentIdentity('review_match_003_window_0025'), { targetId: 'review_match_003', matchId: '003', momentNumber: 25, label: 'Momento 25' });
    assert.equal(friendlyReviewUrl('review_match_003_window_0025'), '/review?match=003&moment=25');
    assert.throws(() => momentIdentity('replay_005_window_0001'), /invalid_candidate_id/u);
});

test('queue presentation maps real product time, state and safe thumbnail', () => {
    const presented = queuePresentation({ candidateWindowId: 'review_match_004_window_0057', reviewState: 'reviewed' }, {
        vodTime: '31:05', reviewLabel: 'Revisado', thumbnail: { status: 'available', url: '/media/1234567890abcdef1234567890abcdef', alt: 'Preview visual da Scrim 04' }
    });
    assert.equal(presented.label, 'Momento 57');
    assert.equal(presented.time, '31:05');
    assert.equal(presented.reviewLabel, 'Revisado');
    assert.match(presented.thumbnail.url, /^\/media\/[0-9a-f]{32}$/u);
});

test('representative frame is the main evidence with deterministic fallback', () => {
    const frames = [
        { role: 'last', status: 'available', url: '/media/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
        { role: 'representative', status: 'available', url: '/media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        { role: 'first', status: 'unavailable', url: null }
    ];
    const selected = selectEvidenceFrames(frames);
    assert.equal(selected.main.role, 'representative');
    assert.deepEqual(selected.thumbnails.map(frame => frame.role), ['first', 'representative', 'last']);
    assert.equal(selectEvidenceFrames([{ role: 'first', status: 'available' }]).main.role, 'first');
    assert.equal(selectEvidenceFrames([]).main, null);
});

test('legacy and multitrack communication stay explicitly distinct', () => {
    assert.deepEqual(communicationPresentation({ scrimContextEvidence: { status: 'available' } }), { mode: 'multitrack', synchronizedReplay: true });
    assert.deepEqual(communicationPresentation({ audioCallEvidence: { status: 'available' } }), { mode: 'legacy', synchronizedReplay: false });
    assert.deepEqual(communicationPresentation({}), { mode: 'unavailable', synchronizedReplay: false });
});
