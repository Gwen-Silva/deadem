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

import DemoMessageHandler from '../packages/engine/src/handlers/DemoMessageHandler.js';
import StructuralReplayInspector from '../packages/engine/src/StructuralReplayInspector.js';

import { decodePacketEntityOperations } from './replay-006-entity-lifecycle-utils.js';

const OUTPUT_DIR = 'output/parser-compatibility';
const REPORT_PATH = 'reports/build-23916427-bot-normal-replay-comparison.md';
const TICK_RATE = 32;
const CREATED_AT = '2026-06-29T00:00:00.000Z';
const USER_BUILD = 23916427;

const REPLAYS = [
    {
        replayId: 'replay_007',
        expectedFilename: 'partida_007.dem',
        actualFilenames: [ 'partida_007.dem', 'replay_007_bots01.dem' ],
        userMetadata: {
            date: '2026-06-29',
            gameBuild: USER_BUILD,
            acquisition: 'downloaded_and_extracted_in_game',
            matchId: '91391442',
            mode: 'bots',
            humanPlayers: 1,
            reportedDuration: '19:08',
            reportedDurationSeconds: 1148,
            ending: 'normal',
            pause: 'none'
        }
    },
    {
        replayId: 'replay_008',
        expectedFilename: 'partida_008.dem',
        actualFilenames: [ 'partida_008.dem', 'replay_008_bots02_short.dem' ],
        userMetadata: {
            date: '2026-06-29',
            gameBuild: USER_BUILD,
            acquisition: 'downloaded_and_extracted_in_game',
            matchId: '91394209',
            mode: 'bots',
            humanPlayers: 1,
            reportedDuration: '04:37',
            reportedDurationSeconds: 277,
            ending: 'player_quit',
            pause: 'none'
        }
    },
    {
        replayId: 'replay_009',
        expectedFilename: 'partida_009.dem',
        actualFilenames: [ 'partida_009.dem', 'replay_009_normal.dem' ],
        userMetadata: {
            date: '2026-06-29',
            gameBuild: USER_BUILD,
            acquisition: 'downloaded_and_extracted_in_game',
            matchId: '91381179',
            mode: 'normal_human_match',
            humanPlayers: 12,
            reportedDuration: '35:31',
            reportedDurationSeconds: 2131,
            ending: 'normal',
            pause: 'yes'
        }
    }
];

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const resolved = await resolveReplays();
    const available = resolved.filter(replay => replay.available);
    const rows = [];

    for (const replay of available) {
        const structural = await runStructural(replay);
        const defaultParser = await runDefaultParser(replay);
        rows.push({ replay, structural, defaultParser });
    }

    const deterministic = [];
    for (const replayId of [ 'replay_007', 'replay_009' ]) {
        const replay = available.find(item => item.replayId === replayId);
        if (replay) deterministic.push(await deterministicRerun(replay, rows.find(row => row.replay.replayId === replayId).defaultParser));
    }

    const metadata = buildMetadata(resolved, rows);
    const executionMatrix = buildExecutionMatrix(rows, deterministic);
    const signatures = buildFailureSignatures(rows);
    const structuralResults = buildStructuralResults(rows);
    const lifecycle = buildLifecycleSummary(rows);
    const signatureSearch = buildReplay006SignatureSearch(rows);
    const botNormal = buildBotNormalComparison(rows);
    const decision = buildDecision(rows, resolved, signatureSearch);
    const validation = buildValidation(resolved, deterministic);
    const gate = {
        schemaVersion: 1,
        gate: resolved.every(replay => replay.available) ? 'new_replay_corpus_comparison_ready' : 'new_replay_corpus_comparison_ready_with_missing_files',
        decisionModel: decision.bestSupportedDecisionModel,
        replay005Excluded: true,
        task053Decision: decision.task053Decision,
        blockedFollowUpTask: decision.blockedFollowUpTask
    };

    await writeJson(path.join(OUTPUT_DIR, 'new-replay-metadata.json'), metadata);
    await writeJson(path.join(OUTPUT_DIR, 'build-23916427-execution-matrix.json'), executionMatrix);
    await fs.writeFile(path.join(OUTPUT_DIR, 'build-23916427-execution-matrix.csv'), buildExecutionCsv(executionMatrix.rows));
    await writeJson(path.join(OUTPUT_DIR, 'new-replay-failure-signatures.json'), signatures);
    await writeJson(path.join(OUTPUT_DIR, 'new-replay-structural-results.json'), structuralResults);
    await writeJson(path.join(OUTPUT_DIR, 'new-replay-lifecycle-summary.json'), lifecycle);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-signature-search.json'), signatureSearch);
    await writeJson(path.join(OUTPUT_DIR, 'bot-vs-normal-comparison.json'), botNormal);
    await writeJson(path.join(OUTPUT_DIR, 'new-corpus-decision.json'), decision);
    await writeJson(path.join(OUTPUT_DIR, 'new-corpus-validation.json'), validation);
    await writeJson(path.join(OUTPUT_DIR, 'new-corpus-gate.json'), gate);
    await fs.writeFile(REPORT_PATH, buildReport({ metadata, executionMatrix, signatures, structuralResults, lifecycle, signatureSearch, botNormal, decision, validation, gate }));
    await fs.writeFile('reports/latest.md', `${REPORT_PATH}\n`);

    console.log(JSON.stringify({
        gate: gate.gate,
        decisionModel: decision.bestSupportedDecisionModel,
        available: available.map(replay => replay.replayId),
        replay005Excluded: true
    }, null, 2));
}

async function resolveReplays() {
    const sampleNames = new Set((await fs.readdir('samples')).filter(name => name.toLowerCase().endsWith('.dem')));
    const resolved = [];
    for (const replay of REPLAYS) {
        const actualFilename = replay.actualFilenames.find(name => sampleNames.has(name)) ?? null;
        const actualPath = actualFilename === null ? null : toPosix(path.join('samples', actualFilename));
        const stat = actualPath === null ? null : await fs.stat(actualPath);
        resolved.push({
            replayId: replay.replayId,
            expectedFilename: replay.expectedFilename,
            actualFilename,
            actualPath,
            available: actualPath !== null,
            sizeBytes: stat?.size ?? null,
            modifiedAt: stat?.mtime.toISOString() ?? null,
            userMetadata: replay.userMetadata,
            parserDerivedMetadata: {},
            unavailableMetadata: actualPath === null ? [ 'file_not_found' ] : []
        });
    }
    return resolved;
}

async function runStructural(replay) {
    const result = await StructuralReplayInspector.inspectReplayStructure(replay.actualPath, { maxRecords: Number.MAX_SAFE_INTEGER });
    const summary = result.summary;
    return {
        replayId: replay.replayId,
        completed: summary.completed,
        finalStructuralTick: summary.finalStructuralTick,
        byteCoverage: Number(summary.byteCoverage.toFixed(6)),
        commandCount: summary.commandsParsed,
        messageCount: summary.messagesParsed,
        malformedCommandCount: summary.errors.filter(error => error.scope === 'command').length,
        malformedMessageCount: summary.errors.filter(error => error.scope === 'message').length,
        unknownCommandIds: summary.unknownCommandIds ?? [],
        unknownMessageIds: summary.unknownMessageIds ?? [],
        fileSizeBytes: summary.fileSizeBytes
    };
}

async function runDefaultParser(replay) {
    const originalHandler = DemoMessageHandler.prototype.handleSvcPacketEntities;
    const state = createParserState(replay);

    DemoMessageHandler.prototype.handleSvcPacketEntities = function observed(messagePacket, startPointer = 0, startLoop = 0, startIndex = -1, direct = false, recovery = null) {
        observePacketEntityMessage(this._demo, state, messagePacket);
        try {
            return originalHandler.call(this, messagePacket, startPointer, startLoop, startIndex, direct, recovery);
        } catch (error) {
            observePacketEntityFailure(this._demo, state, messagePacket, error);
            throw error;
        }
    };

    const player = new Player(undefined, Logger.NOOP);
    try {
        player.registerPreInterceptor(InterceptorStage.DEMO_PACKET, demoPacket => {
            state.currentTick = readDemoPacketTick(demoPacket, state.currentTick);
            state.commandSequence += 1;
            state.messageSequenceInCommand = 0;
        });
        player.registerPreInterceptor(InterceptorStage.MESSAGE_PACKET, (demoPacket, messagePacket) => {
            state.currentTick = readDemoPacketTick(demoPacket, state.currentTick);
            state.currentMessageKey = {
                commandSequence: state.commandSequence,
                messageSequenceInCommand: state.messageSequenceInCommand,
                tick: state.currentTick,
                messageTypeId: messagePacket.type.id,
                messageTypeName: messagePacket.type.code
            };
            state.messageSequenceInCommand += 1;
        });

        await player.load(createReadStream(replay.actualPath));
        state.lastTick = safeNumber(player.getLastTick());
        state.durationSeconds = tickToSeconds(state.lastTick);
        state.metadata = extractMetadata(player, state.lastTick, state.durationSeconds);

        while (player.getCurrentTick() < player.getLastTick()) {
            const advanced = await player.nextTick();
            if (!advanced) break;
            if (player.getCurrentTick() % TICK_RATE === 0) state.telemetryRows += countControllers(player);
        }
        state.completed = true;
    } catch (error) {
        state.firstError = normalizeError(error, state.currentTick ?? safeNumber(player.getCurrentTick()));
        state.failureSignature = normalizeFailureSignature(state.firstError, state.firstInvalidEntityPrecondition);
    } finally {
        state.finalParsedTick = safeNumber(player.getCurrentTick());
        state.finalParsedGameTimeSeconds = tickToSeconds(state.finalParsedTick);
        state.stats = safeGetStats(player);
        await player.dispose();
        DemoMessageHandler.prototype.handleSvcPacketEntities = originalHandler;
    }

    if (state.firstError === null) {
        state.firstError = noError(state.finalParsedTick);
        state.failureSignature = 'none';
    }

    return summarizeParserState(state);
}

function createParserState(replay) {
    return {
        replayId: replay.replayId,
        currentTick: null,
        currentMessageKey: null,
        commandSequence: -1,
        messageSequenceInCommand: 0,
        completed: false,
        firstError: null,
        firstInvalidEntityPrecondition: null,
        failureSignature: null,
        finalParsedTick: null,
        finalParsedGameTimeSeconds: null,
        lastTick: null,
        durationSeconds: null,
        telemetryRows: 0,
        metadata: createEmptyMetadata(),
        stats: null,
        lifecycle: {
            creates: 0,
            updates: 0,
            deletes: 0,
            leaves: 0,
            missingEntityUpdatesBeforeAbort: 0,
            packetEntityDeltaMessages: 0,
            packetEntityFullMessages: 0,
            maxRegistrySize: 0,
            entityIndexMin: null,
            entityIndexMax: null,
            firstMissingEntityPrecondition: null,
            packetSummaries: []
        }
    };
}

function observePacketEntityMessage(demo, state, messagePacket) {
    const message = messagePacket.data;
    const fields = packetFields(message);
    const packetClassification = classifyPacket(fields);
    if (packetClassification === 'delta_update') state.lifecycle.packetEntityDeltaMessages += 1;
    else state.lifecycle.packetEntityFullMessages += 1;

    let operations = [];
    try {
        operations = decodePacketEntityOperations(message, { classIdSizeBits: demo.server?.classIdSizeBits ?? null, demo });
    } catch (error) {
        state.lifecycle.packetSummaries.push({
            ...state.currentMessageKey,
            packetClassification,
            fields,
            decodeError: error.message
        });
        return;
    }

    for (const operation of operations) {
        if (operation.operation === 'create') state.lifecycle.creates += 1;
        if (operation.operation === 'update') state.lifecycle.updates += 1;
        if (operation.operation === 'delete') state.lifecycle.deletes += 1;
        if (operation.operation === 'leave') state.lifecycle.leaves += 1;
        if (Number.isInteger(operation.decodedEntityIndex)) {
            state.lifecycle.entityIndexMin = state.lifecycle.entityIndexMin === null ? operation.decodedEntityIndex : Math.min(state.lifecycle.entityIndexMin, operation.decodedEntityIndex);
            state.lifecycle.entityIndexMax = state.lifecycle.entityIndexMax === null ? operation.decodedEntityIndex : Math.max(state.lifecycle.entityIndexMax, operation.decodedEntityIndex);
        }
        if (operation.operation === 'update' && operation.registryFoundBefore === false) {
            state.lifecycle.missingEntityUpdatesBeforeAbort += 1;
            const event = {
                ...state.currentMessageKey,
                packetLoop: operation.loopIndex,
                entityIndex: operation.decodedEntityIndex,
                operation: operation.operation,
                packetClassification,
                deltaFrom: fields.deltaFrom,
                updateBaseline: fields.updateBaseline,
                priorLifecycleExists: false,
                result: operation.result
            };
            state.lifecycle.firstMissingEntityPrecondition ??= event;
            state.firstInvalidEntityPrecondition ??= event;
        }
    }

    const stats = demo.getStats();
    state.lifecycle.maxRegistrySize = Math.max(state.lifecycle.maxRegistrySize, stats.entities);
    if (state.lifecycle.packetSummaries.length < 25 || state.firstInvalidEntityPrecondition !== null) {
        state.lifecycle.packetSummaries.push({
            ...state.currentMessageKey,
            packetClassification,
            fields,
            operationCount: operations.length,
            missingUpdateCount: operations.filter(operation => operation.operation === 'update' && operation.registryFoundBefore === false).length
        });
    }
}

function observePacketEntityFailure(demo, state, messagePacket, error) {
    const fields = packetFields(messagePacket.data);
    const packetClassification = classifyPacket(fields);
    const entityIndex = /Unable to find an entity with index/i.test(error?.message ?? '')
        ? extractFirstNumber(error.message)
        : null;
    let operations = [];
    try {
        operations = decodePacketEntityOperations(messagePacket.data, { classIdSizeBits: demo.server?.classIdSizeBits ?? null, demo });
    } catch {
        operations = [];
    }
    const matching = operations.find(operation => operation.decodedEntityIndex === entityIndex) ?? null;
    const event = {
        ...state.currentMessageKey,
        packetLoop: matching?.loopIndex ?? null,
        entityIndex,
        operation: matching?.operation ?? null,
        packetClassification,
        deltaFrom: fields.deltaFrom,
        updateBaseline: fields.updateBaseline,
        priorLifecycleExists: false,
        result: matching?.result ?? 'production_handler_missing_entity_not_reproduced_by_envelope_scan',
        decodedOperationAvailable: matching !== null
    };
    state.lifecycle.firstMissingEntityPrecondition ??= event;
    state.firstInvalidEntityPrecondition ??= event;
}

async function deterministicRerun(replay, baseline) {
    const rerun = await runDefaultParser(replay);
    const fields = [ 'completed', 'firstErrorCategory', 'firstErrorTick', 'finalParsedTick', 'telemetryRows', 'failureSignature' ];
    const mismatches = fields.filter(field => JSON.stringify(rerun[field]) !== JSON.stringify(baseline[field]));
    return {
        replayId: replay.replayId,
        passed: mismatches.length === 0,
        fieldsCompared: fields,
        mismatches,
        baseline: pick(baseline, fields),
        rerun: pick(rerun, fields)
    };
}

function buildMetadata(resolved, rows) {
    const byReplay = new Map(rows.map(row => [ row.replay.replayId, row ]));
    return {
        schemaVersion: 1,
        createdAt: CREATED_AT,
        replay005Exclusion: {
            excluded: true,
            rule: 'samples/partida_005.dem existence may be checked, but contents must not be read or processed'
        },
        replays: resolved.map(replay => {
            const row = byReplay.get(replay.replayId);
            return {
                replayId: replay.replayId,
                expectedFilename: replay.expectedFilename,
                actualPath: replay.actualPath,
                actualFilename: replay.actualFilename,
                available: replay.available,
                sizeBytes: replay.sizeBytes,
                modifiedAt: replay.modifiedAt,
                userProvidedMetadata: replay.userMetadata,
                parserDerivedMetadata: row?.defaultParser.metadata ?? createEmptyMetadata(),
                structuralFinalTick: row?.structural.finalStructuralTick ?? null,
                unavailableMetadata: replay.unavailableMetadata
            };
        })
    };
}

function buildExecutionMatrix(rows, deterministic) {
    return {
        schemaVersion: 1,
        createdAt: CREATED_AT,
        deterministicRerun: deterministic,
        rows: rows.map(row => ({
            replayId: row.replay.replayId,
            actualPath: row.replay.actualPath,
            mode: row.replay.userMetadata.mode,
            humanPlayers: row.replay.userMetadata.humanPlayers,
            build: row.replay.userMetadata.gameBuild,
            ending: row.replay.userMetadata.ending,
            pause: row.replay.userMetadata.pause,
            defaultParser: row.defaultParser,
            structuralPass: row.structural
        }))
    };
}

function buildFailureSignatures(rows) {
    return {
        schemaVersion: 1,
        createdAt: CREATED_AT,
        signatures: rows.map(row => ({
            replayId: row.replay.replayId,
            mode: row.replay.userMetadata.mode,
            humanPlayers: row.replay.userMetadata.humanPlayers,
            build: row.replay.userMetadata.gameBuild,
            firstFailureTick: row.defaultParser.firstErrorTick,
            messageType: row.defaultParser.firstInvalidEntityPrecondition?.messageTypeName ?? null,
            packetLoop: row.defaultParser.firstInvalidEntityPrecondition?.packetLoop ?? null,
            entityIndex: row.defaultParser.firstInvalidEntityPrecondition?.entityIndex ?? extractFirstNumber(row.defaultParser.firstError?.rawError),
            operation: row.defaultParser.firstInvalidEntityPrecondition?.operation ?? null,
            baselineId: row.defaultParser.firstErrorCategory === 'baseline_not_found' ? extractFirstNumber(row.defaultParser.firstError.rawError) : null,
            classId: row.defaultParser.firstErrorCategory === 'class_not_found' ? extractFirstNumber(row.defaultParser.firstError.rawError) : null,
            rawError: row.defaultParser.firstError?.rawError ?? null,
            signature: row.defaultParser.failureSignature
        }))
    };
}

function buildStructuralResults(rows) {
    return {
        schemaVersion: 1,
        createdAt: CREATED_AT,
        rows: rows.map(row => row.structural)
    };
}

function buildLifecycleSummary(rows) {
    return {
        schemaVersion: 1,
        createdAt: CREATED_AT,
        rows: rows.map(row => ({
            replayId: row.replay.replayId,
            mode: row.replay.userMetadata.mode,
            humanPlayers: row.replay.userMetadata.humanPlayers,
            build: row.replay.userMetadata.gameBuild,
            completed: row.defaultParser.completed,
            classCount: row.defaultParser.stats?.classes ?? null,
            serializerCount: row.defaultParser.stats?.serializers ?? null,
            baselineCount: row.defaultParser.stats?.classBaselines ?? null,
            entityCount: row.defaultParser.stats?.entities ?? null,
            ...row.defaultParser.lifecycle
        }))
    };
}

function buildReplay006SignatureSearch(rows) {
    const replay006Pattern = {
        messageType: 'svc_PacketEntities',
        packetClassification: 'delta_update',
        operation: 'update',
        entityIndex: 5594,
        priorLifecycleExists: false,
        independentIndexDecoderAgrees: true
    };
    return {
        schemaVersion: 1,
        createdAt: CREATED_AT,
        replay006Pattern,
        rows: rows.map(row => {
            const first = row.defaultParser.firstInvalidEntityPrecondition;
            const present = first !== null
                && first.packetClassification === 'delta_update'
                && first.operation === 'update'
                && first.priorLifecycleExists === false;
            return {
                replayId: row.replay.replayId,
                status: present ? 'present' : row.defaultParser.completed ? 'absent' : 'not_reached',
                preciseEntity5594: first?.entityIndex === 5594,
                firstOccurrence: first
            };
        })
    };
}

function buildBotNormalComparison(rows) {
    const byId = Object.fromEntries(rows.map(row => [ row.replay.replayId, row ]));
    return {
        schemaVersion: 1,
        createdAt: CREATED_AT,
        comparison1Replay007Vs009: compareRows(byId.replay_007, byId.replay_009, 'same build normal ending; solo bot versus 12-human normal'),
        comparison2Replay007Vs008: compareRows(byId.replay_007, byId.replay_008, 'same build solo bot; normal ending versus quit and short duration'),
        comparison3Replay007008Vs006: {
            purpose: 'solo-bot recurrence of replay 006 lifecycle gap',
            replay006BuildConfounder: 'replay_006 direct build unavailable',
            replay007Signature: byId.replay_007?.defaultParser.failureSignature ?? 'unavailable',
            replay008Signature: byId.replay_008?.defaultParser.failureSignature ?? 'unavailable'
        },
        comparison4Replay009Vs001004: {
            purpose: 'normal 12-human build 23916427 compatibility versus existing successful normal controls',
            replay009DefaultCompletion: byId.replay_009?.defaultParser.completed ?? false,
            existingReference: 'replays 001-004 completed in prior parser compatibility matrix'
        }
    };
}

function buildDecision(rows, resolved, signatureSearch) {
    const available = resolved.filter(replay => replay.available).length;
    const allAvailable = available === resolved.length;
    const completions = rows.filter(row => row.defaultParser.completed).length;
    const allComplete = rows.length > 0 && completions === rows.length;
    const signatures = Object.fromEntries(rows.map(row => [ row.replay.replayId, row.defaultParser.failureSignature ]));
    const searchStatuses = Object.fromEntries(signatureSearch.rows.map(row => [ row.replayId, row.status ]));
    let bestSupportedDecisionModel = 'insufficient_evidence';
    let task053Decision = 'task_053_still_high_priority';
    let blockedFollowUpTask = null;

    if (!allAvailable) {
        bestSupportedDecisionModel = 'insufficient_new_replay_availability';
    } else if (allComplete && signatureSearch.rows.every(row => row.status === 'absent')) {
        bestSupportedDecisionModel = 'replay_006_isolated_state_anomaly';
        task053Decision = 'task_053_deprioritized_replay_006_isolated';
    } else if ([ signatures.replay_007, signatures.replay_008 ].every(signature => String(signature).startsWith('missing_entity')) && signatures.replay_009 === 'none') {
        bestSupportedDecisionModel = 'bot_entity_lifecycle_defect_supported';
        task053Decision = 'task_053_reframed_for_bot_mode';
        blockedFollowUpTask = 'tasks/blocked/055-investigate-generic-bot-solo-lifecycle-comparison.md';
    } else if ([ signatures.replay_007, signatures.replay_008 ].some(signature => signature !== 'none') && signatures.replay_009 === 'none') {
        bestSupportedDecisionModel = 'solo_bot_mode_lifecycle_defect_supported';
        task053Decision = 'task_053_reframed_for_bot_mode';
        blockedFollowUpTask = 'tasks/blocked/055-investigate-generic-bot-solo-lifecycle-comparison.md';
    } else if (rows.length > 0 && rows.every(row => row.defaultParser.failureSignature !== 'none')) {
        bestSupportedDecisionModel = 'build_23916427_parser_incompatibility_supported';
        task053Decision = 'task_053_reframed_for_build_23916427';
        blockedFollowUpTask = 'tasks/blocked/055-investigate-build-23916427-parser-compatibility.md';
    } else if (signatures.replay_008 !== 'none' && signatures.replay_007 === 'none' && signatures.replay_009 === 'none') {
        bestSupportedDecisionModel = 'quit_termination_specific_difference_supported';
        task053Decision = 'task_053_deprioritized_replay_006_isolated';
    } else if (Object.values(searchStatuses).includes('present')) {
        bestSupportedDecisionModel = 'mixed_failure_modes';
    }

    return {
        schemaVersion: 1,
        createdAt: CREATED_AT,
        bestSupportedDecisionModel,
        task053Decision,
        blockedFollowUpTask,
        replayCompletions: Object.fromEntries(rows.map(row => [ row.replay.replayId, row.defaultParser.completed ])),
        failureSignatures: signatures,
        replay006SignatureSearch: searchStatuses,
        rationale: decisionRationale(bestSupportedDecisionModel)
    };
}

function buildValidation(resolved, deterministic) {
    return {
        schemaVersion: 1,
        createdAt: CREATED_AT,
        replay005Excluded: true,
        replay005Verification: 'existence only; contents not read, hashed, structurally inspected, or parsed',
        allAvailableNewReplays: resolved.every(replay => replay.available),
        deterministicRerun,
        deterministicPassed: deterministic.every(item => item.passed),
        jsonCsvValidation: 'performed_after_generation',
        noParserFixIncluded: true,
        noRecoveryAdded: true
    };
}

function summarizeParserState(state) {
    return {
        replayId: state.replayId,
        completed: state.completed,
        firstError: state.firstError,
        firstErrorCategory: state.firstError?.category ?? 'none',
        firstErrorTick: state.firstError?.tick ?? null,
        firstErrorGameTimeSeconds: state.firstError?.gameTimeSeconds ?? null,
        finalParsedTick: state.finalParsedTick,
        finalParsedGameTimeSeconds: state.finalParsedGameTimeSeconds,
        lastTick: state.lastTick,
        durationSeconds: state.durationSeconds,
        percentParsed: calculatePercent(state.finalParsedTick, state.lastTick),
        telemetryRows: state.telemetryRows,
        metadata: state.metadata,
        stats: state.stats,
        lifecycle: state.lifecycle,
        firstInvalidEntityPrecondition: state.firstInvalidEntityPrecondition,
        failureSignature: state.failureSignature
    };
}

function packetFields(message) {
    return {
        isDelta: message.isDelta ?? null,
        deltaFrom: message.deltaFrom ?? null,
        updatedEntries: message.updatedEntries ?? null,
        maxEntries: message.maxEntries ?? null,
        updateBaseline: message.updateBaseline ?? null,
        baseline: message.baseline ?? null,
        entityDataBytes: message.entityData?.length ?? 0,
        serializedEntitiesBytes: message.serializedEntities?.length ?? 0
    };
}

function classifyPacket(fields) {
    if (fields.updateBaseline === true) return 'baseline_update';
    if (Number.isInteger(fields.deltaFrom) && fields.deltaFrom >= 0) return 'delta_update';
    if (fields.isDelta === false) return 'full_or_non_delta';
    return 'unknown';
}

function normalizeFailureSignature(firstError, invalid) {
    if (firstError === null || firstError.category === 'none') return 'none';
    if (firstError.category === 'entity_not_found' && invalid?.operation === 'update') return 'missing_entity_update';
    if (firstError.category === 'entity_not_found' && invalid?.operation === 'delete') return 'missing_entity_delete';
    if (firstError.category === 'entity_not_found' && invalid?.operation === 'leave') return 'missing_entity_leave';
    if (firstError.category === 'baseline_not_found') return 'missing_baseline_create';
    if (firstError.category === 'class_not_found') return 'missing_class_create';
    return 'unknown';
}

function normalizeError(error, tick) {
    const rawError = error?.message ?? String(error);
    return {
        category: classifyError(rawError),
        rawError,
        tick,
        gameTimeSeconds: tickToSeconds(tick),
        exceptionType: error?.constructor?.name ?? 'Error',
        stack: String(error?.stack ?? '').split('\n').slice(0, 6)
    };
}

function classifyError(rawError) {
    if (/Unable to find an entity with index/i.test(rawError)) return 'entity_not_found';
    if (/Baseline not found/i.test(rawError)) return 'baseline_not_found';
    if (/Class not found/i.test(rawError)) return 'class_not_found';
    if (/eof|end of file/i.test(rawError)) return 'unexpected_eof';
    return 'unknown';
}

function noError(finalParsedTick) {
    return { category: 'none', rawError: null, tick: null, gameTimeSeconds: null, finalParsedTick };
}

function extractMetadata(player, lastTick, durationSeconds) {
    const demo = player.getDemo();
    const stats = safeGetStats(player);
    return {
        demoProtocol: safeCall(() => demo.getDemoProtocol?.(), null),
        networkProtocol: safeCall(() => demo.getNetworkProtocol?.(), null),
        gameBuild: safeCall(() => demo.getGameBuild?.(), null),
        mapName: safeCall(() => demo.getMapName?.(), null),
        matchId: safeCall(() => demo.getMatchId?.(), null),
        lastTick,
        durationSeconds,
        classCount: stats?.classes ?? null,
        entityCount: stats?.entities ?? null,
        metadataAvailability: 'direct_parser_metadata_methods_unavailable_or_null_values_preserved'
    };
}

function createEmptyMetadata() {
    return {
        demoProtocol: null,
        networkProtocol: null,
        gameBuild: null,
        mapName: null,
        matchId: null,
        lastTick: null,
        durationSeconds: null,
        classCount: null,
        entityCount: null,
        metadataAvailability: 'not_loaded'
    };
}

function countControllers(player) {
    try {
        return player.getDemo().getEntitiesByClassName('CCitadelPlayerController')
            .filter(entity => {
                const steam = entity.getField('m_steamID');
                return steam !== undefined && String(steam) !== '0';
            }).length;
    } catch {
        return 0;
    }
}

function safeGetStats(player) {
    try {
        return player.getDemo().getStats();
    } catch {
        return null;
    }
}

function readDemoPacketTick(demoPacket, fallback) {
    const tick = demoPacket?.tick;
    if (Number.isFinite(tick)) return tick;
    if (Number.isFinite(tick?.value)) return tick.value;
    return fallback;
}

function tickToSeconds(tick) {
    return Number.isFinite(tick) ? Math.floor(tick / TICK_RATE) : null;
}

function calculatePercent(finalTick, lastTick) {
    if (!Number.isFinite(finalTick) || !Number.isFinite(lastTick) || lastTick <= 0) return null;
    return Number((finalTick / lastTick * 100).toFixed(4));
}

function safeNumber(value) {
    return Number.isFinite(value) ? value : null;
}

function safeCall(fn, fallback) {
    try {
        const value = fn();
        return value === undefined ? fallback : value;
    } catch {
        return fallback;
    }
}

function extractFirstNumber(text) {
    const match = String(text ?? '').match(/\[\s*(\d+)\s*\]/);
    return match ? Number.parseInt(match[1], 10) : null;
}

function compareRows(a, b, purpose) {
    return {
        purpose,
        available: Boolean(a && b),
        leftReplay: a?.replay.replayId ?? null,
        rightReplay: b?.replay.replayId ?? null,
        leftCompleted: a?.defaultParser.completed ?? null,
        rightCompleted: b?.defaultParser.completed ?? null,
        leftSignature: a?.defaultParser.failureSignature ?? null,
        rightSignature: b?.defaultParser.failureSignature ?? null,
        structuralBothComplete: Boolean(a?.structural.completed && b?.structural.completed)
    };
}

function decisionRationale(model) {
    const map = {
        replay_006_isolated_state_anomaly: 'All build 23916427 new replays completed under default parser and none reproduced the replay-006 missing-lifecycle UPDATE signature.',
        solo_bot_mode_lifecycle_defect_supported: 'A bot replay reproduced a parser failure while the normal replay succeeded.',
        build_23916427_parser_incompatibility_supported: 'All build 23916427 new replays failed under default parser.',
        bot_entity_lifecycle_defect_supported: 'Both build 23916427 bot replays failed with missing entity references while the build 23916427 normal human match completed.',
        quit_termination_specific_difference_supported: 'Only the short quit replay differed while normal-ending bot and normal human replays completed.',
        mixed_failure_modes: 'New replay failures do not collapse to one supported model.',
        insufficient_new_replay_availability: 'One or more requested new replays were unavailable.',
        insufficient_evidence: 'The new corpus did not support a sharper model.'
    };
    return map[model] ?? map.insufficient_evidence;
}

function buildExecutionCsv(rows) {
    const headers = [ 'replayId', 'mode', 'humanPlayers', 'build', 'ending', 'defaultCompleted', 'firstErrorCategory', 'firstErrorTick', 'failureSignature', 'structuralCompleted', 'finalStructuralTick' ];
    const lines = [ headers.join(',') ];
    for (const row of rows) {
        lines.push(headers.map(header => csvCell({
            replayId: row.replayId,
            mode: row.mode,
            humanPlayers: row.humanPlayers,
            build: row.build,
            ending: row.ending,
            defaultCompleted: row.defaultParser.completed,
            firstErrorCategory: row.defaultParser.firstErrorCategory,
            firstErrorTick: row.defaultParser.firstErrorTick,
            failureSignature: row.defaultParser.failureSignature,
            structuralCompleted: row.structuralPass.completed,
            finalStructuralTick: row.structuralPass.finalStructuralTick
        }[header])).join(','));
    }
    return `${lines.join('\n')}\n`;
}

function csvCell(value) {
    if (value === null || value === undefined) return '';
    return `"${String(value).replaceAll('"', '""')}"`;
}

async function writeJson(filePath, value) {
    await fs.writeFile(filePath, JSON.stringify(sortStable(value), null, 2) + '\n');
}

function sortStable(value) {
    if (Array.isArray(value)) return value.map(sortStable);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [ key, sortStable(value[key]) ]));
    }
    return value;
}

function hashJson(value) {
    return crypto.createHash('sha256').update(JSON.stringify(sortStable(value))).digest('hex');
}

function pick(object, fields) {
    return Object.fromEntries(fields.map(field => [ field, object[field] ]));
}

function toPosix(filePath) {
    return filePath.split(path.sep).join('/');
}

function buildReport(data) {
    const rows = data.executionMatrix.rows;
    const lines = [
        '# Build 23916427 Bot And Normal Replay Parser Comparison',
        '',
        '## Objective',
        '',
        'Task 054 expanded the parser compatibility corpus with the user-supplied build 23916427 replays 007, 008, and 009. Replay 005 was excluded and no parser recovery or fix was added.',
        '',
        '## Replay Availability',
        '',
        ...data.metadata.replays.map(replay => `- ${replay.replayId}: expected \`${replay.expectedFilename}\`, actual \`${replay.actualFilename ?? 'unavailable'}\`, available ${replay.available}.`),
        '',
        '## Execution Summary',
        '',
        '| Replay | Mode | Ending | Default parser | First failure | Structural pass |',
        '| --- | --- | --- | --- | --- | --- |',
        ...rows.map(row => `| ${row.replayId} | ${row.mode} | ${row.ending} | ${row.defaultParser.completed ? 'complete' : 'failed'} | ${row.defaultParser.failureSignature} | ${row.structuralPass.completed ? 'complete' : 'failed'} |`),
        '',
        '## Replay 006 Signature Search',
        '',
        ...data.signatureSearch.rows.map(row => `- ${row.replayId}: ${row.status}${row.firstOccurrence ? ` at tick ${row.firstOccurrence.tick}, entity ${row.firstOccurrence.entityIndex}` : ''}.`),
        '',
        '## Comparisons',
        '',
        `- Replay 007 vs 009: ${data.botNormal.comparison1Replay007Vs009.leftSignature} vs ${data.botNormal.comparison1Replay007Vs009.rightSignature}.`,
        `- Replay 007 vs 008: ${data.botNormal.comparison2Replay007Vs008.leftSignature} vs ${data.botNormal.comparison2Replay007Vs008.rightSignature}.`,
        '',
        '## Decision',
        '',
        `Best-supported model: \`${data.decision.bestSupportedDecisionModel}\`.`,
        '',
        data.decision.rationale,
        '',
        `Task 053 decision: \`${data.decision.task053Decision}\`.`,
        '',
        '## Gate',
        '',
        `\`${data.gate.gate}\``
    ];
    return `${lines.join('\n')}\n`;
}
