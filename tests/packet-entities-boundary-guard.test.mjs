import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ParserConfiguration } from 'deadem';
import { assertEntityPacketBoundary } from '../packages/engine/src/handlers/DemoMessageHandler.js';
import {
    buildBoundaryGuardDiagnostic,
    buildTask118Comparison,
    validateInputPath,
    validateOutputRoots
} from '../tools/evaluate-replay-010-packet-entities-boundary-guard.mjs';

const OUTPUT_ROOT = 'output/local-replay-processing/replay_010-packet-entities-boundary-guard';

async function readOutput(name) {
    return JSON.parse(await readFile(`${OUTPUT_ROOT}/${name}`, 'utf8'));
}

function boundaryRecovery() {
    const diagnostics = [];
    return {
        diagnoseEntityPacketBoundaryGuard: true,
        recordEntityPacketBoundaryCrossing: diagnostic => diagnostics.push({ type: 'entity_packet_boundary_crossing', ...diagnostic }),
        diagnostics
    };
}

function cursorLedger() {
    return {
        packetMetrics: {
            packetOrdinal: 953,
            entityDataBitLength: 5344
        },
        entries: []
    };
}

test('path guards reject unauthorized replay and output roots', () => {
    assert.doesNotThrow(() => validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010'));
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_010'), /protected replay path/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_011.dem', 'replay_010'), /unauthorized replay input|candidate outside/);
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples path is forbidden/);
    assert.throws(() => validateInputPath('output/replays/replay_010.dem', 'replay_010'), /output\/replays path is forbidden/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_011'), /unsupported replay id/);

    assert.doesNotThrow(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/packet-entities-boundary-guard/',
        'output/local-replay-processing/replay_010-packet-entities-boundary-guard/'
    ));
    assert.throws(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/wrong/',
        'output/local-replay-processing/replay_010-packet-entities-boundary-guard/'
    ), /local output root/);
});

test('ParserConfiguration keeps boundary guard opt-in and disabled by default', () => {
    assert.equal(ParserConfiguration.DEFAULT.recovery, null);
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseEntityPacketBoundaryGuard: true
        }
    });
    assert.equal(configuration.recovery.diagnoseEntityPacketBoundaryGuard, true);
    assert.equal(configuration.recovery.allowUnresolvedEntityReference, false);
    assert.equal(configuration.recovery.allowMissingClassBaseline, false);
});

test('assertEntityPacketBoundary is fail-closed and records after-index crossing', () => {
    const recovery = boundaryRecovery();
    assert.throws(() => assertEntityPacketBoundary(recovery, cursorLedger(), {
        loop: 27,
        violationStage: 'after_index',
        readCount: 5349,
        beforeIndexReadCount: 5343,
        afterIndexReadCount: 5349,
        previousEntityIndex: 2598,
        indexDelta: 0,
        accumulatedEntityIndex: 2599
    }), /entity packet boundary crossed/);
    assert.equal(recovery.diagnostics.length, 1);
    assert.equal(recovery.diagnostics[0].loop, 27);
    assert.equal(recovery.diagnostics[0].violationStage, 'after_index');
    assert.equal(recovery.diagnostics[0].bitsBeyondEntityData, 5);
    assert.equal(recovery.diagnostics[0].entityIndex, null);
    assert.equal(recovery.diagnostics[0].operation, null);
    assert.equal(recovery.diagnostics[0].phantomEntriesPrevented, true);
    assert.equal(recovery.diagnostics[0].fakeEntityCreated, false);
    assert.equal(recovery.diagnostics[0].fieldsMaterializedAfterBoundary, false);
});

test('assertEntityPacketBoundary permits in-bound reads and catches before-index boundary', () => {
    const recovery = boundaryRecovery();
    assert.equal(assertEntityPacketBoundary(recovery, cursorLedger(), {
        loop: 26,
        violationStage: 'after_action',
        readCount: 5343,
        afterActionReadCount: 5343
    }), false);
    assert.throws(() => assertEntityPacketBoundary(recovery, cursorLedger(), {
        loop: 28,
        violationStage: 'before_index',
        readCount: 5344
    }), /entity packet boundary crossed/);
    assert.equal(recovery.diagnostics[0].violationStage, 'before_index');
});

test('summary outputs show default failure and guard boundary failure before missing entity', async () => {
    const defaultPass = await readOutput('default-pass-result.json');
    const guardPass = await readOutput('guard-pass-result.json');
    const diagnostic = await readOutput('boundary-guard-diagnostic.json');

    assert.equal(defaultPass.expectedFailureReproduced, true);
    assert.equal(defaultPass.errorMessage, 'Unable to find an entity with index [ 2905 ]');
    assert.equal(guardPass.boundaryFailureReproduced, true);
    assert.equal(guardPass.reachedOriginalMissingEntity2905, false);
    assert.equal(diagnostic.guardTriggered, true);
    assert.equal(diagnostic.packetOrdinal, 953);
    assert.equal(diagnostic.loop, 27);
    assert.equal(diagnostic.violationStage, 'after_index');
    assert.equal(diagnostic.entityDataBitLength, 5344);
    assert.equal(diagnostic.afterIndexReadCount, 5349);
    assert.equal(diagnostic.fakeEntityCreated, false);
    assert.equal(diagnostic.fieldsMaterializedAfterBoundary, false);
});

test('Task 118 comparison and gate match the expected boundary', async () => {
    const comparison = await readOutput('task118-comparison.json');
    const phantomAudit = await readOutput('phantom-entry-prevention-audit.json');
    const gate = await readOutput('boundary-guard-gate.json');

    assert.equal(comparison.matchesTask118ExpectedBoundary, true);
    assert.equal(comparison.observedFromTask118.loop26AfterActionReadCount, 5343);
    assert.equal(comparison.observedFromTask118.loop27AfterIndexReadCount, 5349);
    assert.equal(comparison.bitbufferSyntheticResultReused, true);
    assert.equal(phantomAudit.phantomEntriesPrevented, true);
    assert.deepEqual(phantomAudit.expectedPhantomLoops, [27, 28, 29]);
    assert.equal(gate.gate, 'local_replay_packet_entities_boundary_guard_diagnosed');
    assert.equal(gate.defaultBehaviorChanged, false);
    assert.equal(gate.recoveryAddedOrPromoted, false);
    assert.equal(gate.canonicalFactsProduced, false);
});

test('builder helpers require exact Task 118 boundary details', () => {
    const diagnostic = buildBoundaryGuardDiagnostic({
        guardPass: {
            guardEnabled: true,
            boundaryFailureReproduced: true,
            reachedOriginalMissingEntity2905: false,
            errorMessage: 'entity packet boundary crossed'
        },
        diagnostic: {
            packetOrdinal: 953,
            loop: 27,
            entityDataBitLength: 5344,
            violationStage: 'after_index',
            beforeIndexReadCount: 5343,
            afterIndexReadCount: 5349,
            bitsBeyondEntityData: 5,
            phantomEntriesPrevented: true,
            fakeEntityCreated: false,
            fieldsMaterializedAfterBoundary: false,
            recoveryAttempted: false
        }
    });
    const comparison = buildTask118Comparison({
        boundaryDiagnostic: diagnostic,
        task118Inventory: {
            entityDataBitLength: 5344,
            loop26AfterActionReadCount: 5343,
            loopRows: [{
                loop: 27,
                readCounts: { afterIndex: 5349 },
                indexReadBoundary: { endsBeyondEntityDataBitLength: true }
            }]
        },
        task118Classification: {
            classifications: [
                { loop: 28, classification: 'out_of_buffer_reads' },
                { loop: 29, classification: 'out_of_buffer_reads' }
            ]
        },
        task118Gate: { gate: 'local_replay_packet_953_buffer_boundary_diagnosed' },
        bitbufferBehavior: { readsBeyondEndCanAdvanceWithoutThrowing: true }
    });
    assert.equal(comparison.matchesTask118ExpectedBoundary, true);
});

test('Task 121 was not created by Task 119', () => {
    assert.equal(existsSync('tasks/specs/121.json'), false);
    assert.equal(existsSync('tasks/completed/121-evaluate-packet-entities-boundary-guard.md'), false);
    assert.equal(existsSync('tasks/blocked/121-select-next-canonical-generalization-control.md'), false);
});
