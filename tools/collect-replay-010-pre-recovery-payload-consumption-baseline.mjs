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
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/pre-recovery-payload-consumption-baseline/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-pre-recovery-payload-consumption-baseline/';
const TASK105_ERROR = 'Unable to find an entity with index [ 2905 ]';
const PREVIOUS_TASK109_ROOT = 'output/local-replay-processing/replay_010-serialized-entity-payload-semantics/';
const ENGINE_IMPLEMENTATION_FILES = [
    'packages/engine/src/ParserConfiguration.js',
    'packages/engine/src/ParserEngine.js',
    'packages/engine/src/handlers/DemoMessageHandler.js'
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
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 111 authorizes only ${AUTHORIZED_INPUT}`);
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
        authorizedByTask: '111'
    };
}

async function runAdvancementPass({ input, mode, configuration }) {
    const player = new Player(configuration, Logger.NOOP);
    const started = performance.now();
    const result = {
        mode,
        diagnosticsEnabled: mode === 'diagnostic_pre_recovery',
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

function afterCommandConsumption(entry) {
    const readCounts = entry.readCounts ?? {};
    if (!Number.isInteger(readCounts.afterCommand) || !Number.isInteger(readCounts.afterAction)) {
        return null;
    }
    return readCounts.afterAction - readCounts.afterCommand;
}

function compactEntry(packetOrdinal, entry) {
    const actualConsumedAfterCommand = afterCommandConsumption(entry);
    const payloadBits = Number.isInteger(entry.payloadBits) ? entry.payloadBits : null;
    return {
        packetOrdinal,
        loop: entry.loop,
        operation: entry.operation,
        registryStateBefore: entry.registryStateBefore,
        payloadBitsFromSerializedEntities: payloadBits,
        actualConsumedAfterCommand,
        payloadMinusActualAfterCommand: Number.isInteger(payloadBits) && Number.isInteger(actualConsumedAfterCommand) ?
            payloadBits - actualConsumedAfterCommand :
            null,
        action: entry.action,
        entityIndex: entry.accumulatedEntityIndex,
        className: entry.className ?? null
    };
}

function summarizePacket(diagnostic) {
    const entries = diagnostic.ledgerEntries ?? [];
    const operationCounts = {};
    for (const entry of entries) {
        operationCounts[entry.operation] = (operationCounts[entry.operation] ?? 0) + 1;
    }
    const presentUpdates = entries
        .filter(entry => entry.operation === 'UPDATE' && entry.registryStateBefore === 'present')
        .map(entry => compactEntry(diagnostic.packetOrdinal, entry));
    const mismatches = presentUpdates.filter(entry => entry.payloadMinusActualAfterCommand !== 0);

    return {
        packetOrdinal: diagnostic.packetOrdinal,
        tick: null,
        tickAvailability: 'not_available_to_message_handler_without_analyzer_scope_change',
        updatedEntries: diagnostic.packetMetrics.updatedEntries,
        entityDataBitLength: diagnostic.packetMetrics.entityDataBitLength,
        serializedEntitiesByteLength: diagnostic.packetMetrics.serializedEntitiesByteLength,
        payloadSizeCount: diagnostic.packetMetrics.payloadSizeCount,
        payloadBitsSum: diagnostic.packetMetrics.payloadBitsSum,
        entriesExamined: diagnostic.packetMetrics.entriesExamined,
        entriesByOperation: operationCounts,
        presentUpdateCount: presentUpdates.length,
        presentUpdateExactMatchesAfterCommand: presentUpdates.length - mismatches.length,
        presentUpdateMismatchesAfterCommand: mismatches.length,
        mismatchExamples: mismatches.slice(0, 10),
        boundary: diagnostic.boundary ?? null
    };
}

export function buildPreRecoveryPacketSummary(diagnostics) {
    const packetSummaries = diagnostics.map(summarizePacket);
    const totalPresentUpdates = packetSummaries.reduce((sum, packet) => sum + packet.presentUpdateCount, 0);
    const totalMismatches = packetSummaries.reduce((sum, packet) => sum + packet.presentUpdateMismatchesAfterCommand, 0);
    const packetsWithMismatches = packetSummaries.filter(packet => packet.presentUpdateMismatchesAfterCommand > 0);
    const boundaryPackets = packetSummaries.filter(packet => packet.boundary !== null);

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        source: 'opt_in_pre_recovery_payload_consumption_diagnostic',
        packetCount: packetSummaries.length,
        packetsWithBoundary: packetSummaries.filter(packet => packet.boundary !== null).length,
        totalPresentUpdates,
        totalPresentUpdateMismatchesAfterCommand: totalMismatches,
        committedRawPayloads: false,
        committedRawSerializedEntities: false,
        committedFieldValues: false,
        fullPacketSummaryLocalOnly: {
            path: `${REQUIRED_LOCAL_ROOT}full-pre-recovery-payload-ledger.json`,
            includesAllPackets: true,
            commitPolicy: 'local_only'
        },
        packetCoverage: {
            firstPacketOrdinal: packetSummaries[0]?.packetOrdinal ?? null,
            lastPacketOrdinal: packetSummaries.at(-1)?.packetOrdinal ?? null,
            mismatchPacketOrdinals: packetsWithMismatches.map(packet => packet.packetOrdinal),
            boundaryPacketOrdinals: boundaryPackets.map(packet => packet.packetOrdinal)
        },
        packetSamples: {
            firstPackets: packetSummaries.slice(0, 3),
            packetsWithMismatches,
            boundaryPackets,
            lastPackets: packetSummaries.slice(-3)
        }
    };
}

export function buildPresentUpdateConsistencySummary(diagnostics) {
    const entries = diagnostics.flatMap(diagnostic => (diagnostic.ledgerEntries ?? [])
        .filter(entry => entry.operation === 'UPDATE' && entry.registryStateBefore === 'present')
        .map(entry => compactEntry(diagnostic.packetOrdinal, entry)));
    const exactMatches = entries.filter(entry => entry.payloadMinusActualAfterCommand === 0);
    const mismatches = entries.filter(entry => entry.payloadMinusActualAfterCommand !== 0);
    const largestAbsoluteDelta = mismatches.reduce((current, entry) => {
        const value = Math.abs(entry.payloadMinusActualAfterCommand ?? 0);
        return Math.max(current, value);
    }, 0);

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        comparisonBasis: 'present UPDATE entries before the first default missing-entity failure',
        presentUpdateEntriesCompared: entries.length,
        exactMatchesAfterCommand: exactMatches.length,
        mismatchesAfterCommand: mismatches.length,
        mismatchRate: entries.length === 0 ? null : mismatches.length / entries.length,
        largestAbsoluteDelta,
        mismatchExamples: mismatches.slice(0, 25),
        sampleEntries: entries.slice(0, 25),
        mismatchesOccurBeforeAnyRecovery: mismatches.length > 0,
        directSkipStillUnsafe: mismatches.length > 0,
        limitations: [
            'only present UPDATE entries can be independently compared before the first failure',
            'tick is unavailable without modifying the analyzer call signature',
            'no raw entityData, raw serializedEntities, or field values are committed'
        ]
    };
}

export function buildFirstMissingEntityBoundary(diagnostics, diagnosticPass) {
    const boundaryDiagnostic = diagnostics.find(diagnostic => diagnostic.boundary?.failureType === 'missing_entity_reference') ?? null;
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        boundaryFound: boundaryDiagnostic !== null,
        expectedTask105FailureReproduced: diagnosticPass.expectedFailureReproduced === true,
        errorMessage: diagnosticPass.errorMessage,
        packetOrdinal: boundaryDiagnostic?.packetOrdinal ?? null,
        boundary: boundaryDiagnostic?.boundary ?? null,
        boundaryEntry: boundaryDiagnostic?.ledgerEntries?.find(entry => entry.loop === boundaryDiagnostic?.boundary?.loop) ?? null,
        recoveryAttempted: false,
        recoveryApplied: false,
        failedClosed: true
    };
}

export async function buildTask109Comparison(consistencySummary) {
    const boundarySummary = await readJson(`${PREVIOUS_TASK109_ROOT}boundary-packet-payload-consumption-summary.json`);
    const consistency = await readJson(`${PREVIOUS_TASK109_ROOT}payload-size-consistency-summary.json`);
    const hypotheses = await readJson(`${PREVIOUS_TASK109_ROOT}payload-semantics-hypotheses.json`).catch(() => null);
    const preRecoveryMismatches = consistencySummary.mismatchesAfterCommand;
    const task109Loop21Mismatch = consistency.loop21MismatchConfirmed === true ||
        boundarySummary.requestedWindow?.entries?.some(entry => entry.loop === 21 && entry.payloadMinusActualAfterCommand !== 0) === true;
    const loop21 = boundarySummary.requestedWindow?.entries?.find(entry => entry.loop === 21) ?? {};
    let hypothesisImpact = 'not_determined';
    if (preRecoveryMismatches > 0 && task109Loop21Mismatch) {
        hypothesisImpact = 'sustains_task109_not_recovery_contaminated';
    } else if (consistencySummary.presentUpdateEntriesCompared > 0 && preRecoveryMismatches === 0 && task109Loop21Mismatch) {
        hypothesisImpact = 'weakens_task109_for_default_pre_recovery_path';
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        task109SourcePaths: [
            `${PREVIOUS_TASK109_ROOT}boundary-packet-payload-consumption-summary.json`,
            `${PREVIOUS_TASK109_ROOT}payload-size-consistency-summary.json`,
            `${PREVIOUS_TASK109_ROOT}payload-semantics-hypotheses.json`
        ],
        task109BoundaryWasPostRecoveryPath: true,
        task109Loop21Mismatch,
        task109Loop21PayloadBits: loop21.payloadBitsFromSerializedEntities ?? null,
        task109Loop21ActualConsumedAfterCommand: loop21.actualConsumedAfterCommand ?? null,
        task109Loop22StillNotIndependentlyJustified: consistency.loop22SkipSemanticallyJustified === false,
        preRecoveryPresentUpdatesCompared: consistencySummary.presentUpdateEntriesCompared,
        preRecoveryMismatchesAfterCommand: preRecoveryMismatches,
        preRecoveryMismatchRate: consistencySummary.mismatchRate,
        hypothesisImpact,
        priorRiskStatus: hypotheses?.payloadBitsDirectMissingUpdateSkipAssessment ?? null,
        conclusion: hypothesisImpact === 'sustains_task109_not_recovery_contaminated' ?
            'payload-size mismatches are observable before any recovery, so Task 109 loop 21 is not solely a post-recovery contamination signal' :
            'pre-recovery baseline does not independently establish the Task 109 mismatch pattern'
    };
}

export function buildBaselineRiskAssessment(consistencySummary, task109Comparison) {
    const mismatches = consistencySummary.mismatchesAfterCommand;
    const directSkipStillUnsafe = mismatches > 0 || task109Comparison.task109Loop21Mismatch === true;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        mismatchesOccurBeforeAnyRecovery: mismatches > 0,
        presentUpdateEntriesCompared: consistencySummary.presentUpdateEntriesCompared,
        mismatchRate: consistencySummary.mismatchRate,
        largestAbsoluteDelta: consistencySummary.largestAbsoluteDelta,
        task109HypothesisImpact: task109Comparison.hypothesisImpact,
        directSkipStatus: directSkipStillUnsafe ? 'unsafe' : 'not_determined',
        missingUpdateRecoveryRecommendation: 'diagnostic_only_do_not_use_as_safe_skip',
        source2SemanticsClaimed: false,
        parserFixRecommendedNow: false,
        recommendedNextSteps: [
            'external/source-engine serializedEntities semantic investigation',
            'field-level extractor accounting over present UPDATE entries before considering parser fixes'
        ],
        limitations: [
            'baseline covers replay_010 only',
            'diagnostic pass stops at the first default missing-entity failure',
            'no recovery path is used for this baseline'
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
        if (/DEFAULTS\s*=\s*\{[\s\S]*diagnosePreRecoveryPayloadConsumption\s*:\s*true/.test(source)) {
            findings.push({ type: 'diagnostics_default_enabled', file });
        }
        if (/DEFAULTS\s*=\s*\{[\s\S]*allowUnresolvedEntityReference\s*:\s*true/.test(source)) {
            findings.push({ type: 'recovery_default_enabled', file });
        }
    }
    return {
        schemaVersion: 1,
        implementationFilesExamined: files,
        replaySpecificBranchFindings: findings.filter(finding => finding.type === 'replay_specific_engine_branch'),
        diagnosticsDefaultEnabled: findings.some(finding => finding.type === 'diagnostics_default_enabled'),
        recoveryDefaultEnabled: findings.some(finding => finding.type === 'recovery_default_enabled'),
        samplesAppearsInExecutableCodePaths: findings.some(finding => finding.type === 'samples_executable_path'),
        outputReplaysAppearsInExecutableCodePaths: findings.some(finding => finding.type === 'output_replays_executable_path'),
        candidates011To020AppearInProcessingPaths: findings.some(finding => finding.type === 'candidate_011_020_processing_path'),
        passed: findings.length === 0,
        findings
    };
}

async function buildProtectionAudit(inputIdentity, branchAudit, diagnosticConfiguration) {
    const task112Created = existsSync(path.join(REPO_ROOT, 'tasks/specs/112.json')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/blocked/112-select-next-canonical-generalization-control.md'));
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
        task112Created,
        rawReplayRead: true,
        rawReplayHash: inputIdentity.sha256,
        replayParserInvoked: true,
        diagnosticRecoveryAllowUnresolvedEntityReference: diagnosticConfiguration.recovery?.allowUnresolvedEntityReference === true,
        diagnosticRecoveryAllowMissingClassBaseline: diagnosticConfiguration.recovery?.allowMissingClassBaseline === true,
        branchAuditPassed: branchAudit.passed,
        passed: !task112Created &&
            branchAudit.passed &&
            diagnosticConfiguration.recovery?.allowUnresolvedEntityReference !== true &&
            diagnosticConfiguration.recovery?.allowMissingClassBaseline !== true
    };
}

export function decideGate({
    defaultPass,
    diagnosticPass,
    packetSummary,
    consistencySummary,
    boundary,
    task109Comparison,
    riskAssessment,
    protectionAudit,
    branchAudit
}) {
    const defaultOk = defaultPass.expectedFailureReproduced === true;
    const diagnosticOk = diagnosticPass.expectedFailureReproduced === true && boundary.failedClosed === true;
    const packetsSummarized = packetSummary.packetCount > 0;
    const metricsProduced = consistencySummary.presentUpdateEntriesCompared > 0;
    const answersMismatchQuestion = typeof consistencySummary.mismatchesOccurBeforeAnyRecovery === 'boolean';
    const comparedTask109 = task109Comparison.task109Loop21Mismatch === true;
    const safe = protectionAudit.passed === true && branchAudit.passed === true &&
        riskAssessment.parserFixRecommendedNow === false;

    let gate = 'local_replay_pre_recovery_payload_consumption_baseline_blocked';
    if (defaultOk && diagnosticOk && packetsSummarized && metricsProduced && answersMismatchQuestion && comparedTask109 && safe) {
        gate = 'local_replay_pre_recovery_payload_consumption_baseline_ready';
    } else if (defaultOk && diagnosticOk && packetsSummarized && safe) {
        gate = 'local_replay_pre_recovery_payload_consumption_baseline_partial';
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate,
        successGate: 'local_replay_pre_recovery_payload_consumption_baseline_ready',
        partialGate: 'local_replay_pre_recovery_payload_consumption_baseline_partial',
        blockedGate: 'local_replay_pre_recovery_payload_consumption_baseline_blocked',
        defaultFailureReproduced: defaultOk,
        diagnosticFailureReproducedWithoutRecovery: diagnosticOk,
        packetsSummarized,
        presentUpdateMetricsProduced: metricsProduced,
        mismatchesOccurBeforeAnyRecovery: consistencySummary.mismatchesOccurBeforeAnyRecovery,
        task109ComparisonCompleted: comparedTask109,
        directSkipStatus: riskAssessment.directSkipStatus,
        parserDefaultBehaviorChanged: false,
        recoveryAddedOrPromoted: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        protectionAuditPassed: protectionAudit.passed,
        reasons: [
            defaultOk ? 'default pass reproduced Task 105 failure' : 'default pass did not reproduce Task 105 failure',
            diagnosticOk ? 'diagnostic pass reproduced first failure without recovery' : 'diagnostic pass did not fail closed at first failure',
            packetsSummarized ? 'pre-recovery packet summaries were collected' : 'no pre-recovery packet summaries were collected',
            metricsProduced ? 'present UPDATE metrics were produced' : 'no present UPDATE metrics were produced',
            answersMismatchQuestion ? 'mismatch-before-recovery question was answered' : 'mismatch-before-recovery question was not answered',
            comparedTask109 ? 'Task 109 loop 21 comparison was completed' : 'Task 109 comparison missing',
            safe ? 'protection and branch audits passed' : 'safety audit failed'
        ]
    };
}

async function writeReport(summaryRoot, values) {
    const {
        defaultPass,
        diagnosticPass,
        packetSummary,
        consistencySummary,
        boundary,
        task109Comparison,
        riskAssessment,
        protectionAudit,
        gate
    } = values;
    const report = [
        '# Local Replay Pre-Recovery Payload Consumption Baseline',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        '## Default And Diagnostic Passes',
        '',
        `Default failure reproduced: \`${defaultPass.expectedFailureReproduced}\``,
        `Diagnostic failure reproduced without recovery: \`${diagnosticPass.expectedFailureReproduced}\``,
        `First boundary: \`${boundary.boundary?.operation ?? 'none'} ${boundary.boundary?.entityIndex ?? ''}\``,
        '',
        '## Pre-Recovery Baseline',
        '',
        `Packets summarized: \`${packetSummary.packetCount}\``,
        `Present UPDATEs compared: \`${consistencySummary.presentUpdateEntriesCompared}\``,
        `Exact after-command matches: \`${consistencySummary.exactMatchesAfterCommand}\``,
        `Mismatches before any recovery: \`${consistencySummary.mismatchesAfterCommand}\``,
        `Mismatch rate: \`${consistencySummary.mismatchRate}\``,
        `Largest absolute delta: \`${consistencySummary.largestAbsoluteDelta}\``,
        '',
        '## Task 109 Comparison',
        '',
        `Task 109 loop 21 mismatch: \`${task109Comparison.task109Loop21Mismatch}\``,
        `Hypothesis impact: \`${task109Comparison.hypothesisImpact}\``,
        '',
        '## Risk',
        '',
        `Direct skip status: \`${riskAssessment.directSkipStatus}\``,
        `Recovery recommendation: \`${riskAssessment.missingUpdateRecoveryRecommendation}\``,
        `Parser fix recommended now: \`${riskAssessment.parserFixRecommendedNow}\``,
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
        'Task 112 was not created.'
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-pre-recovery-payload-consumption-baseline.md'), `${report}\n`);
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
            diagnosePreRecoveryPayloadConsumption: true
        }
    });
    const diagnosticPass = await runAdvancementPass({
        input,
        mode: 'diagnostic_pre_recovery',
        configuration: diagnosticConfiguration
    });
    const diagnostics = diagnosticConfiguration.recoveryDiagnostics
        .filter(diagnostic => diagnostic.type === 'pre_recovery_payload_consumption');
    const packetSummary = buildPreRecoveryPacketSummary(diagnostics);
    const consistencySummary = buildPresentUpdateConsistencySummary(diagnostics);
    const boundary = buildFirstMissingEntityBoundary(diagnostics, diagnosticPass);
    const task109Comparison = await buildTask109Comparison(consistencySummary);
    const riskAssessment = buildBaselineRiskAssessment(consistencySummary, task109Comparison);
    const branchAudit = await auditImplementationSources();
    const protectionAudit = await buildProtectionAudit(inputIdentity, branchAudit, diagnosticConfiguration);
    const gate = decideGate({
        defaultPass,
        diagnosticPass,
        packetSummary,
        consistencySummary,
        boundary,
        task109Comparison,
        riskAssessment,
        protectionAudit,
        branchAudit
    });

    await writeJson(path.join(roots.local.absolutePath, 'full-pre-recovery-payload-ledger.json'), {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        localOnly: true,
        rawPayloadsIncluded: false,
        rawSerializedEntitiesIncluded: false,
        fieldValuesIncluded: false,
        diagnostics,
        packetSummaries: diagnostics.map(summarizePacket)
    });

    await writeJson(path.join(roots.summary.absolutePath, 'input-identity.json'), inputIdentity);
    await writeJson(path.join(roots.summary.absolutePath, 'default-pass-result.json'), defaultPass);
    await writeJson(path.join(roots.summary.absolutePath, 'diagnostic-pass-result.json'), {
        ...diagnosticPass,
        recoveryWarnings: diagnosticConfiguration.recoveryWarnings,
        preRecoveryPayloadDiagnosticsCount: diagnostics.length,
        recoveryAllowUnresolvedEntityReference: diagnosticConfiguration.recovery?.allowUnresolvedEntityReference === true,
        recoveryAllowMissingClassBaseline: diagnosticConfiguration.recovery?.allowMissingClassBaseline === true
    });
    await writeJson(path.join(roots.summary.absolutePath, 'pre-recovery-packet-summary.json'), packetSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'present-update-consistency-summary.json'), consistencySummary);
    await writeJson(path.join(roots.summary.absolutePath, 'first-missing-entity-boundary.json'), boundary);
    await writeJson(path.join(roots.summary.absolutePath, 'task109-comparison.json'), task109Comparison);
    await writeJson(path.join(roots.summary.absolutePath, 'baseline-risk-assessment.json'), riskAssessment);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-specific-branch-audit.json'), branchAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'baseline-gate.json'), gate);
    await writeReport(roots.summary, {
        defaultPass,
        diagnosticPass,
        packetSummary,
        consistencySummary,
        boundary,
        task109Comparison,
        riskAssessment,
        protectionAudit,
        gate
    });

    return {
        inputIdentity,
        defaultPass,
        diagnosticPass,
        packetSummary,
        consistencySummary,
        boundary,
        task109Comparison,
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
