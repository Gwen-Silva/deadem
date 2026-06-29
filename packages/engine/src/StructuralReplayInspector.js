import fs from 'node:fs';

import SnappyDecompressor from '#core/SnappyDecompressor.instance.js';

import DemoPacketType from '#data/enums/DemoPacketType.js';

const DEMO_REPLAY_HEADER_SIZE_BYTES = 16;
const COMPRESSION_FLAG = 64;
const MAX_VARINT32_BYTES = 5;
const STRUCTURAL_PASS_SCHEMA_VERSION = 1;

/**
 * Performs a replay-container and packet-envelope pass without invoking
 * gameplay-state handlers, entity registries, baselines, class lookup, or
 * property serializers.
 */
class StructuralReplayInspector {
    /**
     * @public
     * @static
     * @param {string|Buffer|Uint8Array} source
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    static async inspectReplayStructure(source, options = {}) {
        const inspector = new StructuralReplayInspector(options);

        return inspector.inspect(source);
    }

    /**
     * @public
     * @constructor
     * @param {Object} options
     */
    constructor(options = {}) {
        this._options = normalizeOptions(options);
        this._registry = this._options.registry ?? null;
    }

    /**
     * @public
     * @param {string|Buffer|Uint8Array} source
     * @returns {Object}
     */
    inspect(source) {
        const buffer = loadSource(source);
        const records = [];
        const summary = createSummary(buffer.length);
        const header = inspectHeader(buffer);

        summary.header = header;

        if (!header.valid) {
            const error = structuralError('header', 'header_truncated', header.warning, 0, buffer.length, 'none');

            emitRecord(error, records, this._options);
            summary.errors.push(error);

            return { schemaVersion: STRUCTURAL_PASS_SCHEMA_VERSION, header, summary, records };
        }

        let offset = DEMO_REPLAY_HEADER_SIZE_BYTES;
        let sequence = 0;
        let lastTick = null;

        while (offset < buffer.length) {
            if (this._options.endOffset !== null && offset > this._options.endOffset) {
                break;
            }

            if (records.length >= this._options.maxRecords) {
                summary.truncatedByMaxRecords = true;
                break;
            }

            const command = readCommandEnvelope(buffer, offset, sequence, this._registry);

            if (command.error !== null) {
                emitRecord(command.error, records, this._options);
                summary.errors.push(command.error);
                break;
            }

            const commandRecord = command.record;

            if (lastTick !== null && commandRecord.tick < lastTick) {
                commandRecord.warnings.push('non_monotonic_tick');
                summary.tickRegressions += 1;
                summary.errors.push(structuralError('command', 'non_monotonic_tick', `tick ${commandRecord.tick} after ${lastTick}`, commandRecord.sourceOffsetStart, buffer.length - commandRecord.sourceOffsetStart, 'next_command_known', commandRecord.tick));
            }

            lastTick = commandRecord.tick;
            offset = commandRecord.sourceOffsetEnd;
            sequence += 1;

            updateCommandSummary(summary, commandRecord);

            if (recordPassesBounds(commandRecord, this._options)) {
                emitRecord(commandRecord, records, this._options);
            }

            if (!this._options.commandsOnly && commandRecord.payloadComplete && command.heavy) {
                const messageResult = enumerateMessages(command, this._registry);

                for (const message of messageResult.records) {
                    updateMessageSummary(summary, message);

                    if (recordPassesBounds(message, this._options)) {
                        emitRecord(message, records, this._options);
                    }

                    if (records.length >= this._options.maxRecords) {
                        summary.truncatedByMaxRecords = true;
                        break;
                    }
                }

                for (const error of messageResult.errors) {
                    summary.errors.push(error);

                    if (recordPassesBounds(error, this._options)) {
                        emitRecord(error, records, this._options);
                    }
                }
            }

            if (summary.truncatedByMaxRecords) {
                break;
            }
        }

        summary.commandsParsed = sequence;
        summary.finalStructuralSourceOffset = offset;
        summary.byteCoverage = buffer.length === 0 ? 0 : offset / buffer.length;
        summary.completed = offset >= buffer.length && summary.errors.filter(error => error.errorCategory !== 'non_monotonic_tick').length === 0;
        summary.finalStructuralTick = lastTick;

        return { schemaVersion: STRUCTURAL_PASS_SCHEMA_VERSION, header, summary, records };
    }
}

function normalizeOptions(options) {
    return {
        commandsOnly: options.commandsOnly === true,
        includeMessageEnvelopes: options.includeMessageEnvelopes !== false,
        startTick: Number.isInteger(options.startTick) ? options.startTick : null,
        endTick: Number.isInteger(options.endTick) ? options.endTick : null,
        startOffset: Number.isInteger(options.startOffset) ? options.startOffset : null,
        endOffset: Number.isInteger(options.endOffset) ? options.endOffset : null,
        maxRecords: Number.isInteger(options.maxRecords) ? options.maxRecords : Number.MAX_SAFE_INTEGER,
        outputSink: typeof options.outputSink === 'function' ? options.outputSink : null,
        registry: options.registry ?? null
    };
}

function loadSource(source) {
    if (typeof source === 'string') {
        return fs.readFileSync(source);
    }

    if (Buffer.isBuffer(source)) {
        return source;
    }

    if (source instanceof Uint8Array) {
        return Buffer.from(source.buffer, source.byteOffset, source.byteLength);
    }

    throw new TypeError('inspectReplayStructure source must be a path, Buffer, or Uint8Array');
}

function inspectHeader(buffer) {
    const raw = buffer.subarray(0, Math.min(buffer.length, DEMO_REPLAY_HEADER_SIZE_BYTES));
    const text = raw.toString('utf8').replace(/\0+$/u, '');

    return {
        sizeBytes: DEMO_REPLAY_HEADER_SIZE_BYTES,
        presentBytes: raw.length,
        rawHex: raw.toString('hex'),
        text,
        valid: raw.length >= DEMO_REPLAY_HEADER_SIZE_BYTES,
        warning: raw.length < DEMO_REPLAY_HEADER_SIZE_BYTES ? 'Replay header is shorter than 16 bytes.' : null
    };
}

function readCommandEnvelope(buffer, offset, sequence, registry) {
    const sourceOffsetStart = offset;
    const type = readByteVarInt32(buffer, offset, 'command_varint_failure');

    if (type.error !== null) {
        return { record: null, heavy: false, payload: null, error: type.error };
    }

    offset = type.nextOffset;

    const tick = readByteVarInt32(buffer, offset, 'command_varint_failure');

    if (tick.error !== null) {
        return { record: null, heavy: false, payload: null, error: tick.error };
    }

    offset = tick.nextOffset;

    const size = readByteVarInt32(buffer, offset, 'command_length_invalid');

    if (size.error !== null) {
        return { record: null, heavy: false, payload: null, error: size.error };
    }

    offset = size.nextOffset;

    const sourceOffsetEnd = offset + size.value;
    const payloadComplete = sourceOffsetEnd <= buffer.length;
    const commandId = type.value & ~COMPRESSION_FLAG;
    const commandType = registry?.resolveDemoType(commandId) ?? null;
    const warnings = [];

    if (commandType === null) {
        warnings.push('unknown_demo_command');
    }

    if (!payloadComplete) {
        warnings.push('command_payload_truncated');
    }

    const record = {
        recordType: 'command',
        sequence,
        commandId,
        commandName: commandType?.code ?? null,
        tick: tick.value,
        compressed: (type.value & COMPRESSION_FLAG) === COMPRESSION_FLAG,
        sourceOffsetStart,
        sourceOffsetEnd: Math.min(sourceOffsetEnd, buffer.length),
        declaredPayloadSize: size.value,
        actualPayloadSize: Math.max(0, Math.min(size.value, buffer.length - offset)),
        payloadComplete,
        warnings
    };

    const payload = buffer.subarray(offset, Math.min(sourceOffsetEnd, buffer.length));

    return {
        record,
        heavy: commandType?.heavy === true,
        payload,
        commandType,
        error: payloadComplete ? null : structuralError('command', 'command_payload_truncated', `declared ${size.value} bytes, only ${buffer.length - offset} available`, sourceOffsetStart, buffer.length - sourceOffsetStart, 'none', tick.value)
    };
}

function readByteVarInt32(buffer, offset, errorCategory) {
    let value = 0;

    for (let i = 0; i < MAX_VARINT32_BYTES; i++) {
        if (offset + i >= buffer.length) {
            return {
                value: null,
                nextOffset: offset + i,
                error: structuralError('command', errorCategory, 'Unexpected EOF while reading byte varint32', offset, buffer.length - offset, 'none')
            };
        }

        const byte = buffer[offset + i];

        value |= (byte & 0x7F) << (7 * i);

        if ((byte & 0x80) === 0) {
            return { value: value | 0, nextOffset: offset + i + 1, error: null };
        }
    }

    return {
        value: null,
        nextOffset: offset + MAX_VARINT32_BYTES,
        error: structuralError('command', errorCategory, 'Varint32 exceeded maximum length', offset, buffer.length - offset, 'none')
    };
}

function enumerateMessages(command, registry) {
    const errors = [];
    const records = [];
    const record = command.record;
    const demoProto = command.commandType === null ? null : registry?.getDemoProto(command.commandType);

    if (demoProto === null || demoProto === undefined) {
        return { records, errors };
    }

    let decompressed = command.payload;

    if (record.compressed) {
        try {
            decompressed = Buffer.from(SnappyDecompressor.decompress(command.payload));
        } catch (error) {
            errors.push(structuralError('packet', 'unsupported_compression', error.message, record.sourceOffsetStart, record.actualPayloadSize, 'none', record.tick));

            return { records, errors };
        }
    }

    let decoded;

    try {
        decoded = demoProto.decode(decompressed);
    } catch (error) {
        errors.push(structuralError('packet', 'packet_payload_invalid', error.message, record.sourceOffsetStart, record.actualPayloadSize, 'none', record.tick));

        return { records, errors };
    }

    const packetData = extractPacketData(record.commandId, decoded);

    if (packetData === null) {
        return { records, errors };
    }

    const reader = new BitEnvelopeReader(packetData);
    let messageSequenceInCommand = 0;

    while (reader.hasAtLeastOneByte()) {
        const startByte = reader.currentByteOffset;
        const type = reader.readMessageType();

        if (type.error !== null) {
            errors.push(type.error(record, startByte));
            break;
        }

        const size = reader.readByteVarInt32();

        if (size.error !== null) {
            errors.push(size.error(record, startByte));
            break;
        }

        const payloadStartByte = reader.currentByteOffset;
        const payloadEndByte = payloadStartByte + size.value;
        const payloadComplete = reader.canReadBytes(size.value);
        const messageType = registry?.resolveMessageType(type.value) ?? null;
        const warnings = [];

        if (messageType === null) {
            warnings.push('unknown_message_id');
        }

        if (!payloadComplete) {
            warnings.push('message_payload_truncated');
        }

        records.push({
            recordType: 'message',
            parentCommandSequence: record.sequence,
            messageSequenceInCommand,
            tick: record.tick,
            messageTypeId: type.value,
            messageTypeName: messageType?.code ?? null,
            sourceOffsetStart: startByte,
            sourceOffsetEnd: Math.min(payloadEndByte, packetData.length),
            sourceOffsetBasis: 'decoded_packet_data',
            declaredPayloadSize: size.value,
            actualPayloadSize: Math.max(0, Math.min(size.value, packetData.length - payloadStartByte)),
            payloadComplete,
            decodeScope: 'envelope_only',
            warnings
        });

        if (!payloadComplete) {
            errors.push(structuralError('message', 'message_payload_truncated', `declared ${size.value} bytes, only ${packetData.length - payloadStartByte} available`, record.sourceOffsetStart, packetData.length - payloadStartByte, 'boundary_known', record.tick));
            break;
        }

        reader.skipBytes(size.value);
        messageSequenceInCommand += 1;
    }

    return { records, errors };
}

function extractPacketData(commandId, decoded) {
    if ((commandId === DemoPacketType.DEM_PACKET.id || commandId === DemoPacketType.DEM_SIGNON_PACKET.id) && decoded?.data) {
        return Buffer.from(decoded.data);
    }

    if (commandId === DemoPacketType.DEM_FULL_PACKET.id && decoded?.packet?.data) {
        return Buffer.from(decoded.packet.data);
    }

    return null;
}

class BitEnvelopeReader {
    /**
     * @param {Buffer|Uint8Array} buffer
     */
    constructor(buffer) {
        this._buffer = buffer;
        this._bitOffset = 0;
    }

    get currentByteOffset() {
        return Math.ceil(this._bitOffset / 8);
    }

    hasAtLeastOneByte() {
        return this._buffer.length * 8 - this._bitOffset >= 8;
    }

    readMessageType() {
        const start = this.currentByteOffset;
        const first = this._readBits(6);

        if (first === null) {
            return { value: null, error: createMessageErrorFactory('message_type_varint_failure', 'Unexpected EOF while reading message type') };
        }

        let value = first;

        switch (first & 48) {
            case 16: {
                const more = this._readBits(4);

                if (more === null) return { value: null, error: createMessageErrorFactory('message_type_varint_failure', 'Unexpected EOF while reading 10-bit message type') };

                value = (first & 15) | (more << 4);
                break;
            }
            case 32: {
                const more = this._readBits(8);

                if (more === null) return { value: null, error: createMessageErrorFactory('message_type_varint_failure', 'Unexpected EOF while reading 14-bit message type') };

                value = (first & 15) | (more << 4);
                break;
            }
            case 48: {
                const more = this._readBits(28);

                if (more === null) return { value: null, error: createMessageErrorFactory('message_type_varint_failure', 'Unexpected EOF while reading 32-bit message type') };

                value = (first & 15) | (more << 4);
                break;
            }
            default: {
                break;
            }
        }

        if (this.currentByteOffset < start) {
            return { value: null, error: createMessageErrorFactory('message_type_varint_failure', 'Message type reader moved backwards') };
        }

        return { value: value >>> 0, error: null };
    }

    readByteVarInt32() {
        let result = 0;

        for (let i = 0; i < MAX_VARINT32_BYTES; i++) {
            const byte = this._readByte();

            if (byte === null) {
                return { value: null, error: createMessageErrorFactory('message_length_varint_failure', 'Unexpected EOF while reading message length') };
            }

            result |= (byte & 0x7F) << (i * 7);

            if ((byte & 0x80) === 0) {
                return { value: result >>> 0, error: null };
            }
        }

        return { value: null, error: createMessageErrorFactory('message_length_invalid', 'Message length varint exceeded maximum length') };
    }

    canReadBytes(size) {
        return this._bitOffset + size * 8 <= this._buffer.length * 8;
    }

    skipBytes(size) {
        this._bitOffset += size * 8;
    }

    _readByte() {
        if (this._bitOffset + 8 > this._buffer.length * 8) {
            return null;
        }

        let value = 0;

        for (let i = 0; i < 8; i++) {
            value |= this._readBit() << i;
        }

        return value >>> 0;
    }

    _readBits(count) {
        if (this._bitOffset + count > this._buffer.length * 8) {
            return null;
        }

        let value = 0;

        for (let i = 0; i < count; i++) {
            value |= this._readBit() << i;
        }

        return value >>> 0;
    }

    _readBit() {
        const byteOffset = this._bitOffset >>> 3;
        const bitOffset = this._bitOffset & 7;
        const bit = (this._buffer[byteOffset] >>> bitOffset) & 1;

        this._bitOffset += 1;

        return bit;
    }
}

function createMessageErrorFactory(category, message) {
    return (parent, sourceOffset) => structuralError('message', category, message, sourceOffset, null, 'boundary_known', parent.tick);
}

function updateCommandSummary(summary, command) {
    summary.finalStructuralTick = command.tick;
    summary.finalStructuralSourceOffset = command.sourceOffsetEnd;
    summary.commandHistogram[command.commandId] = (summary.commandHistogram[command.commandId] ?? 0) + 1;

    if (command.commandName === null) {
        summary.unknownCommandIds[command.commandId] = (summary.unknownCommandIds[command.commandId] ?? 0) + 1;
    }

    if (!command.payloadComplete) {
        summary.malformedCommandCount += 1;
    }
}

function updateMessageSummary(summary, message) {
    summary.messagesEnumerated += 1;
    summary.messageHistogram[message.messageTypeId] = (summary.messageHistogram[message.messageTypeId] ?? 0) + 1;

    if (message.messageTypeName === null) {
        summary.unknownMessageIds[message.messageTypeId] = (summary.unknownMessageIds[message.messageTypeId] ?? 0) + 1;
    }

    if (!message.payloadComplete) {
        summary.malformedMessageCount += 1;
    }
}

function createSummary(fileSizeBytes) {
    return {
        fileSizeBytes,
        header: null,
        commandsParsed: 0,
        messagesEnumerated: 0,
        finalStructuralTick: null,
        finalStructuralSourceOffset: 0,
        byteCoverage: 0,
        completed: false,
        malformedCommandCount: 0,
        malformedMessageCount: 0,
        unknownCommandIds: {},
        unknownMessageIds: {},
        commandHistogram: {},
        messageHistogram: {},
        tickRegressions: 0,
        errors: [],
        truncatedByMaxRecords: false
    };
}

function structuralError(scope, errorCategory, rawError, sourceOffset, bytesRemaining = null, recoverability = 'none', tick = null) {
    return {
        recordType: 'structural_error',
        tick,
        sourceOffset,
        scope,
        errorCategory,
        rawError,
        recoverability,
        bytesRemaining,
        warnings: []
    };
}

function recordPassesBounds(record, options) {
    if (options.startTick !== null && record.tick !== null && record.tick < options.startTick) return false;
    if (options.endTick !== null && record.tick !== null && record.tick > options.endTick) return false;
    if (options.startOffset !== null && record.sourceOffsetEnd < options.startOffset) return false;
    if (options.endOffset !== null && record.sourceOffsetStart > options.endOffset) return false;

    return true;
}

function emitRecord(record, records, options) {
    if (options.outputSink !== null) {
        options.outputSink(record);
    } else {
        records.push(record);
    }
}

export default StructuralReplayInspector;
