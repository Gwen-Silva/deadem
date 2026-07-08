import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    EXACT_15_AUTHORIZED_REPLAYS,
    FORBIDDEN_EXACT_15_OUTPUT_CLASSES,
    buildExact15Plan,
    validateExact15Selection
} from '../tools/emit-exact-15-death-validation-compact-artifacts.mjs';

function selectedReplay(replayId, overrides = {}) {
    return {
        replayId,
        localPath: EXACT_15_AUTHORIZED_REPLAYS[replayId],
        selectionGroup: replayId < 'replay_010' ? 'historical_eligible' : 'first_10_local_candidate_sequence',
        ...overrides
    };
}

function selection(overrides = {}) {
    return {
        schemaVersion: 1,
        selectionId: 'exact_15_death_validation_selection',
        selectedReplayCount: 15,
        selectedReplays: Object.keys(EXACT_15_AUTHORIZED_REPLAYS).map(replayId => selectedReplay(replayId)),
        ...overrides
    };
}

test('exact-15 selection shape requires exactly 15 selected replays', () => {
    assert.equal(validateExact15Selection(selection()).selectedReplayCount, 15);
    assert.throws(() => validateExact15Selection({ ...selection(), selectionId: 'wrong' }), /selectionId/u);
    assert.throws(() => validateExact15Selection({ ...selection(), selectedReplayCount: 14 }), /selectedReplayCount/u);
    assert.throws(
        () => validateExact15Selection({ ...selection(), selectedReplays: selection().selectedReplays.slice(0, 14) }),
        /exactly 15/u
    );
});

test('exact-15 plan accepts all authorized replays before filesystem access', () => {
    const plan = buildExact15Plan(selection());
    assert.equal(plan.readyInputs.length, 15);
    assert.equal(plan.blockedReplayAudit.length, 0);
    assert.deepEqual(plan.readyInputs.map(input => input.replayId), Object.keys(EXACT_15_AUTHORIZED_REPLAYS));
    assert.equal(plan.perReplayStatus.every(row => row.status === 'planned'), true);
    assert.equal(plan.perReplayStatus.every(row => row.filesystemAccessAttempted === false), true);
    assert.equal(plan.perReplayStatus.every(row => row.statAttempted === false), true);
    assert.equal(plan.perReplayStatus.every(row => row.hashAttempted === false), true);
    assert.equal(plan.perReplayStatus.every(row => row.openReadStreamAttempted === false), true);
    assert.equal(plan.perReplayStatus.every(row => row.parseAttempted === false), true);
});

test('exact-15 plan permits only selected sample paths and selected local candidates', () => {
    const plan = buildExact15Plan(selection());
    const sampleInputs = plan.readyInputs.filter(input => input.normalized.startsWith('samples/'));
    const localInputs = plan.readyInputs.filter(input => input.normalized.startsWith('.local/deadem/replays/inbox/'));
    assert.deepEqual(sampleInputs.map(input => input.replayId), ['replay_001', 'replay_002', 'replay_003', 'replay_004', 'replay_009']);
    assert.deepEqual(localInputs.map(input => input.replayId), [
        'replay_010',
        'replay_011',
        'replay_012',
        'replay_013',
        'replay_014',
        'replay_015',
        'replay_016',
        'replay_017',
        'replay_018',
        'replay_019'
    ]);
});

test('exact-15 plan blocks protected, bot, replay 020, and non-allowlisted paths before filesystem access', () => {
    const selectedReplays = [
        selectedReplay('replay_001'),
        selectedReplay('replay_002'),
        selectedReplay('replay_003'),
        selectedReplay('replay_004'),
        selectedReplay('replay_009'),
        selectedReplay('replay_010'),
        selectedReplay('replay_011'),
        selectedReplay('replay_012'),
        selectedReplay('replay_013'),
        selectedReplay('replay_014'),
        selectedReplay('replay_015'),
        selectedReplay('replay_016'),
        selectedReplay('replay_017'),
        { replayId: 'replay_005', localPath: '.local/deadem/replays/inbox/partida_005.dem' },
        { replayId: 'replay_020', localPath: '.local/deadem/replays/inbox/partida_020.dem' }
    ];
    const plan = buildExact15Plan(selection({ selectedReplays }));
    assert.equal(plan.blockedReplayAudit.length >= 2, true);
    assert.equal(plan.perReplayStatus.filter(row => row.status === 'blocked_by_policy').every(row => row.blockedBeforeFilesystemAccess), true);
    assert.equal(plan.perReplayStatus.filter(row => row.status === 'blocked_by_policy').every(row => row.openReadStreamAttempted === false), true);
    assert.equal(plan.perReplayStatus.filter(row => row.status === 'blocked_by_policy').every(row => row.parseAttempted === false), true);
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('protected_replay_005_final_holdout')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('replay_020_not_authorized_for_exact_15')));
});

test('exact-15 runner policy allows only death_validation and forbids richer surfaces', () => {
    assert.ok(FORBIDDEN_EXACT_15_OUTPUT_CLASSES.includes('death_events'));
    assert.ok(FORBIDDEN_EXACT_15_OUTPUT_CLASSES.includes('respawn_events'));
    assert.ok(FORBIDDEN_EXACT_15_OUTPUT_CLASSES.includes('killer_victim_assist_attribution'));
    assert.ok(FORBIDDEN_EXACT_15_OUTPUT_CLASSES.includes('field_values'));
    assert.ok(FORBIDDEN_EXACT_15_OUTPUT_CLASSES.includes('gameplay_interpretation'));
});

test('exact-15 runner source avoids update commands and unsafe replay operations', async () => {
    const source = await readFile('tools/emit-exact-15-death-validation-compact-artifacts.mjs', 'utf8');
    assert.equal(/\bgit\s+(pull|merge|cherry-pick|rebase)\b/iu.test(source), false);
    assert.equal(/\b(createHash|copyFile)\b/u.test(source), false);
    assert.equal(/rawDataCaptured:\s*true|finalFactsProduced:\s*true|gameplayInterpretationProduced:\s*true/u.test(source), false);
});

test('exact-15 runner documents all-or-nothing artifact writes', async () => {
    const source = await readFile('tools/emit-exact-15-death-validation-compact-artifacts.mjs', 'utf8');
    assert.match(source, /const allEmitted =/u);
    assert.match(source, /if \(allEmitted\) \{/u);
    assert.match(source, /realArtifactsWrittenOnlyAfterAllReplaysPassed: true/u);
});
