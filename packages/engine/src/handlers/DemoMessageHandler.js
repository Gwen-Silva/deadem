import Assert from '#core/Assert.js';
import BitBuffer from '#core/BitBuffer.js';

import Demo from '#data/Demo.js';
import Server from '#data/Server.js';

import Entity from '#data/entity/Entity.js';
import EntityMutationBatch from '#data/entity/EntityMutationBatch.js';
import EntityMutationEvent from '#data/entity/EntityMutationEvent.js';
import EntityMutationPartialEvent from '#data/entity/EntityMutationPartialEvent.js';

import EntityOperation from '#data/enums/EntityOperation.js';

import EntityMutationExtractor from '#extractors/EntityMutationExtractor.js';
import EntityPayloadSizeExtractor from '#extractors/EntityPayloadSizeExtractor.js';

import StringTableHandler from '#handlers/StringTableHandler.js';

import SchemaRegistry from '#src/SchemaRegistry.js';

class DemoMessageHandler {
    /**
     * @constructor
     * @param {SchemaRegistry} registry
     * @param {Demo} demo
     * @param {StringTableHandler} stringTableHandler
     * @param {(function(string): boolean)|null} [entityClassFilter=null]
     */
    constructor(registry, demo, stringTableHandler, entityClassFilter = null) {
        Assert.isTrue(registry instanceof SchemaRegistry);
        Assert.isTrue(demo instanceof Demo);
        Assert.isTrue(stringTableHandler instanceof StringTableHandler);
        Assert.isTrue(entityClassFilter === null || typeof entityClassFilter === 'function');

        this._registry = registry;
        this._demo = demo;
        this._stringTableHandler = stringTableHandler;
        this._entityClassFilter = entityClassFilter;
    }

    /**
     * Handles a {@link MessagePacketType.SVC_SERVER_INFO} (ID = 40).
     *
     * @public
     * @param {MessagePacket} messagePacket
     */
    handleSvcServerInfo(messagePacket) {
        const message = messagePacket.data;

        const server = new Server(message.maxClasses, message.maxClients, message.tickInterval);

        this._demo.registerServer(server);
    }

    /**
     * Handles a {@link MessagePacketType.SVC_CREATE_STRING_TABLE} (ID = 44).
     *
     * @public
     * @param {MessagePacket} messagePacket
     */
    handleSvcCreateStringTable(messagePacket) {
        this._stringTableHandler.handleCreate(messagePacket.data);
    }

    /**
     * Handles a {@link MessagePacketType.SVC_UPDATE_STRING_TABLE} (ID = 45).
     *
     * @public
     * @param {MessagePacket} messagePacket
     */
    handleSvcUpdateStringTable(messagePacket) {
        this._stringTableHandler.handleUpdate(messagePacket.data);
    }

    /**
     * Handles a {@link MessagePacketType.SVC_CLEAR_ALL_STRING_TABLES} (ID = 51).
     *
     * @public
     * @param {MessagePacket} messagePacket
     */
    handleSvcClearAllStringTables() {
        this._stringTableHandler.handleClear();
    }

    /**
     * Handles a {@link MessagePacketType.SVC_PACKET_ENTITIES} (ID = 55).
     *
     * @public
     * @param {MessagePacket} messagePacket
     * @param {number} [startPointer=0]
     * @param {number} [startLoop=0]
     * @param {number} [startIndex=-1]
     * @param {boolean} [direct=false]
     * @returns {Array<EntityMutationEvent>|null}
     */
    handleSvcPacketEntities(messagePacket, startPointer = 0, startLoop = 0, startIndex = -1, direct = false, recovery = null) {
        const message = messagePacket.data;

        if (message.updateBaseline) {
            throw new Error('Unhandled CSVCMsg_PacketEntities.updateBaseline === true');
        }

        if (this._demo.server === null) {
            throw new Error('CSVCMsg_PacketEntities found, but server data is missing');
        }

        const bitBuffer = new BitBuffer(message.entityData);

        bitBuffer.move(startPointer);

        const hasFilter = this._entityClassFilter !== null;
        const hasRecovery = recovery !== null;
        const payloadSizes = hasFilter || hasRecovery ? createPayloadIterator(message, startLoop) : null;
        const events = direct ? null : [];
        const extractor = new EntityMutationExtractor(bitBuffer);
        const cursorLedger = createCursorLedger(recovery, message, startLoop);

        let index = startIndex;

        for (let i = startLoop; i < message.updatedEntries; i++) {
            const beforeIndexReadCount = bitBuffer.getReadCount();
            const indexDelta = bitBuffer.readUVarInt();
            index += indexDelta + 1;
            const afterIndexReadCount = bitBuffer.getReadCount();

            const command = bitBuffer.readBitsAsUInt(2);
            const afterCommandReadCount = bitBuffer.getReadCount();
            const cursorEntry = createCursorEntry(cursorLedger, {
                loop: i,
                beforeIndexReadCount,
                afterIndexReadCount,
                indexDelta,
                accumulatedEntityIndex: index,
                afterCommandReadCount,
                command
            });

            switch (command) {
                case EntityOperation.UPDATE.id: {
                    const entity = this._demo.getEntity(index);
                    const payloadBits = payloadSizes !== null ? payloadSizes.next().value : null;
                    updateCursorEntry(cursorEntry, {
                        payloadBits,
                        payloadSizeIteratorAvailable: payloadSizes !== null,
                        registryStateBefore: entity === null ? 'missing' : 'present'
                    });

                    if (entity === null) {
                        if (recoverMissingEntityReference(recovery, {
                            operation: EntityOperation.UPDATE,
                            index,
                            bitBuffer,
                            payloadBits,
                            loop: i,
                            registryState: 'missing'
                        })) {
                            finishCursorEntry(cursorLedger, cursorEntry, {
                                action: 'skipped_missing_update_payload',
                                afterActionReadCount: bitBuffer.getReadCount(),
                                entityTouched: false,
                                baselineTouched: false,
                                fieldsTouched: false,
                                registerEntityTouched: false
                            });
                            break;
                        }

                        finishCursorEntry(cursorLedger, cursorEntry, {
                            action: 'missing_update_failed',
                            afterActionReadCount: bitBuffer.getReadCount(),
                            entityTouched: false,
                            baselineTouched: false,
                            fieldsTouched: false,
                            registerEntityTouched: false
                        });
                        throw new Error(`Unable to find an entity with index [ ${index} ]`);
                    }

                    extractor.serializer = entity.class.serializer;

                    const allowed = !hasFilter || this._entityClassFilter(entity.class.name);

                    if (allowed) {
                        if (events === null) {
                            if (!entity.active) {
                                entity.activate();
                            }

                            extractor.applyTo(entity);
                            finishCursorEntry(cursorLedger, cursorEntry, {
                                action: 'normal_update_apply',
                                afterActionReadCount: bitBuffer.getReadCount(),
                                entityTouched: true,
                                baselineTouched: false,
                                fieldsTouched: true,
                                registerEntityTouched: false
                            });
                        } else {
                            events.push(new EntityMutationEvent(EntityOperation.UPDATE, entity, extractor.all()));
                            finishCursorEntry(cursorLedger, cursorEntry, {
                                action: 'normal_update_event',
                                afterActionReadCount: bitBuffer.getReadCount(),
                                entityTouched: true,
                                baselineTouched: false,
                                fieldsTouched: true,
                                registerEntityTouched: false
                            });
                        }
                    } else if (payloadBits !== null) {
                        bitBuffer.move(payloadBits);
                        finishCursorEntry(cursorLedger, cursorEntry, {
                            action: 'filtered_update_skip_payload',
                            afterActionReadCount: bitBuffer.getReadCount(),
                            entityTouched: true,
                            baselineTouched: false,
                            fieldsTouched: false,
                            registerEntityTouched: false
                        });
                    } else {
                        extractor.skip();
                        finishCursorEntry(cursorLedger, cursorEntry, {
                            action: 'filtered_update_extractor_skip',
                            afterActionReadCount: bitBuffer.getReadCount(),
                            entityTouched: true,
                            baselineTouched: false,
                            fieldsTouched: false,
                            registerEntityTouched: false
                        });
                    }

                    break;
                }
                case EntityOperation.LEAVE.id: {
                    const entity = this._demo.getEntity(index);
                    updateCursorEntry(cursorEntry, {
                        payloadBits: 0,
                        payloadSizeIteratorAvailable: payloadSizes !== null,
                        registryStateBefore: entity === null ? 'missing' : (entity.active ? 'present_active' : 'present_inactive')
                    });

                    if (entity === null) {
                        if (recoverMissingEntityReference(recovery, {
                            operation: EntityOperation.LEAVE,
                            index,
                            bitBuffer,
                            payloadBits: 0,
                            loop: i,
                            registryState: 'missing'
                        })) {
                            finishCursorEntry(cursorLedger, cursorEntry, {
                                action: 'ignored_missing_leave',
                                afterActionReadCount: bitBuffer.getReadCount(),
                                entityTouched: false,
                                baselineTouched: false,
                                fieldsTouched: false,
                                registerEntityTouched: false
                            });
                            break;
                        }

                        finishCursorEntry(cursorLedger, cursorEntry, {
                            action: 'missing_leave_failed',
                            afterActionReadCount: bitBuffer.getReadCount(),
                            entityTouched: false,
                            baselineTouched: false,
                            fieldsTouched: false,
                            registerEntityTouched: false
                        });
                        throw new Error(`Unable to find an entity with index [ ${index} ]`);
                    }

                    if (!entity.active) {
                        throw new Error(`Unable to leave entity with index [ ${index} ] - inactive`);
                    }

                    if (events === null || (hasFilter && !this._entityClassFilter(entity.class.name))) {
                        entity.deactivate();
                    } else {
                        events.push(EntityMutationEvent.createEmpty(EntityOperation.LEAVE, entity));
                    }
                    finishCursorEntry(cursorLedger, cursorEntry, {
                        action: 'leave_or_deactivate',
                        afterActionReadCount: bitBuffer.getReadCount(),
                        entityTouched: true,
                        baselineTouched: false,
                        fieldsTouched: false,
                        registerEntityTouched: false
                    });

                    break;
                }
                case EntityOperation.CREATE.id: {
                    const payloadBits = payloadSizes !== null ? payloadSizes.next().value : null;
                    const classIdSizeBits = this._demo.server.classIdSizeBits;
                    updateCursorEntry(cursorEntry, {
                        payloadBits,
                        payloadSizeIteratorAvailable: payloadSizes !== null,
                        registryStateBefore: this._demo.getEntity(index) === null ? 'missing' : 'present'
                    });

                    const beforeClassIdReadCount = bitBuffer.getReadCount();
                    const classId = bitBuffer.readBitsAsUInt(classIdSizeBits);
                    const afterClassIdReadCount = bitBuffer.getReadCount();
                    const serial = bitBuffer.readBitsAsUInt(17);
                    const afterSerialReadCount = bitBuffer.getReadCount();
                    updateCursorEntry(cursorEntry, {
                        classId,
                        serial,
                        classIdSizeBits,
                        beforeClassIdReadCount,
                        afterClassIdReadCount,
                        afterSerialReadCount
                    });

                    bitBuffer.readUVarInt32();
                    const beforeEntityConstructorReadCount = bitBuffer.getReadCount();
                    updateCursorEntry(cursorEntry, { beforeEntityConstructorReadCount });

                    const clazz = this._demo.getClassById(classId);

                    if (clazz === null) {
                        throw new Error(`Class not found [ ${classId} ]`);
                    }

                    let entity;

                    try {
                        entity = new Entity(index, serial, clazz);
                    } catch (error) {
                        finishCursorEntry(cursorLedger, cursorEntry, {
                            action: 'create_attempt_out_of_range',
                            afterActionReadCount: bitBuffer.getReadCount(),
                            className: clazz.name,
                            entityTouched: false,
                            baselineTouched: false,
                            fieldsTouched: false,
                            registerEntityTouched: false,
                            failureStage: 'entity_constructor'
                        });
                        recordOutOfRangeEntityCreateBoundary(recovery, {
                            messageUpdatedEntries: message.updatedEntries,
                            loop: i,
                            entityIndex: index,
                            operation: EntityOperation.CREATE,
                            classId,
                            serial,
                            classIdSizeBits,
                            payloadBits,
                            payloadSizeIteratorAvailable: payloadSizes !== null,
                            readCounts: {
                                beforeIndex: beforeIndexReadCount,
                                afterIndex: afterIndexReadCount,
                                afterCommand: afterCommandReadCount,
                                beforeClassId: beforeClassIdReadCount,
                                afterClassId: afterClassIdReadCount,
                                afterSerial: afterSerialReadCount,
                                beforeEntityConstructor: beforeEntityConstructorReadCount
                            },
                            className: clazz.name,
                            failureStage: 'entity_constructor',
                            baselineLookupAttempted: false,
                            registerEntityAttempted: false,
                            fieldExtractionAttempted: false
                        }, error);
                        recordEntityPacketCursorAlignment(recovery, cursorLedger, {
                            boundaryLoop: i,
                            boundaryStartReadCount: beforeIndexReadCount,
                            previousEntityIndex: getPreviousEntityIndex(cursorLedger, i),
                            error
                        });

                        throw error;
                    }

                    const allowed = !hasFilter || this._entityClassFilter(clazz.name);

                    extractor.serializer = entity.class.serializer;

                    if (allowed) {
                        const baseline = this._demo.getClassBaselineById(classId);

                        if (baseline === null) {
                            if (recoverMissingClassBaseline(recovery, {
                                index,
                                serial,
                                classId,
                                className: clazz.name,
                                bitBuffer,
                                payloadBits,
                                loop: i
                            })) {
                                finishCursorEntry(cursorLedger, cursorEntry, {
                                    action: 'skipped_create_payload_missing_baseline',
                                    afterActionReadCount: bitBuffer.getReadCount(),
                                    className: clazz.name,
                                    entityTouched: false,
                                    baselineTouched: true,
                                    fieldsTouched: false,
                                    registerEntityTouched: false
                                });
                                break;
                            }

                            throw new Error(`Baseline not found [ ${classId} ]`);
                        }

                        const baselineExtractor = new EntityMutationExtractor(new BitBuffer(baseline), entity.class.serializer);

                        if (events === null) {
                            this._demo.registerEntity(entity);

                            baselineExtractor.applyTo(entity);
                            extractor.applyTo(entity);
                            finishCursorEntry(cursorLedger, cursorEntry, {
                                action: 'create_register_and_apply',
                                afterActionReadCount: bitBuffer.getReadCount(),
                                className: clazz.name,
                                entityTouched: true,
                                baselineTouched: true,
                                fieldsTouched: true,
                                registerEntityTouched: true
                            });
                        } else {
                            const baselineBatch = baselineExtractor.all();
                            const packetBatch = extractor.all();

                            events.push(new EntityMutationEvent(
                                EntityOperation.CREATE,
                                entity,
                                EntityMutationBatch.concat([ baselineBatch, packetBatch ])
                            ));
                            finishCursorEntry(cursorLedger, cursorEntry, {
                                action: 'create_event',
                                afterActionReadCount: bitBuffer.getReadCount(),
                                className: clazz.name,
                                entityTouched: true,
                                baselineTouched: true,
                                fieldsTouched: true,
                                registerEntityTouched: false
                            });
                        }
                    } else {
                        this._demo.registerEntity(entity);

                        if (payloadBits !== null) {
                            bitBuffer.move(payloadBits);
                        } else {
                            extractor.skip();
                        }
                        finishCursorEntry(cursorLedger, cursorEntry, {
                            action: 'filtered_create_register_skip_payload',
                            afterActionReadCount: bitBuffer.getReadCount(),
                            className: clazz.name,
                            entityTouched: true,
                            baselineTouched: false,
                            fieldsTouched: false,
                            registerEntityTouched: true
                        });
                    }

                    break;
                }
                case EntityOperation.DELETE.id: {
                    const entity = this._demo.getEntity(index);
                    updateCursorEntry(cursorEntry, {
                        payloadBits: 0,
                        payloadSizeIteratorAvailable: payloadSizes !== null,
                        registryStateBefore: entity === null ? 'missing' : (entity.active ? 'present_active' : 'present_inactive')
                    });

                    if (entity === null) {
                        if (recoverMissingEntityReference(recovery, {
                            operation: EntityOperation.DELETE,
                            index,
                            bitBuffer,
                            payloadBits: 0,
                            loop: i,
                            registryState: 'missing'
                        })) {
                            finishCursorEntry(cursorLedger, cursorEntry, {
                                action: 'ignored_missing_delete',
                                afterActionReadCount: bitBuffer.getReadCount(),
                                entityTouched: false,
                                baselineTouched: false,
                                fieldsTouched: false,
                                registerEntityTouched: false
                            });
                            break;
                        }

                        finishCursorEntry(cursorLedger, cursorEntry, {
                            action: 'missing_delete_failed',
                            afterActionReadCount: bitBuffer.getReadCount(),
                            entityTouched: false,
                            baselineTouched: false,
                            fieldsTouched: false,
                            registerEntityTouched: false
                        });
                        throw new Error(`Unable to find an entity with index [ ${index} ]`);
                    }

                    if (!entity.active) {
                        throw new Error(`Unable to delete entity with index [ ${index} ] - inactive`);
                    }

                    if (events === null || (hasFilter && !this._entityClassFilter(entity.class.name))) {
                        this._demo.deleteEntity(index);
                    } else {
                        events.push(EntityMutationEvent.createEmpty(EntityOperation.DELETE, entity));
                    }
                    finishCursorEntry(cursorLedger, cursorEntry, {
                        action: 'delete',
                        afterActionReadCount: bitBuffer.getReadCount(),
                        entityTouched: true,
                        baselineTouched: false,
                        fieldsTouched: false,
                        registerEntityTouched: false
                    });

                    break;
                }
            }
        }

        return events;
    }

    /**
     * Handles a partial of the {@link MessagePacketType.SVC_PACKET_ENTITIES} (ID = 55).
     *
     * @public
     * @param {MessagePacket} messagePacket
     * @returns {Array<EntityMutationPartialEvent>}
     */
    handleSvcPacketEntitiesPartial(messagePacket) {
        const message = messagePacket.data;

        const events = [];

        const bitBuffer = new BitBuffer(message.entityData);

        let index = -1;

        for (let i = 0; i < message.updatedEntries; i++) {
            index += bitBuffer.readUVarInt() + 1;

            const command = bitBuffer.readBitsAsUInt(2);

            switch (command) {
                case EntityOperation.UPDATE.id: {
                    const entity = this._demo.getEntity(index);

                    if (entity === null) {
                        return events;
                    }

                    try {
                        const extractor = new EntityMutationExtractor(bitBuffer, entity.class.serializer);

                        const mutations = extractor.allPacked();

                        const event = new EntityMutationPartialEvent(bitBuffer.getReadCount(), index, entity.class.id, mutations);

                        events.push(event);
                    } catch {
                        return events;
                    }

                    break;
                }
                default:
                    return events;
            }
        }

        return events;
    }
}

/**
 * Builds a payload-size iterator over the packet's `serializedEntities` index.
 *
 * @param {object} message
 * @param {number} [startLoop=0]
 * @returns {Generator<number, void, *>|null}
 */
function createPayloadIterator(message, startLoop = 0) {
    const buffer = message.serializedEntities;

    if (!buffer || buffer.length === 0) {
        return null;
    }

    const iterator = new EntityPayloadSizeExtractor(buffer).retrieve();

    for (let i = 0; i < startLoop; i++) {
        iterator.next();
    }

    return iterator;
}

function createCursorLedger(recovery, message, startLoop) {
    if (recovery === null || recovery.diagnoseEntityPacketCursorAlignment !== true) {
        return null;
    }

    const payloadSizes = listPayloadSizes(message);

    return {
        packetMetrics: {
            updatedEntries: message.updatedEntries,
            entityDataBitLength: message.entityData.length * BitBuffer.BITS_PER_BYTE,
            serializedEntitiesByteLength: message.serializedEntities?.length ?? 0,
            payloadSizeIteratorAvailable: payloadSizes !== null,
            payloadSizeCount: payloadSizes?.length ?? 0,
            payloadBitsSum: payloadSizes?.reduce((sum, value) => sum + value, 0) ?? 0,
            startLoop
        },
        entityData: message.entityData,
        entries: []
    };
}

function listPayloadSizes(message) {
    const buffer = message.serializedEntities;

    if (!buffer || buffer.length === 0) {
        return null;
    }

    return Array.from(new EntityPayloadSizeExtractor(buffer).retrieve());
}

function createCursorEntry(cursorLedger, values) {
    if (cursorLedger === null) {
        return null;
    }

    const operation = EntityOperation.parseById(values.command);
    const entry = {
        loop: values.loop,
        readCounts: {
            beforeIndex: values.beforeIndexReadCount,
            afterIndex: values.afterIndexReadCount,
            afterCommand: values.afterCommandReadCount,
            afterAction: null
        },
        indexDelta: values.indexDelta,
        accumulatedEntityIndex: values.accumulatedEntityIndex,
        commandId: values.command,
        operation: operation?.code ?? 'UNKNOWN',
        payloadBits: null,
        payloadSizeIteratorAvailable: null,
        action: null,
        registryStateBefore: null,
        classId: null,
        serial: null,
        classIdSizeBits: null,
        className: null,
        entityTouched: false,
        baselineTouched: false,
        fieldsTouched: false,
        registerEntityTouched: false,
        failureStage: null
    };

    cursorLedger.entries.push(entry);

    return entry;
}

function updateCursorEntry(entry, values) {
    if (entry !== null) {
        Object.assign(entry, values);
    }
}

function finishCursorEntry(cursorLedger, entry, values) {
    if (cursorLedger === null || entry === null) {
        return;
    }

    const { afterActionReadCount, ...rest } = values;

    Object.assign(entry, rest);
    entry.readCounts.afterAction = afterActionReadCount;
}

function getPreviousEntityIndex(cursorLedger, boundaryLoop) {
    if (cursorLedger === null) {
        return null;
    }

    const previous = cursorLedger.entries.find(entry => entry.loop === boundaryLoop - 1);

    return previous?.accumulatedEntityIndex ?? null;
}

function recordEntityPacketCursorAlignment(recovery, cursorLedger, context) {
    if (recovery === null || recovery.diagnoseEntityPacketCursorAlignment !== true || cursorLedger === null) {
        return false;
    }

    const comparison = buildCursorModelComparison(cursorLedger, context);

    recovery.recordEntityPacketCursorAlignment?.({
        packetMetrics: {
            ...cursorLedger.packetMetrics,
            entriesIteratedToBoundary: cursorLedger.entries.length
        },
        boundary: {
            loop: context.boundaryLoop,
            boundaryStartReadCount: context.boundaryStartReadCount,
            previousEntityIndex: context.previousEntityIndex,
            errorMessage: context.error?.message ?? String(context.error)
        },
        ledgerEntries: cursorLedger.entries,
        windowDefault: {
            startLoop: 18,
            endLoop: 23,
            entries: cursorLedger.entries.filter(entry => entry.loop >= 18 && entry.loop <= 23)
        },
        cursorModelComparison: comparison,
        observedFacts: [
            'loop 22 was a recovered missing UPDATE immediately before the out-of-range CREATE',
            'loop 23 started at the read count produced by the current skip model',
            'the out-of-range CREATE was observed without recovering the boundary'
        ],
        simulations: [
            'alternative offsets were decoded locally without advancing the real parser'
        ],
        hypotheses: [
            'cursor alignment may be wrong before loop 23',
            'serializedEntities payload size may not be sufficient by itself to skip this missing UPDATE safely'
        ],
        undetermined: [
            'whether loop 22 caused the boundary',
            'whether misalignment began before loop 22',
            'whether the replay data or parser assumptions are responsible'
        ]
    });

    return true;
}

function buildCursorModelComparison(cursorLedger, context) {
    const loop22 = cursorLedger.entries.find(entry => entry.loop === context.boundaryLoop - 1);
    const loop23 = cursorLedger.entries.find(entry => entry.loop === context.boundaryLoop);
    const currentModel = loop22 === undefined ? null : {
        modelId: 'current_payload_bits_as_relative_skip_after_command',
        sourceLoop: loop22.loop,
        afterCommandReadCount: loop22.readCounts.afterCommand,
        payloadBits: loop22.payloadBits,
        expectedAfterActionReadCount: Number.isInteger(loop22.payloadBits) ? loop22.readCounts.afterCommand + loop22.payloadBits : null,
        actualAfterActionReadCount: loop22.readCounts.afterAction,
        nextLoopStartReadCount: loop23?.readCounts.beforeIndex ?? null,
        internallyConsistent: Number.isInteger(loop22.payloadBits) &&
            loop22.readCounts.afterCommand + loop22.payloadBits === loop22.readCounts.afterAction &&
            loop22.readCounts.afterAction === loop23?.readCounts.beforeIndex
    };
    const alternativesA = buildAlternativeBoundaryModels(cursorLedger.entityData, context.previousEntityIndex, loop22);
    const nearby = scanNearbyOffsets(cursorLedger.entityData, context.previousEntityIndex, context.boundaryStartReadCount);

    return {
        currentModel,
        alternativeBoundaryModelA: alternativesA,
        alternativeBoundaryModelB: {
            modelId: 'nearby_offset_scan_plus_minus_64_bits',
            observedStartReadCount: context.boundaryStartReadCount,
            searchRadiusBits: 64,
            plausibleCandidateCount: nearby.length,
            plausibleCandidates: nearby.slice(0, 25)
        },
        modelConclusion: {
            currentSkipInternallyConsistent: currentModel?.internallyConsistent ?? false,
            nearbyPlausibleOffsetsFound: nearby.length > 0,
            interpretation: nearby.length > 0 ?
                'nearby offsets can decode plausible entity index and command pairs, so cursor misalignment remains a viable hypothesis' :
                'no nearby offset in the bounded scan produced a plausible next entity index'
        }
    };
}

function buildAlternativeBoundaryModels(entityData, previousEntityIndex, priorEntry) {
    if (priorEntry === undefined || previousEntityIndex === null || !Number.isInteger(priorEntry.payloadBits)) {
        return [];
    }

    const starts = [
        {
            modelId: 'payload_bits_excludes_command_current_equivalent',
            simulatedStartReadCount: priorEntry.readCounts.afterCommand + priorEntry.payloadBits
        },
        {
            modelId: 'payload_bits_includes_command_bits',
            simulatedStartReadCount: priorEntry.readCounts.afterCommand + priorEntry.payloadBits - 2
        },
        {
            modelId: 'payload_bits_excludes_one_byte_header',
            simulatedStartReadCount: priorEntry.readCounts.afterCommand + priorEntry.payloadBits + 8
        }
    ];

    return starts.map(candidate => ({
        ...candidate,
        decodedNextEntry: decodeNextEntryAtOffset(entityData, previousEntityIndex, candidate.simulatedStartReadCount)
    }));
}

function scanNearbyOffsets(entityData, previousEntityIndex, observedStartReadCount) {
    const candidates = [];

    if (previousEntityIndex === null) {
        return candidates;
    }

    for (let delta = -64; delta <= 64; delta++) {
        const offset = observedStartReadCount + delta;

        if (offset < 0 || offset >= entityData.length * BitBuffer.BITS_PER_BYTE) {
            continue;
        }

        const decoded = decodeNextEntryAtOffset(entityData, previousEntityIndex, offset);

        if (decoded.plausibleEntityIndex && decoded.plausibleCommand) {
            candidates.push({
                offsetDeltaBits: delta,
                readCount: offset,
                decoded
            });
        }
    }

    return candidates.sort((left, right) => Math.abs(left.offsetDeltaBits) - Math.abs(right.offsetDeltaBits));
}

function decodeNextEntryAtOffset(entityData, previousEntityIndex, readCount) {
    try {
        const buffer = new BitBuffer(entityData);

        buffer.move(readCount);
        const beforeIndexReadCount = buffer.getReadCount();
        const indexDelta = buffer.readUVarInt();
        const afterIndexReadCount = buffer.getReadCount();
        const entityIndex = previousEntityIndex + indexDelta + 1;
        const commandId = buffer.readBitsAsUInt(2);
        const afterCommandReadCount = buffer.getReadCount();
        const operation = EntityOperation.parseById(commandId);

        return {
            beforeIndexReadCount,
            afterIndexReadCount,
            afterCommandReadCount,
            indexDelta,
            entityIndex,
            commandId,
            operation: operation?.code ?? 'UNKNOWN',
            plausibleEntityIndex: Number.isInteger(entityIndex) && entityIndex >= 0 && entityIndex < (1 << 14),
            plausibleCommand: operation !== null
        };
    } catch (error) {
        return {
            error: error?.message ?? String(error),
            plausibleEntityIndex: false,
            plausibleCommand: false
        };
    }
}

/**
 * Experimental opt-in recovery for a packet-local reference to an entity that is
 * absent from the registry. It never creates an entity or materializes fields;
 * it only advances over the current entry when the packet exposes that entry's
 * payload size.
 *
 * @param {object|null} recovery
 * @param {object} context
 * @returns {boolean}
 */
function recoverMissingEntityReference(recovery, context) {
    if (recovery === null || recovery.allowUnresolvedEntityReference !== true) {
        return false;
    }

    const {
        operation,
        index,
        bitBuffer,
        payloadBits,
        loop,
        registryState
    } = context;

    const warning = {
        operation: operation.code,
        entityIndex: index,
        loop,
        payloadBits: payloadBits ?? null,
        registryStateBefore: registryState,
        recoveryAction: null,
        recoverable: false,
        reason: null
    };

    if (operation === EntityOperation.UPDATE) {
        if (!Number.isInteger(payloadBits)) {
            warning.recoveryAction = 'none';
            warning.reason = 'missing_payload_size';
            recovery.recordUnresolvedEntityReference?.(warning);

            return false;
        }

        bitBuffer.move(payloadBits);
        warning.recoveryAction = 'skipped_invalid_update_payload';
        warning.recoverable = true;
        warning.registryStateAfter = 'unchanged_missing_entity';
        recovery.recordUnresolvedEntityReference?.(warning);

        return true;
    }

    if (operation === EntityOperation.LEAVE || operation === EntityOperation.DELETE) {
        warning.recoveryAction = 'ignored_missing_entity_state_transition';
        warning.recoverable = true;
        warning.registryStateAfter = 'unchanged_missing_entity';
        recovery.recordUnresolvedEntityReference?.(warning);

        return true;
    }

    warning.recoveryAction = 'none';
    warning.reason = 'unsupported_operation';
    recovery.recordUnresolvedEntityReference?.(warning);

    return false;
}

/**
 * Experimental opt-in recovery for a CREATE operation whose class baseline is
 * absent. It does not register the entity, apply defaults, or invent state; it
 * only skips the packet payload when the entry is bounded.
 *
 * @param {object|null} recovery
 * @param {object} context
 * @returns {boolean}
 */
function recoverMissingClassBaseline(recovery, context) {
    if (recovery === null || recovery.allowMissingClassBaseline !== true) {
        return false;
    }

    const {
        index,
        serial,
        classId,
        className,
        bitBuffer,
        payloadBits,
        loop
    } = context;

    const warning = {
        operation: EntityOperation.CREATE.code,
        entityIndex: index,
        entitySerial: serial,
        classId,
        className,
        loop,
        payloadBits: payloadBits ?? null,
        baselineStateBefore: 'missing',
        recoveryAction: null,
        recoverable: false,
        reason: null
    };

    if (!Number.isInteger(payloadBits)) {
        warning.recoveryAction = 'none';
        warning.reason = 'missing_payload_size';
        recovery.recordMissingClassBaseline?.(warning);

        return false;
    }

    bitBuffer.move(payloadBits);
    warning.recoveryAction = 'skipped_create_payload_missing_baseline';
    warning.recoverable = true;
    warning.baselineStateAfter = 'unchanged_missing_baseline';
    recovery.recordMissingClassBaseline?.(warning);

    return true;
}

/**
 * Records an opt-in diagnostic for a CREATE entry whose accumulated entity
 * index is outside the engine entity-index range. This does not recover, create
 * an entity, apply a baseline, register anything, or materialize fields.
 *
 * @param {object|null} recovery
 * @param {object} context
 * @param {Error} error
 * @returns {boolean}
 */
function recordOutOfRangeEntityCreateBoundary(recovery, context, error) {
    if (recovery === null || recovery.diagnoseOutOfRangeEntityCreate !== true) {
        return false;
    }

    recovery.recordOutOfRangeEntityCreateBoundary?.({
        ...context,
        operation: context.operation.code,
        errorMessage: error?.message ?? String(error),
        observedFacts: {
            classAlreadyResolved: Boolean(context.className),
            baselineLookupAttempted: false,
            registerEntityAttempted: false,
            fieldExtractionAttempted: false,
            recoveryAttemptedForThisBoundary: false
        },
        hypotheses: [
            'accumulated entity index exceeded the engine entity-index range before baseline lookup'
        ],
        undetermined: [
            'whether the index delta stream is misaligned before this entry',
            'whether earlier skipped missing-entity updates caused later packet cursor divergence',
            'whether this replay requires parser support beyond missing-entity reference recovery'
        ]
    });

    return true;
}

export default DemoMessageHandler;
export {
    decodeNextEntryAtOffset,
    recoverMissingClassBaseline,
    recoverMissingEntityReference,
    recordOutOfRangeEntityCreateBoundary
};
