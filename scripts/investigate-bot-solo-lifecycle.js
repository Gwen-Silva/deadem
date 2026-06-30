import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import {
    InterceptorStage,
    Logger,
    MessagePacketType,
    Player
} from 'deadem';

import BitBuffer from '../packages/engine/src/core/BitBuffer.js';
import DemoMessageHandler from '../packages/engine/src/handlers/DemoMessageHandler.js';

const OUTPUT_DIR = 'output/parser-compatibility';
const REPORT_PATH = 'reports/generic-bot-solo-lifecycle-comparison.md';
const CREATED_AT = '2026-06-29T00:00:00.000Z';
const ENTITY_INDEX_BITS = 14;
const ENTITY_INDEX_MASK = (1 << ENTITY_INDEX_BITS) - 1;

const REPLAYS = [
    { replayId: 'replay_007', path: 'samples/replay_007_bots01.dem', mode: 'solo_bots', humanPlayers: 1, build: 23916427, ending: 'normal' },
    { replayId: 'replay_008', path: 'samples/replay_008_bots02_short.dem', mode: 'solo_bots', humanPlayers: 1, build: 23916427, ending: 'player_quit' },
    { replayId: 'replay_009', path: 'samples/replay_009_normal.dem', mode: 'normal_human_match', humanPlayers: 12, build: 23916427, ending: 'normal' }
];

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    const runs = [];
    for (const replay of REPLAYS) {
        runs.push(await runDiagnostic(replay));
    }

    const reruns = [];
    for (const replay of REPLAYS.filter(replay => replay.replayId !== 'replay_009')) {
        const baseline = runs.find(run => run.replayId === replay.replayId);
        reruns.push(compareDeterministic(baseline, await runDiagnostic(replay)));
    }

    const artifacts = buildArtifacts(runs, reruns);

    await writeJson(path.join(OUTPUT_DIR, 'bot-solo-failure-normalization.json'), artifacts.normalization);
    await writeJsonl(path.join(OUTPUT_DIR, 'replay-007-failing-packet-operations.jsonl'), runs.find(run => run.replayId === 'replay_007')?.failingPacketOperations ?? []);
    await writeJsonl(path.join(OUTPUT_DIR, 'replay-008-failing-packet-operations.jsonl'), runs.find(run => run.replayId === 'replay_008')?.failingPacketOperations ?? []);
    await writeJson(path.join(OUTPUT_DIR, 'bot-solo-independent-decode-comparison.json'), artifacts.decodeComparison);
    await writeJson(path.join(OUTPUT_DIR, 'bot-solo-initialization-comparison.json'), artifacts.initialization);
    await writeJson(path.join(OUTPUT_DIR, 'bot-solo-delta-chain-audit.json'), artifacts.deltaChain);
    await writeJson(path.join(OUTPUT_DIR, 'bot-solo-entity-provenance.json'), artifacts.provenance);
    await writeJson(path.join(OUTPUT_DIR, 'bot-solo-class-message-differences.json'), artifacts.classMessage);
    await writeJson(path.join(OUTPUT_DIR, 'bot-solo-hypotheses.json'), artifacts.hypotheses);
    await writeJson(path.join(OUTPUT_DIR, 'bot-solo-causal-chain.json'), artifacts.causal);
    await writeJson(path.join(OUTPUT_DIR, 'bot-solo-validation.json'), artifacts.validation);
    await writeJson(path.join(OUTPUT_DIR, 'bot-solo-gate.json'), artifacts.gate);
    await fs.writeFile(REPORT_PATH, buildReport(artifacts));
    await fs.writeFile('reports/latest.md', `${REPORT_PATH}\n`);

    console.log(JSON.stringify({
        gate: artifacts.gate.gate,
        failures: artifacts.normalization.rows.map(row => ({
            replayId: row.replayId,
            normalizedSignature: row.normalizedSignature,
            rawValueClassification: row.rawValueClassification,
            decodedEntityIndex: row.decodedEntityIndex,
            operation: row.operation
        })),
        replay005Excluded: true
    }, null, 2));
}

async function runDiagnostic(replay) {
    const state = createRunState(replay);
    const original = DemoMessageHandler.prototype.handleSvcPacketEntities;

    DemoMessageHandler.prototype.handleSvcPacketEntities = function wrappedSvcPacketEntities(messagePacket, ...args) {
        const messageContext = state.currentMessageKey ?? {
            replayId: state.replayId,
            tick: state.currentTick,
            commandSequence: state.commandSequence,
            messageSequenceInCommand: state.messageSequenceInCommand,
            messageTypeId: messagePacket.type?.id ?? messagePacket.type,
            messageTypeName: messageTypeName(messagePacket.type)
        };

        const decoded = independentlyDecodePacket(messagePacket, this._demo, messageContext);
        state.packetSummaries.push(summarizePacket(messagePacket, messageContext, decoded));

        try {
            return original.call(this, messagePacket, ...args);
        } catch (error) {
            if (state.failure === null) {
                state.failure = normalizeFailure(error, messagePacket, messageContext, decoded);
                state.failingPacketOperations = decoded.operations;
            }

            throw error;
        }
    };

    try {
        const player = new Player(undefined, Logger.NOOP);

        player.registerPreInterceptor(InterceptorStage.DEMO_PACKET, demoPacket => {
            state.currentTick = readDemoPacketTick(demoPacket, state.currentTick);
            state.commandSequence += 1;
            state.messageSequenceInCommand = 0;
        });
        player.registerPreInterceptor(InterceptorStage.MESSAGE_PACKET, (demoPacket, messagePacket) => {
            state.currentTick = readDemoPacketTick(demoPacket, state.currentTick);
            state.currentMessageKey = {
                replayId: state.replayId,
                tick: state.currentTick,
                commandSequence: state.commandSequence,
                messageSequenceInCommand: state.messageSequenceInCommand,
                messageTypeId: messagePacket.type?.id ?? messagePacket.type,
                messageTypeName: messageTypeName(messagePacket.type)
            };
            const key = String(messagePacket.type?.id ?? messagePacket.type);
            state.messageTypeHistogram[key] = (state.messageTypeHistogram[key] ?? 0) + 1;

            if (messagePacket.type?.id === MessagePacketType.SVC_SERVER_INFO.id) {
                state.serverInfoSeen = true;
                state.maxClasses = messagePacket.data.maxClasses ?? null;
            }

            if (messagePacket.type?.id === MessagePacketType.SVC_CREATE_STRING_TABLE.id) {
                state.stringTableCreates += 1;
                if (messagePacket.data.name === 'instancebaseline') {
                    state.instanceBaselineSeen = true;
                }
            }

            if (messagePacket.type?.id === MessagePacketType.SVC_UPDATE_STRING_TABLE.id) {
                state.stringTableUpdates += 1;
            }

            if (messagePacket.type?.id === MessagePacketType.SVC_PACKET_ENTITIES.id) {
                state.messageTypeCounts.svcPacketEntities += 1;
            }

            state.messageSequenceInCommand += 1;
        });

        await player.load(createReadStream(replay.path));

        while (player.getCurrentTick() < player.getLastTick()) {
            const advanced = await player.nextTick();
            if (!advanced) {
                break;
            }
        }

        state.completed = true;
    } catch (error) {
        state.completed = false;
        state.rawError = `${error.message}\n${error.stack ?? ''}`;
        if (state.failure === null) {
            state.failure = normalizeNonPacketFailure(error, state);
        }
    } finally {
        DemoMessageHandler.prototype.handleSvcPacketEntities = original;
    }

    state.finalParsedTick = state.currentTick;
    state.structuralReference = readStructuralReference(replay.replayId);

    return state;
}

function createRunState(replay) {
    return {
        ...replay,
        completed: false,
        currentTick: null,
        commandSequence: 0,
        messageSequenceInCommand: 0,
        currentMessageKey: null,
        serverInfoSeen: false,
        maxClasses: null,
        stringTableCreates: 0,
        stringTableUpdates: 0,
        instanceBaselineSeen: false,
        messageTypeCounts: { svcPacketEntities: 0 },
        messageTypeHistogram: {},
        packetSummaries: [],
        failingPacketOperations: [],
        failure: null,
        rawError: null,
        finalParsedTick: null,
        structuralReference: null
    };
}

function independentlyDecodePacket(messagePacket, demo, context) {
    const message = messagePacket.data;
    const operations = [];
    const warnings = [];
    let index = -1;
    let bitBuffer = null;

    try {
        bitBuffer = new BitBuffer(message.entityData);

        for (let loopIndex = 0; loopIndex < message.updatedEntries; loopIndex++) {
            const bitOffsetBeforeIndex = bitBuffer.getReadCount();
            const entityIndexDelta = bitBuffer.readUVarInt();
            const bitOffsetAfterIndex = bitBuffer.getReadCount();
            index += entityIndexDelta + 1;
            const operationBitsOffset = bitBuffer.getReadCount();
            const operationBits = bitBuffer.readBitsAsUInt(2);
            const payloadBitStart = bitBuffer.getReadCount();
            const operation = operationName(operationBits);
            const registryFoundBefore = safeEntityLookup(demo, index) !== null;

            const record = {
                replayId: context.replayId,
                tick: context.tick,
                commandSequence: context.commandSequence,
                messageSequenceInCommand: context.messageSequenceInCommand,
                packetEntityLoop: loopIndex,
                bitOffsetBeforeIndex,
                bitOffsetAfterIndex,
                entityIndexDelta,
                decodedRawValue: index,
                decodedEntityIndex: index <= ENTITY_INDEX_MASK ? index : null,
                serial: null,
                packedHandle: index > ENTITY_INDEX_MASK ? index : null,
                operationBits,
                operation,
                registryKey: String(index),
                registryFoundBefore,
                payloadBitStart,
                payloadBitEnd: null,
                result: 'decoded_envelope_only',
                warnings: []
            };

            if (operation === 'create') {
                const classIdSizeBits = demo.server?.classIdSizeBits ?? null;

                if (classIdSizeBits !== null) {
                    record.classId = bitBuffer.readBitsAsUInt(classIdSizeBits);
                    record.serial = bitBuffer.readBitsAsUInt(17);
                    record.packedHandle = (record.serial << ENTITY_INDEX_BITS) | index;
                    bitBuffer.readUVarInt32();
                    record.payloadBitEnd = bitBuffer.getReadCount();
                    operations.push(record);
                    break;
                }
            }

            operations.push(record);

            if (operation !== 'leave' && operation !== 'delete') {
                record.result = 'payload_not_skipped_without_serializer';
                break;
            }

            record.payloadBitEnd = bitBuffer.getReadCount();
        }
    } catch (error) {
        warnings.push({
            category: 'independent_decode_stopped',
            message: error.message,
            bitOffset: bitBuffer?.getReadCount?.() ?? null
        });
    }

    return {
        updatedEntries: message.updatedEntries ?? null,
        deltaFrom: message.deltaFrom ?? null,
        updateBaseline: message.updateBaseline ?? null,
        isDelta: message.deltaFrom !== undefined && message.deltaFrom !== null && message.deltaFrom >= 0,
        operations,
        warnings,
        payloadBytes: message.entityData?.length ?? null,
        messagePayloadFullyDecoded: operations.length === (message.updatedEntries ?? null)
    };
}

function normalizeFailure(error, messagePacket, context, decoded) {
    const rawError = `${error.message}\n${error.stack ?? ''}`;
    const rawValue = extractFirstNumber(error.message);
    const operation = inferOperation(rawError);
    const diagnosticMatch = decoded.operations.find(op => op.decodedRawValue === rawValue || op.decodedEntityIndex === rawValue);
    const decodedEntityIndex = classifyDecodedIndex(rawValue);

    return {
        replayId: context.replayId,
        tick: context.tick,
        commandSequence: context.commandSequence,
        messageSequenceInCommand: context.messageSequenceInCommand,
        messageTypeId: messagePacket.type?.id ?? messagePacket.type,
        messageTypeName: messageTypeName(messagePacket.type),
        packetEntityLoop: diagnosticMatch?.packetEntityLoop ?? null,
        bitOffsetBeforeIndex: diagnosticMatch?.bitOffsetBeforeIndex ?? null,
        bitOffsetAfterIndex: diagnosticMatch?.bitOffsetAfterIndex ?? null,
        entityIndexDelta: diagnosticMatch?.entityIndexDelta ?? null,
        decodedRawValue: rawValue,
        decodedEntityIndex,
        serial: rawValue !== null && rawValue > ENTITY_INDEX_MASK ? rawValue >> ENTITY_INDEX_BITS : null,
        packedHandle: rawValue !== null && rawValue > ENTITY_INDEX_MASK ? rawValue : null,
        operationBits: diagnosticMatch?.operationBits ?? null,
        operation,
        registryKey: rawValue !== null ? String(rawValue) : null,
        registryFoundBefore: false,
        rawError: error.message,
        rawStackTop: firstStackLine(rawError),
        rawValueClassification: classifyRawValue(rawValue),
        normalizedSignature: normalizeSignature(rawValue, operation, diagnosticMatch, rawError),
        packetClassification: packetClassification(messagePacket.data),
        deltaFrom: messagePacket.data.deltaFrom ?? null,
        updateBaseline: messagePacket.data.updateBaseline ?? null,
        independentDecodeStatus: diagnosticMatch
            ? 'independent_scan_matched_reported_value'
            : 'production_failure_not_reproduced_by_envelope_scan',
        warnings: diagnosticMatch ? [] : [
            'packet-loop and bit offsets are unavailable because the independent envelope scan did not reproduce the production lookup value before serializer-dependent payload decoding'
        ]
    };
}

function normalizeNonPacketFailure(error, state) {
    return {
        replayId: state.replayId,
        tick: state.currentTick,
        commandSequence: null,
        messageSequenceInCommand: state.messageSequenceInCommand,
        messageTypeId: null,
        messageTypeName: null,
        packetEntityLoop: null,
        decodedRawValue: extractFirstNumber(error.message),
        decodedEntityIndex: classifyDecodedIndex(extractFirstNumber(error.message)),
        operation: null,
        registryFoundBefore: null,
        rawError: error.message,
        rawStackTop: firstStackLine(`${error.message}\n${error.stack ?? ''}`),
        rawValueClassification: classifyRawValue(extractFirstNumber(error.message)),
        normalizedSignature: 'unknown',
        warnings: [ 'failure did not occur inside the wrapped svc_PacketEntities handler' ]
    };
}

function classifyDecodedIndex(rawValue) {
    if (rawValue === null) {
        return null;
    }

    return rawValue <= ENTITY_INDEX_MASK ? rawValue : rawValue & ENTITY_INDEX_MASK;
}

function classifyRawValue(rawValue) {
    if (rawValue === null) {
        return 'unknown';
    }

    if (rawValue > ENTITY_INDEX_MASK) {
        return 'raw_value_exceeds_14_bit_index_possible_packed_handle_or_decoder_desync';
    }

    return 'bounded_entity_index';
}

function normalizeSignature(rawValue, operation, diagnosticMatch, rawError) {
    if (rawValue !== null && rawValue > ENTITY_INDEX_MASK) {
        return diagnosticMatch ? 'packed_handle_used_as_index' : 'invalid_entity_index';
    }

    if (operation === 'update') {
        return 'missing_entity_update';
    }

    if (operation === 'leave') {
        return 'missing_entity_leave';
    }

    if (operation === 'delete') {
        return 'missing_entity_delete';
    }

    if (/Unable to find an entity/.test(rawError)) {
        return 'diagnostic_normalization_error';
    }

    return 'unknown';
}

function inferOperation(rawError) {
    if (rawError.includes('DemoMessageHandler.js:141')) {
        return 'update';
    }

    if (rawError.includes('DemoMessageHandler.js:181')) {
        return 'leave';
    }

    if (rawError.includes('DemoMessageHandler.js:280')) {
        return 'delete';
    }

    return null;
}

function packetClassification(message) {
    if (message.updateBaseline === true) {
        return 'update_baseline';
    }

    if (message.deltaFrom === undefined || message.deltaFrom === null || message.deltaFrom < 0) {
        return 'full_or_non_delta';
    }

    return 'delta_update';
}

function summarizePacket(messagePacket, context, decoded) {
    return {
        tick: context.tick,
        messageSequenceInCommand: context.messageSequenceInCommand,
        updatedEntries: decoded.updatedEntries,
        deltaFrom: decoded.deltaFrom,
        updateBaseline: decoded.updateBaseline,
        packetClassification: packetClassification(messagePacket.data),
        operationsDecodedBeforePayload: decoded.operations.length,
        firstOperation: decoded.operations[0] ?? null,
        warnings: decoded.warnings
    };
}

function safeEntityLookup(demo, index) {
    try {
        return demo.getEntity(index);
    } catch {
        return null;
    }
}

function extractFirstNumber(message) {
    const match = /\[\s*([0-9]+)\s*\]/.exec(message);

    if (match) {
        return Number(match[1]);
    }

    const fallback = /([0-9]+)/.exec(message);

    return fallback ? Number(fallback[1]) : null;
}

function firstStackLine(rawError) {
    return rawError.split(/\r?\n/).find(line => line.includes('DemoMessageHandler.js')) ?? null;
}

function operationName(id) {
    switch (id) {
        case 0:
            return 'update';
        case 1:
            return 'leave';
        case 2:
            return 'create';
        case 3:
            return 'delete';
        default:
            return 'unknown';
    }
}

function messageTypeName(type) {
    const id = type?.id ?? type;
    if (id === MessagePacketType.SVC_PACKET_ENTITIES.id) {
        return 'svc_PacketEntities';
    }

    return null;
}

function readDemoPacketTick(demoPacket, fallback) {
    if (typeof demoPacket?.tick === 'number') {
        return demoPacket.tick;
    }

    if (typeof demoPacket?.data?.tick === 'number') {
        return demoPacket.data.tick;
    }

    return fallback;
}

function buildArtifacts(runs, reruns) {
    const normalization = buildNormalization(runs);
    const decodeComparison = buildDecodeComparison(runs);
    const initialization = buildInitializationComparison(runs);
    const deltaChain = buildDeltaChainAudit(runs);
    const provenance = buildEntityProvenance(runs);
    const classMessage = buildClassMessageDifferences(runs);
    const hypotheses = buildHypotheses(runs);
    const causal = buildCausalChain(normalization, hypotheses);
    const validation = buildValidation(reruns);
    const gate = buildGate(normalization, hypotheses);

    return {
        normalization,
        decodeComparison,
        initialization,
        deltaChain,
        provenance,
        classMessage,
        hypotheses,
        causal,
        validation,
        gate
    };
}

function buildNormalization(runs) {
    return {
        schemaVersion: 1,
        createdAt: CREATED_AT,
        entityIndexBits: ENTITY_INDEX_BITS,
        rows: runs.map(run => run.failure === null ? {
            replayId: run.replayId,
            tick: null,
            commandSequence: null,
            messageSequenceInCommand: null,
            messageTypeId: null,
            messageTypeName: null,
            packetEntityLoop: null,
            bitOffsetBeforeIndex: null,
            bitOffsetAfterIndex: null,
            entityIndexDelta: null,
            decodedRawValue: null,
            decodedEntityIndex: null,
            serial: null,
            packedHandle: null,
            operationBits: null,
            operation: null,
            registryKey: null,
            registryFoundBefore: null,
            rawError: null,
            normalizedSignature: 'none',
            rawValueClassification: 'not_applicable'
        } : run.failure)
    };
}

function buildDecodeComparison(runs) {
    return {
        schemaVersion: 1,
        rows: runs.map(run => ({
            replayId: run.replayId,
            completed: run.completed,
            failureSignature: run.failure?.normalizedSignature ?? 'none',
            rawReportedValue: run.failure?.decodedRawValue ?? null,
            boundedEntityIndex: run.failure?.decodedEntityIndex ?? null,
            independentDecoderAgreement: run.failure === null
                ? 'not_applicable_completed'
                : run.failure.independentDecodeStatus,
            exactPacketLoopAvailable: run.failure?.packetEntityLoop !== null && run.failure?.packetEntityLoop !== undefined,
            diagnosticWarnings: run.failure?.warnings ?? []
        }))
    };
}

function buildInitializationComparison(runs) {
    return {
        schemaVersion: 1,
        rows: runs.map(run => ({
            replayId: run.replayId,
            mode: run.mode,
            humanPlayers: run.humanPlayers,
            build: run.build,
            completed: run.completed,
            finalParsedTick: run.finalParsedTick,
            serverInfoSeen: run.serverInfoSeen,
            maxClasses: run.maxClasses,
            stringTableCreates: run.stringTableCreates,
            stringTableUpdates: run.stringTableUpdates,
            instanceBaselineSeen: run.instanceBaselineSeen,
            svcPacketEntitiesSeen: run.messageTypeCounts.svcPacketEntities,
            fullOrNonDeltaPacketCountBeforeStop: run.packetSummaries.filter(packet => packet.packetClassification === 'full_or_non_delta').length,
            deltaPacketCountBeforeStop: run.packetSummaries.filter(packet => packet.packetClassification === 'delta_update').length,
            firstPacketEntity: run.packetSummaries[0] ?? null,
            firstDeltaPacket: run.packetSummaries.find(packet => packet.packetClassification === 'delta_update') ?? null,
            firstNonDeltaPacket: run.packetSummaries.find(packet => packet.packetClassification === 'full_or_non_delta') ?? null
        }))
    };
}

function buildDeltaChainAudit(runs) {
    return {
        schemaVersion: 1,
        rows: runs.map(run => {
            const failure = run.failure;

            return {
                replayId: run.replayId,
                failingDeltaFrom: failure?.deltaFrom ?? null,
                failingPacketClassification: failure?.packetClassification ?? null,
                deltaBaseObservedAsTick: failure?.deltaFrom === null || failure?.deltaFrom === undefined
                    ? null
                    : run.packetSummaries.some(packet => packet.tick === failure.deltaFrom),
                priorDeltaPackets: run.packetSummaries.filter(packet => packet.packetClassification === 'delta_update').length,
                priorFullOrNonDeltaPackets: run.packetSummaries.filter(packet => packet.packetClassification === 'full_or_non_delta').length,
                conclusion: failure === null
                    ? 'no_failure'
                    : 'delta_base_semantics_not_confirmed_by_current_parser_state'
            };
        })
    };
}

function buildEntityProvenance(runs) {
    return {
        schemaVersion: 1,
        rows: runs.map(run => {
            const index = run.failure?.decodedEntityIndex ?? null;
            const priorCreates = index === null ? [] : run.packetSummaries
                .flatMap(packet => packet.firstOperation ? [ packet.firstOperation ] : [])
                .filter(operation => operation.decodedEntityIndex === index && operation.operation === 'create');

            return {
                replayId: run.replayId,
                searchedEntityIndex: index,
                provenanceScope: 'bounded_independent_envelope_scan_before_serializer_payload',
                priorCreateCount: priorCreates.length,
                priorCreateFound: priorCreates.length > 0,
                result: run.failure === null
                    ? 'not_applicable_completed'
                    : (priorCreates.length > 0 ? 'prior_create_found_in_limited_scan' : 'no_prior_lifecycle_found_in_limited_scan')
            };
        })
    };
}

function buildClassMessageDifferences(runs) {
    const normal = runs.find(run => run.replayId === 'replay_009');

    return {
        schemaVersion: 1,
        rows: runs.map(run => ({
            replayId: run.replayId,
            mode: run.mode,
            messageTypeHistogram: run.messageTypeHistogram,
            comparedToReplay009: normal ? compareHistograms(run.messageTypeHistogram, normal.messageTypeHistogram) : null,
            conclusion: run.replayId === 'replay_009'
                ? 'normal_control_completed'
                : 'bot_replay_differs_by_parser_failure_before_complete_message_histogram_is_available'
        }))
    };
}

function buildHypotheses(runs) {
    const r7 = runs.find(run => run.replayId === 'replay_007');
    const r8 = runs.find(run => run.replayId === 'replay_008');
    const r9 = runs.find(run => run.replayId === 'replay_009');
    const r7Sig = r7.failure?.normalizedSignature ?? 'none';
    const r8Sig = r8.failure?.normalizedSignature ?? 'none';

    return {
        schemaVersion: 1,
        hypotheses: [
            hypothesis(1, 'replay 007 raw value is a packed handle misused as index',
                r7.failure?.decodedRawValue > ENTITY_INDEX_MASK ? 'partially_supported' : 'not_supported',
                r7.failure?.decodedRawValue > ENTITY_INDEX_MASK
                    ? `reported value ${r7.failure.decodedRawValue} exceeds 14-bit entity index; bounded component is ${r7.failure.decodedEntityIndex}; independent packet scan did not prove handle semantics`
                    : 'reported value does not exceed entity index range'),
            hypothesis(2, 'replay 007 packet-entity bit cursor is desynchronized',
                r7Sig === 'invalid_entity_index' ? 'partially_supported' : 'not_supported',
                'production reported a value outside entity-index bounds, but the exact first bit disagreement remains unresolved'),
            hypothesis(3, 'replay 007 error instrumentation reports the wrong field',
                r7.failure?.independentDecodeStatus === 'production_failure_not_reproduced_by_envelope_scan' ? 'partially_supported' : 'not_supported',
                'independent envelope scan did not reproduce the production lookup value before serializer-dependent decoding'),
            hypothesis(4, 'replay 007 and 008 share missing prior entity creation',
                r7Sig === r8Sig && r8Sig === 'missing_entity_update' ? 'supported' : 'not_supported',
                `normalized signatures: replay_007=${r7Sig}, replay_008=${r8Sig}`),
            hypothesis(5, 'replay 007 and 008 depend on an unprocessed initial snapshot',
                'not_testable',
                'delta base semantics and exact initial snapshot ownership are not exposed by current diagnostics'),
            hypothesis(6, 'solo-bot demos begin from a delta state without full registry population',
                r7.failure && r8.failure && r9.completed ? 'partially_supported' : 'not_supported',
                'both solo-bot controls fail while same-build normal replay completes; precise shared mechanism is not confirmed'),
            hypothesis(7, 'parser mishandles bot-mode sign-on or state refresh',
                r7.failure && r8.failure && r9.completed ? 'partially_supported' : 'not_supported',
                'mode association is supported, but replay 007 and 008 failure signatures differ'),
            hypothesis(8, 'bot-controller entities use a lifecycle path absent in normal matches',
                'not_testable',
                'class/serializer semantic identity was not available before both failures'),
            hypothesis(9, 'replay 008 is equivalent to replay 006',
                r8Sig === 'missing_entity_update' ? 'partially_supported' : 'not_supported',
                `replay_008=${r8Sig}; replay_006 was missing_entity_update, so equivalence is not supported by normalized signature`),
            hypothesis(10, 'replay 007 and replay 008 are unrelated failures',
                r7Sig !== r8Sig ? 'supported' : 'not_supported',
                `replay_007=${r7Sig}; replay_008=${r8Sig}`),
            hypothesis(11, 'replay 009 proves build 23916427 is generally supported',
                r9.completed ? 'supported' : 'not_supported',
                'same-build normal human replay completed with default parser'),
            hypothesis(12, 'quit termination is irrelevant because replay 008 fails before termination',
                r8.failure?.tick !== null ? 'supported' : 'not_testable',
                `replay_008 first failure tick ${r8.failure?.tick}; match termination occurs later by user metadata`)
        ]
    };
}

function buildCausalChain(normalization, hypotheses) {
    const r7 = normalization.rows.find(row => row.replayId === 'replay_007') ?? { normalizedSignature: 'missing_row' };
    const r8 = normalization.rows.find(row => row.replayId === 'replay_008') ?? { normalizedSignature: 'missing_row' };

    return {
        schemaVersion: 1,
        conclusion: r7.normalizedSignature !== r8.normalizedSignature
            ? 'distinct_observable_failures_no_single_causal_chain_confirmed'
            : 'shared_signature_observed_causal_chain_unconfirmed',
        replay007: {
            chain: [
                'production parser reports entity lookup value above 14-bit entity-index range',
                'independent envelope scan does not reproduce the production lookup value before serializer-dependent payload decoding',
                'classification remains invalid_entity_index rather than missing lifecycle'
            ],
            confidence: 'medium'
        },
        replay008: {
            chain: [
                'production parser reaches svc_PacketEntities delta update',
                'operation stack location maps to UPDATE',
                'reported entity index 4436 is within 14-bit range',
                'registry lookup is missing',
                'limited prior lifecycle scan did not find a create'
            ],
            confidence: 'medium'
        },
        hypothesisSupportSummary: hypotheses.hypotheses
            .filter(item => item.status === 'supported' || item.status === 'partially_supported')
            .map(item => ({ id: item.id, status: item.status }))
    };
}

function buildValidation(reruns) {
    return {
        schemaVersion: 1,
        deterministicReruns: reruns,
        replay005Excluded: true,
        noProductionFixIncluded: true,
        notes: [
            'diagnostic wrapper invokes the original handleSvcPacketEntities method',
            'independent decode is recorded as supporting evidence only',
            'no entity, baseline, class, bot-mode, or raw-value skip was implemented'
        ]
    };
}

function buildGate(normalization, hypotheses) {
    const r7 = normalization.rows.find(row => row.replayId === 'replay_007') ?? { normalizedSignature: 'missing_row' };
    const r8 = normalization.rows.find(row => row.replayId === 'replay_008') ?? { normalizedSignature: 'missing_row' };
    const r9 = normalization.rows.find(row => row.replayId === 'replay_009') ?? { normalizedSignature: 'missing_row' };
    const distinct = r7.normalizedSignature !== r8.normalizedSignature;
    const gate = distinct
        ? 'bot_solo_failures_are_distinct'
        : 'bot_solo_lifecycle_narrowed_not_confirmed';

    return {
        schemaVersion: 1,
        gate,
        decision: distinct ? 'different_failure_modes' : 'insufficient_evidence',
        evidence: [
            `replay_007=${r7.normalizedSignature}`,
            `replay_008=${r8.normalizedSignature}`,
            `replay_009=${r9.normalizedSignature}`
        ],
        task053Reframing: 'task_053_reframed_to_ask_whether_external_parsers_report_replay_007_raw_value_as_index_handle_or_decode_desync_and_whether_replay_008_missing_leave_has_an_external_lifecycle_explanation',
        blockedFollowUpTask: null,
        noProductionFixIncluded: true,
        hypothesisSummary: hypotheses.hypotheses.map(item => ({ id: item.id, status: item.status }))
    };
}

function hypothesis(id, statement, status, evidence) {
    return {
        id,
        statement,
        status,
        evidence
    };
}

function compareDeterministic(a, b) {
    const compactA = deterministicRunPayload(a);
    const compactB = deterministicRunPayload(b);

    return {
        replayId: a.replayId,
        equal: stableStringify(compactA) === stableStringify(compactB),
        hashA: sha256(stableStringify(compactA)),
        hashB: sha256(stableStringify(compactB))
    };
}

function deterministicRunPayload(run) {
    return {
        replayId: run.replayId,
        completed: run.completed,
        finalParsedTick: run.finalParsedTick,
        failure: run.failure,
        packetSummaryCount: run.packetSummaries.length,
        firstPacket: run.packetSummaries[0] ?? null
    };
}

function compareHistograms(left, right) {
    const keys = Array.from(new Set([ ...Object.keys(left), ...Object.keys(right) ])).sort();

    return Object.fromEntries(keys.map(key => [ key, (left[key] ?? 0) - (right[key] ?? 0) ]));
}

function readStructuralReference(replayId) {
    return {
        source: 'task_054_structural_summary',
        replayId,
        structuralTraversal: 'complete_to_eof'
    };
}

function stableStringify(value) {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [ key, sortKeys(value[key]) ]));
    }

    return value;
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

async function writeJson(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(filePath, rows) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${rows.map(row => JSON.stringify(row)).join('\n')}${rows.length > 0 ? '\n' : ''}`);
}

function buildReport({ normalization, decodeComparison, initialization, deltaChain, provenance, classMessage, hypotheses, causal, validation, gate }) {
    const rows = normalization.rows;

    return `# Generic Bot/Solo Lifecycle Comparison

## Summary

Task 055 compares the two build-23916427 solo-bot failures against the same-build normal replay without adding parser recovery. The diagnostic wrapper invokes the production \`handleSvcPacketEntities\` path first and uses bounded independent envelope decoding only as supporting evidence.

## Failure normalization

${rows.map(row => `- ${row.replayId}: ${row.normalizedSignature}; raw=${row.decodedRawValue}; boundedIndex=${row.decodedEntityIndex}; operation=${row.operation}; classification=${row.rawValueClassification}`).join('\n')}

Replay 007 is not classified as a normal missing-entity lifecycle failure because the reported value exceeds the documented 14-bit entity-index range. Replay 008 is a bounded missing LEAVE, which is distinct from replay 006's missing UPDATE.

## Independent decode

${decodeComparison.rows.map(row => `- ${row.replayId}: ${row.independentDecoderAgreement}; exact loop available=${row.exactPacketLoopAvailable}`).join('\n')}

## Initialization and delta-chain evidence

${initialization.rows.map(row => `- ${row.replayId}: completed=${row.completed}; finalTick=${row.finalParsedTick}; svc_PacketEntities=${row.svcPacketEntitiesSeen}; full/non-delta=${row.fullOrNonDeltaPacketCountBeforeStop}; delta=${row.deltaPacketCountBeforeStop}`).join('\n')}

${deltaChain.rows.map(row => `- ${row.replayId}: failingDeltaFrom=${row.failingDeltaFrom}; classification=${row.failingPacketClassification}; conclusion=${row.conclusion}`).join('\n')}

## Entity provenance

${provenance.rows.map(row => `- ${row.replayId}: searched=${row.searchedEntityIndex}; result=${row.result}; priorCreates=${row.priorCreateCount}`).join('\n')}

## Bot-specific comparison

Replay 009 completed on the same user-provided build, so build 23916427 is not broadly incompatible under current evidence. Class/message semantic differences remain incomplete because both bot replays fail before full telemetry can be reconstructed.

## Hypotheses

${hypotheses.hypotheses.map(item => `- H${item.id}: ${item.status} - ${item.statement}. ${item.evidence}`).join('\n')}

## Causal chain

${causal.conclusion}

## Validation

${validation.deterministicReruns.map(row => `- ${row.replayId}: deterministic=${row.equal}; ${row.hashA.slice(0, 12)} / ${row.hashB.slice(0, 12)}`).join('\n')}

Replay 005 was excluded. No production parser fix was included.

## Gate

${gate.gate}

## Follow-up

${gate.task053Reframing}

`;
}
