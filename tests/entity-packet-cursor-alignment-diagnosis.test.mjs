import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { ParserConfiguration } from 'deadem';
import { decodeNextEntryAtOffset } from '../packages/engine/src/handlers/DemoMessageHandler.js';
import {
    auditImplementationSources,
    buildCursorModelComparison,
    buildLedgerSummary,
    decideGate,
    validateInputPath,
    validateOutputRoots
} from '../tools/diagnose-replay-010-entity-packet-cursor-alignment.mjs';

function syntheticCursorDiagnostic() {
    const entries = Array.from({ length: 6 }, (_, offset) => {
        const loop = 18 + offset;
        return {
            loop,
            readCounts: {
                beforeIndex: 100 + offset * 10,
                afterIndex: 104 + offset * 10,
                afterCommand: 106 + offset * 10,
                afterAction: 110 + offset * 10
            },
            indexDelta: 1,
            accumulatedEntityIndex: 200 + offset,
            commandId: 0,
            operation: 'UPDATE',
            payloadBits: 4,
            payloadSizeIteratorAvailable: true,
            action: 'normal_update',
            registryStateBefore: 'present',
            entityTouched: true,
            baselineTouched: false,
            fieldsTouched: true,
            registerEntityTouched: false
        };
    });
    entries[4] = {
        ...entries[4],
        loop: 22,
        accumulatedEntityIndex: 6679,
        payloadBits: 266,
        action: 'skipped_missing_update_payload',
        registryStateBefore: 'missing',
        entityTouched: false,
        fieldsTouched: false,
        readCounts: {
            beforeIndex: 5950,
            afterIndex: 5956,
            afterCommand: 5958,
            afterAction: 6224
        }
    };
    entries[5] = {
        ...entries[5],
        loop: 23,
        commandId: 2,
        operation: 'CREATE',
        accumulatedEntityIndex: 570655505,
        classId: 139,
        serial: 35052,
        classIdSizeBits: 10,
        className: 'CCitadel_Ability_Frank_ShockTarget2',
        action: 'create_attempt_out_of_range',
        failureStage: 'entity_constructor',
        entityTouched: false,
        baselineTouched: false,
        fieldsTouched: false,
        registerEntityTouched: false,
        readCounts: {
            beforeIndex: 6224,
            afterIndex: 6258,
            afterCommand: 6260,
            afterAction: 6295
        }
    };
    return {
        packetMetrics: {
            updatedEntries: 42,
            entityDataBitLength: 10000,
            serializedEntitiesByteLength: 100,
            payloadSizeIteratorAvailable: true,
            payloadSizeCount: 42,
            payloadBitsSum: 1234,
            startLoop: 0,
            entriesIteratedToBoundary: 24
        },
        boundary: {
            loop: 23,
            boundaryStartReadCount: 6224,
            previousEntityIndex: 6679,
            errorMessage: 'entity index out of range'
        },
        windowDefault: {
            startLoop: 18,
            endLoop: 23,
            entries
        },
        cursorModelComparison: {
            currentModel: {
                internallyConsistent: true
            },
            alternativeBoundaryModelB: {
                plausibleCandidateCount: 2,
                plausibleCandidates: []
            }
        },
        observedFacts: ['fact'],
        simulations: ['sim'],
        hypotheses: ['hypothesis'],
        undetermined: ['unknown']
    };
}

test('diagnostic cursor alignment is disabled by default', () => {
    const configuration = new ParserConfiguration({});
    assert.equal(configuration.recovery, null);
});

test('diagnostic cursor alignment is opt-in', () => {
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseEntityPacketCursorAlignment: true
        }
    });
    assert.equal(configuration.recovery.diagnoseEntityPacketCursorAlignment, true);
});

test('diagnostic cursor alignment rejects invalid option type', () => {
    assert.throws(() => new ParserConfiguration({
        recovery: {
            diagnoseEntityPacketCursorAlignment: 'yes'
        }
    }), /must be a boolean/);
});

test('ledger summary captures loop 22 skip and loop 23 create', () => {
    const summary = buildLedgerSummary(syntheticCursorDiagnostic());
    assert.equal(summary.ledgerWindow.entriesCaptured, 6);
    assert.equal(summary.loop22Skip.entityIndex, 6679);
    assert.equal(summary.loop22Skip.internallyConsistentWithCurrentModel, true);
    assert.equal(summary.loop23Create.classId, 139);
    assert.equal(summary.loop23Create.registerEntityTouched, false);
});

test('cursor model comparison preserves simulations and hypotheses', () => {
    const comparison = buildCursorModelComparison(syntheticCursorDiagnostic());
    assert.equal(comparison.comparison.alternativeBoundaryModelB.plausibleCandidateCount, 2);
    assert.deepEqual(comparison.observedFacts, ['fact']);
    assert.deepEqual(comparison.hypotheses, ['hypothesis']);
    assert.deepEqual(comparison.notDetermined, ['unknown']);
});

test('gate passes when ledger and model comparison are complete', () => {
    const ledgerSummary = buildLedgerSummary(syntheticCursorDiagnostic());
    const cursorModelComparison = buildCursorModelComparison(syntheticCursorDiagnostic());
    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        recoveryPass: { advancedPastTask105Failure: true, boundaryReached: true },
        ledgerSummary,
        cursorModelComparison,
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_entity_packet_cursor_alignment_diagnosed');
});

test('nearby decoder can produce a plausible synthetic entry', () => {
    const decoded = decodeNextEntryAtOffset(new Uint8Array([0]), -1, 0);
    assert.equal(decoded.entityIndex, 0);
    assert.equal(decoded.operation, 'UPDATE');
    assert.equal(decoded.plausibleEntityIndex, true);
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

test('samples and output/replays paths are rejected', () => {
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples/);
    assert.throws(() => validateInputPath('output/replays/replay_010/partida_010.dem', 'replay_010'), /output\/replays/);
});

test('output roots are fixed to cursor alignment paths', () => {
    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/entity-packet-cursor-alignment/',
        'output/local-replay-processing/replay_010-entity-packet-cursor-alignment/'
    );
    assert.equal(roots.local.relativePath, '.local/deadem/cache/local-replay-processing/replay_010/entity-packet-cursor-alignment/');
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-entity-packet-cursor-alignment/');
});

test('branch audit detects synthetic replay-specific engine branch', async () => {
    const root = '.local/codex/108/synthetic-replay-branch';
    await import('node:fs/promises').then(async fs => {
        for (const file of [
            'packages/engine/src/ParserConfiguration.js',
            'packages/engine/src/handlers/DemoMessageHandler.js'
        ]) {
            await fs.mkdir(`${root}/${file.split('/').slice(0, -1).join('/')}`, { recursive: true });
            await fs.writeFile(`${root}/${file}`, file.endsWith('DemoMessageHandler.js') ? 'if (replayId === "replay_010") {}' : '');
        }
    });
    const result = await auditImplementationSources(root);
    assert.equal(result.passed, false);
    assert.equal(result.replaySpecificBranchFindings.length, 1);
});

test('Task 119 does not exist', () => {
    assert.equal(existsSync('tasks/specs/119.json'), false);
    assert.equal(existsSync('tasks/blocked/119-select-next-canonical-generalization-control.md'), false);
});
