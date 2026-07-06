import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ParserConfiguration } from 'deadem';
import {
    buildFirstMissingUpdate,
    buildHistoryComparison,
    buildMissingPacketContext,
    buildNearbyIndexContext,
    buildRegistryConfiguration,
    summarizeTargetHistory,
    validateInputPath,
    validateOutputRoots
} from '../tools/diagnose-replay-010-entity-2905-registry-and-packet-context.mjs';

const OUTPUT_ROOT = 'output/local-replay-processing/replay_010-entity-2905-registry-and-packet-context';

async function readOutput(name) {
    return JSON.parse(await readFile(`${OUTPUT_ROOT}/${name}`, 'utf8'));
}

function missingUpdateEvent(overrides = {}) {
    return {
        passMode: 'registry_diagnostic',
        packetOrdinal: 954,
        loop: 3,
        operation: 'UPDATE',
        commandId: 0,
        entityIndex: 2905,
        targetKind: 'target',
        previousEntityIndex: 2903,
        indexDelta: 1,
        registryStateBefore: 'missing',
        registryStateAfter: 'missing',
        classId: null,
        serial: null,
        className: null,
        readCounts: {
            beforeIndex: 120,
            afterIndex: 126,
            afterCommand: 128,
            afterAction: 128
        },
        payloadBits: 40,
        action: 'missing_update_failed',
        entityWasRegistered: false,
        fieldsMaterialized: false,
        placeholderOrFakeEntityCreated: false,
        packetMetrics: {
            updatedEntries: 4,
            entityDataBitLength: 512,
            serializedEntitiesByteLength: 2,
            payloadSizeCount: 4,
            payloadBitsSum: 200
        },
        entityIndexSequenceWindow: [],
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
        '.local/deadem/cache/local-replay-processing/replay_010/entity-2905-registry-and-packet-context/',
        'output/local-replay-processing/replay_010-entity-2905-registry-and-packet-context/'
    ));
    assert.throws(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/wrong/',
        'output/local-replay-processing/replay_010-entity-2905-registry-and-packet-context/'
    ), /local output root/);
});

test('ParserConfiguration keeps registry history opt-in and recovery disabled', () => {
    assert.equal(ParserConfiguration.DEFAULT.recovery, null);
    const configuration = buildRegistryConfiguration('registry_diagnostic');

    assert.equal(configuration.recovery.diagnoseEntityRegistryHistory, true);
    assert.deepEqual(configuration.recovery.entityRegistryHistoryTargets, [2905]);
    assert.deepEqual(configuration.recovery.entityRegistryHistoryNearbyRange, { start: 2900, end: 2910 });
    assert.equal(configuration.recovery.entityRegistryHistoryPassMode, 'registry_diagnostic');
    assert.equal(configuration.recovery.allowUnresolvedEntityReference, false);
    assert.equal(configuration.recovery.allowMissingClassBaseline, false);
});

test('registry summary classifies a first missing update to never registered entity', () => {
    const event = missingUpdateEvent();
    const summary = summarizeTargetHistory([event], 'registry_diagnostic');
    const firstMissing = buildFirstMissingUpdate(event);
    const packet = buildMissingPacketContext(event);

    assert.equal(summary.wasEverCreatedBeforeFailure, false);
    assert.equal(summary.wasEverRegisteredBeforeFailure, false);
    assert.equal(summary.wasDeletedLeftOrDeactivatedBeforeFailure, false);
    assert.equal(summary.firstReferenceIsMissingUpdate, true);
    assert.equal(summary.failureClassification, 'first_missing_update_to_never_registered_entity');
    assert.equal(firstMissing.found, true);
    assert.equal(packet.readCountsWithinEntityData, true);
    assert.equal(packet.boundaryOrTrailingSignsComparableToPacket953, false);
});

test('packet context detects boundary signs without using raw payloads', () => {
    const packet = buildMissingPacketContext(missingUpdateEvent({
        readCounts: {
            beforeIndex: 510,
            afterIndex: 518,
            afterCommand: 520,
            afterAction: 520
        }
    }));

    assert.equal(packet.readCountsWithinEntityData, false);
    assert.equal(packet.anyReadCountExceedsEntityData, true);
    assert.equal(packet.boundaryOrTrailingSignsComparableToPacket953, true);
    assert.equal(packet.rawPayloadsIncluded, false);
    assert.equal(packet.fieldValuesIncluded, false);
});

test('nearby index summary aggregates compact lifecycle metadata', () => {
    const nearby = buildNearbyIndexContext([
        missingUpdateEvent(),
        missingUpdateEvent({
            packetOrdinal: 900,
            loop: 1,
            operation: 'CREATE',
            entityIndex: 2904,
            targetKind: 'nearby',
            registryStateAfter: 'present_active',
            className: 'NearbyClass',
            serial: 7,
            action: 'create_register_and_apply',
            entityWasRegistered: true
        })
    ]);

    const index2904 = nearby.indexes.find(entry => entry.entityIndex === 2904);
    const index2905 = nearby.indexes.find(entry => entry.entityIndex === 2905);
    assert.equal(nearby.indexes.length, 11);
    assert.equal(index2904.everCreated, true);
    assert.equal(index2904.everRegistered, true);
    assert.equal(index2904.lastKnownClassName, 'NearbyClass');
    assert.equal(index2905.everUpdated, true);
});

test('history comparison reports unchanged target lifecycle when first missing matches', () => {
    const registrySummary = summarizeTargetHistory([missingUpdateEvent()], 'registry_diagnostic');
    const truncationSummary = summarizeTargetHistory([missingUpdateEvent({ passMode: 'truncation_registry_diagnostic' })], 'truncation_registry_diagnostic');
    const comparison = buildHistoryComparison({
        registrySummary,
        truncationSummary,
        registryEvents: [missingUpdateEvent()],
        truncationEvents: [missingUpdateEvent({ passMode: 'truncation_registry_diagnostic' })]
    });

    assert.equal(comparison.sameFirstMissingUpdate, true);
    assert.equal(comparison.sameLifecycleClassification, true);
    assert.equal(comparison.truncationChangesEntity2905RegistryHistory, false);
});

test('summary outputs diagnose entity 2905 without recovery or raw values', async () => {
    const defaultPass = await readOutput('default-pass-result.json');
    const registryPass = await readOutput('registry-diagnostic-pass-result.json');
    const truncationPass = await readOutput('truncation-registry-pass-result.json');
    const history = await readOutput('entity-2905-history-summary.json');
    const firstMissing = await readOutput('entity-2905-first-missing-update.json');
    const packet = await readOutput('missing-update-packet-context.json');
    const nearby = await readOutput('nearby-index-context-summary.json');
    const comparison = await readOutput('default-vs-truncation-history-comparison.json');
    const task120 = await readOutput('task120-comparison.json');
    const gate = await readOutput('entity-2905-context-gate.json');

    assert.equal(defaultPass.errorMessage, 'Unable to find an entity with index [ 2905 ]');
    assert.equal(registryPass.missingEntityRecoveryEnabled, false);
    assert.equal(registryPass.missingBaselineRecoveryEnabled, false);
    assert.equal(truncationPass.truncationEnabled, true);
    assert.equal(history.targetEntityIndex, 2905);
    assert.notEqual(history.failureClassification, 'entity_2905_history_incomplete');
    assert.equal(firstMissing.found, true);
    assert.equal(packet.accumulatedEntityIndex, 2905);
    assert.equal(nearby.indexes.length, 11);
    assert.equal(comparison.truncationChangesEntity2905RegistryHistory, false);
    assert.equal(task120.confirmsTask120, true);
    assert.match(gate.gate, /^local_replay_entity_2905_registry_and_packet_context_/);
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

test('Task 122 was not created by Task 121', () => {
    assert.equal(existsSync('tasks/specs/122.json'), false);
    assert.equal(existsSync('tasks/completed/122-diagnose-entity-2905-registry-and-packet-context.md'), false);
    assert.equal(existsSync('tasks/blocked/122-select-next-canonical-generalization-control.md'), false);
});
