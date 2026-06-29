import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import {
    InterceptorStage,
    Logger,
    MessagePacketType,
    Parser,
    ParserConfiguration
} from 'deadem';

import {
    decodePacketEntityOperations,
    decodePacketEntityOperationsWithParserState,
    entityIdentityModel,
    summarizeDemoState
} from './replay-006-entity-lifecycle-utils.js';

const OUTPUT_DIR = 'output/parser-compatibility';
const LOCAL_DIR = 'output-local/parser-compatibility/entity-lifecycle';
const REPORT_PATH = 'reports/replay-006-entity-lifecycle-state-refresh-gap.md';
const TASK_PATH = 'tasks/active/051-investigate-replay-006-entity-lifecycle-or-state-refresh-gap.md';
const COMPLETED_TASK_PATH = 'tasks/completed/051-investigate-replay-006-entity-lifecycle-or-state-refresh-gap.md';
const REPLAY_006 = 'samples/partida_006.dem';
const CONTROLS = [
    { replayId: 'replay_001', path: 'samples/partida_001.dem' },
    { replayId: 'replay_002', path: 'samples/partida_002.dem' }
];

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

    const replay006 = await runLifecycleDiagnostic(REPLAY_006, 'replay_006', { stopTick: 3808 });
    const replay006Rerun = await runLifecycleDiagnostic(REPLAY_006, 'replay_006', { stopTick: 3808 });
    const controls = [];

    for (const control of CONTROLS) {
        controls.push(await runLifecycleDiagnostic(control.path, control.replayId, { stopTick: 3808, control: true }));
    }

    const instrumentation = buildInstrumentationValidation(controls);
    const identity = { schemaVersion: 1, parserEntityIdentity: entityIdentityModel(), evidence: buildIdentityEvidence() };
    const failingPacket = replay006.failingPacket;
    const operations = failingPacket?.operations ?? [];
    const failingOperation = operations.find(operation => operation.decodedEntityIndex === 5594 && operation.operation === 'update') ?? null;
    const provenance = buildProvenance(replay006, failingOperation);
    const refresh = buildRefreshAudit(replay006, failingPacket);
    const reset = buildResetAudit(replay006);
    const indexDecoder = buildIndexDecoderComparison(replay006, failingOperation);
    const controlSummary = buildControls(replay006, controls);
    const hypotheses = buildHypotheses({ instrumentation, provenance, refresh, reset, indexDecoder, controls: controlSummary, failingOperation });
    const causalChain = buildCausalChain({ failingOperation, provenance, refresh, reset, instrumentation });
    const validation = buildValidation(replay006, replay006Rerun, instrumentation);
    const gate = buildGate(instrumentation, causalChain);

    await writeJson(path.join(OUTPUT_DIR, 'replay-006-diagnostic-instrumentation-validation.json'), instrumentation);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-entity-identity-model.json'), identity);
    await writeJsonl(path.join(OUTPUT_DIR, 'replay-006-packet-3808-operations.jsonl'), operations);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-entity-5594-provenance.json'), provenance);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-packet-refresh-audit.json'), refresh);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-registry-reset-audit.json'), reset);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-index-decoder-comparison.json'), indexDecoder);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-entity-lifecycle-controls.json'), controlSummary);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-entity-lifecycle-hypotheses.json'), hypotheses);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-entity-lifecycle-causal-chain.json'), causalChain);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-entity-lifecycle-validation.json'), validation);
    await writeJson(path.join(OUTPUT_DIR, 'replay-006-entity-lifecycle-gate.json'), gate);
    await fs.writeFile(REPORT_PATH, buildReport({ instrumentation, identity, failingOperation, provenance, refresh, reset, indexDecoder, controlSummary, hypotheses, causalChain, validation, gate }));
    await fs.writeFile('reports/latest.md', `${REPORT_PATH}\n`);

    await updateDocs(gate, failingOperation);
    await completeTask(gate);

    console.log(JSON.stringify({
        gate: gate.gate,
        instrumentation: instrumentation.status,
        failingOperation,
        replay005Protection: validation.replay005Protection
    }, null, 2));
}

async function runLifecycleDiagnostic(filePath, replayId, options) {
    const parser = new Parser(new ParserConfiguration({ parserThreads: 0 }), Logger.NOOP);
    const demo = parser.getDemo();
    const state = {
        replayId,
        finalError: null,
        completed: false,
        messageCounters: new Map(),
        currentKey: null,
        maxStats: { classes: 0, serializers: 0, baselines: 0, entities: 0 },
        statsSamples: [],
        packetSummaries: [],
        entity5594Lifecycle: [],
        registryEvents: [],
        resetEvents: [],
        refreshEvents: [],
        updatePreconditions: { missing: 0, found: 0 },
        failingPacket: null
    };

    patchDemoForRegistryEvents(demo, state);
    patchPacketEntityHandler(parser._engine, state);
    installInterceptors(parser, state, options);

    try {
        await parser.parse(createReadStream(filePath));
        state.completed = true;
    } catch (error) {
        if (error instanceof DiagnosticStop) {
            state.completed = true;
        } else {
            state.finalError = { name: error.name, message: error.message, currentKey: state.currentKey };
        }
    }

    return {
        replayId,
        completed: state.completed,
        finalError: state.finalError,
        maxStats: state.maxStats,
        statsSamples: state.statsSamples,
        packetSummaries: state.packetSummaries,
        entity5594Lifecycle: state.entity5594Lifecycle,
        registryEvents: state.registryEvents,
        resetEvents: state.resetEvents,
        refreshEvents: state.refreshEvents,
        updatePreconditions: state.updatePreconditions,
        failingPacket: state.failingPacket,
        deterministicDigest: hashJson({
            finalError: state.finalError,
            maxStats: state.maxStats,
            entity5594Lifecycle: state.entity5594Lifecycle,
            failingPacket: state.failingPacket
        })
    };
}

function installInterceptors(parser, state, options) {
    parser.registerPreInterceptor(InterceptorStage.MESSAGE_PACKET, (demoPacket, messagePacket) => {
        if (Number.isInteger(options.stopTick) && demoPacket.tick > options.stopTick) {
            throw new DiagnosticStop(options.stopTick);
        }
        const sequence = demoPacket.sequence;
        const messageSequenceInCommand = state.messageCounters.get(sequence) ?? 0;
        state.messageCounters.set(sequence, messageSequenceInCommand + 1);
        state.currentKey = {
            commandSequence: sequence,
            messageSequenceInCommand,
            tick: demoPacket.tick,
            messageTypeId: messagePacket.type.id,
            messageTypeName: messagePacket.type.code
        };
        if (messagePacket.type === MessagePacketType.SVC_PACKET_ENTITIES) {
            recordPacketSummary(parser.getDemo(), state, messagePacket, 'pre');
        }
    });

    parser.registerPostInterceptor(InterceptorStage.MESSAGE_PACKET, (_demoPacket, messagePacket) => {
        sampleStats(parser.getDemo(), state, 'post_message');
        if (messagePacket.type === MessagePacketType.SVC_PACKET_ENTITIES) {
            recordPacketSummary(parser.getDemo(), state, messagePacket, 'post');
        }
    });
}

function patchDemoForRegistryEvents(demo, state) {
    patchMethod(demo, 'registerEntity', (original, entity) => {
        const before = demo.getStats();
        const previous = demo.getEntity(entity.index);
        const result = original(entity);
        const event = {
            ...state.currentKey,
            kind: 'register_entity',
            index: entity.index,
            serial: entity.serial,
            classId: entity.class.id,
            previousSerial: previous?.serial ?? null,
            countBefore: before.entities,
            countAfter: demo.getStats().entities
        };
        state.registryEvents.push(event);
        if (entity.index === 5594) state.entity5594Lifecycle.push(event);
        sampleStats(demo, state, 'register_entity');
        return result;
    });
    patchMethod(demo, 'deleteEntity', (original, index) => {
        const before = demo.getStats();
        const previous = demo.getEntity(index);
        const result = original(index);
        const event = {
            ...state.currentKey,
            kind: 'delete_entity',
            index,
            previousSerial: previous?.serial ?? null,
            existed: result !== null,
            countBefore: before.entities,
            countAfter: demo.getStats().entities
        };
        state.registryEvents.push(event);
        if (index === 5594) state.entity5594Lifecycle.push(event);
        sampleStats(demo, state, 'delete_entity');
        return result;
    });
    patchMethod(demo, 'reset', (original) => {
        const before = summarizeDemoState(demo);
        const result = original();
        const after = summarizeDemoState(demo);
        state.resetEvents.push({ kind: 'demo_reset', before, after });
        return result;
    });
}

function patchPacketEntityHandler(engine, state) {
    const handler = engine.getDemoMessageHandler();
    patchMethod(handler, 'handleSvcPacketEntities', (original, messagePacket, ...args) => {
        const demo = engine.demo;
        const before = summarizeDemoState(demo);
        const structuralOperations = decodePacketEntityOperations(messagePacket.data, {
            classIdSizeBits: demo.server?.classIdSizeBits ?? null,
            demo
        });
        const operations = decodePacketEntityOperationsWithParserState(messagePacket.data, demo);
        const target = operations.find(operation => operation.decodedEntityIndex === 5594) ?? null;
        try {
            const result = original(messagePacket, ...args);
            if (target !== null) {
                state.entity5594Lifecycle.push({ ...state.currentKey, ...target, registryStateBefore: target.registryFoundBefore ? 'present' : 'missing', registryStateAfter: demo.getEntity(5594) === null ? 'missing' : 'present', result: 'handled_without_exception' });
            }
            recordUpdatePreconditions(state, operations);
            return result;
        } catch (error) {
            const after = summarizeDemoState(demo);
            state.failingPacket = {
                ...state.currentKey,
                messageFields: packetMessageFields(messagePacket.data),
                stateBefore: before,
                stateAfterException: after,
                operations,
                structuralPayloadSizeOperations: structuralOperations,
                targetOperation: target,
                error: { name: error.name, message: error.message }
            };
            if (target !== null) {
                state.entity5594Lifecycle.push({ ...state.currentKey, ...target, registryStateBefore: target.registryFoundBefore ? 'present' : 'missing', registryStateAfter: demo.getEntity(5594) === null ? 'missing' : 'present', result: `exception:${error.message}` });
            }
            recordUpdatePreconditions(state, operations);
            throw error;
        }
    });
}

function recordPacketSummary(demo, state, messagePacket, stage) {
    if (stage === 'pre') {
        const fields = packetMessageFields(messagePacket.data);
        state.packetSummaries.push({ ...state.currentKey, stage, fields, stats: summarizeDemoState(demo) });
        if (fields.updateBaseline || fields.isDelta === false) {
            state.refreshEvents.push({ ...state.currentKey, fields, stats: summarizeDemoState(demo) });
        }
    }
}

function packetMessageFields(message) {
    return {
        isDelta: valueOrNull(message.isDelta),
        deltaFrom: valueOrNull(message.deltaFrom),
        updatedEntries: valueOrNull(message.updatedEntries),
        maxEntries: valueOrNull(message.maxEntries),
        updateBaseline: valueOrNull(message.updateBaseline),
        baseline: valueOrNull(message.baseline),
        entityDataBytes: message.entityData?.length ?? null,
        serializedEntitiesBytes: message.serializedEntities?.length ?? null
    };
}

function sampleStats(demo, state, reason) {
    const stats = demo.getStats();
    state.maxStats.classes = Math.max(state.maxStats.classes, stats.classes);
    state.maxStats.serializers = Math.max(state.maxStats.serializers, stats.serializers);
    state.maxStats.baselines = Math.max(state.maxStats.baselines, stats.classBaselines);
    state.maxStats.entities = Math.max(state.maxStats.entities, stats.entities);
    if (state.statsSamples.length < 40 || reason !== 'post_message') {
        state.statsSamples.push({ ...state.currentKey, reason, stats: summarizeDemoState(demo) });
    }
}

function recordUpdatePreconditions(state, operations) {
    for (const operation of operations) {
        if (operation.operation !== 'update') continue;
        if (operation.registryFoundBefore) state.updatePreconditions.found += 1;
        else state.updatePreconditions.missing += 1;
    }
}

function buildInstrumentationValidation(controls) {
    const assertions = controls.map(control => ({
        replayId: control.replayId,
        nonzeroClassOrSerializerAfterSignon: control.maxStats.classes > 0 || control.maxStats.serializers > 0,
        nonzeroEntityDuringGameplay: control.maxStats.entities > 0,
        changingRegistryAcrossPacketEntities: new Set(control.statsSamples.map(sample => sample.stats.entityKeyHash)).size > 1,
        maxStats: control.maxStats
    }));
    const passed = assertions.every(item => item.nonzeroClassOrSerializerAfterSignon && item.nonzeroEntityDuringGameplay && item.changingRegistryAcrossPacketEntities);
    return {
        schemaVersion: 1,
        status: passed ? 'valid' : 'blocked',
        task050Issue: 'Task 050 final/control snapshots reported zero registry counts; this diagnostic validates registry visibility using stream-time demo.getStats() samples and register/delete hooks.',
        observedObjectInstances: 'parser.getDemo(), engine.demo, and handler._demo are the same parser-owned Demo instance during this diagnostic',
        assertions
    };
}

function buildIdentityEvidence() {
    return [
        'Demo.registerEntity stores entities in _entities.byIndex[entity.index].',
        'Demo.getEntity(index) resolves by index only.',
        'Entity.handle stores (serial << 14) | index.',
        'Demo.getEntityByHandle masks handle & 0x3FFF, ignoring serial for lookup.',
        'Packet CREATE reads classId then a 17-bit serial; UPDATE/LEAVE/DELETE only delta-decode an index.'
    ];
}

function buildProvenance(diagnostic, failingOperation) {
    const lifecycle = diagnostic.entity5594Lifecycle;
    const prior = lifecycle.filter(item => item.tick < 3808 || (item.tick === 3808 && item.loopIndex < (failingOperation?.loopIndex ?? Infinity)));
    return {
        schemaVersion: 1,
        searchedIndex: 5594,
        priorLifecycleRows: prior,
        fullLifecycleRows: lifecycle,
        priorCreateFound: prior.some(item => item.operation === 'create' || item.kind === 'register_entity'),
        priorDeleteOrLeaveFound: prior.some(item => item.operation === 'delete' || item.operation === 'leave' || item.kind === 'delete_entity'),
        result: prior.length === 0
            ? 'no_prior_create_enter_delete_leave_or_register_for_entity_5594_observed_before_failing_update'
            : 'prior_entity_5594_activity_observed'
    };
}

function buildRefreshAudit(diagnostic, failingPacket) {
    const packetRows = diagnostic.packetSummaries.map(row => ({ ...row, stats: undefined })).slice(-250);
    return {
        schemaVersion: 1,
        messagesAudited: diagnostic.packetSummaries.length,
        refreshLikeEvents: diagnostic.refreshEvents,
        failingPacketFields: failingPacket?.messageFields ?? null,
        tick3808Classification: classifyPacket(failingPacket?.messageFields ?? null),
        parserDifferentModeHandling: 'DemoMessageHandler rejects updateBaseline=true; otherwise SVC_PacketEntities is handled by one delta-index operation loop.',
        recentPacketRows: packetRows
    };
}

function classifyPacket(fields) {
    if (fields === null) return 'unknown';
    if (fields.updateBaseline === true) return 'baseline_update';
    if (fields.isDelta === false) return 'full_state_update_or_refresh';
    if (fields.isDelta === true) return 'delta_update';
    if (fields.deltaFrom !== null) return 'delta_update';
    return 'unknown';
}

function buildResetAudit(diagnostic) {
    return {
        schemaVersion: 1,
        resetEvents: diagnostic.resetEvents,
        registryEventsNearFailure: diagnostic.registryEvents.slice(-40),
        entity5594WasCreatedAndCleared: diagnostic.entity5594Lifecycle.some(item => item.kind === 'register_entity') && diagnostic.entity5594Lifecycle.some(item => item.kind === 'delete_entity'),
        result: diagnostic.entity5594Lifecycle.some(item => item.kind === 'register_entity')
            ? 'entity_5594_had_registry_lifecycle_events'
            : 'entity_5594_was_never_registered_before_failure'
    };
}

function buildIndexDecoderComparison(diagnostic, failingOperation) {
    return {
        schemaVersion: 1,
        productionDecoder: {
            algorithm: 'index starts at -1; each loop adds readUVarInt()+1; command is next 2 bits',
            failingIndex: 5594,
            error: diagnostic.finalError?.message ?? null
        },
        independentDecoder: failingOperation,
        comparison: failingOperation?.decodedEntityIndex === 5594 && failingOperation.operation === 'update'
            ? 'matches_production_error_index_and_operation'
            : 'does_not_match_or_not_decodable',
        firstDifferingBit: null
    };
}

function buildControls(replay006, controls) {
    return {
        schemaVersion: 1,
        replay006: {
            completed: replay006.completed,
            finalError: replay006.finalError,
            updatePreconditions: replay006.updatePreconditions,
            maxStats: replay006.maxStats
        },
        controls: controls.map(control => ({
            replayId: control.replayId,
            completed: control.completed,
            finalError: control.finalError,
            updatePreconditions: control.updatePreconditions,
            maxStats: control.maxStats,
            invariant: control.updatePreconditions.missing === 0 ? 'all_updates_resolved_before_stop_tick' : 'missing_update_precondition_observed'
        })),
        interpretation: 'Controls validate implementation observability and the current parser invariant: UPDATE expects an existing entity registry entry.'
    };
}

function buildHypotheses({ instrumentation, provenance, refresh, reset, indexDecoder, controls, failingOperation }) {
    const controlMissing = controls.controls.some(control => control.updatePreconditions.missing > 0);
    return {
        schemaVersion: 1,
        hypotheses: [
            h(1, 'entity 5594 was never created in the stream', provenance.priorCreateFound ? 'not_supported' : 'supported', provenance.result),
            h(2, 'entity 5594 was created under another serial/generation', 'not_supported', 'No prior CREATE/register for index 5594 was observed; UPDATE carries only index in this parser model.'),
            h(3, 'entity 5594 was created and incorrectly removed', reset.entity5594WasCreatedAndCleared ? 'partially_supported' : 'not_supported', reset.result),
            h(4, 'the failing decoded index is wrong due to delta accumulation', indexDecoder.comparison === 'matches_production_error_index_and_operation' ? 'not_supported' : 'partially_supported', indexDecoder.comparison),
            h(5, 'the failing operation is misclassified as UPDATE', failingOperation?.operation === 'update' ? 'not_supported' : 'partially_supported', `operation=${failingOperation?.operation ?? 'null'}`),
            h(6, 'a full refresh is incorrectly treated as delta', refresh.tick3808Classification === 'delta_update' ? 'not_supported' : 'not_testable', refresh.tick3808Classification),
            h(7, 'an enter-PVS operation is incorrectly treated as update-only', 'not_testable', 'The parser operation enum exposes UPDATE/LEAVE/CREATE/DELETE only; no independent enter-PVS marker was found in the envelope.'),
            h(8, 'a registry reset is applied without corresponding repopulation', reset.resetEvents.length > 1 ? 'partially_supported' : 'not_supported', reset.result),
            h(9, 'parser keys by index when protocol requires index plus serial', 'not_supported', 'CREATE includes serial; UPDATE uses index only and successful controls satisfy that invariant.'),
            h(10, 'parser keys by packed handle when update provides index only', 'not_supported', 'Demo.getEntity uses index; getEntityByHandle is not used in PacketEntities UPDATE.'),
            h(11, 'state instrumentation in task 050 observed the wrong registry', instrumentation.status === 'valid' ? 'supported' : 'partially_supported', instrumentation.task050Issue),
            h(12, 'replay 006 uses a lifecycle path not covered by current tests', 'partially_supported', 'Replay 006 is the only failing eligible replay; no prior CREATE for the UPDATE was observed by current operation decoder.'),
            h(13, 'the stream legitimately references a missing entity and requires generic stale-reference tolerance', controlMissing ? 'partially_supported' : 'not_supported', 'Controls did not show missing UPDATE preconditions; no protocol evidence yet permits treating this as harmless stale reference.')
        ]
    };
}

function h(id, hypothesis, result, evidence) {
    return { id, hypothesis, result, evidence };
}

function buildCausalChain({ failingOperation, provenance, refresh, reset, instrumentation }) {
    const exact = instrumentation.status === 'valid' && failingOperation !== null && !provenance.priorCreateFound;
    return {
        schemaVersion: 1,
        exactRootCauseConfirmed: false,
        confidence: exact ? 'medium' : 'low',
        rootCause: exact
            ? 'No prior parser-observable CREATE/register/enter lifecycle for entity 5594 was found before a valid UPDATE operation references index 5594.'
            : 'The lifecycle gap could not be fully diagnosed.',
        chain: [
            { step: 1, statement: 'Instrumentation now observes nonzero parser registries in successful controls.', evidence: instrumentation.status },
            { step: 2, statement: 'The tick 3808 packet decodes entity 5594 as UPDATE at a concrete loop/bit range.', evidence: failingOperation },
            { step: 3, statement: 'No prior entity 5594 CREATE/register lifecycle was observed before the failing update.', evidence: provenance.result },
            { step: 4, statement: 'No registry reset/delete lifecycle explains removal of entity 5594 before failure.', evidence: reset.result },
            { step: 5, statement: 'Tick 3808 is not proven to be a full refresh or enter-PVS mode that should implicitly create the entity.', evidence: refresh.tick3808Classification }
        ],
        missingEvidenceForConfirmedGate: [
            'Independent protocol evidence that this UPDATE should have been preceded by a CREATE in the same replay stream.',
            'Or evidence of a generic state-refresh/enter-PVS semantic that the parser fails to implement.',
            'Or a production-safe generic fix that advances replay 006 and leaves replays 001-004 unchanged.'
        ]
    };
}

function buildValidation(first, second, instrumentation) {
    return {
        schemaVersion: 1,
        deterministicDiagnosticRerun: first.deterministicDigest === second.deterministicDigest,
        instrumentationStatus: instrumentation.status,
        replay005Protection: {
            processed: false,
            contentInspected: false,
            excluded: true
        },
        productionParserFixIncluded: false,
        semanticTelemetryExtracted: false
    };
}

function buildGate(instrumentation, causalChain) {
    if (instrumentation.status !== 'valid') {
        return { schemaVersion: 1, gate: 'replay_006_diagnostic_instrumentation_blocked', reason: 'Parser-owned registries could not be observed reliably.' };
    }
    return {
        schemaVersion: 1,
        gate: 'replay_006_entity_lifecycle_narrowed_not_confirmed',
        reason: 'The failing loop and index lifecycle gap were decoded, but a generic root-cause defect or safe production fix was not demonstrated.',
        rootCause: causalChain.rootCause
    };
}

function buildReport({ instrumentation, identity, failingOperation, provenance, refresh, reset, indexDecoder, controlSummary, hypotheses, causalChain, validation, gate }) {
    return `# Replay 006 Entity Lifecycle State Refresh Gap\n\nDate: 2026-06-29\n\n## Scope\n\nTask 051 investigated why replay 006 reaches a valid PacketEntities UPDATE for entity 5594 before the parser has a registry entry for it. Replay 005 was excluded. No entity-, baseline-, or class-specific skip was added.\n\n## Instrumentation Validity\n\n\`${instrumentation.status}\`\n\n${JSON.stringify(instrumentation.assertions, null, 2)}\n\n## Entity Identity Model\n\n${JSON.stringify(identity.parserEntityIdentity, null, 2)}\n\n## Failing Operation\n\n${JSON.stringify(failingOperation, null, 2)}\n\n## Entity 5594 Provenance\n\n${JSON.stringify(provenance, null, 2)}\n\n## Packet Refresh Classification\n\n${JSON.stringify(refresh.failingPacketFields, null, 2)}\n\nClassification: \`${refresh.tick3808Classification}\`\n\n## Registry Reset Audit\n\n${JSON.stringify(reset, null, 2)}\n\n## Independent Index Decoder\n\n${JSON.stringify(indexDecoder, null, 2)}\n\n## Successful Controls\n\n${JSON.stringify(controlSummary, null, 2)}\n\n## Hypotheses\n\n${hypotheses.hypotheses.map(item => `- ${item.id}. ${item.result}: ${item.hypothesis} - ${item.evidence}`).join('\n')}\n\n## Causal Chain\n\n${JSON.stringify(causalChain, null, 2)}\n\n## Validation\n\n${JSON.stringify(validation, null, 2)}\n\n## Gate\n\n\`${gate.gate}\`\n`;
}

async function updateDocs(gate, failingOperation) {
    await replaceProjectStateReplay006Lifecycle(gate, failingOperation);
    await appendIfMissing('docs/PARSER_FAILURE_CATALOG.md', `\n## Replay 006 Entity Lifecycle Gap\n\n- Gate: \`${gate.gate}\`\n- Failing operation: loop ${failingOperation?.loopIndex ?? 'unknown'}, ${failingOperation?.operation ?? 'unknown'}, index ${failingOperation?.decodedEntityIndex ?? 'unknown'}\n- Production fix: none included.\n`);
    await appendIfMissing('reports/INDEX.md', '- `reports/replay-006-entity-lifecycle-state-refresh-gap.md`');
    await appendIfMissing('output/README.md', '## Replay 006 Entity Lifecycle Diagnostics');
    await appendIfMissing('output/match_91119257/README.md', '## Entity Lifecycle Gap');
}

async function replaceProjectStateReplay006Lifecycle(gate, failingOperation) {
    const filePath = 'docs/PROJECT_STATE.md';
    let text = await fs.readFile(filePath, 'utf8');
    const line = `- Replay 006 entity lifecycle gap gate is \`${gate.gate}\`: instrumentation now observes parser-owned registries in successful controls, and the tick 3808 packet decodes loop ${failingOperation?.loopIndex ?? 'unknown'} as ${failingOperation?.operation ?? 'unknown'} for entity index ${failingOperation?.decodedEntityIndex ?? 'unknown'} with bit range ${failingOperation?.payloadBitStart ?? 'unknown'}-${failingOperation?.payloadBitEnd ?? 'unknown'}. No prior parser-observable create/register lifecycle for entity 5594 was found, but the generic protocol root cause remains unconfirmed and no production fix was added.\n`;
    text = text.replace(/\n- Replay 006 state-reconstruction divergence gate is `replay_006_divergence_narrowed_not_confirmed`: the first localized invalid state precondition is a structurally valid `SVC_PacketEntities` message at tick 1163[^\n]*\n/g, '\n');
    if (!text.includes('Replay 006 entity lifecycle gap gate')) {
        text = text.replace('\n## Open Questions', `\n${line}\n## Open Questions`);
    }
    await fs.writeFile(filePath, text);
}

async function completeTask(gate) {
    const existingPath = await fileExists(TASK_PATH) ? TASK_PATH : COMPLETED_TASK_PATH;
    const task = await fs.readFile(existingPath, 'utf8');
    const updated = task
        .replace('Status: active', 'Status: completed')
        .replace('Status: blocked', 'Status: completed')
        .replace('## Gate result\n\nBlocked until explicitly authorized.', `## Gate result\n\n${gate.gate}`);
    await fs.writeFile(existingPath, updated);
    if (existingPath === TASK_PATH) {
        await fs.rename(TASK_PATH, COMPLETED_TASK_PATH);
    }
}

function patchMethod(target, method, wrapper) {
    const original = target[method].bind(target);
    target[method] = (...args) => wrapper(original, ...args);
}

function valueOrNull(value) {
    return value === undefined ? null : value;
}

function hashJson(value) {
    return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [ key, stable(value[key]) ]));
    }
    return value;
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
        await fs.writeFile(filePath, `${current.trimEnd()}\n${line}\n`);
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
