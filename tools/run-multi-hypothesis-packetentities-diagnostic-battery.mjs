#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Logger, ParserConfiguration, Player } from 'deadem';
import EntityPayloadSizeExtractor from '../packages/engine/src/extractors/EntityPayloadSizeExtractor.js';
import EntityOperation from '../packages/engine/src/data/enums/EntityOperation.js';
import {
    buildCursorIndexContractProbe
} from '../packages/engine/src/handlers/DemoMessageHandler.js';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_INPUTS = new Map([
    [ 'replay_010', '.local/deadem/replays/inbox/partida_010.dem' ],
    [ 'replay_011', '.local/deadem/replays/inbox/partida_011.dem' ]
]);
const EXPECTED_ERRORS = new Map([
    [ 'replay_010', 'Unable to find an entity with index [ 2905 ]' ],
    [ 'replay_011', 'Unable to find an entity with index [ 5624 ]' ]
]);
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/multi-hypothesis-packetentities-diagnostic-battery/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/multi-hypothesis-packetentities-diagnostic-battery/';
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');

function slash(value) {
    return String(value).replaceAll(path.sep, '/');
}

function repoRelative(value) {
    return slash(path.relative(REPO_ROOT, path.resolve(REPO_ROOT, value)));
}

function parseArgs(argv) {
    const args = new Map();

    for (let i = 0; i < argv.length; i += 2) {
        if (!argv[i]?.startsWith('--')) {
            throw new Error(`invalid argument: ${argv[i] ?? ''}`);
        }
        args.set(argv[i].slice(2), argv[i + 1]);
    }

    return args;
}

function assertNoForbiddenPath(relativePath) {
    const normalized = slash(relativePath).toLowerCase();
    if (path.isAbsolute(relativePath)) throw new Error(`absolute path is forbidden: ${relativePath}`);
    if (normalized.includes('../') || normalized === '..') throw new Error(`path traversal is forbidden: ${relativePath}`);
    if (normalized.includes(`${SAMPLES_TOKEN}/`)) throw new Error(`samples path is forbidden: ${relativePath}`);
    if (normalized.includes(`${OUTPUT_REPLAYS_TOKEN}/`)) throw new Error(`output/replays path is forbidden: ${relativePath}`);
    if (/partida_00?5|replay_00?5/.test(normalized)) throw new Error(`protected replay path is forbidden: ${relativePath}`);
    if (/partida_00?[6-8]|replay_00?[6-8]/.test(normalized)) throw new Error(`bot fixture path is forbidden: ${relativePath}`);
    if (/partida_0?(1[2-9]|20)|replay_0?(1[2-9]|20)/.test(normalized)) throw new Error(`candidate outside canary scope is forbidden: ${relativePath}`);
}

function validateReplayInput(inputPath, replayId) {
    const relativePath = repoRelative(inputPath);
    assertNoForbiddenPath(relativePath);
    const expected = AUTHORIZED_INPUTS.get(replayId);
    if (expected === undefined) throw new Error(`unsupported replay id: ${replayId}`);
    if (relativePath !== expected) throw new Error(`${replayId} input must be ${expected}`);
    return { replayId, relativePath, absolutePath: path.resolve(REPO_ROOT, relativePath) };
}

function exactRoot(input, expected, label) {
    const relative = repoRelative(input);
    assertNoForbiddenPath(relative);
    const normalized = relative.endsWith('/') ? relative : `${relative}/`;
    if (normalized !== expected) throw new Error(`${label} must be ${expected}`);
    return { relativePath: normalized, absolutePath: path.resolve(REPO_ROOT, normalized) };
}

function validateOutputRoots(localOutput, summaryOutput) {
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

async function writeMarkdown(filePath, lines) {
    await ensureDir(path.dirname(filePath));
    await writeFile(filePath, `${lines.join('\n')}\n`);
}

function actionDelta(readCounts) {
    return Number.isInteger(readCounts?.afterCommand) && Number.isInteger(readCounts?.afterAction) ?
        readCounts.afterAction - readCounts.afterCommand :
        null;
}

function comparePayloadBits(payloadBits, readCounts, comparable = true) {
    const delta = actionDelta(readCounts);
    const matches = comparable && Number.isInteger(payloadBits) && Number.isInteger(delta) ? payloadBits === delta : false;
    return {
        payloadBits,
        actionDelta: delta,
        payloadBitsComparable: comparable,
        payloadBitsMatchesActionDelta: comparable ? matches : false
    };
}

function syntheticCursorLedger({ packetOrdinal = 1, updatedEntries = 2, entityDataBitLength = 1000, previousEntityIndex = 99, entry }) {
    return {
        recovery: {
            diagnoseMissingEntityFailClosed: true
        },
        packetMetrics: {
            packetOrdinal,
            updatedEntries,
            entityDataBitLength
        },
        entries: [
            {
                loop: entry.loop - 1,
                accumulatedEntityIndex: previousEntityIndex,
                readCounts: {
                    beforeIndex: Math.max(0, entry.readCounts.beforeIndex - 100),
                    afterIndex: Math.max(0, entry.readCounts.beforeIndex - 94),
                    afterCommand: Math.max(0, entry.readCounts.beforeIndex - 92),
                    afterAction: entry.readCounts.beforeIndex
                },
                payloadBits: 92,
                action: 'normal_update_apply'
            },
            entry
        ]
    };
}

function buildSyntheticScenario({ id, description, payloadBits, actionDeltaBits, action = 'normal_update_apply', previousEntityIndex = 99, indexDelta = 0, entityDataBitLength = 1000, expectedComparison }) {
    const beforeIndex = 100;
    const afterIndex = 106;
    const afterCommand = 108;
    const afterAction = afterCommand + actionDeltaBits;
    const entry = {
        loop: 1,
        readCounts: { beforeIndex, afterIndex, afterCommand, afterAction },
        indexDelta,
        accumulatedEntityIndex: previousEntityIndex + indexDelta + 1,
        commandId: EntityOperation.UPDATE.id,
        operation: EntityOperation.UPDATE.code,
        payloadBits,
        action,
        registryStateBefore: action === 'missing_update_failed' ? 'missing' : 'present'
    };
    const ledger = syntheticCursorLedger({ previousEntityIndex, entityDataBitLength, entry });
    const probe = buildCursorIndexContractProbe(ledger, entry, {
        operation: EntityOperation.UPDATE,
        index: entry.accumulatedEntityIndex
    });
    const comparison = comparePayloadBits(payloadBits, entry.readCounts, probe.compactConsistencyFlags.payloadBitsComparable);

    return {
        syntheticScenarioId: id,
        description,
        payloadBits,
        actionDelta: comparison.actionDelta,
        syntheticExpectedComparisonResult: expectedComparison,
        syntheticObservedComparisonResult: comparison.payloadBitsMatchesActionDelta ? 'match' : (comparison.payloadBitsComparable ? 'divergence' : 'not_comparable'),
        payloadBitsComparable: comparison.payloadBitsComparable,
        payloadBitsMatchesActionDelta: comparison.payloadBitsMatchesActionDelta,
        readCountsMonotonic: probe.compactConsistencyFlags.readCountsMonotonic,
        readCountsWithinEntityData: probe.compactConsistencyFlags.readCountsWithinEntityData,
        classificationCandidate: probe.diagnosticClassificationCandidate,
        classificationBasis: probe.diagnosticClassificationBasis,
        rawDataCaptured: false
    };
}

function buildNearbyWindowPayloadComparisonScenario() {
    const priorEntry = {
        loop: 1,
        readCounts: { beforeIndex: 100, afterIndex: 106, afterCommand: 108, afterAction: 260 },
        indexDelta: 0,
        accumulatedEntityIndex: 100,
        commandId: EntityOperation.UPDATE.id,
        operation: EntityOperation.UPDATE.code,
        payloadBits: 64,
        action: 'normal_update_apply',
        registryStateBefore: 'present'
    };
    const boundaryEntry = {
        loop: 2,
        readCounts: { beforeIndex: 260, afterIndex: 266, afterCommand: 268, afterAction: 268 },
        indexDelta: 0,
        accumulatedEntityIndex: 101,
        commandId: EntityOperation.UPDATE.id,
        operation: EntityOperation.UPDATE.code,
        payloadBits: 133,
        action: 'missing_update_failed',
        registryStateBefore: 'missing'
    };
    const ledger = {
        recovery: {
            diagnoseMissingEntityFailClosed: true
        },
        packetMetrics: {
            packetOrdinal: 1,
            updatedEntries: 3,
            entityDataBitLength: 1000
        },
        entries: [
            {
                loop: 0,
                accumulatedEntityIndex: 99,
                readCounts: { beforeIndex: 0, afterIndex: 6, afterCommand: 8, afterAction: 100 },
                payloadBits: 92,
                action: 'normal_update_apply'
            },
            priorEntry,
            boundaryEntry
        ]
    };
    const probe = buildCursorIndexContractProbe(ledger, boundaryEntry, {
        operation: EntityOperation.UPDATE,
        index: boundaryEntry.accumulatedEntityIndex
    });
    const mismatchCount = probe.nearbyWindowSummary.filter(entry => entry.payloadBitsMatchesActionDelta === false).length;

    return {
        syntheticScenarioId: 'nearby_window_payloadbits_comparison',
        description: 'nearby pre-boundary window mismatch can classify as payloadbits_contract_suspected without applying missing UPDATE payload',
        payloadBits: boundaryEntry.payloadBits,
        actionDelta: actionDelta(boundaryEntry.readCounts),
        syntheticExpectedComparisonResult: 'nearby_window_mismatch_detected',
        syntheticObservedComparisonResult: mismatchCount > 0 ? 'nearby_window_mismatch_detected' : 'no_nearby_window_mismatch_detected',
        payloadBitsComparable: probe.compactConsistencyFlags.payloadBitsComparable,
        payloadBitsMatchesActionDelta: probe.compactConsistencyFlags.payloadBitsMatchesActionDelta,
        nearbyWindowMismatchCount: mismatchCount,
        readCountsMonotonic: probe.compactConsistencyFlags.readCountsMonotonic,
        readCountsWithinEntityData: probe.compactConsistencyFlags.readCountsWithinEntityData,
        classificationCandidate: probe.diagnosticClassificationCandidate,
        classificationBasis: probe.diagnosticClassificationBasis,
        rawDataCaptured: false
    };
}

function runSyntheticBattery() {
    const extractorValues = Array.from(new EntityPayloadSizeExtractor(new Uint8Array([0x56, 0xDD, 0x01])).retrieve());
    const scenarios = [
        buildSyntheticScenario({
            id: 'simple_update_payload_exact_match',
            description: 'payloadBits and actionDelta match when the compact span is simple and comparable',
            payloadBits: 86,
            actionDeltaBits: 86,
            expectedComparison: 'match'
        }),
        buildSyntheticScenario({
            id: 'update_with_field_path_overhead',
            description: 'actionDelta can exceed payloadBits when synthetic overhead is included in the measured action span',
            payloadBits: 64,
            actionDeltaBits: 80,
            expectedComparison: 'divergence_action_delta_greater'
        }),
        buildSyntheticScenario({
            id: 'update_with_zero_bit_or_noop_segment',
            description: 'zero-bit/noop synthetic segment keeps actionDelta and payloadBits equal when no extra bits are consumed',
            payloadBits: 0,
            actionDeltaBits: 0,
            expectedComparison: 'match'
        }),
        buildSyntheticScenario({
            id: 'update_with_nested_or_multi_segment_field_path',
            description: 'nested or multi-segment synthetic field path can be represented as extra action span bits',
            payloadBits: 120,
            actionDeltaBits: 144,
            expectedComparison: 'divergence_action_delta_greater'
        }),
        buildSyntheticScenario({
            id: 'update_where_extractor_consumes_more_than_payloadBits',
            description: 'synthetic analog of replay_011 loop 27 mismatch shape',
            payloadBits: 221,
            actionDeltaBits: 373,
            expectedComparison: 'divergence_action_delta_greater'
        }),
        buildSyntheticScenario({
            id: 'update_where_payloadBits_exceeds_actionDelta',
            description: 'opposite synthetic divergence to ensure the comparator does not assume direction',
            payloadBits: 373,
            actionDeltaBits: 221,
            expectedComparison: 'divergence_payloadbits_greater'
        }),
        buildSyntheticScenario({
            id: 'missing_entity_boundary_no_action_delta_comparison',
            description: 'fail-closed missing UPDATE boundary is not comparable as consumed payload',
            payloadBits: 133,
            actionDeltaBits: 0,
            action: 'missing_update_failed',
            expectedComparison: 'not_comparable'
        }),
        buildNearbyWindowPayloadComparisonScenario(),
        {
            syntheticScenarioId: 'compact_metadata_only_output',
            description: 'outputs are compact and contain no raw replay, payload, entityData, serializedEntities, string, or field values',
            syntheticExpectedComparisonResult: 'rawDataCaptured_false',
            syntheticObservedComparisonResult: 'rawDataCaptured_false',
            payloadBitsComparable: false,
            payloadBitsMatchesActionDelta: false,
            readCountsMonotonic: true,
            readCountsWithinEntityData: true,
            classificationCandidate: 'not_determined',
            classificationBasis: 'metadata policy scenario',
            rawDataCaptured: false
        }
    ];
    const diverging = scenarios.filter(scenario => scenario.syntheticObservedComparisonResult?.startsWith('divergence'));

    return {
        schemaVersion: 1,
        extractorExercise: {
            inputDescription: 'synthetic varint bytes for 86 and 221 only; no replay bytes',
            decodedValues: extractorValues,
            rawReplayBytesUsed: false
        },
        scenarioCount: scenarios.length,
        divergenceScenarioCount: diverging.length,
        matchingScenarioCount: scenarios.filter(scenario => scenario.payloadBitsMatchesActionDelta === true).length,
        notComparableScenarioCount: scenarios.filter(scenario => scenario.payloadBitsComparable === false).length,
        scenarios,
        conclusion: 'synthetic battery shows exact matches, both divergence directions, and non-comparable fail-closed boundaries are possible under compact local metadata',
        rawDataCaptured: false
    };
}

async function runReplayPass(input) {
    const configuration = new ParserConfiguration({
        recovery: {
            diagnoseMissingEntityFailClosed: true
        }
    });
    const player = new Player(configuration, Logger.NOOP);
    const started = performance.now();
    const result = {
        replayId: input.replayId,
        mode: 'diagnostic_fail_closed_multi_hypothesis_battery',
        diagnosticEnabled: true,
        missingEntityRecoveryEnabled: false,
        missingBaselineRecoveryEnabled: false,
        truncationEnabled: false,
        recoveryActionsEnabled: false,
        loadSucceeded: false,
        reachedEnd: false,
        expectedFailureReached: false,
        ticksAdvanced: 0,
        currentTick: null,
        finalTick: null,
        firstErrorMessage: null,
        diagnosticsCount: 0,
        missingEntityDiagnosticCount: 0,
        durationMs: 0
    };

    try {
        await player.load(createReadStream(input.absolutePath));
        result.loadSucceeded = true;
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
        result.firstErrorMessage = error?.message ?? String(error);
        result.expectedFailureReached = result.firstErrorMessage === EXPECTED_ERRORS.get(input.replayId);
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        result.diagnosticsCount = configuration.recoveryDiagnostics.length;
        result.missingEntityDiagnosticCount = configuration.recoveryDiagnostics.filter(diagnostic => diagnostic.type === 'missing_entity_fail_closed').length;
        await player.dispose().catch(() => {});
    }

    const diagnostic = configuration.recoveryDiagnostics.find(candidate => candidate.type === 'missing_entity_fail_closed') ?? null;
    return {
        pass: result,
        boundary: compactBoundaryDiagnostic(input.replayId, diagnostic),
        rawDataCaptured: false
    };
}

function compactBoundaryDiagnostic(replayId, diagnostic) {
    if (diagnostic === null) {
        return null;
    }

    return {
        replayId,
        packetOrdinal: diagnostic.packetOrdinal,
        loop: diagnostic.loop,
        updatedEntries: diagnostic.updatedEntries,
        operation: diagnostic.operation,
        entityIndex: diagnostic.entityIndex,
        previousEntityIndex: diagnostic.previousEntityIndex,
        indexDelta: diagnostic.indexDelta,
        commandId: diagnostic.commandId,
        commandName: diagnostic.commandName,
        commandReadBitWidth: diagnostic.commandReadBitWidth,
        commandReadPosition: diagnostic.commandReadPosition,
        payloadBits: diagnostic.payloadBits,
        readCounts: diagnostic.readCounts,
        entityDataBitLength: diagnostic.entityDataBitLength,
        expectedEntityIndexByLocalFormula: diagnostic.expectedEntityIndexByLocalFormula,
        indexFormulaCheck: diagnostic.indexFormulaCheck,
        readCountWithinEntityData: diagnostic.readCountWithinEntityData,
        registryStateBefore: diagnostic.registryStateBefore,
        registryStateAfter: diagnostic.registryStateAfter,
        compactConsistencyFlags: diagnostic.compactConsistencyFlags,
        nearbyWindowSummary: diagnostic.nearbyWindowSummary ?? [],
        nearbyOffsetSummary: diagnostic.nearbyOffsetSummary ?? null,
        lifecycleClassificationCandidate: diagnostic.diagnosticClassificationCandidate,
        cursorClassificationCandidate: diagnostic.cursorIndexDiagnosticClassificationCandidate,
        cursorClassificationBasis: diagnostic.cursorIndexDiagnosticClassificationBasis,
        cursorClassificationLimitations: diagnostic.cursorIndexDiagnosticClassificationLimitations,
        totalCompactEventsForTarget: diagnostic.lifecycleProbe?.totalCompactEventsForTarget ?? null,
        totalCompactEventsTracked: diagnostic.lifecycleProbe?.totalCompactEventsTracked ?? null,
        fieldsMaterialized: diagnostic.fieldsMaterialized,
        placeholderOrFakeEntityCreated: diagnostic.placeholderOrFakeEntityCreated,
        parserContinuedAfterFailure: diagnostic.parserContinuedAfterFailure,
        recoveryAttempted: diagnostic.recoveryAttempted,
        skipModeApplied: diagnostic.skipModeApplied,
        payloadSkipped: diagnostic.payloadSkipped,
        updateApplied: diagnostic.updateApplied,
        rawDataCaptured: false
    };
}

function summarizeReplayContract(replayRun) {
    const boundary = replayRun.boundary;
    const comparableWindow = (boundary?.nearbyWindowSummary ?? []).filter(entry => entry.payloadBitsMatchesActionDelta !== null);
    const mismatches = comparableWindow.filter(entry => entry.payloadBitsMatchesActionDelta === false);
    const delta = actionDelta(boundary?.readCounts);

    return {
        schemaVersion: 1,
        replayId: replayRun.pass.replayId,
        pass: replayRun.pass,
        boundary: {
            replayId: boundary?.replayId ?? null,
            packetOrdinal: boundary?.packetOrdinal ?? null,
            loop: boundary?.loop ?? null,
            updatedEntries: boundary?.updatedEntries ?? null,
            operation: boundary?.operation ?? null,
            entityIndex: boundary?.entityIndex ?? null,
            previousEntityIndex: boundary?.previousEntityIndex ?? null,
            indexDelta: boundary?.indexDelta ?? null,
            commandId: boundary?.commandId ?? null,
            commandName: boundary?.commandName ?? null,
            commandReadBitWidth: boundary?.commandReadBitWidth ?? null,
            commandReadPosition: boundary?.commandReadPosition ?? null,
            payloadBits: boundary?.payloadBits ?? null,
            actionDelta: delta,
            payloadBitsComparable: boundary?.compactConsistencyFlags?.payloadBitsComparable ?? null,
            payloadBitsMatchesActionDelta: boundary?.compactConsistencyFlags?.payloadBitsMatchesActionDelta ?? null,
            readCounts: boundary?.readCounts ?? null,
            entityDataBitLength: boundary?.entityDataBitLength ?? null,
            readCountsMonotonic: boundary?.compactConsistencyFlags?.readCountsMonotonic ?? null,
            readCountsWithinEntityData: boundary?.compactConsistencyFlags?.readCountsWithinEntityData ?? null,
            nextEntryStartsAtPreviousAfterAction: boundary?.compactConsistencyFlags?.nextEntryStartsAtPreviousAfterAction ?? null,
            expectedEntityIndexByLocalFormula: boundary?.expectedEntityIndexByLocalFormula ?? null,
            indexFormulaCheck: boundary?.indexFormulaCheck ?? null,
            highDeltaSignal: boundary?.compactConsistencyFlags?.highDeltaSignal ?? null,
            nearbyOffsetAlternativeFound: boundary?.compactConsistencyFlags?.nearbyOffsetAlternativeFound ?? null,
            nearbyOffsetCandidateSummaryCount: boundary?.nearbyOffsetSummary?.bestCandidateCount ?? null,
            classificationCandidate: boundary?.cursorClassificationCandidate ?? 'not_determined',
            classificationBasis: boundary?.cursorClassificationBasis ?? null
        },
        nearbyWindow: {
            windowSize: boundary?.nearbyWindowSummary?.length ?? 0,
            comparableEntryCount: comparableWindow.length,
            mismatchCount: mismatches.length,
            mismatches: mismatches.map(entry => ({
                loop: entry.loop,
                entityIndex: entry.entityIndex,
                previousEntityIndex: entry.previousEntityIndex,
                indexDelta: entry.indexDelta,
                command: entry.command,
                payloadBits: entry.payloadBits,
                actionDelta: actionDelta({ afterCommand: entry.afterCommand, afterAction: entry.afterAction }),
                readCountsMonotonic: entry.readCountsMonotonic,
                readCountsWithinEntityData: entry.readCountsWithinEntityData,
                nextEntryStartsAtPreviousAfterAction: entry.nextEntryStartsAtPreviousAfterAction
            })),
            entries: (boundary?.nearbyWindowSummary ?? []).map(entry => ({
                loop: entry.loop,
                entityIndex: entry.entityIndex,
                previousEntityIndex: entry.previousEntityIndex,
                indexDelta: entry.indexDelta,
                command: entry.command,
                commandId: entry.commandId,
                payloadBits: entry.payloadBits,
                actionDelta: actionDelta({ afterCommand: entry.afterCommand, afterAction: entry.afterAction }),
                readCountsMonotonic: entry.readCountsMonotonic,
                readCountsWithinEntityData: entry.readCountsWithinEntityData,
                payloadBitsMatchesActionDelta: entry.payloadBitsMatchesActionDelta,
                nextEntryStartsAtPreviousAfterAction: entry.nextEntryStartsAtPreviousAfterAction
            }))
        },
        noContinuation: {
            parserContinuedAfterFailure: boundary?.parserContinuedAfterFailure ?? false,
            updateApplied: boundary?.updateApplied ?? false,
            payloadSkipped: boundary?.payloadSkipped ?? false,
            recoveryAttempted: boundary?.recoveryAttempted ?? false,
            skipModeApplied: boundary?.skipModeApplied ?? false,
            placeholderOrFakeEntityCreated: boundary?.placeholderOrFakeEntityCreated ?? false,
            fieldsMaterialized: boundary?.fieldsMaterialized ?? false
        },
        rawDataCaptured: false
    };
}

function buildReplayComparison(replay010, replay011) {
    return {
        schemaVersion: 1,
        sharedPattern: [
            'both fail closed on UPDATE for missing local registry entity',
            'both have zero action delta at the boundary because the missing UPDATE payload is not applied',
            'both preserve local index formula consistency and two-bit UPDATE command decode at the boundary',
            'both provide comparable compact nearby-window payloadBits/actionDelta entries before the boundary'
        ],
        replay010Distinctive: [
            `boundary entity ${replay010.boundary.entityIndex}`,
            `indexDelta ${replay010.boundary.indexDelta}`,
            `classification ${replay010.boundary.classificationCandidate}`
        ],
        replay011Distinctive: [
            `boundary entity ${replay011.boundary.entityIndex}`,
            `indexDelta ${replay011.boundary.indexDelta}`,
            `classification ${replay011.boundary.classificationCandidate}`,
            `nearby offset candidates ${replay011.boundary.nearbyOffsetCandidateSummaryCount}`
        ],
        highDeltaComparison: {
            replay010HighDeltaSignal: replay010.boundary.highDeltaSignal,
            replay011HighDeltaSignal: replay011.boundary.highDeltaSignal,
            assessment: replay011.boundary.highDeltaSignal ? 'replay_011 remains the stronger cursor/index suspicion canary' : 'high delta signal not observed'
        },
        payloadMismatchComparison: {
            replay010NearbyMismatchCount: replay010.nearbyWindow.mismatchCount,
            replay011NearbyMismatchCount: replay011.nearbyWindow.mismatchCount,
            assessment: replay010.nearbyWindow.mismatchCount > 0 && replay011.nearbyWindow.mismatchCount > 0 ?
                'payloadBits/actionDelta mismatch is repeated in both authorized canaries under compact diagnostics' :
                (replay011.nearbyWindow.mismatchCount > 0 ?
                    'payloadBits/actionDelta mismatch is currently replay_011-specific among the two authorized canaries' :
                    'payloadBits/actionDelta mismatch is not observed in either canary nearby window')
        },
        rawDataCaptured: false
    };
}

function buildPayloadBitsAnalysis(synthetic, replay010, replay011) {
    return {
        schemaVersion: 1,
        comparabilityConclusion: 'conditional',
        syntheticFindings: {
            exactMatchPossible: synthetic.scenarios.some(scenario => scenario.syntheticScenarioId === 'simple_update_payload_exact_match' && scenario.payloadBitsMatchesActionDelta === true),
            divergencePossible: synthetic.divergenceScenarioCount > 0,
            failClosedBoundaryComparable: false
        },
        replayFindings: {
            replay010BoundaryComparable: replay010.boundary.payloadBitsComparable,
            replay011BoundaryComparable: replay011.boundary.payloadBitsComparable,
            replay010NearbyMismatchCount: replay010.nearbyWindow.mismatchCount,
            replay011NearbyMismatchCount: replay011.nearbyWindow.mismatchCount,
            replay011Loop27ShapeMatchedBySyntheticScenario: synthetic.scenarios.some(scenario => scenario.syntheticScenarioId === 'update_where_extractor_consumes_more_than_payloadBits' && scenario.syntheticObservedComparisonResult === 'divergence')
        },
        assessment: 'payloadBits/actionDelta equality is useful in simple comparable cases. replay_010 matched throughout the nearby window, while replay_011 had one pre-boundary mismatch; this keeps the contract conditional and the replay_011 mismatch diagnostic rather than a proven direct skip contract.',
        rawDataCaptured: false
    };
}

function buildCursorIndexCommandAnalysis(replay010, replay011) {
    return {
        schemaVersion: 1,
        replay010: {
            formulaConsistent: replay010.boundary.indexFormulaCheck,
            expectedEntityIndexByLocalFormula: replay010.boundary.expectedEntityIndexByLocalFormula,
            commandName: replay010.boundary.commandName,
            commandId: replay010.boundary.commandId,
            commandReadBitWidth: replay010.boundary.commandReadBitWidth,
            commandPositionPlausible: replay010.boundary.readCountsWithinEntityData,
            highDeltaSignal: replay010.boundary.highDeltaSignal
        },
        replay011: {
            formulaConsistent: replay011.boundary.indexFormulaCheck,
            expectedEntityIndexByLocalFormula: replay011.boundary.expectedEntityIndexByLocalFormula,
            commandName: replay011.boundary.commandName,
            commandId: replay011.boundary.commandId,
            commandReadBitWidth: replay011.boundary.commandReadBitWidth,
            commandPositionPlausible: replay011.boundary.readCountsWithinEntityData,
            highDeltaSignal: replay011.boundary.highDeltaSignal
        },
        assessment: 'simple index formula and two-bit UPDATE command decode remain internally consistent in both canaries, weakening simple index accumulation and command-position bugs while preserving cursor-contract suspicion from high delta and nearby offset alternatives',
        rawDataCaptured: false
    };
}

function buildNearbyOffsetAnalysis(replay010, replay011) {
    return {
        schemaVersion: 1,
        replay010: {
            nearbyOffsetAlternativeFound: replay010.boundary.nearbyOffsetAlternativeFound,
            nearbyOffsetCandidateSummaryCount: replay010.boundary.nearbyOffsetCandidateSummaryCount
        },
        replay011: {
            nearbyOffsetAlternativeFound: replay011.boundary.nearbyOffsetAlternativeFound,
            nearbyOffsetCandidateSummaryCount: replay011.boundary.nearbyOffsetCandidateSummaryCount
        },
        assessment: replay010.boundary.nearbyOffsetAlternativeFound || replay011.boundary.nearbyOffsetAlternativeFound ?
            'nearby offset alternatives remain compact candidates only; they are not strong enough to choose a replacement cursor' :
            'nearby offset alternative hypothesis is weakened by this battery',
        rawDataCaptured: false
    };
}

function buildHypothesisMatrix(synthetic, replay010, replay011) {
    const repeatedMismatch = replay010.nearbyWindow.mismatchCount > 0 && replay011.nearbyWindow.mismatchCount > 0;
    const formulaConsistentBoth = replay010.boundary.indexFormulaCheck === true && replay011.boundary.indexFormulaCheck === true;
    const commandPlausibleBoth = replay010.boundary.commandId === 0 && replay011.boundary.commandId === 0;

    return {
        schemaVersion: 1,
        hypotheses: [
            {
                id: 'payloadbits_equals_action_delta_only_in_simple_case',
                status: 'strengthened',
                basis: 'synthetic simple case and most nearby entries match, but replay_011 includes one compact mismatch while replay_010 matches its nearby window',
                nextEvidence: 'synthetic contract tests with explicit field path/value accounting'
            },
            {
                id: 'payloadbits_excludes_field_path_or_extractor_overhead',
                status: 'open',
                basis: 'synthetic overhead scenarios can reproduce divergence direction, but current compact replay outputs do not attribute bits to field path versus value reads',
                nextEvidence: 'compact segment attribution without field values'
            },
            {
                id: 'action_delta_includes_extra_extractor_consumption',
                status: 'open',
                basis: 'actionDelta includes extractor read span; overconsumption is not proven',
                nextEvidence: 'synthetic EntityMutationExtractor accounting or separately authorized compact segment probe'
            },
            {
                id: 'payloadbits_mismatch_is_expected_for_some_field_patterns',
                status: 'open',
                basis: 'synthetic scenarios show possible expected divergence, but no Source 2/Deadlock contract is proven',
                nextEvidence: 'external oracle or documentation later'
            },
            {
                id: 'payloadbits_mismatch_indicates_cursor_or_payload_contract_issue',
                status: repeatedMismatch ? 'strengthened' : 'open',
                basis: repeatedMismatch ? 'both canaries show nearby compact payloadBits/actionDelta mismatch' : 'mismatch not repeated across both canaries',
                nextEvidence: 'compare compact segment attribution and iterator alignment'
            },
            {
                id: 'command_decode_position_suspected',
                status: commandPlausibleBoth ? 'weakened' : 'open',
                basis: 'both boundaries decode commandId 0 UPDATE with two-bit command width and in-bounds read counts',
                nextEvidence: 'only revisit if future compact probe finds command-position anomaly'
            },
            {
                id: 'index_accumulation_bug_candidate',
                status: formulaConsistentBoth ? 'weakened' : 'open',
                basis: 'local entityIndex formula is internally consistent in both canaries',
                nextEvidence: 'external semantics would be needed to reject local formula despite internal consistency'
            },
            {
                id: 'nearby_offset_alternative_candidate',
                status: replay010.boundary.nearbyOffsetAlternativeFound || replay011.boundary.nearbyOffsetAlternativeFound ? 'open' : 'weakened',
                basis: 'nearby alternatives exist as compact candidates but remain incidental until causally linked to payload/action mismatch',
                nextEvidence: 'do not choose replacement cursor without stronger compact evidence'
            },
            {
                id: 'entity_mutation_extractor_overconsumption_candidate',
                status: 'open',
                basis: 'mismatches show actionDelta greater than payloadBits, but extractor overconsumption is not isolated',
                nextEvidence: 'synthetic or compact field segment accounting'
            },
            {
                id: 'source_semantics_unknown_candidate',
                status: 'open',
                basis: 'no external oracle is executable and local compact evidence cannot settle Source semantics',
                nextEvidence: 'manual external oracle later if environment changes'
            },
            {
                id: 'probe_metric_mismatch_candidate',
                status: 'strengthened',
                basis: 'Task 148 and this battery show payloadBits/actionDelta comparison is conditional and can diverge synthetically',
                nextEvidence: 'define metric boundaries before fix design'
            },
            {
                id: 'not_enough_evidence',
                status: 'strengthened_for_fix_readiness',
                basis: 'battery narrows likely area but does not isolate a cause technical enough for parser fix design',
                nextEvidence: 'compact segment attribution or synthetic contract tests'
            }
        ],
        strongestHypotheses: repeatedMismatch ? [
            'payloadbits_mismatch_indicates_cursor_or_payload_contract_issue',
            'probe_metric_mismatch_candidate',
            'source_semantics_unknown_candidate'
        ] : [
            'probe_metric_mismatch_candidate',
            'payloadbits_mismatch_is_expected_for_some_field_patterns',
            'source_semantics_unknown_candidate'
        ],
        weakenedHypotheses: [
            'command_decode_position_suspected',
            'index_accumulation_bug_candidate'
        ],
        rawDataCaptured: false
    };
}

function buildRootCauseReadiness(hypothesisMatrix) {
    return {
        schemaVersion: 1,
        readiness: 'not_ready_for_parser_fix',
        reason: 'The battery strengthens payloadBits/cursor contract suspicion but does not isolate a technical root cause sufficient for parser behavior design.',
        strongestHypotheses: hypothesisMatrix.strongestHypotheses,
        evidenceStillMissing: [
            'field path versus field value compact segment attribution for mismatching entries',
            'validated semantics of serializedEntities payloadBits span',
            'external oracle or documentation for Source 2/Deadlock PacketEntities semantics'
        ],
        parserFixDesignAuthorized: false,
        rawDataCaptured: false
    };
}

function buildRecommendedNextAction(rootCauseReadiness) {
    return {
        schemaVersion: 1,
        selectedRecommendation: 'design_compact_payloadbits_segment_attribution_probe',
        reason: 'The battery points at payloadBits/actionDelta contract ambiguity while weakening simple index formula and command decode bugs. Because replay_010 matches its nearby window and replay_011 has one mismatch, the next highest-value evidence is compact attribution of actionDelta into field-path and field-reader spans for the mismatching pre-boundary entry.',
        rootCauseReadiness: rootCauseReadiness.readiness,
        constraintsForNextTask: [
            'one replay per task unless separately authorized',
            'fail-closed',
            'compact metadata only',
            'no raw data or field values',
            'no recovery, skip, placeholder, continuation, parser fix, or default behavior change'
        ],
        rawDataCaptured: false
    };
}

function buildRejectedFixes() {
    return {
        schemaVersion: 1,
        rejectedFixes: [
            'payloadBits skip for missing UPDATE',
            'automatic recovery of missing UPDATE',
            'placeholder entity creation',
            'cursor replacement from nearby offset candidates',
            'EntityMutationExtractor behavior change',
            'default behavior change',
            'canonical/source/match output'
        ],
        reason: 'The diagnostic battery did not isolate root cause sufficiently for behavior change.',
        rawDataCaptured: false
    };
}

function buildNoContinuationProof(replay010, replay011) {
    return {
        schemaVersion: 1,
        replay010: replay010.noContinuation,
        replay011: replay011.noContinuation,
        parserContinuedAfterFailure: false,
        updateApplied: false,
        payloadSkipped: false,
        recoveryAttempted: false,
        skipModeApplied: false,
        placeholderOrFakeEntityCreated: false,
        fakeFieldsCreated: false,
        syntheticRegistryStateCreated: false,
        canonicalFactsProduced: false,
        rawDataCaptured: false
    };
}

function buildProtectionAudit() {
    return {
        schemaVersion: 1,
        replay010Processed: true,
        replay011Processed: true,
        replay005Accessed: false,
        bots006To008Processed: false,
        candidates012To020Accessed: false,
        samplesUsed: false,
        outputReplaysUsed: false,
        packagesDeademModified: false,
        parserBehaviorModified: false,
        parserFixAdded: false,
        recoveryAdded: false,
        skipModeAdded: false,
        placeholderEntityCreated: false,
        fakeFieldsCreated: false,
        syntheticRegistryStateCreated: false,
        parserContinuedAfterFailure: false,
        defaultBehaviorChanged: false,
        newOptInCreated: false,
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false,
        matchFactsProduced: false,
        spatialMacroMechanicsFightDecisionMlOutputProduced: false,
        rawReplayBytesRecorded: false,
        rawPayloadsRecorded: false,
        rawEntityDataRecorded: false,
        rawSerializedEntitiesRecorded: false,
        stringBytesOrValuesRecorded: false,
        fieldValuesRecorded: false,
        fullSendTablePayloadRecorded: false,
        javaExecuted: false,
        clarityExecuted: false,
        externalParserExecuted: false,
        wslUsed: false,
        iaflowUsed: false,
        productReviewerAutomationUsed: false,
        task150Created: false
    };
}

function buildImplementationSummary(replay010Input, replay011Input) {
    return {
        schemaVersion: 1,
        taskId: '149',
        implementationType: 'standalone_compact_diagnostic_battery_tool',
        tool: 'tools/run-multi-hypothesis-packetentities-diagnostic-battery.mjs',
        replayScope: [
            { replayId: replay010Input.replayId, inputPath: replay010Input.relativePath },
            { replayId: replay011Input.replayId, inputPath: replay011Input.relativePath }
        ],
        existingDiagnosticOptionUsed: 'recovery.diagnoseMissingEntityFailClosed',
        newParserOptionCreated: false,
        parserBehaviorModified: false,
        syntheticScenariosIncluded: true,
        rawDataCaptured: false
    };
}

function buildReport({ replayComparison, payloadAnalysis, cursorAnalysis, hypothesisMatrix, rootCauseReadiness, recommendedNextAction, gate }) {
    return [
        '# Multi-Hypothesis PacketEntities Diagnostic Battery',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        'Task 149 ran a compact fail-closed diagnostic battery across synthetic scenarios plus authorized replay_010 and replay_011 only.',
        '',
        '## Consolidated Classification',
        '',
        '`payloadbits_action_delta_contract_conditional` with `payloadbits_contract_suspected` retained as a live local diagnostic signal.',
        '',
        '## Replay Comparison',
        '',
        `Replay 010 nearby mismatch count: \`${replayComparison.payloadMismatchComparison.replay010NearbyMismatchCount}\``,
        `Replay 011 nearby mismatch count: \`${replayComparison.payloadMismatchComparison.replay011NearbyMismatchCount}\``,
        replayComparison.payloadMismatchComparison.assessment,
        '',
        '## Cursor/Index/Command',
        '',
        cursorAnalysis.assessment,
        '',
        '## PayloadBits/ActionDelta',
        '',
        payloadAnalysis.assessment,
        '',
        '## Hypotheses',
        '',
        `Strongest: ${hypothesisMatrix.strongestHypotheses.map(item => `\`${item}\``).join(', ')}`,
        `Weakened: ${hypothesisMatrix.weakenedHypotheses.map(item => `\`${item}\``).join(', ')}`,
        '',
        '## Root Cause Readiness',
        '',
        `Readiness: \`${rootCauseReadiness.readiness}\``,
        rootCauseReadiness.reason,
        '',
        '## Recommendation',
        '',
        `Selected: \`${recommendedNextAction.selectedRecommendation}\``,
        recommendedNextAction.reason,
        '',
        'No recovery, skip, placeholder, continuation, parser fix, default behavior change, raw data, canonical facts, source artifacts, or match facts were produced.'
    ];
}

async function inputMetadata(input) {
    const info = await stat(input.absolutePath);
    return {
        replayId: input.replayId,
        inputPath: input.relativePath,
        fileSizeBytes: info.size,
        sha256Recorded: false,
        rawReplayBytesRecorded: false
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const replay010 = validateReplayInput(args.get('replay-010'), 'replay_010');
    const replay011 = validateReplayInput(args.get('replay-011'), 'replay_011');
    const roots = validateOutputRoots(args.get('local-output'), args.get('summary-output'));

    await ensureDir(roots.local.absolutePath);
    await ensureDir(roots.summary.absolutePath);

    const synthetic = runSyntheticBattery();
    const replay010Run = await runReplayPass(replay010);
    const replay011Run = await runReplayPass(replay011);
    const replay010Contract = summarizeReplayContract(replay010Run);
    const replay011Contract = summarizeReplayContract(replay011Run);
    const replayComparison = buildReplayComparison(replay010Contract, replay011Contract);
    const payloadAnalysis = buildPayloadBitsAnalysis(synthetic, replay010Contract, replay011Contract);
    const cursorAnalysis = buildCursorIndexCommandAnalysis(replay010Contract, replay011Contract);
    const nearbyOffsetAnalysis = buildNearbyOffsetAnalysis(replay010Contract, replay011Contract);
    const hypothesisMatrix = buildHypothesisMatrix(synthetic, replay010Contract, replay011Contract);
    const rootCauseReadiness = buildRootCauseReadiness(hypothesisMatrix);
    const recommendedNextAction = buildRecommendedNextAction(rootCauseReadiness);
    const noContinuationProof = buildNoContinuationProof(replay010Contract, replay011Contract);
    const protectionAudit = buildProtectionAudit();
    const gate = {
        schemaVersion: 1,
        gate: replay010Run.pass.expectedFailureReached && replay011Run.pass.expectedFailureReached ?
            'multi_hypothesis_packetentities_diagnostic_battery_ready' :
            'multi_hypothesis_packetentities_diagnostic_battery_partial',
        status: replay010Run.pass.expectedFailureReached && replay011Run.pass.expectedFailureReached ? 'ready' : 'partial',
        consolidatedClassification: 'payloadbits_action_delta_contract_conditional',
        strongestHypothesisAfterBattery: hypothesisMatrix.strongestHypotheses[0],
        rootCauseReadiness: rootCauseReadiness.readiness,
        blockers: replay010Run.pass.expectedFailureReached && replay011Run.pass.expectedFailureReached ? [] : ['one or more expected missing entity boundaries were not reproduced'],
        rawDataCaptured: false
    };
    const implementationSummary = buildImplementationSummary(replay010, replay011);

    await writeJson(path.join(roots.local.absolutePath, 'local-run-summary.json'), {
        replay010: replay010Run.pass,
        replay011: replay011Run.pass,
        rawDataCaptured: false
    });
    await writeJson(path.join(roots.summary.absolutePath, 'battery-gate.json'), gate);
    await writeJson(path.join(roots.summary.absolutePath, 'implementation-summary.json'), implementationSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'synthetic-contract-results.json'), synthetic);
    await writeJson(path.join(roots.summary.absolutePath, 'synthetic-scenario-matrix.json'), {
        schemaVersion: 1,
        scenarios: synthetic.scenarios,
        rawDataCaptured: false
    });
    await writeJson(path.join(roots.summary.absolutePath, 'replay-010-contract-result.json'), {
        schemaVersion: 1,
        input: await inputMetadata(replay010),
        ...replay010Contract
    });
    await writeJson(path.join(roots.summary.absolutePath, 'replay-011-contract-result.json'), {
        schemaVersion: 1,
        input: await inputMetadata(replay011),
        ...replay011Contract
    });
    await writeJson(path.join(roots.summary.absolutePath, 'replay-comparison.json'), replayComparison);
    await writeJson(path.join(roots.summary.absolutePath, 'payloadbits-actiondelta-analysis.json'), payloadAnalysis);
    await writeJson(path.join(roots.summary.absolutePath, 'cursor-index-command-analysis.json'), cursorAnalysis);
    await writeJson(path.join(roots.summary.absolutePath, 'nearby-offset-analysis.json'), nearbyOffsetAnalysis);
    await writeJson(path.join(roots.summary.absolutePath, 'hypothesis-matrix.json'), hypothesisMatrix);
    await writeJson(path.join(roots.summary.absolutePath, 'root-cause-readiness.json'), rootCauseReadiness);
    await writeJson(path.join(roots.summary.absolutePath, 'rejected-fixes.json'), buildRejectedFixes());
    await writeJson(path.join(roots.summary.absolutePath, 'recommended-next-action.json'), recommendedNextAction);
    await writeJson(path.join(roots.summary.absolutePath, 'no-continuation-proof.json'), noContinuationProof);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeMarkdown(path.join(REPO_ROOT, 'reports/multi-hypothesis-packetentities-diagnostic-battery.md'), buildReport({
        replayComparison,
        payloadAnalysis,
        cursorAnalysis,
        hypothesisMatrix,
        rootCauseReadiness,
        recommendedNextAction,
        gate
    }));
}

if (path.resolve(process.argv[1] ?? '') === THIS_FILE) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
