import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    AUTHORIZED_BATCH_REPLAYS,
    FORBIDDEN_BATCH_OUTPUT_CLASSES,
    buildBatchPlan,
    validateBatchManifestShape,
    validateBatchSummaryOutputRoot
} from '../tools/emit-batch-death-validation-compact-artifacts.mjs';

function manifest(overrides = {}) {
    return {
        schemaVersion: 1,
        batchId: 'batch_death_validation_compact_mini_pilot',
        mode: 'death_validation_compact_emission',
        authorization: 'Task 162 controlled batch death_validation compact mini-pilot only',
        realArtifactsAuthorized: true,
        allowedArtifactClass: 'death_validation',
        rawDataCaptured: false,
        finalFactsProduced: false,
        allowlist: [
            {
                replayId: 'replay_010',
                localPath: AUTHORIZED_BATCH_REPLAYS.replay_010,
                requestedMode: 'death_validation_compact_emission'
            },
            {
                replayId: 'replay_011',
                localPath: AUTHORIZED_BATCH_REPLAYS.replay_011,
                requestedMode: 'death_validation_compact_emission'
            }
        ],
        ...overrides
    };
}

test('batch death validation manifest requires explicit compact emission authorization', () => {
    assert.equal(validateBatchManifestShape(manifest()).mode, 'death_validation_compact_emission');
    assert.throws(() => validateBatchManifestShape({ ...manifest(), mode: 'dry_run_readiness' }), /manifest mode/u);
    assert.throws(() => validateBatchManifestShape({ ...manifest(), realArtifactsAuthorized: false }), /real compact artifacts/u);
    assert.throws(() => validateBatchManifestShape({ ...manifest(), allowedArtifactClass: 'death_events' }), /death_validation/u);
    assert.throws(() => validateBatchManifestShape({ ...manifest(), rawDataCaptured: true }), /rawDataCaptured/u);
    assert.throws(() => validateBatchManifestShape({ ...manifest(), finalFactsProduced: true }), /finalFactsProduced/u);
});

test('batch plan marks replay 010 and replay 011 as planned before filesystem access', () => {
    const plan = buildBatchPlan(manifest());
    assert.equal(plan.blockedReplayAudit.length, 0);
    assert.equal(plan.readyInputs.length, 2);
    assert.deepEqual(plan.readyInputs.map(input => input.replayId), ['replay_010', 'replay_011']);
    assert.equal(plan.perReplayStatus.every(row => row.status === 'planned'), true);
    assert.equal(plan.perReplayStatus.every(row => row.filesystemAccessAttempted === false), true);
    assert.equal(plan.perReplayStatus.every(row => row.statAttempted === false), true);
    assert.equal(plan.perReplayStatus.every(row => row.hashAttempted === false), true);
    assert.equal(plan.perReplayStatus.every(row => row.openReadStreamAttempted === false), true);
    assert.equal(plan.perReplayStatus.every(row => row.parseAttempted === false), true);
});

test('batch plan blocks replay outside allowlist before filesystem access', () => {
    const plan = buildBatchPlan(manifest({
        requestedReplays: [
            {
                replayId: 'replay_099',
                localPath: '.local/deadem/replays/inbox/partida_099.dem',
                requestedMode: 'death_validation_compact_emission'
            }
        ]
    }));
    assert.equal(plan.readyInputs.length, 0);
    assert.equal(plan.blockedReplayAudit.length, 1);
    assert.ok(plan.blockedReplayAudit[0].reasons.includes('not_in_explicit_allowlist'));
    assert.ok(plan.blockedReplayAudit[0].reasons.includes('replay_id_not_authorized_for_task_162'));
    assert.equal(plan.perReplayStatus[0].blockedBeforeFilesystemAccess, true);
});

test('batch plan blocks protected, bot, candidate, samples, and output replay paths', () => {
    const requestedReplays = [
        {
            replayId: 'replay_005',
            localPath: '.local/deadem/replays/inbox/partida_005.dem',
            requestedMode: 'death_validation_compact_emission'
        },
        {
            replayId: 'replay_006',
            localPath: '.local/deadem/replays/inbox/partida_006.dem',
            requestedMode: 'death_validation_compact_emission'
        },
        {
            replayId: 'replay_012',
            localPath: '.local/deadem/replays/inbox/partida_012.dem',
            requestedMode: 'death_validation_compact_emission'
        },
        {
            replayId: 'replay_010',
            localPath: 'samples/partida_010.dem',
            requestedMode: 'death_validation_compact_emission'
        },
        {
            replayId: 'replay_011',
            localPath: 'output/replays/partida_011.dem',
            requestedMode: 'death_validation_compact_emission'
        }
    ];
    const plan = buildBatchPlan(manifest({ requestedReplays }));
    assert.equal(plan.readyInputs.length, 0);
    assert.equal(plan.blockedReplayAudit.length, 5);
    assert.equal(plan.perReplayStatus.every(row => row.filesystemAccessAttempted === false), true);
    assert.equal(plan.perReplayStatus.every(row => row.parseAttempted === false), true);
});

test('batch summary output root is fixed to Task 162 path', () => {
    const root = validateBatchSummaryOutputRoot('output/local-replay-processing/batch-death-validation-compact-mini-pilot/');
    assert.equal(root.normalized, 'output/local-replay-processing/batch-death-validation-compact-mini-pilot/');
    assert.throws(
        () => validateBatchSummaryOutputRoot('output/local-replay-processing/death-validation-compact-emission/'),
        /summary output root must be exactly/u
    );
    assert.throws(
        () => validateBatchSummaryOutputRoot('output/replays/batch-death-validation/'),
        /summary output root must be exactly/u
    );
});

test('batch runner policy allows only death_validation and forbids richer surfaces', () => {
    assert.ok(FORBIDDEN_BATCH_OUTPUT_CLASSES.includes('death_events'));
    assert.ok(FORBIDDEN_BATCH_OUTPUT_CLASSES.includes('respawn_events'));
    assert.ok(FORBIDDEN_BATCH_OUTPUT_CLASSES.includes('killer_victim_assist_attribution'));
    assert.ok(FORBIDDEN_BATCH_OUTPUT_CLASSES.includes('field_values'));
    assert.ok(FORBIDDEN_BATCH_OUTPUT_CLASSES.includes('gameplay_interpretation'));
});

test('batch runner source does not implement update commands or unsafe replay handling', async () => {
    const source = await readFile('tools/emit-batch-death-validation-compact-artifacts.mjs', 'utf8');
    assert.equal(/\bgit\s+(pull|merge|cherry-pick|rebase)\b/iu.test(source), false);
    assert.equal(/\b(createHash|copyFile)\b/u.test(source), false);
    assert.equal(/death_events|respawn_events/u.test(source.includes('FORBIDDEN_BATCH_OUTPUT_CLASSES') ? '' : source), false);
    assert.equal(/rawDataCaptured:\s*true|finalFactsProduced:\s*true|gameplayInterpretationProduced:\s*true/u.test(source), false);
});
