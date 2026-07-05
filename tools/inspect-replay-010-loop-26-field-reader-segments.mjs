#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { existsSync } from 'node:fs';
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
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/loop-26-field-reader-segments/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-loop-26-field-reader-segments/';
const TASK105_ERROR = 'Unable to find an entity with index [ 2905 ]';
const TASK112_ROOT = 'output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/';
const TARGET_PACKET_ORDINAL = 953;
const TARGET_LOOPS = [26, 27, 28, 29];
const ZERO_LOOPS = [27, 28, 29];
const CONTEXT_START_LOOP = 20;
const CONTEXT_END_LOOP = 30;
const LOOP_26_EXPECTED = {
    entityIndex: 2598,
    className: 'CCitadel_Ability_Familiar_HelpingHands',
    payloadBits: 221,
    actualConsumedAfterCommand: 501,
    extraBits: 280,
    extractorMutationCount: 7,
    fieldPathBitsConsumed: 53,
    fieldReaderBitsConsumed: 448,
    totalExtractorBitsConsumed: 501,
    fieldReadSegmentCount: 7
};
const ENGINE_IMPLEMENTATION_FILES = [
    'packages/engine/src/ParserConfiguration.js',
    'packages/engine/src/handlers/DemoMessageHandler.js',
    'packages/engine/src/extractors/EntityMutationExtractor.js'
];
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');

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
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 113 authorizes only ${AUTHORIZED_INPUT}`);
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
    return await new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

function sanitizeStack(error) {
    const repoFileUrl = `file:///${slash(REPO_ROOT)}/`;
    return String(error?.stack ?? '')
        .replaceAll(repoFileUrl, 'file://<repo>/')
        .split(/\r?\n/)
        .slice(0, 6);
}

async function buildInputIdentity(input) {
    const info = await stat(input.absolutePath);
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        inputPath: input.relativePath,
        sizeBytes: info.size,
        sha256: await sha256File(input.absolutePath),
        authorizedByTask: '113'
    };
}

async function runAdvancementPass({ input, mode, configuration }) {
    const player = new Player(configuration, Logger.NOOP);
    const started = performance.now();
    const result = {
        mode,
        diagnosticsEnabled: mode === 'diagnostic_loop_26_field_reader_segments',
        recoveryActionsEnabled: false,
        expectedFailureReproduced: false,
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
        result.errorMessage = error?.message ?? String(error);
        result.stackTop = sanitizeStack(error);
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        await player.dispose().catch(() => {});
    }

    return result;
}

function actualConsumedAfterCommand(entry) {
    const readCounts = entry.readCounts ?? {};
    if (!Number.isInteger(readCounts.afterCommand) || !Number.isInteger(readCounts.afterAction)) {
        return null;
    }
    return readCounts.afterAction - readCounts.afterCommand;
}

function isMonotonic(entry) {
    const r = entry.readCounts ?? {};
    return Number.isInteger(r.beforeIndex) &&
        Number.isInteger(r.afterIndex) &&
        Number.isInteger(r.afterCommand) &&
        Number.isInteger(r.afterAction) &&
        r.beforeIndex <= r.afterIndex &&
        r.afterIndex <= r.afterCommand &&
        r.afterCommand <= r.afterAction;
}

function compactSegment(entry, diagnostic, segment) {
    return {
        ordinal: segment.ordinal,
        beforeReadCount: segment.beforeReadCount,
        afterReadCount: segment.afterReadCount,
        bitsConsumed: segment.bitsConsumed,
        startOffsetAfterCommand: Number.isInteger(entry.readCounts?.afterCommand) ?
            segment.beforeReadCount - entry.readCounts.afterCommand :
            null,
        endOffsetAfterCommand: Number.isInteger(entry.readCounts?.afterCommand) ?
            segment.afterReadCount - entry.readCounts.afterCommand :
            null,
        source: diagnostic.source,
        method: diagnostic.method,
        fieldPathId: segment.fieldPathId ?? null,
        fieldPathTransferCode: segment.fieldPathTransferCode ?? null,
        fieldPathName: segment.fieldPathName ?? null,
        decoderName: segment.decoderName ?? null,
        decoderType: segment.decoderType ?? null,
        serializerName: segment.serializerName ?? null,
        serializerVersion: segment.serializerVersion ?? null,
        storageType: segment.storageType ?? null,
        storageDimension: segment.storageDimension ?? null,
        storageSigned: segment.storageSigned ?? null,
        storageBool: segment.storageBool ?? null
    };
}

function compactEntry(packetOrdinal, entry, nextEntry = null, includeSegments = false) {
    const actual = actualConsumedAfterCommand(entry);
    const payloadBits = Number.isInteger(entry.payloadBits) ? entry.payloadBits : null;
    const extractorDiagnostics = (entry.extractorDiagnostics ?? []).map(diagnostic => ({
        source: diagnostic.source,
        method: diagnostic.method,
        mutationCount: diagnostic.mutationCount,
        fieldPathBitsConsumed: diagnostic.fieldPathBitsConsumed,
        fieldReadSegmentCount: diagnostic.fieldReadSegmentCount,
        fieldReaderBitsConsumed: diagnostic.fieldReaderBitsConsumed,
        zeroBitFieldReadSegments: diagnostic.zeroBitFieldReadSegments,
        minFieldReaderBitsConsumed: diagnostic.minFieldReaderBitsConsumed,
        maxFieldReaderBitsConsumed: diagnostic.maxFieldReaderBitsConsumed,
        totalExtractorBitsConsumed: diagnostic.totalExtractorBitsConsumed,
        extractorConsumedZeroBits: diagnostic.extractorConsumedZeroBits,
        fieldReaderMatchesExtractor: diagnostic.fieldReaderMatchesExtractor,
        threw: diagnostic.threw,
        errorMessage: diagnostic.errorMessage,
        retainedSegmentCount: diagnostic.fieldReadSegments?.length ?? 0,
        fieldReadSegments: includeSegments === true ?
            (diagnostic.fieldReadSegments ?? []).map(segment => compactSegment(entry, diagnostic, segment)) :
            undefined
    }));

    return {
        packetOrdinal,
        loop: entry.loop,
        operation: entry.operation,
        entityIndex: entry.accumulatedEntityIndex,
        className: entry.className ?? null,
        registryStateBefore: entry.registryStateBefore,
        payloadBits,
        readCounts: entry.readCounts,
        actualConsumedAfterCommand: actual,
        payloadMinusActualAfterCommand: Number.isInteger(payloadBits) && Number.isInteger(actual) ? payloadBits - actual : null,
        readCountsMonotonic: isMonotonic(entry),
        nextLoopStartsAtAfterAction: nextEntry === null ? null : nextEntry.readCounts?.beforeIndex === entry.readCounts?.afterAction,
        action: entry.action,
        extractorMutationCount: entry.extractorMutationCount,
        fieldReadSegmentCount: entry.fieldReadSegmentCount,
        fieldReaderBitsConsumed: entry.fieldReaderBitsConsumed,
        fieldPathBitsConsumed: entry.fieldPathBitsConsumed,
        totalExtractorBitsConsumed: entry.totalExtractorBitsConsumed,
        extractorConsumedZeroBits: entry.extractorConsumedZeroBits,
        extractorThrew: entry.extractorThrew,
        extractorInternalCondition: entry.extractorInternalCondition,
        extractorDiagnostics,
        touched: {
            entity: entry.entityTouched,
            fields: entry.fieldsTouched,
            baseline: entry.baselineTouched,
            registerEntity: entry.registerEntityTouched
        }
    };
}

function getTargetDiagnostic(diagnostics) {
    return diagnostics.find(diagnostic => diagnostic.packetOrdinal === TARGET_PACKET_ORDINAL) ?? null;
}

export function buildTargetContext(diagnostics) {
    const target = getTargetDiagnostic(diagnostics);
    if (target === null) {
        return {
            schemaVersion: 1,
            replayId: AUTHORIZED_REPLAY_ID,
            targetPacketOrdinal: TARGET_PACKET_ORDINAL,
            targetPacketFound: false,
            entries: [],
            targetEntries: [],
            limitations: ['target packet diagnostic was not collected']
        };
    }

    const entries = target.ledgerEntries ?? [];
    const contextEntries = entries
        .filter(entry => entry.loop >= CONTEXT_START_LOOP && entry.loop <= CONTEXT_END_LOOP)
        .map(entry => compactEntry(
            TARGET_PACKET_ORDINAL,
            entry,
            entries.find(candidate => candidate.loop === entry.loop + 1) ?? null,
            TARGET_LOOPS.includes(entry.loop)
        ));

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        targetPacketOrdinal: TARGET_PACKET_ORDINAL,
        targetPacketFound: true,
        updatedEntries: target.packetMetrics.updatedEntries,
        payloadSizeCount: target.packetMetrics.payloadSizeCount,
        payloadBitsSum: target.packetMetrics.payloadBitsSum,
        entityDataBitLength: target.packetMetrics.entityDataBitLength,
        serializedEntitiesByteLength: target.packetMetrics.serializedEntitiesByteLength,
        entriesExamined: target.packetMetrics.entriesExamined,
        payloadIteratorAlignedWithUpdatedEntries: target.packetMetrics.payloadSizeCount === target.packetMetrics.updatedEntries,
        entries: contextEntries,
        targetEntries: contextEntries.filter(entry => TARGET_LOOPS.includes(entry.loop)),
        rawPayloadsCommitted: false,
        rawSerializedEntitiesCommitted: false,
        fieldValuesCommitted: false
    };
}

function flattenLoopSegments(entry) {
    return (entry?.extractorDiagnostics ?? []).flatMap(diagnostic => diagnostic.fieldReadSegments ?? []);
}

export function buildLoop26SegmentSummary(targetContext) {
    const loop26 = targetContext.targetEntries.find(entry => entry.loop === 26) ?? null;
    if (loop26 === null) {
        return {
            schemaVersion: 1,
            replayId: AUTHORIZED_REPLAY_ID,
            targetPacketOrdinal: TARGET_PACKET_ORDINAL,
            loop: 26,
            found: false,
            gateEligible: false,
            limitations: ['loop 26 was not collected']
        };
    }

    const segments = flattenLoopSegments(loop26);
    const sumOfSegments = segments.reduce((sum, segment) => sum + (segment.bitsConsumed ?? 0), 0);
    const largestSegment = segments.reduce((largest, segment) => {
        if (largest === null || segment.bitsConsumed > largest.bitsConsumed) return segment;
        return largest;
    }, null);
    const actual = loop26.actualConsumedAfterCommand;
    const payloadBits = loop26.payloadBits;
    const extraBits = Number.isInteger(actual) && Number.isInteger(payloadBits) ? actual - payloadBits : null;
    const singleSegmentAccountsForMostOfExtra280 = largestSegment !== null &&
        Number.isInteger(extraBits) &&
        largestSegment.bitsConsumed > extraBits / 2;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        loop: 26,
        found: true,
        entityIndex: loop26.entityIndex,
        className: loop26.className,
        payloadBits,
        actualConsumedAfterCommand: actual,
        payloadMinusActualAfterCommand: loop26.payloadMinusActualAfterCommand,
        extraBitsConsumedBeyondPayload: extraBits,
        extractorMutationCount: loop26.extractorMutationCount,
        fieldPathBitsConsumed: loop26.fieldPathBitsConsumed,
        fieldReaderBitsConsumed: loop26.fieldReaderBitsConsumed,
        totalExtractorBitsConsumed: loop26.totalExtractorBitsConsumed,
        fieldReadSegmentCount: loop26.fieldReadSegmentCount,
        fieldReadSegments: segments,
        largestSegment,
        sumOfSegments,
        sumOfSegmentsMatchesFieldReaderBitsConsumed: sumOfSegments === loop26.fieldReaderBitsConsumed,
        fieldPathPlusSegmentSumMatchesTotal: sumOfSegments + loop26.fieldPathBitsConsumed === loop26.totalExtractorBitsConsumed,
        largestSegmentBits: largestSegment?.bitsConsumed ?? null,
        singleSegmentAccountsForMostOfExtra280,
        singleSegmentEqualsExtra280Bits: largestSegment?.bitsConsumed === LOOP_26_EXPECTED.extraBits,
        singleSegmentExceedsExtra280Bits: Number.isInteger(largestSegment?.bitsConsumed) &&
            largestSegment.bitsConsumed > LOOP_26_EXPECTED.extraBits,
        manySegmentsContributeToTotalReaderConsumption: segments.length > 1 && sumOfSegments > (largestSegment?.bitsConsumed ?? 0),
        valuesRecorded: false,
        rawPayloadsRecorded: false,
        gateEligible: loop26.entityIndex === LOOP_26_EXPECTED.entityIndex &&
            loop26.className === LOOP_26_EXPECTED.className &&
            loop26.payloadBits === LOOP_26_EXPECTED.payloadBits &&
            actual === LOOP_26_EXPECTED.actualConsumedAfterCommand &&
            extraBits === LOOP_26_EXPECTED.extraBits &&
            loop26.extractorMutationCount === LOOP_26_EXPECTED.extractorMutationCount &&
            loop26.fieldPathBitsConsumed === LOOP_26_EXPECTED.fieldPathBitsConsumed &&
            loop26.fieldReaderBitsConsumed === LOOP_26_EXPECTED.fieldReaderBitsConsumed &&
            loop26.totalExtractorBitsConsumed === LOOP_26_EXPECTED.totalExtractorBitsConsumed &&
            loop26.fieldReadSegmentCount === LOOP_26_EXPECTED.fieldReadSegmentCount &&
            segments.length === LOOP_26_EXPECTED.fieldReadSegmentCount &&
            sumOfSegments === LOOP_26_EXPECTED.fieldReaderBitsConsumed
    };
}

export function buildZeroSegmentSummary(targetContext) {
    const entries = ZERO_LOOPS.map(loop => targetContext.targetEntries.find(entry => entry.loop === loop) ?? null);
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        targetPacketOrdinal: TARGET_PACKET_ORDINAL,
        loops: entries.map((entry, index) => {
            if (entry === null) {
                return {
                    loop: ZERO_LOOPS[index],
                    found: false,
                    fieldPathExtractorProducedZeroPaths: null,
                    zeroConsumptionOccurredBeforeAnyFieldReader: null,
                    emptyUpdateAtCurrentCursorStatus: 'not_determinable'
                };
            }
            const zeroPaths = entry.extractorMutationCount === 0 && entry.fieldPathBitsConsumed === 0;
            const zeroBeforeReader = entry.fieldReadSegmentCount === 0 &&
                entry.fieldReaderBitsConsumed === 0 &&
                entry.totalExtractorBitsConsumed === 0 &&
                flattenLoopSegments(entry).length === 0;
            return {
                loop: entry.loop,
                found: true,
                entityIndex: entry.entityIndex,
                className: entry.className,
                payloadBits: entry.payloadBits,
                actualConsumedAfterCommand: entry.actualConsumedAfterCommand,
                fieldPathExtractorProducedZeroPaths: zeroPaths,
                zeroConsumptionOccurredBeforeAnyFieldReader: zeroBeforeReader,
                fieldReadSegmentsObserved: flattenLoopSegments(entry).length,
                fieldPathBitsConsumed: entry.fieldPathBitsConsumed,
                fieldReaderBitsConsumed: entry.fieldReaderBitsConsumed,
                totalExtractorBitsConsumed: entry.totalExtractorBitsConsumed,
                emptyUpdateAtCurrentCursorStatus: zeroPaths && zeroBeforeReader ?
                    'supported_by_extractor_metrics_only' :
                    'not_supported',
                determinability: 'metric_only_no_source2_semantics'
            };
        }),
        allLoopsFound: entries.every(Boolean),
        allZeroBeforeFieldReader: entries.every(entry => entry !== null &&
            entry.extractorMutationCount === 0 &&
            entry.fieldReadSegmentCount === 0 &&
            entry.fieldReaderBitsConsumed === 0 &&
            entry.totalExtractorBitsConsumed === 0),
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false
    };
}

export function buildSegmentHypotheses(loop26Summary, zeroSummary) {
    const followingPayloadBits = zeroSummary.loops
        .filter(loop => Number.isInteger(loop.payloadBits))
        .reduce((sum, loop) => sum + loop.payloadBits, 0);
    const loop26ExtraBits = loop26Summary.extraBitsConsumedBeyondPayload;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        targetPacketOrdinal: TARGET_PACKET_ORDINAL,
        loop26_overconsumption_absorbed_following_payloads_possible: {
            status: zeroSummary.allZeroBeforeFieldReader === true ? 'possible_not_proven' : 'not_supported',
            followingLoopsPayloadBitsSum: followingPayloadBits,
            loop26ExtraBits,
            exactBitEqualityWithLoops27To29Payloads: followingPayloadBits === loop26ExtraBits,
            basis: 'loops 27-29 have positive serializedEntities payloadBits but zero extractor consumption at the current cursor',
            limitations: ['cursor correlation is not causal proof', 'following payload sum does not equal the loop 26 extra bits']
        },
        loop26_large_field_segment_possible: {
            status: loop26Summary.singleSegmentAccountsForMostOfExtra280 === true ? 'supported' : 'not_supported',
            largestSegmentBits: loop26Summary.largestSegmentBits,
            singleSegmentAccountsForMostOfExtra280: loop26Summary.singleSegmentAccountsForMostOfExtra280,
            singleSegmentEqualsExtra280Bits: loop26Summary.singleSegmentEqualsExtra280Bits,
            singleSegmentExceedsExtra280Bits: loop26Summary.singleSegmentExceedsExtra280Bits
        },
        serializedEntities_not_direct_skip_supported: {
            status: 'supported_for_this_canary',
            basis: 'Task 111 and Task 112 mismatches remain exact; direct missing-UPDATE skip remains unsafe',
            recoveryRecommendation: 'diagnostic_only_do_not_use_as_safe_skip'
        },
        accounting_artifact_possible: {
            status: 'possible',
            basis: 'field path bits, field reader bits, and serializedEntities payload bits use different local accounting paths',
            limitations: ['no external parser or Source 2 semantic reference was used']
        },
        causalConclusion: 'not_determined',
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false
    };
}

export async function buildTask112Comparison(loop26Summary, zeroSummary) {
    const task112Target = await readJson(`${TASK112_ROOT}target-packet-summary.json`);
    const task112LoopAnalysis = await readJson(`${TASK112_ROOT}mismatch-loop-analysis.json`);
    const task112ExtractorSummary = await readJson(`${TASK112_ROOT}extractor-consumption-summary.json`);
    const task112Loop26 = task112Target.targetMismatchEntries.find(entry => entry.loop === 26);
    const differences = [];

    const checks = [
        ['loop26.entityIndex', loop26Summary.entityIndex, task112Loop26?.entityIndex],
        ['loop26.className', loop26Summary.className, task112Loop26?.className],
        ['loop26.payloadBits', loop26Summary.payloadBits, task112Loop26?.payloadBits],
        ['loop26.actualConsumedAfterCommand', loop26Summary.actualConsumedAfterCommand, task112Loop26?.actualConsumedAfterCommand],
        ['loop26.payloadMinusActualAfterCommand', loop26Summary.payloadMinusActualAfterCommand, task112Loop26?.payloadMinusActualAfterCommand],
        ['loop26.extractorMutationCount', loop26Summary.extractorMutationCount, task112Loop26?.extractorMutationCount],
        ['loop26.fieldReadSegmentCount', loop26Summary.fieldReadSegmentCount, task112Loop26?.fieldReadSegmentCount],
        ['loop26.fieldReaderBitsConsumed', loop26Summary.fieldReaderBitsConsumed, task112Loop26?.fieldReaderBitsConsumed],
        ['loop26.fieldPathBitsConsumed', loop26Summary.fieldPathBitsConsumed, task112Loop26?.fieldPathBitsConsumed],
        ['loop26.totalExtractorBitsConsumed', loop26Summary.totalExtractorBitsConsumed, task112Loop26?.totalExtractorBitsConsumed],
        ['loop26.minFieldReaderBitsConsumed', loop26Summary.fieldReadSegments.length === 0 ? null : Math.min(...loop26Summary.fieldReadSegments.map(segment => segment.bitsConsumed)), task112Loop26?.extractorDiagnostics?.[0]?.minFieldReaderBitsConsumed],
        ['loop26.maxFieldReaderBitsConsumed', loop26Summary.largestSegmentBits, task112Loop26?.extractorDiagnostics?.[0]?.maxFieldReaderBitsConsumed],
        ['loops27To29ZeroConsumptionObserved', zeroSummary.allZeroBeforeFieldReader, task112LoopAnalysis.loops27To29ZeroConsumptionObserved],
        ['totalFieldReadSegmentsInWindow', task112ExtractorSummary.totalFieldReadSegments, task112ExtractorSummary.totalFieldReadSegments]
    ];

    for (const [pathName, observed, expected] of checks) {
        if (observed !== expected) {
            differences.push({ path: pathName, observed, expected });
        }
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        sourceTask: '112',
        sourceRoot: TASK112_ROOT,
        exactTask112NumbersMatched: differences.length === 0,
        differences,
        comparedFields: checks.map(([pathName]) => pathName),
        task112Gate: await readJson(`${TASK112_ROOT}field-consumption-gate.json`),
        conclusion: differences.length === 0 ?
            'Task 113 segment accounting preserves the exact Task 112 loop metrics' :
            'Task 113 segment accounting differs from Task 112 and requires review'
    };
}

export function buildRiskAssessment(loop26Summary, zeroSummary, hypotheses, task112Comparison) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        segmentMetricsCollected: loop26Summary.gateEligible === true,
        task112NumbersMatched: task112Comparison.exactTask112NumbersMatched === true,
        loops27To29ZeroSegmentStatus: zeroSummary.allZeroBeforeFieldReader ?
            'observed_zero_paths_zero_segments_zero_consumption_at_current_cursor' :
            'not_determined',
        directMissingUpdateSkipStatus: 'unsafe',
        parserFixRecommendedNow: false,
        recoveryRecommendation: 'diagnostic_only_do_not_use_as_safe_skip',
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        causalConclusion: hypotheses.causalConclusion,
        fieldValuesRecorded: false,
        rawPayloadsRecorded: false,
        limitations: [
            'single local canary replay',
            'diagnostic stops at first default missing-entity failure',
            'field values are intentionally not emitted',
            'field-level counts do not prove Source 2 serializedEntities semantics',
            'field names and serializer metadata are metadata only, not decoded values'
        ]
    };
}

export async function auditImplementationSources(root = REPO_ROOT) {
    const files = [];
    const findings = [];
    for (const file of ENGINE_IMPLEMENTATION_FILES) {
        const source = await readFile(path.join(root, file), 'utf8');
        files.push(file);
        if (/\bif\s*\([^)]*replay_010[^)]*\)|\bcase\s+['"]replay_010['"]/.test(source)) {
            findings.push({ type: 'replay_specific_engine_branch', file });
        }
        if (/createReadStream\s*\([^)]*samples[\\/]|readFile\s*\([^)]*samples[\\/]/.test(source)) {
            findings.push({ type: 'samples_executable_path', file });
        }
        if (/createReadStream\s*\([^)]*output[\\/]replays[\\/]|readFile\s*\([^)]*output[\\/]replays[\\/]/.test(source)) {
            findings.push({ type: 'output_replays_executable_path', file });
        }
        if (/partida_0?(1[1-9]|20)\.dem/.test(source)) {
            findings.push({ type: 'candidate_011_020_processing_path', file });
        }
        if (/DEFAULTS\s*=\s*\{[\s\S]*diagnosePreRecoveryFieldConsumption\s*:\s*true/.test(source)) {
            findings.push({ type: 'field_diagnostics_default_enabled', file });
        }
        if (/DEFAULTS\s*=\s*\{[\s\S]*allowUnresolvedEntityReference\s*:\s*true/.test(source)) {
            findings.push({ type: 'recovery_default_enabled', file });
        }
    }
    return {
        schemaVersion: 1,
        implementationFilesExamined: files,
        replaySpecificBranchFindings: findings.filter(finding => finding.type === 'replay_specific_engine_branch'),
        diagnosticsDefaultEnabled: findings.some(finding => finding.type === 'field_diagnostics_default_enabled'),
        recoveryDefaultEnabled: findings.some(finding => finding.type === 'recovery_default_enabled'),
        samplesAppearsInExecutableCodePaths: findings.some(finding => finding.type === 'samples_executable_path'),
        outputReplaysAppearsInExecutableCodePaths: findings.some(finding => finding.type === 'output_replays_executable_path'),
        candidates011To020AppearInProcessingPaths: findings.some(finding => finding.type === 'candidate_011_020_processing_path'),
        passed: findings.length === 0,
        findings
    };
}

async function buildProtectionAudit(inputIdentity, branchAudit, diagnosticConfiguration) {
    const task114Created = existsSync(path.join(REPO_ROOT, 'tasks/specs/114.json')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/blocked/114-select-next-canonical-generalization-control.md')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/completed/114-inspect-loop-26-field-reader-segments.md'));
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        replay005Read: false,
        replay005Hashed: false,
        replay005Opened: false,
        replay005Copied: false,
        replay005Processed: false,
        bots006To008Processed: false,
        candidates011To020Touched: false,
        samplesUsed: false,
        outputReplaysModified: false,
        demFilesCommitted: false,
        localFilesCommitted: false,
        rawEntityDataCommitted: false,
        rawSerializedEntitiesCommitted: false,
        rawPayloadsCommitted: false,
        fieldValuesCommitted: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        sourceArtifactsEmitted: false,
        automaticRecoveryAdded: false,
        missingUpdateRecovered: false,
        outOfRangeCreateRecovered: false,
        placeholderEntityCreated: false,
        syntheticFieldsMaterialized: false,
        task114Created,
        rawReplayRead: true,
        rawReplayHash: inputIdentity.sha256,
        replayParserInvoked: true,
        diagnosticRecoveryAllowUnresolvedEntityReference: diagnosticConfiguration.recovery?.allowUnresolvedEntityReference === true,
        diagnosticRecoveryAllowMissingClassBaseline: diagnosticConfiguration.recovery?.allowMissingClassBaseline === true,
        diagnosticFieldConsumptionEnabled: diagnosticConfiguration.recovery?.diagnosePreRecoveryFieldConsumption === true,
        branchAuditPassed: branchAudit.passed,
        passed: !task114Created &&
            branchAudit.passed &&
            diagnosticConfiguration.recovery?.allowUnresolvedEntityReference !== true &&
            diagnosticConfiguration.recovery?.allowMissingClassBaseline !== true
    };
}

export function decideGate({
    defaultPass,
    diagnosticPass,
    loop26Summary,
    zeroSummary,
    task112Comparison,
    protectionAudit,
    branchAudit
}) {
    const defaultOk = defaultPass.expectedFailureReproduced === true;
    const diagnosticOk = diagnosticPass.expectedFailureReproduced === true;
    const loop26Ok = loop26Summary.gateEligible === true;
    const zeroLoopsOk = zeroSummary.allLoopsFound === true && zeroSummary.allZeroBeforeFieldReader === true;
    const sameTask112 = task112Comparison.exactTask112NumbersMatched === true;
    const safe = protectionAudit.passed === true && branchAudit.passed === true;

    let gate = 'local_replay_loop_26_field_reader_segments_blocked';
    if (defaultOk && diagnosticOk && loop26Ok && zeroLoopsOk && sameTask112 && safe) {
        gate = 'local_replay_loop_26_field_reader_segments_diagnosed';
    } else if (defaultOk && diagnosticOk && (loop26Summary.found === true || zeroSummary.allLoopsFound === true) && safe) {
        gate = 'local_replay_loop_26_field_reader_segments_partial';
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate,
        successGate: 'local_replay_loop_26_field_reader_segments_diagnosed',
        partialGate: 'local_replay_loop_26_field_reader_segments_partial',
        blockedGate: 'local_replay_loop_26_field_reader_segments_blocked',
        defaultFailureReproduced: defaultOk,
        diagnosticFailureReproducedWithoutRecovery: diagnosticOk,
        loop26SegmentMetricsProduced: loop26Ok,
        loops27To29ZeroSegmentsReported: zeroLoopsOk,
        task112NumbersMatchedExactly: sameTask112,
        parserDefaultBehaviorChanged: false,
        recoveryAddedOrPromoted: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        fieldValuesEmitted: false,
        rawPayloadsEmitted: false,
        protectionAuditPassed: protectionAudit.passed,
        causalConclusion: 'not_determined',
        reasons: [
            defaultOk ? 'default pass reproduced Task 105 failure' : 'default pass did not reproduce Task 105 failure',
            diagnosticOk ? 'diagnostic pass reproduced first failure without recovery' : 'diagnostic pass did not fail closed at first failure',
            loop26Ok ? 'loop 26 segment metrics were produced and match Task 112 accounting' : 'loop 26 segment metrics are incomplete',
            zeroLoopsOk ? 'loops 27-29 zero segment status was reported' : 'loops 27-29 zero segment status is incomplete',
            sameTask112 ? 'Task 112 numbers matched exactly' : 'Task 112 number comparison failed',
            safe ? 'protection and branch audits passed' : 'safety audit failed'
        ]
    };
}

async function writeReport(summaryRoot, values) {
    const {
        defaultPass,
        diagnosticPass,
        loop26Summary,
        zeroSummary,
        hypotheses,
        task112Comparison,
        riskAssessment,
        protectionAudit,
        gate
    } = values;
    const report = [
        '# Local Replay Loop 26 Field Reader Segments',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        '## Passes',
        '',
        `Default failure reproduced: \`${defaultPass.expectedFailureReproduced}\``,
        `Diagnostic failure reproduced without recovery: \`${diagnosticPass.expectedFailureReproduced}\``,
        `Recovery added or promoted: \`${gate.recoveryAddedOrPromoted}\``,
        '',
        '## Loop 26',
        '',
        `Packet ordinal: \`${loop26Summary.packetOrdinal}\``,
        `Entity: \`${loop26Summary.entityIndex}\``,
        `Class: \`${loop26Summary.className}\``,
        `Payload bits: \`${loop26Summary.payloadBits}\``,
        `Actual consumed after command: \`${loop26Summary.actualConsumedAfterCommand}\``,
        `Extra bits: \`${loop26Summary.extraBitsConsumedBeyondPayload}\``,
        `Extractor mutations: \`${loop26Summary.extractorMutationCount}\``,
        `Field path bits: \`${loop26Summary.fieldPathBitsConsumed}\``,
        `Field reader bits: \`${loop26Summary.fieldReaderBitsConsumed}\``,
        `Total extractor bits: \`${loop26Summary.totalExtractorBitsConsumed}\``,
        `Segment count: \`${loop26Summary.fieldReadSegmentCount}\``,
        `Largest segment bits: \`${loop26Summary.largestSegmentBits}\``,
        `Segment sum: \`${loop26Summary.sumOfSegments}\``,
        `Single segment accounts for most of extra 280: \`${loop26Summary.singleSegmentAccountsForMostOfExtra280}\``,
        '',
        '## Loops 27-29',
        '',
        `All zero before field reader: \`${zeroSummary.allZeroBeforeFieldReader}\``,
        `Status: \`${zeroSummary.loops.map(loop => `${loop.loop}:${loop.emptyUpdateAtCurrentCursorStatus}`).join(', ')}\``,
        '',
        '## Hypotheses',
        '',
        `Loop 26 large field segment: \`${hypotheses.loop26_large_field_segment_possible.status}\``,
        `Following payload absorption: \`${hypotheses.loop26_overconsumption_absorbed_following_payloads_possible.status}\``,
        `SerializedEntities direct skip status: \`${hypotheses.serializedEntities_not_direct_skip_supported.status}\``,
        `Accounting artifact: \`${hypotheses.accounting_artifact_possible.status}\``,
        `Causal conclusion: \`${hypotheses.causalConclusion}\``,
        '',
        '## Task 112 Comparison',
        '',
        `Exact Task 112 numbers matched: \`${task112Comparison.exactTask112NumbersMatched}\``,
        `Differences: \`${task112Comparison.differences.length}\``,
        '',
        '## Risk And Protection',
        '',
        `Direct missing UPDATE skip status: \`${riskAssessment.directMissingUpdateSkipStatus}\``,
        `Parser fix recommended now: \`${riskAssessment.parserFixRecommendedNow}\``,
        `Source 2 semantics claimed: \`${riskAssessment.source2SemanticsClaimed}\``,
        `Replay 005 processed: \`${protectionAudit.replay005Processed}\``,
        `Bots 006-008 processed: \`${protectionAudit.bots006To008Processed}\``,
        `Candidates 011-020 touched: \`${protectionAudit.candidates011To020Touched}\``,
        `Field values committed: \`${protectionAudit.fieldValuesCommitted}\``,
        `Raw payloads committed: \`${protectionAudit.rawPayloadsCommitted}\``,
        '',
        `Summary output: \`${summaryRoot.relativePath}\``,
        '',
        'Task 114 was not created.'
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-loop-26-field-reader-segments.md'), `${report}\n`);
}

function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument near ${key}`);
        args[key.slice(2)] = value;
    }
    for (const required of ['input', 'replay-id', 'local-output', 'summary-output']) {
        if (!args[required]) throw new Error(`missing --${required}`);
    }
    const unexpected = Object.keys(args).filter(key => !['input', 'replay-id', 'local-output', 'summary-output'].includes(key));
    if (unexpected.length > 0) throw new Error(`unsupported arguments: ${unexpected.join(', ')}`);
    return args;
}

export async function runCli(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const input = validateInputPath(args.input, args['replay-id']);
    const roots = validateOutputRoots(args['local-output'], args['summary-output']);
    await ensureDir(roots.local.absolutePath);
    await ensureDir(roots.summary.absolutePath);

    const inputIdentity = await buildInputIdentity(input);
    const defaultPass = await runAdvancementPass({ input, mode: 'default', configuration: undefined });
    const diagnosticConfiguration = new ParserConfiguration({
        recovery: {
            diagnosePreRecoveryPayloadConsumption: true,
            diagnosePreRecoveryFieldConsumption: true
        }
    });
    const diagnosticPass = await runAdvancementPass({
        input,
        mode: 'diagnostic_loop_26_field_reader_segments',
        configuration: diagnosticConfiguration
    });
    const diagnostics = diagnosticConfiguration.recoveryDiagnostics
        .filter(diagnostic => diagnostic.type === 'pre_recovery_payload_consumption');
    const targetContext = buildTargetContext(diagnostics);
    const loop26Summary = buildLoop26SegmentSummary(targetContext);
    const zeroSummary = buildZeroSegmentSummary(targetContext);
    const hypotheses = buildSegmentHypotheses(loop26Summary, zeroSummary);
    const task112Comparison = await buildTask112Comparison(loop26Summary, zeroSummary);
    const riskAssessment = buildRiskAssessment(loop26Summary, zeroSummary, hypotheses, task112Comparison);
    const branchAudit = await auditImplementationSources();
    const protectionAudit = await buildProtectionAudit(inputIdentity, branchAudit, diagnosticConfiguration);
    const gate = decideGate({
        defaultPass,
        diagnosticPass,
        loop26Summary,
        zeroSummary,
        task112Comparison,
        protectionAudit,
        branchAudit
    });

    await writeJson(path.join(roots.local.absolutePath, 'full-loop-26-field-reader-segments-ledger.json'), {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        localOnly: true,
        rawPayloadsIncluded: false,
        rawSerializedEntitiesIncluded: false,
        fieldValuesIncluded: false,
        targetPacketOrdinal: TARGET_PACKET_ORDINAL,
        targetContext
    });

    await writeJson(path.join(roots.summary.absolutePath, 'input-identity.json'), inputIdentity);
    await writeJson(path.join(roots.summary.absolutePath, 'default-pass-result.json'), defaultPass);
    await writeJson(path.join(roots.summary.absolutePath, 'diagnostic-pass-result.json'), {
        ...diagnosticPass,
        recoveryWarnings: diagnosticConfiguration.recoveryWarnings,
        preRecoveryPayloadDiagnosticsCount: diagnostics.length,
        recoveryAllowUnresolvedEntityReference: diagnosticConfiguration.recovery?.allowUnresolvedEntityReference === true,
        recoveryAllowMissingClassBaseline: diagnosticConfiguration.recovery?.allowMissingClassBaseline === true,
        diagnosePreRecoveryFieldConsumption: diagnosticConfiguration.recovery?.diagnosePreRecoveryFieldConsumption === true
    });
    await writeJson(path.join(roots.summary.absolutePath, 'loop-26-segment-summary.json'), loop26Summary);
    await writeJson(path.join(roots.summary.absolutePath, 'loops-27-29-zero-segment-summary.json'), zeroSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'segment-hypotheses.json'), hypotheses);
    await writeJson(path.join(roots.summary.absolutePath, 'task112-comparison.json'), task112Comparison);
    await writeJson(path.join(roots.summary.absolutePath, 'risk-assessment.json'), riskAssessment);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-specific-branch-audit.json'), branchAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'segment-gate.json'), gate);
    await writeReport(roots.summary, {
        defaultPass,
        diagnosticPass,
        loop26Summary,
        zeroSummary,
        hypotheses,
        task112Comparison,
        riskAssessment,
        protectionAudit,
        gate
    });

    return {
        inputIdentity,
        defaultPass,
        diagnosticPass,
        targetContext,
        loop26Summary,
        zeroSummary,
        hypotheses,
        task112Comparison,
        riskAssessment,
        protectionAudit,
        branchAudit,
        gate
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
    runCli().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
