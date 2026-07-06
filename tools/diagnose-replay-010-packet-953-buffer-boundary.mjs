#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import BitBuffer from '../packages/engine/src/core/BitBuffer.js';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_REPLAY_ID = ['replay', '010'].join('_');
const AUTHORIZED_INPUT = '.local/deadem/replays/inbox/partida_010.dem';
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/packet-953-buffer-boundary/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-packet-953-buffer-boundary/';
const TASK112_ROOT = 'output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/';
const TASK116_ROOT = 'output/local-replay-processing/replay_010-loop-26-string-reader-accounting/';
const TASK117_ROOT = 'output/local-replay-processing/replay_010-packet-953-payload-iterator-alignment/';
const TARGET_PACKET_ORDINAL = 953;
const TARGET_LOOPS = [26, 27, 28, 29];
const POST_LOOP26_LOOPS = [27, 28, 29];
const TASK105_ERROR = 'Unable to find an entity with index [ 2905 ]';
const ENTITY_DATA_BIT_LENGTH = 5344;
const LOOP26_AFTER_COMMAND = 4842;
const LOOP26_AFTER_ACTION = 5343;
const FIELD_PATH59_START = 5055;
const FIELD_PATH59_END = 5343;
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
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 118 authorizes only ${AUTHORIZED_INPUT}`);
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
        authorizedByTask: '118',
        rawBytesCommitted: false
    };
}

function compactReadCounts(entry) {
    return {
        beforeIndex: entry?.readCounts?.beforeIndex ?? null,
        afterIndex: entry?.readCounts?.afterIndex ?? null,
        afterCommand: entry?.readCounts?.afterCommand ?? null,
        afterAction: entry?.readCounts?.afterAction ?? null
    };
}

function remainingBits(totalBits, readCount) {
    return Number.isInteger(readCount) ? totalBits - readCount : null;
}

function readBoundary(totalBits, start, end) {
    return {
        start,
        end,
        remainingBitsAtStart: remainingBits(totalBits, start),
        beginsWithinEntityDataBitLength: Number.isInteger(start) && start < totalBits,
        beginsAtEntityDataBitLength: start === totalBits,
        beginsBeyondEntityDataBitLength: Number.isInteger(start) && start > totalBits,
        endsAtEntityDataBitLength: end === totalBits,
        endsBeyondEntityDataBitLength: Number.isInteger(end) && end > totalBits,
        readCountExceedsEntityDataBitLength: (Number.isInteger(start) && start > totalBits) || (Number.isInteger(end) && end > totalBits),
        bitsInsideEntityData: Number.isInteger(start) && Number.isInteger(end)
            ? Math.max(0, Math.min(end, totalBits) - Math.min(start, totalBits))
            : null,
        bitsBeyondEntityData: Number.isInteger(start) && Number.isInteger(end)
            ? Math.max(0, end - Math.max(start, totalBits))
            : null
    };
}

function classifyLoopBoundary(row) {
    const boundaries = [
        row.indexReadBoundary,
        row.commandReadBoundary,
        row.actionReadBoundary
    ].filter(Boolean);
    if (boundaries.length === 0) return 'not_determined';
    if (boundaries.every(boundary => boundary.beginsWithinEntityDataBitLength && !boundary.endsBeyondEntityDataBitLength)) {
        return 'valid_entry_reads';
    }
    if (boundaries.some(boundary => boundary.beginsWithinEntityDataBitLength && boundary.endsBeyondEntityDataBitLength)) {
        return 'padding_or_trailing_bit_reads';
    }
    if (boundaries.every(boundary => boundary.beginsAtEntityDataBitLength || boundary.beginsBeyondEntityDataBitLength)) {
        return 'out_of_buffer_reads';
    }
    return 'not_determined';
}

export function buildPacket953BoundaryInventory(targetPacketSummary, task116Boundary, task116Segment) {
    const mismatches = new Map((targetPacketSummary.targetMismatchEntries ?? []).map(entry => [entry.loop, entry]));
    const loop26 = mismatches.get(26);
    const loopRows = TARGET_LOOPS.map(loop => {
        const entry = mismatches.get(loop);
        const readCounts = compactReadCounts(entry);
        const indexReadBoundary = readBoundary(targetPacketSummary.entityDataBitLength, readCounts.beforeIndex, readCounts.afterIndex);
        const commandReadBoundary = readBoundary(targetPacketSummary.entityDataBitLength, readCounts.afterIndex, readCounts.afterCommand);
        const actionReadBoundary = readBoundary(targetPacketSummary.entityDataBitLength, readCounts.afterCommand, readCounts.afterAction);
        return {
            loop,
            operation: entry?.operation ?? null,
            entityIndex: entry?.entityIndex ?? null,
            className: entry?.className ?? null,
            payloadBits: entry?.payloadBits ?? null,
            actualConsumedAfterCommand: entry?.actualConsumedAfterCommand ?? null,
            payloadMinusActualAfterCommand: entry?.payloadMinusActualAfterCommand ?? null,
            readCounts,
            remainingBitsBeforeIndexRead: remainingBits(targetPacketSummary.entityDataBitLength, readCounts.beforeIndex),
            remainingBitsBeforeCommandRead: remainingBits(targetPacketSummary.entityDataBitLength, readCounts.afterIndex),
            remainingBitsBeforeActionRead: remainingBits(targetPacketSummary.entityDataBitLength, readCounts.afterCommand),
            indexReadBoundary,
            commandReadBoundary,
            actionReadBoundary
        };
    });
    const finalReadCount = loopRows.at(-1)?.readCounts?.afterAction ?? null;
    const packetFinalReadCountRelation = finalReadCount === targetPacketSummary.entityDataBitLength
        ? 'equals_entityDataBitLength'
        : (finalReadCount > targetPacketSummary.entityDataBitLength ? 'exceeds_entityDataBitLength' : 'undershoots_entityDataBitLength');

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        entityDataBitLength: targetPacketSummary.entityDataBitLength,
        serializedEntitiesByteLength: targetPacketSummary.serializedEntitiesByteLength,
        updatedEntries: targetPacketSummary.updatedEntries,
        payloadSizeCount: targetPacketSummary.payloadSizeCount,
        lastKnownReadCountBeforeLoop26: loop26?.readCounts?.beforeIndex ?? null,
        loop26BeforeIndexReadCount: loop26?.readCounts?.beforeIndex ?? null,
        loop26AfterIndexReadCount: loop26?.readCounts?.afterIndex ?? null,
        loop26AfterCommandReadCount: loop26?.readCounts?.afterCommand ?? null,
        loop26AfterActionReadCount: loop26?.readCounts?.afterAction ?? null,
        loop26PayloadBits: loop26?.payloadBits ?? null,
        loop26ExpectedEndFromPayloadBits: task116Boundary.loop26ExpectedEndFromPayloadBits,
        fieldPath59ReadStart: task116Segment.beforeReadCount,
        fieldPath59ReadEnd: task116Segment.afterReadCount,
        fieldPath59BitsConsumed: task116Segment.bitsConsumed,
        remainingBitsAfterLoop26: remainingBits(targetPacketSummary.entityDataBitLength, loop26?.readCounts?.afterAction),
        loopRows,
        loops27To29: loopRows.filter(row => POST_LOOP26_LOOPS.includes(row.loop)),
        anyReadCountExceedsEntityDataBitLength: loopRows.some(row => [
            row.readCounts.beforeIndex,
            row.readCounts.afterIndex,
            row.readCounts.afterCommand,
            row.readCounts.afterAction
        ].some(readCount => Number.isInteger(readCount) && readCount > targetPacketSummary.entityDataBitLength)),
        packetFinalReadCount: finalReadCount,
        packetFinalReadCountRelation,
        packetFinalReadCountDeltaBits: Number.isInteger(finalReadCount) ? finalReadCount - targetPacketSummary.entityDataBitLength : null,
        trailingBitsAfterLoop26: remainingBits(targetPacketSummary.entityDataBitLength, loop26?.readCounts?.afterAction),
        valuesRecorded: false,
        rawPayloadsRecorded: false
    };
}

function safeProbe(description, fn) {
    try {
        const result = fn();
        return {
            description,
            threw: false,
            errorMessage: null,
            ...result
        };
    } catch (error) {
        return {
            description,
            threw: true,
            errorMessage: error?.message ?? String(error)
        };
    }
}

export function runSyntheticBitBufferBoundaryProbes() {
    return [
        safeProbe('move beyond end throws', () => {
            const buffer = new BitBuffer(new Uint8Array([0b10101010]));
            buffer.move(9);
            return { readCount: buffer.getReadCount(), unreadCount: buffer.getUnreadCount() };
        }),
        safeProbe('read() beyond end throws through _read bounds check', () => {
            const buffer = new BitBuffer(new Uint8Array([0b10101010]));
            buffer.move(8);
            buffer.read(1);
            return { readCount: buffer.getReadCount(), unreadCount: buffer.getUnreadCount() };
        }),
        safeProbe('readBitsAsUInt crosses beyond end without throwing', () => {
            const buffer = new BitBuffer(new Uint8Array([0b10101010]));
            buffer.move(7);
            const value = buffer.readBitsAsUInt(6);
            return { value, readCount: buffer.getReadCount(), unreadCount: buffer.getUnreadCount() };
        }),
        safeProbe('readUInt8 at byte-aligned end returns zero and advances', () => {
            const buffer = new BitBuffer(new Uint8Array([0b10101010]));
            buffer.move(8);
            const value = buffer.readUInt8();
            return { value, readCount: buffer.getReadCount(), unreadCount: buffer.getUnreadCount() };
        }),
        safeProbe('readUVarInt at end uses readBitsAsUInt and advances beyond end', () => {
            const buffer = new BitBuffer(new Uint8Array([0b10101010]));
            buffer.move(8);
            const value = buffer.readUVarInt();
            return { value, readCount: buffer.getReadCount(), unreadCount: buffer.getUnreadCount() };
        }),
        safeProbe('readUVarInt32 at byte-aligned end uses readUInt8 and returns zero', () => {
            const buffer = new BitBuffer(new Uint8Array([0b10101010]));
            buffer.move(8);
            const value = buffer.readUVarInt32();
            return { value, readCount: buffer.getReadCount(), unreadCount: buffer.getUnreadCount() };
        })
    ];
}

export async function buildBitBufferBoundaryBehavior() {
    const bitBufferSource = await readFile(path.join(REPO_ROOT, 'packages/engine/src/core/BitBuffer.js'), 'utf8');
    const staticFindings = [
        {
            method: 'move',
            hasBoundsCheck: /Cannot move pointer forward/.test(bitBufferSource),
            behavior: 'throws_when_requested_forward_move_exceeds_unread_count'
        },
        {
            method: 'read/_read',
            hasBoundsCheck: /Unable to read \[ \$\{numberOfBits\} \] bit/.test(bitBufferSource),
            behavior: 'throws_when_requested_bits_exceed_unread_count'
        },
        {
            method: 'readBits',
            exists: false,
            hasBoundsCheck: null,
            behavior: 'no_standalone_readBits_method_found; local bit reads are readBit and readBitsAsUInt'
        },
        {
            method: 'readBitsAsUInt',
            hasBoundsCheck: false,
            behavior: 'direct_buffer_indexing_without_unread_check'
        },
        {
            method: 'readBit',
            hasBoundsCheck: false,
            behavior: 'direct_buffer_indexing_without_unread_check'
        },
        {
            method: 'readUInt8',
            hasBoundsCheck: false,
            behavior: 'byte_aligned_fast_path_direct_buffer_indexing_without_unread_check'
        },
        {
            method: 'readUVarInt',
            hasBoundsCheck: false,
            behavior: 'inherits_readBitsAsUInt_boundary_behavior'
        },
        {
            method: 'readUVarInt32',
            hasBoundsCheck: false,
            behavior: 'inherits_readUInt8_byte_aligned_boundary_behavior'
        }
    ];
    const syntheticProbes = runSyntheticBitBufferBoundaryProbes();
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        sourceFile: 'packages/engine/src/core/BitBuffer.js',
        staticFindings,
        syntheticProbes,
        syntheticReplayBytesUsed: false,
        readsBeyondEndCanAdvanceWithoutThrowing: syntheticProbes.some(probe => probe.threw === false && probe.readCount > 8),
        directOutOfBoundsReadCanReturnZero: syntheticProbes.some(probe => probe.threw === false && probe.value === 0 && probe.readCount > 8),
        methodsWithNoExplicitUnreadCheck: staticFindings.filter(finding => finding.hasBoundsCheck === false).map(finding => finding.method),
        conclusion: 'some_bitbuffer_read_paths_can_cross_or_start_beyond_end_without_throwing_in_synthetic_inputs'
    };
}

export function buildLoopBoundaryClassification(boundaryInventory, bitbufferBehavior) {
    const classifications = boundaryInventory.loops27To29.map(row => {
        const classification = classifyLoopBoundary(row);
        return {
            loop: row.loop,
            entityIndex: row.entityIndex,
            className: row.className,
            readCounts: row.readCounts,
            remainingBitsBeforeIndexRead: row.remainingBitsBeforeIndexRead,
            remainingBitsBeforeCommandRead: row.remainingBitsBeforeCommandRead,
            indexReadBeginsWithinBuffer: row.indexReadBoundary.beginsWithinEntityDataBitLength,
            indexReadEndsBeyondBuffer: row.indexReadBoundary.endsBeyondEntityDataBitLength,
            commandReadBeginsBeyondOrAtBuffer: row.commandReadBoundary.beginsAtEntityDataBitLength || row.commandReadBoundary.beginsBeyondEntityDataBitLength,
            actionReadBeginsBeyondOrAtBuffer: row.actionReadBoundary.beginsAtEntityDataBitLength || row.actionReadBoundary.beginsBeyondEntityDataBitLength,
            anyReadCountExceedsEntityDataBitLength: [
                row.indexReadBoundary,
                row.commandReadBoundary,
                row.actionReadBoundary
            ].some(boundary => boundary.readCountExceedsEntityDataBitLength),
            classification,
            basis: classification === 'valid_entry_reads'
                ? 'all recorded reads stay within entityDataBitLength'
                : (classification === 'padding_or_trailing_bit_reads'
                    ? 'at least one recorded read starts with remaining bits but crosses entityDataBitLength'
                    : (classification === 'out_of_buffer_reads'
                        ? 'recorded reads start at or beyond entityDataBitLength'
                        : 'insufficient read-count evidence'))
        };
    });
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        entityDataBitLength: boundaryInventory.entityDataBitLength,
        classifications,
        summary: {
            validEntryReads: classifications.filter(row => row.classification === 'valid_entry_reads').map(row => row.loop),
            paddingOrTrailingBitReads: classifications.filter(row => row.classification === 'padding_or_trailing_bit_reads').map(row => row.loop),
            outOfBufferReads: classifications.filter(row => row.classification === 'out_of_buffer_reads').map(row => row.loop),
            notDetermined: classifications.filter(row => row.classification === 'not_determined').map(row => row.loop)
        },
        bitbufferBoundaryBehaviorSupportsPhantomEntryHypothesis: bitbufferBehavior.readsBeyondEndCanAdvanceWithoutThrowing,
        bufferBoundaryArtifactHypothesis: classifications.some(row => row.classification !== 'valid_entry_reads')
            ? 'strengthened_not_fix'
            : 'weakened',
        causalConclusion: 'not_determined'
    };
}

export function buildTask117Comparison(boundaryInventory, bitbufferBehavior, classification, payloadInventory, payloadGate, alignment, task116Boundary, task116Segment) {
    const checks = [
        ['payloadSizeCount', payloadInventory.payloadSizeCount, 30],
        ['updatedEntries', payloadInventory.updatedEntries, 30],
        ['payloadSizeCountEqualsUpdatedEntries', payloadInventory.payloadSizeCountEqualsUpdatedEntries, true],
        ['anyNullOrUndefinedPayloadSize', payloadInventory.anyNullOrUndefinedPayloadSize, false],
        ['currentAlignmentExplainsLoop26', payloadGate.payloadIteratorAlignmentConclusion.currentAlignmentExplainsLoop26, 'no'],
        ['smallShiftExplainsMismatch', payloadGate.payloadIteratorAlignmentConclusion.smallShiftExplainsMismatch, 'no'],
        ['groupedPayloadExplainsMismatch', payloadGate.payloadIteratorAlignmentConclusion.groupedPayloadExplainsMismatch, 'not_strengthened'],
        ['cumulativeBoundaryExplainsMismatch', payloadGate.payloadIteratorAlignmentConclusion.cumulativeBoundaryExplainsMismatch, 'no'],
        ['loop26StringEnd', task116Segment.afterReadCount, FIELD_PATH59_END],
        ['remainingBitsAfterLoop26', boundaryInventory.remainingBitsAfterLoop26, 1],
        ['fieldPath59BitsConsumed', task116Segment.bitsConsumed, 288],
        ['bitsAfterExpectedEndInsideSegment', task116Boundary.bitsAfterExpectedEndInsideSegment, 280],
        ['valuesRecorded', task116Segment.valueRecorded, false],
        ['rawBytesRecorded', task116Segment.rawBytesRecorded, false],
        ['rawPayloadsRecorded', task116Boundary.rawPayloadsRecorded, false],
        ['task117Gate', payloadGate.gate, 'local_replay_packet_953_payload_iterator_alignment_diagnosed']
    ].map(([field, actual, expected]) => ({ field, actual, expected, matched: actual === expected }));

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        sourceTask: '117',
        sourceReport: 'reports/local-replay-packet-953-payload-iterator-alignment.md',
        checks,
        exactTask117NumbersMatched: checks.every(check => check.matched),
        noSmallShiftGroupedOrCumulativeModelExplained: (
            alignment.answers.currentAlignmentExplainsLoop26 === 'no'
            && alignment.answers.anySmallShiftReducesMismatchForLoops26To29 === 'no'
            && alignment.answers.evidenceSupportsGroupedPayloadSemantics === 'not_strengthened'
        ),
        loop26StringEndAndRemainingBitsConfirmed: boundaryInventory.loop26AfterActionReadCount === FIELD_PATH59_END
            && boundaryInventory.remainingBitsAfterLoop26 === 1,
        bitbufferBoundaryBehaviorSummary: {
            readsBeyondEndCanAdvanceWithoutThrowing: bitbufferBehavior.readsBeyondEndCanAdvanceWithoutThrowing,
            directOutOfBoundsReadCanReturnZero: bitbufferBehavior.directOutOfBoundsReadCanReturnZero
        },
        loopClassificationSummary: classification.summary,
        valuesRecorded: false,
        rawBytesRecorded: false,
        rawPayloadsRecorded: false
    };
}

export function buildRiskAssessment({ boundaryInventory, bitbufferBehavior, classification, task117Comparison }) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        directMissingUpdateSkipStatus: 'unsafe_diagnostic_only',
        recoveryRecommendedNow: false,
        parserFixRecommendedNow: false,
        bufferBoundaryArtifactHypothesis: classification.bufferBoundaryArtifactHypothesis,
        parserBoundsCheckHypothesis: bitbufferBehavior.readsBeyondEndCanAdvanceWithoutThrowing
            ? 'strengthened_not_fix'
            : 'not_strengthened',
        loop27Classification: classification.classifications.find(row => row.loop === 27)?.classification ?? 'not_determined',
        loop28Classification: classification.classifications.find(row => row.loop === 28)?.classification ?? 'not_determined',
        loop29Classification: classification.classifications.find(row => row.loop === 29)?.classification ?? 'not_determined',
        packetFinalReadCountRelation: boundaryInventory.packetFinalReadCountRelation,
        packetFinalReadCountDeltaBits: boundaryInventory.packetFinalReadCountDeltaBits,
        task117NumbersMatchedExactly: task117Comparison.exactTask117NumbersMatched,
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        parserBugConcluded: false,
        causalConclusion: 'not_determined',
        limitations: [
            'classification is based on local read-count and buffer-length evidence only',
            'synthetic BitBuffer probes do not use replay bytes',
            'no recovery, parser fix, or Source 2 semantic conclusion is made'
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

export function buildProtectionAudit({ inputIdentity, roots, branchAudit, task119Exists }) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        authorizedInput: AUTHORIZED_INPUT,
        inputPath: inputIdentity.inputPath,
        replay010HashComputedForAuthorizedCanary: true,
        replayParserInvokedByTask118: false,
        dynamicPassSource: 'task117_reused_outputs',
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
        task119Created: task119Exists,
        outputRoots: {
            local: roots.local.relativePath,
            summary: roots.summary.relativePath
        },
        passed: !task119Exists && branchAudit.passed
    };
}

function buildPassReuseResult(source, mode) {
    return {
        ...source,
        mode,
        reusedFromTask: '117',
        originalSourceTask: source.reusedFromTask ?? '116',
        dynamicPassRunByTask118: false,
        replayParserInvokedByTask118: false,
        expectedFailure: TASK105_ERROR,
        expectedFailureReproduced: source.expectedFailureReproduced === true,
        recoveryActionsEnabled: source.recoveryActionsEnabled === true ? true : false
    };
}

export function decideGate({
    defaultPassResult,
    diagnosticPassResult,
    boundaryInventory,
    bitbufferBehavior,
    classification,
    task117Comparison,
    riskAssessment,
    protectionAudit
}) {
    const successConditions = {
        defaultFailureReproduced: defaultPassResult.expectedFailureReproduced === true,
        diagnosticFailureReproducedWithoutRecovery: diagnosticPassResult.expectedFailureReproduced === true && diagnosticPassResult.recoveryActionsEnabled === false,
        packetBoundaryInventoryProduced: boundaryInventory.entityDataBitLength === ENTITY_DATA_BIT_LENGTH && boundaryInventory.loop26AfterActionReadCount === LOOP26_AFTER_ACTION,
        bitbufferBoundaryBehaviorTestedSynthetically: bitbufferBehavior.syntheticReplayBytesUsed === false && bitbufferBehavior.syntheticProbes.length >= 6,
        loops27To29Classified: classification.classifications.length === 3 && classification.classifications.every(row => row.classification !== 'not_determined'),
        task117NumbersMatchedExactly: task117Comparison.exactTask117NumbersMatched === true,
        noParserFixOrRecoveryRecommended: riskAssessment.recoveryRecommendedNow === false && riskAssessment.parserFixRecommendedNow === false,
        protectionAuditPassed: protectionAudit.passed === true,
        causalConclusionNotDetermined: riskAssessment.causalConclusion === 'not_determined'
    };
    const passed = Object.values(successConditions).every(Boolean);
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate: passed
            ? 'local_replay_packet_953_buffer_boundary_diagnosed'
            : 'local_replay_packet_953_buffer_boundary_partial',
        successGate: 'local_replay_packet_953_buffer_boundary_diagnosed',
        partialGate: 'local_replay_packet_953_buffer_boundary_partial',
        blockedGate: 'local_replay_packet_953_buffer_boundary_blocked',
        successConditions,
        bufferBoundaryConclusion: {
            loop27Classification: riskAssessment.loop27Classification,
            loop28Classification: riskAssessment.loop28Classification,
            loop29Classification: riskAssessment.loop29Classification,
            remainingBitsAfterLoop26: boundaryInventory.remainingBitsAfterLoop26,
            packetFinalReadCountRelation: boundaryInventory.packetFinalReadCountRelation,
            packetFinalReadCountDeltaBits: boundaryInventory.packetFinalReadCountDeltaBits,
            bitbufferReadsBeyondEndCanAdvanceWithoutThrowing: bitbufferBehavior.readsBeyondEndCanAdvanceWithoutThrowing,
            bufferBoundaryArtifactHypothesis: riskAssessment.bufferBoundaryArtifactHypothesis,
            parserBoundsCheckHypothesis: riskAssessment.parserBoundsCheckHypothesis,
            causalConclusion: 'not_determined'
        },
        reasons: passed
            ? [
                'Task 117 default and diagnostic failure evidence was reused without recovery',
                'packet 953 boundary inventory shows loop 26 ends with one bit remaining in entityData',
                'loop 27 index read crosses entityDataBitLength while loops 28-29 start beyond it',
                'synthetic BitBuffer probes show some read paths can advance beyond end without throwing',
                'Task 117 numbers matched exactly',
                'protection and replay-specific branch audits passed'
            ]
            : Object.entries(successConditions)
                .filter(([, value]) => !value)
                .map(([key]) => `condition failed: ${key}`)
    };
}

async function writeReport(summaryRoot, values) {
    const report = [
        '# Replay 010 Packet 953 Buffer Boundary Diagnosis',
        '',
        'Task 118 diagnosed whether loops 27-29 are valid post-loop26 entry reads or buffer-boundary artifacts. It did not add recovery, modify parser behavior, build a canonical package, or emit match facts.',
        '',
        '## Boundary Inventory',
        '',
        `- entityDataBitLength: ${values.boundaryInventory.entityDataBitLength}`,
        `- loop 26 after-action read count: ${values.boundaryInventory.loop26AfterActionReadCount}`,
        `- remaining bits after loop 26: ${values.boundaryInventory.remainingBitsAfterLoop26}`,
        `- packet final read count: ${values.boundaryInventory.packetFinalReadCount}`,
        `- packet final relation: ${values.boundaryInventory.packetFinalReadCountRelation}`,
        '',
        '## Loops 27-29',
        '',
        ...values.classification.classifications.map(row => `- loop ${row.loop}: ${row.classification}; remaining bits before index read: ${row.remainingBitsBeforeIndexRead}`),
        '',
        '## BitBuffer Behavior',
        '',
        `- reads beyond end can advance without throwing in synthetic probes: ${values.bitbufferBehavior.readsBeyondEndCanAdvanceWithoutThrowing}`,
        `- direct out-of-bounds reads can return zero in synthetic probes: ${values.bitbufferBehavior.directOutOfBoundsReadCanReturnZero}`,
        '',
        '## Conclusion',
        '',
        'Loop 27 begins with one remaining bit and crosses the entityData boundary; loops 28 and 29 begin beyond that boundary. Synthetic BitBuffer probes show some direct read paths can advance beyond buffer end without throwing and can produce zero-like results. This strengthens a buffer-boundary artifact and parser bounds-check hypothesis, but it remains a local diagnostic result, not a parser fix, Source 2 semantic conclusion, or replay corruption conclusion.',
        '',
        `Gate: ${values.gate.gate}`,
        ''
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-packet-953-buffer-boundary.md'), report);
    await writeFile(path.join(summaryRoot.absolutePath, 'README.md'), report);
}

async function run({ inputPath, replayId, localOutput, summaryOutput }) {
    const input = validateInputPath(inputPath, replayId);
    const roots = validateOutputRoots(localOutput, summaryOutput);
    await ensureDir(roots.local.absolutePath);
    await ensureDir(roots.summary.absolutePath);

    const inputIdentity = await buildInputIdentity(input);
    const targetPacketSummary = await readJson(`${TASK112_ROOT}target-packet-summary.json`);
    const task116Boundary = await readJson(`${TASK116_ROOT}payload-boundary-relation.json`);
    const task116Segment = await readJson(`${TASK116_ROOT}string-reader-segment-summary.json`);
    const task117DefaultPass = await readJson(`${TASK117_ROOT}default-pass-result.json`);
    const task117DiagnosticPass = await readJson(`${TASK117_ROOT}diagnostic-pass-result.json`);
    const payloadInventory = await readJson(`${TASK117_ROOT}packet-953-payload-inventory.json`);
    const payloadGate = await readJson(`${TASK117_ROOT}payload-iterator-gate.json`);
    const alignment = await readJson(`${TASK117_ROOT}alignment-model-comparison.json`);

    const defaultPassResult = buildPassReuseResult(task117DefaultPass, 'default_reused_from_task117');
    const diagnosticPassResult = buildPassReuseResult(task117DiagnosticPass, 'diagnostic_reused_from_task117_without_recovery');
    const boundaryInventory = buildPacket953BoundaryInventory(targetPacketSummary, task116Boundary, task116Segment);
    const bitbufferBehavior = await buildBitBufferBoundaryBehavior();
    const classification = buildLoopBoundaryClassification(boundaryInventory, bitbufferBehavior);
    const task117Comparison = buildTask117Comparison(boundaryInventory, bitbufferBehavior, classification, payloadInventory, payloadGate, alignment, task116Boundary, task116Segment);
    const riskAssessment = buildRiskAssessment({ boundaryInventory, bitbufferBehavior, classification, task117Comparison });
    const branchAudit = await buildReplaySpecificBranchAudit();
    const task119Exists = existsSync(path.join(REPO_ROOT, 'tasks/specs/119.json'))
        || existsSync(path.join(REPO_ROOT, 'tasks/completed/119-diagnose-packet-953-buffer-boundary.md'));
    const protectionAudit = buildProtectionAudit({ inputIdentity, roots, branchAudit, task119Exists });
    const gate = decideGate({
        defaultPassResult,
        diagnosticPassResult,
        boundaryInventory,
        bitbufferBehavior,
        classification,
        task117Comparison,
        riskAssessment,
        protectionAudit
    });

    const outputs = {
        'input-identity.json': inputIdentity,
        'default-pass-result.json': defaultPassResult,
        'diagnostic-pass-result.json': diagnosticPassResult,
        'packet-953-boundary-inventory.json': boundaryInventory,
        'bitbuffer-boundary-behavior.json': bitbufferBehavior,
        'loops-27-29-boundary-classification.json': classification,
        'task117-comparison.json': task117Comparison,
        'risk-assessment.json': riskAssessment,
        'protection-audit.json': protectionAudit,
        'replay-specific-branch-audit.json': branchAudit,
        'buffer-boundary-gate.json': gate
    };

    for (const [fileName, value] of Object.entries(outputs)) {
        await writeJson(path.join(roots.summary.absolutePath, fileName), value);
        await writeJson(path.join(roots.local.absolutePath, fileName), value);
    }
    await writeReport(roots.summary, { boundaryInventory, bitbufferBehavior, classification, gate });

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
