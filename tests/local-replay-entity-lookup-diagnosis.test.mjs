import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import {
    auditImplementationSource,
    buildFailureLocalization,
    buildSafeAccessCapability,
    decideGate,
    normalizeSafeAccessCapability,
    validateFailureLocalization,
    validateInputPath,
    validateOutputRoots,
    validateProbeResult
} from '../tools/diagnose-local-replay-entity-lookup.mjs';

test('only partida_010 is authorized', () => {
    const result = validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010');
    assert.equal(result.relativePath, '.local/deadem/replays/inbox/partida_010.dem');
});

test('candidates 011 through 020 are rejected', () => {
    for (const id of ['011', '012', '013', '014', '015', '016', '017', '018', '019', '020']) {
        assert.throws(() => validateInputPath(`.local/deadem/replays/inbox/partida_${id}.dem`, `replay_${id}`), /unauthorized|outside|unsupported/);
    }
});

test('replay 005-like filename is rejected', () => {
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_005'), /unsupported|protected|unauthorized/);
});

test('006 through 008-like filenames are rejected', () => {
    for (const id of ['006', '007', '008']) {
        assert.throws(() => validateInputPath(`.local/deadem/replays/inbox/partida_${id}.dem`, `replay_${id}`), /unsupported|bot fixture|unauthorized/);
    }
});

test('samples path is rejected', () => {
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples/);
});

test('summary output root must be replay_010 entity lookup diagnosis', () => {
    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/entity-lookup-diagnosis/',
        'output/local-replay-processing/replay_010-entity-lookup-diagnosis/'
    );
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-entity-lookup-diagnosis/');
    assert.throws(() => validateOutputRoots('.local/deadem/cache/local-replay-processing/replay_010/entity-lookup-diagnosis/', 'output/local-replay-processing/replay_010-forward-source-artifacts/'), /summary output root/);
});

test('local root must be replay_010 entity lookup diagnosis', () => {
    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/entity-lookup-diagnosis/',
        'output/local-replay-processing/replay_010-entity-lookup-diagnosis/'
    );
    assert.equal(roots.local.relativePath, '.local/deadem/cache/local-replay-processing/replay_010/entity-lookup-diagnosis/');
    assert.throws(() => validateOutputRoots('.local/deadem/cache/local-replay-processing/replay_010/forward-source-artifacts/', 'output/local-replay-processing/replay_010-entity-lookup-diagnosis/'), /local output root/);
});

test('probe result schema requires operation flags', () => {
    assert.throws(() => validateProbeResult({ status: 'passed' }), /operation flag/);
    assert.equal(validateProbeResult({
        status: 'passed',
        usesNextTick: false,
        usesGetEntitiesByClassName: false,
        usesGetField: false,
        usesPawnControllerResolution: false
    }), true);
});

test('failure localization requires suspected layer', () => {
    assert.throws(() => validateFailureLocalization({}), /suspected layer/);
    assert.equal(validateFailureLocalization({ suspectedLayer: 'parser_advancement' }), true);
});

test('safe-access capability does not mark untested fields safe', () => {
    const capability = normalizeSafeAccessCapability(buildSafeAccessCapability([]));
    assert.equal(capability.controllerPrimitiveFieldsSafe, null);
    assert.equal(capability.controllerHandleFieldsSafe, null);
    assert.equal(capability.pawnPrimitiveFieldsSafe, null);
    assert.equal(capability.minimalSafeSnapshotPossible, null);
});

test('diagnosis gate cannot be success without failing operation or workaround', () => {
    const result = decideGate({
        failureLocalization: {
            firstFailingProbe: null,
            firstFailingOperation: null,
            suspectedLayer: 'unknown'
        },
        safeAccessCapability: {
            controllerPrimitiveFieldsSafe: null,
            minimalSafeSnapshotPossible: null
        },
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(result.gate, 'local_replay_entity_lookup_failure_diagnosis_blocked');
});

test('failure localization classifies nextTick failure as parser advancement', () => {
    const localization = buildFailureLocalization([{
        probeId: 'probe_2_next_tick_only',
        status: 'failed',
        errorMessage: 'Unable to find an entity with index [ 2905 ]',
        firstFailingOperation: 'nextTick',
        usesNextTick: true,
        usesGetEntitiesByClassName: false,
        usesGetField: false,
        usesPawnControllerResolution: false,
        ticksAttempted: 954,
        ticksAdvanced: 953,
        samplesProduced: 0
    }]);
    assert.equal(localization.suspectedLayer, 'parser_advancement');
    assert.equal(localization.nextRecommendedFixScope, 'parser_api_investigation');
});

test('branch audit detects synthetic replay-specific branch', () => {
    const source = 'function x(replayId) { if (replayId === "replay_010") return true; }';
    const result = auditImplementationSource(source, 'synthetic.mjs');
    assert.equal(result.passed, false);
    assert.equal(result.replaySpecificBranchFindings.length, 1);
});

test('branch audit detects executable samples fallback', () => {
    const source = 'createReadStream("samples/partida_010.dem")';
    const result = auditImplementationSource(source, 'synthetic.mjs');
    assert.equal(result.passed, false);
    assert.equal(result.samplesAppearsInExecutableCodePaths, true);
});

test('Task 106 does not exist', () => {
    assert.equal(existsSync('tasks/specs/106.json'), false);
    assert.equal(existsSync('tasks/blocked/106-select-next-canonical-generalization-control.md'), false);
});
