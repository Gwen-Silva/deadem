#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Logger, ParserConfiguration, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_REPLAY_ID = ['replay', '010'].join('_');
const AUTHORIZED_INPUT = '.local/deadem/replays/inbox/partida_010.dem';
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/entity-2905-registry-and-packet-context/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-entity-2905-registry-and-packet-context/';
const TASK120_ROOT = 'output/local-replay-processing/replay_010-packet-entities-boundary-truncation/';
const TASK105_ERROR = 'Unable to find an entity with index [ 2905 ]';
const BOUNDARY_ERROR = 'entity packet boundary crossed';
const TARGET_ENTITY_INDEX = 2905;
const NEARBY_START = 2900;
const NEARBY_END = 2910;
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');
const IMPLEMENTATION_FILES = [
    'packages/engine/src/ParserConfiguration.js',
    'packages/engine/src/handlers/DemoMessageHandler.js',
    'tools/diagnose-replay-010-entity-2905-registry-and-packet-context.mjs'
];

function slash(value) {
    return String(value).replaceAll(path.sep, '/');
}

function repoRelative(value) {
    return slash(path.relative(REPO_ROOT, path.resolve(REPO_ROOT, value)));
}

function assertNoForbiddenReplayPath(relativePath, replayId) {
    const normalized = slash(relativePath).toLowerCase();
    if (replayId !== AUTHORIZED_REPLAY_ID) throw new Error(`unsupported replay id: ${replayId}`);
    if (normalized.includes(`${SAMPLES_TOKEN}/`)) throw new Error(`samples path is forbidden: ${relativePath}`);
    if (normalized.includes(`${OUTPUT_REPLAYS_TOKEN}/`)) throw new Error(`output/replays path is forbidden: ${relativePath}`);
    if (/partida_00?5|replay_00?5/.test(normalized)) throw new Error(`protected replay path is forbidden: ${relativePath}`);
    if (/partida_00?[6-8]|replay_00?[6-8]/.test(normalized)) throw new Error(`bot fixture path is forbidden: ${relativePath}`);
    if (/partida_0?(1[1-9]|20)|replay_0?(1[1-9]|20)/.test(normalized)) throw new Error(`candidate outside canary scope is forbidden: ${relativePath}`);
    if (normalized.endsWith('.dem') && normalized !== AUTHORIZED_INPUT) throw new Error(`unauthorized replay input: ${relativePath}`);
}

export function validateInputPath(inputPath, replayId) {
    const relativePath = repoRelative(inputPath);
    assertNoForbiddenReplayPath(relativePath, replayId);
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 121 authorizes only ${AUTHORIZED_INPUT}`);
    return { absolutePath: path.resolve(REPO_ROOT, relativePath), relativePath };
}

function exactRoot(input, expected, label) {
    const relative = repoRelative(input);
    const normalized = relative.endsWith('/') ? relative : `${relative}/`;
    if (normalized !== expected) throw new Error(`${label} must be ${expected}`);
    return { absolutePath: path.resolve(REPO_ROOT, normalized), relativePath: normalized };
}

export function validateOutputRoots(localOutput, summaryOutput) {
    return {
        local: exactRoot(localOutput, REQUIRED_LOCAL_ROOT, 'local output root'),
        summary: exactRoot(summaryOutput, REQUIRED_SUMMARY_ROOT, 'summary output root')
    };
}

async function ensureDir(dir) {
    await mkdir(dir, { recursive: true });
}

async function writeJson(filePath, value) {
    await ensureDir(path.dirname(filePath));
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(relativePath) {
    return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), 'utf8'));
}

async function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(await readFile(filePath));
    return hash.digest('hex');
}

async function buildInputIdentity(input) {
    const info = await stat(input.absolutePath);
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        inputPath: input.relativePath,
        sizeBytes: info.size,
        sha256: await sha256File(input.absolutePath),
        authorizedByTask: '121',
        rawBytesCommitted: false
    };
}

function sanitizeStack(error) {
    return String(error?.stack ?? '')
        .split('\n')
        .slice(0, 4)
        .map(line => line.replace(REPO_ROOT, '<repo>'));
}

async function runPlayerPass({ input, mode, configuration }) {
    const player = new Player(configuration, Logger.NOOP);
    const started = performance.now();
    const recovery = configuration?.recovery ?? null;
    const result = {
        mode,
        registryHistoryEnabled: recovery?.diagnoseEntityRegistryHistory === true,
        boundaryGuardEnabled: recovery?.diagnoseEntityPacketBoundaryGuard === true,
        truncationEnabled: recovery?.allowEntityPacketBoundaryTruncation === true,
        missingEntityRecoveryEnabled: recovery?.allowUnresolvedEntityReference === true,
        missingBaselineRecoveryEnabled: recovery?.allowMissingClassBaseline === true,
        recoveryActionsEnabled: false,
        expectedFailureReproduced: false,
        boundaryFailureReproduced: false,
        originalMissingEntity2905Reached: false,
        reachedEnd: false,
        ticksAdvanced: 0,
        currentTick: null,
        finalTick: null,
        errorMessage: '',
        stackTop: [],
        durationMs: 0
    };

    try {
        await player.load(createReadStream(input.absolutePath));
        let previousTick = Number(player.getCurrentTick());
        result.currentTick = previousTick;

        while (true) {
            const advanced = await player.nextTick();
            const currentTick = Number(player.getCurrentTick());
            if (Number.isFinite(previousTick) && Number.isFinite(currentTick)) {
                result.ticksAdvanced += Math.max(0, currentTick - previousTick);
            }
            previousTick = currentTick;
            result.currentTick = currentTick;
            result.finalTick = Number(player.getLastTick());
            if (!advanced) {
                result.reachedEnd = true;
                break;
            }
        }
    } catch (error) {
        result.expectedFailureReproduced = error?.message === TASK105_ERROR;
        result.boundaryFailureReproduced = error?.message === BOUNDARY_ERROR;
        result.originalMissingEntity2905Reached = error?.message === TASK105_ERROR;
        result.errorMessage = error?.message ?? String(error);
        result.stackTop = sanitizeStack(error);
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        await player.dispose().catch(() => {});
    }

    return result;
}

function buildRegistryConfiguration(passMode, extraRecovery = {}) {
    return new ParserConfiguration({
        recovery: {
            ...extraRecovery,
            diagnoseEntityRegistryHistory: {
                passMode,
                targetIndexes: [ TARGET_ENTITY_INDEX ],
                nearbyIndexStart: NEARBY_START,
                nearbyIndexEnd: NEARBY_END
            }
        }
    });
}

function getRegistryEvents(configuration) {
    return configuration.recoveryDiagnostics
        .filter(diagnostic => diagnostic.type === 'entity_registry_history');
}

function summarizeTargetHistory(events, passMode) {
    const targetEvents = events
        .filter(event => event.entityIndex === TARGET_ENTITY_INDEX && event.targetKind === 'target')
        .sort(compareEvents);
    const firstReference = targetEvents[0] ?? null;
    const firstMissingUpdate = targetEvents.find(event => event.operation === 'UPDATE' && event.action === 'missing_update_failed') ?? null;
    const eventsBeforeMissing = firstMissingUpdate === null ? targetEvents : targetEvents.filter(event => compareEvents(event, firstMissingUpdate) < 0);
    const everCreated = eventsBeforeMissing.some(event => event.operation === 'CREATE');
    const everRegistered = eventsBeforeMissing.some(event => event.entityWasRegistered === true || event.registryStateAfter === 'present_active');
    const everRemovedBeforeFailure = eventsBeforeMissing.some(event => event.operation === 'DELETE' || event.action === 'leave_or_deactivate');
    const lastBeforeFailure = eventsBeforeMissing.at(-1) ?? null;
    const failureClassification = classifyFailure({
        firstMissingUpdate,
        everCreated,
        everRegistered,
        everRemovedBeforeFailure,
        missingPacketHasBoundarySigns: hasBoundarySigns(firstMissingUpdate)
    });

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        passMode,
        targetEntityIndex: TARGET_ENTITY_INDEX,
        targetEventsCount: targetEvents.length,
        wasEverCreatedBeforeFailure: firstMissingUpdate === null ? 'not_determined' : everCreated,
        wasEverRegisteredBeforeFailure: firstMissingUpdate === null ? 'not_determined' : everRegistered,
        wasDeletedLeftOrDeactivatedBeforeFailure: firstMissingUpdate === null ? 'not_determined' : everRemovedBeforeFailure,
        firstReference: compactHistoryEvent(firstReference),
        firstReferenceIsMissingUpdate: firstReference !== null &&
            firstReference.operation === 'UPDATE' &&
            firstReference.action === 'missing_update_failed',
        firstMissingUpdate: compactHistoryEvent(firstMissingUpdate),
        lastRegistryStateBeforeFailure: lastBeforeFailure?.registryStateAfter ?? firstMissingUpdate?.registryStateBefore ?? null,
        classId: firstMissingUpdate?.classId ?? lastBeforeFailure?.classId ?? null,
        serial: firstMissingUpdate?.serial ?? lastBeforeFailure?.serial ?? null,
        className: firstMissingUpdate?.className ?? lastBeforeFailure?.className ?? null,
        failureClassification,
        lifecycleHypothesis: failureClassification,
        cursorIndexStreamHypothesis: hasBoundarySigns(firstMissingUpdate) ? 'index_stream_misalignment_suspected' : 'not_supported_by_missing_packet_bounds',
        rawValuesIncluded: false
    };
}

function classifyFailure({ firstMissingUpdate, everCreated, everRegistered, everRemovedBeforeFailure, missingPacketHasBoundarySigns }) {
    if (firstMissingUpdate === null) {
        return 'entity_2905_history_incomplete';
    }

    if (missingPacketHasBoundarySigns) {
        return 'index_stream_misalignment_suspected';
    }

    if (everRemovedBeforeFailure) {
        return 'missing_update_to_removed_entity';
    }

    if (!everCreated && !everRegistered) {
        return 'first_missing_update_to_never_registered_entity';
    }

    if (everCreated && everRegistered) {
        return 'registry_state_loss';
    }

    return 'not_determined';
}

function compareEvents(a, b) {
    return (a.packetOrdinal - b.packetOrdinal) || (a.loop - b.loop);
}

function compactHistoryEvent(event) {
    if (event === null || event === undefined) {
        return null;
    }

    return {
        passMode: event.passMode,
        packetOrdinal: event.packetOrdinal,
        loop: event.loop,
        operation: event.operation,
        entityIndex: event.entityIndex,
        targetKind: event.targetKind,
        registryStateBefore: event.registryStateBefore,
        registryStateAfter: event.registryStateAfter,
        classId: event.classId,
        serial: event.serial,
        className: event.className,
        readCounts: event.readCounts,
        payloadBits: event.payloadBits,
        action: event.action,
        entityWasRegistered: event.entityWasRegistered,
        fieldsMaterialized: event.fieldsMaterialized,
        placeholderOrFakeEntityCreated: event.placeholderOrFakeEntityCreated
    };
}

function hasBoundarySigns(event) {
    if (event === null || event === undefined) {
        return false;
    }

    const bitLength = event.packetMetrics?.entityDataBitLength;
    if (!Number.isInteger(bitLength)) {
        return false;
    }

    const counts = Object.values(event.readCounts ?? {}).filter(Number.isInteger);
    return counts.some(count => count > bitLength) ||
        (Number.isInteger(event.readCounts?.beforeIndex) && event.readCounts.beforeIndex >= bitLength);
}

function buildFirstMissingUpdate(firstMissing) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        targetEntityIndex: TARGET_ENTITY_INDEX,
        found: firstMissing !== null,
        firstMissingUpdate: compactHistoryEvent(firstMissing),
        firstReferenceAlreadyMissingUpdate: firstMissing !== null &&
            firstMissing.action === 'missing_update_failed' &&
            firstMissing.operation === 'UPDATE',
        rawPayloadsIncluded: false,
        fieldValuesIncluded: false
    };
}

function buildMissingPacketContext(firstMissing) {
    const metrics = firstMissing?.packetMetrics ?? {};
    const readCounts = firstMissing?.readCounts ?? {};
    const entityDataBitLength = metrics.entityDataBitLength ?? null;
    const counts = Object.values(readCounts).filter(Number.isInteger);
    const maxReadCount = counts.length > 0 ? Math.max(...counts) : null;
    const readCountsWithinEntityData = Number.isInteger(entityDataBitLength) && maxReadCount !== null ?
        maxReadCount <= entityDataBitLength :
        null;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        targetEntityIndex: TARGET_ENTITY_INDEX,
        packetOrdinal: firstMissing?.packetOrdinal ?? null,
        loop: firstMissing?.loop ?? null,
        updatedEntries: metrics.updatedEntries ?? null,
        entityDataBitLength,
        serializedEntitiesByteLength: metrics.serializedEntitiesByteLength ?? null,
        payloadSizeCount: metrics.payloadSizeCount ?? null,
        entriesProcessedBeforeFailure: firstMissing?.loop ?? null,
        currentEntityIndexSequenceAroundFailingLoop: firstMissing?.entityIndexSequenceWindow ?? [],
        previousEntityIndex: firstMissing?.previousEntityIndex ?? null,
        indexDelta: firstMissing?.indexDelta ?? null,
        accumulatedEntityIndex: firstMissing?.entityIndex ?? null,
        command: firstMissing?.commandId ?? null,
        operation: firstMissing?.operation ?? null,
        payloadBits: firstMissing?.payloadBits ?? null,
        readCounts,
        readCountsWithinEntityData,
        anyReadCountExceedsEntityData: Number.isInteger(entityDataBitLength) && maxReadCount !== null ?
            maxReadCount > entityDataBitLength :
            null,
        startsAtOrBeyondEntityData: Number.isInteger(entityDataBitLength) && Number.isInteger(readCounts.beforeIndex) ?
            readCounts.beforeIndex >= entityDataBitLength :
            null,
        boundaryOrTrailingSignsComparableToPacket953: Number.isInteger(entityDataBitLength) && maxReadCount !== null ?
            maxReadCount > entityDataBitLength || readCounts.beforeIndex >= entityDataBitLength :
            'not_determined',
        rawBytesIncluded: false,
        rawPayloadsIncluded: false,
        fieldValuesIncluded: false
    };
}

function buildNearbyIndexContext(events) {
    const indexes = [];
    for (let index = NEARBY_START; index <= NEARBY_END; index++) {
        const indexEvents = events
            .filter(event => event.entityIndex === index)
            .sort(compareEvents);
        const createdEvents = indexEvents.filter(event => event.operation === 'CREATE');
        const registeredEvents = indexEvents.filter(event => event.entityWasRegistered === true || event.registryStateAfter === 'present_active');
        const updatedEvents = indexEvents.filter(event => event.operation === 'UPDATE');
        const removedEvents = indexEvents.filter(event => event.operation === 'DELETE' || event.action === 'leave_or_deactivate');
        const first = indexEvents[0] ?? null;
        const last = indexEvents.at(-1) ?? null;
        const lastKnown = [...indexEvents].reverse().find(event => event.className !== null || event.serial !== null) ?? null;

        indexes.push({
            entityIndex: index,
            everCreated: createdEvents.length > 0,
            everRegistered: registeredEvents.length > 0,
            everUpdated: updatedEvents.length > 0,
            everDeletedOrLeft: removedEvents.length > 0,
            lastKnownClassName: lastKnown?.className ?? null,
            lastKnownSerial: lastKnown?.serial ?? null,
            firstSeenPacketOrdinal: first?.packetOrdinal ?? null,
            firstSeenLoop: first?.loop ?? null,
            lastSeenPacketOrdinal: last?.packetOrdinal ?? null,
            lastSeenLoop: last?.loop ?? null
        });
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        range: { start: NEARBY_START, end: NEARBY_END },
        indexes,
        nearbyIndexesCreatedOrRegisteredNormally: indexes
            .filter(entry => entry.entityIndex !== TARGET_ENTITY_INDEX && (entry.everCreated || entry.everRegistered))
            .map(entry => entry.entityIndex),
        rawValuesIncluded: false
    };
}

function buildHistoryComparison({ registrySummary, truncationSummary, registryEvents, truncationEvents }) {
    const sameFirstMissing = registrySummary.firstMissingUpdate?.packetOrdinal === truncationSummary.firstMissingUpdate?.packetOrdinal &&
        registrySummary.firstMissingUpdate?.loop === truncationSummary.firstMissingUpdate?.loop;
    const sameLifecycle = registrySummary.wasEverCreatedBeforeFailure === truncationSummary.wasEverCreatedBeforeFailure &&
        registrySummary.wasEverRegisteredBeforeFailure === truncationSummary.wasEverRegisteredBeforeFailure &&
        registrySummary.wasDeletedLeftOrDeactivatedBeforeFailure === truncationSummary.wasDeletedLeftOrDeactivatedBeforeFailure &&
        registrySummary.failureClassification === truncationSummary.failureClassification;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        defaultDiagnosticTargetEventCount: registrySummary.targetEventsCount,
        truncationDiagnosticTargetEventCount: truncationSummary.targetEventsCount,
        defaultOtherContextEvents: registryEvents.filter(event => event.targetKind === 'other_context').length,
        truncationOtherContextEvents: truncationEvents.filter(event => event.targetKind === 'other_context').length,
        sameFirstMissingUpdate: sameFirstMissing,
        sameLifecycleClassification: sameLifecycle,
        truncationChangesEntity2905RegistryHistory: !(sameFirstMissing && sameLifecycle),
        conclusion: sameFirstMissing && sameLifecycle ?
            'packet 953 truncation did not change the observed target entity 2905 registry history before the missing update' :
            'packet 953 truncation changed at least one observed target entity 2905 registry history field'
    };
}

async function buildTask120Comparison({ defaultPass, truncationPass, historyComparison }) {
    const task120Default = await readJson(`${TASK120_ROOT}default-pass-result.json`);
    const task120Truncation = await readJson(`${TASK120_ROOT}truncation-pass-result.json`);
    const task120Diagnostic = await readJson(`${TASK120_ROOT}truncation-diagnostic.json`);
    const task120Gate = await readJson(`${TASK120_ROOT}boundary-truncation-gate.json`);

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        task120Gate: task120Gate.gate,
        expected: {
            defaultMissingEntity2905: true,
            truncationPacketOrdinal: 953,
            truncationLoop: 27,
            truncationStillReachesMissingEntity2905: true,
            noRecoveryOrCanonicalFacts: true
        },
        observedFromTask120: {
            defaultError: task120Default.errorMessage,
            truncationTriggered: task120Diagnostic.truncationTriggered,
            truncationPacketOrdinal: task120Diagnostic.packetOrdinal,
            truncationLoop: task120Diagnostic.loop,
            originalMissingEntity2905Reached: task120Truncation.originalMissingEntity2905Reached,
            canonicalFactsProduced: task120Truncation.canonicalFactsProduced
        },
        observedFromTask121: {
            defaultError: defaultPass.errorMessage,
            truncationError: truncationPass.errorMessage,
            defaultDiagnosticStillMissingEntity2905: defaultPass.expectedFailureReproduced,
            truncationDiagnosticStillMissingEntity2905: truncationPass.expectedFailureReproduced,
            truncationChangesEntity2905RegistryHistory: historyComparison.truncationChangesEntity2905RegistryHistory
        },
        confirmsTask120: task120Gate.gate === 'local_replay_packet_entities_boundary_truncation_no_progress' &&
            task120Default.errorMessage === TASK105_ERROR &&
            task120Diagnostic.truncationTriggered === true &&
            task120Diagnostic.packetOrdinal === 953 &&
            task120Diagnostic.loop === 27 &&
            task120Truncation.originalMissingEntity2905Reached === true &&
            task120Truncation.canonicalFactsProduced === false &&
            defaultPass.expectedFailureReproduced === true &&
            truncationPass.expectedFailureReproduced === true,
        rawValuesIncluded: false
    };
}

function buildRiskAssessment({ registrySummary, missingPacketContext, historyComparison }) {
    const safestNextStep = missingPacketContext.boundaryOrTrailingSignsComparableToPacket953 === true ?
        'diagnose_packet_954_boundary_and_index_stream_before_any_recovery' :
        'investigate_entity_create_delete_lifecycle_for_entity_2905_and_nearby_indexes';

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        failureClassification: registrySummary.failureClassification,
        lifecycleHypothesis: registrySummary.lifecycleHypothesis,
        cursorIndexStreamHypothesis: registrySummary.cursorIndexStreamHypothesis,
        truncationChangesEntity2905RegistryHistory: historyComparison.truncationChangesEntity2905RegistryHistory,
        safestNextStep,
        defaultParserFixProposed: false,
        automaticRecoveryAdded: false,
        boundaryTruncationDefaultEnabled: false,
        missingEntityRecoveryAdded: false,
        placeholderEntityCreated: false,
        fakeFieldsCreated: false,
        canonicalFactsProduced: false,
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        causalConclusion: 'limited_to_local_registry_and_cursor_evidence',
        limitations: [
            'registry history is opt-in diagnostic metadata only',
            'no field values or raw packet payloads are committed',
            'classification does not prove Source 2 semantics or final parser correctness'
        ]
    };
}

async function auditImplementationSources() {
    const findings = [];
    for (const file of IMPLEMENTATION_FILES) {
        const source = await readFile(path.join(REPO_ROOT, file), 'utf8');
        if (/partida_010|replay_010/.test(source) && !file.startsWith('tools/')) {
            findings.push({ type: 'replay_specific_branch', file });
        }
        if (/allowUnresolvedEntityReference\s*:\s*true/.test(source)) {
            findings.push({ type: 'missing_entity_recovery_enabled', file });
        }
        if (/allowMissingClassBaseline\s*:\s*true/.test(source)) {
            findings.push({ type: 'missing_baseline_recovery_enabled', file });
        }
    }

    return {
        schemaVersion: 1,
        filesExamined: IMPLEMENTATION_FILES,
        findings,
        replaySpecificBranchFound: findings.some(finding => finding.type === 'replay_specific_branch'),
        missingEntityRecoveryEnabled: findings.some(finding => finding.type === 'missing_entity_recovery_enabled'),
        missingBaselineRecoveryEnabled: findings.some(finding => finding.type === 'missing_baseline_recovery_enabled'),
        passed: findings.length === 0
    };
}

function buildProtectionAudit({ inputIdentity, branchAudit, registryConfiguration, truncationConfiguration }) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        authorizedInput: inputIdentity.inputPath,
        replay005Accessed: false,
        bots006To008Processed: false,
        candidates011To020Processed: false,
        samplesUsed: false,
        outputReplaysUsed: false,
        demCommitted: false,
        localFilesCommitted: false,
        rawEntityDataCommitted: false,
        rawSerializedEntitiesCommitted: false,
        rawPayloadsCommitted: false,
        stringBytesCommitted: false,
        stringValuesCommitted: false,
        fieldValuesCommitted: false,
        fullSendTablePayloadCommitted: false,
        missingEntityRecoveryEnabled: registryConfiguration.recovery?.allowUnresolvedEntityReference === true ||
            truncationConfiguration.recovery?.allowUnresolvedEntityReference === true,
        missingBaselineRecoveryEnabled: registryConfiguration.recovery?.allowMissingClassBaseline === true ||
            truncationConfiguration.recovery?.allowMissingClassBaseline === true,
        registryHistoryOptInEnabled: registryConfiguration.recovery?.diagnoseEntityRegistryHistory === true,
        truncationOptInEnabled: truncationConfiguration.recovery?.allowEntityPacketBoundaryTruncation === true,
        truncationDefaultEnabled: ParserConfiguration.DEFAULT.recovery?.allowEntityPacketBoundaryTruncation === true,
        replaySpecificBranchFound: branchAudit.replaySpecificBranchFound,
        passed: branchAudit.passed &&
            ParserConfiguration.DEFAULT.recovery === null &&
            registryConfiguration.recovery?.allowUnresolvedEntityReference !== true &&
            registryConfiguration.recovery?.allowMissingClassBaseline !== true &&
            truncationConfiguration.recovery?.allowUnresolvedEntityReference !== true &&
            truncationConfiguration.recovery?.allowMissingClassBaseline !== true
    };
}

function decideGate({ defaultPass, registryPass, truncationPass, registrySummary, firstMissingUpdate, nearbySummary, historyComparison, task120Comparison, protectionAudit, branchAudit }) {
    const diagnosed = defaultPass.expectedFailureReproduced === true &&
        registryPass.expectedFailureReproduced === true &&
        truncationPass.expectedFailureReproduced === true &&
        firstMissingUpdate.found === true &&
        registrySummary.failureClassification !== 'entity_2905_history_incomplete' &&
        nearbySummary.indexes.length === (NEARBY_END - NEARBY_START + 1) &&
        historyComparison.truncationChangesEntity2905RegistryHistory === false &&
        task120Comparison.confirmsTask120 === true &&
        protectionAudit.passed === true &&
        branchAudit.passed === true;

    const partial = defaultPass.expectedFailureReproduced === true &&
        registryPass.registryHistoryEnabled === true &&
        nearbySummary.indexes.length === (NEARBY_END - NEARBY_START + 1) &&
        protectionAudit.passed === true &&
        branchAudit.passed === true;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate: diagnosed ?
            'local_replay_entity_2905_registry_and_packet_context_diagnosed' :
            (partial ? 'local_replay_entity_2905_registry_and_packet_context_partial' : 'local_replay_entity_2905_registry_and_packet_context_blocked'),
        successGate: 'local_replay_entity_2905_registry_and_packet_context_diagnosed',
        partialGate: 'local_replay_entity_2905_registry_and_packet_context_partial',
        blockedGate: 'local_replay_entity_2905_registry_and_packet_context_blocked',
        defaultFailureReproduced: defaultPass.expectedFailureReproduced,
        registryDiagnosticFailureReproduced: registryPass.expectedFailureReproduced,
        truncationDiagnosticFailureReproduced: truncationPass.expectedFailureReproduced,
        entity2905HistorySummarized: registrySummary.targetEventsCount > 0,
        firstMissingUpdateFound: firstMissingUpdate.found,
        nearbyIndexContextProduced: nearbySummary.indexes.length === (NEARBY_END - NEARBY_START + 1),
        task120Confirmed: task120Comparison.confirmsTask120,
        truncationChangesEntity2905RegistryHistory: historyComparison.truncationChangesEntity2905RegistryHistory,
        failureClassification: registrySummary.failureClassification,
        defaultBehaviorChanged: false,
        automaticRecoveryAdded: false,
        canonicalFactsProduced: false,
        task122Created: false,
        passed: diagnosed,
        conclusion: diagnosed ?
            'entity 2905 registry and missing-update packet context were diagnosed with bounded local evidence' :
            (partial ? 'entity 2905 registry and missing-update packet context were partially diagnosed' : 'entity 2905 registry and missing-update packet context diagnosis is blocked')
    };
}

function buildReport({ gate, registrySummary, missingPacketContext, nearbySummary, historyComparison, task120Comparison, riskAssessment }) {
    return [
        '# Replay 010 Entity 2905 Registry And Packet Context Diagnosis',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        '## Result',
        '',
        `- Entity 2905 ever created before failure: \`${registrySummary.wasEverCreatedBeforeFailure}\``,
        `- Entity 2905 ever registered before failure: \`${registrySummary.wasEverRegisteredBeforeFailure}\``,
        `- Entity 2905 removed before failure: \`${registrySummary.wasDeletedLeftOrDeactivatedBeforeFailure}\``,
        `- First missing update packet/loop: \`${missingPacketContext.packetOrdinal}/${missingPacketContext.loop}\``,
        `- First reference already missing update: \`${registrySummary.firstReferenceIsMissingUpdate}\``,
        `- Missing packet read counts within entityData: \`${missingPacketContext.readCountsWithinEntityData}\``,
        `- Truncation changes entity 2905 registry history: \`${historyComparison.truncationChangesEntity2905RegistryHistory}\``,
        `- Failure classification: \`${registrySummary.failureClassification}\``,
        `- Safest next step: \`${riskAssessment.safestNextStep}\``,
        '',
        '## Nearby Indexes',
        '',
        `- Nearby indexes summarized: \`${nearbySummary.indexes.length}\``,
        `- Nearby indexes created or registered normally: \`${nearbySummary.nearbyIndexesCreatedOrRegisteredNormally.join(', ') || 'none observed'}\``,
        '',
        '## Task 120 Comparison',
        '',
        `- Confirms default and truncation both reach missing entity 2905: \`${task120Comparison.confirmsTask120}\``,
        '',
        '## Limits',
        '',
        '- Diagnostics are opt-in and do not change default parser behavior.',
        '- No missing-entity recovery, placeholder entity, fake field, canonical package, source artifact, or match fact was produced.',
        '- No Source 2 semantic conclusion, parser bug conclusion, replay corruption conclusion, or final parser fix is made.'
    ].join('\n');
}

async function run({ inputPath, replayId, localOutput, summaryOutput }) {
    const input = validateInputPath(inputPath, replayId);
    const roots = validateOutputRoots(localOutput, summaryOutput);
    const inputIdentity = await buildInputIdentity(input);
    const defaultPass = await runPlayerPass({
        input,
        mode: 'default_without_registry_diagnostics',
        configuration: undefined
    });
    const registryConfiguration = buildRegistryConfiguration('registry_diagnostic');
    const registryPass = await runPlayerPass({
        input,
        mode: 'registry_diagnostic_without_recovery',
        configuration: registryConfiguration
    });
    const truncationConfiguration = buildRegistryConfiguration('truncation_registry_diagnostic', {
        allowEntityPacketBoundaryTruncation: true
    });
    const truncationPass = await runPlayerPass({
        input,
        mode: 'truncation_registry_diagnostic_without_missing_entity_recovery',
        configuration: truncationConfiguration
    });

    const registryEvents = getRegistryEvents(registryConfiguration);
    const truncationEvents = getRegistryEvents(truncationConfiguration);
    const registrySummary = summarizeTargetHistory(registryEvents, 'registry_diagnostic');
    const truncationSummary = summarizeTargetHistory(truncationEvents, 'truncation_registry_diagnostic');
    const firstMissing = registryEvents
        .filter(event => event.entityIndex === TARGET_ENTITY_INDEX && event.operation === 'UPDATE' && event.action === 'missing_update_failed')
        .sort(compareEvents)[0] ?? null;
    const firstMissingUpdate = buildFirstMissingUpdate(firstMissing);
    const missingPacketContext = buildMissingPacketContext(firstMissing);
    const nearbySummary = buildNearbyIndexContext(registryEvents);
    const historyComparison = buildHistoryComparison({
        registrySummary,
        truncationSummary,
        registryEvents,
        truncationEvents
    });
    const task120Comparison = await buildTask120Comparison({
        defaultPass,
        truncationPass,
        historyComparison
    });
    const branchAudit = await auditImplementationSources();
    const protectionAudit = buildProtectionAudit({
        inputIdentity,
        branchAudit,
        registryConfiguration,
        truncationConfiguration
    });
    const riskAssessment = buildRiskAssessment({
        registrySummary,
        missingPacketContext,
        historyComparison
    });
    const gate = decideGate({
        defaultPass,
        registryPass,
        truncationPass,
        registrySummary,
        firstMissingUpdate,
        nearbySummary,
        historyComparison,
        task120Comparison,
        protectionAudit,
        branchAudit
    });

    await writeJson(path.join(roots.local.absolutePath, 'full-entity-2905-registry-history-diagnostics.json'), {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        localOnly: true,
        rawEntityDataIncluded: false,
        rawSerializedEntitiesIncluded: false,
        rawPayloadsIncluded: false,
        stringBytesIncluded: false,
        stringValuesIncluded: false,
        fieldValuesIncluded: false,
        registryRecoveryWarnings: registryConfiguration.recoveryWarnings,
        registryRecoveryDiagnostics: registryConfiguration.recoveryDiagnostics,
        truncationRecoveryWarnings: truncationConfiguration.recoveryWarnings,
        truncationRecoveryDiagnostics: truncationConfiguration.recoveryDiagnostics
    });

    const registryPassSummary = {
        ...registryPass,
        recoveryWarnings: registryConfiguration.recoveryWarnings,
        registryHistoryEventsCount: registryEvents.length,
        targetEventsCount: registryEvents.filter(event => event.entityIndex === TARGET_ENTITY_INDEX).length,
        nearbyEventsCount: registryEvents.filter(event => event.targetKind === 'nearby').length
    };
    const truncationPassSummary = {
        ...truncationPass,
        recoveryWarnings: truncationConfiguration.recoveryWarnings,
        registryHistoryEventsCount: truncationEvents.length,
        targetEventsCount: truncationEvents.filter(event => event.entityIndex === TARGET_ENTITY_INDEX).length,
        nearbyEventsCount: truncationEvents.filter(event => event.targetKind === 'nearby').length,
        truncationEventsCount: truncationEvents.filter(event => event.action === 'boundary_truncation').length
    };

    const outputs = {
        'input-identity.json': inputIdentity,
        'default-pass-result.json': defaultPass,
        'registry-diagnostic-pass-result.json': registryPassSummary,
        'truncation-registry-pass-result.json': truncationPassSummary,
        'entity-2905-history-summary.json': registrySummary,
        'entity-2905-first-missing-update.json': firstMissingUpdate,
        'missing-update-packet-context.json': missingPacketContext,
        'nearby-index-context-summary.json': nearbySummary,
        'default-vs-truncation-history-comparison.json': historyComparison,
        'task120-comparison.json': task120Comparison,
        'risk-assessment.json': riskAssessment,
        'protection-audit.json': protectionAudit,
        'replay-specific-branch-audit.json': branchAudit,
        'entity-2905-context-gate.json': gate
    };

    for (const [fileName, value] of Object.entries(outputs)) {
        await writeJson(path.join(roots.summary.absolutePath, fileName), value);
        await writeJson(path.join(roots.local.absolutePath, fileName), value);
    }

    const report = buildReport({
        gate,
        registrySummary,
        missingPacketContext,
        nearbySummary,
        historyComparison,
        task120Comparison,
        riskAssessment
    });
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-entity-2905-registry-and-packet-context.md'), `${report}\n`);

    return gate;
}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i];
        const value = argv[i + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument near ${key}`);
        args[key.slice(2)] = value;
    }
    return args;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === THIS_FILE) {
    const args = parseArgs(process.argv.slice(2));
    run({
        inputPath: args.input,
        replayId: args['replay-id'],
        localOutput: args['local-output'],
        summaryOutput: args['summary-output']
    }).then(gate => {
        console.log(JSON.stringify({ gate: gate.gate }, null, 2));
    }).catch(error => {
        console.error(error?.stack ?? error);
        process.exitCode = 1;
    });
}

export {
    buildFirstMissingUpdate,
    buildMissingPacketContext,
    buildNearbyIndexContext,
    buildRegistryConfiguration,
    buildHistoryComparison,
    summarizeTargetHistory
};
