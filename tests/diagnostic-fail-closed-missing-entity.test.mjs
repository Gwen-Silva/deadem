import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ParserConfiguration } from 'deadem';
import Logger from '../packages/engine/src/core/Logger.js';
import Demo from '../packages/engine/src/data/Demo.js';
import Server from '../packages/engine/src/data/Server.js';
import EntityOperation from '../packages/engine/src/data/enums/EntityOperation.js';
import DemoMessageHandler, {
    buildCursorIndexContractProbe,
    recordMissingEntityDiagnosticFailClosed
} from '../packages/engine/src/handlers/DemoMessageHandler.js';
import StringTableHandler from '../packages/engine/src/handlers/StringTableHandler.js';
import ProtoProvider from '../packages/engine/src/providers/ProtoProvider.js';
import SchemaRegistry from '../packages/engine/src/SchemaRegistry.js';

function syntheticCursorLedger(recovery) {
    return {
        recovery,
        packetMetrics: {
            packetOrdinal: 954,
            updatedEntries: 34,
            entityDataBitLength: 5936
        },
        entries: [
            {
                loop: 32,
                accumulatedEntityIndex: 2717
            },
            {
                loop: 33,
                readCounts: {
                    beforeIndex: 5724,
                    afterIndex: 5734,
                    afterCommand: 5736,
                    afterAction: 5736
                },
                indexDelta: 187,
                accumulatedEntityIndex: 2905,
                commandId: EntityOperation.UPDATE.id,
                operation: EntityOperation.UPDATE.code,
                payloadBits: 193,
                action: 'missing_update_failed',
                registryStateBefore: 'missing',
                classId: null,
                serial: null,
                className: null
            }
        ]
    };
}

function syntheticEntry(cursorLedger) {
    return cursorLedger.entries[1];
}

function addSyntheticLifecycleEvent(recovery, event) {
    if (!Array.isArray(recovery.missingEntityLifecycleLedger)) {
        recovery.missingEntityLifecycleLedger = [];
    }

    recovery.missingEntityLifecycleLedger.push({
        eventSequence: recovery.missingEntityLifecycleLedger.length,
        packetOrdinal: 900,
        loop: recovery.missingEntityLifecycleLedger.length,
        updatedEntries: 1,
        operation: EntityOperation.UPDATE.code,
        commandId: EntityOperation.UPDATE.id,
        entityIndex: 2905,
        previousEntityIndex: 2904,
        indexDelta: 0,
        serial: 7,
        classId: 10,
        className: 'SyntheticEntity',
        payloadBits: 0,
        entityDataBitLength: 128,
        readCounts: {
            beforeIndex: 0,
            afterIndex: 1,
            afterCommand: 3,
            afterAction: 3
        },
        registryStateBefore: 'present_active',
        registryStateAfter: 'present_active',
        action: 'synthetic_prior_event',
        classLookupAttempted: false,
        classLookupSucceeded: false,
        baselineLookupAttempted: false,
        baselineLookupSucceeded: false,
        registerEntityAttempted: false,
        registerEntitySucceeded: false,
        fieldExtractionAttempted: false,
        fieldExtractionSucceeded: false,
        fieldsMaterialized: false,
        placeholderOrFakeEntityCreated: false,
        fakeFieldsCreated: false,
        syntheticRegistryStateCreated: false,
        rawDataCaptured: false,
        ...event
    });
}

function createSyntheticHandler() {
    const registry = new SchemaRegistry(new ProtoProvider({ nested: {} }));
    const demo = new Demo();

    demo.registerServer(new Server(1, 0, 1));

    const stringTableHandler = new StringTableHandler(registry, demo.stringTableContainer, Logger.NOOP);

    return {
        demo,
        handler: new DemoMessageHandler(registry, demo, stringTableHandler)
    };
}

function syntheticMissingUpdatePacket() {
    return {
        data: {
            updateBaseline: false,
            updatedEntries: 1,
            entityData: new Uint8Array([0]),
            serializedEntities: new Uint8Array()
        }
    };
}

test('missing entity diagnostic fail-closed is disabled by default', () => {
    assert.equal(ParserConfiguration.DEFAULT.recovery, null);

    const configuration = new ParserConfiguration({});
    assert.equal(configuration.recovery, null);

    const recoveryConfiguration = new ParserConfiguration({
        recovery: {}
    });
    assert.equal(recoveryConfiguration.recovery.diagnoseMissingEntityFailClosed, false);
    assert.equal(recoveryConfiguration.recovery.allowUnresolvedEntityReference, false);
    assert.equal(recoveryConfiguration.recovery.allowMissingClassBaseline, false);
});

test('diagnostic fail-closed is explicit opt-in and does not enable recovery', () => {
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true
        }
    });

    assert.equal(configuration.recovery.diagnoseMissingEntityFailClosed, true);
    assert.equal(configuration.recovery.allowUnresolvedEntityReference, false);
    assert.equal(configuration.recovery.allowMissingClassBaseline, false);
    assert.equal(configuration.recovery.allowEntityPacketBoundaryTruncation, false);
});

test('diagnostic fail-closed rejects incompatible recovery and truncation options', () => {
    assert.throws(() => new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true,
            allowUnresolvedEntityReference: true
        }
    }), /diagnoseMissingEntityFailClosed cannot be combined with options\.recovery\.allowUnresolvedEntityReference/);

    assert.throws(() => new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true,
            allowMissingClassBaseline: true
        }
    }), /diagnoseMissingEntityFailClosed cannot be combined with options\.recovery\.allowMissingClassBaseline/);

    assert.throws(() => new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true,
            allowEntityPacketBoundaryTruncation: true
        }
    }), /diagnoseMissingEntityFailClosed cannot be combined with options\.recovery\.allowEntityPacketBoundaryTruncation/);
});

test('missing entity fail-closed helper records no diagnostic without opt-in', () => {
    const configuration = new ParserConfiguration({
        recovery: {}
    });
    const cursorLedger = syntheticCursorLedger(configuration.recovery);

    const recorded = recordMissingEntityDiagnosticFailClosed(configuration.recovery, cursorLedger, syntheticEntry(cursorLedger), {
        operation: EntityOperation.UPDATE,
        index: 2905,
        errorMessage: 'Unable to find an entity with index [ 2905 ]'
    });

    assert.equal(recorded, false);
    assert.deepEqual(configuration.recovery.diagnostics, []);
});

test('missing entity fail-closed helper records compact metadata and no continuation', () => {
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true
        }
    });
    const cursorLedger = syntheticCursorLedger(configuration.recovery);

    const recorded = recordMissingEntityDiagnosticFailClosed(configuration.recovery, cursorLedger, syntheticEntry(cursorLedger), {
        operation: EntityOperation.UPDATE,
        index: 2905,
        errorMessage: 'Unable to find an entity with index [ 2905 ]'
    });

    assert.equal(recorded, true);
    assert.equal(configuration.recovery.diagnostics.length, 1);

    const diagnostic = configuration.recovery.diagnostics[0];
    assert.equal(diagnostic.type, 'missing_entity_fail_closed');
    assert.equal(diagnostic.passMode, 'diagnostic_fail_closed');
    assert.equal(diagnostic.packetOrdinal, 954);
    assert.equal(diagnostic.loop, 33);
    assert.equal(diagnostic.updatedEntries, 34);
    assert.equal(diagnostic.operation, 'UPDATE');
    assert.equal(diagnostic.entityIndex, 2905);
    assert.equal(diagnostic.previousEntityIndex, 2717);
    assert.equal(diagnostic.indexDelta, 187);
    assert.equal(diagnostic.commandId, EntityOperation.UPDATE.id);
    assert.equal(diagnostic.commandName, EntityOperation.UPDATE.code);
    assert.equal(diagnostic.payloadBits, 193);
    assert.deepEqual(diagnostic.readCounts, {
        beforeIndex: 5724,
        afterIndex: 5734,
        afterCommand: 5736,
        afterAction: 5736
    });
    assert.equal(diagnostic.entityDataBitLength, 5936);
    assert.equal(diagnostic.expectedEntityIndexByLocalFormula, 2905);
    assert.equal(diagnostic.indexFormulaCheck, true);
    assert.equal(diagnostic.commandReadBitWidth, 2);
    assert.equal(diagnostic.commandReadPosition, 5734);
    assert.equal(diagnostic.commandValue, EntityOperation.UPDATE.id);
    assert.equal(diagnostic.readCountWithinEntityData, true);
    assert.equal(diagnostic.compactConsistencyFlags.readCountsMonotonic, true);
    assert.equal(diagnostic.compactConsistencyFlags.readCountsWithinEntityData, true);
    assert.equal(diagnostic.compactConsistencyFlags.payloadBitsMatchesActionDelta, false);
    assert.equal(diagnostic.compactConsistencyFlags.payloadBitsComparable, false);
    assert.equal(diagnostic.compactConsistencyFlags.highDeltaSignal, false);
    assert.equal(diagnostic.compactConsistencyFlags.cursorContractSuspicion, false);
    assert.equal(diagnostic.cursorIndexDiagnosticClassificationCandidate, 'cursor_index_contract_consistent');
    assert.match(diagnostic.cursorIndexDiagnosticClassificationBasis, /internally consistent/);
    assert.equal(diagnostic.cursorIndexContractProbe.rawDataCaptured, false);
    assert.equal(diagnostic.nearbyOffsetSummary.rawDataCaptured, false);
    assert.equal(diagnostic.registryStateBefore, 'missing');
    assert.equal(diagnostic.registryStateAfter, 'missing');
    assert.equal(diagnostic.classId, null);
    assert.equal(diagnostic.serial, null);
    assert.equal(diagnostic.className, null);
    assert.equal(diagnostic.lifecycleEvidenceSummary.evidenceScope, 'replay_wide_local_parser_lifecycle_ledger');
    assert.equal(diagnostic.lifecycleEvidenceSummary.evidenceCompleteness, 'local_parser_prefix_until_first_missing_entity');
    assert.equal(diagnostic.lifecycleEvidenceSummary.targetEntityIndex, 2905);
    assert.equal(diagnostic.lifecycleEvidenceSummary.targetOperation, 'UPDATE');
    assert.equal(diagnostic.lifecycleEvidenceSummary.observedParserHistoryScope, 'local_parser_prefix_until_missing_entity_boundary');
    assert.equal(diagnostic.lifecycleEvidenceSummary.priorEntriesExamined, 1);
    assert.equal(diagnostic.lifecycleEvidenceSummary.sameEntityPriorEntryCount, 0);
    assert.equal(diagnostic.lifecycleEvidenceSummary.totalCompactEventsForTarget, 0);
    assert.equal(diagnostic.lifecycleEvidenceSummary.totalCompactEventsTracked, 0);
    assert.equal(diagnostic.lifecycleEvidenceSummary.createObserved, false);
    assert.equal(diagnostic.lifecycleEvidenceSummary.registerAttemptObserved, false);
    assert.equal(diagnostic.lifecycleEvidenceSummary.registerSuccessObserved, false);
    assert.equal(diagnostic.lifecycleEvidenceSummary.updateObservedBeforeBoundary, false);
    assert.equal(diagnostic.lifecycleEvidenceSummary.deleteOrLeaveObservedBeforeBoundary, false);
    assert.equal(diagnostic.lifecycleEvidenceSummary.removalLikeOperationObservedBeforeBoundary, false);
    assert.equal(diagnostic.lifecycleEvidenceSummary.repeatedIndexObserved, false);
    assert.equal(diagnostic.lifecycleEvidenceSummary.serialOrGenerationAmbiguous, false);
    assert.equal(diagnostic.lifecycleEvidenceSummary.registryStateBefore, 'missing');
    assert.equal(diagnostic.lifecycleEvidenceSummary.registryStateAfter, 'missing');
    assert.equal(diagnostic.lifecycleEvidenceSummary.previousEntityIndex, 2717);
    assert.equal(diagnostic.lifecycleEvidenceSummary.indexDelta, 187);
    assert.equal(diagnostic.lifecycleEvidenceSummary.readCountsWithinEntityData, true);
    assert.equal(diagnostic.lifecycleEvidenceSummary.replayWideHistoryKnown, true);
    assert.equal(diagnostic.lifecycleEvidenceSummary.rawDataCaptured, false);
    assert.equal(diagnostic.classificationCandidate, 'not_determined');
    assert.equal(diagnostic.classificationConfidence, 'not_applicable');
    assert.match(diagnostic.classificationBasis, /no replay-wide local parser lifecycle history/);
    assert.equal(diagnostic.diagnosticClassificationCandidate, 'not_determined');
    assert.equal(diagnostic.diagnosticClassificationConfidence, 'not_applicable');
    assert.match(diagnostic.diagnosticClassificationBasis, /no replay-wide local parser lifecycle history/);
    assert.ok(diagnostic.diagnosticClassificationLimitations.includes('not a game fact'));
    assert.equal(diagnostic.errorClass, 'MissingEntityReferenceError');
    assert.equal(diagnostic.errorMessage, 'Unable to find an entity with index [ 2905 ]');
    assert.equal(diagnostic.rawDataCaptured, false);
    assert.equal(diagnostic.fieldsMaterialized, false);
    assert.equal(diagnostic.placeholderOrFakeEntityCreated, false);
    assert.equal(diagnostic.parserContinuedAfterFailure, false);
    assert.equal(diagnostic.canonicalFactsProduced, false);
    assert.equal(diagnostic.defaultBehaviorChanged, false);
    assert.equal(diagnostic.recoveryAttempted, false);
    assert.equal(diagnostic.skipModeApplied, false);
    assert.equal(diagnostic.payloadSkipped, false);
    assert.equal(diagnostic.updateApplied, false);
    assert.equal(diagnostic.fakeFieldsCreated, false);
    assert.equal(diagnostic.syntheticRegistryStateCreated, false);
    assert.equal(Object.hasOwn(diagnostic, 'fieldValues'), false);
    assert.equal(Object.hasOwn(diagnostic, 'rawPayload'), false);
    assert.equal(Object.hasOwn(diagnostic, 'rawEntityData'), false);
    assert.equal(Object.hasOwn(diagnostic, 'rawSerializedEntities'), false);
    assert.equal(Object.hasOwn(diagnostic, 'stringValue'), false);
});

test('cursor index contract probe classifies local formula consistency', () => {
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true
        }
    });
    const cursorLedger = syntheticCursorLedger(configuration.recovery);
    const probe = buildCursorIndexContractProbe(cursorLedger, syntheticEntry(cursorLedger), {
        operation: EntityOperation.UPDATE,
        index: 2905
    });

    assert.equal(probe.expectedEntityIndexByLocalFormula, 2905);
    assert.equal(probe.indexFormulaCheck, true);
    assert.equal(probe.commandReadBitWidth, 2);
    assert.equal(probe.commandValue, EntityOperation.UPDATE.id);
    assert.equal(probe.commandName, EntityOperation.UPDATE.code);
    assert.equal(probe.compactConsistencyFlags.readCountsMonotonic, true);
    assert.equal(probe.compactConsistencyFlags.readCountsWithinEntityData, true);
    assert.equal(probe.diagnosticClassificationCandidate, 'cursor_index_contract_consistent');
    assert.equal(probe.rawDataCaptured, false);
});

test('cursor index contract probe classifies high indexDelta as internally consistent when other checks pass', () => {
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true
        }
    });
    const cursorLedger = syntheticCursorLedger(configuration.recovery);

    cursorLedger.packetMetrics.packetOrdinal = 1052;
    cursorLedger.packetMetrics.entityDataBitLength = 5848;
    cursorLedger.entries[0].loop = 27;
    cursorLedger.entries[0].accumulatedEntityIndex = 2681;
    Object.assign(cursorLedger.entries[1], {
        loop: 28,
        indexDelta: 2942,
        accumulatedEntityIndex: 5624,
        payloadBits: 133,
        readCounts: {
            beforeIndex: 5212,
            afterIndex: 5226,
            afterCommand: 5228,
            afterAction: 5228
        }
    });

    const probe = buildCursorIndexContractProbe(cursorLedger, cursorLedger.entries[1], {
        operation: EntityOperation.UPDATE,
        index: 5624
    });

    assert.equal(probe.indexFormulaCheck, true);
    assert.equal(probe.expectedEntityIndexByLocalFormula, 5624);
    assert.equal(probe.compactConsistencyFlags.highDeltaSignal, true);
    assert.equal(probe.compactConsistencyFlags.cursorContractSuspicion, false);
    assert.equal(probe.diagnosticClassificationCandidate, 'index_delta_high_but_internally_consistent');
    assert.match(probe.diagnosticClassificationBasis, /indexDelta is high/);
});

test('cursor index contract probe classifies comparable payloadBits divergence', () => {
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true
        }
    });
    const cursorLedger = syntheticCursorLedger(configuration.recovery);
    const entry = syntheticEntry(cursorLedger);

    entry.action = 'normal_update_apply';
    entry.payloadBits = 16;
    entry.readCounts.afterAction = entry.readCounts.afterCommand + 8;

    const probe = buildCursorIndexContractProbe(cursorLedger, entry, {
        operation: EntityOperation.UPDATE,
        index: 2905
    });

    assert.equal(probe.compactConsistencyFlags.payloadBitsComparable, true);
    assert.equal(probe.compactConsistencyFlags.payloadBitsMatchesActionDelta, false);
    assert.equal(probe.compactConsistencyFlags.cursorContractSuspicion, true);
    assert.equal(probe.diagnosticClassificationCandidate, 'payloadbits_contract_suspected');
});

test('cursor index contract probe classifies suspicious command position', () => {
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true
        }
    });
    const cursorLedger = syntheticCursorLedger(configuration.recovery);
    const entry = syntheticEntry(cursorLedger);

    entry.readCounts.afterCommand = entry.readCounts.afterIndex + 3;
    entry.readCounts.afterAction = entry.readCounts.afterCommand;

    const probe = buildCursorIndexContractProbe(cursorLedger, entry, {
        operation: EntityOperation.UPDATE,
        index: 2905
    });

    assert.equal(probe.commandReadBitWidth, 3);
    assert.equal(probe.compactConsistencyFlags.commandPositionPlausibilitySignal, false);
    assert.equal(probe.compactConsistencyFlags.cursorContractSuspicion, true);
    assert.equal(probe.diagnosticClassificationCandidate, 'command_decode_position_suspected');
});

test('missing entity lifecycle ledger classifies created then missing registry state candidate', () => {
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true
        }
    });
    addSyntheticLifecycleEvent(configuration.recovery, {
        operation: EntityOperation.CREATE.code,
        commandId: EntityOperation.CREATE.id,
        action: 'create_register_and_apply',
        classLookupAttempted: true,
        classLookupSucceeded: true,
        baselineLookupAttempted: true,
        baselineLookupSucceeded: true,
        registerEntityAttempted: true,
        registerEntitySucceeded: true,
        fieldExtractionAttempted: true,
        fieldExtractionSucceeded: true,
        registryStateAfter: 'present_active'
    });
    const cursorLedger = syntheticCursorLedger(configuration.recovery);

    const recorded = recordMissingEntityDiagnosticFailClosed(configuration.recovery, cursorLedger, syntheticEntry(cursorLedger), {
        operation: EntityOperation.UPDATE,
        index: 2905,
        errorMessage: 'Unable to find an entity with index [ 2905 ]'
    });

    assert.equal(recorded, true);
    const diagnostic = configuration.recovery.diagnostics[0];
    assert.equal(diagnostic.diagnosticClassificationCandidate, 'created_then_missing_registry_state_candidate');
    assert.equal(diagnostic.diagnosticClassificationConfidence, 'medium');
    assert.match(diagnostic.diagnosticClassificationBasis, /CREATE\/register evidence/);
    assert.ok(diagnostic.diagnosticClassificationLimitations.includes('not a game fact'));
    assert.equal(diagnostic.lifecycleEvidenceSummary.createObserved, true);
    assert.equal(diagnostic.lifecycleEvidenceSummary.registerSuccessObserved, true);
    assert.equal(diagnostic.lifecycleEvidenceSummary.fieldExtractionAttemptedBeforeBoundary, true);
    assert.equal(diagnostic.lifecycleEvidenceSummary.rawDataCaptured, false);
    assert.equal(diagnostic.recoveryAttempted, false);
    assert.equal(diagnostic.skipModeApplied, false);
    assert.equal(diagnostic.payloadSkipped, false);
    assert.equal(diagnostic.placeholderOrFakeEntityCreated, false);
    assert.equal(diagnostic.fakeFieldsCreated, false);
    assert.equal(diagnostic.syntheticRegistryStateCreated, false);
    assert.equal(diagnostic.parserContinuedAfterFailure, false);
    assert.equal(diagnostic.canonicalFactsProduced, false);
});

test('missing entity lifecycle ledger classifies prior local removal-like operation without game semantic claim', () => {
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true
        }
    });
    addSyntheticLifecycleEvent(configuration.recovery, {
        operation: EntityOperation.LEAVE.code,
        commandId: EntityOperation.LEAVE.id,
        action: 'leave_or_deactivate',
        registryStateAfter: 'present_inactive'
    });
    const cursorLedger = syntheticCursorLedger(configuration.recovery);

    const recorded = recordMissingEntityDiagnosticFailClosed(configuration.recovery, cursorLedger, syntheticEntry(cursorLedger), {
        operation: EntityOperation.UPDATE,
        index: 2905,
        errorMessage: 'Unable to find an entity with index [ 2905 ]'
    });

    assert.equal(recorded, true);
    const diagnostic = configuration.recovery.diagnostics[0];
    assert.equal(diagnostic.diagnosticClassificationCandidate, 'removed_before_missing_update_candidate');
    assert.equal(diagnostic.diagnosticClassificationConfidence, 'low');
    assert.match(diagnostic.diagnosticClassificationBasis, /does not claim game destruction/);
    assert.ok(diagnostic.diagnosticClassificationLimitations.includes('not Source 2 semantics'));
    assert.equal(diagnostic.lifecycleEvidenceSummary.deleteOrLeaveObservedBeforeBoundary, true);
    assert.equal(diagnostic.lifecycleEvidenceSummary.removalLikeOperationObservedBeforeBoundary, true);
    assert.equal(diagnostic.rawDataCaptured, false);
    assert.equal(Object.hasOwn(diagnostic, 'fieldValues'), false);
    assert.equal(Object.hasOwn(diagnostic, 'rawPayload'), false);
    assert.equal(Object.hasOwn(diagnostic, 'rawEntityData'), false);
    assert.equal(Object.hasOwn(diagnostic, 'rawSerializedEntities'), false);
    assert.equal(Object.hasOwn(diagnostic, 'stringValue'), false);
});

test('default handler behavior still throws missing entity without diagnostics', () => {
    const { demo, handler } = createSyntheticHandler();

    assert.throws(() => handler.handleSvcPacketEntities(syntheticMissingUpdatePacket()), /Unable to find an entity with index \[ 0 \]/);
    assert.equal(demo.getEntity(0), null);
});

test('diagnostic handler mode records boundary and still throws fail-closed', () => {
    const { demo, handler } = createSyntheticHandler();
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true
        }
    });

    assert.throws(() => handler.handleSvcPacketEntities(syntheticMissingUpdatePacket(), 0, 0, -1, false, configuration.recovery), /Unable to find an entity with index \[ 0 \]/);
    assert.equal(demo.getEntity(0), null);
    assert.equal(configuration.recovery.diagnostics.length, 1);

    const diagnostic = configuration.recovery.diagnostics[0];
    assert.equal(diagnostic.type, 'missing_entity_fail_closed');
    assert.equal(diagnostic.packetOrdinal, 1);
    assert.equal(diagnostic.loop, 0);
    assert.equal(diagnostic.updatedEntries, 1);
    assert.equal(diagnostic.operation, 'UPDATE');
    assert.equal(diagnostic.entityIndex, 0);
    assert.equal(diagnostic.previousEntityIndex, null);
    assert.equal(diagnostic.indexDelta, 0);
    assert.equal(diagnostic.payloadBits, null);
    assert.deepEqual(diagnostic.readCounts, {
        beforeIndex: 0,
        afterIndex: 6,
        afterCommand: 8,
        afterAction: 8
    });
    assert.equal(diagnostic.entityDataBitLength, 8);
    assert.equal(diagnostic.registryStateBefore, 'missing');
    assert.equal(diagnostic.lifecycleEvidenceSummary.evidenceScope, 'replay_wide_local_parser_lifecycle_ledger');
    assert.equal(diagnostic.lifecycleEvidenceSummary.sameEntityPriorEntryCount, 0);
    assert.equal(diagnostic.lifecycleEvidenceSummary.totalCompactEventsTracked, 0);
    assert.equal(diagnostic.lifecycleEvidenceSummary.rawDataCaptured, false);
    assert.equal(diagnostic.classificationCandidate, 'not_determined');
    assert.equal(diagnostic.classificationConfidence, 'not_applicable');
    assert.equal(diagnostic.rawDataCaptured, false);
    assert.equal(diagnostic.fieldsMaterialized, false);
    assert.equal(diagnostic.placeholderOrFakeEntityCreated, false);
    assert.equal(diagnostic.parserContinuedAfterFailure, false);
    assert.equal(diagnostic.canonicalFactsProduced, false);
    assert.equal(diagnostic.recoveryAttempted, false);
    assert.equal(diagnostic.skipModeApplied, false);
    assert.equal(diagnostic.payloadSkipped, false);
    assert.equal(diagnostic.updateApplied, false);
    assert.equal(diagnostic.fakeFieldsCreated, false);
    assert.equal(diagnostic.syntheticRegistryStateCreated, false);
    assert.equal(diagnostic.cursorIndexContractProbe.rawDataCaptured, false);
    assert.equal(diagnostic.cursorIndexContractProbe.diagnosticClassificationCandidate, 'cursor_index_contract_consistent');
});
