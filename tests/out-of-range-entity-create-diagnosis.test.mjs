import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { ParserConfiguration, EntityOperation } from 'deadem';
import {
    recordOutOfRangeEntityCreateBoundary
} from '../packages/engine/src/handlers/DemoMessageHandler.js';
import {
    auditImplementationSources,
    buildBoundaryDiagnostic,
    decideGate,
    summarizeWarningTail,
    validateInputPath,
    validateOutputRoots
} from '../tools/diagnose-replay-010-out-of-range-entity-create.mjs';

test('diagnostic recovery is disabled by default', () => {
    const configuration = new ParserConfiguration({});
    assert.equal(configuration.recovery, null);
    assert.deepEqual(configuration.recoveryDiagnostics, []);
});

test('diagnostic recovery is opt-in and records separately from warnings', () => {
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseOutOfRangeEntityCreate: true
        }
    });
    assert.equal(configuration.recovery.diagnoseOutOfRangeEntityCreate, true);
    assert.deepEqual(configuration.recoveryWarnings, []);
    assert.deepEqual(configuration.recoveryDiagnostics, []);
});

test('diagnostic recovery rejects invalid option type', () => {
    assert.throws(() => new ParserConfiguration({
        recovery: {
            diagnoseOutOfRangeEntityCreate: 'yes'
        }
    }), /must be a boolean/);
});

test('out-of-range create diagnostic records and does not recover', () => {
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseOutOfRangeEntityCreate: true
        }
    });
    const recorded = recordOutOfRangeEntityCreateBoundary(configuration.recovery, {
        messageUpdatedEntries: 42,
        loop: 7,
        entityIndex: 20000,
        operation: EntityOperation.CREATE,
        classId: 3,
        serial: 9,
        classIdSizeBits: 10,
        payloadBits: 12,
        payloadSizeIteratorAvailable: true,
        className: 'SyntheticClass',
        readCounts: {
            beforeIndex: 1,
            afterIndex: 2,
            afterCommand: 4,
            beforeClassId: 4,
            afterClassId: 14,
            afterSerial: 31,
            beforeEntityConstructor: 32
        },
        failureStage: 'entity_constructor',
        baselineLookupAttempted: false,
        registerEntityAttempted: false,
        fieldExtractionAttempted: false
    }, new Error('entity index out of range'));
    assert.equal(recorded, true);
    assert.equal(configuration.recoveryDiagnostics.length, 1);
    assert.equal(configuration.recoveryDiagnostics[0].operation, 'CREATE');
    assert.equal(configuration.recoveryDiagnostics[0].observedFacts.recoveryAttemptedForThisBoundary, false);
});

test('out-of-range create diagnostic does nothing without opt-in', () => {
    const recorded = recordOutOfRangeEntityCreateBoundary(null, {
        operation: EntityOperation.CREATE
    }, new Error('entity index out of range'));
    assert.equal(recorded, false);
});

test('boundary diagnostic separates facts, hypotheses, and not determined', () => {
    const boundary = buildBoundaryDiagnostic({
        recoveryPass: {
            boundaryError: { message: 'entity index out of range' },
            currentTick: 2862,
            ticksAdvanced: 2863,
            advancedPastTask105Failure: true
        },
        diagnostics: [{
            type: 'out_of_range_entity_create_boundary',
            messageUpdatedEntries: 10,
            loop: 2,
            entityIndex: 20000,
            operation: 'CREATE',
            classId: 1,
            serial: 2,
            classIdSizeBits: 10,
            payloadBits: 50,
            payloadSizeIteratorAvailable: true,
            className: 'SyntheticClass',
            readCounts: {},
            failureStage: 'entity_constructor',
            baselineLookupAttempted: false,
            registerEntityAttempted: false,
            fieldExtractionAttempted: false,
            observedFacts: { recoveryAttemptedForThisBoundary: false },
            hypotheses: ['h'],
            undetermined: ['u']
        }]
    });
    assert.equal(boundary.boundaryObserved, true);
    assert.equal(boundary.occurredBeforeBaselineLookup, true);
    assert.equal(boundary.occurredBeforeRegisterEntity, true);
    assert.equal(boundary.occurredBeforeFieldExtraction, true);
    assert.deepEqual(boundary.hypotheses, ['h']);
    assert.deepEqual(boundary.notDetermined, ['u']);
});

test('warning tail summary stays compact', () => {
    const warnings = Array.from({ length: 30 }, (_, index) => ({ type: 'unresolved_entity_reference', index }));
    const summary = summarizeWarningTail(warnings);
    assert.equal(summary.totalWarningCount, 30);
    assert.equal(summary.warningsTail.length, 20);
    assert.equal(summary.unresolvedEntityReferenceCount, 30);
    assert.equal(summary.fullWarningLog, null);
});

test('diagnosed gate requires default reproduction, recovery progress, and located boundary', () => {
    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        recoveryPass: { advancedPastTask105Failure: true, boundaryReached: true },
        boundaryDiagnostic: {
            boundaryObserved: true,
            occurredBeforeBaselineLookup: true,
            occurredBeforeRegisterEntity: true,
            occurredBeforeFieldExtraction: true,
            fakeEntityCreated: false,
            fieldsMaterialized: false
        },
        warningSummary: {
            recoveryCreatedEntities: false,
            recoveryMaterializedFields: false
        },
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_out_of_range_entity_create_boundary_diagnosed');
});

test('partial gate is used when boundary is reached without full diagnostic', () => {
    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        recoveryPass: { advancedPastTask105Failure: true, boundaryReached: true },
        boundaryDiagnostic: {
            boundaryObserved: false,
            occurredBeforeBaselineLookup: null,
            occurredBeforeRegisterEntity: null,
            occurredBeforeFieldExtraction: null,
            fakeEntityCreated: false,
            fieldsMaterialized: false
        },
        warningSummary: {
            recoveryCreatedEntities: false,
            recoveryMaterializedFields: false
        },
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_out_of_range_entity_create_boundary_partially_diagnosed');
});

test('canary input validation only allows partida_010', () => {
    const result = validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010');
    assert.equal(result.relativePath, '.local/deadem/replays/inbox/partida_010.dem');
});

test('replay 005-like filename is rejected', () => {
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_005'), /unsupported|protected|unauthorized/);
});

test('006 through 008-like filenames are rejected', () => {
    for (const id of ['006', '007', '008']) {
        assert.throws(() => validateInputPath(`.local/deadem/replays/inbox/partida_${id}.dem`, `replay_${id}`), /unsupported|bot fixture|unauthorized/);
    }
});

test('candidates 011 through 020 are rejected', () => {
    for (const id of ['011', '012', '013', '014', '015', '016', '017', '018', '019', '020']) {
        assert.throws(() => validateInputPath(`.local/deadem/replays/inbox/partida_${id}.dem`, `replay_${id}`), /unauthorized|outside|unsupported/);
    }
});

test('samples path is rejected', () => {
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples/);
});

test('output roots are fixed to out-of-range diagnosis paths', () => {
    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/out-of-range-entity-create-diagnosis/',
        'output/local-replay-processing/replay_010-out-of-range-entity-create-diagnosis/'
    );
    assert.equal(roots.local.relativePath, '.local/deadem/cache/local-replay-processing/replay_010/out-of-range-entity-create-diagnosis/');
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-out-of-range-entity-create-diagnosis/');
});

test('branch audit detects synthetic replay-specific engine branch', async () => {
    const root = '.local/codex/107/synthetic-replay-branch';
    await import('node:fs/promises').then(async fs => {
        for (const file of [
            'packages/engine/src/ParserConfiguration.js',
            'packages/engine/src/ParserEngine.js',
            'packages/engine/src/stream/DemoStreamPacketAnalyzer.js',
            'packages/engine/src/handlers/DemoMessageHandler.js',
            'packages/deadem/index.js'
        ]) {
            await fs.mkdir(`${root}/${file.split('/').slice(0, -1).join('/')}`, { recursive: true });
            await fs.writeFile(`${root}/${file}`, file.endsWith('ParserEngine.js') ? 'if (replayId === "replay_010") {}' : '');
        }
    });
    const result = await auditImplementationSources(root);
    assert.equal(result.passed, false);
    assert.equal(result.replaySpecificBranchFindings.length, 1);
});

test('Task 117 does not exist', () => {
    assert.equal(existsSync('tasks/specs/117.json'), false);
    assert.equal(existsSync('tasks/blocked/117-select-next-canonical-generalization-control.md'), false);
});
