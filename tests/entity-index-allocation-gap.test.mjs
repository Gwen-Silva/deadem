import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ParserConfiguration } from 'deadem';
import {
    buildAllocationConfiguration,
    buildCreateGapAnalysis,
    buildDefaultVsTruncationComparison,
    buildEntity2905ProvenanceSummary,
    buildEntityIndexRangeSummary,
    buildPacket954IndexSequenceAnalysis,
    validateInputPath,
    validateOutputRoots
} from '../tools/diagnose-replay-010-entity-index-allocation-gap.mjs';

const OUTPUT_ROOT = 'output/local-replay-processing/replay_010-entity-index-allocation-gap';

async function readOutput(name) {
    return JSON.parse(await readFile(`${OUTPUT_ROOT}/${name}`, 'utf8'));
}

function allocationEvent(overrides = {}) {
    return {
        passMode: 'allocation_diagnostic',
        packetOrdinal: 954,
        loop: 33,
        operation: 'UPDATE',
        commandId: 0,
        entityIndex: 2905,
        targetKind: 'target',
        previousEntityIndex: 2717,
        indexDelta: 187,
        registryStateBefore: 'missing',
        registryStateAfter: 'missing',
        classId: null,
        serial: null,
        className: null,
        readCounts: {
            beforeIndex: 4900,
            afterIndex: 4908,
            afterCommand: 4910,
            afterAction: 4910
        },
        payloadBits: 193,
        classLookupAttempted: false,
        classLookupSucceeded: false,
        baselineLookupAttempted: false,
        baselineLookupSucceeded: false,
        registerEntityAttempted: false,
        registerEntitySucceeded: false,
        fieldExtractionAttempted: false,
        fieldExtractionSucceeded: false,
        action: 'missing_update_failed',
        failureStage: null,
        fakeEntityCreated: false,
        fieldsMaterialized: false,
        packetMetrics: {
            updatedEntries: 34,
            entityDataBitLength: 5936,
            serializedEntitiesByteLength: 16,
            payloadSizeCount: 34,
            payloadBitsSum: 2000
        },
        entityIndexSequenceWindow: [
            { loop: 30, operation: 'UPDATE', entityIndex: 2621, indexDelta: 12, payloadBits: 40, action: 'normal_update_apply', readCounts: {} },
            { loop: 31, operation: 'UPDATE', entityIndex: 2632, indexDelta: 10, payloadBits: 50, action: 'normal_update_apply', readCounts: {} },
            { loop: 32, operation: 'UPDATE', entityIndex: 2717, indexDelta: 84, payloadBits: 60, action: 'normal_update_apply', readCounts: {} },
            { loop: 33, operation: 'UPDATE', entityIndex: 2905, indexDelta: 187, payloadBits: 193, action: 'missing_update_failed', readCounts: {} }
        ],
        ...overrides
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
        '.local/deadem/cache/local-replay-processing/replay_010/entity-index-allocation-gap/',
        'output/local-replay-processing/replay_010-entity-index-allocation-gap/'
    ));
    assert.throws(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/wrong/',
        'output/local-replay-processing/replay_010-entity-index-allocation-gap/'
    ), /local output root/);
});

test('ParserConfiguration keeps allocation diagnostics opt-in and recovery disabled', () => {
    assert.equal(ParserConfiguration.DEFAULT.recovery, null);
    const configuration = buildAllocationConfiguration('allocation_diagnostic');

    assert.equal(configuration.recovery.diagnoseEntityIndexAllocation, true);
    assert.equal(configuration.recovery.entityIndexAllocationTargetIndex, 2905);
    assert.deepEqual(configuration.recovery.entityIndexAllocationRange, { start: 2880, end: 2920 });
    assert.equal(configuration.recovery.entityIndexAllocationPassMode, 'allocation_diagnostic');
    assert.equal(configuration.recovery.entityIndexAllocationIncludeAllCreates, true);
    assert.equal(configuration.recovery.allowUnresolvedEntityReference, false);
    assert.equal(configuration.recovery.allowMissingClassBaseline, false);
});

test('range summary marks entity 2905 as an update reference inside a create gap', () => {
    const events = [
        allocationEvent({ packetOrdinal: 900, loop: 1, operation: 'CREATE', entityIndex: 2900, targetKind: 'range', registerEntitySucceeded: true, registryStateAfter: 'present_active', className: 'CNPC_Trooper' }),
        allocationEvent({ packetOrdinal: 901, loop: 2, operation: 'CREATE', entityIndex: 2901, targetKind: 'range', registerEntitySucceeded: true, registryStateAfter: 'present_active', className: 'CNPC_Trooper' }),
        allocationEvent()
    ];
    const range = buildEntityIndexRangeSummary(events);

    const index2905 = range.indexes.find(entry => entry.entityIndex === 2905);
    assert.equal(range.indexes.length, 41);
    assert.deepEqual(range.everCreatedIndexes, [2900, 2901]);
    assert.equal(index2905.gapStatus, 'gap_with_update_reference');
    assert.equal(range.entity2905PartOfContinuousGap, true);
});

test('provenance summary detects no CREATE/register/class/baseline path for 2905', () => {
    const provenance = buildEntity2905ProvenanceSummary([
        allocationEvent()
    ], {
        failureClassification: 'first_missing_update_to_never_registered_entity'
    });

    assert.equal(provenance.createObservedFor2905, false);
    assert.equal(provenance.registerEntityAttemptedFor2905, false);
    assert.equal(provenance.classLookupAttemptedFor2905, false);
    assert.equal(provenance.baselineLookupAttemptedFor2905, false);
    assert.equal(provenance.bestClassification, 'never_registered_entity_with_create_gap');
});

test('create gap analysis distinguishes no local class or baseline failure for 2905', () => {
    const events = [
        allocationEvent({ packetOrdinal: 900, loop: 1, operation: 'CREATE', entityIndex: 2900, targetKind: 'range', registerEntitySucceeded: true, registryStateAfter: 'present_active', className: 'CNPC_Trooper' }),
        allocationEvent({ packetOrdinal: 901, loop: 2, operation: 'CREATE', entityIndex: 2901, targetKind: 'range', registerEntitySucceeded: true, registryStateAfter: 'present_active', className: 'CNPC_Trooper' }),
        allocationEvent({ packetOrdinal: 902, loop: 3, operation: 'CREATE', entityIndex: 2902, targetKind: 'range', registerEntitySucceeded: true, registryStateAfter: 'present_active', className: 'CNPC_Trooper' }),
        allocationEvent()
    ];
    const range = buildEntityIndexRangeSummary(events);
    const provenance = buildEntity2905ProvenanceSummary(events, {
        failureClassification: 'first_missing_update_to_never_registered_entity'
    });
    const analysis = buildCreateGapAnalysis(range, provenance, events);

    assert.equal(analysis.createRangeAppearsToEndBefore2905, true);
    assert.equal(analysis.baselineOrClassFailureCouldPrevent2905Registration, false);
    assert.equal(analysis.filteredCreateOrSkipCouldRegisterWithoutFields, false);
    assert.equal(analysis.compatibleWithNeverRegisteredEntityWithoutEarlierError, true);
});

test('packet 954 sequence records monotonic indexes and bounded read counts', () => {
    const packet = buildPacket954IndexSequenceAnalysis([allocationEvent()], {
        packetOrdinal: 954,
        loop: 33,
        indexDelta: 187,
        previousEntityIndex: 2717,
        accumulatedEntityIndex: 2905,
        payloadBits: 193,
        updatedEntries: 34,
        entityDataBitLength: 5936,
        payloadSizeCount: 34,
        readCounts: {
            beforeIndex: 4900,
            afterIndex: 4908,
            afterCommand: 4910,
            afterAction: 4910
        }
    });

    assert.equal(packet.packetOrdinal, 954);
    assert.equal(packet.monotonicIncreasingIndexes, true);
    assert.equal(packet.jumpTo2905.indexDelta, 187);
    assert.equal(packet.loop30To33PayloadAndReadCountsLocallyBounded, true);
    assert.notEqual(packet.indexStreamMisalignmentAssessment, 'index_stream_misalignment_supported');
});

test('default versus truncation comparison ignores pass mode-only differences', () => {
    const defaultEvents = [allocationEvent()];
    const truncationEvents = [allocationEvent({ passMode: 'truncation_allocation_diagnostic' })];
    const rangeSummary = buildEntityIndexRangeSummary(defaultEvents);
    const truncationRangeSummary = buildEntityIndexRangeSummary(truncationEvents);
    const provenanceSummary = buildEntity2905ProvenanceSummary(defaultEvents, { failureClassification: 'first_missing_update_to_never_registered_entity' });
    const truncationProvenanceSummary = buildEntity2905ProvenanceSummary(truncationEvents, { failureClassification: 'first_missing_update_to_never_registered_entity' });
    const sequenceAnalysis = buildPacket954IndexSequenceAnalysis(defaultEvents, {});
    const truncationSequenceAnalysis = buildPacket954IndexSequenceAnalysis(truncationEvents, {});
    const comparison = buildDefaultVsTruncationComparison({
        allocationEvents: defaultEvents,
        truncationEvents,
        rangeSummary,
        truncationRangeSummary,
        provenanceSummary,
        truncationProvenanceSummary,
        sequenceAnalysis,
        truncationSequenceAnalysis,
        allocationPass: { expectedFailureReproduced: true },
        truncationPass: { expectedFailureReproduced: true }
    });

    assert.equal(comparison.defaultStillReachesMissingUpdate2905, true);
    assert.equal(comparison.truncationStillReachesMissingUpdate2905, true);
});

test('summary outputs diagnose allocation gap without recovery or raw values', async () => {
    const defaultPass = await readOutput('default-pass-result.json');
    const allocationPass = await readOutput('allocation-diagnostic-pass-result.json');
    const truncationPass = await readOutput('truncation-allocation-pass-result.json');
    const range = await readOutput('entity-index-range-summary.json');
    const provenance = await readOutput('entity-2905-provenance-summary.json');
    const gap = await readOutput('create-gap-analysis.json');
    const packet = await readOutput('packet-954-index-sequence-analysis.json');
    const comparison = await readOutput('default-vs-truncation-allocation-comparison.json');
    const task121 = await readOutput('task121-comparison.json');
    const gate = await readOutput('entity-index-allocation-gate.json');

    assert.equal(defaultPass.errorMessage, 'Unable to find an entity with index [ 2905 ]');
    assert.equal(allocationPass.missingEntityRecoveryEnabled, false);
    assert.equal(allocationPass.missingBaselineRecoveryEnabled, false);
    assert.equal(truncationPass.truncationEnabled, true);
    assert.equal(range.indexes.length, 41);
    assert.equal(provenance.createObservedFor2905, false);
    assert.equal(provenance.registerEntityAttemptedFor2905, false);
    assert.equal(gap.compatibleWithNeverRegisteredEntityWithoutEarlierError, true);
    assert.equal(packet.packetOrdinal, 954);
    assert.equal(comparison.defaultStillReachesMissingUpdate2905, true);
    assert.equal(comparison.truncationStillReachesMissingUpdate2905, true);
    assert.equal(task121.confirmsTask121Exactly, true);
    assert.match(gate.gate, /^local_replay_entity_index_allocation_gap_/);
    assert.equal(gate.defaultBehaviorChanged, false);
    assert.equal(gate.automaticRecoveryAdded, false);
    assert.equal(gate.canonicalFactsProduced, false);
});

test('protection audit rejects raw artifacts and default recovery', async () => {
    const protection = await readOutput('protection-audit.json');
    const branch = await readOutput('replay-specific-branch-audit.json');

    assert.equal(protection.replay005Accessed, false);
    assert.equal(protection.bots006To008Processed, false);
    assert.equal(protection.candidates011To020Processed, false);
    assert.equal(protection.rawEntityDataCommitted, false);
    assert.equal(protection.rawPayloadsCommitted, false);
    assert.equal(protection.fieldValuesCommitted, false);
    assert.equal(protection.missingEntityRecoveryEnabled, false);
    assert.equal(protection.missingBaselineRecoveryEnabled, false);
    assert.equal(protection.truncationDefaultEnabled, false);
    assert.equal(branch.replaySpecificBranchFound, false);
});

test('Task 123 was not created by Task 122', () => {
    assert.equal(existsSync('tasks/specs/123.json'), false);
    assert.equal(existsSync('tasks/completed/123-diagnose-entity-index-allocation-gap.md'), false);
    assert.equal(existsSync('tasks/blocked/123-select-next-canonical-generalization-control.md'), false);
});
