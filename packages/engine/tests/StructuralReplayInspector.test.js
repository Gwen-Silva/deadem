import { describe, expect, test, vi } from 'vitest';

import StructuralReplayInspector from '#src/StructuralReplayInspector.js';

const HEADER = Buffer.from('PBDEMS2\0\0\0\0\0\0\0\0\0', 'binary');

describe('StructuralReplayInspector', () => {
    test('It reports a valid replay header and command envelope', async () => {
        const replay = buildReplay([
            command(7, 10, Buffer.from([ 1, 2, 3 ]))
        ]);

        const result = await StructuralReplayInspector.inspectReplayStructure(replay, {
            commandsOnly: true,
            registry: registry()
        });

        expect(result.header.valid).toBe(true);
        expect(result.records).toHaveLength(1);
        expect(result.records[0]).toMatchObject({
            recordType: 'command',
            sequence: 0,
            commandId: 7,
            commandName: 'DEM_Packet',
            tick: 10,
            declaredPayloadSize: 3,
            actualPayloadSize: 3,
            payloadComplete: true
        });
    });

    test('It reports a truncated replay header structurally', async () => {
        const result = await StructuralReplayInspector.inspectReplayStructure(Buffer.from([ 1, 2 ]));

        expect(result.records[0]).toMatchObject({
            recordType: 'structural_error',
            scope: 'header',
            errorCategory: 'header_truncated'
        });
    });

    test('It reports command varint and payload truncation failures', async () => {
        const varintResult = await StructuralReplayInspector.inspectReplayStructure(Buffer.concat([ HEADER, Buffer.from([ 0x80 ]) ]));
        const payloadResult = await StructuralReplayInspector.inspectReplayStructure(Buffer.concat([ HEADER, encodeVarInt(7), encodeVarInt(1), encodeVarInt(3), Buffer.from([ 1 ]) ]));

        expect(varintResult.records[0].errorCategory).toBe('command_varint_failure');
        expect(payloadResult.records[0].errorCategory).toBe('command_payload_truncated');
    });

    test('It preserves unknown command IDs', async () => {
        const result = await StructuralReplayInspector.inspectReplayStructure(buildReplay([
            command(19, 1, Buffer.alloc(0))
        ]), { commandsOnly: true, registry: registry() });

        expect(result.records[0]).toMatchObject({
            commandId: 19,
            commandName: null,
            warnings: [ 'unknown_demo_command' ]
        });
    });

    test('It reports non-monotonic ticks without aborting structural traversal', async () => {
        const result = await StructuralReplayInspector.inspectReplayStructure(buildReplay([
            command(7, 2, Buffer.alloc(0)),
            command(7, 1, Buffer.alloc(0))
        ]), { commandsOnly: true, registry: registry() });

        expect(result.records.map(r => r.recordType)).toEqual([ 'command', 'command' ]);
        expect(result.records[1].warnings).toContain('non_monotonic_tick');
        expect(result.summary.tickRegressions).toBe(1);
    });

    test('It enumerates embedded message type and length envelopes', async () => {
        const messages = encodeMessageStream([
            { type: 4, payload: Buffer.from([ 1, 2 ]) },
            { type: 999, payload: Buffer.from([ 3 ]) }
        ]);

        const result = await StructuralReplayInspector.inspectReplayStructure(buildReplay([
            command(7, 3, Buffer.from([ 9, 9, 9 ]))
        ]), { registry: registry(messages) });

        const messageRecords = result.records.filter(r => r.recordType === 'message');

        expect(messageRecords).toHaveLength(2);
        expect(messageRecords[0]).toMatchObject({
            messageTypeId: 4,
            messageTypeName: 'net_Tick',
            declaredPayloadSize: 2,
            actualPayloadSize: 2,
            payloadComplete: true,
            decodeScope: 'envelope_only'
        });
        expect(messageRecords[1]).toMatchObject({
            messageTypeId: 999,
            messageTypeName: null,
            warnings: [ 'unknown_message_id' ]
        });
    });

    test('It reports truncated embedded messages', async () => {
        const messages = encodeMessageHeader(4, 10);
        const result = await StructuralReplayInspector.inspectReplayStructure(buildReplay([
            command(7, 3, Buffer.from([ 9 ]))
        ]), { registry: registry(messages) });

        expect(result.summary.malformedMessageCount).toBe(1);
        expect(result.records.some(r => r.recordType === 'structural_error' && r.errorCategory === 'message_payload_truncated')).toBe(true);
    });

    test('It supports commands-only, bounded tick, bounded offset, and deterministic output', async () => {
        const replay = buildReplay([
            command(7, 1, Buffer.from([ 1 ])),
            command(7, 2, Buffer.from([ 2 ])),
            command(7, 3, Buffer.from([ 3 ]))
        ]);
        const first = await StructuralReplayInspector.inspectReplayStructure(replay, { commandsOnly: true, startTick: 2, endTick: 2, registry: registry() });
        const second = await StructuralReplayInspector.inspectReplayStructure(replay, { commandsOnly: true, startTick: 2, endTick: 2, registry: registry() });
        const offsetBounded = await StructuralReplayInspector.inspectReplayStructure(replay, { commandsOnly: true, startOffset: 16, endOffset: 20, registry: registry() });

        expect(first.records.map(r => r.tick)).toEqual([ 2 ]);
        expect(JSON.stringify(first)).toBe(JSON.stringify(second));
        expect(offsetBounded.records.length).toBeGreaterThan(0);
    });

    test('It does not invoke entity, baseline, class, or message body decoding paths', async () => {
        const forbidden = vi.fn(() => {
            throw new Error('forbidden state materialization');
        });
        const fakeRegistry = registry(encodeMessageStream([ { type: 4, payload: Buffer.from([ 1 ]) } ]));

        fakeRegistry.resolveEntity = forbidden;
        fakeRegistry.resolveClass = forbidden;
        fakeRegistry.resolveBaseline = forbidden;

        await StructuralReplayInspector.inspectReplayStructure(buildReplay([
            command(7, 1, Buffer.from([ 1 ]))
        ]), { registry: fakeRegistry });

        expect(forbidden).not.toHaveBeenCalled();
    });
});

function registry(messageData = Buffer.alloc(0)) {
    const packetType = { id: 7, code: 'DEM_Packet', heavy: true };
    const messageType = { id: 4, code: 'net_Tick' };

    return {
        resolveDemoType(id) {
            return id === 7 ? packetType : null;
        },
        getDemoProto(type) {
            return type === packetType ? { decode: () => ({ data: messageData }) } : null;
        },
        resolveMessageType(id) {
            return id === 4 ? messageType : null;
        }
    };
}

function buildReplay(commands) {
    return Buffer.concat([ HEADER, ...commands ]);
}

function command(type, tick, payload) {
    return Buffer.concat([
        encodeVarInt(type),
        encodeVarInt(tick),
        encodeVarInt(payload.length),
        payload
    ]);
}

function encodeMessageStream(messages) {
    const bits = [];

    for (const { type, payload } of messages) {
        writeMessageType(bits, type);
        writeByteVarInt(bits, payload.length);

        for (const byte of payload) {
            writeBits(bits, byte, 8);
        }
    }

    return bitsToBuffer(bits);
}

function encodeMessageHeader(type, length) {
    const bits = [];

    writeMessageType(bits, type);
    writeByteVarInt(bits, length);

    return bitsToBuffer(bits);
}

function writeMessageType(bits, value) {
    if (value < 16) {
        writeBits(bits, value, 6);
    } else if (value < 256) {
        writeBits(bits, (value & 15) | 16, 6);
        writeBits(bits, value >>> 4, 4);
    } else if (value < 4096) {
        writeBits(bits, (value & 15) | 32, 6);
        writeBits(bits, value >>> 4, 8);
    } else {
        writeBits(bits, (value & 15) | 48, 6);
        writeBits(bits, value >>> 4, 28);
    }
}

function writeByteVarInt(bits, value) {
    let remaining = value;

    while (remaining >= 0x80) {
        writeBits(bits, (remaining & 0x7F) | 0x80, 8);
        remaining >>>= 7;
    }

    writeBits(bits, remaining, 8);
}

function writeBits(bits, value, count) {
    for (let i = 0; i < count; i += 1) {
        bits.push((value >>> i) & 1);
    }
}

function bitsToBuffer(bits) {
    const buffer = Buffer.alloc(Math.ceil(bits.length / 8));

    for (let i = 0; i < bits.length; i += 1) {
        buffer[i >>> 3] |= bits[i] << (i & 7);
    }

    return buffer;
}

function encodeVarInt(value) {
    const bytes = [];
    let remaining = value >>> 0;

    while (remaining >= 0x80) {
        bytes.push((remaining & 0x7F) | 0x80);
        remaining >>>= 7;
    }

    bytes.push(remaining);

    return Buffer.from(bytes);
}
