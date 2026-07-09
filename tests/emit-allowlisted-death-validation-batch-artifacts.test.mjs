import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    FORBIDDEN_ALLOWLISTED_BATCH_OUTPUT_SURFACES,
    buildAllowlistedBatchPlan,
    compareParityWithReference,
    runAllowlistedDeathValidationBatchEmission,
    validateAllowlistedBatchManifestShape,
    validateAllowlistedRunnerOutputRoot,
    validateAllowlistedSummaryOutputRoot
} from '../tools/emit-allowlisted-death-validation-batch-artifacts.mjs';

const allowedReplays = [
    { replayId: 'replay_001', localPath: 'samples/partida_001.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_002', localPath: 'samples/partida_002.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_003', localPath: 'samples/partida_003.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_004', localPath: 'samples/partida_004.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_009', localPath: 'samples/replay_009_normal.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_010', localPath: '.local/deadem/replays/inbox/partida_010.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_011', localPath: '.local/deadem/replays/inbox/partida_011.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_012', localPath: '.local/deadem/replays/inbox/partida_012.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_013', localPath: '.local/deadem/replays/inbox/partida_013.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_014', localPath: '.local/deadem/replays/inbox/partida_014.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_015', localPath: '.local/deadem/replays/inbox/partida_015.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_016', localPath: '.local/deadem/replays/inbox/partida_016.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_017', localPath: '.local/deadem/replays/inbox/partida_017.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_018', localPath: '.local/deadem/replays/inbox/partida_018.dem', requestedMode: 'death_validation_compact_emission' },
    { replayId: 'replay_019', localPath: '.local/deadem/replays/inbox/partida_019.dem', requestedMode: 'death_validation_compact_emission' }
];

function manifest(overrides = {}) {
    return {
        schemaVersion: 1,
        manifestId: 'exact_15_parity_allowlisted_death_validation_batch',
        runnerMode: 'parity',
        parityComparisonRequired: true,
        mode: 'death_validation_compact_emission',
        artifactClass: 'death_validation',
        replayProcessingAllowed: true,
        realArtifactEmissionAllowed: true,
        rawDataCaptured: false,
        finalFactsProduced: false,
        gameplayInterpretationProduced: false,
        eventCountMeaning: 'source_observed_counter_transition_candidate_count_not_final_death_fact',
        allowedReplays,
        blockedReplays: ['replay_005', 'replay_006', 'replay_007', 'replay_008', 'replay_020'],
        forbiddenOutputSurfaces: FORBIDDEN_ALLOWLISTED_BATCH_OUTPUT_SURFACES,
        ...overrides
    };
}

function batchManifest(overrides = {}) {
    return manifest({
        manifestId: 'future_batch_contract',
        runnerMode: 'batch',
        parityComparisonRequired: false,
        allowedReplays: [
            { replayId: 'replay_010', localPath: '.local/deadem/replays/inbox/partida_010.dem', requestedMode: 'death_validation_compact_emission' }
        ],
        ...overrides
    });
}

test('allowlisted batch manifest requires compact death_validation emission contract', () => {
    assert.equal(validateAllowlistedBatchManifestShape(manifest()).artifactClass, 'death_validation');
    assert.throws(() => validateAllowlistedBatchManifestShape({ ...manifest(), mode: 'dry_run' }), /manifest mode/u);
    assert.throws(() => validateAllowlistedBatchManifestShape({ ...manifest(), runnerMode: 'other' }), /runnerMode/u);
    assert.throws(() => validateAllowlistedBatchManifestShape({ ...manifest(), parityComparisonRequired: false }), /parityComparisonRequired/u);
    assert.throws(() => validateAllowlistedBatchManifestShape({ ...batchManifest(), parityComparisonRequired: true }), /parityComparisonRequired/u);
    assert.throws(() => validateAllowlistedBatchManifestShape({ ...manifest(), artifactClass: 'death_events' }), /death_validation/u);
    assert.throws(() => validateAllowlistedBatchManifestShape({ ...manifest(), replayProcessingAllowed: false }), /replay processing/u);
    assert.throws(() => validateAllowlistedBatchManifestShape({ ...manifest(), realArtifactEmissionAllowed: false }), /real artifact/u);
    assert.throws(() => validateAllowlistedBatchManifestShape({ ...manifest(), rawDataCaptured: true }), /rawDataCaptured/u);
    assert.throws(() => validateAllowlistedBatchManifestShape({ ...manifest(), finalFactsProduced: true }), /finalFactsProduced/u);
    assert.throws(
        () => validateAllowlistedBatchManifestShape({
            ...manifest(),
            eventCountMeaning: 'deaths'
        }),
        /eventCountMeaning/u
    );
});

test('allowlisted batch plan accepts all 15 manifest replays before filesystem access', () => {
    const plan = buildAllowlistedBatchPlan(manifest());
    assert.equal(plan.readyInputs.length, 15);
    assert.equal(plan.blockedReplayAudit.length, 0);
    assert.deepEqual(plan.readyInputs.map(input => input.replayId), allowedReplays.map(replay => replay.replayId));
    assert.equal(plan.perReplayStatus.every(row => row.status === 'planned'), true);
    assert.equal(plan.perReplayStatus.every(row => row.filesystemAccessAttempted === false), true);
    assert.equal(plan.perReplayStatus.every(row => row.statAttempted === false), true);
    assert.equal(plan.perReplayStatus.every(row => row.hashAttempted === false), true);
    assert.equal(plan.perReplayStatus.every(row => row.openReadStreamAttempted === false), true);
    assert.equal(plan.perReplayStatus.every(row => row.parseAttempted === false), true);
});

test('allowlisted batch plan blocks protected and non-manifest replays before filesystem access', () => {
    const plan = buildAllowlistedBatchPlan(manifest({
        requestedReplays: [
            { replayId: 'replay_005', localPath: '.local/deadem/replays/inbox/partida_005.dem', requestedMode: 'death_validation_compact_emission' },
            { replayId: 'replay_006', localPath: '.local/deadem/replays/inbox/partida_006.dem', requestedMode: 'death_validation_compact_emission' },
            { replayId: 'replay_020', localPath: '.local/deadem/replays/inbox/partida_020.dem', requestedMode: 'death_validation_compact_emission' },
            { replayId: 'replay_099', localPath: '.local/deadem/replays/inbox/partida_099.dem', requestedMode: 'death_validation_compact_emission' }
        ]
    }));
    assert.equal(plan.readyInputs.length, 0);
    assert.equal(plan.blockedReplayAudit.length, 4);
    assert.equal(plan.perReplayStatus.every(row => row.blockedBeforeFilesystemAccess), true);
    assert.equal(plan.perReplayStatus.every(row => row.openReadStreamAttempted === false), true);
    assert.ok(plan.blockedReplayAudit.some(row => row.replayId === 'replay_005' && row.reasons.includes('replay_005_globally_blocked')));
    assert.ok(plan.blockedReplayAudit.some(row => row.replayId === 'replay_006' && row.reasons.includes('replay_006_globally_blocked')));
    assert.ok(plan.blockedReplayAudit.some(row => row.replayId === 'replay_020' && row.reasons.includes('replay_020_globally_blocked')));
    assert.ok(plan.blockedReplayAudit.some(row => row.replayId === 'replay_099' && row.reasons.includes('not_in_manifest_allowlist')));
});

test('allowlisted batch plan blocks output/replays, absolute, traversal, and path mismatch before filesystem access', () => {
    const plan = buildAllowlistedBatchPlan(manifest({
        requestedReplays: [
            { replayId: 'replay_010', localPath: 'output/replays/replay_010.dem', requestedMode: 'death_validation_compact_emission' },
            { replayId: 'replay_011', localPath: '../partida_011.dem', requestedMode: 'death_validation_compact_emission' },
            { replayId: 'replay_012', localPath: 'C:/tmp/partida_012.dem', requestedMode: 'death_validation_compact_emission' }
        ]
    }));
    assert.equal(plan.readyInputs.length, 0);
    assert.equal(plan.blockedReplayAudit.length, 3);
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('output_replays_path_forbidden')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('path_traversal_forbidden')));
    assert.ok(plan.blockedReplayAudit.some(row => row.reasons.includes('absolute_path_forbidden')));
    assert.equal(plan.perReplayStatus.every(row => row.filesystemAccessAttempted === false), true);
});

test('allowlisted batch output root is fixed to Task 171 parity path', () => {
    const root = validateAllowlistedSummaryOutputRoot('output/local-replay-processing/allowlisted-death-validation-batch-parity/');
    assert.equal(root.normalized, 'output/local-replay-processing/allowlisted-death-validation-batch-parity/');
    assert.equal(
        validateAllowlistedRunnerOutputRoot('output/local-replay-processing/allowlisted-death-validation-batch-parity/', manifest()).normalized,
        'output/local-replay-processing/allowlisted-death-validation-batch-parity/'
    );
    assert.throws(
        () => validateAllowlistedSummaryOutputRoot('output/local-replay-processing/exact-15-death-validation-compact-emission/'),
        /summary output root must be exactly/u
    );
    assert.throws(
        () => validateAllowlistedSummaryOutputRoot('output/replays/death-validation/'),
        /summary output root must be exactly/u
    );
});

test('batch runner mode uses manifestId output root and does not require reference status', () => {
    const root = validateAllowlistedRunnerOutputRoot(
        'output/local-replay-processing/allowlisted-death-validation-batches/future_batch_contract/',
        batchManifest()
    );
    assert.equal(root.normalized, 'output/local-replay-processing/allowlisted-death-validation-batches/future_batch_contract/');
    assert.throws(
        () => validateAllowlistedRunnerOutputRoot('output/local-replay-processing/allowlisted-death-validation-batch-parity/', batchManifest()),
        /batch summary output root/u
    );
});

test('batch mode contract template can be validated without processing authorization', () => {
    const template = {
        ...batchManifest({
            replayProcessingAllowed: false,
            realArtifactEmissionAllowed: false,
            allowedReplays: []
        })
    };
    assert.equal(validateAllowlistedBatchManifestShape(template, { contractOnly: true }).runnerMode, 'batch');
    assert.throws(() => validateAllowlistedBatchManifestShape(template), /replay processing/u);
});

test('runner rejects missing parity reference and forbids reference for batch mode before processing', async () => {
    await assert.rejects(
        () => runAllowlistedDeathValidationBatchEmission({
            manifest: manifest(),
            summaryOutput: 'output/local-replay-processing/allowlisted-death-validation-batch-parity/'
        }),
        /requires referenceStatus/u
    );
    await assert.rejects(
        () => runAllowlistedDeathValidationBatchEmission({
            manifest: batchManifest(),
            summaryOutput: 'output/local-replay-processing/allowlisted-death-validation-batches/future_batch_contract/',
            referenceStatus: { perReplayStatus: [] }
        }),
        /must not receive referenceStatus/u
    );
});

test('parity comparison requires same replay ids, eventCount, duplicateKeyCount, and validationStatus', () => {
    const referenceStatus = {
        perReplayStatus: [
            { replayId: 'replay_010', eventCount: 45, duplicateKeyCount: 0, validationStatus: 'source_events_available_with_limitations' },
            { replayId: 'replay_011', eventCount: 80, duplicateKeyCount: 0, validationStatus: 'source_events_available_with_limitations' }
        ]
    };
    const emittedReplayStatus = [
        { replayId: 'replay_010', eventCount: 45, duplicateKeyCount: 0, validationStatus: 'source_events_available_with_limitations' },
        { replayId: 'replay_011', eventCount: 80, duplicateKeyCount: 0, validationStatus: 'source_events_available_with_limitations' }
    ];
    assert.equal(compareParityWithReference({ emittedReplayStatus, referenceStatus }).parityStatus, 'passed');
    assert.equal(compareParityWithReference({
        emittedReplayStatus: [{ ...emittedReplayStatus[0], eventCount: 46 }, emittedReplayStatus[1]],
        referenceStatus
    }).parityStatus, 'blocked');
});

test('allowlisted runner policy allows only death_validation and forbidden surfaces stay explicit', () => {
    assert.ok(FORBIDDEN_ALLOWLISTED_BATCH_OUTPUT_SURFACES.includes('death_events'));
    assert.ok(FORBIDDEN_ALLOWLISTED_BATCH_OUTPUT_SURFACES.includes('respawn_events'));
    assert.ok(FORBIDDEN_ALLOWLISTED_BATCH_OUTPUT_SURFACES.includes('attribution'));
    assert.ok(FORBIDDEN_ALLOWLISTED_BATCH_OUTPUT_SURFACES.includes('field_values'));
    assert.ok(FORBIDDEN_ALLOWLISTED_BATCH_OUTPUT_SURFACES.includes('gameplay_interpretation'));
});

test('allowlisted runner source preserves all-or-nothing writes and avoids unsafe operations', async () => {
    const source = await readFile('tools/emit-allowlisted-death-validation-batch-artifacts.mjs', 'utf8');
    assert.match(source, /const allEmitted =/u);
    assert.match(source, /if \(allEmitted\) \{/u);
    assert.match(source, /realArtifactsWrittenOnlyAfterAllReplaysPassed: true/u);
    assert.equal(/\bgit\s+(pull|merge|cherry-pick|rebase)\b/iu.test(source), false);
    assert.equal(/\b(createHash|copyFile)\b/u.test(source), false);
    assert.equal(/rawDataCaptured:\s*true|finalFactsProduced:\s*true|gameplayInterpretationProduced:\s*true/u.test(source), false);
});
