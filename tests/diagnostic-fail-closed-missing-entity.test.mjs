import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ParserConfiguration } from 'deadem';
import Logger from '../packages/engine/src/core/Logger.js';
import Demo from '../packages/engine/src/data/Demo.js';
import Server from '../packages/engine/src/data/Server.js';
import EntityOperation from '../packages/engine/src/data/enums/EntityOperation.js';
import DemoMessageHandler, { recordMissingEntityDiagnosticFailClosed } from '../packages/engine/src/handlers/DemoMessageHandler.js';
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
                operation: EntityOperation.UPDATE.code,
                payloadBits: 193,
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
    assert.equal(diagnostic.payloadBits, 193);
    assert.deepEqual(diagnostic.readCounts, {
        beforeIndex: 5724,
        afterIndex: 5734,
        afterCommand: 5736,
        afterAction: 5736
    });
    assert.equal(diagnostic.entityDataBitLength, 5936);
    assert.equal(diagnostic.registryStateBefore, 'missing');
    assert.equal(diagnostic.registryStateAfter, 'missing');
    assert.equal(diagnostic.classId, null);
    assert.equal(diagnostic.serial, null);
    assert.equal(diagnostic.className, null);
    assert.equal(diagnostic.errorClass, 'MissingEntityReferenceError');
    assert.equal(diagnostic.errorMessage, 'Unable to find an entity with index [ 2905 ]');
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
});
