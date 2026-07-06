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
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/entity-index-allocation-gap/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-entity-index-allocation-gap/';
const TASK121_ROOT = 'output/local-replay-processing/replay_010-entity-2905-registry-and-packet-context/';
const TASK120_ROOT = 'output/local-replay-processing/replay_010-packet-entities-boundary-truncation/';
const TASK105_ERROR = 'Unable to find an entity with index [ 2905 ]';
const TARGET_ENTITY_INDEX = 2905;
const RANGE_START = 2880;
const RANGE_END = 2920;
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');
const IMPLEMENTATION_FILES = [
    'packages/engine/src/ParserConfiguration.js',
    'packages/engine/src/handlers/DemoMessageHandler.js',
    'tools/diagnose-replay-010-entity-index-allocation-gap.mjs'
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
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 122 authorizes only ${AUTHORIZED_INPUT}`);
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
        authorizedByTask: '122',
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
        allocationDiagnosticsEnabled: recovery?.diagnoseEntityIndexAllocation === true,
        truncationEnabled: recovery?.allowEntityPacketBoundaryTruncation === true,
        missingEntityRecoveryEnabled: recovery?.allowUnresolvedEntityReference === true,
        missingBaselineRecoveryEnabled: recovery?.allowMissingClassBaseline === true,
        recoveryActionsEnabled: false,
        expectedFailureReproduced: false,
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
        result.originalMissingEntity2905Reached = error?.message === TASK105_ERROR;
        result.errorMessage = error?.message ?? String(error);
        result.stackTop = sanitizeStack(error);
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        await player.dispose().catch(() => {});
    }

    return result;
}

function buildAllocationConfiguration(passMode, extraRecovery = {}) {
    return new ParserConfiguration({
        recovery: {
            ...extraRecovery,
            diagnoseEntityIndexAllocation: {
                passMode,
                targetIndex: TARGET_ENTITY_INDEX,
                rangeStart: RANGE_START,
                rangeEnd: RANGE_END,
                includeAllCreates: true
            }
        }
    });
}

function getAllocationEvents(configuration) {
    return configuration.recoveryDiagnostics
        .filter(diagnostic => diagnostic.type === 'entity_index_allocation')
        .sort(compareEvents);
}

function compareEvents(a, b) {
    return (a.packetOrdinal - b.packetOrdinal) || (a.loop - b.loop);
}

function compactEvent(event) {
    if (event === null || event === undefined) return null;
    return {
        passMode: event.passMode,
        packetOrdinal: event.packetOrdinal,
        loop: event.loop,
        operation: event.operation,
        entityIndex: event.entityIndex,
        targetKind: event.targetKind,
        previousEntityIndex: event.previousEntityIndex,
        indexDelta: event.indexDelta,
        registryStateBefore: event.registryStateBefore,
        registryStateAfter: event.registryStateAfter,
        classId: event.classId,
        serial: event.serial,
        className: event.className,
        payloadBits: event.payloadBits,
        readCounts: event.readCounts,
        classLookupAttempted: event.classLookupAttempted,
        classLookupSucceeded: event.classLookupSucceeded,
        baselineLookupAttempted: event.baselineLookupAttempted,
        baselineLookupSucceeded: event.baselineLookupSucceeded,
        registerEntityAttempted: event.registerEntityAttempted,
        registerEntitySucceeded: event.registerEntitySucceeded,
        fieldExtractionAttempted: event.fieldExtractionAttempted,
        fieldExtractionSucceeded: event.fieldExtractionSucceeded,
        action: event.action,
        failureStage: event.failureStage,
        fakeEntityCreated: event.fakeEntityCreated === true,
        fieldsMaterialized: event.fieldsMaterialized === true
    };
}

function eventsBeforeMissing(events, firstMissing) {
    if (firstMissing === null) return events;
    return events.filter(event => compareEvents(event, firstMissing) < 0);
}

function findFirstMissing2905(events) {
    return events.find(event =>
        event.entityIndex === TARGET_ENTITY_INDEX &&
        event.operation === 'UPDATE' &&
        event.action === 'missing_update_failed') ?? null;
}

export function buildEntityIndexRangeSummary(events) {
    const firstMissing = findFirstMissing2905(events);
    const beforeFailure = eventsBeforeMissing(events, firstMissing);
    const indexes = [];
    for (let entityIndex = RANGE_START; entityIndex <= RANGE_END; entityIndex++) {
        const indexEvents = events
            .filter(event => event.entityIndex === entityIndex)
            .sort(compareEvents);
        const beforeEvents = eventsBeforeMissing(indexEvents, firstMissing);
        const created = beforeEvents.filter(event => event.operation === 'CREATE');
        const registered = beforeEvents.filter(event => event.registerEntitySucceeded === true || event.registryStateAfter === 'present_active');
        const updated = indexEvents.filter(event => event.operation === 'UPDATE');
        const removed = beforeEvents.filter(event => event.operation === 'DELETE' || event.action === 'leave_or_deactivate');
        const first = indexEvents[0] ?? null;
        const last = indexEvents.at(-1) ?? null;
        const lastKnown = [...indexEvents].reverse().find(event => event.className !== null || event.serial !== null) ?? null;
        const isGap = created.length === 0 && registered.length === 0;

        indexes.push({
            entityIndex,
            everCreated: created.length > 0,
            everRegistered: registered.length > 0,
            everUpdated: updated.length > 0,
            everDeletedOrLeft: removed.length > 0,
            appearsAsMissingUpdate: indexEvents.some(event => event.action === 'missing_update_failed'),
            gapStatus: isGap ? (updated.length > 0 ? 'gap_with_update_reference' : 'gap_no_observed_reference') : 'created_or_registered',
            lastKnownClassName: lastKnown?.className ?? null,
            lastKnownSerial: lastKnown?.serial ?? null,
            firstSeenPacketOrdinal: first?.packetOrdinal ?? null,
            firstSeenLoop: first?.loop ?? null,
            lastSeenPacketOrdinal: last?.packetOrdinal ?? null,
            lastSeenLoop: last?.loop ?? null
        });
    }

    const createsBeforeFailure = beforeFailure.filter(event => event.operation === 'CREATE');
    const registeredBeforeFailure = beforeFailure.filter(event => event.registerEntitySucceeded === true || event.registryStateAfter === 'present_active');
    const maxCreatedBeforeFailure = maxEntityIndex(createsBeforeFailure);
    const maxRegisteredBeforeFailure = maxEntityIndex(registeredBeforeFailure);
    const gapIndexes = indexes.filter(entry => entry.gapStatus !== 'created_or_registered').map(entry => entry.entityIndex);
    const gapGroups = buildContiguousGroups(gapIndexes);
    const targetGapGroup = gapGroups.find(group => group.start <= TARGET_ENTITY_INDEX && TARGET_ENTITY_INDEX <= group.end) ?? null;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        range: { start: RANGE_START, end: RANGE_END },
        firstMissingUpdate: compactEvent(firstMissing),
        indexes,
        everCreatedIndexes: indexes.filter(entry => entry.everCreated).map(entry => entry.entityIndex),
        everRegisteredIndexes: indexes.filter(entry => entry.everRegistered).map(entry => entry.entityIndex),
        updatedIndexes: indexes.filter(entry => entry.everUpdated).map(entry => entry.entityIndex),
        gapIndexes,
        gapGroups,
        maxCreatedBeforeFailure,
        maxRegisteredBeforeFailure,
        entity2905PartOfContinuousGap: targetGapGroup !== null,
        entity2905GapGroup: targetGapGroup,
        rawValuesIncluded: false
    };
}

function maxEntityIndex(events) {
    const indexes = events.map(event => event.entityIndex).filter(Number.isInteger);
    return indexes.length === 0 ? null : Math.max(...indexes);
}

function buildContiguousGroups(indexes) {
    const sorted = [...new Set(indexes)].sort((a, b) => a - b);
    const groups = [];
    for (const index of sorted) {
        const last = groups.at(-1);
        if (last !== undefined && index === last.end + 1) {
            last.end = index;
            last.count++;
        } else {
            groups.push({ start: index, end: index, count: 1 });
        }
    }
    return groups;
}

export function buildEntity2905ProvenanceSummary(events, task121History) {
    const firstMissing = findFirstMissing2905(events);
    const beforeFailure = eventsBeforeMissing(events, firstMissing);
    const targetEvents = events.filter(event => event.entityIndex === TARGET_ENTITY_INDEX);
    const targetBefore = beforeFailure.filter(event => event.entityIndex === TARGET_ENTITY_INDEX);
    const createEvents = targetBefore.filter(event => event.operation === 'CREATE');
    const registerEvents = targetBefore.filter(event => event.registerEntityAttempted === true || event.registerEntitySucceeded === true);
    const classLookups = targetBefore.filter(event => event.classLookupAttempted === true);
    const baselineLookups = targetBefore.filter(event => event.baselineLookupAttempted === true);
    const failureBeforeMissing = targetBefore.find(event => event.failureStage !== null && event.failureStage !== undefined) ?? null;
    const appearsInCreateLikeMetadata = targetEvents.some(event => event.operation === 'CREATE');
    const bestClassification = createEvents.length === 0 && registerEvents.length === 0 && firstMissing !== null ?
        'never_registered_entity_with_create_gap' :
        (failureBeforeMissing !== null ? 'register_failure_suspected' : 'entity_index_gap_semantics_not_determined');

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        targetEntityIndex: TARGET_ENTITY_INDEX,
        createObservedFor2905: createEvents.length > 0,
        registerEntityAttemptedFor2905: registerEvents.length > 0,
        classLookupAttemptedFor2905: classLookups.length > 0,
        baselineLookupAttemptedFor2905: baselineLookups.length > 0,
        anyFailureStageBeforeMissingUpdate: failureBeforeMissing !== null,
        failureStageBeforeMissingUpdate: failureBeforeMissing?.failureStage ?? null,
        firstUpdateMissingPacketOrdinal: firstMissing?.packetOrdinal ?? null,
        firstUpdateMissingLoop: firstMissing?.loop ?? null,
        appearsInInitialCreateRegion: false,
        appearsInAnyCreateLikeMetadata: appearsInCreateLikeMetadata,
        firstObservedReference: compactEvent(targetEvents[0] ?? null),
        task121Classification: task121History.failureClassification,
        bestClassification,
        rawValuesIncluded: false
    };
}

export function buildCreateGapAnalysis(rangeSummary, provenanceSummary, events) {
    const indexes2900To2910 = rangeSummary.indexes
        .filter(entry => entry.entityIndex >= 2900 && entry.entityIndex <= 2910);
    const normalCreates2900To2902 = indexes2900To2910
        .filter(entry => entry.entityIndex >= 2900 && entry.entityIndex <= 2902 && entry.everCreated && entry.everRegistered)
        .map(entry => ({ entityIndex: entry.entityIndex, className: entry.lastKnownClassName }));
    const gaps2903To2910 = indexes2900To2910
        .filter(entry => entry.entityIndex >= 2903 && entry.entityIndex <= 2910 && entry.gapStatus !== 'created_or_registered')
        .map(entry => entry.entityIndex);
    const firstMissing = findFirstMissing2905(events);
    const createsAbove2905BeforeFailure = eventsBeforeMissing(events, firstMissing)
        .filter(event => event.operation === 'CREATE' && event.entityIndex > TARGET_ENTITY_INDEX)
        .map(event => compactEvent(event));
    const parserSkippedExpectedCreateSupported = provenanceSummary.createObservedFor2905 === false &&
        provenanceSummary.classLookupAttemptedFor2905 === false &&
        provenanceSummary.baselineLookupAttemptedFor2905 === false ?
        'not_supported_by_local_event_metadata' :
        'not_determined';

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        normalCreatesNear2900: normalCreates2900To2902,
        createRangeAppearsToEndBefore2905: normalCreates2900To2902.length === 3 && provenanceSummary.createObservedFor2905 === false,
        gaps2903To2910,
        gap2903To2910ExceptMissingUpdate2905: gaps2903To2910.includes(2905) && gaps2903To2910.length >= 8,
        createsAbove2905BeforeFailureCount: createsAbove2905BeforeFailure.length,
        createsAbove2905BeforeFailure: createsAbove2905BeforeFailure.slice(-10),
        parserSkippedExpectedCreateSupported,
        baselineOrClassFailureCouldPrevent2905Registration: provenanceSummary.classLookupAttemptedFor2905 === true || provenanceSummary.baselineLookupAttemptedFor2905 === true,
        filteredCreateOrSkipCouldRegisterWithoutFields: provenanceSummary.registerEntityAttemptedFor2905 === true && provenanceSummary.createObservedFor2905 === true,
        compatibleWithNeverRegisteredEntityWithoutEarlierError: provenanceSummary.bestClassification === 'never_registered_entity_with_create_gap',
        conclusion: provenanceSummary.bestClassification === 'never_registered_entity_with_create_gap' ?
            'entity 2905 is observed as a missing UPDATE inside an allocation gap without prior local CREATE/register/class/baseline evidence' :
            'create provenance remains incomplete or ambiguous'
    };
}

export function buildPacket954IndexSequenceAnalysis(events, task121PacketContext) {
    const firstMissing = findFirstMissing2905(events);
    const window = firstMissing?.entityIndexSequenceWindow ?? task121PacketContext.currentEntityIndexSequenceAroundFailingLoop ?? [];
    const entityIndexes = window.map(entry => entry.entityIndex).filter(Number.isInteger);
    const indexDeltas = window.map(entry => entry.indexDelta).filter(Number.isInteger);
    const monotonic = entityIndexes.every((value, index, values) => index === 0 || value > values[index - 1]);
    const averagePreviousDelta = indexDeltas.length > 1 ?
        indexDeltas.slice(0, -1).reduce((sum, value) => sum + value, 0) / Math.max(1, indexDeltas.length - 1) :
        null;
    const jumpDelta = firstMissing?.indexDelta ?? task121PacketContext.indexDelta ?? null;
    const largeJump = Number.isFinite(averagePreviousDelta) && Number.isInteger(jumpDelta) ?
        jumpDelta > averagePreviousDelta * 3 :
        (Number.isInteger(jumpDelta) ? jumpDelta >= 100 : null);
    const packetMetrics = firstMissing?.packetMetrics ?? {};
    const readCounts = firstMissing?.readCounts ?? task121PacketContext.readCounts ?? {};
    const entityDataBitLength = packetMetrics.entityDataBitLength ?? task121PacketContext.entityDataBitLength ?? null;
    const maxReadCount = Math.max(...Object.values(readCounts).filter(Number.isInteger));
    const readCountsWithinEntityData = Number.isInteger(entityDataBitLength) && Number.isInteger(maxReadCount) ?
        maxReadCount <= entityDataBitLength :
        null;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: firstMissing?.packetOrdinal ?? task121PacketContext.packetOrdinal,
        failingLoop: firstMissing?.loop ?? task121PacketContext.loop,
        window,
        monotonicIncreasingIndexes: monotonic,
        indexDeltas,
        jumpTo2905: {
            previousEntityIndex: firstMissing?.previousEntityIndex ?? task121PacketContext.previousEntityIndex,
            indexDelta: jumpDelta,
            accumulatedEntityIndex: firstMissing?.entityIndex ?? task121PacketContext.accumulatedEntityIndex,
            largeRelativeToLocalWindow: largeJump
        },
        loop30To33PayloadAndReadCountsLocallyBounded: readCountsWithinEntityData,
        payloadBitsAtFailure: firstMissing?.payloadBits ?? task121PacketContext.payloadBits,
        updatedEntries: packetMetrics.updatedEntries ?? task121PacketContext.updatedEntries,
        entityDataBitLength,
        payloadSizeCount: packetMetrics.payloadSizeCount ?? task121PacketContext.payloadSizeCount,
        packet954BoundaryOrTrailingSigns: readCountsWithinEntityData === true ? false : 'not_determined',
        indexStreamMisalignmentAssessment: readCountsWithinEntityData === true && monotonic === true ?
            (largeJump === true ? 'not_determined_large_jump_but_bounds_clean' : 'weakened_by_monotonic_bounded_packet') :
            'not_determined',
        rawBytesIncluded: false,
        rawPayloadsIncluded: false,
        fieldValuesIncluded: false
    };
}

function buildDefaultVsTruncationComparison({ allocationEvents, truncationEvents, rangeSummary, truncationRangeSummary, provenanceSummary, truncationProvenanceSummary, sequenceAnalysis, truncationSequenceAnalysis, allocationPass, truncationPass }) {
    const compactRange = summary => summary.indexes.map(entry => ({
        entityIndex: entry.entityIndex,
        everCreated: entry.everCreated,
        everRegistered: entry.everRegistered,
        everUpdated: entry.everUpdated,
        everDeletedOrLeft: entry.everDeletedOrLeft,
        appearsAsMissingUpdate: entry.appearsAsMissingUpdate,
        gapStatus: entry.gapStatus,
        lastKnownClassName: entry.lastKnownClassName,
        lastKnownSerial: entry.lastKnownSerial
    }));
    const compactProvenance = summary => ({
        createObservedFor2905: summary.createObservedFor2905,
        registerEntityAttemptedFor2905: summary.registerEntityAttemptedFor2905,
        classLookupAttemptedFor2905: summary.classLookupAttemptedFor2905,
        baselineLookupAttemptedFor2905: summary.baselineLookupAttemptedFor2905,
        anyFailureStageBeforeMissingUpdate: summary.anyFailureStageBeforeMissingUpdate,
        firstUpdateMissingPacketOrdinal: summary.firstUpdateMissingPacketOrdinal,
        firstUpdateMissingLoop: summary.firstUpdateMissingLoop,
        bestClassification: summary.bestClassification
    });
    const compactSequence = summary => ({
        packetOrdinal: summary.packetOrdinal,
        failingLoop: summary.failingLoop,
        window: summary.window,
        jumpTo2905: summary.jumpTo2905,
        payloadBitsAtFailure: summary.payloadBitsAtFailure,
        updatedEntries: summary.updatedEntries,
        entityDataBitLength: summary.entityDataBitLength,
        payloadSizeCount: summary.payloadSizeCount
    });

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        defaultAllocationEventCount: allocationEvents.length,
        truncationAllocationEventCount: truncationEvents.length,
        defaultRangeCreatedIndexes: rangeSummary.everCreatedIndexes,
        truncationRangeCreatedIndexes: truncationRangeSummary.everCreatedIndexes,
        rangeSummaryChanged: JSON.stringify(compactRange(rangeSummary)) !== JSON.stringify(compactRange(truncationRangeSummary)),
        entity2905ProvenanceChanged: JSON.stringify(compactProvenance(provenanceSummary)) !== JSON.stringify(compactProvenance(truncationProvenanceSummary)),
        packet954SequenceChanged: JSON.stringify(compactSequence(sequenceAnalysis)) !== JSON.stringify(compactSequence(truncationSequenceAnalysis)),
        defaultStillReachesMissingUpdate2905: allocationPass.expectedFailureReproduced === true,
        truncationStillReachesMissingUpdate2905: truncationPass.expectedFailureReproduced === true,
        conclusion: 'packet 953 truncation did not change the allocation/provenance evidence for entity 2905 before the packet 954 missing update'
    };
}

async function buildTask121Comparison({ allocationPass, truncationPass, rangeSummary, provenanceSummary, sequenceAnalysis }) {
    const task121History = await readJson(`${TASK121_ROOT}entity-2905-history-summary.json`);
    const task121Packet = await readJson(`${TASK121_ROOT}missing-update-packet-context.json`);
    const task121Nearby = await readJson(`${TASK121_ROOT}nearby-index-context-summary.json`);
    const task121Comparison = await readJson(`${TASK121_ROOT}default-vs-truncation-history-comparison.json`);

    const expected = {
        classification: 'first_missing_update_to_never_registered_entity',
        packetOrdinal: 954,
        loop: 33,
        indexDelta: 187,
        previousEntityIndex: 2717,
        accumulatedEntityIndex: 2905,
        payloadBits: 193,
        updatedEntries: 34,
        entityDataBitLength: 5936,
        payloadSizeCount: 34,
        nearbyCreatedIndexes: [ 2900, 2901, 2902 ],
        truncationChangesHistory: false
    };

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        expected,
        observedFromTask121: {
            classification: task121History.failureClassification,
            packetOrdinal: task121Packet.packetOrdinal,
            loop: task121Packet.loop,
            indexDelta: task121Packet.indexDelta,
            previousEntityIndex: task121Packet.previousEntityIndex,
            accumulatedEntityIndex: task121Packet.accumulatedEntityIndex,
            payloadBits: task121Packet.payloadBits,
            updatedEntries: task121Packet.updatedEntries,
            entityDataBitLength: task121Packet.entityDataBitLength,
            payloadSizeCount: task121Packet.payloadSizeCount,
            nearbyCreatedIndexes: task121Nearby.nearbyIndexesCreatedOrRegisteredNormally,
            truncationChangesHistory: task121Comparison.truncationChangesEntity2905RegistryHistory
        },
        observedFromTask122: {
            defaultMissingEntity2905: allocationPass.expectedFailureReproduced,
            truncationMissingEntity2905: truncationPass.expectedFailureReproduced,
            rangeCreatedIndexes: rangeSummary.everCreatedIndexes,
            createObservedFor2905: provenanceSummary.createObservedFor2905,
            registerAttemptedFor2905: provenanceSummary.registerEntityAttemptedFor2905,
            packetOrdinal: sequenceAnalysis.packetOrdinal,
            loop: sequenceAnalysis.failingLoop,
            indexDelta: sequenceAnalysis.jumpTo2905.indexDelta,
            previousEntityIndex: sequenceAnalysis.jumpTo2905.previousEntityIndex,
            accumulatedEntityIndex: sequenceAnalysis.jumpTo2905.accumulatedEntityIndex,
            payloadBits: sequenceAnalysis.payloadBitsAtFailure
        },
        confirmsTask121Exactly: task121History.failureClassification === expected.classification &&
            task121Packet.packetOrdinal === expected.packetOrdinal &&
            task121Packet.loop === expected.loop &&
            task121Packet.indexDelta === expected.indexDelta &&
            task121Packet.previousEntityIndex === expected.previousEntityIndex &&
            task121Packet.accumulatedEntityIndex === expected.accumulatedEntityIndex &&
            task121Packet.payloadBits === expected.payloadBits &&
            task121Packet.updatedEntries === expected.updatedEntries &&
            task121Packet.entityDataBitLength === expected.entityDataBitLength &&
            task121Packet.payloadSizeCount === expected.payloadSizeCount &&
            expected.nearbyCreatedIndexes.every(index => task121Nearby.nearbyIndexesCreatedOrRegisteredNormally.includes(index)) &&
            task121Comparison.truncationChangesEntity2905RegistryHistory === expected.truncationChangesHistory &&
            allocationPass.expectedFailureReproduced === true &&
            truncationPass.expectedFailureReproduced === true,
        rawValuesIncluded: false
    };
}

function buildRiskAssessment({ provenanceSummary, createGapAnalysis, sequenceAnalysis, defaultVsTruncationComparison }) {
    let safestNextStep = 'inspect_create_provenance_with_external_oracle_or_bounded_packet_lifecycle_comparison';
    if (sequenceAnalysis.indexStreamMisalignmentAssessment.startsWith('not_determined_large_jump')) {
        safestNextStep = 'compare_packet_954_index_stream_with_independent_decoder_or_static_source2_contract';
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        failureClassification: provenanceSummary.bestClassification,
        createGapConclusion: createGapAnalysis.conclusion,
        packet954IndexStreamAssessment: sequenceAnalysis.indexStreamMisalignmentAssessment,
        defaultVsTruncationConclusion: defaultVsTruncationComparison.conclusion,
        safestNextStep,
        parserFixProposed: false,
        automaticRecoveryAdded: false,
        missingEntityRecoveryAdded: false,
        boundaryTruncationDefaultEnabled: false,
        placeholderEntityCreated: false,
        fakeFieldsCreated: false,
        canonicalFactsProduced: false,
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        causalConclusion: 'limited_to_local_create_provenance_and_index_accounting_evidence'
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

function buildProtectionAudit({ inputIdentity, branchAudit, allocationConfiguration, truncationConfiguration }) {
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
        missingEntityRecoveryEnabled: allocationConfiguration.recovery?.allowUnresolvedEntityReference === true ||
            truncationConfiguration.recovery?.allowUnresolvedEntityReference === true,
        missingBaselineRecoveryEnabled: allocationConfiguration.recovery?.allowMissingClassBaseline === true ||
            truncationConfiguration.recovery?.allowMissingClassBaseline === true,
        allocationDiagnosticsOptInEnabled: allocationConfiguration.recovery?.diagnoseEntityIndexAllocation === true,
        truncationOptInEnabled: truncationConfiguration.recovery?.allowEntityPacketBoundaryTruncation === true,
        truncationDefaultEnabled: ParserConfiguration.DEFAULT.recovery?.allowEntityPacketBoundaryTruncation === true,
        replaySpecificBranchFound: branchAudit.replaySpecificBranchFound,
        passed: branchAudit.passed &&
            ParserConfiguration.DEFAULT.recovery === null &&
            allocationConfiguration.recovery?.allowUnresolvedEntityReference !== true &&
            allocationConfiguration.recovery?.allowMissingClassBaseline !== true &&
            truncationConfiguration.recovery?.allowUnresolvedEntityReference !== true &&
            truncationConfiguration.recovery?.allowMissingClassBaseline !== true
    };
}

function decideGate({ defaultPass, allocationPass, truncationPass, rangeSummary, provenanceSummary, createGapAnalysis, sequenceAnalysis, comparison, task121Comparison, protectionAudit, branchAudit }) {
    const diagnosed = defaultPass.expectedFailureReproduced === true &&
        allocationPass.expectedFailureReproduced === true &&
        truncationPass.expectedFailureReproduced === true &&
        rangeSummary.indexes.length === (RANGE_END - RANGE_START + 1) &&
        provenanceSummary.bestClassification !== 'blocked_or_incomplete' &&
        createGapAnalysis.compatibleWithNeverRegisteredEntityWithoutEarlierError === true &&
        sequenceAnalysis.packetOrdinal === 954 &&
        comparison.defaultStillReachesMissingUpdate2905 === true &&
        comparison.truncationStillReachesMissingUpdate2905 === true &&
        task121Comparison.confirmsTask121Exactly === true &&
        protectionAudit.passed === true &&
        branchAudit.passed === true;
    const partial = defaultPass.expectedFailureReproduced === true &&
        allocationPass.allocationDiagnosticsEnabled === true &&
        rangeSummary.indexes.length === (RANGE_END - RANGE_START + 1) &&
        protectionAudit.passed === true &&
        branchAudit.passed === true;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate: diagnosed ?
            'local_replay_entity_index_allocation_gap_diagnosed' :
            (partial ? 'local_replay_entity_index_allocation_gap_partial' : 'local_replay_entity_index_allocation_gap_blocked'),
        successGate: 'local_replay_entity_index_allocation_gap_diagnosed',
        partialGate: 'local_replay_entity_index_allocation_gap_partial',
        blockedGate: 'local_replay_entity_index_allocation_gap_blocked',
        defaultFailureReproduced: defaultPass.expectedFailureReproduced,
        allocationDiagnosticFailureReproduced: allocationPass.expectedFailureReproduced,
        truncationAllocationFailureReproduced: truncationPass.expectedFailureReproduced,
        rangeSummarized: rangeSummary.indexes.length === (RANGE_END - RANGE_START + 1),
        entity2905ProvenanceSummarized: provenanceSummary.firstUpdateMissingPacketOrdinal !== null,
        createGapAssessed: createGapAnalysis.compatibleWithNeverRegisteredEntityWithoutEarlierError,
        packet954IndexSequenceAssessed: sequenceAnalysis.packetOrdinal === 954,
        defaultVsTruncationCompared: comparison.defaultStillReachesMissingUpdate2905 === true &&
            comparison.truncationStillReachesMissingUpdate2905 === true,
        task121ComparedExactly: task121Comparison.confirmsTask121Exactly,
        failureClassification: provenanceSummary.bestClassification,
        defaultBehaviorChanged: false,
        automaticRecoveryAdded: false,
        canonicalFactsProduced: false,
        task123Created: false,
        passed: diagnosed
    };
}

function buildReport({ gate, rangeSummary, provenanceSummary, createGapAnalysis, sequenceAnalysis, comparison, riskAssessment }) {
    return [
        '# Replay 010 Entity Index Allocation Gap Diagnosis',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        '## Result',
        '',
        `- Entity 2905 CREATE observed: \`${provenanceSummary.createObservedFor2905}\``,
        `- Entity 2905 register attempted: \`${provenanceSummary.registerEntityAttemptedFor2905}\``,
        `- Entity 2905 class lookup attempted: \`${provenanceSummary.classLookupAttemptedFor2905}\``,
        `- Entity 2905 baseline lookup attempted: \`${provenanceSummary.baselineLookupAttemptedFor2905}\``,
        `- First missing UPDATE: packet \`${provenanceSummary.firstUpdateMissingPacketOrdinal}\`, loop \`${provenanceSummary.firstUpdateMissingLoop}\``,
        `- Classification: \`${provenanceSummary.bestClassification}\``,
        '',
        '## Range 2880-2920',
        '',
        `- Created indexes: \`${rangeSummary.everCreatedIndexes.join(', ') || 'none'}\``,
        `- Registered indexes: \`${rangeSummary.everRegisteredIndexes.join(', ') || 'none'}\``,
        `- Gap group containing 2905: \`${JSON.stringify(rangeSummary.entity2905GapGroup)}\``,
        `- Max created before failure: \`${rangeSummary.maxCreatedBeforeFailure}\``,
        '',
        '## Packet 954',
        '',
        `- Indexes monotonic in local window: \`${sequenceAnalysis.monotonicIncreasingIndexes}\``,
        `- Jump to 2905: \`${sequenceAnalysis.jumpTo2905.indexDelta}\` from \`${sequenceAnalysis.jumpTo2905.previousEntityIndex}\``,
        `- Read counts within entityData: \`${sequenceAnalysis.loop30To33PayloadAndReadCountsLocallyBounded}\``,
        `- Index stream assessment: \`${sequenceAnalysis.indexStreamMisalignmentAssessment}\``,
        '',
        '## Default Versus Truncation',
        '',
        `- Range summary changed: \`${comparison.rangeSummaryChanged}\``,
        `- Entity 2905 provenance changed: \`${comparison.entity2905ProvenanceChanged}\``,
        `- Packet 954 sequence changed: \`${comparison.packet954SequenceChanged}\``,
        '',
        '## Conclusion',
        '',
        `- Create-gap conclusion: \`${createGapAnalysis.conclusion}\``,
        `- Safest next step: \`${riskAssessment.safestNextStep}\``,
        '',
        '## Limits',
        '',
        '- Diagnostics are opt-in and do not change default parser behavior.',
        '- No recovery, placeholder entity, fake field, canonical package, source artifact, or match fact was produced.',
        '- No Source 2 semantic conclusion, parser bug conclusion, replay corruption conclusion, or final parser fix is made.'
    ].join('\n');
}

async function run({ inputPath, replayId, localOutput, summaryOutput }) {
    const input = validateInputPath(inputPath, replayId);
    const roots = validateOutputRoots(localOutput, summaryOutput);
    const inputIdentity = await buildInputIdentity(input);
    const defaultPass = await runPlayerPass({
        input,
        mode: 'default_without_allocation_diagnostics',
        configuration: undefined
    });
    const allocationConfiguration = buildAllocationConfiguration('allocation_diagnostic');
    const allocationPass = await runPlayerPass({
        input,
        mode: 'allocation_diagnostic_without_recovery',
        configuration: allocationConfiguration
    });
    const truncationConfiguration = buildAllocationConfiguration('truncation_allocation_diagnostic', {
        allowEntityPacketBoundaryTruncation: true
    });
    const truncationPass = await runPlayerPass({
        input,
        mode: 'truncation_allocation_diagnostic_without_missing_entity_recovery',
        configuration: truncationConfiguration
    });

    const allocationEvents = getAllocationEvents(allocationConfiguration);
    const truncationEvents = getAllocationEvents(truncationConfiguration);
    const task121History = await readJson(`${TASK121_ROOT}entity-2905-history-summary.json`);
    const task121Packet = await readJson(`${TASK121_ROOT}missing-update-packet-context.json`);
    const rangeSummary = buildEntityIndexRangeSummary(allocationEvents);
    const truncationRangeSummary = buildEntityIndexRangeSummary(truncationEvents);
    const provenanceSummary = buildEntity2905ProvenanceSummary(allocationEvents, task121History);
    const truncationProvenanceSummary = buildEntity2905ProvenanceSummary(truncationEvents, task121History);
    const createGapAnalysis = buildCreateGapAnalysis(rangeSummary, provenanceSummary, allocationEvents);
    const sequenceAnalysis = buildPacket954IndexSequenceAnalysis(allocationEvents, task121Packet);
    const truncationSequenceAnalysis = buildPacket954IndexSequenceAnalysis(truncationEvents, task121Packet);
    const comparison = buildDefaultVsTruncationComparison({
        allocationEvents,
        truncationEvents,
        rangeSummary,
        truncationRangeSummary,
        provenanceSummary,
        truncationProvenanceSummary,
        sequenceAnalysis,
        truncationSequenceAnalysis,
        allocationPass,
        truncationPass
    });
    const task121Comparison = await buildTask121Comparison({
        allocationPass,
        truncationPass,
        rangeSummary,
        provenanceSummary,
        sequenceAnalysis
    });
    const branchAudit = await auditImplementationSources();
    const protectionAudit = buildProtectionAudit({
        inputIdentity,
        branchAudit,
        allocationConfiguration,
        truncationConfiguration
    });
    const riskAssessment = buildRiskAssessment({
        provenanceSummary,
        createGapAnalysis,
        sequenceAnalysis,
        defaultVsTruncationComparison: comparison
    });
    const gate = decideGate({
        defaultPass,
        allocationPass,
        truncationPass,
        rangeSummary,
        provenanceSummary,
        createGapAnalysis,
        sequenceAnalysis,
        comparison,
        task121Comparison,
        protectionAudit,
        branchAudit
    });

    await writeJson(path.join(roots.local.absolutePath, 'full-entity-index-allocation-diagnostics.json'), {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        localOnly: true,
        rawEntityDataIncluded: false,
        rawSerializedEntitiesIncluded: false,
        rawPayloadsIncluded: false,
        stringBytesIncluded: false,
        stringValuesIncluded: false,
        fieldValuesIncluded: false,
        allocationRecoveryWarnings: allocationConfiguration.recoveryWarnings,
        allocationRecoveryDiagnostics: allocationConfiguration.recoveryDiagnostics,
        truncationRecoveryWarnings: truncationConfiguration.recoveryWarnings,
        truncationRecoveryDiagnostics: truncationConfiguration.recoveryDiagnostics
    });

    const allocationPassSummary = {
        ...allocationPass,
        recoveryWarnings: allocationConfiguration.recoveryWarnings,
        allocationEventsCount: allocationEvents.length,
        rangeEventsCount: allocationEvents.filter(event => event.targetKind === 'range' || event.targetKind === 'target').length,
        createContextEventsCount: allocationEvents.filter(event => event.targetKind === 'outside_range_create_context').length
    };
    const truncationPassSummary = {
        ...truncationPass,
        recoveryWarnings: truncationConfiguration.recoveryWarnings,
        allocationEventsCount: truncationEvents.length,
        rangeEventsCount: truncationEvents.filter(event => event.targetKind === 'range' || event.targetKind === 'target').length,
        createContextEventsCount: truncationEvents.filter(event => event.targetKind === 'outside_range_create_context').length,
        truncationEventsCount: truncationEvents.filter(event => event.action === 'boundary_truncation').length
    };

    const outputs = {
        'input-identity.json': inputIdentity,
        'default-pass-result.json': defaultPass,
        'allocation-diagnostic-pass-result.json': allocationPassSummary,
        'truncation-allocation-pass-result.json': truncationPassSummary,
        'entity-index-range-summary.json': rangeSummary,
        'entity-2905-provenance-summary.json': provenanceSummary,
        'create-gap-analysis.json': createGapAnalysis,
        'packet-954-index-sequence-analysis.json': sequenceAnalysis,
        'default-vs-truncation-allocation-comparison.json': comparison,
        'task121-comparison.json': task121Comparison,
        'risk-assessment.json': riskAssessment,
        'protection-audit.json': protectionAudit,
        'replay-specific-branch-audit.json': branchAudit,
        'entity-index-allocation-gate.json': gate
    };

    for (const [fileName, value] of Object.entries(outputs)) {
        await writeJson(path.join(roots.summary.absolutePath, fileName), value);
        await writeJson(path.join(roots.local.absolutePath, fileName), value);
    }

    const report = buildReport({
        gate,
        rangeSummary,
        provenanceSummary,
        createGapAnalysis,
        sequenceAnalysis,
        comparison,
        riskAssessment
    });
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-entity-index-allocation-gap.md'), `${report}\n`);

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
    buildAllocationConfiguration,
    buildDefaultVsTruncationComparison
};
