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

        let index = startIndex;

        for (let i = startLoop; i < message.updatedEntries; i++) {
            index += bitBuffer.readUVarInt() + 1;

            const command = bitBuffer.readBitsAsUInt(2);

            switch (command) {
                case EntityOperation.UPDATE.id: {
                    const entity = this._demo.getEntity(index);
                    const payloadBits = payloadSizes !== null ? payloadSizes.next().value : null;

                    if (entity === null) {
                        if (recoverMissingEntityReference(recovery, {
                            operation: EntityOperation.UPDATE,
                            index,
                            bitBuffer,
                            payloadBits,
                            loop: i,
                            registryState: 'missing'
                        })) {
                            break;
                        }

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
                        } else {
                            events.push(new EntityMutationEvent(EntityOperation.UPDATE, entity, extractor.all()));
                        }
                    } else if (payloadBits !== null) {
                        bitBuffer.move(payloadBits);
                    } else {
                        extractor.skip();
                    }

                    break;
                }
                case EntityOperation.LEAVE.id: {
                    const entity = this._demo.getEntity(index);

                    if (entity === null) {
                        if (recoverMissingEntityReference(recovery, {
                            operation: EntityOperation.LEAVE,
                            index,
                            bitBuffer,
                            payloadBits: 0,
                            loop: i,
                            registryState: 'missing'
                        })) {
                            break;
                        }

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

                    break;
                }
                case EntityOperation.CREATE.id: {
                    const payloadBits = payloadSizes !== null ? payloadSizes.next().value : null;
                    const classIdSizeBits = this._demo.server.classIdSizeBits;

                    const classId = bitBuffer.readBitsAsUInt(classIdSizeBits);
                    const serial = bitBuffer.readBitsAsUInt(17);

                    bitBuffer.readUVarInt32();

                    const clazz = this._demo.getClassById(classId);

                    if (clazz === null) {
                        throw new Error(`Class not found [ ${classId} ]`);
                    }

                    const entity = new Entity(index, serial, clazz);

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
                                break;
                            }

                            throw new Error(`Baseline not found [ ${classId} ]`);
                        }

                        const baselineExtractor = new EntityMutationExtractor(new BitBuffer(baseline), entity.class.serializer);

                        if (events === null) {
                            this._demo.registerEntity(entity);

                            baselineExtractor.applyTo(entity);
                            extractor.applyTo(entity);
                        } else {
                            const baselineBatch = baselineExtractor.all();
                            const packetBatch = extractor.all();

                            events.push(new EntityMutationEvent(
                                EntityOperation.CREATE,
                                entity,
                                EntityMutationBatch.concat([ baselineBatch, packetBatch ])
                            ));
                        }
                    } else {
                        this._demo.registerEntity(entity);

                        if (payloadBits !== null) {
                            bitBuffer.move(payloadBits);
                        } else {
                            extractor.skip();
                        }
                    }

                    break;
                }
                case EntityOperation.DELETE.id: {
                    const entity = this._demo.getEntity(index);

                    if (entity === null) {
                        if (recoverMissingEntityReference(recovery, {
                            operation: EntityOperation.DELETE,
                            index,
                            bitBuffer,
                            payloadBits: 0,
                            loop: i,
                            registryState: 'missing'
                        })) {
                            break;
                        }

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

export default DemoMessageHandler;
export { recoverMissingClassBaseline, recoverMissingEntityReference };
