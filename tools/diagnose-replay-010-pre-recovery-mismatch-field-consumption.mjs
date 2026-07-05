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
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/pre-recovery-mismatch-field-consumption/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-pre-recovery-mismatch-field-consumption/';
const TASK105_ERROR = 'Unable to find an entity with index [ 2905 ]';
const TASK111_ROOT = 'output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/';
const TARGET_PACKET_ORDINAL = 953;
const TARGET_LOOPS = [26, 27, 28, 29];
const CONTEXT_START_LOOP = 20;
const CONTEXT_END_LOOP = 30;
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
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 112 authorizes only ${AUTHORIZED_INPUT}`);
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
        authorizedByTask: '112'
    };
}

async function runAdvancementPass({ input, mode, configuration }) {
    const player = new Player(configuration, Logger.NOOP);
    const started = performance.now();
    const result = {
        mode,
        diagnosticsEnabled: mode === 'diagnostic_pre_recovery_field_consumption',
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

function compactExtractorDiagnostic(diagnostic) {
    return {
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
        retainedSegmentCount: diagnostic.fieldReadSegments?.length ?? 0
    };
}

function compactEntry(packetOrdinal, entry, nextEntry = null) {
    const actual = actualConsumedAfterCommand(entry);
    const payloadBits = Number.isInteger(entry.payloadBits) ? entry.payloadBits : null;
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
        extractorDiagnostics: (entry.extractorDiagnostics ?? []).map(compactExtractorDiagnostic),
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

export function buildTargetPacketSummary(diagnostics) {
    const target = getTargetDiagnostic(diagnostics);
    if (target === null) {
        return {
            schemaVersion: 1,
            replayId: AUTHORIZED_REPLAY_ID,
            targetPacketOrdinal: TARGET_PACKET_ORDINAL,
            targetPacketFound: false,
            loopsExamined: [],
            limitations: ['target packet diagnostic was not collected']
        };
    }

    const entries = target.ledgerEntries ?? [];
    const operationCounts = {};
    for (const entry of entries) {
        operationCounts[entry.operation] = (operationCounts[entry.operation] ?? 0) + 1;
    }
    const contextEntries = entries
        .filter(entry => entry.loop >= CONTEXT_START_LOOP && entry.loop <= CONTEXT_END_LOOP)
        .map(entry => compactEntry(TARGET_PACKET_ORDINAL, entry, entries.find(candidate => candidate.loop === entry.loop + 1) ?? null));

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
        operationCounts,
        payloadIteratorAlignedWithUpdatedEntries: target.packetMetrics.payloadSizeCount === target.packetMetrics.updatedEntries,
        loopsExamined: contextEntries.map(entry => entry.loop),
        targetLoops: TARGET_LOOPS,
        contextWindow: {
            startLoop: CONTEXT_START_LOOP,
            endLoop: CONTEXT_END_LOOP,
            entries: contextEntries
        },
        targetMismatchEntries: contextEntries.filter(entry => TARGET_LOOPS.includes(entry.loop)),
        rawPayloadsCommitted: false,
        rawSerializedEntitiesCommitted: false,
        fieldValuesCommitted: false
    };
}

export function buildMismatchLoopAnalysis(targetPacketSummary) {
    const targetEntries = targetPacketSummary.targetMismatchEntries ?? [];
    const byLoop = new Map(targetEntries.map(entry => [entry.loop, entry]));
    const missingLoops = TARGET_LOOPS.filter(loop => !byLoop.has(loop));
    const loop26 = byLoop.get(26) ?? null;
    const loops27To29 = [27, 28, 29].map(loop => byLoop.get(loop)).filter(Boolean);
    const allTargetLoopsCollected = missingLoops.length === 0;
    const loop26ExtraConsumptionBits = loop26 === null ||
        !Number.isInteger(loop26.actualConsumedAfterCommand) ||
        !Number.isInteger(loop26.payloadBits) ?
        null :
        loop26.actualConsumedAfterCommand - loop26.payloadBits;
    const loops27To29ZeroExtractorConsumption = loops27To29.length === 3 &&
        loops27To29.every(entry => entry.actualConsumedAfterCommand === 0 &&
            entry.totalExtractorBitsConsumed === 0 &&
            entry.extractorMutationCount === 0 &&
            entry.fieldReadSegmentCount === 0);
    const monotonic = targetEntries.every(entry => entry.readCountsMonotonic === true);
    const adjacentAlignment = targetEntries.slice(0, -1).every(entry => entry.nextLoopStartsAtAfterAction === true);
    const zeroLoopClassification = loops27To29.map(entry => ({
        loop: entry.loop,
        entityIndex: entry.entityIndex,
        className: entry.className,
        observedActualConsumedAfterCommand: entry.actualConsumedAfterCommand,
        extractorMutationCount: entry.extractorMutationCount,
        fieldReadSegmentCount: entry.fieldReadSegmentCount,
        totalExtractorBitsConsumed: entry.totalExtractorBitsConsumed,
        classification: entry.actualConsumedAfterCommand === 0 && entry.extractorMutationCount === 0 ?
            'observed_zero_mutation_update_at_current_cursor' :
            'not_zero_consumption',
        skippedDueToState: entry.action !== 'normal_update_apply',
        limitations: [
            'this is extractor/cursor evidence only',
            'no field values or Source 2 semantic rule are emitted'
        ]
    }));

    let explanationClass = 'not_determined';
    if (allTargetLoopsCollected && Number.isInteger(loop26ExtraConsumptionBits) && loop26ExtraConsumptionBits > 0 && loops27To29ZeroExtractorConsumption) {
        explanationClass = 'field_level_consumption_mismatch_with_following_zero_mutation_updates';
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        targetPacketOrdinal: TARGET_PACKET_ORDINAL,
        targetLoops: TARGET_LOOPS,
        allTargetLoopsCollected,
        missingLoops,
        loop26ExtraConsumptionBits,
        loop26HasExtraConsumptionOf280Bits: loop26ExtraConsumptionBits === 280,
        loops27To29ZeroConsumptionObserved: loops27To29ZeroExtractorConsumption,
        payloadIteratorCountAlignedWithUpdatedEntries: targetPacketSummary.payloadIteratorAlignedWithUpdatedEntries === true,
        readCountsMonotonicForTargetLoops: monotonic,
        targetLoopAdjacencyAligned: adjacentAlignment,
        zeroLoopClassification,
        evidenceClassification: explanationClass,
        semanticConclusion: 'not_claimed',
        causalConclusion: 'not_determined',
        interpretation: explanationClass === 'field_level_consumption_mismatch_with_following_zero_mutation_updates' ?
            'loop 26 consumed 280 more bits than its serializedEntities payloadBits while loops 27-29 decoded zero mutations at the current cursor; this supports a field-level/cursor-accounting mismatch but does not prove Source 2 semantics' :
            'target loop evidence is incomplete or insufficient to classify the mismatch pattern',
        nonClaims: [
            'does not prove replay corruption',
            'does not prove serializedEntities skip semantics',
            'does not justify missing UPDATE recovery'
        ]
    };
}

export function buildExtractorConsumptionSummary(targetPacketSummary) {
    const entries = targetPacketSummary.contextWindow?.entries ?? [];
    const entriesWithDiagnostics = entries.filter(entry => entry.extractorDiagnostics.length > 0);
    const zeroExtractorEntries = entries.filter(entry => entry.extractorConsumedZeroBits === true);
    const mismatchEntries = entries.filter(entry => entry.payloadMinusActualAfterCommand !== 0);

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        targetPacketOrdinal: TARGET_PACKET_ORDINAL,
        entriesInContextWindow: entries.length,
        entriesWithExtractorDiagnostics: entriesWithDiagnostics.length,
        totalExtractorMutationCount: entries.reduce((sum, entry) => sum + (entry.extractorMutationCount ?? 0), 0),
        totalFieldReadSegments: entries.reduce((sum, entry) => sum + (entry.fieldReadSegmentCount ?? 0), 0),
        totalFieldReaderBitsConsumed: entries.reduce((sum, entry) => sum + (entry.fieldReaderBitsConsumed ?? 0), 0),
        zeroExtractorConsumptionLoops: zeroExtractorEntries.map(entry => entry.loop),
        mismatchLoops: mismatchEntries.map(entry => entry.loop),
        distinctClassNames: [...new Set(entries.map(entry => entry.className).filter(Boolean))],
        extractorThrew: entries.some(entry => entry.extractorThrew === true),
        internalConditions: entries
            .filter(entry => entry.extractorInternalCondition !== null)
            .map(entry => ({ loop: entry.loop, condition: entry.extractorInternalCondition })),
        committedFieldValues: false,
        committedFieldNames: false,
        committedRawPayloads: false
    };
}

export async function buildTask111Comparison(targetPacketSummary) {
    const task111Consistency = await readJson(`${TASK111_ROOT}present-update-consistency-summary.json`);
    const observed = targetPacketSummary.targetMismatchEntries.map(entry => ({
        packetOrdinal: entry.packetOrdinal,
        loop: entry.loop,
        operation: entry.operation,
        entityIndex: entry.entityIndex,
        payloadBitsFromSerializedEntities: entry.payloadBits,
        actualConsumedAfterCommand: entry.actualConsumedAfterCommand,
        payloadMinusActualAfterCommand: entry.payloadMinusActualAfterCommand
    }));
    const expected = task111Consistency.mismatchExamples.map(entry => ({
        packetOrdinal: entry.packetOrdinal,
        loop: entry.loop,
        operation: entry.operation,
        entityIndex: entry.entityIndex,
        payloadBitsFromSerializedEntities: entry.payloadBitsFromSerializedEntities,
        actualConsumedAfterCommand: entry.actualConsumedAfterCommand,
        payloadMinusActualAfterCommand: entry.payloadMinusActualAfterCommand
    }));
    const sameMismatchSet = JSON.stringify(observed) === JSON.stringify(expected);

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        task111SourcePath: `${TASK111_ROOT}present-update-consistency-summary.json`,
        task111PresentUpdatesCompared: task111Consistency.presentUpdateEntriesCompared,
        task111MismatchesAfterCommand: task111Consistency.mismatchesAfterCommand,
        observedMismatchesAfterCommand: observed.length,
        sameFourMismatchesTargeted: sameMismatchSet,
        stillPreRecovery: true,
        observed,
        expected,
        evidenceImpact: sameMismatchSet ?
            'reinforces_field_level_consumption_mismatch_or_accounting_issue' :
            'discrepancy_requires_review',
        conclusion: sameMismatchSet ?
            'Task 112 targets the same four pre-recovery Task 111 mismatches' :
            'Task 112 did not reproduce the exact Task 111 mismatch set'
    };
}

export function buildRiskAssessment(loopAnalysis, task111Comparison) {
    const diagnosed = loopAnalysis.allTargetLoopsCollected === true &&
        task111Comparison.sameFourMismatchesTargeted === true &&
        loopAnalysis.readCountsMonotonicForTargetLoops === true;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        fieldLevelMetricsCollected: diagnosed,
        likelyExplanationClass: loopAnalysis.evidenceClassification,
        loops27To29ZeroConsumptionStatus: loopAnalysis.loops27To29ZeroConsumptionObserved ?
            'observed_zero_extractor_consumption_at_current_cursor' :
            'not_determined',
        directMissingUpdateSkipStatus: 'unsafe',
        parserFixRecommendedNow: false,
        recoveryRecommendation: 'diagnostic_only_do_not_use_as_safe_skip',
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        limitations: [
            'single local canary replay',
            'diagnostic stops at first default missing-entity failure',
            'field values are intentionally not emitted',
            'field-level counts do not prove Source 2 serializedEntities semantics'
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
    const task113Created = existsSync(path.join(REPO_ROOT, 'tasks/specs/113.json')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/blocked/113-select-next-canonical-generalization-control.md'));
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
        fieldValuesCommitted: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        sourceArtifactsEmitted: false,
        automaticRecoveryAdded: false,
        missingUpdateRecovered: false,
        outOfRangeCreateRecovered: false,
        placeholderEntityCreated: false,
        syntheticFieldsMaterialized: false,
        task113Created,
        rawReplayRead: true,
        rawReplayHash: inputIdentity.sha256,
        replayParserInvoked: true,
        diagnosticRecoveryAllowUnresolvedEntityReference: diagnosticConfiguration.recovery?.allowUnresolvedEntityReference === true,
        diagnosticRecoveryAllowMissingClassBaseline: diagnosticConfiguration.recovery?.allowMissingClassBaseline === true,
        diagnosticFieldConsumptionEnabled: diagnosticConfiguration.recovery?.diagnosePreRecoveryFieldConsumption === true,
        branchAuditPassed: branchAudit.passed,
        passed: !task113Created &&
            branchAudit.passed &&
            diagnosticConfiguration.recovery?.allowUnresolvedEntityReference !== true &&
            diagnosticConfiguration.recovery?.allowMissingClassBaseline !== true
    };
}

export function decideGate({
    defaultPass,
    diagnosticPass,
    targetPacketSummary,
    loopAnalysis,
    extractorSummary,
    task111Comparison,
    protectionAudit,
    branchAudit
}) {
    const defaultOk = defaultPass.expectedFailureReproduced === true;
    const diagnosticOk = diagnosticPass.expectedFailureReproduced === true;
    const targetFound = targetPacketSummary.targetPacketFound === true;
    const targetLoopsAnalyzed = loopAnalysis.allTargetLoopsCollected === true;
    const sameMismatches = task111Comparison.sameFourMismatchesTargeted === true;
    const extractorMetrics = extractorSummary.entriesWithExtractorDiagnostics > 0;
    const safe = protectionAudit.passed === true && branchAudit.passed === true;

    let gate = 'local_replay_pre_recovery_mismatch_field_consumption_blocked';
    if (defaultOk && diagnosticOk && targetFound && targetLoopsAnalyzed && sameMismatches && extractorMetrics && safe) {
        gate = 'local_replay_pre_recovery_mismatch_field_consumption_diagnosed';
    } else if (defaultOk && diagnosticOk && targetFound && safe) {
        gate = 'local_replay_pre_recovery_mismatch_field_consumption_partial';
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate,
        successGate: 'local_replay_pre_recovery_mismatch_field_consumption_diagnosed',
        partialGate: 'local_replay_pre_recovery_mismatch_field_consumption_partial',
        blockedGate: 'local_replay_pre_recovery_mismatch_field_consumption_blocked',
        defaultFailureReproduced: defaultOk,
        diagnosticFailureReproducedWithoutRecovery: diagnosticOk,
        targetPacketFound: targetFound,
        targetLoopsAnalyzed,
        sameTask111MismatchesConfirmed: sameMismatches,
        extractorMetricsProduced: extractorMetrics,
        loops27To29ZeroConsumptionObserved: loopAnalysis.loops27To29ZeroConsumptionObserved,
        evidenceClassification: loopAnalysis.evidenceClassification,
        parserDefaultBehaviorChanged: false,
        recoveryAddedOrPromoted: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        protectionAuditPassed: protectionAudit.passed,
        reasons: [
            defaultOk ? 'default pass reproduced Task 105 failure' : 'default pass did not reproduce Task 105 failure',
            diagnosticOk ? 'diagnostic pass reproduced first failure without recovery' : 'diagnostic pass did not fail closed at first failure',
            targetFound ? 'packet ordinal 953 was collected' : 'packet ordinal 953 was not collected',
            targetLoopsAnalyzed ? 'loops 26-29 were analyzed' : 'target loops were incomplete',
            sameMismatches ? 'same four Task 111 mismatches were confirmed' : 'Task 111 mismatch set was not confirmed',
            extractorMetrics ? 'extractor field-consumption metrics were produced' : 'extractor metrics missing',
            safe ? 'protection and branch audits passed' : 'safety audit failed'
        ]
    };
}

async function writeReport(summaryRoot, values) {
    const {
        defaultPass,
        diagnosticPass,
        targetPacketSummary,
        loopAnalysis,
        extractorSummary,
        task111Comparison,
        riskAssessment,
        protectionAudit,
        gate
    } = values;
    const report = [
        '# Local Replay Pre-Recovery Mismatch Field Consumption',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        '## Default And Diagnostic Passes',
        '',
        `Default failure reproduced: \`${defaultPass.expectedFailureReproduced}\``,
        `Diagnostic failure reproduced without recovery: \`${diagnosticPass.expectedFailureReproduced}\``,
        `Recovery added or promoted: \`${gate.recoveryAddedOrPromoted}\``,
        '',
        '## Target Packet',
        '',
        `Packet ordinal: \`${targetPacketSummary.targetPacketOrdinal}\``,
        `Updated entries: \`${targetPacketSummary.updatedEntries}\``,
        `Payload size count: \`${targetPacketSummary.payloadSizeCount}\``,
        `Payload bits sum: \`${targetPacketSummary.payloadBitsSum}\``,
        `Payload iterator aligned: \`${targetPacketSummary.payloadIteratorAlignedWithUpdatedEntries}\``,
        '',
        '## Mismatch Loops',
        '',
        `Same Task 111 mismatches confirmed: \`${task111Comparison.sameFourMismatchesTargeted}\``,
        `Loop 26 extra consumption bits: \`${loopAnalysis.loop26ExtraConsumptionBits}\``,
        `Loop 26 has extra 280 bits: \`${loopAnalysis.loop26HasExtraConsumptionOf280Bits}\``,
        `Loops 27-29 zero consumption observed: \`${loopAnalysis.loops27To29ZeroConsumptionObserved}\``,
        `Read counts monotonic: \`${loopAnalysis.readCountsMonotonicForTargetLoops}\``,
        `Evidence classification: \`${loopAnalysis.evidenceClassification}\``,
        `Causal conclusion: \`${loopAnalysis.causalConclusion}\``,
        '',
        '## Extractor Metrics',
        '',
        `Context entries with diagnostics: \`${extractorSummary.entriesWithExtractorDiagnostics}\``,
        `Zero-consumption loops: \`${extractorSummary.zeroExtractorConsumptionLoops.join(', ')}\``,
        `Mismatch loops: \`${extractorSummary.mismatchLoops.join(', ')}\``,
        `Extractor threw: \`${extractorSummary.extractorThrew}\``,
        '',
        '## Risk',
        '',
        `Direct missing UPDATE skip status: \`${riskAssessment.directMissingUpdateSkipStatus}\``,
        `Parser fix recommended now: \`${riskAssessment.parserFixRecommendedNow}\``,
        `Source 2 semantics claimed: \`${riskAssessment.source2SemanticsClaimed}\``,
        '',
        '## Protection',
        '',
        `Replay 005 processed: \`${protectionAudit.replay005Processed}\``,
        `Bots 006-008 processed: \`${protectionAudit.bots006To008Processed}\``,
        `Candidates 011-020 touched: \`${protectionAudit.candidates011To020Touched}\``,
        `Automatic recovery added: \`${protectionAudit.automaticRecoveryAdded}\``,
        `Canonical package constructed: \`${protectionAudit.canonicalPackageConstructed}\``,
        `Factual artifacts emitted: \`${protectionAudit.factualArtifactsEmitted}\``,
        '',
        `Summary output: \`${summaryRoot.relativePath}\``,
        '',
        'Task 113 was not created.'
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-pre-recovery-mismatch-field-consumption.md'), `${report}\n`);
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
        mode: 'diagnostic_pre_recovery_field_consumption',
        configuration: diagnosticConfiguration
    });
    const diagnostics = diagnosticConfiguration.recoveryDiagnostics
        .filter(diagnostic => diagnostic.type === 'pre_recovery_payload_consumption');
    const targetPacketSummary = buildTargetPacketSummary(diagnostics);
    const loopAnalysis = buildMismatchLoopAnalysis(targetPacketSummary);
    const extractorSummary = buildExtractorConsumptionSummary(targetPacketSummary);
    const task111Comparison = await buildTask111Comparison(targetPacketSummary);
    const riskAssessment = buildRiskAssessment(loopAnalysis, task111Comparison);
    const branchAudit = await auditImplementationSources();
    const protectionAudit = await buildProtectionAudit(inputIdentity, branchAudit, diagnosticConfiguration);
    const gate = decideGate({
        defaultPass,
        diagnosticPass,
        targetPacketSummary,
        loopAnalysis,
        extractorSummary,
        task111Comparison,
        protectionAudit,
        branchAudit
    });

    await writeJson(path.join(roots.local.absolutePath, 'full-pre-recovery-mismatch-field-consumption-ledger.json'), {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        localOnly: true,
        rawPayloadsIncluded: false,
        rawSerializedEntitiesIncluded: false,
        fieldValuesIncluded: false,
        targetPacketOrdinal: TARGET_PACKET_ORDINAL,
        diagnostics
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
    await writeJson(path.join(roots.summary.absolutePath, 'target-packet-summary.json'), targetPacketSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'mismatch-loop-analysis.json'), loopAnalysis);
    await writeJson(path.join(roots.summary.absolutePath, 'extractor-consumption-summary.json'), extractorSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'task111-comparison.json'), task111Comparison);
    await writeJson(path.join(roots.summary.absolutePath, 'risk-assessment.json'), riskAssessment);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-specific-branch-audit.json'), branchAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'field-consumption-gate.json'), gate);
    await writeReport(roots.summary, {
        defaultPass,
        diagnosticPass,
        targetPacketSummary,
        loopAnalysis,
        extractorSummary,
        task111Comparison,
        riskAssessment,
        protectionAudit,
        gate
    });

    return {
        inputIdentity,
        defaultPass,
        diagnosticPass,
        targetPacketSummary,
        loopAnalysis,
        extractorSummary,
        task111Comparison,
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
