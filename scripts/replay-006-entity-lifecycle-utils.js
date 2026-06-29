import crypto from 'node:crypto';

import BitBuffer from '../packages/engine/src/core/BitBuffer.js';
import EntityOperation from '../packages/engine/src/data/enums/EntityOperation.js';
import EntityMutationExtractor from '../packages/engine/src/extractors/EntityMutationExtractor.js';
import EntityPayloadSizeExtractor from '../packages/engine/src/extractors/EntityPayloadSizeExtractor.js';

const ENTITY_INDEX_BITS = 14;
const ENTITY_INDEX_MASK = (1 << ENTITY_INDEX_BITS) - 1;
const ENTITY_SERIAL_BITS = 17;

function decodePacketEntityOperations(message, options = {}) {
    const {
        classIdSizeBits = null,
        demo = null
    } = options;
    const bitBuffer = new BitBuffer(message.entityData);
    const payloadIterator = message.serializedEntities?.length > 0
        ? new EntityPayloadSizeExtractor(message.serializedEntities).retrieve()
        : null;
    const operations = [];
    let index = -1;

    for (let loopIndex = 0; loopIndex < message.updatedEntries; loopIndex += 1) {
        const deltaBitStart = bitBuffer.getReadCount();
        const entityIndexDelta = bitBuffer.readUVarInt();
        index += entityIndexDelta + 1;
        const commandBitStart = bitBuffer.getReadCount();
        const commandId = bitBuffer.readBitsAsUInt(2);
        const operation = operationById(commandId);
        const entry = {
            loopIndex,
            entityIndexDelta,
            decodedEntityIndex: index,
            serial: null,
            generation: null,
            packedHandle: null,
            operation: operation?.code.toLowerCase() ?? 'unknown',
            classId: null,
            baselineId: null,
            updateBaseline: message.updateBaseline ?? null,
            hasPvsVisBits: null,
            fieldPathCount: null,
            payloadBitStart: bitBuffer.getReadCount(),
            payloadBitEnd: bitBuffer.getReadCount(),
            deltaBitStart,
            commandBitStart,
            commandId,
            registryKey: String(index),
            registryFoundBefore: demo === null ? null : demo.getEntity(index) !== null,
            result: '',
            warnings: []
        };

        if (operation === EntityOperation.CREATE) {
            if (!Number.isInteger(classIdSizeBits)) {
                entry.result = 'cannot_decode_create_without_class_id_size';
                entry.warnings.push('classIdSizeBits unavailable');
                operations.push(entry);
                break;
            }
            entry.classId = bitBuffer.readBitsAsUInt(classIdSizeBits);
            entry.baselineId = entry.classId;
            entry.serial = bitBuffer.readBitsAsUInt(ENTITY_SERIAL_BITS);
            entry.generation = entry.serial;
            entry.packedHandle = packEntityHandle(index, entry.serial);
            bitBuffer.readUVarInt32();
            entry.payloadBitStart = bitBuffer.getReadCount();
            movePayload(bitBuffer, payloadIterator, entry);
            entry.result = 'decoded_create_envelope';
        } else if (operation === EntityOperation.UPDATE) {
            movePayload(bitBuffer, payloadIterator, entry);
            entry.result = entry.registryFoundBefore === false ? 'update_missing_registry_entity' : 'decoded_update_envelope';
        } else if (operation === EntityOperation.LEAVE || operation === EntityOperation.DELETE) {
            entry.payloadBitStart = bitBuffer.getReadCount();
            entry.payloadBitEnd = bitBuffer.getReadCount();
            entry.result = entry.registryFoundBefore === false ? `${operation.code.toLowerCase()}_missing_registry_entity` : `decoded_${operation.code.toLowerCase()}_envelope`;
        } else {
            entry.result = 'unknown_operation';
            entry.warnings.push(`unknown command id ${commandId}`);
        }

        operations.push(entry);
    }

    return operations;
}

function decodePacketEntityOperationsWithParserState(message, demo) {
    const bitBuffer = new BitBuffer(message.entityData);
    const payloadIterator = message.serializedEntities?.length > 0
        ? new EntityPayloadSizeExtractor(message.serializedEntities).retrieve()
        : null;
    const operations = [];
    let index = -1;

    for (let loopIndex = 0; loopIndex < message.updatedEntries; loopIndex += 1) {
        const deltaBitStart = bitBuffer.getReadCount();
        const entityIndexDelta = bitBuffer.readUVarInt();
        index += entityIndexDelta + 1;
        const commandBitStart = bitBuffer.getReadCount();
        const commandId = bitBuffer.readBitsAsUInt(2);
        const operation = operationById(commandId);
        const entry = {
            loopIndex,
            entityIndexDelta,
            decodedEntityIndex: index,
            serial: null,
            generation: null,
            packedHandle: null,
            operation: operation?.code.toLowerCase() ?? 'unknown',
            classId: null,
            baselineId: null,
            updateBaseline: message.updateBaseline ?? null,
            hasPvsVisBits: null,
            fieldPathCount: null,
            payloadBitStart: bitBuffer.getReadCount(),
            payloadBitEnd: bitBuffer.getReadCount(),
            deltaBitStart,
            commandBitStart,
            commandId,
            registryKey: String(index),
            registryFoundBefore: demo.getEntity(index) !== null,
            result: '',
            warnings: []
        };

        if (operation === EntityOperation.UPDATE) {
            const entity = demo.getEntity(index);
            if (entity === null) {
                entry.result = 'update_missing_registry_entity';
                operations.push(entry);
                break;
            }
            const extractor = new EntityMutationExtractor(bitBuffer, entity.class.serializer);
            extractor.skip();
            entry.payloadBitEnd = bitBuffer.getReadCount();
            entry.result = 'decoded_update_envelope_with_serializer_skip';
        } else if (operation === EntityOperation.CREATE) {
            const classIdSizeBits = demo.server?.classIdSizeBits ?? null;
            if (!Number.isInteger(classIdSizeBits)) {
                entry.result = 'cannot_decode_create_without_class_id_size';
                entry.warnings.push('classIdSizeBits unavailable');
                operations.push(entry);
                break;
            }
            entry.classId = bitBuffer.readBitsAsUInt(classIdSizeBits);
            entry.baselineId = entry.classId;
            entry.serial = bitBuffer.readBitsAsUInt(ENTITY_SERIAL_BITS);
            entry.generation = entry.serial;
            entry.packedHandle = packEntityHandle(index, entry.serial);
            bitBuffer.readUVarInt32();
            entry.payloadBitStart = bitBuffer.getReadCount();
            const clazz = demo.getClassById(entry.classId);
            if (clazz === null) {
                movePayload(bitBuffer, payloadIterator, entry);
                entry.result = 'create_class_missing_payload_skipped_by_serialized_size';
            } else {
                const extractor = new EntityMutationExtractor(bitBuffer, clazz.serializer);
                extractor.skip();
                entry.payloadBitEnd = bitBuffer.getReadCount();
                entry.result = 'decoded_create_envelope_with_serializer_skip';
            }
        } else if (operation === EntityOperation.LEAVE || operation === EntityOperation.DELETE) {
            entry.payloadBitStart = bitBuffer.getReadCount();
            entry.payloadBitEnd = bitBuffer.getReadCount();
            entry.result = entry.registryFoundBefore === false ? `${operation.code.toLowerCase()}_missing_registry_entity` : `decoded_${operation.code.toLowerCase()}_envelope`;
        } else {
            entry.result = 'unknown_operation';
            entry.warnings.push(`unknown command id ${commandId}`);
        }

        operations.push(entry);
    }

    return operations;
}

function summarizeDemoState(demo) {
    const stats = demo.getStats();
    const entityKeys = Array.from(demo.getEntityIterator()).map(entity => `${entity.index}:${entity.serial}:${entity.class.id}`);
    const classKeys = demo.getClasses().map(clazz => `${clazz.id}:${clazz.name}`);
    return {
        classCount: stats.classes,
        serializerCount: stats.serializers,
        baselineCount: stats.classBaselines,
        entityCount: stats.entities,
        entityKeyHash: hashList(entityKeys),
        classKeyHash: hashList(classKeys)
    };
}

function entityIdentityModel() {
    return {
        registryIdentity: 'entity index',
        handleIdentity: 'serial_plus_index',
        decodedPacketEntityValue: 'index_component',
        indexBits: ENTITY_INDEX_BITS,
        indexMask: `0x${ENTITY_INDEX_MASK.toString(16)}`,
        serialBits: ENTITY_SERIAL_BITS,
        handleConstruction: '(serial << 14) | index',
        handleLookupMask: 'handle & 0x3FFF',
        createUpdateDeleteKeyConstruction: 'packet entity stream delta-decodes an entity index; CREATE additionally reads a 17-bit serial',
        invalidIndexValues: `index must be >= 0 and < ${1 << ENTITY_INDEX_BITS}`,
        generationIncrementRules: 'not inferred by parser; serial is read from CREATE and stored on Entity',
        indexReuseBehavior: 'registerEntity replaces existing byIndex slot and updates class index'
    };
}

function packEntityHandle(index, serial) {
    return ((serial << ENTITY_INDEX_BITS) | index) >>> 0;
}

function movePayload(bitBuffer, payloadIterator, entry) {
    if (payloadIterator === null) {
        entry.warnings.push('serializedEntities payload-size index unavailable');
        entry.payloadBitEnd = bitBuffer.getReadCount();
        return;
    }
    const payloadBits = payloadIterator.next().value;
    if (!Number.isInteger(payloadBits)) {
        entry.warnings.push('payload size missing from serializedEntities');
        entry.payloadBitEnd = bitBuffer.getReadCount();
        return;
    }
    entry.payloadBitStart = bitBuffer.getReadCount();
    bitBuffer.move(payloadBits);
    entry.payloadBitEnd = bitBuffer.getReadCount();
}

function operationById(id) {
    return [ EntityOperation.UPDATE, EntityOperation.LEAVE, EntityOperation.CREATE, EntityOperation.DELETE ].find(operation => operation.id === id) ?? null;
}

function hashList(values) {
    return crypto.createHash('sha256').update(JSON.stringify([ ...values ].sort())).digest('hex');
}

export {
    decodePacketEntityOperations,
    decodePacketEntityOperationsWithParserState,
    entityIdentityModel,
    packEntityHandle,
    summarizeDemoState
};
