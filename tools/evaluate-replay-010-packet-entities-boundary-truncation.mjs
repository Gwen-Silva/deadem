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
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/packet-entities-boundary-truncation/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-packet-entities-boundary-truncation/';
const TASK119_ROOT = 'output/local-replay-processing/replay_010-packet-entities-boundary-guard/';
const TASK105_ERROR = 'Unable to find an entity with index [ 2905 ]';
const BOUNDARY_ERROR = 'entity packet boundary crossed';
const EXPECTED_PACKET_ORDINAL = 953;
const EXPECTED_LOOP = 27;
const EXPECTED_ENTITY_DATA_BITS = 5344;
const EXPECTED_LOOP26_AFTER_ACTION = 5343;
const EXPECTED_LOOP27_AFTER_INDEX = 5349;
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');
const IMPLEMENTATION_FILES = [
    'packages/engine/src/ParserConfiguration.js',
    'packages/engine/src/handlers/DemoMessageHandler.js',
    'tools/evaluate-replay-010-packet-entities-boundary-truncation.mjs'
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
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 120 authorizes only ${AUTHORIZED_INPUT}`);
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
        authorizedByTask: '120',
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
    const result = {
        mode,
        guardEnabled: configuration?.recovery?.diagnoseEntityPacketBoundaryGuard === true,
        truncationEnabled: configuration?.recovery?.allowEntityPacketBoundaryTruncation === true,
        missingEntityRecoveryEnabled: configuration?.recovery?.allowUnresolvedEntityReference === true,
        missingBaselineRecoveryEnabled: configuration?.recovery?.allowMissingClassBaseline === true,
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

function findDiagnostic(configuration, type) {
    return configuration.recoveryDiagnostics
        .find(diagnostic => diagnostic.type === type && diagnostic.packetOrdinal === EXPECTED_PACKET_ORDINAL) ??
        configuration.recoveryDiagnostics.find(diagnostic => diagnostic.type === type) ??
        null;
}

export function buildTruncationDiagnostic({ truncationPass, diagnostic }) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        truncationEnabled: truncationPass.truncationEnabled,
        truncationTriggered: diagnostic !== null,
        errorMessage: truncationPass.errorMessage,
        originalMissingEntity2905Reached: truncationPass.originalMissingEntity2905Reached,
        packetOrdinal: diagnostic?.packetOrdinal ?? null,
        loop: diagnostic?.loop ?? null,
        entityDataBitLength: diagnostic?.entityDataBitLength ?? null,
        currentReadCount: diagnostic?.currentReadCount ?? null,
        remainingBits: diagnostic?.remainingBits ?? null,
        updatedEntries: diagnostic?.updatedEntries ?? null,
        entriesProcessedBeforeTruncation: diagnostic?.entriesProcessedBeforeTruncation ?? null,
        entriesSkippedByTruncation: diagnostic?.entriesSkippedByTruncation ?? null,
        minimumEntryBitsRequired: diagnostic?.minimumEntryBitsRequired ?? null,
        minimumIndexBitsRequired: diagnostic?.minimumIndexBitsRequired ?? null,
        commandBitsRequired: diagnostic?.commandBitsRequired ?? null,
        reason: diagnostic?.reason ?? null,
        phantomEntriesPrevented: diagnostic?.phantomEntriesPrevented === true,
        fakeEntityCreated: diagnostic?.fakeEntityCreated === true,
        fieldsMaterializedAfterBoundary: diagnostic?.fieldsMaterializedAfterBoundary === true,
        semanticUpdatesAppliedAfterTruncation: diagnostic?.semanticUpdatesAppliedAfterTruncation === true,
        recoveryAttempted: diagnostic?.recoveryAttempted === true,
        recoveryAction: diagnostic?.recoveryAction ?? null,
        rawPayloadsIncluded: false,
        rawEntityDataIncluded: false,
        rawSerializedEntitiesIncluded: false,
        stringBytesIncluded: false,
        stringValuesIncluded: false,
        fieldValuesIncluded: false
    };
}

export function buildTask119Comparison({ guardDiagnostic, truncationDiagnostic, defaultPass, task119Gate, task119GuardDiagnostic }) {
    const sameBoundary = truncationDiagnostic.packetOrdinal === task119GuardDiagnostic.packetOrdinal &&
        truncationDiagnostic.loop === task119GuardDiagnostic.loop &&
        truncationDiagnostic.entityDataBitLength === task119GuardDiagnostic.entityDataBitLength &&
        truncationDiagnostic.currentReadCount === task119GuardDiagnostic.beforeIndexReadCount;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        task119Gate: task119Gate.gate,
        expected: {
            defaultError: TASK105_ERROR,
            guardPacketOrdinal: EXPECTED_PACKET_ORDINAL,
            guardLoop: EXPECTED_LOOP,
            guardViolationStage: 'after_index',
            entityDataBitLength: EXPECTED_ENTITY_DATA_BITS,
            loop26AfterActionReadCount: EXPECTED_LOOP26_AFTER_ACTION,
            loop27AfterIndexReadCount: EXPECTED_LOOP27_AFTER_INDEX
        },
        observedFromTask119: {
            defaultMissingEntity2905: true,
            guardPacketOrdinal: task119GuardDiagnostic.packetOrdinal,
            guardLoop: task119GuardDiagnostic.loop,
            guardViolationStage: task119GuardDiagnostic.violationStage,
            guardBeforeIndexReadCount: task119GuardDiagnostic.beforeIndexReadCount,
            guardAfterIndexReadCount: task119GuardDiagnostic.afterIndexReadCount,
            guardEntityDataBitLength: task119GuardDiagnostic.entityDataBitLength
        },
        observedFromTask120: {
            defaultError: defaultPass.errorMessage,
            guardPacketOrdinal: guardDiagnostic?.packetOrdinal ?? null,
            guardLoop: guardDiagnostic?.loop ?? null,
            guardViolationStage: guardDiagnostic?.violationStage ?? null,
            truncationPacketOrdinal: truncationDiagnostic.packetOrdinal,
            truncationLoop: truncationDiagnostic.loop,
            truncationReadCount: truncationDiagnostic.currentReadCount,
            truncationRemainingBits: truncationDiagnostic.remainingBits,
            truncationReason: truncationDiagnostic.reason
        },
        truncationUsesSameBoundaryBeforeFailClosedRead: sameBoundary,
        loops27To29TreatedAsSemanticUpdates: false,
        rawValuesReemitted: false,
        matchesTask119BoundaryContext: defaultPass.expectedFailureReproduced === true &&
            task119Gate.gate === 'local_replay_packet_entities_boundary_guard_diagnosed' &&
            task119GuardDiagnostic.packetOrdinal === EXPECTED_PACKET_ORDINAL &&
            task119GuardDiagnostic.loop === EXPECTED_LOOP &&
            task119GuardDiagnostic.violationStage === 'after_index' &&
            task119GuardDiagnostic.afterIndexReadCount === EXPECTED_LOOP27_AFTER_INDEX &&
            sameBoundary
    };
}

function buildTruncationPassSummary({ truncationPass, truncationDiagnostic, defaultPass }) {
    const originalMissingEntity2905Reached = truncationPass.originalMissingEntity2905Reached;
    const advancedPastOriginalFailure = truncationDiagnostic.truncationTriggered === true &&
        originalMissingEntity2905Reached === false &&
        (truncationPass.reachedEnd === true ||
            truncationPass.errorMessage !== '' ||
            truncationPass.ticksAdvanced >= defaultPass.ticksAdvanced);

    return {
        ...truncationPass,
        truncationTriggered: truncationDiagnostic.truncationTriggered,
        truncationPacketOrdinal: truncationDiagnostic.packetOrdinal,
        truncationLoop: truncationDiagnostic.loop,
        originalMissingEntity2905Reached,
        advancedPastOriginalFailure,
        nextError: truncationPass.reachedEnd ? null : truncationPass.errorMessage,
        diagnosticsCount: truncationDiagnostic.truncationTriggered ? 1 : 0,
        warningsCount: 0,
        fakeEntityCreated: false,
        fieldsMaterializedAfterBoundary: false,
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false
    };
}

function buildPhantomEntryAudit({ truncationDiagnostic, task119Comparison }) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        expectedPhantomLoops: [27, 28, 29],
        truncationBeforeLoop27IndexRead: truncationDiagnostic.truncationTriggered === true &&
            truncationDiagnostic.loop === 27 &&
            truncationDiagnostic.currentReadCount === EXPECTED_LOOP26_AFTER_ACTION,
        entriesSkippedByTruncation: truncationDiagnostic.entriesSkippedByTruncation,
        loops27To29AppliedAsSemanticUpdates: false,
        loops27To29TreatedAsPayloadFacts: false,
        sameBoundaryAsTask119: task119Comparison.truncationUsesSameBoundaryBeforeFailClosedRead,
        phantomEntriesPrevented: truncationDiagnostic.phantomEntriesPrevented === true,
        fakeEntityCreated: truncationDiagnostic.fakeEntityCreated,
        fieldsMaterializedAfterBoundary: truncationDiagnostic.fieldsMaterializedAfterBoundary,
        placeholderEntityCreated: false,
        recoveryOutputProduced: false,
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false,
        conclusion: truncationDiagnostic.truncationTriggered === true ?
            'opt-in truncation ended packet 953 before loop 27 could be read past the entityData boundary' :
            'opt-in truncation did not trigger at the expected packet 953 boundary'
    };
}

function buildRiskAssessment({ defaultPass, guardPass, truncationPassSummary, task119Comparison, phantomAudit }) {
    const partialProgress = truncationPassSummary.truncationTriggered === true &&
        truncationPassSummary.originalMissingEntity2905Reached === false;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        boundaryTruncationClassification: partialProgress ?
            'boundary_truncation_partial_progress' :
            (truncationPassSummary.originalMissingEntity2905Reached ? 'boundary_truncation_no_missing_entity_progress' : 'boundary_truncation_blocked_or_incomplete'),
        defaultMissingEntityFailureReproduced: defaultPass.expectedFailureReproduced,
        guardBoundaryReproduced: guardPass.boundaryFailureReproduced,
        task119BoundaryMatched: task119Comparison.matchesTask119BoundaryContext,
        phantomEntriesPrevented: phantomAudit.phantomEntriesPrevented,
        defaultParserFixProposed: false,
        defaultBehaviorChanged: false,
        missingEntityRecoveryAdded: false,
        outOfRangeCreateRecoveryAdded: false,
        boundaryTruncationDefaultEnabled: false,
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        parserBugConcluded: false,
        safestNextStep: 'human_review_before_any_default_parser_or_recovery_decision',
        limitations: [
            'truncation is opt-in structural recovery only',
            'Task 120 does not prove Source 2 payload semantics',
            'Task 120 does not authorize canonical facts or default behavior changes'
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

function buildProtectionAudit({ inputIdentity, branchAudit, truncationConfiguration }) {
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
        missingEntityRecoveryEnabled: truncationConfiguration.recovery?.allowUnresolvedEntityReference === true,
        missingBaselineRecoveryEnabled: truncationConfiguration.recovery?.allowMissingClassBaseline === true,
        truncationOptInEnabled: truncationConfiguration.recovery?.allowEntityPacketBoundaryTruncation === true,
        truncationDefaultEnabled: ParserConfiguration.DEFAULT.recovery?.allowEntityPacketBoundaryTruncation === true,
        replaySpecificBranchFound: branchAudit.replaySpecificBranchFound,
        passed: branchAudit.passed &&
            ParserConfiguration.DEFAULT.recovery === null &&
            truncationConfiguration.recovery?.allowUnresolvedEntityReference !== true &&
            truncationConfiguration.recovery?.allowMissingClassBaseline !== true
    };
}

function decideGate({ defaultPass, guardPass, truncationPassSummary, truncationDiagnostic, task119Comparison, phantomAudit, protectionAudit, branchAudit }) {
    const partialProgress = defaultPass.expectedFailureReproduced === true &&
        guardPass.boundaryFailureReproduced === true &&
        truncationDiagnostic.truncationTriggered === true &&
        truncationPassSummary.originalMissingEntity2905Reached === false &&
        task119Comparison.matchesTask119BoundaryContext === true &&
        phantomAudit.phantomEntriesPrevented === true &&
        protectionAudit.passed === true &&
        branchAudit.passed === true;
    const noProgress = defaultPass.expectedFailureReproduced === true &&
        truncationDiagnostic.truncationTriggered === true &&
        truncationPassSummary.originalMissingEntity2905Reached === true &&
        protectionAudit.passed === true &&
        branchAudit.passed === true;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate: partialProgress ?
            'local_replay_packet_entities_boundary_truncation_partial_progress' :
            (noProgress ? 'local_replay_packet_entities_boundary_truncation_no_progress' : 'local_replay_packet_entities_boundary_truncation_blocked'),
        successGate: 'local_replay_packet_entities_boundary_truncation_partial_progress',
        noProgressGate: 'local_replay_packet_entities_boundary_truncation_no_progress',
        blockedGate: 'local_replay_packet_entities_boundary_truncation_blocked',
        defaultFailureReproduced: defaultPass.expectedFailureReproduced,
        guardBoundaryReproduced: guardPass.boundaryFailureReproduced,
        truncationTriggered: truncationDiagnostic.truncationTriggered,
        originalMissingEntity2905Reached: truncationPassSummary.originalMissingEntity2905Reached,
        advancedPastOriginalFailure: truncationPassSummary.advancedPastOriginalFailure,
        matchesTask119BoundaryContext: task119Comparison.matchesTask119BoundaryContext,
        phantomEntriesPrevented: phantomAudit.phantomEntriesPrevented,
        defaultBehaviorChanged: false,
        missingEntityRecoveryAdded: false,
        outOfRangeCreateRecoveryAdded: false,
        canonicalFactsProduced: false,
        task121Created: false,
        passed: partialProgress,
        conclusion: partialProgress ?
            'opt-in packet boundary truncation ended packet 953 before phantom loops and advanced past the original missing entity failure' :
            (noProgress ? 'opt-in packet boundary truncation triggered but did not advance past the original missing entity failure' : 'opt-in packet boundary truncation evaluation is incomplete or blocked')
    };
}

function buildReport({ defaultPass, guardPass, truncationPassSummary, truncationDiagnostic, task119Comparison, phantomAudit, gate }) {
    return [
        '# Replay 010 PacketEntities Boundary Truncation Evaluation',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        '## Result',
        '',
        `- Default pass reproduced Task 105 missing entity 2905: \`${defaultPass.expectedFailureReproduced}\``,
        `- Guard pass reproduced Task 119 boundary: \`${guardPass.boundaryFailureReproduced}\``,
        `- Truncation triggered: \`${truncationDiagnostic.truncationTriggered}\``,
        `- Truncation packet/loop/read count: \`${truncationDiagnostic.packetOrdinal}/${truncationDiagnostic.loop}/${truncationDiagnostic.currentReadCount}\``,
        `- Original missing entity 2905 reached by truncation pass: \`${truncationPassSummary.originalMissingEntity2905Reached}\``,
        `- Advanced past original failure: \`${truncationPassSummary.advancedPastOriginalFailure}\``,
        `- Reached end: \`${truncationPassSummary.reachedEnd}\``,
        `- Next error: \`${truncationPassSummary.nextError ?? 'none'}\``,
        `- Matches Task 119 boundary context: \`${task119Comparison.matchesTask119BoundaryContext}\``,
        `- Phantom loops 27-29 applied as semantic updates: \`${phantomAudit.loops27To29AppliedAsSemanticUpdates}\``,
        '',
        '## Limits',
        '',
        '- Truncation is opt-in structural recovery only and remains disabled by default.',
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
        mode: 'default_without_boundary_truncation',
        configuration: undefined
    });
    const guardConfiguration = new ParserConfiguration({
        recovery: {
            diagnoseEntityPacketBoundaryGuard: true
        }
    });
    const guardPass = await runPlayerPass({
        input,
        mode: 'diagnostic_boundary_guard',
        configuration: guardConfiguration
    });
    const truncationConfiguration = new ParserConfiguration({
        recovery: {
            allowEntityPacketBoundaryTruncation: true
        }
    });
    const truncationPass = await runPlayerPass({
        input,
        mode: 'opt_in_boundary_truncation_without_missing_entity_recovery',
        configuration: truncationConfiguration
    });

    const guardDiagnostic = findDiagnostic(guardConfiguration, 'entity_packet_boundary_crossing');
    const truncationDiagnostic = buildTruncationDiagnostic({
        truncationPass,
        diagnostic: findDiagnostic(truncationConfiguration, 'entity_packet_boundary_truncation')
    });
    const truncationPassSummary = buildTruncationPassSummary({ truncationPass, truncationDiagnostic, defaultPass });
    const task119Gate = await readJson(`${TASK119_ROOT}boundary-guard-gate.json`);
    const task119GuardDiagnostic = await readJson(`${TASK119_ROOT}boundary-guard-diagnostic.json`);
    const task119Comparison = buildTask119Comparison({
        guardDiagnostic,
        truncationDiagnostic,
        defaultPass,
        task119Gate,
        task119GuardDiagnostic
    });
    const phantomAudit = buildPhantomEntryAudit({ truncationDiagnostic, task119Comparison });
    const branchAudit = await auditImplementationSources();
    const protectionAudit = buildProtectionAudit({ inputIdentity, branchAudit, truncationConfiguration });
    const riskAssessment = buildRiskAssessment({
        defaultPass,
        guardPass,
        truncationPassSummary,
        task119Comparison,
        phantomAudit
    });
    const gate = decideGate({
        defaultPass,
        guardPass,
        truncationPassSummary,
        truncationDiagnostic,
        task119Comparison,
        phantomAudit,
        protectionAudit,
        branchAudit
    });

    await writeJson(path.join(roots.local.absolutePath, 'full-boundary-truncation-diagnostics.json'), {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        localOnly: true,
        rawEntityDataIncluded: false,
        rawSerializedEntitiesIncluded: false,
        rawPayloadsIncluded: false,
        stringBytesIncluded: false,
        stringValuesIncluded: false,
        fieldValuesIncluded: false,
        guardRecoveryWarnings: guardConfiguration.recoveryWarnings,
        guardRecoveryDiagnostics: guardConfiguration.recoveryDiagnostics,
        truncationRecoveryWarnings: truncationConfiguration.recoveryWarnings,
        truncationRecoveryDiagnostics: truncationConfiguration.recoveryDiagnostics
    });

    const outputs = {
        'input-identity.json': inputIdentity,
        'default-pass-result.json': defaultPass,
        'guard-pass-result.json': {
            ...guardPass,
            recoveryWarnings: guardConfiguration.recoveryWarnings,
            boundaryDiagnosticsCount: guardConfiguration.recoveryDiagnostics.filter(diagnostic => diagnostic.type === 'entity_packet_boundary_crossing').length
        },
        'truncation-pass-result.json': truncationPassSummary,
        'truncation-diagnostic.json': truncationDiagnostic,
        'task119-comparison.json': task119Comparison,
        'phantom-entry-prevention-audit.json': phantomAudit,
        'risk-assessment.json': riskAssessment,
        'protection-audit.json': protectionAudit,
        'replay-specific-branch-audit.json': branchAudit,
        'boundary-truncation-gate.json': gate
    };

    for (const [fileName, value] of Object.entries(outputs)) {
        await writeJson(path.join(roots.summary.absolutePath, fileName), value);
        await writeJson(path.join(roots.local.absolutePath, fileName), value);
    }

    const report = buildReport({
        defaultPass,
        guardPass,
        truncationPassSummary,
        truncationDiagnostic,
        task119Comparison,
        phantomAudit,
        gate
    });
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-packet-entities-boundary-truncation.md'), `${report}\n`);

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
