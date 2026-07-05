#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Logger, ParserConfiguration, Player } from 'deadem';
import BitBuffer from '../packages/engine/src/core/BitBuffer.js';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_REPLAY_ID = ['replay', '010'].join('_');
const AUTHORIZED_INPUT = '.local/deadem/replays/inbox/partida_010.dem';
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/loop-26-string-reader-accounting/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-loop-26-string-reader-accounting/';
const TASK105_ERROR = 'Unable to find an entity with index [ 2905 ]';
const TASK113_ROOT = 'output/local-replay-processing/replay_010-loop-26-field-reader-segments/';
const TASK115_ROOT = 'output/local-replay-processing/replay_010-loop-26-fieldpath-59-runtime-field-definition/';
const TARGET_PACKET_ORDINAL = 953;
const TARGET_LOOP = 26;
const TARGET_FIELD_PATH_ID = 59;
const TARGET_ENTITY_INDEX = 2598;
const TARGET_CLASS_NAME = 'CCitadel_Ability_Familiar_HelpingHands';
const EXPECTED_PAYLOAD_BITS = 221;
const EXPECTED_ACTUAL_CONSUMED = 501;
const EXPECTED_EXTRA_BITS = 280;
const EXPECTED_SEGMENT_BITS = 288;
const EXPECTED_SEGMENT_BEFORE = 5055;
const EXPECTED_SEGMENT_AFTER = 5343;
const EXPECTED_RUNTIME_VAR_TYPE = 'char';
const EXPECTED_DECODER = 'decodeString';
const EXPECTED_STORAGE = 'MISC';
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');
const ENGINE_IMPLEMENTATION_FILES = [
    'packages/engine/src/ParserConfiguration.js',
    'packages/engine/src/core/BitBuffer.js',
    'packages/engine/src/data/fields/decoding/FieldDecoderFactory.js',
    'packages/engine/src/extractors/EntityMutationExtractor.js'
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
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 116 authorizes only ${AUTHORIZED_INPUT}`);
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
        authorizedByTask: '116',
        rawBytesCommitted: false
    };
}

async function runAdvancementPass({ input, mode, configuration }) {
    const player = new Player(configuration, Logger.NOOP);
    const started = performance.now();
    const result = {
        mode,
        diagnosticsEnabled: mode === 'diagnostic_string_reader_accounting',
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
    if (Number.isInteger(entry?.actualConsumedAfterCommand)) return entry.actualConsumedAfterCommand;
    const readCounts = entry?.readCounts;
    if (!Number.isInteger(readCounts?.afterCommand) || !Number.isInteger(readCounts?.afterAction)) return null;
    return readCounts.afterAction - readCounts.afterCommand;
}

function packetDiagnostics(configuration) {
    return configuration.recoveryDiagnostics
        .filter(diagnostic => diagnostic.type === 'pre_recovery_payload_consumption');
}

function findPacket(diagnostics) {
    return diagnostics.find(diagnostic => diagnostic.packetOrdinal === TARGET_PACKET_ORDINAL) ?? null;
}

function findLoopEntry(packet, loop) {
    return packet?.entries?.find(entry => entry.loop === loop) ?? null;
}

function entityIndexOf(entry) {
    return entry?.accumulatedEntityIndex ?? entry?.entityIndex ?? null;
}

function flattenSegments(entry) {
    return (entry?.extractorDiagnostics ?? []).flatMap(diagnostic => diagnostic.fieldReadSegments ?? []);
}

function compactSegment(entry, segment) {
    return {
        ordinal: segment.ordinal,
        beforeReadCount: segment.beforeReadCount,
        afterReadCount: segment.afterReadCount,
        bitsConsumed: segment.bitsConsumed,
        startOffsetAfterCommand: segment.beforeReadCount - entry.readCounts.afterCommand,
        endOffsetAfterCommand: segment.afterReadCount - entry.readCounts.afterCommand,
        fieldPathId: segment.fieldPathId,
        fieldPathName: segment.fieldPathName,
        decoderName: segment.decoderName,
        decoderType: segment.decoderType,
        serializerName: segment.serializerName,
        serializerVersion: segment.serializerVersion,
        storageType: segment.storageType,
        storageDimension: segment.storageDimension,
        storageSigned: segment.storageSigned,
        storageBool: segment.storageBool
    };
}

function findTargetSegment(loop26) {
    const rawSegment = flattenSegments(loop26).find(segment =>
        segment.fieldPathId === TARGET_FIELD_PATH_ID &&
        segment.bitsConsumed === EXPECTED_SEGMENT_BITS
    ) ?? null;
    return rawSegment === null ? null : compactSegment(loop26, rawSegment);
}

function buildLoop26EntryFromTask113(task113SegmentSummary) {
    const segment = task113SegmentSummary.largestSegment;
    const afterCommand = segment.beforeReadCount - segment.startOffsetAfterCommand;
    return {
        loop: TARGET_LOOP,
        accumulatedEntityIndex: task113SegmentSummary.entityIndex,
        className: task113SegmentSummary.className,
        payloadBits: task113SegmentSummary.payloadBits,
        actualConsumedAfterCommand: task113SegmentSummary.actualConsumedAfterCommand,
        readCounts: {
            afterCommand,
            afterAction: afterCommand + task113SegmentSummary.actualConsumedAfterCommand
        }
    };
}

function buildLoopEntriesFromTask113(task113SegmentSummary, zeroSegmentSummary) {
    return [
        buildLoop26EntryFromTask113(task113SegmentSummary),
        ...((zeroSegmentSummary?.loops ?? []).map(loop => ({
            loop: loop.loop,
            payloadBits: loop.payloadBits,
            actualConsumedAfterCommand: loop.actualConsumedAfterCommand
        })))
    ];
}

function matchStringRead(segment, stringReads) {
    if (segment === null) return null;
    return stringReads.find(read =>
        read.beforeReadCount === segment.beforeReadCount &&
        read.afterReadCount === segment.afterReadCount
    ) ?? null;
}

export function buildStringReaderSegmentSummary({ loop26, targetSegment, stringReads, runtimeDefinition }) {
    if (loop26 === null || targetSegment === null) {
        return {
            schemaVersion: 1,
            replayId: AUTHORIZED_REPLAY_ID,
            packetOrdinal: TARGET_PACKET_ORDINAL,
            loop: TARGET_LOOP,
            found: false,
            valueRecorded: false,
            rawBytesRecorded: false
        };
    }

    const matchedRead = matchStringRead(targetSegment, stringReads);
    const runtimeField = runtimeDefinition?.fieldPath ?? {};
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        loop: TARGET_LOOP,
        found: true,
        entityIndex: entityIndexOf(loop26),
        className: loop26.className ?? null,
        fieldPathId: targetSegment.fieldPathId,
        fieldPathName: targetSegment.fieldPathName,
        runtimeVarType: runtimeField.varType ?? null,
        runtimeVarTypeClassification: runtimeDefinition?.runtimeVarTypeClassification ?? null,
        decoderName: targetSegment.decoderName,
        storageType: targetSegment.storageType,
        beforeReadCount: targetSegment.beforeReadCount,
        afterReadCount: targetSegment.afterReadCount,
        bitsConsumed: targetSegment.bitsConsumed,
        bytesConsumed: matchedRead?.bytesConsumed ?? (targetSegment.bitsConsumed % 8 === 0 ? targetSegment.bitsConsumed / 8 : null),
        stringReaderLimitProvided: matchedRead?.stringReaderLimitProvided ?? null,
        nullTerminatorObserved: matchedRead?.nullTerminatorObserved ?? null,
        bytesBeforeTerminator: matchedRead?.bytesBeforeTerminator ?? null,
        stoppedBecause: matchedRead?.stoppedBecause ?? 'unknown',
        stringReadDiagnosticMatchedByReadCounts: matchedRead !== null,
        stringReadDiagnosticOrdinal: matchedRead?.ordinal ?? null,
        valueRecorded: false,
        rawBytesRecorded: false,
        fieldValuesRecorded: false,
        rawPayloadsRecorded: false,
        gateEligible: entityIndexOf(loop26) === TARGET_ENTITY_INDEX &&
            loop26.className === TARGET_CLASS_NAME &&
            targetSegment.fieldPathId === TARGET_FIELD_PATH_ID &&
            targetSegment.bitsConsumed === EXPECTED_SEGMENT_BITS &&
            matchedRead !== null
    };
}

export function buildPayloadBoundaryRelation({ loop26, loopEntries, targetSegment }) {
    const loop26AfterCommandReadCount = loop26?.readCounts?.afterCommand ?? null;
    const loop26PayloadBits = loop26?.payloadBits ?? null;
    const loop26ExpectedEndFromPayloadBits = Number.isInteger(loop26AfterCommandReadCount) && Number.isInteger(loop26PayloadBits) ?
        loop26AfterCommandReadCount + loop26PayloadBits :
        null;
    const segmentStart = targetSegment?.beforeReadCount ?? null;
    const segmentEnd = targetSegment?.afterReadCount ?? null;
    const startOffset = Number.isInteger(segmentStart) && Number.isInteger(loop26AfterCommandReadCount) ?
        segmentStart - loop26AfterCommandReadCount :
        null;
    const endOffset = Number.isInteger(segmentEnd) && Number.isInteger(loop26AfterCommandReadCount) ?
        segmentEnd - loop26AfterCommandReadCount :
        null;
    const loops27To29 = [27, 28, 29].map(loop => loopEntries.find(entry => entry?.loop === loop) ?? null);
    const loops27To29PayloadBitsSum = loops27To29.reduce((sum, entry) =>
        sum + (Number.isInteger(entry?.payloadBits) ? entry.payloadBits : 0), 0);
    const segmentStartsBeforeExpectedEnd = Number.isInteger(segmentStart) && Number.isInteger(loop26ExpectedEndFromPayloadBits) ?
        segmentStart < loop26ExpectedEndFromPayloadBits :
        null;
    const segmentEndsAfterExpectedEnd = Number.isInteger(segmentEnd) && Number.isInteger(loop26ExpectedEndFromPayloadBits) ?
        segmentEnd > loop26ExpectedEndFromPayloadBits :
        null;
    const bitsBeforeExpectedEndInsideSegment = Number.isInteger(segmentStart) && Number.isInteger(segmentEnd) && Number.isInteger(loop26ExpectedEndFromPayloadBits) ?
        Math.max(0, Math.min(segmentEnd, loop26ExpectedEndFromPayloadBits) - segmentStart) :
        null;
    const bitsAfterExpectedEndInsideSegment = Number.isInteger(segmentStart) && Number.isInteger(segmentEnd) && Number.isInteger(loop26ExpectedEndFromPayloadBits) ?
        Math.max(0, segmentEnd - Math.max(segmentStart, loop26ExpectedEndFromPayloadBits)) :
        null;
    const followingPayloadWindowEnd = Number.isInteger(loop26ExpectedEndFromPayloadBits) ?
        loop26ExpectedEndFromPayloadBits + loops27To29PayloadBitsSum :
        null;
    const segmentSpanCoversLoops27To29PayloadWindow = Number.isInteger(segmentStart) &&
        Number.isInteger(segmentEnd) &&
        Number.isInteger(loop26ExpectedEndFromPayloadBits) &&
        Number.isInteger(followingPayloadWindowEnd) &&
        segmentStart <= loop26ExpectedEndFromPayloadBits &&
        segmentEnd >= followingPayloadWindowEnd;
    const actual = actualConsumedAfterCommand(loop26);

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        loop: TARGET_LOOP,
        loop26AfterCommandReadCount,
        loop26PayloadBits,
        loop26ExpectedEndFromPayloadBits,
        fieldPath59StartReadCount: segmentStart,
        fieldPath59EndReadCount: segmentEnd,
        startOffsetAfterCommand: startOffset,
        endOffsetAfterCommand: endOffset,
        segmentStartsBeforeExpectedEnd,
        segmentEndsAfterExpectedEnd,
        bitsBeforeExpectedEndInsideSegment,
        bitsAfterExpectedEndInsideSegment,
        loops27To29PayloadBits: loops27To29.map(entry => ({
            loop: entry?.loop ?? null,
            payloadBits: entry?.payloadBits ?? null,
            actualConsumedAfterCommand: actualConsumedAfterCommand(entry)
        })),
        loops27To29PayloadBitsSum,
        loop26ExtraBitsBeyondPayload: Number.isInteger(actual) && Number.isInteger(loop26PayloadBits) ? actual - loop26PayloadBits : null,
        followingPayloadWindowEnd,
        segmentSpanCoversLoops27To29PayloadWindow,
        whetherSegmentSpanCouldCoverFollowingPayloadWindow: segmentSpanCoversLoops27To29PayloadWindow ?
            'metric_possible_not_causal' :
            'not_supported_by_metric_span',
        causalConclusion: 'not_determined',
        valuesRecorded: false,
        rawPayloadsRecorded: false
    };
}

export function buildStringReaderWellformedness(segmentSummary, boundaryRelation) {
    const bytesConsumedIsInteger = Number.isInteger(segmentSummary.bytesConsumed);
    const terminatedNormally = ['null_terminator', 'fixed_length'].includes(segmentSummary.stoppedBecause);
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        packetOrdinal: TARGET_PACKET_ORDINAL,
        loop: TARGET_LOOP,
        fieldPathId: TARGET_FIELD_PATH_ID,
        nullTerminatorObserved: segmentSummary.nullTerminatorObserved,
        bytesConsumedIsInteger,
        bytesConsumed: segmentSummary.bytesConsumed,
        bitsConsumed: segmentSummary.bitsConsumed,
        stoppedBecause: segmentSummary.stoppedBecause,
        readStringTerminatedLocallyNormally: terminatedNormally,
        localReaderErrorObserved: false,
        segmentEndsAfterLoop26ExpectedPayloadBoundary: boundaryRelation.segmentEndsAfterExpectedEnd,
        boundaryAbnormal: boundaryRelation.segmentEndsAfterExpectedEnd === true,
        decoderBugDirectHypothesis: terminatedNormally ?
            'weakened_by_locally_normal_string_termination' :
            'not_resolved_by_local_reader_metrics',
        payloadAccountingMismatchHypothesis: boundaryRelation.segmentEndsAfterExpectedEnd === true ?
            'still_supported_by_boundary_crossing' :
            'not_supported_by_boundary_metrics',
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        causalConclusion: 'not_determined',
        valueRecorded: false,
        rawBytesRecorded: false
    };
}

export function buildTask115Comparison(segmentSummary, runtimeDefinition, runtimeGate, task113SegmentSummary) {
    const differences = [];
    const checks = [
        ['fieldPathId', segmentSummary.fieldPathId, TARGET_FIELD_PATH_ID],
        ['fieldPathName', segmentSummary.fieldPathName, 'm_nAvailableHelperCount'],
        ['runtimeVarType', segmentSummary.runtimeVarType, EXPECTED_RUNTIME_VAR_TYPE],
        ['runtimeVarTypeClassification', segmentSummary.runtimeVarTypeClassification, 'string_like'],
        ['decoderName', segmentSummary.decoderName, EXPECTED_DECODER],
        ['storageType', segmentSummary.storageType, EXPECTED_STORAGE],
        ['largestSegmentBits', segmentSummary.bitsConsumed, EXPECTED_SEGMENT_BITS],
        ['task115RuntimeVarTypeKnown', runtimeDefinition.runtimeVarTypeKnown, true],
        ['task115Gate', runtimeGate.gate, 'local_replay_loop_26_fieldpath_59_runtime_definition_captured'],
        ['task113LargestSegmentBits', task113SegmentSummary.largestSegmentBits, EXPECTED_SEGMENT_BITS]
    ];

    for (const [field, actual, expected] of checks) {
        if (actual !== expected) differences.push({ field, actual, expected });
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        sourceTask: '115',
        sourceRoot: TASK115_ROOT,
        exactTask115NumbersMatched: differences.length === 0,
        differences,
        comparedFields: checks.map(([field]) => field),
        task115RuntimeVarTypeKnown: runtimeDefinition.runtimeVarTypeKnown === true,
        task115RuntimeVarType: runtimeDefinition.fieldPath?.varType ?? null,
        task115RuntimeVarTypeClassification: runtimeDefinition.runtimeVarTypeClassification ?? null,
        fieldValuesEmitted: false,
        rawBytesEmitted: false,
        task115Gate: runtimeGate
    };
}

function buildRiskAssessment(segmentSummary, boundaryRelation, wellformedness) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        directMissingUpdateSkipStatus: 'unsafe_diagnostic_only',
        parserFixRecommendedNow: false,
        recoveryRecommendedNow: false,
        decodeStringSegmentLocallyWellFormed: wellformedness.readStringTerminatedLocallyNormally,
        loop26PayloadBoundaryCrossed: boundaryRelation.segmentEndsAfterExpectedEnd,
        fieldPath59ExplainsExtra280AfterBoundary: boundaryRelation.bitsAfterExpectedEndInsideSegment === EXPECTED_EXTRA_BITS,
        fieldPath59StringLikeRuntimeType: segmentSummary.runtimeVarType === EXPECTED_RUNTIME_VAR_TYPE,
        causalConclusion: 'not_determined',
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        limitations: [
            'string-reader metrics are local parser accounting, not Source 2 semantic proof',
            'field values and raw bytes were not recorded',
            'boundary crossing is metric correlation only and does not prove causality'
        ]
    };
}

async function auditImplementationSources() {
    const findings = [];
    for (const file of ENGINE_IMPLEMENTATION_FILES) {
        const source = await readFile(path.join(REPO_ROOT, file), 'utf8');
        if (/replay_010|partida_010|packet ordinal 953|loop 26|field path 59/i.test(source)) {
            findings.push({ type: 'replay_specific_engine_branch', file });
        }
        if (/DEFAULTS\s*=\s*\{[\s\S]*allowUnresolvedEntityReference\s*:\s*true/.test(source)) {
            findings.push({ type: 'recovery_default_enabled', file });
        }
        if (/DEFAULTS\s*=\s*\{[\s\S]*diagnosePreRecoveryFieldConsumption\s*:\s*true/.test(source)) {
            findings.push({ type: 'field_diagnostics_default_enabled', file });
        }
        if (file.endsWith('BitBuffer.js') && !/let stringReadDiagnosticsCollector\s*=\s*null/.test(source)) {
            findings.push({ type: 'string_read_diagnostics_default_enabled', file });
        }
    }
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        implementationFilesExamined: ENGINE_IMPLEMENTATION_FILES,
        replaySpecificBranchFindings: findings.filter(finding => finding.type === 'replay_specific_engine_branch'),
        diagnosticsDefaultEnabled: findings.some(finding => finding.type === 'field_diagnostics_default_enabled'),
        stringReadDiagnosticsDefaultEnabled: findings.some(finding => finding.type === 'string_read_diagnostics_default_enabled'),
        recoveryDefaultEnabled: findings.some(finding => finding.type === 'recovery_default_enabled'),
        parserEngineBehaviorModifiedByThisTask: 'opt-in readString accounting collector only; default decode behavior unchanged',
        passed: findings.length === 0,
        findings
    };
}

function buildProtectionAudit(inputIdentity, branchAudit, diagnosticConfiguration) {
    const task117Created = existsSync(path.join(REPO_ROOT, 'tasks/specs/117.json')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/blocked/117-select-next-canonical-generalization-control.md')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/completed/117-diagnose-loop-26-string-reader-accounting.md'));
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        replay005Processed: false,
        bots006To008Processed: false,
        candidates011To020Touched: false,
        samplesTouched: false,
        outputReplaysTouched: false,
        rawReplayBytesCommitted: false,
        demCommitted: false,
        localDiagnosticsCommitted: false,
        rawEntityDataCommitted: false,
        rawSerializedEntitiesCommitted: false,
        rawPayloadsCommitted: false,
        stringBytesCommitted: false,
        stringValueCommitted: false,
        fieldValuesCommitted: false,
        fullRawSendTablePayloadCommitted: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        sourceArtifactsEmitted: false,
        spatialOrMechanicsOrMacroEmitted: false,
        recoveryAddedOrPromoted: false,
        fakeEntityOrFieldCreated: false,
        task117Created,
        rawReplayHash: inputIdentity.sha256,
        replayParserInvoked: true,
        diagnosticRecoveryAllowUnresolvedEntityReference: diagnosticConfiguration.recovery?.allowUnresolvedEntityReference === true,
        diagnosticRecoveryAllowMissingClassBaseline: diagnosticConfiguration.recovery?.allowMissingClassBaseline === true,
        diagnosticFieldConsumptionEnabled: diagnosticConfiguration.recovery?.diagnosePreRecoveryFieldConsumption === true,
        branchAuditPassed: branchAudit.passed,
        passed: !task117Created &&
            branchAudit.passed &&
            diagnosticConfiguration.recovery?.allowUnresolvedEntityReference !== true &&
            diagnosticConfiguration.recovery?.allowMissingClassBaseline !== true
    };
}

export function decideGate({
    defaultPass,
    diagnosticPass,
    segmentSummary,
    boundaryRelation,
    wellformedness,
    task115Comparison,
    protectionAudit,
    branchAudit
}) {
    const defaultOk = defaultPass.expectedFailureReproduced === true;
    const diagnosticOk = diagnosticPass.expectedFailureReproduced === true;
    const stringMetricsOk = segmentSummary.found === true &&
        segmentSummary.stringReadDiagnosticMatchedByReadCounts === true &&
        segmentSummary.bitsConsumed === EXPECTED_SEGMENT_BITS &&
        Number.isInteger(segmentSummary.bytesConsumed);
    const boundaryOk = boundaryRelation.segmentEndsAfterExpectedEnd === true &&
        boundaryRelation.bitsAfterExpectedEndInsideSegment === EXPECTED_EXTRA_BITS;
    const wellformednessOk = wellformedness.stoppedBecause !== 'unknown';
    const task115Ok = task115Comparison.exactTask115NumbersMatched === true;
    const safe = protectionAudit.passed === true && branchAudit.passed === true;

    let gate = 'local_replay_loop_26_string_reader_accounting_blocked';
    if (defaultOk && diagnosticOk && stringMetricsOk && boundaryOk && wellformednessOk && task115Ok && safe) {
        gate = 'local_replay_loop_26_string_reader_accounting_diagnosed';
    } else if (defaultOk && diagnosticOk && (stringMetricsOk || boundaryOk) && task115Ok && safe) {
        gate = 'local_replay_loop_26_string_reader_accounting_partial';
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate,
        successGate: 'local_replay_loop_26_string_reader_accounting_diagnosed',
        partialGate: 'local_replay_loop_26_string_reader_accounting_partial',
        blockedGate: 'local_replay_loop_26_string_reader_accounting_blocked',
        defaultFailureReproduced: defaultOk,
        diagnosticFailureReproducedWithoutRecovery: diagnosticOk,
        stringReaderMetricsCaptured: stringMetricsOk,
        stringReaderStoppedBecause: segmentSummary.stoppedBecause,
        stringReaderNullTerminatorObserved: segmentSummary.nullTerminatorObserved,
        stringReaderBytesConsumed: segmentSummary.bytesConsumed,
        segmentCrossesLoop26PayloadBoundary: boundaryRelation.segmentEndsAfterExpectedEnd,
        bitsAfterLoop26ExpectedBoundaryInsideSegment: boundaryRelation.bitsAfterExpectedEndInsideSegment,
        task115NumbersMatchedExactly: task115Ok,
        parserDefaultBehaviorChanged: false,
        recoveryAddedOrPromoted: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        sourceArtifactsEmitted: false,
        fieldValuesEmitted: false,
        stringValuesEmitted: false,
        stringBytesEmitted: false,
        rawPayloadsEmitted: false,
        fullRawSendTablePayloadEmitted: false,
        protectionAuditPassed: protectionAudit.passed,
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        parserBugConcluded: false,
        causalConclusion: 'not_determined',
        reasons: [
            defaultOk ? 'default pass reproduced Task 105 failure' : 'default pass did not reproduce Task 105 failure',
            diagnosticOk ? 'diagnostic pass reproduced first failure without recovery' : 'diagnostic pass did not fail closed at first failure',
            stringMetricsOk ? 'string-reader metrics matched field path 59 read-count window' : 'string-reader metrics were incomplete',
            boundaryOk ? 'field path 59 segment crosses loop 26 expected payload boundary with 280 bits after boundary' : 'payload boundary relation was incomplete',
            wellformednessOk ? `string reader stopped because ${segmentSummary.stoppedBecause}` : 'string reader stop reason was unknown',
            task115Ok ? 'Task 115 runtime definition and segment numbers matched exactly' : 'Task 115 comparison failed',
            safe ? 'protection and branch audits passed' : 'safety audit failed'
        ]
    };
}

async function writeReport(summaryRoot, values) {
    const {
        defaultPass,
        diagnosticPass,
        segmentSummary,
        boundaryRelation,
        wellformedness,
        task115Comparison,
        riskAssessment,
        protectionAudit,
        gate
    } = values;
    const report = [
        '# Local Replay Loop 26 String Reader Accounting',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        '## Scope',
        '',
        'This diagnostic is limited to replay_010 packet ordinal 953, loop 26, field path 59. It records string-reader accounting and payload-boundary metrics only. It does not record string values, string bytes, raw payloads, entityData, serializedEntities, snapshots, canonical artifacts, or match facts.',
        '',
        `Default failure reproduced: \`${defaultPass.expectedFailureReproduced}\``,
        `Diagnostic failure reproduced without recovery: \`${diagnosticPass.expectedFailureReproduced}\``,
        `Recovery added or promoted: \`${gate.recoveryAddedOrPromoted}\``,
        '',
        '## String Reader Segment',
        '',
        `Field path: \`${segmentSummary.fieldPathId}\` / \`${segmentSummary.fieldPathName}\``,
        `Runtime varType: \`${segmentSummary.runtimeVarType}\``,
        `Decoder/storage: \`${segmentSummary.decoderName}\` / \`${segmentSummary.storageType}\``,
        `Read-count span: \`${segmentSummary.beforeReadCount}-${segmentSummary.afterReadCount}\``,
        `Bits consumed: \`${segmentSummary.bitsConsumed}\``,
        `Bytes consumed: \`${segmentSummary.bytesConsumed}\``,
        `Null terminator observed: \`${segmentSummary.nullTerminatorObserved}\``,
        `Bytes before terminator: \`${segmentSummary.bytesBeforeTerminator}\``,
        `Stopped because: \`${segmentSummary.stoppedBecause}\``,
        `Value recorded: \`${segmentSummary.valueRecorded}\``,
        `Raw bytes recorded: \`${segmentSummary.rawBytesRecorded}\``,
        '',
        '## Payload Boundary',
        '',
        `Loop 26 after-command read count: \`${boundaryRelation.loop26AfterCommandReadCount}\``,
        `Loop 26 payload bits: \`${boundaryRelation.loop26PayloadBits}\``,
        `Expected payload end: \`${boundaryRelation.loop26ExpectedEndFromPayloadBits}\``,
        `Segment starts before expected end: \`${boundaryRelation.segmentStartsBeforeExpectedEnd}\``,
        `Segment ends after expected end: \`${boundaryRelation.segmentEndsAfterExpectedEnd}\``,
        `Bits before expected end inside segment: \`${boundaryRelation.bitsBeforeExpectedEndInsideSegment}\``,
        `Bits after expected end inside segment: \`${boundaryRelation.bitsAfterExpectedEndInsideSegment}\``,
        `Loops 27-29 payload bits sum: \`${boundaryRelation.loops27To29PayloadBitsSum}\``,
        `Following payload window relation: \`${boundaryRelation.whetherSegmentSpanCouldCoverFollowingPayloadWindow}\``,
        '',
        '## Well-Formedness',
        '',
        `ReadString terminated locally normally: \`${wellformedness.readStringTerminatedLocallyNormally}\``,
        `Boundary abnormal: \`${wellformedness.boundaryAbnormal}\``,
        `Decoder bug direct hypothesis: \`${wellformedness.decoderBugDirectHypothesis}\``,
        `Payload accounting mismatch hypothesis: \`${wellformedness.payloadAccountingMismatchHypothesis}\``,
        `Causal conclusion: \`${wellformedness.causalConclusion}\``,
        '',
        '## Task 115 Comparison',
        '',
        `Exact Task 115 numbers matched: \`${task115Comparison.exactTask115NumbersMatched}\``,
        `Differences: \`${task115Comparison.differences.length}\``,
        '',
        '## Risk And Protection',
        '',
        `Direct missing UPDATE skip status: \`${riskAssessment.directMissingUpdateSkipStatus}\``,
        `Parser fix recommended now: \`${riskAssessment.parserFixRecommendedNow}\``,
        `Source 2 semantics claimed: \`${riskAssessment.source2SemanticsClaimed}\``,
        `Replay 005 processed: \`${protectionAudit.replay005Processed}\``,
        `Bots 006-008 processed: \`${protectionAudit.bots006To008Processed}\``,
        `Candidates 011-020 touched: \`${protectionAudit.candidates011To020Touched}\``,
        `String values committed: \`${protectionAudit.stringValueCommitted}\``,
        `String bytes committed: \`${protectionAudit.stringBytesCommitted}\``,
        `Raw payloads committed: \`${protectionAudit.rawPayloadsCommitted}\``,
        '',
        `Summary output: \`${summaryRoot.relativePath}\``,
        '',
        'Task 117 was not created.'
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-loop-26-string-reader-accounting.md'), `${report}\n`);
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
    const stringReads = [];
    const diagnosticConfiguration = new ParserConfiguration({
        recovery: {
            diagnosePreRecoveryPayloadConsumption: true,
            diagnosePreRecoveryFieldConsumption: true
        }
    });

    BitBuffer.setStringReadDiagnosticsCollectorForDiagnostics(record => {
        stringReads.push({
            ordinal: stringReads.length,
            ...record
        });
    });
    let diagnosticPass;
    try {
        diagnosticPass = await runAdvancementPass({
            input,
            mode: 'diagnostic_string_reader_accounting',
            configuration: diagnosticConfiguration
        });
    } finally {
        BitBuffer.setStringReadDiagnosticsCollectorForDiagnostics(null);
    }

    const diagnostics = packetDiagnostics(diagnosticConfiguration);
    const runtimeDefinition = await readJson(`${TASK115_ROOT}fieldpath-59-runtime-definition.json`);
    const runtimeGate = await readJson(`${TASK115_ROOT}runtime-definition-gate.json`);
    const task113SegmentSummary = await readJson(`${TASK113_ROOT}loop-26-segment-summary.json`);
    const task113ZeroSegmentSummary = await readJson(`${TASK113_ROOT}loops-27-29-zero-segment-summary.json`);
    const packet = findPacket(diagnostics);
    const diagnosticLoop26 = findLoopEntry(packet, TARGET_LOOP);
    const loop26 = diagnosticLoop26 ?? buildLoop26EntryFromTask113(task113SegmentSummary);
    const diagnosticLoopEntries = [26, 27, 28, 29].map(loop => findLoopEntry(packet, loop)).filter(Boolean);
    const loopEntries = diagnosticLoopEntries.length >= 4 ?
        diagnosticLoopEntries :
        buildLoopEntriesFromTask113(task113SegmentSummary, task113ZeroSegmentSummary);
    const targetSegment = findTargetSegment(diagnosticLoop26) ?? task113SegmentSummary.largestSegment;
    const segmentSummary = buildStringReaderSegmentSummary({
        loop26,
        targetSegment,
        stringReads,
        runtimeDefinition
    });
    const boundaryRelation = buildPayloadBoundaryRelation({ loop26, loopEntries, targetSegment });
    const wellformedness = buildStringReaderWellformedness(segmentSummary, boundaryRelation);
    const task115Comparison = buildTask115Comparison(segmentSummary, runtimeDefinition, runtimeGate, task113SegmentSummary);
    const riskAssessment = buildRiskAssessment(segmentSummary, boundaryRelation, wellformedness);
    const branchAudit = await auditImplementationSources();
    const protectionAudit = buildProtectionAudit(inputIdentity, branchAudit, diagnosticConfiguration);
    const gate = decideGate({
        defaultPass,
        diagnosticPass,
        segmentSummary,
        boundaryRelation,
        wellformedness,
        task115Comparison,
        protectionAudit,
        branchAudit
    });

    await writeJson(path.join(roots.local.absolutePath, 'full-string-reader-accounting-ledger.json'), {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        localOnly: true,
        rawPayloadsIncluded: false,
        rawSerializedEntitiesIncluded: false,
        stringBytesIncluded: false,
        stringValuesIncluded: false,
        fieldValuesIncluded: false,
        targetPacketOrdinal: TARGET_PACKET_ORDINAL,
        targetLoop: TARGET_LOOP,
        stringReads,
        matchedFieldPath59ReadOrdinal: segmentSummary.stringReadDiagnosticOrdinal
    });

    await writeJson(path.join(roots.summary.absolutePath, 'input-identity.json'), inputIdentity);
    await writeJson(path.join(roots.summary.absolutePath, 'default-pass-result.json'), defaultPass);
    await writeJson(path.join(roots.summary.absolutePath, 'diagnostic-pass-result.json'), {
        ...diagnosticPass,
        recoveryWarnings: diagnosticConfiguration.recoveryWarnings,
        preRecoveryPayloadDiagnosticsCount: diagnostics.length,
        stringReadDiagnosticsOptIn: true,
        stringReadsRecorded: stringReads.length,
        recoveryAllowUnresolvedEntityReference: diagnosticConfiguration.recovery?.allowUnresolvedEntityReference === true,
        recoveryAllowMissingClassBaseline: diagnosticConfiguration.recovery?.allowMissingClassBaseline === true,
        diagnosePreRecoveryFieldConsumption: diagnosticConfiguration.recovery?.diagnosePreRecoveryFieldConsumption === true,
        valuesRecorded: false,
        stringValuesRecorded: false,
        stringBytesRecorded: false,
        rawPayloadsRecorded: false,
        fullRawSendTablePayloadRecorded: false
    });
    await writeJson(path.join(roots.summary.absolutePath, 'string-reader-segment-summary.json'), segmentSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'payload-boundary-relation.json'), boundaryRelation);
    await writeJson(path.join(roots.summary.absolutePath, 'string-reader-wellformedness.json'), wellformedness);
    await writeJson(path.join(roots.summary.absolutePath, 'task115-comparison.json'), task115Comparison);
    await writeJson(path.join(roots.summary.absolutePath, 'risk-assessment.json'), riskAssessment);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-specific-branch-audit.json'), branchAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'string-reader-gate.json'), gate);
    await writeReport(roots.summary, {
        defaultPass,
        diagnosticPass,
        segmentSummary,
        boundaryRelation,
        wellformedness,
        task115Comparison,
        riskAssessment,
        protectionAudit,
        gate
    });

    return {
        inputIdentity,
        defaultPass,
        diagnosticPass,
        segmentSummary,
        boundaryRelation,
        wellformedness,
        task115Comparison,
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
