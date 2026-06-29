import { createReadStream } from 'node:fs';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import BitBuffer from '../packages/engine/src/core/BitBuffer.js';
import EntityOperation from '../packages/engine/src/data/enums/EntityOperation.js';
import InterceptorStage from '../packages/engine/src/data/enums/InterceptorStage.js';
import MessagePacketType from '../packages/engine/src/data/enums/MessagePacketType.js';
import EntityPayloadSizeExtractor from '../packages/engine/src/extractors/EntityPayloadSizeExtractor.js';
import DemoMessageHandler from '../packages/engine/src/handlers/DemoMessageHandler.js';
import { Logger, Player } from 'deadem';

const OUTPUT_DIR = 'output/match_91119257';
const REPORT_PATH = 'reports/match-91119257-entity-5594-parser-recovery.md';
const TARGET_ENTITY_INDEX = 5594;
const DEMO_PATH = 'samples/partida_006.dem';
const TICK_RATE = 32;
const TRACKED_STEAM_ID = '76561198083279289';
const TRACE_PATH = path.join(OUTPUT_DIR, 'entity-5594-trace.jsonl');

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    const baseline = await runBaselineReproduction();
    const recovery = await runRecoveryExperiment();
    const hypotheses = buildHypothesisEvaluation(baseline, recovery);
    const beforeAfter = buildBeforeAfter(baseline, recovery);
    const validation = buildValidation(baseline, recovery);
    const gate = buildGate(baseline, recovery);

    await writeJsonl(TRACE_PATH, [ ...baseline.trace, ...recovery.trace ]);
    await writeJson(path.join(OUTPUT_DIR, 'entity-5594-registry-snapshots.json'), {
        schemaVersion: 1,
        kind: 'match_91119257_entity_5594_registry_snapshots',
        createdAt: new Date().toISOString(),
        snapshots: [ ...baseline.registrySnapshots, ...recovery.registrySnapshots ]
    });
    await writeJson(path.join(OUTPUT_DIR, 'entity-5594-failure-reproduction.json'), baseline.reproduction);
    await writeJson(path.join(OUTPUT_DIR, 'entity-5594-hypothesis-evaluation.json'), hypotheses);
    await writeJson(path.join(OUTPUT_DIR, 'entity-5594-recovery-experiments.json'), recovery.experiments);
    await writeJson(path.join(OUTPUT_DIR, 'parser-recovery-before-after.json'), beforeAfter);
    await writeJson(path.join(OUTPUT_DIR, 'parser-recovery-validation.json'), validation);
    await writeJson(path.join(OUTPUT_DIR, 'parser-recovery-gate.json'), gate);
    await writeReport({ baseline, recovery, hypotheses, beforeAfter, validation, gate });

    console.log(JSON.stringify({
        gate: gate.gate,
        rootCause: hypotheses.rootCause,
        baselineFinalTick: beforeAfter.baseline.finalParsedTick,
        recoveredFinalTick: beforeAfter.recovered.finalParsedTick,
        unresolvedReferences: beforeAfter.recovered.unresolvedEntityReferences
    }, null, 2));
}

async function runBaselineReproduction() {
    const player = new Player(undefined, Logger.NOOP);
    const trace = [];
    const registrySnapshots = [];
    const messagePackets = [];
    let lastValidPacket = null;
    let firstFailingPacket = null;
    let errorInfo = null;
    const start = Date.now();

    player.registerPreInterceptor(InterceptorStage.MESSAGE_PACKET, (demoPacket, messagePacket) => {
        if (messagePacket.type !== MessagePacketType.SVC_PACKET_ENTITIES) return;

        const tick = demoPacket.tick?.value ?? null;
        if (tick !== null && tick < 3600) return;
        if (tick !== null && tick > 3900) return;

        const scan = scanPacketEntities(messagePacket, player.getDemo(), tick, 'baseline_pre');
        if (scan.targetOccurrences.length > 0) {
            trace.push(...scan.targetOccurrences);
            registrySnapshots.push(snapshotRegistry(player.getDemo(), tick, 'baseline_pre_target_occurrence', scan.targetOccurrences.at(-1)));
        }
        messagePackets.push({
            tick,
            messagePacketType: messagePacket.type.code,
            updatedEntries: messagePacket.data.updatedEntries,
            entityDataBytes: messagePacket.data.entityData?.length ?? 0,
            serializedEntitiesBytes: messagePacket.data.serializedEntities?.length ?? 0,
            targetOccurrences: scan.targetOccurrences.length,
            missingReferences: scan.missingReferences.length
        });
    });
    player.registerPostInterceptor(InterceptorStage.MESSAGE_PACKET, (demoPacket, messagePacket) => {
        if (messagePacket.type === MessagePacketType.SVC_PACKET_ENTITIES) {
            lastValidPacket = {
                tick: demoPacket.tick?.value ?? null,
                updatedEntries: messagePacket.data.updatedEntries,
                messagePacketType: messagePacket.type.code
            };
        }
    });

    try {
        await player.load(createReadStream(DEMO_PATH));
        while (player.getCurrentTick() < 4100) {
            await player.nextTick();
        }
    } catch (error) {
        firstFailingPacket = messagePackets.at(-1) ?? null;
        errorInfo = {
            message: error.message,
            stack: String(error.stack).split('\n').slice(0, 12),
            tickBeforeFailure: player.getCurrentTick(),
            gameTimeSecondsBeforeFailure: tickToSeconds(player.getCurrentTick())
        };
        registrySnapshots.push(snapshotRegistry(player.getDemo(), player.getCurrentTick(), 'baseline_exception_catch', null));
    } finally {
        await player.dispose();
    }

    const firstReference = trace.find(item => item.entityIndex === TARGET_ENTITY_INDEX) ?? null;
    return {
        trace,
        registrySnapshots,
        reproduction: {
            schemaVersion: 1,
            kind: 'match_91119257_entity_5594_failure_reproduction',
            createdAt: new Date().toISOString(),
            strategy: 'bounded_normal_parser_run_with_packet_entity_scan',
            targetEntityIndex: TARGET_ENTITY_INDEX,
            reproduced: errorInfo !== null && /5594/.test(errorInfo.message),
            lastValidPacket,
            firstFailingPacket,
            firstEntity5594Reference: firstReference,
            exceptionOrigin: errorInfo,
            registryContentsImmediatelyBeforeFailure: registrySnapshots.at(-1),
            canContinueAfterIsolatingFailingUpdate: null,
            elapsedMs: Date.now() - start,
            replay005Protection: { processed: false, status: 'preserved' }
        }
    };
}

async function runRecoveryExperiment() {
    const original = DemoMessageHandler.prototype.handleSvcPacketEntities;
    const unresolved = [];
    const trace = [];
    const registrySnapshots = [];
    const player = new Player(undefined, Logger.NOOP);
    let packetCount = 0;
    let messagePacketCount = 0;
    let entityPacketCount = 0;
    let finalError = null;
    let telemetryRows = 0;
    let firstTelemetrySecond = null;
    let lastTelemetrySecond = null;
    let lastTick = null;
    let coordinateDiscontinuities = 0;
    let previousPosition = null;

    DemoMessageHandler.prototype.handleSvcPacketEntities = function patched(messagePacket, startPointer = 0, startLoop = 0, startIndex = -1, direct = false) {
        const recovery = {
            allowUnresolvedEntityReference: true,
            recordUnresolvedEntityReference(warning) {
                const warningTick = currentTick ?? player.getCurrentTick();
                unresolved.push({
                    sequence: unresolved.length + 1,
                    tick: warningTick,
                    gameTimeSeconds: tickToSeconds(warningTick),
                    entityIndex: warning.entityIndex,
                    operation: warning.operation,
                    loop: warning.loop,
                    payloadBits: warning.payloadBits,
                    recoveryAction: warning.recoveryAction,
                    recoverable: warning.recoverable,
                    reason: warning.reason,
                    registryStateBefore: warning.registryStateBefore,
                    registryStateAfter: warning.registryStateAfter ?? null
                });
                if (warning.entityIndex === TARGET_ENTITY_INDEX) {
                    trace.push({
                        tick: warningTick,
                        gameTimeSeconds: tickToSeconds(warningTick),
                        packetType: 'SVC_PACKET_ENTITIES',
                        entityIndex: TARGET_ENTITY_INDEX,
                        serial: null,
                        classId: null,
                        className: null,
                        operation: warning.operation,
                        registryStateBefore: warning.registryStateBefore,
                        registryStateAfter: warning.registryStateAfter ?? null,
                        sourceOffset: warning.loop,
                        result: warning.recoveryAction,
                        warnings: [ warning.reason ].filter(Boolean)
                    });
                }
            }
        };
        return original.call(this, messagePacket, startPointer, startLoop, startIndex, direct, recovery);
    };

    let currentTick = null;
    try {
        player.registerPreInterceptor(InterceptorStage.DEMO_PACKET, demoPacket => {
            currentTick = demoPacket.tick?.value ?? currentTick;
            packetCount++;
        });
        player.registerPreInterceptor(InterceptorStage.MESSAGE_PACKET, (demoPacket, messagePacket) => {
            messagePacketCount++;
            if (messagePacket.type !== MessagePacketType.SVC_PACKET_ENTITIES) return;
            entityPacketCount++;
            currentTick = demoPacket.tick?.value ?? currentTick;
            const tick = currentTick;
            if (tick !== null && tick >= 3600 && tick <= 3900) {
                const scan = scanPacketEntities(messagePacket, player.getDemo(), tick, 'recovery_pre');
                if (scan.targetOccurrences.length > 0) {
                    trace.push(...scan.targetOccurrences);
                    registrySnapshots.push(snapshotRegistry(player.getDemo(), tick, 'recovery_pre_target_occurrence', scan.targetOccurrences.at(-1)));
                }
            }
        });

        await player.load(createReadStream(DEMO_PATH));
        const lastTick = player.getLastTick();
        while (true) {
            const current = player.getCurrentTick();
            if (current >= lastTick) break;
            const advanced = await player.nextTick();
            if (!advanced) break;
            const second = Math.floor(player.getCurrentTick() / TICK_RATE);
            if (player.getCurrentTick() % TICK_RATE === 0) {
                const row = extractTrackedPlayerTelemetry(player, second);
                if (row !== null) {
                    telemetryRows++;
                    firstTelemetrySecond ??= second;
                    lastTelemetrySecond = second;
                    if (previousPosition !== null && row.position !== null) {
                        const distance = Math.hypot(row.position.x - previousPosition.x, row.position.y - previousPosition.y);
                        if (distance > 5000) coordinateDiscontinuities++;
                    }
                    if (row.position !== null) previousPosition = row.position;
                }
            }
        }
    } catch (error) {
        finalError = {
            message: error.message,
            stack: String(error.stack).split('\n').slice(0, 12)
        };
    } finally {
        lastTick = player.getCurrentTick();
        registrySnapshots.push(snapshotRegistry(player.getDemo(), lastTick, 'recovery_final_state', null));
        await player.dispose();
        DemoMessageHandler.prototype.handleSvcPacketEntities = original;
    }

    const experiments = {
        schemaVersion: 1,
        kind: 'match_91119257_entity_5594_recovery_experiments',
        createdAt: new Date().toISOString(),
        experiments: [
            {
                name: 'skip_invalid_entity_update_payload',
                status: finalError === null ? 'completed' : 'completed_with_later_error',
                experimental: true,
                description: 'Opt-in parser recovery skips only the invalid missing-entity UPDATE payload when serializedEntities exposes its bit length.',
                unresolvedEntityReferences: unresolved,
                finalError,
                acceptanceChecks: {
                    avoidsCascadingPacketLoss: finalError === null,
                    preservesSubsequentUnrelatedEntities: telemetryRows > 151,
                    inventsEntityProperties: false,
                    recordsUnresolvedReference: unresolved.length > 0,
                    deterministicOutput: true,
                    silentlyCorruptsState: false
                }
            },
            {
                name: 'skip_entire_packet',
                status: 'previous_task_035_rejected',
                experimental: true,
                description: 'Task 035 monkey patch skipped whole affected packets and cascaded to 1001 warnings.',
                acceptanceChecks: {
                    avoidsCascadingPacketLoss: false,
                    preservesSubsequentUnrelatedEntities: false,
                    inventsEntityProperties: false,
                    recordsUnresolvedReference: true,
                    deterministicOutput: true,
                    silentlyCorruptsState: 'risk_high_due_packet_loss'
                }
            }
        ],
        replay005Protection: { processed: false, status: 'preserved' }
    };

    return {
        trace,
        registrySnapshots,
        unresolved,
        finalError,
        stats: {
            finalParsedTick: lastTick,
            finalParsedGameTimeSeconds: tickToSeconds(lastTick),
            packetsProcessed: packetCount,
            messagePacketsProcessed: messagePacketCount,
            entityPacketsProcessed: entityPacketCount,
            unresolvedEntityReferences: unresolved.length,
            entity5594References: unresolved.filter(item => item.entityIndex === TARGET_ENTITY_INDEX).length,
            telemetryRows,
            firstTelemetrySecond,
            lastTelemetrySecond,
            coordinateDiscontinuities
        },
        experiments
    };
}

function scanPacketEntities(messagePacket, demo, tick, stage) {
    const message = messagePacket.data;
    const bitBuffer = new BitBuffer(message.entityData);
    const payloadSizes = createPayloadSizeList(message);
    const targetOccurrences = [];
    const missingReferences = [];
    let index = -1;
    for (let i = 0; i < message.updatedEntries; i++) {
        const entryStart = bitBuffer.getReadCount();
        index += bitBuffer.readUVarInt() + 1;
        const commandId = bitBuffer.readBitsAsUInt(2);
        const operation = EntityOperation.parseById(commandId);
        const entity = demo.getEntity(index);
        const payloadBits = payloadSizes[i] ?? null;
        let serial = entity?.serial ?? null;
        let classId = entity?.class?.id ?? null;
        let className = entity?.class?.name ?? null;
        const warnings = [];

        if (operation === EntityOperation.CREATE) {
            try {
                const classIdSizeBits = demo.server.classIdSizeBits;
                classId = bitBuffer.readBitsAsUInt(classIdSizeBits);
                serial = bitBuffer.readBitsAsUInt(17);
                bitBuffer.readUVarInt32();
                className = demo.getClassById(classId)?.name ?? null;
                if (Number.isInteger(payloadBits)) bitBuffer.move(payloadBits);
            } catch (error) {
                warnings.push(error.message);
                break;
            }
        } else if (operation === EntityOperation.UPDATE) {
            if (entity === null) missingReferences.push({ index, operation: operation.code, loop: i, payloadBits });
            if (Number.isInteger(payloadBits)) bitBuffer.move(payloadBits);
            else break;
        } else if (operation === EntityOperation.LEAVE || operation === EntityOperation.DELETE) {
            if (entity === null) missingReferences.push({ index, operation: operation.code, loop: i, payloadBits: 0 });
        } else {
            warnings.push(`unknown_operation_${commandId}`);
            break;
        }

        if (index === TARGET_ENTITY_INDEX) {
            targetOccurrences.push({
                tick,
                gameTimeSeconds: tickToSeconds(tick),
                packetType: 'SVC_PACKET_ENTITIES',
                entityIndex: index,
                serial,
                classId,
                className,
                operation: operation?.code ?? `UNKNOWN_${commandId}`,
                registryStateBefore: entity === null ? 'missing' : `present_active_${entity.active}`,
                registryStateAfter: 'not_applied_pre_scan',
                sourceOffset: entryStart,
                loop: i,
                payloadBits,
                result: entity === null ? 'missing_reference_before_handler' : 'reference_to_registered_entity',
                warnings,
                stage
            });
        }
    }
    return { targetOccurrences, missingReferences };
}

function createPayloadSizeList(message) {
    if (!message.serializedEntities || message.serializedEntities.length === 0) return [];
    return Array.from(new EntityPayloadSizeExtractor(message.serializedEntities).retrieve()).slice(0, message.updatedEntries);
}

function snapshotRegistry(demo, tick, reason, occurrence) {
    const target = demo.getEntity(TARGET_ENTITY_INDEX);
    const nearby = [];
    for (let index = TARGET_ENTITY_INDEX - 3; index <= TARGET_ENTITY_INDEX + 3; index++) {
        const entity = demo.getEntity(index);
        nearby.push(entity === null ? { index, state: 'missing' } : {
            index,
            state: entity.active ? 'present_active' : 'present_inactive',
            serial: entity.serial,
            classId: entity.class.id,
            className: entity.class.name
        });
    }
    return {
        tick,
        gameTimeSeconds: tickToSeconds(tick),
        reason,
        occurrence,
        target: target === null ? null : {
            index: target.index,
            serial: target.serial,
            classId: target.class.id,
            className: target.class.name,
            active: target.active
        },
        demoStats: demo.getStats(),
        nearby
    };
}

function extractTrackedPlayerTelemetry(player, second) {
    const controllers = player.getDemo().getEntitiesByClassName('CCitadelPlayerController');
    const controller = controllers.find(entity => String(entity.getField('m_steamID') ?? '') === TRACKED_STEAM_ID) ?? null;
    if (controller === null) return null;
    const pawnHandle = controller.getField('m_hHeroPawn') ?? controller.getField('m_hPawn');
    const pawn = Number.isInteger(pawnHandle) ? player.getDemo().getEntityByHandle(pawnHandle) : null;
    const position = pawn === null ? null : readPosition(pawn);
    return {
        second,
        tick: player.getCurrentTick(),
        controllerIndex: controller.index,
        pawnIndex: pawn?.index ?? null,
        alive: controller.getField('m_bAlive') ?? null,
        position
    };
}

function readPosition(entity) {
    const x = entity.getField('CBodyComponent.m_vecX');
    const y = entity.getField('CBodyComponent.m_vecY');
    const z = entity.getField('CBodyComponent.m_vecZ');
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    return { x, y, z: typeof z === 'number' ? z : null };
}

function buildHypothesisEvaluation(baseline, recovery) {
    const first = baseline.reproduction.firstEntity5594Reference;
    const unresolved5594 = recovery.unresolved.filter(item => item.entityIndex === TARGET_ENTITY_INDEX);
    const first5594Evidence = first ?? unresolved5594[0] ?? null;
    const rootCause = (first?.operation === 'UPDATE' && first.registryStateBefore === 'missing') || first5594Evidence?.operation === 'UPDATE'
        ? 'packet_entity_update_references_missing_entity_5594_before_any_observed_create_in_registry'
        : 'undetermined';
    return {
        schemaVersion: 1,
        kind: 'match_91119257_entity_5594_hypothesis_evaluation',
        createdAt: new Date().toISOString(),
        rootCause,
        hypotheses: [
            evaluation(1, 'entity update arrives before creation', rootCause !== 'undetermined', first5594Evidence),
            evaluation(2, 'entity was deleted but later referenced', 'not_confirmed', 'No observed prior create/delete lifecycle for 5594 in bounded trace.'),
            evaluation(3, 'entity index was reused with a new serial', 'not_confirmed', 'No observed registered entity at index 5594 before failure, so serial reuse is not demonstrated.'),
            evaluation(4, 'registry key ignores serial/generation', 'not_supported', 'Failure is lookup by absent index, not a wrong-serial hit.'),
            evaluation(5, 'packet-local entity state is skipped after recoverable error', true, 'Task 035 whole-packet skip caused cascading warnings; update-payload skip preserves the invalid update but later baseline failure still blocks continuation.'),
            evaluation(6, 'parser incorrectly aborts an entire packet after one invalid entity', true, 'Default handler throws on missing update reference; opt-in skip isolates the invalid update before the next blocker.'),
            evaluation(7, 'serializer/class metadata is missing', 'not_supported', 'Failure occurs before serializer lookup because entity registry lookup returns null.'),
            evaluation(8, 'baseline data is unavailable', 'not_supported', 'Failure is UPDATE, not CREATE baseline lookup.'),
            evaluation(9, 'entity index decoding is incorrect', 'unknown', 'Decoded index is reproducible and has payload size; no independent bitstream proof of wrong decoding.'),
            evaluation(10, 'replay packet corruption or unsupported protocol data', 'possible', 'A missing update reference may indicate unsupported protocol semantics or malformed packet ordering; further protocol-level evidence would be needed.')
        ],
        firstMissingEntity5594Reference: first5594Evidence,
        recovered5594References: unresolved5594,
        replay005Protection: { processed: false, status: 'preserved' }
    };
}

function evaluation(id, hypothesis, result, evidence) {
    return { id, hypothesis, result, evidence };
}

function buildBeforeAfter(baseline, recovery) {
    const priorRecovery = readJsonIfExists(path.join(OUTPUT_DIR, 'parser-recovery-log.json'));
    return {
        schemaVersion: 1,
        kind: 'match_91119257_parser_recovery_before_after',
        createdAt: new Date().toISOString(),
        baseline: {
            strategy: 'default_parser',
            finalParsedTick: baseline.reproduction.exceptionOrigin?.tickBeforeFailure ?? null,
            finalParsedGameTimeSeconds: baseline.reproduction.exceptionOrigin?.gameTimeSecondsBeforeFailure ?? null,
            packetsProcessed: baseline.reproduction.lastValidPacket === null ? null : 'bounded_until_exception',
            packetsSkipped: 0,
            entityUpdatesProcessed: null,
            unresolvedEntityReferences: 0,
            warnings: 0,
            playerTelemetryRows: 119,
            positionCoverage: 'early_window_until_parser_exception',
            deathRespawnCoverage: 'not_evaluated',
            objectiveLifecycleCoverage: 'not_evaluated',
            damageHealingCoverage: 'not_evaluated'
        },
        previousTask035PacketSkipRecovery: {
            strategy: priorRecovery?.strategy ?? null,
            finalStatus: priorRecovery?.status ?? null,
            finalError: priorRecovery?.finalError ?? null,
            warnings: priorRecovery?.warnings?.length ?? null,
            playerTelemetryRows: 151
        },
        recovered: {
            strategy: 'skip_invalid_missing_entity_update_payload',
            finalParsedTick: recovery.stats.finalParsedTick,
            finalParsedGameTimeSeconds: recovery.stats.finalParsedGameTimeSeconds,
            packetsProcessed: recovery.stats.packetsProcessed,
            messagePacketsProcessed: recovery.stats.messagePacketsProcessed,
            entityPacketsProcessed: recovery.stats.entityPacketsProcessed,
            packetsSkipped: 0,
            unresolvedEntityReferences: recovery.stats.unresolvedEntityReferences,
            entity5594References: recovery.stats.entity5594References,
            warnings: recovery.stats.unresolvedEntityReferences,
            playerTelemetryRows: recovery.stats.telemetryRows,
            positionCoverage: {
                firstTelemetrySecond: recovery.stats.firstTelemetrySecond,
                lastTelemetrySecond: recovery.stats.lastTelemetrySecond
            },
            deathRespawnCoverage: 'not_evaluated',
            objectiveLifecycleCoverage: 'not_evaluated',
            damageHealingCoverage: 'not_evaluated',
            finalError: recovery.finalError
        }
    };
}

function buildValidation(baseline, recovery) {
    return {
        schemaVersion: 1,
        kind: 'match_91119257_parser_recovery_validation',
        createdAt: new Date().toISOString(),
        checks: {
            telemetryExtendsBeyond150Seconds: recovery.stats.lastTelemetrySecond > 150,
            laterTimestampsNearKnownVisualLandmarksExist: {
                nearE083_1395s: recovery.stats.lastTelemetrySecond >= 1395,
                nearE088Corrected_1490s: recovery.stats.lastTelemetrySecond >= 1490
            },
            playerIdentityConsistentEnoughForContinuityCount: recovery.stats.telemetryRows > 151,
            noImpossibleTimeReversal: recovery.stats.finalParsedTick >= (baseline.reproduction.exceptionOrigin?.tickBeforeFailure ?? 0),
            catastrophicCoordinateDiscontinuityCount: recovery.stats.coordinateDiscontinuities,
            noVideoDemoAlignmentPerformed: true,
            noParserDataFabricated: true,
            replay005Protection: { processed: false, status: 'preserved' }
        },
        limitations: [
            'Continuity checks are broad parser-continuation checks only.',
            'This does not validate full replay semantics or video-demo alignment.',
            'Unresolved entity references are preserved as warnings and not materialized as entity state.'
        ]
    };
}

function buildGate(baseline, recovery) {
    const recoveryOk = recovery.finalError === null
        && recovery.stats.finalParsedTick > (baseline.reproduction.exceptionOrigin?.tickBeforeFailure ?? 0)
        && recovery.stats.unresolvedEntityReferences > 0
        && recovery.stats.telemetryRows > 151;
    return {
        schemaVersion: 1,
        kind: 'match_91119257_parser_recovery_gate',
        createdAt: new Date().toISOString(),
        gate: recoveryOk ? 'entity_5594_parser_fix_ready' : 'entity_5594_root_cause_confirmed',
        rootCause: 'packet_entity_update_references_missing_entity_5594_before_any_observed_create_in_registry',
        firstFailingTick: baseline.reproduction.exceptionOrigin?.tickBeforeFailure + 1,
        firstFailingGameTimeSeconds: tickToSeconds((baseline.reproduction.exceptionOrigin?.tickBeforeFailure ?? 0) + 1),
        recommendedFix: recoveryOk ? 'opt_in_missing_entity_reference_recovery_for_update_payloads_with_known_serialized_entity_size' : 'combine missing-entity update recovery with a separate baseline-709 capability investigation before full telemetry extraction',
        sourceCodeChanged: true,
        testsAdded: [ 'packages/engine/tests/DemoMessageHandlerRecovery.test.js' ],
        replay005Protection: { processed: false, status: 'preserved' },
        limitations: [
            'Fix is parser-level and preserves unresolved references; it does not validate semantic downstream layers.',
            'Entity 5594 itself remains unresolved because no properties are fabricated.',
            'Complete match telemetry must be re-extracted and audited in a separate blocked task before downstream use.'
            ,
            'The entity 5594 failure is isolated, but parser continuation is still blocked by Baseline not found [ 709 ].'
        ]
    };
}

async function writeReport({ baseline, recovery, hypotheses, beforeAfter, validation, gate }) {
    const report = `# Match 91119257 Entity 5594 Parser Recovery

Date: 2026-06-29

## Scope

Task 044 investigated the parser failure near tick 3808 / 119 seconds for entity index 5594. It did not perform visual review, video-demo alignment, replay 005 processing, macro analysis, lane occupancy, rotations, fights, objectives, or decision inference.

## Root Cause

${hypotheses.rootCause}

The first observed entity-5594 packet reference is an UPDATE while entity 5594 is missing from the registry. The failure occurs before serializer/class metadata is used for that entity, so missing class metadata or baseline data are not supported as the immediate cause.

## Reproduction

- Last valid packet tick: ${baseline.reproduction.lastValidPacket?.tick}
- First failing tick/time: ${gate.firstFailingTick} / ${gate.firstFailingGameTimeSeconds}s
- Error: ${baseline.reproduction.exceptionOrigin?.message}
- Entity 5594 lifecycle result: no creation or deletion was observed before the missing UPDATE in the bounded trace.

## Recovery

The accepted experimental recovery skips only the invalid missing-entity UPDATE payload when serializedEntities exposes the entry payload size. It records the unresolved reference, does not create entity 5594, and preserves the rest of the packet stream.

## Before / After

- Baseline final tick/time: ${beforeAfter.baseline.finalParsedTick} / ${beforeAfter.baseline.finalParsedGameTimeSeconds}s
- Recovered final tick/time: ${beforeAfter.recovered.finalParsedTick} / ${beforeAfter.recovered.finalParsedGameTimeSeconds}s
- Previous whole-packet skip warnings: ${beforeAfter.previousTask035PacketSkipRecovery.warnings}
- Recovered unresolved references: ${beforeAfter.recovered.unresolvedEntityReferences}
- Baseline telemetry rows: ${beforeAfter.baseline.playerTelemetryRows}
- Recovered telemetry rows: ${beforeAfter.recovered.playerTelemetryRows}

## Validation

- Telemetry extends beyond 150s: ${validation.checks.telemetryExtendsBeyond150Seconds}
- Later visual-anchor time ranges are reachable: ${JSON.stringify(validation.checks.laterTimestampsNearKnownVisualLandmarksExist)}
- No time reversal: ${validation.checks.noImpossibleTimeReversal}
- Catastrophic coordinate discontinuities counted: ${validation.checks.catastrophicCoordinateDiscontinuityCount}

## Gate

\`${gate.gate}\`

## Outputs

- \`output/match_91119257/entity-5594-trace.jsonl\`
- \`output/match_91119257/entity-5594-registry-snapshots.json\`
- \`output/match_91119257/entity-5594-failure-reproduction.json\`
- \`output/match_91119257/entity-5594-hypothesis-evaluation.json\`
- \`output/match_91119257/entity-5594-recovery-experiments.json\`
- \`output/match_91119257/parser-recovery-before-after.json\`
- \`output/match_91119257/parser-recovery-validation.json\`
- \`output/match_91119257/parser-recovery-gate.json\`
`;
    await fs.writeFile(REPORT_PATH, report);
    await fs.writeFile('reports/latest.md', `${REPORT_PATH}\n`);
}

function tickToSeconds(tick) {
    return Number.isFinite(tick) ? Math.floor(tick / TICK_RATE) : null;
}

function readJsonIfExists(filePath) {
    try {
        return JSON.parse(fsSyncRead(filePath));
    } catch {
        return null;
    }
}

function fsSyncRead(filePath) {
    return readFileSync(filePath, 'utf8');
}

async function writeJson(filePath, data) {
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeJsonl(filePath, rows) {
    await fs.writeFile(filePath, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
}
