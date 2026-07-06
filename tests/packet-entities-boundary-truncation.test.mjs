import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ParserConfiguration } from 'deadem';
import { maybeTruncateEntityPacketBoundary } from '../packages/engine/src/handlers/DemoMessageHandler.js';
import {
    buildTask119Comparison,
    buildTruncationDiagnostic,
    validateInputPath,
    validateOutputRoots
} from '../tools/evaluate-replay-010-packet-entities-boundary-truncation.mjs';

const OUTPUT_ROOT = 'output/local-replay-processing/replay_010-packet-entities-boundary-truncation';

async function readOutput(name) {
    return JSON.parse(await readFile(`${OUTPUT_ROOT}/${name}`, 'utf8'));
}

function truncationRecovery() {
    const diagnostics = [];
    return {
        allowEntityPacketBoundaryTruncation: true,
        recordEntityPacketBoundaryTruncation: diagnostic => diagnostics.push({ type: 'entity_packet_boundary_truncation', ...diagnostic }),
        diagnostics
    };
}

function cursorLedger(entryCount = 27) {
    return {
        packetMetrics: {
            packetOrdinal: 953,
            entityDataBitLength: 5344,
            updatedEntries: 30
        },
        entries: Array.from({ length: entryCount }, (_, index) => ({ loop: index }))
    };
}

test('path guards reject unauthorized replay and output roots', () => {
    assert.doesNotThrow(() => validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010'));
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_010'), /protected replay path/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_011.dem', 'replay_010'), /candidate outside/);
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples path is forbidden/);
    assert.throws(() => validateInputPath('output/replays/replay_010.dem', 'replay_010'), /output\/replays path is forbidden/);
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_011'), /unsupported replay id/);

    assert.doesNotThrow(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/packet-entities-boundary-truncation/',
        'output/local-replay-processing/replay_010-packet-entities-boundary-truncation/'
    ));
    assert.throws(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/wrong/',
        'output/local-replay-processing/replay_010-packet-entities-boundary-truncation/'
    ), /local output root/);
});

test('ParserConfiguration keeps boundary truncation opt-in and disabled by default', () => {
    assert.equal(ParserConfiguration.DEFAULT.recovery, null);
    const configuration = new ParserConfiguration({
        recovery: {
            allowEntityPacketBoundaryTruncation: true
        }
    });
    assert.equal(configuration.recovery.allowEntityPacketBoundaryTruncation, true);
    assert.equal(configuration.recovery.diagnoseEntityPacketBoundaryGuard, false);
    assert.equal(configuration.recovery.allowUnresolvedEntityReference, false);
    assert.equal(configuration.recovery.allowMissingClassBaseline, false);
});

test('maybeTruncateEntityPacketBoundary records truncation before an unsafe entry read', () => {
    const recovery = truncationRecovery();
    const truncated = maybeTruncateEntityPacketBoundary(recovery, cursorLedger(), {
        loop: 27,
        currentReadCount: 5343,
        previousEntityIndex: 2598
    });

    assert.equal(truncated, true);
    assert.equal(recovery.diagnostics.length, 1);
    assert.equal(recovery.diagnostics[0].loop, 27);
    assert.equal(recovery.diagnostics[0].currentReadCount, 5343);
    assert.equal(recovery.diagnostics[0].remainingBits, 1);
    assert.equal(recovery.diagnostics[0].minimumEntryBitsRequired, 8);
    assert.equal(recovery.diagnostics[0].entriesProcessedBeforeTruncation, 27);
    assert.equal(recovery.diagnostics[0].entriesSkippedByTruncation, 3);
    assert.equal(recovery.diagnostics[0].phantomEntriesPrevented, true);
    assert.equal(recovery.diagnostics[0].fakeEntityCreated, false);
    assert.equal(recovery.diagnostics[0].fieldsMaterializedAfterBoundary, false);
    assert.equal(recovery.diagnostics[0].semanticUpdatesAppliedAfterTruncation, false);
});

test('maybeTruncateEntityPacketBoundary permits a minimal in-bound entry header', () => {
    const recovery = truncationRecovery();
    const truncated = maybeTruncateEntityPacketBoundary(recovery, cursorLedger(), {
        loop: 27,
        currentReadCount: 5336,
        previousEntityIndex: 2598
    });

    assert.equal(truncated, false);
    assert.equal(recovery.diagnostics.length, 0);
});

test('summary outputs show default failure, guard boundary, and truncation result', async () => {
    const defaultPass = await readOutput('default-pass-result.json');
    const guardPass = await readOutput('guard-pass-result.json');
    const truncationPass = await readOutput('truncation-pass-result.json');
    const diagnostic = await readOutput('truncation-diagnostic.json');

    assert.equal(defaultPass.expectedFailureReproduced, true);
    assert.equal(defaultPass.errorMessage, 'Unable to find an entity with index [ 2905 ]');
    assert.equal(guardPass.boundaryFailureReproduced, true);
    assert.equal(diagnostic.truncationTriggered, true);
    assert.equal(diagnostic.packetOrdinal, 953);
    assert.equal(diagnostic.loop, 27);
    assert.equal(diagnostic.currentReadCount, 5343);
    assert.equal(diagnostic.remainingBits, 1);
    assert.equal(diagnostic.entriesSkippedByTruncation, 3);
    assert.equal(truncationPass.missingEntityRecoveryEnabled, false);
    assert.equal(truncationPass.missingBaselineRecoveryEnabled, false);
    assert.equal(truncationPass.fakeEntityCreated, false);
    assert.equal(truncationPass.fieldsMaterializedAfterBoundary, false);
    assert.equal(truncationPass.canonicalFactsProduced, false);
});

test('Task 119 comparison, phantom audit, and gate are consistent', async () => {
    const comparison = await readOutput('task119-comparison.json');
    const phantomAudit = await readOutput('phantom-entry-prevention-audit.json');
    const gate = await readOutput('boundary-truncation-gate.json');

    assert.equal(comparison.matchesTask119BoundaryContext, true);
    assert.equal(comparison.truncationUsesSameBoundaryBeforeFailClosedRead, true);
    assert.equal(comparison.observedFromTask119.guardAfterIndexReadCount, 5349);
    assert.equal(phantomAudit.phantomEntriesPrevented, true);
    assert.deepEqual(phantomAudit.expectedPhantomLoops, [27, 28, 29]);
    assert.equal(phantomAudit.loops27To29AppliedAsSemanticUpdates, false);
    assert.match(gate.gate, /^local_replay_packet_entities_boundary_truncation_/);
    assert.equal(gate.defaultBehaviorChanged, false);
    assert.equal(gate.missingEntityRecoveryAdded, false);
    assert.equal(gate.outOfRangeCreateRecoveryAdded, false);
    assert.equal(gate.canonicalFactsProduced, false);
});

test('builder helpers require exact Task 119 boundary details', () => {
    const truncationDiagnostic = buildTruncationDiagnostic({
        truncationPass: {
            truncationEnabled: true,
            originalMissingEntity2905Reached: false,
            errorMessage: ''
        },
        diagnostic: {
            packetOrdinal: 953,
            loop: 27,
            entityDataBitLength: 5344,
            currentReadCount: 5343,
            remainingBits: 1,
            updatedEntries: 30,
            entriesProcessedBeforeTruncation: 27,
            entriesSkippedByTruncation: 3,
            minimumEntryBitsRequired: 8,
            reason: 'remaining_bits_less_than_minimum_entry_header',
            phantomEntriesPrevented: true,
            fakeEntityCreated: false,
            fieldsMaterializedAfterBoundary: false
        }
    });
    const comparison = buildTask119Comparison({
        guardDiagnostic: {
            packetOrdinal: 953,
            loop: 27,
            violationStage: 'after_index'
        },
        truncationDiagnostic,
        defaultPass: {
            expectedFailureReproduced: true,
            errorMessage: 'Unable to find an entity with index [ 2905 ]'
        },
        task119Gate: { gate: 'local_replay_packet_entities_boundary_guard_diagnosed' },
        task119GuardDiagnostic: {
            packetOrdinal: 953,
            loop: 27,
            violationStage: 'after_index',
            beforeIndexReadCount: 5343,
            afterIndexReadCount: 5349,
            entityDataBitLength: 5344
        }
    });

    assert.equal(truncationDiagnostic.truncationTriggered, true);
    assert.equal(comparison.matchesTask119BoundaryContext, true);
});

test('Task 124 was not created by Task 120', () => {
    assert.equal(existsSync('tasks/specs/124.json'), false);
    assert.equal(existsSync('tasks/completed/124-evaluate-packet-entities-boundary-truncation.md'), false);
    assert.equal(existsSync('tasks/blocked/124-select-next-canonical-generalization-control.md'), false);
});
