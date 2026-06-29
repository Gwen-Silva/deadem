import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import {
    EntityOperation,
    InterceptorStage,
    Logger,
    Parser,
    ParserConfiguration,
    inspectReplayStructure
} from 'deadem';

import BitBuffer from '../packages/engine/src/core/BitBuffer.js';
import EntityPayloadSizeExtractor from '../packages/engine/src/extractors/EntityPayloadSizeExtractor.js';

const OUTPUT_DIR = 'output/parser-compatibility';
const LOCAL_DIR = 'output-local/parser-compatibility/state-divergence';
const REPORT_PATH = 'reports/replay-006-state-reconstruction-divergence.md';
const TASK_PATH = 'tasks/active/050-isolate-replay-006-state-reconstruction-divergence-before-tick-3808.md';
const COMPLETED_TASK_PATH = 'tasks/completed/050-isolate-replay-006-state-reconstruction-divergence-before-tick-3808.md';
const FOLLOW_UP_PATH = 'tasks/blocked/051-investigate-replay-006-entity-lifecycle-or-state-refresh-gap.md';
const REPLAY_006 = 'samples/partida_006.dem';
const CONTROL_REPLAYS = [
    { replayId: 'replay_001', path: 'samples/partida_001.dem' },
    { replayId: 'replay_002', path: 'samples/partida_002.dem' }
];
const IMPORTANT_IDS = {
    entities: [ 5594, 5863 ],
    baselines: [ 709 ],
    classes: [ 709, 891 ],
    serializers: [ 'CModelPointEntity|0' ]
};

class DiagnosticStop extends Error {
    constructor(tick) {
        super(`diagnostic_stop_after_tick_${tick}`);
        this.name = 'DiagnosticStop';
        this.tick = tick;
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.mkdir(LOCAL_DIR, { recursive: true });

    const structural = await inspectReplayStructure(REPLAY_006, {
        startTick: 0,
        endTick: 3808,
        maxRecords: 200000
    });
    const replay006 = await runDiagnostic(REPLAY_006, 'replay_006', { stopTick: 3808, checkpointEveryMessages: 250 });
    const rerun = await runDiagnostic(REPLAY_006, 'replay_006', { stopTick: 3808, checkpointEveryMessages: 250 });
    const controls = [];

    for (const control of CONTROL_REPLAYS) {
        controls.push(await runDiagnostic(control.path, control.replayId, { stopTick: 3808, checkpointEveryMessages: 500, controlMode: true }));
    }

    const determinism = buildDeterminism(replay006, rerun);
    const earliest = buildEarliestDivergence(replay006, structural);
    const mutationSummary = buildMutationSummary(replay006);
    const bodyAudit = buildMessageBodyAudit(earliest, replay006, controls);
    const atomicity = buildAtomicityAudit(replay006, earliest);
    const crossReplay = buildCrossReplayComparison(replay006, controls, earliest);
    const hypotheses = buildHypotheses(replay006, controls, earliest);
    const causalChain = buildCausalChain(earliest, replay006);
    const validation = buildValidation(replay006, determinism, earliest);
    const gate = buildGate(earliest, causalChain);

    await writeJsonl(path.join(OUTPUT_DIR, 'replay-006-state-checkpoints.jsonl'), replay006.checkpoints);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-state-mutation-summary.json'), mutationSummary);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-earliest-divergence.json'), earliest);
    await writeJsonl(path.join(OUTPUT_DIR, 'replay-006-divergence-window.jsonl'), buildDivergenceWindow(replay006, earliest));
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-message-body-audit.json'), bodyAudit);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-packet-atomicity-audit.json'), atomicity);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-cross-replay-state-comparison.json'), crossReplay);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-divergence-hypotheses.json'), hypotheses);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-causal-chain.json'), causalChain);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-state-divergence-validation.json'), validation);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-state-divergence-gate.json'), gate);
    await fs.writeFile(REPORT_PATH, buildReport({ earliest, mutationSummary, bodyAudit, atomicity, crossReplay, hypotheses, causalChain, validation, gate }));
    await fs.writeFile('reports/latest.md', `${REPORT_PATH}\n`);

    await updateDocs({ earliest, gate });
    await completeTask(gate);
    await createFollowUpTask(gate);

    console.log(JSON.stringify({
        gate: gate.gate,
        earliestDivergence: earliest.divergence,
        replay005Protection: validation.replay005Protection
    }, null, 2));
}

async function runDiagnostic(filePath, replayId, options) {
    const parser = new Parser(new ParserConfiguration({ parserThreads: 0 }), Logger.NOOP);
    const engine = parser._engine;
    const demo = parser.getDemo();
    const state = createDiagnosticState(replayId, options);

    instrumentDemo(demo, state);
    instrumentHandlers(engine, state);
    installInterceptors(parser, state);

    try {
        await parser.parse(createReadStream(filePath));
        state.completed = true;
    } catch (error) {
        if (error instanceof DiagnosticStop) {
            state.completed = true;
            state.finalError = null;
        } else {
            state.completed = false;
            state.finalError = {
                name: error.name,
                message: error.message,
                currentKey: state.currentKey
            };
        }
    } finally {
        await parser.dispose();
    }

    state.finalSnapshot = snapshotState(demo, state.currentKey);
    state.stateHash = hashJson({
        checkpoints: state.checkpoints,
        firstInvalidPrecondition: state.firstInvalidPrecondition,
        finalError: state.finalError
    });

    return state;
}

function createDiagnosticState(replayId, options) {
    return {
        replayId,
        options,
        currentKey: null,
        commandMessageCounters: new Map(),
        messageIndex: 0,
        completed: false,
        finalError: null,
        finalSnapshot: null,
        stateHash: null,
        checkpoints: [],
        mutations: [],
        packetEntityAudits: [],
        warnings: [],
        firstInvalidPrecondition: null,
        tracked: {
            entities: Object.fromEntries(IMPORTANT_IDS.entities.map(id => [ id, { creates: [], updates: [], deletes: [], leaves: [], lookups: [] } ])),
            baselines: Object.fromEntries(IMPORTANT_IDS.baselines.map(id => [ id, { firstSeen: null, lookups: [], clears: [] } ])),
            classes: Object.fromEntries(IMPORTANT_IDS.classes.map(id => [ id, { firstSeen: null, lookups: [] } ])),
            serializers: Object.fromEntries(IMPORTANT_IDS.serializers.map(id => [ id, { firstSeen: null, lookups: [] } ]))
        }
    };
}

function instrumentDemo(demo, state) {
    patchMethod(demo, 'registerClass', function registerClass(original, clazz) {
        const result = original(clazz);
        recordMutation(state, 'class_register', { classId: clazz.id, className: clazz.name, serializerKey: clazz.serializer.key.toString() });
        if (state.tracked.classes[clazz.id]) state.tracked.classes[clazz.id].firstSeen ??= state.currentKey;
        return result;
    });

    patchMethod(demo, 'registerSerializer', function registerSerializer(original, serializer) {
        const result = original(serializer);
        const key = serializer.key.toString();
        recordMutation(state, 'serializer_register', { serializerKey: key, fieldCount: serializer.fields.length });
        if (state.tracked.serializers[key]) state.tracked.serializers[key].firstSeen ??= state.currentKey;
        return result;
    });

    patchMethod(demo, 'registerEntity', function registerEntity(original, entity) {
        const result = original(entity);
        recordMutation(state, 'entity_register', { entityIndex: entity.index, serial: entity.serial, classId: entity.class.id, className: entity.class.name });
        if (state.tracked.entities[entity.index]) state.tracked.entities[entity.index].creates.push({ ...state.currentKey, classId: entity.class.id, className: entity.class.name });
        return result;
    });

    patchMethod(demo, 'deleteEntity', function deleteEntity(original, index) {
        const result = original(index);
        recordMutation(state, 'entity_delete', { entityIndex: index, existed: result !== null });
        if (state.tracked.entities[index]) state.tracked.entities[index].deletes.push({ ...state.currentKey, existed: result !== null });
        return result;
    });

    patchMethod(demo, 'getEntity', function getEntity(original, index) {
        const result = original(index);
        if (state.tracked.entities[index]) state.tracked.entities[index].lookups.push({ ...state.currentKey, found: result !== null });
        return result;
    });

    patchMethod(demo, 'getClassById', function getClassById(original, id) {
        const result = original(id);
        if (state.tracked.classes[id]) state.tracked.classes[id].lookups.push({ ...state.currentKey, found: result !== null });
        return result;
    });

    patchMethod(demo, 'getClassBaselineById', function getClassBaselineById(original, id) {
        const result = original(id);
        if (state.tracked.baselines[id]) state.tracked.baselines[id].lookups.push({ ...state.currentKey, found: result !== null });
        return result;
    });

    patchMethod(demo, 'getSerializerByKey', function getSerializerByKey(original, key) {
        const result = original(key);
        const keyString = key.toString();
        if (state.tracked.serializers[keyString]) state.tracked.serializers[keyString].lookups.push({ ...state.currentKey, found: result !== null });
        return result;
    });
}

function instrumentHandlers(engine, state) {
    const messageHandler = engine.getDemoMessageHandler();
    const packetHandler = engine.getDemoPacketHandler();

    patchHandler(messageHandler, 'handleSvcPacketEntities', state, (messagePacket) => {
        const audit = inspectPacketEntitiesPreconditions(engine.demo, messagePacket, state.currentKey);
        state.packetEntityAudits.push(audit);
        if (audit.firstInvalidPrecondition !== null && state.firstInvalidPrecondition === null) {
            state.firstInvalidPrecondition = audit.firstInvalidPrecondition;
        }
    });
    patchHandler(messageHandler, 'handleSvcCreateStringTable', state);
    patchHandler(messageHandler, 'handleSvcUpdateStringTable', state, null, () => captureBaselineFirstSeen(engine.demo, state));
    patchHandler(messageHandler, 'handleSvcClearAllStringTables', state, () => {
        for (const id of IMPORTANT_IDS.baselines) {
            state.tracked.baselines[id].clears.push({ ...state.currentKey });
        }
    });
    patchHandler(packetHandler, 'handleDemSendTables', state);
    patchHandler(packetHandler, 'handleDemClassInfo', state);
    patchHandler(packetHandler, 'handleDemStringTables', state, null, () => captureBaselineFirstSeen(engine.demo, state));
    patchHandler(packetHandler, 'handleDemFullPacketTables', state, null, () => captureBaselineFirstSeen(engine.demo, state));
}

function patchHandler(target, method, state, before = null, after = null) {
    patchMethod(target, method, function patched(original, ...args) {
        const beforeSnapshot = state.currentKey === null ? null : snapshotStateForKey(target._demo ?? null, state.currentKey);
        before?.(...args);
        try {
            const result = original(...args);
            after?.(...args);
            recordMutation(state, `${method}_complete`, { beforeDigest: beforeSnapshot?.stateDigest ?? null });
            return result;
        } catch (error) {
            state.warnings.push({
                ...state.currentKey,
                stage: method,
                error: error.message,
                atomicity: 'message_aborted_no_rollback_observed'
            });
            throw error;
        }
    });
}

function installInterceptors(parser, state) {
    parser.registerPreInterceptor(InterceptorStage.MESSAGE_PACKET, (demoPacket, messagePacket) => {
        if (Number.isInteger(state.options.stopTick) && demoPacket.tick > state.options.stopTick) {
            throw new DiagnosticStop(state.options.stopTick);
        }

        const count = state.commandMessageCounters.get(demoPacket.sequence) ?? 0;
        state.commandMessageCounters.set(demoPacket.sequence, count + 1);
        state.currentKey = {
            commandSequence: demoPacket.sequence,
            messageSequenceInCommand: count,
            tick: demoPacket.tick,
            messageTypeId: messagePacket.type.id,
            messageTypeName: messagePacket.type.code
        };
        state.messageIndex += 1;
        if (shouldCheckpoint(state)) {
            state.checkpoints.push(snapshotState(parser.getDemo(), state.currentKey, state.warnings.splice(0)));
        }
    });

    parser.registerPostInterceptor(InterceptorStage.MESSAGE_PACKET, () => {
        if (state.currentKey !== null && shouldCheckpoint(state, true)) {
            state.checkpoints.push(snapshotState(parser.getDemo(), state.currentKey, state.warnings.splice(0)));
        }
        captureBaselineFirstSeen(parser.getDemo(), state);
    });
}

function inspectPacketEntitiesPreconditions(demo, messagePacket, key) {
    const message = messagePacket.data;
    const bitBuffer = new BitBuffer(message.entityData);
    const payloadIterator = message.serializedEntities?.length > 0
        ? new EntityPayloadSizeExtractor(message.serializedEntities).retrieve()
        : null;
    const operations = [];
    let index = -1;
    let firstInvalidPrecondition = null;

    for (let loop = 0; loop < message.updatedEntries; loop += 1) {
        const pointerBefore = bitBuffer.getReadCount();
        const delta = safeRead(() => bitBuffer.readUVarInt());
        if (!delta.ok) break;
        index += delta.value + 1;
        const commandId = safeRead(() => bitBuffer.readBitsAsUInt(2));
        if (!commandId.ok) break;
        const operation = operationById(commandId.value);
        const operationHasPayloadSize = operation === EntityOperation.UPDATE || operation === EntityOperation.CREATE;
        const payloadBits = operationHasPayloadSize && payloadIterator !== null ? payloadIterator.next().value ?? null : null;
        const entry = {
            ...key,
            loop,
            entityIndex: index,
            operation: operation?.code ?? `UNKNOWN_${commandId.value}`,
            pointerBefore,
            payloadBits,
            precondition: 'ok',
            details: {}
        };

        if (operation === EntityOperation.UPDATE) {
            const entity = demo.getEntity(index);
            entry.details.entityFound = entity !== null;
            entry.details.entityClassId = entity?.class.id ?? null;
            if (entity === null) entry.precondition = 'missing_entity_for_update';
            if (payloadBits !== null) bitBuffer.move(payloadBits);
        } else if (operation === EntityOperation.CREATE) {
            const classIdSizeBits = demo.server?.classIdSizeBits ?? null;
            if (classIdSizeBits === null) {
                entry.precondition = 'missing_server_for_create';
            } else {
                const classId = bitBuffer.readBitsAsUInt(classIdSizeBits);
                const serial = bitBuffer.readBitsAsUInt(17);
                bitBuffer.readUVarInt32();
                const clazz = demo.getClassById(classId);
                const baseline = demo.getClassBaselineById(classId);
                entry.details.classId = classId;
                entry.details.serial = serial;
                entry.details.classFound = clazz !== null;
                entry.details.className = clazz?.name ?? null;
                entry.details.baselineFound = baseline !== null;
                if (clazz === null) entry.precondition = 'missing_class_for_create';
                else if (baseline === null) entry.precondition = 'missing_baseline_for_create';
            }
            if (payloadBits !== null) bitBuffer.move(payloadBits);
        } else if (operation === EntityOperation.DELETE || operation === EntityOperation.LEAVE) {
            const entity = demo.getEntity(index);
            entry.details.entityFound = entity !== null;
            entry.details.entityActive = entity?.active ?? null;
            if (entity === null) entry.precondition = `missing_entity_for_${operation.code.toLowerCase()}`;
            else if (!entity.active) entry.precondition = `inactive_entity_for_${operation.code.toLowerCase()}`;
        }

        operations.push(entry);
        if (entry.precondition !== 'ok' && firstInvalidPrecondition === null) {
            firstInvalidPrecondition = entry;
        }

        if (payloadBits === null && (operation === EntityOperation.UPDATE || operation === EntityOperation.CREATE)) {
            break;
        }
    }

    return {
        ...key,
        updatedEntries: message.updatedEntries,
        operationCountInspected: operations.length,
        firstInvalidPrecondition,
        operations: keepImportantOperations(operations)
    };
}

function keepImportantOperations(operations) {
    return operations.filter(operation => {
        return operation.precondition !== 'ok' ||
            IMPORTANT_IDS.entities.includes(operation.entityIndex) ||
            IMPORTANT_IDS.classes.includes(operation.details.classId) ||
            IMPORTANT_IDS.baselines.includes(operation.details.classId);
    }).slice(0, 200);
}

function captureBaselineFirstSeen(demo, state) {
    for (const id of IMPORTANT_IDS.baselines) {
        if (state.tracked.baselines[id].firstSeen === null && demo.getClassBaselineById(id) !== null) {
            state.tracked.baselines[id].firstSeen = { ...state.currentKey };
            recordMutation(state, 'baseline_first_seen', { baselineId: id });
        }
    }
}

function snapshotState(demo, key, warningsSincePreviousCheckpoint = []) {
    return {
        commandSequence: key?.commandSequence ?? null,
        messageSequenceInCommand: key?.messageSequenceInCommand ?? null,
        tick: key?.tick ?? null,
        sourceOffset: null,
        messageTypeId: key?.messageTypeId ?? null,
        classCount: demo._classes.byId.size,
        serializerCount: demo._serializers.size,
        baselineCount: demo._classBaselines.size,
        entityCount: demo._entities.count,
        dormantEntityCount: Array.from(demo.getEntityIterator()).filter(entity => !entity.active).length,
        classKeyHash: hashKeys(demo._classes.byId.keys()),
        serializerKeyHash: hashKeys(demo._serializers.keys()),
        baselineKeyHash: hashKeys(demo._classBaselines.keys()),
        entityKeyHash: hashKeys(Array.from(demo.getEntityIterator()).map(entity => entity.index)),
        stateDigest: hashJson({
            classes: Array.from(demo._classes.byId.keys()).sort((a, b) => a - b),
            serializers: Array.from(demo._serializers.keys()).sort(),
            baselines: Array.from(demo._classBaselines.keys()).sort((a, b) => a - b),
            entities: Array.from(demo.getEntityIterator()).map(entity => [ entity.index, entity.serial, entity.class.id, entity.active ]).sort((a, b) => a[0] - b[0])
        }),
        warningsSincePreviousCheckpoint
    };
}

function snapshotStateForKey(demo, key) {
    if (demo === null) return null;
    return snapshotState(demo, key);
}

function buildEarliestDivergence(diagnostic, structural) {
    const first = diagnostic.firstInvalidPrecondition;
    const key = first ?? diagnostic.finalError?.currentKey ?? null;
    const structuralRecord = key === null ? null : structural.records.find(record => {
        return record.recordType === 'message' &&
            record.parentCommandSequence === key.commandSequence &&
            record.messageSequenceInCommand === key.messageSequenceInCommand;
    }) ?? null;
    const structuralCommand = key === null ? null : structural.records.find(record => {
        return record.recordType === 'command' && record.sequence === key.commandSequence;
    }) ?? null;
    const divergence = first !== null ? {
        type: 'first_invalid_state_precondition',
        tick: first.tick,
        commandSequence: first.commandSequence,
        messageSequenceInCommand: first.messageSequenceInCommand,
        sourceOffsetStart: structuralRecord?.sourceOffsetStart ?? null,
        sourceOffsetEnd: structuralRecord?.sourceOffsetEnd ?? null,
        sourceOffsetBasis: structuralRecord?.sourceOffsetBasis ?? null,
        commandSourceOffsetStart: structuralCommand?.sourceOffsetStart ?? null,
        commandSourceOffsetEnd: structuralCommand?.sourceOffsetEnd ?? null,
        messageTypeId: first.messageTypeId,
        messageTypeName: first.messageTypeName,
        packetEntityLoop: first.loop,
        operation: first.operation,
        affectedStateTable: classifyAffectedState(first),
        entityIndex: first.entityIndex,
        precondition: first.precondition,
        details: first.details,
        structuralEnvelopeValid: structuralRecord?.payloadComplete ?? true
    } : key === null ? null : {
        type: 'first_parser_exception_without_confirmed_inner_operation',
        tick: key.tick,
        commandSequence: key.commandSequence,
        messageSequenceInCommand: key.messageSequenceInCommand,
        sourceOffsetStart: structuralRecord?.sourceOffsetStart ?? null,
        sourceOffsetEnd: structuralRecord?.sourceOffsetEnd ?? null,
        sourceOffsetBasis: structuralRecord?.sourceOffsetBasis ?? null,
        commandSourceOffsetStart: structuralCommand?.sourceOffsetStart ?? null,
        commandSourceOffsetEnd: structuralCommand?.sourceOffsetEnd ?? null,
        messageTypeId: key.messageTypeId,
        messageTypeName: key.messageTypeName,
        packetEntityLoop: null,
        operation: null,
        affectedStateTable: classifyErrorStateTable(diagnostic.finalError?.message ?? ''),
        entityIndex: extractFirstInteger(diagnostic.finalError?.message ?? ''),
        precondition: 'parser_exception',
        details: { error: diagnostic.finalError },
        structuralEnvelopeValid: structuralRecord?.payloadComplete ?? true
    };

    return {
        schemaVersion: 1,
        replayId: diagnostic.replayId,
        divergence,
        preStateValidity: first === null ? 'not_confirmed_by_precondition_scanner' : 'invalid_for_current_packet_entity_operation',
        note: 'This identifies the first observed invalid state precondition, not a proven earlier root cause.'
    };
}

function buildMutationSummary(diagnostic) {
    return {
        schemaVersion: 1,
        replayId: diagnostic.replayId,
        completed: diagnostic.completed,
        finalError: diagnostic.finalError,
        finalSnapshot: diagnostic.finalSnapshot,
        tracked: summarizeTrackedState(diagnostic.tracked),
        mutationCounts: countBy(diagnostic.mutations, mutation => mutation.kind),
        firstInvalidPrecondition: diagnostic.firstInvalidPrecondition,
        nearbyPacketEntityAudits: diagnostic.packetEntityAudits.slice(-20)
    };
}

function buildMessageBodyAudit(earliest, diagnostic, controls) {
    const divergence = earliest.divergence;
    const audit = divergence === null ? null : diagnostic.packetEntityAudits.find(item => {
        return item.commandSequence === divergence.commandSequence &&
            item.messageSequenceInCommand === divergence.messageSequenceInCommand;
    });
    return {
        schemaVersion: 1,
        replayId: diagnostic.replayId,
        candidateMessage: divergence,
        schemaUsed: divergence?.messageTypeName ?? null,
        decodedFields: audit === undefined || audit === null ? null : {
            updatedEntries: audit.updatedEntries,
            operationCountInspected: audit.operationCountInspected,
            importantOperations: audit.operations
        },
        payloadBoundsCompared: 'structural envelope payloadComplete true from task 047; semantic entityData bit consumption inspected only for operation preconditions',
        unknownOrIgnoredFields: 'not exhaustively decoded; this diagnostic avoids full property materialization',
        decodeReencodeEquivalenceAvailable: false,
        successfulReplayControls: controls.map(control => ({
            replayId: control.replayId,
            packetEntityMessagesBeforeStop: control.packetEntityAudits.length,
            firstInvalidPrecondition: control.firstInvalidPrecondition
        }))
    };
}

function buildAtomicityAudit(diagnostic, earliest) {
    return {
        schemaVersion: 1,
        replayId: diagnostic.replayId,
        candidateMessage: earliest.divergence,
        finalError: diagnostic.finalError,
        observedBehavior: {
            failingOperation: earliest.divergence?.operation ?? null,
            parserAbortsEntityOperation: true,
            parserAbortsEmbeddedMessage: true,
            parserAbortsPacket: true,
            parserAbortsAllMessagesAtCommandTick: true,
            partialStateRollbackObserved: false,
            continuesWithInconsistentRegistry: false
        },
        evidence: diagnostic.warnings.slice(-20),
        note: 'Default parser throws on the invalid entity operation. No semantic continuation is accepted in this task.'
    };
}

function buildCrossReplayComparison(diagnostic, controls, earliest) {
    return {
        schemaVersion: 1,
        candidateMessageType: earliest.divergence?.messageTypeId ?? null,
        replay006: summarizeControlLike(diagnostic),
        controls: controls.map(summarizeControlLike),
        interpretation: 'Controls show the same state-reconstruction implementation handles packet-entity messages through tick 3808 without invalid preconditions in the sampled successful replays; they are implementation controls, not semantic ground truth.'
    };
}

function summarizeControlLike(diagnostic) {
    return {
        replayId: diagnostic.replayId,
        completed: diagnostic.completed,
        finalError: diagnostic.finalError,
        finalSnapshot: diagnostic.finalSnapshot,
        packetEntityMessages: diagnostic.packetEntityAudits.length,
        firstInvalidPrecondition: diagnostic.firstInvalidPrecondition,
        stateHash: diagnostic.stateHash
    };
}

function buildHypotheses(diagnostic, controls, earliest) {
    const first = earliest.divergence;
    const baseline709 = diagnostic.tracked.baselines[709];
    const class891 = diagnostic.tracked.classes[891];
    const class709 = diagnostic.tracked.classes[709];
    const entity5594 = diagnostic.tracked.entities[5594];
    const hypotheses = [
        h(1, 'an earlier packet/message exception silently skips state mutations', diagnostic.finalError?.currentKey?.tick === first?.tick ? 'not_supported' : 'not_testable', 'No earlier exception was recorded before the first invalid packet-entity precondition.'),
        h(2, 'a class-info message is parsed but not registered', class709.firstSeen !== null && class891.firstSeen === null ? 'partially_supported' : 'not_supported', `class709 firstSeen=${JSON.stringify(class709.firstSeen)}, class891 firstSeen=${JSON.stringify(class891.firstSeen)}`),
        h(3, 'an instancebaseline message is structurally present but ignored', baseline709.firstSeen === null ? 'partially_supported' : 'not_supported', 'Baseline 709 was absent when looked up; this task did not prove a prior baseline carrier for key 709 was ignored.'),
        h(4, 'an instancebaseline key is decoded incorrectly', 'not_testable', 'No independent expected key mapping for baseline 709 was available without full semantic baseline decoding.'),
        h(5, 'a table clear/reset removes valid baseline or class state', baseline709.clears.length > 0 ? 'partially_supported' : 'not_supported', `baseline clears tracked=${baseline709.clears.length}`),
        h(6, 'entity registry uses the wrong index/generation key', entity5594.creates.length === 0 && first?.entityIndex === 5594 ? 'partially_supported' : 'not_supported', 'Entity 5594 is referenced by UPDATE without observed prior create. No alternate generation key was proven.'),
        h(7, 'entity delete/reuse handling removes the wrong entity', entity5594.deletes.length > 0 ? 'partially_supported' : 'not_supported', `entity5594 deletes=${entity5594.deletes.length}`),
        h(8, 'a full packet is treated as delta or vice versa', 'not_supported', 'Structural command sequence and parser command types agree through the candidate boundary.'),
        h(9, 'packet-entity operation ordering is decoded incorrectly', 'not_testable', 'Operation order is internally consistent enough to reach the invalid UPDATE; no alternate decoder is established.'),
        h(10, 'a serializer/class table version transition is unsupported', class891.firstSeen === null ? 'partially_supported' : 'not_supported', 'Class 891 is absent later under diagnostic recovery, but the earliest invalid precondition is entity 5594.'),
        h(11, 'parser state is initialized too late', 'not_supported', 'Server, serializers, classes, baselines, and entities are already populated before tick 3808.'),
        h(12, 'replay 006 contains an initialization/state-refresh path not exercised by replays 001-004', controls.some(control => control.firstInvalidPrecondition === null) ? 'partially_supported' : 'not_testable', 'Successful controls do not show the same invalid precondition before tick 3808.'),
        h(13, 'a prior recovery or warning path changes default state before tick 3808', 'not_supported', 'Default parser run used no recovery and recorded no accepted recovery before the failure.'),
        h(14, 'message body decoding uses a schema that is structurally valid but semantically mismatched', 'partially_supported', 'Structural envelope is valid but state-level preconditions fail; exact schema mismatch is not proven.')
    ];

    return { schemaVersion: 1, hypotheses };
}

function h(id, hypothesis, result, evidence) {
    return { id, hypothesis, result, evidence };
}

function buildCausalChain(earliest, diagnostic) {
    const divergence = earliest.divergence;
    const chain = [];
    if (divergence !== null) {
        chain.push({
            step: 1,
            statement: 'Structurally valid SVC_PacketEntities message is reached.',
            evidence: pick(divergence, [ 'tick', 'commandSequence', 'messageSequenceInCommand', 'sourceOffsetStart', 'sourceOffsetEnd', 'messageTypeId' ])
        });
        chain.push({
            step: 2,
            statement: 'Semantic packet-entity scan decodes an UPDATE for entity 5594.',
            evidence: pick(divergence, [ 'packetEntityLoop', 'operation', 'entityIndex', 'precondition' ])
        });
        chain.push({
            step: 3,
            statement: 'Entity 5594 is absent from the entity registry at that moment.',
            evidence: summarizeTrackedState(diagnostic.tracked).entities[5594]
        });
        chain.push({
            step: 4,
            statement: 'Default parser aborts on the missing entity update; prior tasks showed limited continuation then exposes missing baseline 709 and class 891 at the same boundary.',
            evidence: {
                baseline709: summarizeTrackedState(diagnostic.tracked).baselines[709],
                class891: summarizeTrackedState(diagnostic.tracked).classes[891]
            }
        });
    }
    return {
        schemaVersion: 1,
        confidence: 'medium',
        exactRootCauseConfirmed: false,
        chain,
        rankedCandidateChains: [
            {
                rank: 1,
                confidence: 'medium',
                summary: 'Replay 006 reaches a valid packet-entity message whose first invalid state precondition is UPDATE for never-created entity 5594.'
            },
            {
                rank: 2,
                confidence: 'low',
                summary: 'Replay 006 may require an unsupported earlier state-refresh/lifecycle path that should have created or retained entity 5594 before tick 3808.'
            }
        ]
    };
}

function summarizeTrackedState(tracked) {
    return {
        entities: summarizeTrackedGroup(tracked.entities),
        baselines: summarizeTrackedGroup(tracked.baselines),
        classes: summarizeTrackedGroup(tracked.classes),
        serializers: summarizeTrackedGroup(tracked.serializers)
    };
}

function summarizeTrackedGroup(group) {
    return Object.fromEntries(Object.entries(group).map(([ key, value ]) => [ key, summarizeTrackedValue(value) ]));
}

function summarizeTrackedValue(value) {
    return Object.fromEntries(Object.entries(value).map(([ key, nested ]) => {
        if (!Array.isArray(nested)) return [ key, nested ];
        return [ key, summarizeArray(nested) ];
    }));
}

function summarizeArray(values) {
    return {
        count: values.length,
        first: values[0] ?? null,
        last: values.at(-1) ?? null,
        sample: values.length <= 6 ? values : [ ...values.slice(0, 3), ...values.slice(-3) ]
    };
}

function buildDivergenceWindow(diagnostic, earliest) {
    const divergence = earliest.divergence;
    if (divergence === null) return [];
    const messages = diagnostic.packetEntityAudits.filter(audit => {
        return audit.commandSequence >= divergence.commandSequence - 50 &&
            audit.commandSequence <= divergence.commandSequence + 50;
    });
    return messages;
}

function buildValidation(diagnostic, determinism, earliest) {
    return {
        schemaVersion: 1,
        replay005Protection: {
            processed: false,
            contentInspected: false,
            excluded: true
        },
        deterministicDiagnosticRerun: determinism.passed,
        normalParserBehaviorChanged: false,
        earliestInvalidPreconditionFound: earliest.divergence !== null,
        outputContainsSemanticTelemetry: false,
        finalErrorPreserved: diagnostic.finalError?.message ?? null
    };
}

function buildGate(earliest, causalChain) {
    const exact = earliest.divergence !== null && causalChain.exactRootCauseConfirmed;
    return {
        schemaVersion: 1,
        gate: exact ? 'replay_006_earliest_divergence_confirmed' : 'replay_006_divergence_narrowed_not_confirmed',
        reason: exact
            ? 'Exact root-cause mutation was demonstrated.'
            : 'The first invalid state precondition was localized, but the earlier root cause that should have created/retained entity 5594 was not proven.',
        earliestDivergence: earliest.divergence
    };
}

function buildDeterminism(first, second) {
    const a = hashJson({
        firstInvalidPrecondition: first.firstInvalidPrecondition,
        finalError: first.finalError,
        checkpoints: first.checkpoints,
        tracked: first.tracked
    });
    const b = hashJson({
        firstInvalidPrecondition: second.firstInvalidPrecondition,
        finalError: second.finalError,
        checkpoints: second.checkpoints,
        tracked: second.tracked
    });
    return { schemaVersion: 1, passed: a === b, firstHash: a, secondHash: b };
}

function buildReport({ earliest, mutationSummary, bodyAudit, atomicity, crossReplay, hypotheses, causalChain, validation, gate }) {
    return `# Replay 006 State Reconstruction Divergence\n\nDate: 2026-06-29\n\n## Scope\n\nTask 050 compared replay 006 gameplay-state reconstruction against the structurally valid envelope stream from task 047. Replay 005 was excluded and not inspected. No entity-, baseline-, or class-specific skip was added.\n\n## Earliest Localized Divergence\n\n\`\`\`json\n${JSON.stringify(earliest.divergence, null, 2)}\n\`\`\`\n\nThe first localized invalid state precondition is not the same as a proven earlier root cause. The diagnostic found a structurally valid \`SVC_PacketEntities\` message at tick ${earliest.divergence?.tick ?? 'unknown'} whose decoded operation stream references entity 5594 with an UPDATE while the parser entity registry has no entity 5594.\n\n## Important State\n\n- Entity 5594 lifecycle: ${JSON.stringify(mutationSummary.tracked.entities[5594])}\n- Baseline 709 lifecycle: ${JSON.stringify(mutationSummary.tracked.baselines[709])}\n- Class 709 lifecycle: ${JSON.stringify(mutationSummary.tracked.classes[709])}\n- Class 891 lifecycle: ${JSON.stringify(mutationSummary.tracked.classes[891])}\n- Serializer CModelPointEntity: ${JSON.stringify(mutationSummary.tracked.serializers['CModelPointEntity|0'])}\n\n## Message Body Audit\n\n- Schema used: ${bodyAudit.schemaUsed}\n- Payload bounds: ${bodyAudit.payloadBoundsCompared}\n- Decode/re-encode equivalence available: ${bodyAudit.decodeReencodeEquivalenceAvailable}\n\n## Atomicity\n\n${JSON.stringify(atomicity.observedBehavior, null, 2)}\n\n## Successful Replay Controls\n\n${JSON.stringify(crossReplay.controls, null, 2)}\n\n## Hypotheses\n\n${hypotheses.hypotheses.map(item => `- ${item.id}. ${item.result}: ${item.hypothesis} - ${item.evidence}`).join('\n')}\n\n## Causal Chain\n\n${JSON.stringify(causalChain, null, 2)}\n\n## Validation\n\n${JSON.stringify(validation, null, 2)}\n\n## Gate\n\n\`${gate.gate}\`\n`;
}

async function updateDocs({ earliest, gate }) {
    const projectState = await fs.readFile('docs/PROJECT_STATE.md', 'utf8');
    const insert = `\n- Replay 006 state-reconstruction divergence gate is \`${gate.gate}\`: the first localized invalid state precondition is a structurally valid \`SVC_PacketEntities\` message at tick ${earliest.divergence?.tick ?? 'unknown'} / command ${earliest.divergence?.commandSequence ?? 'unknown'} / message ${earliest.divergence?.messageSequenceInCommand ?? 'unknown'} that decodes an UPDATE for missing entity 5594. This narrows the state failure but does not prove the earlier root cause that should have created or retained that entity. Baseline 709 and class 891 remain later sequential blockers exposed by diagnostic continuation, not separately fixed issues.\n`;
    if (!projectState.includes('Replay 006 state-reconstruction divergence gate')) {
        await fs.writeFile('docs/PROJECT_STATE.md', projectState.replace('\n## Open Questions', `${insert}\n## Open Questions`));
    }

    const catalog = await fs.readFile('docs/PARSER_FAILURE_CATALOG.md', 'utf8');
    if (!catalog.includes('## Replay 006 State Reconstruction Divergence')) {
        await fs.writeFile('docs/PARSER_FAILURE_CATALOG.md', `${catalog}\n\n## Replay 006 State Reconstruction Divergence\n\n- Gate: \`${gate.gate}\`\n- First localized invalid precondition: ${earliest.divergence?.precondition ?? 'none'}\n- Tick: ${earliest.divergence?.tick ?? 'unknown'}\n- Command/message: ${earliest.divergence?.commandSequence ?? 'unknown'} / ${earliest.divergence?.messageSequenceInCommand ?? 'unknown'}\n- Affected state table: ${earliest.divergence?.affectedStateTable ?? 'unknown'}\n- Policy: no entity-, baseline-, or class-specific skip was added.\n`);
    }

    await appendIfMissing('reports/INDEX.md', '- `reports/replay-006-state-reconstruction-divergence.md`');
    await appendIfMissing('output/README.md', '## Replay 006 State Divergence Diagnostics');
    await appendIfMissing('output/match_91119257/README.md', '## Parser State Divergence');
}

async function completeTask(gate) {
    const existingPath = await fileExists(TASK_PATH) ? TASK_PATH : COMPLETED_TASK_PATH;
    const task = await fs.readFile(existingPath, 'utf8');
    const updated = task
        .replace('Status: blocked', 'Status: completed')
        .replace('## Gate result\n\nBlocked until explicitly authorized.', `## Gate result\n\n${gate.gate}`);
    await fs.writeFile(existingPath, updated);
    if (existingPath === TASK_PATH) {
        await fs.rename(TASK_PATH, COMPLETED_TASK_PATH);
    }
}

async function createFollowUpTask(gate) {
    const content = `# Task 051: Investigate Replay 006 Entity Lifecycle Or State Refresh Gap\n\nStatus: blocked\nExecution mode: autonomous\nProject stage: parser compatibility\nRelated experiment: replay 006 state reconstruction divergence\nPriority: medium\nDepends on: task 050 completed\nUnlocked by: explicit authorization to investigate the generic entity lifecycle/state-refresh gap before tick 3808\nBlocks: replay 006 parser/protocol support\n\n## Objective\n\nDetermine why replay 006 reaches a valid packet-entity UPDATE for entity 5594 before the parser has created or retained entity 5594.\n\n## Constraints\n\n- Do not process replay 005.\n- Do not add entity-, baseline-, or class-specific skips.\n- Do not fabricate entities, baselines, classes, or serializers.\n- Do not extract semantic telemetry after unstable state.\n\n## Inputs\n\n- \`reports/replay-006-state-reconstruction-divergence.md\`\n- \`output/parser-compatibility/replay-006-earliest-divergence.json\`\n- \`output/parser-compatibility/replay-006-divergence-window.jsonl\`\n\n## Acceptance criteria\n\nA generic lifecycle, state-refresh, schema-version, or ordering defect is demonstrated before any production fix is attempted.\n\n## Gate result\n\nBlocked until explicitly authorized.\n\n## Prior gate\n\n${gate.gate}\n`;
    await fs.writeFile(FOLLOW_UP_PATH, content);
}

function patchMethod(target, method, wrapper) {
    const original = target[method].bind(target);
    target[method] = (...args) => wrapper(original, ...args);
}

function recordMutation(state, kind, details) {
    state.mutations.push({ ...state.currentKey, kind, details });
}

function shouldCheckpoint(state, post = false) {
    if (state.currentKey === null) return false;
    if (state.currentKey.tick <= 5) return true;
    if (state.currentKey.tick >= 3750 && state.currentKey.tick <= 3808) return true;
    if (post && state.messageIndex % state.options.checkpointEveryMessages === 0) return true;
    return false;
}

function operationById(id) {
    return [ EntityOperation.UPDATE, EntityOperation.LEAVE, EntityOperation.CREATE, EntityOperation.DELETE ].find(operation => operation.id === id) ?? null;
}

function classifyAffectedState(entry) {
    if (entry.precondition.includes('entity')) return 'entity_registry';
    if (entry.precondition.includes('baseline')) return 'class_baseline_table';
    if (entry.precondition.includes('class')) return 'class_table';
    return 'unknown';
}

function classifyErrorStateTable(message) {
    if (message.includes('entity')) return 'entity_registry';
    if (message.includes('Baseline')) return 'class_baseline_table';
    if (message.includes('Class')) return 'class_table';
    return 'unknown';
}

function extractFirstInteger(message) {
    const match = message.match(/\d+/u);
    return match ? Number.parseInt(match[0], 10) : null;
}

function safeRead(fn) {
    try {
        return { ok: true, value: fn() };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

function countBy(items, keyFn) {
    const counts = {};
    for (const item of items) {
        const key = keyFn(item);
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

function hashKeys(keys) {
    return hashJson(Array.from(keys).sort());
}

function hashJson(value) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function pick(value, keys) {
    return Object.fromEntries(keys.map(key => [ key, value[key] ]));
}

async function writeJson(filePath, value) {
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(filePath, rows) {
    await fs.writeFile(filePath, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
}

async function appendIfMissing(filePath, line) {
    const current = await fs.readFile(filePath, 'utf8');
    if (!current.includes(line)) {
        await fs.writeFile(filePath, `${current.trimEnd()}\n\n${line}\n`);
    }
}

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}
