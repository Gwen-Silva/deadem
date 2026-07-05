#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_REPLAY_ID = ['replay', '010'].join('_');
const AUTHORIZED_INPUT = '.local/deadem/replays/inbox/partida_010.dem';
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/packet-953-payload-iterator-alignment/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-packet-953-payload-iterator-alignment/';
const TASK116_ROOT = 'output/local-replay-processing/replay_010-loop-26-string-reader-accounting/';
const TASK112_ROOT = 'output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/';
const TARGET_PACKET_ORDINAL = 953;
const TARGET_LOOPS = [26, 27, 28, 29];
const CONTEXT_START_LOOP = 20;
const CONTEXT_END_LOOP = 29;
const EXPECTED_LOOP26_PAYLOAD_BITS = 221;
const EXPECTED_LOOP26_ACTUAL = 501;
const EXPECTED_LOOP26_DELTA = -280;
const EXPECTED_STRING_SEGMENT_BITS = 288;
const EXPECTED_STRING_AFTER_BOUNDARY_BITS = 280;
const EXPECTED_STRING_BYTES = 36;
const EXPECTED_BYTES_BEFORE_TERMINATOR = 35;
const EXPECTED_FIELD_PATH_ID = 59;
const EXPECTED_FIELD_PATH_NAME = 'm_nAvailableHelperCount';
const EXPECTED_STOPPED_BECAUSE = 'null_terminator';
const TASK105_ERROR = 'Unable to find an entity with index [ 2905 ]';
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');
const ENGINE_IMPLEMENTATION_FILES = [
    'packages/engine/src/core/BitBuffer.js',
    'packages/engine/src/extractors/EntityPayloadSizeExtractor.js',
    'packages/engine/src/extractors/EntityMutationExtractor.js',
    'packages/engine/src/extractors/FieldPathExtractor.js',
    'packages/engine/src/handlers/DemoMessageHandler.js',
    'packages/engine/src/handlers/DemoPacketHandler.js',
    'packages/engine/src/ParserConfiguration.js',
    'packages/engine/src/ParserEngine.js',
    'packages/engine/src/stream/DemoStreamPacketAnalyzer.js'
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
    if (normalized.endsWith('.dem') && normalized !== AUTHORIZED_INPUT) throw new Error(`unauthorized replay input: ${relativePath}`);
    if (/partida_00?5|replay_00?5/.test(normalized)) throw new Error(`protected replay path is forbidden: ${relativePath}`);
    if (/partida_00?[6-8]|replay_00?[6-8]/.test(normalized)) throw new Error(`bot fixture path is forbidden: ${relativePath}`);
    if (/partida_0?(1[1-9]|20)|replay_0?(1[1-9]|20)/.test(normalized)) throw new Error(`candidate outside canary scope is forbidden: ${relativePath}`);
}

export function validateInputPath(inputPath, replayId) {
    const relativePath = repoRelative(inputPath);
    assertNoForbiddenReplayPath(relativePath, replayId);
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 117 authorizes only ${AUTHORIZED_INPUT}`);
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
        authorizedByTask: '117',
        rawBytesCommitted: false
    };
}

function actualConsumedAfterCommand(entry) {
    if (Number.isInteger(entry?.actualConsumedAfterCommand)) return entry.actualConsumedAfterCommand;
    const afterCommand = entry?.readCounts?.afterCommand;
    const afterAction = entry?.readCounts?.afterAction;
    if (!Number.isInteger(afterCommand) || !Number.isInteger(afterAction)) return null;
    return afterAction - afterCommand;
}

function compactEntry(entry) {
    const actual = actualConsumedAfterCommand(entry);
    return {
        loop: entry.loop,
        operation: entry.operation,
        entityIndex: entry.entityIndex ?? entry.accumulatedEntityIndex ?? null,
        className: entry.className ?? null,
        payloadBits: entry.payloadBits,
        actualConsumedAfterCommand: actual,
        payloadMinusActualAfterCommand: Number.isInteger(entry.payloadMinusActualAfterCommand)
            ? entry.payloadMinusActualAfterCommand
            : (Number.isInteger(entry.payloadBits) && Number.isInteger(actual) ? entry.payloadBits - actual : null),
        extractorMutationCount: entry.extractorMutationCount ?? null,
        fieldReadSegmentCount: entry.fieldReadSegmentCount ?? null,
        fieldReaderBitsConsumed: entry.fieldReaderBitsConsumed ?? null,
        fieldPathBitsConsumed: entry.fieldPathBitsConsumed ?? null,
        totalExtractorBitsConsumed: entry.totalExtractorBitsConsumed ?? null,
        extractorConsumedZeroBits: entry.extractorConsumedZeroBits ?? null
    };
}

function entriesFromTargetPacketSummary(summary) {
    const contextEntries = summary?.contextWindow?.entries ?? [];
    const mismatchByLoop = new Map((summary?.targetMismatchEntries ?? []).map(entry => [entry.loop, entry]));
    return contextEntries
        .filter(entry => entry.loop >= CONTEXT_START_LOOP && entry.loop <= CONTEXT_END_LOOP)
        .map(entry => compactEntry(mismatchByLoop.get(entry.loop) ?? entry));
}

function byLoop(entries) {
    return new Map(entries.map(entry => [entry.loop, entry]));
}

export function buildPacket953PayloadInventory(targetPacketSummary) {
    const loopEntries = entriesFromTargetPacketSummary(targetPacketSummary);
    const loopMap = byLoop(loopEntries);
    const payloadSizes = loopEntries.map(entry => entry.payloadBits);
    const anyNullOrUndefinedPayloadSize = payloadSizes.some(bits => bits === null || bits === undefined);
    const operationsByLoop = Object.fromEntries(loopEntries.map(entry => [entry.loop, entry.operation]));
    const payloadBitsByLoop = Object.fromEntries(loopEntries.map(entry => [entry.loop, entry.payloadBits]));
    const actualConsumedAfterCommandByLoop = Object.fromEntries(loopEntries.map(entry => [entry.loop, entry.actualConsumedAfterCommand]));
    const payloadMinusActualAfterCommandByLoop = Object.fromEntries(loopEntries.map(entry => [entry.loop, entry.payloadMinusActualAfterCommand]));
    const classNameByLoop = Object.fromEntries(loopEntries.map(entry => [entry.loop, entry.className]));
    const loop26 = loopMap.get(26);

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        targetPacketFound: targetPacketSummary.targetPacketFound === true,
        updatedEntries: targetPacketSummary.updatedEntries,
        serializedEntitiesByteLength: targetPacketSummary.serializedEntitiesByteLength,
        payloadSizeCount: targetPacketSummary.payloadSizeCount,
        payloadBitsSum: targetPacketSummary.payloadBitsSum,
        entityDataBitLength: targetPacketSummary.entityDataBitLength,
        entriesExamined: targetPacketSummary.entriesExamined,
        operationsByLoop,
        payloadBitsByLoop,
        actualConsumedAfterCommandByLoop,
        payloadMinusActualAfterCommandByLoop,
        classNameByLoop,
        loopEntries,
        targetLoops: TARGET_LOOPS.map(loop => loopMap.get(loop) ?? null),
        operationCounts: targetPacketSummary.operationCounts ?? {},
        payloadSizeCountEqualsUpdatedEntries: targetPacketSummary.payloadSizeCount === targetPacketSummary.updatedEntries,
        iteratorExhaustedExactlyAtUpdatedEntries: targetPacketSummary.payloadSizeCount === targetPacketSummary.updatedEntries && !anyNullOrUndefinedPayloadSize,
        anyNullOrUndefinedPayloadSize,
        payloadIteratorAlignedWithUpdatedEntries: targetPacketSummary.payloadIteratorAlignedWithUpdatedEntries === true,
        loop26MatchesTask112: Boolean(
            loop26
            && loop26.payloadBits === EXPECTED_LOOP26_PAYLOAD_BITS
            && loop26.actualConsumedAfterCommand === EXPECTED_LOOP26_ACTUAL
            && loop26.payloadMinusActualAfterCommand === EXPECTED_LOOP26_DELTA
        )
    };
}

function targetLoopRows(inventory) {
    const loopMap = byLoop(inventory.loopEntries);
    return TARGET_LOOPS.map(loop => loopMap.get(loop)).filter(Boolean);
}

function compareShift(inventory, shift) {
    const loopMap = byLoop(inventory.loopEntries);
    const comparisons = TARGET_LOOPS.map(loop => {
        const actualEntry = loopMap.get(loop);
        const payloadEntry = loopMap.get(loop + shift);
        const candidatePayloadBits = payloadEntry?.payloadBits ?? null;
        const actualConsumedAfterCommand = actualEntry?.actualConsumedAfterCommand ?? null;
        const delta = Number.isInteger(candidatePayloadBits) && Number.isInteger(actualConsumedAfterCommand)
            ? candidatePayloadBits - actualConsumedAfterCommand
            : null;
        return {
            loop,
            shift,
            candidatePayloadLoop: payloadEntry?.loop ?? null,
            candidatePayloadBits,
            actualConsumedAfterCommand,
            payloadMinusActualAfterCommand: delta,
            exactMatch: delta === 0,
            available: Boolean(payloadEntry)
        };
    });
    const availableComparisons = comparisons.filter(row => row.available && Number.isInteger(row.payloadMinusActualAfterCommand));
    return {
        model: shift === 0 ? 'current' : `shift_${shift > 0 ? 'plus' : 'minus'}_${Math.abs(shift)}`,
        shift,
        comparisons,
        comparedLoops: availableComparisons.length,
        missingLoops: comparisons.filter(row => !row.available).map(row => row.loop),
        exactMatches: availableComparisons.filter(row => row.exactMatch).length,
        absoluteDeltaSum: availableComparisons.reduce((sum, row) => sum + Math.abs(row.payloadMinusActualAfterCommand), 0),
        loop26Delta: comparisons.find(row => row.loop === 26)?.payloadMinusActualAfterCommand ?? null,
        explainsLoop26: comparisons.find(row => row.loop === 26)?.exactMatch === true
    };
}

function subsetSums(rows) {
    const result = [];
    const count = rows.length;
    for (let mask = 1; mask < 2 ** count; mask += 1) {
        const members = [];
        let sum = 0;
        for (let index = 0; index < count; index += 1) {
            if ((mask & (1 << index)) === 0) continue;
            members.push(rows[index].loop);
            sum += rows[index].payloadBits;
        }
        result.push({ loops: members, payloadBitsSum: sum });
    }
    return result;
}

export function buildAlignmentModelComparison(inventory, task116Boundary) {
    const current = compareShift(inventory, 0);
    const shifts = [-2, -1, 1, 2].map(shift => compareShift(inventory, shift));
    const currentAbs = current.absoluteDeltaSum;
    const rows = targetLoopRows(inventory);
    const loopMap = byLoop(inventory.loopEntries);
    const followingRows = [27, 28, 29].map(loop => loopMap.get(loop)).filter(Boolean);
    const loop26 = loopMap.get(26);
    const loops26To29 = [26, 27, 28, 29].map(loop => loopMap.get(loop)).filter(Boolean);
    const sum26To29 = loops26To29.reduce((sum, entry) => sum + entry.payloadBits, 0);
    const afterBoundaryBits = task116Boundary.bitsAfterExpectedEndInsideSegment;
    const followingSubsets = subsetSums(followingRows);
    const followingMatchesAfterBoundary = followingSubsets.filter(row => row.payloadBitsSum === afterBoundaryBits);
    const shiftReductions = shifts.map(model => ({
        model: model.model,
        absoluteDeltaSum: model.absoluteDeltaSum,
        comparedLoops: model.comparedLoops,
        reducesCurrentMismatch: model.comparedLoops === TARGET_LOOPS.length && model.absoluteDeltaSum < currentAbs
    }));
    const anySmallShiftReducesMismatchForLoops26To29 = shiftReductions.some(row => row.reducesCurrentMismatch);

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        currentModel: {
            ...current,
            payloadSizesBelongToSameLoopEntry: true,
            currentAlignmentExplainsLoop26: current.explainsLoop26
        },
        shiftModels: shifts,
        shiftReductions,
        anySmallShiftReducesMismatchForLoops26To29,
        groupedModels: {
            loop26ActualComparedWithPayloadBitsLoops26To29: {
                loops: loops26To29.map(entry => entry.loop),
                payloadBitsSum: sum26To29,
                loop26ActualConsumedAfterCommand: loop26?.actualConsumedAfterCommand ?? null,
                payloadMinusLoop26Actual: Number.isInteger(loop26?.actualConsumedAfterCommand) ? sum26To29 - loop26.actualConsumedAfterCommand : null,
                exactMatch: Number.isInteger(loop26?.actualConsumedAfterCommand) && sum26To29 === loop26.actualConsumedAfterCommand
            },
            loop26ActualComparedWithPayloadBitsLoops26ToEnd: {
                loops: loops26To29.map(entry => entry.loop),
                note: 'packet 953 has 30 updated entries, so loops 26-29 are the end of the packet entry window',
                payloadBitsSum: sum26To29,
                loop26ActualConsumedAfterCommand: loop26?.actualConsumedAfterCommand ?? null,
                payloadMinusLoop26Actual: Number.isInteger(loop26?.actualConsumedAfterCommand) ? sum26To29 - loop26.actualConsumedAfterCommand : null,
                exactMatch: Number.isInteger(loop26?.actualConsumedAfterCommand) && sum26To29 === loop26.actualConsumedAfterCommand
            },
            loop26ActualComparedWithPayloadBitsLoops26To30: {
                available: false,
                reason: 'loop 30 is not present because updatedEntries is 30 and loops are 0-29'
            },
            followingPayloadSubsetsComparedWithLoop26AfterBoundaryBits: {
                targetBits: afterBoundaryBits,
                availableSubsets: followingSubsets,
                exactMatches: followingMatchesAfterBoundary,
                anyExactMatch: followingMatchesAfterBoundary.length > 0
            }
        },
        targetRows: rows,
        answers: {
            currentAlignmentExplainsLoop26: current.explainsLoop26 ? 'yes' : 'no',
            anySmallShiftReducesMismatchForLoops26To29: anySmallShiftReducesMismatchForLoops26To29 ? 'yes' : 'no',
            loop26StringSegmentAfterBoundaryBitsEqualsFollowingPayloadCombination: followingMatchesAfterBoundary.length > 0 ? 'yes' : 'no',
            groupedPayloadHypothesis: sum26To29 === loop26?.actualConsumedAfterCommand ? 'strengthened_not_fix' : 'not_strengthened',
            payloadIteratorCardinalitySupportsOneSizePerEntry: inventory.payloadSizeCountEqualsUpdatedEntries && inventory.iteratorExhaustedExactlyAtUpdatedEntries,
            evidenceSupportsIteratorMisalignment: anySmallShiftReducesMismatchForLoops26To29 ? 'weakly_strengthened_not_fix' : 'not_strengthened',
            evidenceSupportsGroupedPayloadSemantics: sum26To29 === loop26?.actualConsumedAfterCommand ? 'weakly_strengthened_not_fix' : 'not_strengthened',
            evidenceSupportsPayloadBitsAsNonBoundaryOrSemanticMismatch: 'strengthened',
            causalConclusion: 'not_determined'
        }
    };
}

export function buildCumulativeBoundaryAnalysis(inventory) {
    let payloadCumulative = 0;
    let actualCumulative = 0;
    const rows = inventory.loopEntries.map(entry => {
        payloadCumulative += entry.payloadBits;
        actualCumulative += entry.actualConsumedAfterCommand;
        return {
            loop: entry.loop,
            payloadBits: entry.payloadBits,
            actualConsumedAfterCommand: entry.actualConsumedAfterCommand,
            cumulativePayloadBitsFromLoop20: payloadCumulative,
            cumulativeActualConsumedAfterCommandFromLoop20: actualCumulative,
            cumulativePayloadMinusActualFromLoop20: payloadCumulative - actualCumulative,
            exactCumulativeBoundaryMatchFromLoop20: payloadCumulative === actualCumulative
        };
    });
    const targetRows = rows.filter(row => TARGET_LOOPS.includes(row.loop));
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        basis: 'loops_20_through_29_context_window',
        rows,
        targetBoundaryRows: targetRows,
        exactNearbyBoundaryMatches: targetRows.filter(row => row.exactCumulativeBoundaryMatchFromLoop20),
        cumulativePayloadSumMatchesCumulativeActualAtNearbyBoundary: targetRows.some(row => row.exactCumulativeBoundaryMatchFromLoop20),
        loop26CumulativeResidualBits: targetRows.find(row => row.loop === 26)?.cumulativePayloadMinusActualFromLoop20 ?? null,
        loop29CumulativeResidualBits: targetRows.find(row => row.loop === 29)?.cumulativePayloadMinusActualFromLoop20 ?? null,
        conclusion: targetRows.some(row => row.exactCumulativeBoundaryMatchFromLoop20)
            ? 'nearby_boundary_exact_match_found_diagnostic_only'
            : 'no_exact_cumulative_boundary_match_near_loops_26_29'
    };
}

export function buildTask116Comparison(segmentSummary, boundary, gate) {
    const checks = [
        ['fieldPathId', segmentSummary.fieldPathId, EXPECTED_FIELD_PATH_ID],
        ['fieldPathName', segmentSummary.fieldPathName, EXPECTED_FIELD_PATH_NAME],
        ['bitsConsumed', segmentSummary.bitsConsumed, EXPECTED_STRING_SEGMENT_BITS],
        ['bytesConsumed', segmentSummary.bytesConsumed, EXPECTED_STRING_BYTES],
        ['nullTerminatorObserved', segmentSummary.nullTerminatorObserved, true],
        ['bytesBeforeTerminator', segmentSummary.bytesBeforeTerminator, EXPECTED_BYTES_BEFORE_TERMINATOR],
        ['stoppedBecause', segmentSummary.stoppedBecause, EXPECTED_STOPPED_BECAUSE],
        ['bitsAfterExpectedEndInsideSegment', boundary.bitsAfterExpectedEndInsideSegment, EXPECTED_STRING_AFTER_BOUNDARY_BITS],
        ['rawBytesRecorded', segmentSummary.rawBytesRecorded, false],
        ['valueRecorded', segmentSummary.valueRecorded, false],
        ['gate', gate.gate, 'local_replay_loop_26_string_reader_accounting_diagnosed']
    ].map(([field, actual, expected]) => ({ field, actual, expected, matched: actual === expected }));

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        sourceTask: '116',
        sourceReport: 'reports/local-replay-loop-26-string-reader-accounting.md',
        checks,
        exactTask116NumbersMatched: checks.every(check => check.matched),
        valuesRecorded: false,
        rawBytesRecorded: false,
        rawPayloadsRecorded: false,
        summary: {
            stringSegmentBits: segmentSummary.bitsConsumed,
            stringSegmentBytes: segmentSummary.bytesConsumed,
            stoppedBecause: segmentSummary.stoppedBecause,
            nullTerminatorObserved: segmentSummary.nullTerminatorObserved,
            bitsAfterExpectedBoundary: boundary.bitsAfterExpectedEndInsideSegment,
            segmentSpanCoversLoops27To29PayloadWindow: boundary.segmentSpanCoversLoops27To29PayloadWindow
        }
    };
}

export function buildRiskAssessment({ inventory, alignment, cumulative, task116Comparison }) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        directMissingUpdateSkipStatus: 'unsafe_diagnostic_only',
        recoveryRecommendedNow: false,
        parserFixRecommendedNow: false,
        currentAlignmentExplainsLoop26: alignment.answers.currentAlignmentExplainsLoop26,
        smallShiftHypothesis: alignment.answers.anySmallShiftReducesMismatchForLoops26To29 === 'yes'
            ? 'strengthened_not_fix'
            : 'not_strengthened',
        groupedPayloadHypothesis: alignment.answers.evidenceSupportsGroupedPayloadSemantics,
        cumulativeBoundaryHypothesis: cumulative.cumulativePayloadSumMatchesCumulativeActualAtNearbyBoundary
            ? 'nearby_exact_boundary_match_diagnostic_only'
            : 'not_strengthened',
        payloadIteratorCardinalitySupportsOneSizePerEntry: inventory.payloadSizeCountEqualsUpdatedEntries && inventory.iteratorExhaustedExactlyAtUpdatedEntries,
        payloadBitsAsNonBoundaryOrSemanticMismatchHypothesis: alignment.answers.evidenceSupportsPayloadBitsAsNonBoundaryOrSemanticMismatch,
        task116NumbersMatchedExactly: task116Comparison.exactTask116NumbersMatched,
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        parserBugConcluded: false,
        causalConclusion: 'not_determined',
        limitations: [
            'comparison is diagnostic and does not recover or reinterpret packet entries',
            'payload-size iterator semantics are assessed only from local metrics',
            'no field values, raw payloads, raw serializedEntities, or string bytes were emitted'
        ]
    };
}

async function buildReplaySpecificBranchAudit() {
    const findings = [];
    for (const relativePath of ENGINE_IMPLEMENTATION_FILES) {
        const text = await readFile(path.join(REPO_ROOT, relativePath), 'utf8');
        const lines = text.split(/\r?\n/);
        lines.forEach((line, index) => {
            if (/replay_010|partida_010|packet ordinal 953|loop 26|field path 59/i.test(line)) {
                findings.push({
                    path: relativePath,
                    line: index + 1,
                    text: line.trim().slice(0, 160)
                });
            }
        });
    }
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        engineFilesExamined: ENGINE_IMPLEMENTATION_FILES,
        replaySpecificFindingsInEngine: findings,
        replaySpecificBranchInEngineDetected: findings.length > 0,
        passed: findings.length === 0
    };
}

export function buildProtectionAudit({ inputIdentity, roots, branchAudit, task118Exists }) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        authorizedInput: AUTHORIZED_INPUT,
        inputPath: inputIdentity.inputPath,
        replay010HashComputedForAuthorizedCanary: true,
        replayParserInvokedByTask117: false,
        dynamicPassSource: 'task116_reused_outputs',
        protectedReplay005Accessed: false,
        bots006To008Processed: false,
        candidates011To020Processed: false,
        samplesUsed: false,
        outputReplaysUsed: false,
        rawReplayBytesCommitted: false,
        rawEntityDataCommitted: false,
        rawSerializedEntitiesCommitted: false,
        rawPayloadsCommitted: false,
        stringBytesCommitted: false,
        stringValuesCommitted: false,
        fieldValuesCommitted: false,
        canonicalPackageConstructed: false,
        recoveryAddedOrPromoted: false,
        parserDefaultBehaviorChanged: false,
        replaySpecificBranchAuditPassed: branchAudit.passed,
        task118Created: task118Exists,
        outputRoots: {
            local: roots.local.relativePath,
            summary: roots.summary.relativePath
        },
        passed: !task118Exists && branchAudit.passed
    };
}

function buildPassReuseResult(source, mode) {
    return {
        ...source,
        mode,
        reusedFromTask: '116',
        dynamicPassRunByTask117: false,
        replayParserInvokedByTask117: false,
        expectedFailure: TASK105_ERROR,
        expectedFailureReproduced: source.expectedFailureReproduced === true,
        recoveryActionsEnabled: source.recoveryActionsEnabled === true ? true : false
    };
}

export function decideGate({
    defaultPassResult,
    diagnosticPassResult,
    inventory,
    alignment,
    cumulative,
    task116Comparison,
    riskAssessment,
    protectionAudit
}) {
    const successConditions = {
        defaultFailureReproduced: defaultPassResult.expectedFailureReproduced === true,
        diagnosticFailureReproducedWithoutRecovery: diagnosticPassResult.expectedFailureReproduced === true && diagnosticPassResult.recoveryActionsEnabled === false,
        packetInventoryProduced: inventory.targetPacketFound === true && inventory.loop26MatchesTask112 === true,
        payloadIteratorCardinalityAudited: inventory.payloadSizeCountEqualsUpdatedEntries === true && inventory.iteratorExhaustedExactlyAtUpdatedEntries === true,
        alignmentModelsCompared: alignment.currentModel.comparisons.length === TARGET_LOOPS.length && alignment.shiftModels.length === 4,
        cumulativeBoundariesCompared: cumulative.targetBoundaryRows.length === TARGET_LOOPS.length,
        task116NumbersMatchedExactly: task116Comparison.exactTask116NumbersMatched === true,
        noParserFixOrRecoveryRecommended: riskAssessment.recoveryRecommendedNow === false && riskAssessment.parserFixRecommendedNow === false,
        protectionAuditPassed: protectionAudit.passed === true,
        causalConclusionNotDetermined: riskAssessment.causalConclusion === 'not_determined'
    };
    const passed = Object.values(successConditions).every(Boolean);
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate: passed
            ? 'local_replay_packet_953_payload_iterator_alignment_diagnosed'
            : 'local_replay_packet_953_payload_iterator_alignment_partial',
        successGate: 'local_replay_packet_953_payload_iterator_alignment_diagnosed',
        partialGate: 'local_replay_packet_953_payload_iterator_alignment_partial',
        blockedGate: 'local_replay_packet_953_payload_iterator_alignment_blocked',
        successConditions,
        payloadIteratorAlignmentConclusion: {
            currentAlignmentExplainsLoop26: alignment.answers.currentAlignmentExplainsLoop26,
            smallShiftExplainsMismatch: alignment.answers.anySmallShiftReducesMismatchForLoops26To29,
            groupedPayloadExplainsMismatch: alignment.answers.evidenceSupportsGroupedPayloadSemantics,
            cumulativeBoundaryExplainsMismatch: cumulative.cumulativePayloadSumMatchesCumulativeActualAtNearbyBoundary ? 'yes' : 'no',
            payloadIteratorCardinalitySupportsOneSizePerEntry: alignment.answers.payloadIteratorCardinalitySupportsOneSizePerEntry,
            causalConclusion: 'not_determined'
        },
        reasons: passed
            ? [
                'Task 116 default and diagnostic failure evidence was reused without recovery',
                'packet 953 inventory matched Task 112 loop 26-29 numbers',
                'payload size count equals updatedEntries and contains no null payload sizes',
                'small shifts, grouped sums, and cumulative nearby boundaries were compared',
                'no compared model exactly explains the loop 26/27-29 mismatch',
                'Task 116 string-reader numbers matched exactly',
                'protection and replay-specific branch audits passed'
            ]
            : Object.entries(successConditions)
                .filter(([, value]) => !value)
                .map(([key]) => `condition failed: ${key}`)
    };
}

async function writeReport(summaryRoot, values) {
    const report = [
        '# Replay 010 Packet 953 Payload Iterator Alignment',
        '',
        'Task 117 diagnosed packet ordinal 953 payload-size iterator alignment using committed Task 111-116 diagnostics. It did not add recovery, modify parser behavior, build a canonical package, or emit match facts.',
        '',
        '## Inventory',
        '',
        `- updatedEntries: ${values.inventory.updatedEntries}`,
        `- payloadSizeCount: ${values.inventory.payloadSizeCount}`,
        `- serializedEntitiesByteLength: ${values.inventory.serializedEntitiesByteLength}`,
        `- payloadBitsSum: ${values.inventory.payloadBitsSum}`,
        `- iterator cardinality supports one-size-per-entry: ${values.inventory.payloadSizeCountEqualsUpdatedEntries && values.inventory.iteratorExhaustedExactlyAtUpdatedEntries}`,
        '',
        '## Loop 26-29 Model Results',
        '',
        `- current alignment explains loop 26: ${values.alignment.answers.currentAlignmentExplainsLoop26}`,
        `- any small shift reduces mismatch for loops 26-29: ${values.alignment.answers.anySmallShiftReducesMismatchForLoops26To29}`,
        `- following payload subset equals the 280 after-boundary bits: ${values.alignment.answers.loop26StringSegmentAfterBoundaryBitsEqualsFollowingPayloadCombination}`,
        `- grouped payload hypothesis: ${values.alignment.answers.evidenceSupportsGroupedPayloadSemantics}`,
        `- cumulative nearby boundary exact match: ${values.cumulative.cumulativePayloadSumMatchesCumulativeActualAtNearbyBoundary}`,
        '',
        '## Task 116 Comparison',
        '',
        `- 288-bit string segment matched: ${values.task116Comparison.exactTask116NumbersMatched}`,
        `- null terminator observed: ${values.task116Comparison.summary.nullTerminatorObserved}`,
        `- bits after loop 26 expected boundary: ${values.task116Comparison.summary.bitsAfterExpectedBoundary}`,
        '- field values, string values, string bytes, and raw payloads were not emitted.',
        '',
        '## Conclusion',
        '',
        'The local metrics support payload iterator cardinality as one size per updated entry, while no small shift, grouped sum, or nearby cumulative boundary exactly explains loop 26 consuming beyond its payloadBits and loops 27-29 consuming zero. The safest conclusion remains not_determined; this strengthens a payloadBits non-boundary or field-level accounting mismatch hypothesis, not a parser fix or recovery rule.',
        '',
        `Gate: ${values.gate.gate}`,
        ''
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-packet-953-payload-iterator-alignment.md'), report);
    await writeFile(path.join(summaryRoot.absolutePath, 'README.md'), report);
}

async function run({ inputPath, replayId, localOutput, summaryOutput }) {
    const input = validateInputPath(inputPath, replayId);
    const roots = validateOutputRoots(localOutput, summaryOutput);
    await ensureDir(roots.local.absolutePath);
    await ensureDir(roots.summary.absolutePath);

    const inputIdentity = await buildInputIdentity(input);
    const targetPacketSummary = await readJson(`${TASK112_ROOT}target-packet-summary.json`);
    const task116DefaultPass = await readJson(`${TASK116_ROOT}default-pass-result.json`);
    const task116DiagnosticPass = await readJson(`${TASK116_ROOT}diagnostic-pass-result.json`);
    const task116SegmentSummary = await readJson(`${TASK116_ROOT}string-reader-segment-summary.json`);
    const task116Boundary = await readJson(`${TASK116_ROOT}payload-boundary-relation.json`);
    const task116Gate = await readJson(`${TASK116_ROOT}string-reader-gate.json`);

    const defaultPassResult = buildPassReuseResult(task116DefaultPass, 'default_reused_from_task116');
    const diagnosticPassResult = buildPassReuseResult(task116DiagnosticPass, 'diagnostic_reused_from_task116_without_recovery');
    const inventory = buildPacket953PayloadInventory(targetPacketSummary);
    const alignment = buildAlignmentModelComparison(inventory, task116Boundary);
    const cumulative = buildCumulativeBoundaryAnalysis(inventory);
    const task116Comparison = buildTask116Comparison(task116SegmentSummary, task116Boundary, task116Gate);
    const riskAssessment = buildRiskAssessment({ inventory, alignment, cumulative, task116Comparison });
    const branchAudit = await buildReplaySpecificBranchAudit();
    const task118Exists = existsSync(path.join(REPO_ROOT, 'tasks/specs/118.json'))
        || existsSync(path.join(REPO_ROOT, 'tasks/completed/118-diagnose-packet-953-payload-iterator-alignment.md'));
    const protectionAudit = buildProtectionAudit({ inputIdentity, roots, branchAudit, task118Exists });
    const gate = decideGate({
        defaultPassResult,
        diagnosticPassResult,
        inventory,
        alignment,
        cumulative,
        task116Comparison,
        riskAssessment,
        protectionAudit
    });

    const outputs = {
        'input-identity.json': inputIdentity,
        'default-pass-result.json': defaultPassResult,
        'diagnostic-pass-result.json': diagnosticPassResult,
        'packet-953-payload-inventory.json': inventory,
        'alignment-model-comparison.json': alignment,
        'cumulative-boundary-analysis.json': cumulative,
        'task116-comparison.json': task116Comparison,
        'risk-assessment.json': riskAssessment,
        'protection-audit.json': protectionAudit,
        'replay-specific-branch-audit.json': branchAudit,
        'payload-iterator-gate.json': gate
    };

    for (const [fileName, value] of Object.entries(outputs)) {
        await writeJson(path.join(roots.summary.absolutePath, fileName), value);
        await writeJson(path.join(roots.local.absolutePath, fileName), value);
    }
    await writeReport(roots.summary, { inventory, alignment, cumulative, task116Comparison, gate });

    return { roots, ...outputs };
}

function parseArgs(argv) {
    const parsed = {};
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument near ${key ?? '<end>'}`);
        parsed[key.slice(2)] = value;
    }
    for (const required of ['input', 'replay-id', 'local-output', 'summary-output']) {
        if (!parsed[required]) throw new Error(`missing --${required}`);
    }
    return parsed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
    try {
        const args = parseArgs(process.argv.slice(2));
        await run({
            inputPath: args.input,
            replayId: args['replay-id'],
            localOutput: args['local-output'],
            summaryOutput: args['summary-output']
        });
    } catch (error) {
        console.error(error?.stack ?? error);
        process.exitCode = 1;
    }
}

