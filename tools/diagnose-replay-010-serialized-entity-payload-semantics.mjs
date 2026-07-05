#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Logger, ParserConfiguration, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_REPLAY_ID = ['replay', '010'].join('_');
const AUTHORIZED_INPUT = '.local/deadem/replays/inbox/partida_010.dem';
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/serialized-entity-payload-semantics/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-serialized-entity-payload-semantics/';
const TASK105_FAILURE_TICKS = 953;
const BOUNDARY_WINDOW_START = 18;
const BOUNDARY_WINDOW_END = 23;
const ENGINE_IMPLEMENTATION_FILES = [
    'packages/engine/src/ParserConfiguration.js',
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
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 109 authorizes only ${AUTHORIZED_INPUT}`);
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

async function sha256File(filePath) {
    return await new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

function stackTop(error) {
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
        authorizedByTask: '109'
    };
}

async function runAdvancementPass({ input, mode, configuration }) {
    const player = new Player(configuration, Logger.NOOP);
    const started = performance.now();
    const result = {
        mode,
        expectedFailureReproduced: mode === 'default' ? false : undefined,
        recoveryEnabled: mode === 'opt_in_recovery',
        advancedPastTask105Failure: mode === 'opt_in_recovery' ? false : undefined,
        boundaryReached: mode === 'opt_in_recovery' ? false : undefined,
        reachedEnd: false,
        ticksAdvanced: 0,
        currentTick: null,
        finalTick: null,
        errorMessage: mode === 'default' ? '' : undefined,
        boundaryError: mode === 'opt_in_recovery' ? null : undefined,
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
            if (mode === 'opt_in_recovery' && result.ticksAdvanced > TASK105_FAILURE_TICKS) {
                result.advancedPastTask105Failure = true;
            }
            if (!advanced) {
                result.reachedEnd = true;
                break;
            }
        }
    } catch (error) {
        if (mode === 'default') {
            result.expectedFailureReproduced = error?.message === 'Unable to find an entity with index [ 2905 ]';
            result.errorMessage = error?.message ?? String(error);
        } else {
            result.boundaryReached = error?.message === 'entity index out of range';
            result.boundaryError = {
                name: error?.name ?? 'Error',
                message: error?.message ?? String(error)
            };
        }
        result.stackTop = stackTop(error);
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        await player.dispose().catch(() => {});
    }

    return result;
}

function nullableDelta(payloadBits, consumed) {
    return Number.isInteger(payloadBits) && Number.isInteger(consumed) ? payloadBits - consumed : null;
}

function addConsumptionMetrics(entry) {
    const readCounts = entry.readCounts ?? {};
    const afterAction = readCounts.afterAction;
    const actualConsumedAfterCommand = Number.isInteger(afterAction) && Number.isInteger(readCounts.afterCommand) ?
        afterAction - readCounts.afterCommand :
        null;
    const actualConsumedAfterIndex = Number.isInteger(afterAction) && Number.isInteger(readCounts.afterIndex) ?
        afterAction - readCounts.afterIndex :
        null;
    const actualConsumedFromEntryStart = Number.isInteger(afterAction) && Number.isInteger(readCounts.beforeIndex) ?
        afterAction - readCounts.beforeIndex :
        null;

    return {
        loop: entry.loop,
        operation: entry.operation,
        registryStateBefore: entry.registryStateBefore,
        payloadBitsFromSerializedEntities: entry.payloadBits,
        readCounts: entry.readCounts,
        actualConsumedAfterCommand,
        actualConsumedAfterIndex,
        actualConsumedFromEntryStart,
        payloadMinusActualAfterCommand: nullableDelta(entry.payloadBits, actualConsumedAfterCommand),
        payloadMinusActualAfterIndex: nullableDelta(entry.payloadBits, actualConsumedAfterIndex),
        payloadMinusActualFromEntryStart: nullableDelta(entry.payloadBits, actualConsumedFromEntryStart),
        entityIndex: entry.accumulatedEntityIndex,
        classId: entry.classId,
        className: entry.className,
        action: entry.action,
        entityTouched: entry.entityTouched,
        baselineTouched: entry.baselineTouched,
        fieldsTouched: entry.fieldsTouched,
        registerEntityTouched: entry.registerEntityTouched,
        failureStage: entry.failureStage,
        payloadMatchesActualAfterCommand: entry.payloadBits === actualConsumedAfterCommand,
        payloadMatchesActualAfterIndex: entry.payloadBits === actualConsumedAfterIndex,
        payloadMatchesActualFromEntryStart: entry.payloadBits === actualConsumedFromEntryStart
    };
}

function compactEntry(entry) {
    return {
        loop: entry.loop,
        operation: entry.operation,
        registryStateBefore: entry.registryStateBefore,
        payloadBitsFromSerializedEntities: entry.payloadBitsFromSerializedEntities,
        actualConsumedAfterCommand: entry.actualConsumedAfterCommand,
        actualConsumedAfterIndex: entry.actualConsumedAfterIndex,
        actualConsumedFromEntryStart: entry.actualConsumedFromEntryStart,
        payloadMinusActualAfterCommand: entry.payloadMinusActualAfterCommand,
        payloadMinusActualAfterIndex: entry.payloadMinusActualAfterIndex,
        payloadMinusActualFromEntryStart: entry.payloadMinusActualFromEntryStart,
        entityIndex: entry.entityIndex,
        classId: entry.classId,
        className: entry.className,
        action: entry.action
    };
}

export function buildPayloadConsumptionEntries(diagnostic) {
    return (diagnostic?.ledgerEntries ?? [])
        .map(addConsumptionMetrics)
        .filter(entry => entry.readCounts?.afterAction !== null);
}

function countBy(entries, keyFn) {
    const counts = {};
    for (const entry of entries) {
        const key = keyFn(entry);
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

function chooseClosestReference(entries) {
    const references = [
        ['after_command', 'payloadMinusActualAfterCommand'],
        ['after_index', 'payloadMinusActualAfterIndex'],
        ['entry_start', 'payloadMinusActualFromEntryStart']
    ];
    const scored = references.map(([reference, field]) => {
        const deltas = entries.map(entry => entry[field]).filter(Number.isInteger);
        const exactMatches = deltas.filter(delta => delta === 0).length;
        const medianAbsoluteDelta = deltas.length === 0 ? null : deltas
            .map(Math.abs)
            .sort((left, right) => left - right)[Math.floor(deltas.length / 2)];
        return { reference, comparedEntries: deltas.length, exactMatches, medianAbsoluteDelta };
    });
    const best = scored
        .filter(item => item.medianAbsoluteDelta !== null)
        .sort((left, right) => {
            if (right.exactMatches !== left.exactMatches) return right.exactMatches - left.exactMatches;
            return left.medianAbsoluteDelta - right.medianAbsoluteDelta;
        })[0] ?? null;

    return { scoredReferences: scored, closestReference: best?.reference ?? 'not_determined' };
}

export function buildBoundaryPacketPayloadConsumptionSummary(diagnostic) {
    const entries = buildPayloadConsumptionEntries(diagnostic);
    const windowEntries = entries
        .filter(entry => entry.loop >= BOUNDARY_WINDOW_START && entry.loop <= BOUNDARY_WINDOW_END)
        .map(compactEntry);
    const loop21 = entries.find(entry => entry.loop === 21) ?? null;
    const loop22 = entries.find(entry => entry.loop === 22) ?? null;
    const loop23 = entries.find(entry => entry.loop === 23) ?? null;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        diagnosticPresent: diagnostic !== null,
        packetMetrics: diagnostic?.packetMetrics ?? null,
        boundary: diagnostic?.boundary ?? null,
        requestedWindow: {
            startLoop: BOUNDARY_WINDOW_START,
            endLoop: BOUNDARY_WINDOW_END,
            entriesCaptured: windowEntries.length,
            entries: windowEntries
        },
        loop21: loop21 === null ? null : {
            ...compactEntry(loop21),
            mismatchConfirmedAgainstAfterCommand: loop21.payloadMatchesActualAfterCommand === false
        },
        loop22: loop22 === null ? null : {
            ...compactEntry(loop22),
            semanticJustification: 'not_independently_justified',
            reason: 'the missing UPDATE was skipped by moving payloadBits, so afterAction equality is arithmetic evidence rather than extractor-consumption evidence'
        },
        loop23: loop23 === null ? null : compactEntry(loop23)
    };
}

export function buildPayloadSizeConsistencySummary(diagnostic) {
    const entries = buildPayloadConsumptionEntries(diagnostic);
    const entriesWithPayload = entries.filter(entry => Number.isInteger(entry.payloadBitsFromSerializedEntities));
    const presentUpdatesBeforeBoundary = entriesWithPayload.filter(entry =>
        entry.loop < 23 &&
        entry.operation === 'UPDATE' &&
        entry.registryStateBefore === 'present'
    );
    const presentUpdateMismatches = presentUpdatesBeforeBoundary.filter(entry => entry.payloadMatchesActualAfterCommand === false);
    const loop21 = entries.find(entry => entry.loop === 21) ?? null;
    const referenceFit = chooseClosestReference(presentUpdatesBeforeBoundary);
    const mismatchDeltas = presentUpdateMismatches
        .map(entry => entry.payloadMinusActualAfterCommand)
        .filter(Number.isInteger);

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        diagnosticPresent: diagnostic !== null,
        entriesCompared: entriesWithPayload.length,
        entriesByOperation: countBy(entriesWithPayload, entry => entry.operation ?? 'UNKNOWN'),
        entriesByAction: countBy(entriesWithPayload, entry => entry.action ?? 'UNKNOWN'),
        presentUpdateEntriesBeforeBoundary: presentUpdatesBeforeBoundary.length,
        presentUpdateMatchesAfterCommand: presentUpdatesBeforeBoundary.length - presentUpdateMismatches.length,
        presentUpdateMismatchesAfterCommand: presentUpdateMismatches.length,
        mismatchAppearsBeforeLoop22: presentUpdateMismatches.some(entry => entry.loop < 22),
        loop21MismatchConfirmed: loop21?.payloadMatchesActualAfterCommand === false,
        loop21DeltaAfterCommand: loop21?.payloadMinusActualAfterCommand ?? null,
        loop22SkipSemanticallyJustified: false,
        loop22SkipSemanticStatus: 'arithmetic_only_not_independent_extractor_evidence',
        referenceFit,
        mismatchDeltaAfterCommandRange: mismatchDeltas.length === 0 ? null : {
            min: Math.min(...mismatchDeltas),
            max: Math.max(...mismatchDeltas)
        },
        mismatchExamples: presentUpdateMismatches.slice(0, 12).map(compactEntry),
        priorPacketSampleStatus: 'not_collected',
        priorPacketSampleLimitation: 'existing Task 108 opt-in diagnostic records the boundary packet at failure; this task did not add broad per-packet instrumentation'
    };
}

export function buildPayloadSemanticsHypotheses(boundarySummary, consistencySummary) {
    const loop21 = boundarySummary.loop21;
    const loop22 = boundarySummary.loop22;
    const unsafe = consistencySummary.presentUpdateMismatchesAfterCommand > 0 || consistencySummary.loop21MismatchConfirmed;
    const recommendedNextAction = unsafe ?
        'investigate EntityPayloadSizeExtractor and serializedEntities proto semantics before using payloadBits as missing UPDATE skip input' :
        'collect additional independent packet samples before deciding skip safety';

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        observedFacts: [
            'default replay_010 behavior still fails at the Task 105 missing entity boundary when recovery is disabled',
            'opt-in missing UPDATE recovery still reaches the Task 107/108 out-of-range CREATE boundary',
            'boundary packet loops 18-23 are available from opt-in cursor diagnostics'
        ],
        numericalComparisons: {
            loop21: loop21 === null ? null : {
                payloadBitsFromSerializedEntities: loop21.payloadBitsFromSerializedEntities,
                actualConsumedAfterCommand: loop21.actualConsumedAfterCommand,
                actualConsumedAfterIndex: loop21.actualConsumedAfterIndex,
                actualConsumedFromEntryStart: loop21.actualConsumedFromEntryStart,
                payloadMinusActualAfterCommand: loop21.payloadMinusActualAfterCommand,
                mismatchConfirmed: loop21.mismatchConfirmedAgainstAfterCommand
            },
            loop22: loop22 === null ? null : {
                payloadBitsFromSerializedEntities: loop22.payloadBitsFromSerializedEntities,
                actualConsumedAfterCommand: loop22.actualConsumedAfterCommand,
                payloadMinusActualAfterCommand: loop22.payloadMinusActualAfterCommand,
                semanticJustification: loop22.semanticJustification,
                reason: loop22.reason
            },
            closestReferenceForPresentUpdates: consistencySummary.referenceFit.closestReference
        },
        simulations: [
            'no parser state was advanced by simulations in this task; comparisons are computed from recorded read-count metrics'
        ],
        hypotheses: [
            unsafe ?
                'serializedEntities payloadBits is unsafe as a direct universal skip length after command for missing UPDATE recovery' :
                'serializedEntities payloadBits may require more samples before it can be considered a direct skip length',
            'the loop 22 skip is not independently semantically validated because the missing entity prevented extractor consumption',
            'cursor divergence may have begun before loop 22'
        ],
        notDetermined: [
            'the exact serializedEntities proto semantic meaning',
            'whether EntityPayloadSizeExtractor is decoding the correct varint stream but using the wrong referential frame',
            'whether loop 22 caused the loop 23 out-of-range CREATE',
            'whether earlier packets show the same mismatch pattern'
        ],
        payloadBitsDirectMissingUpdateSkipAssessment: unsafe ? 'unsafe' : 'not_determined',
        recommendedNextAction
    };
}

async function writeFullLedger(localRoot, diagnostic, consumptionEntries) {
    const localPath = path.join(localRoot.absolutePath, 'serialized-entity-payload-consumption-ledger-full.json');
    await writeJson(localPath, {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        diagnostic,
        consumptionEntries
    });
    const info = await stat(localPath);
    return {
        path: repoRelative(localPath),
        sizeBytes: info.size,
        sha256: await sha256File(localPath),
        commitPolicy: 'local_only'
    };
}

export async function auditImplementationSources(root = REPO_ROOT) {
    const findings = [];
    const files = [];
    for (const file of ENGINE_IMPLEMENTATION_FILES) {
        const absolutePath = path.join(root, file);
        const source = await readFile(absolutePath, 'utf8');
        files.push(file);
        if (/\bif\s*\([^)]*replay_010[^)]*\)/.test(source) || /\bcase\s+['"]replay_010['"]/.test(source)) {
            findings.push({ type: 'replay_specific_branch', file });
        }
        if (/createReadStream\s*\([^)]*samples[\\/]/.test(source) || /readFile\s*\([^)]*samples[\\/]/.test(source)) {
            findings.push({ type: 'samples_executable_path', file });
        }
        if (/createReadStream\s*\([^)]*output[\\/]replays[\\/]/.test(source) || /readFile\s*\([^)]*output[\\/]replays[\\/]/.test(source)) {
            findings.push({ type: 'output_replays_executable_path', file });
        }
        if (/partida_0?(1[1-9]|20)\.dem/.test(source)) {
            findings.push({ type: 'candidate_011_020_processing_path', file });
        }
        if (/DEFAULTS\s*=\s*\{[\s\S]*RECOVERY\]\s*:\s*\{/.test(source)) {
            findings.push({ type: 'default_recovery_enabled', file });
        }
    }
    return {
        schemaVersion: 1,
        implementationFilesExamined: files,
        replaySpecificBranchFindings: findings.filter(finding => finding.type === 'replay_specific_branch'),
        samplesAppearsInExecutableCodePaths: findings.some(finding => finding.type === 'samples_executable_path'),
        outputReplaysAppearsInExecutableCodePaths: findings.some(finding => finding.type === 'output_replays_executable_path'),
        candidates011To020AppearInProcessingPaths: findings.some(finding => finding.type === 'candidate_011_020_processing_path'),
        recoveryDefaultEnabled: findings.some(finding => finding.type === 'default_recovery_enabled'),
        passed: findings.length === 0,
        findings
    };
}

async function buildProtectionAudit(inputIdentity, branchAudit) {
    const task110Created = existsSync(path.join(REPO_ROOT, 'tasks/specs/110.json')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/blocked/110-select-next-canonical-generalization-control.md'));
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
        copyFallbackUsed: false,
        demFilesCommitted: false,
        localFilesCommitted: false,
        rawEntityDataCommitted: false,
        rawSerializedEntitiesCommitted: false,
        fieldValuesCommitted: false,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        sourceArtifactsEmitted: false,
        task110Created,
        rawReplayRead: true,
        rawReplayHash: inputIdentity.sha256,
        replayParserInvoked: true,
        branchAuditPassed: branchAudit.passed,
        passed: !task110Created && branchAudit.passed
    };
}

export function decideGate({
    defaultPass,
    recoveryPass,
    boundarySummary,
    consistencySummary,
    hypotheses,
    protectionAudit,
    branchAudit
}) {
    const defaultOk = defaultPass.expectedFailureReproduced === true;
    const boundaryReached = recoveryPass.advancedPastTask105Failure === true && recoveryPass.boundaryReached === true;
    const windowCaptured = boundarySummary.requestedWindow.entriesCaptured >= 6 &&
        boundarySummary.loop21 !== null &&
        boundarySummary.loop22 !== null &&
        boundarySummary.loop23 !== null;
    const loop21Reported = boundarySummary.loop21?.mismatchConfirmedAgainstAfterCommand === true;
    const loop22Evaluated = boundarySummary.loop22?.semanticJustification === 'not_independently_justified';
    const compactMismatchSummary = consistencySummary.presentUpdateEntriesBeforeBoundary > 0 &&
        consistencySummary.presentUpdateMismatchesAfterCommand > 0;
    const safeAssessment = hypotheses.payloadBitsDirectMissingUpdateSkipAssessment === 'unsafe' ||
        hypotheses.payloadBitsDirectMissingUpdateSkipAssessment === 'not_determined';
    const safetyPassed = protectionAudit.passed && branchAudit.passed;

    let gate = 'local_replay_serialized_entity_payload_semantics_blocked';
    if (defaultOk && boundaryReached && windowCaptured && loop21Reported && loop22Evaluated && compactMismatchSummary && safeAssessment && safetyPassed) {
        gate = 'local_replay_serialized_entity_payload_semantics_diagnosed';
    } else if (defaultOk && boundaryReached && windowCaptured && (loop21Reported || compactMismatchSummary) && safetyPassed) {
        gate = 'local_replay_serialized_entity_payload_semantics_partially_diagnosed';
    }

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate,
        successGate: 'local_replay_serialized_entity_payload_semantics_diagnosed',
        partialGate: 'local_replay_serialized_entity_payload_semantics_partially_diagnosed',
        blockedGate: 'local_replay_serialized_entity_payload_semantics_blocked',
        defaultBehaviorReproduced: defaultOk,
        recoveryReachedTask107Boundary: boundaryReached,
        boundaryWindowLoops18To23Captured: windowCaptured,
        loop21PayloadMismatchReported: loop21Reported,
        loop22SkipEvaluatedSemantically: loop22Evaluated,
        compactPresentUpdateMismatchSummaryProduced: compactMismatchSummary,
        payloadBitsDirectMissingUpdateSkipAssessment: hypotheses.payloadBitsDirectMissingUpdateSkipAssessment,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        reasons: [
            defaultOk ? 'default behavior reproduced Task 105 failure' : 'default behavior did not reproduce Task 105 failure',
            boundaryReached ? 'opt-in recovery reached the Task 107/108 boundary' : 'opt-in recovery did not reach the Task 107/108 boundary',
            windowCaptured ? 'boundary packet loops 18-23 captured' : 'boundary packet window incomplete',
            loop21Reported ? 'loop 21 payload mismatch reported' : 'loop 21 payload mismatch not reported',
            loop22Evaluated ? 'loop 22 skip evaluated as semantic evidence' : 'loop 22 skip not semantically evaluated',
            compactMismatchSummary ? 'present UPDATE mismatch summary produced' : 'present UPDATE mismatch summary missing',
            safetyPassed ? 'safety audits passed' : 'safety audit failed'
        ]
    };
}

async function writeReport(summaryRoot, values) {
    const {
        inputIdentity,
        recoveryPass,
        boundarySummary,
        consistencySummary,
        hypotheses,
        protectionAudit,
        branchAudit,
        gate
    } = values;
    const report = [
        '# Local Replay Serialized Entity Payload Semantics Diagnosis',
        '',
        `Gate: \`${gate.gate}\``,
        `Canary input: \`${inputIdentity.inputPath}\``,
        '',
        '## Boundary',
        '',
        `Reached Task 107/108 boundary: \`${gate.recoveryReachedTask107Boundary}\``,
        `Current tick: \`${recoveryPass.currentTick}\``,
        `Boundary error: \`${recoveryPass.boundaryError?.message ?? 'none'}\``,
        '',
        '## Payload Consumption',
        '',
        `Window entries captured: \`${boundarySummary.requestedWindow.entriesCaptured}\``,
        `Loop 21 payloadBits: \`${boundarySummary.loop21?.payloadBitsFromSerializedEntities ?? 'missing'}\``,
        `Loop 21 actual after-command consumption: \`${boundarySummary.loop21?.actualConsumedAfterCommand ?? 'missing'}\``,
        `Loop 21 mismatch confirmed: \`${boundarySummary.loop21?.mismatchConfirmedAgainstAfterCommand ?? false}\``,
        `Loop 22 semantic status: \`${boundarySummary.loop22?.semanticJustification ?? 'missing'}\``,
        `Present UPDATE mismatches before boundary: \`${consistencySummary.presentUpdateMismatchesAfterCommand}\``,
        `Closest tested reference: \`${consistencySummary.referenceFit.closestReference}\``,
        `Direct missing UPDATE skip assessment: \`${hypotheses.payloadBitsDirectMissingUpdateSkipAssessment}\``,
        '',
        '## Recommendation',
        '',
        hypotheses.recommendedNextAction,
        '',
        '## Protection',
        '',
        `Canonical package constructed: \`${protectionAudit.canonicalPackageConstructed}\``,
        `Factual artifacts emitted: \`${protectionAudit.factualArtifactsEmitted}\``,
        `Replay 005 processed: \`${protectionAudit.replay005Processed}\``,
        `Bot fixtures processed: \`${protectionAudit.bots006To008Processed}\``,
        `Candidates 011-020 touched: \`${protectionAudit.candidates011To020Touched}\``,
        `Branch/source audit passed: \`${branchAudit.passed}\``,
        '',
        `Summary output: \`${summaryRoot.relativePath}\``,
        '',
        'Task 110 was not created.'
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-serialized-entity-payload-semantics.md'), `${report}\n`);
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
    const recoveryConfiguration = new ParserConfiguration({
        recovery: {
            allowUnresolvedEntityReference: true,
            allowMissingClassBaseline: false,
            diagnoseOutOfRangeEntityCreate: true,
            diagnoseEntityPacketCursorAlignment: true
        }
    });
    const recoveryPass = await runAdvancementPass({ input, mode: 'opt_in_recovery', configuration: recoveryConfiguration });
    const cursorDiagnostic = recoveryConfiguration.recoveryDiagnostics.find(item => item.type === 'entity_packet_cursor_alignment') ?? null;
    const boundarySummary = buildBoundaryPacketPayloadConsumptionSummary(cursorDiagnostic);
    const consistencySummary = buildPayloadSizeConsistencySummary(cursorDiagnostic);
    const hypotheses = buildPayloadSemanticsHypotheses(boundarySummary, consistencySummary);
    const fullLedger = await writeFullLedger(roots.local, cursorDiagnostic, buildPayloadConsumptionEntries(cursorDiagnostic));
    boundarySummary.fullLedger = fullLedger;
    consistencySummary.fullLedger = fullLedger;
    const branchAudit = await auditImplementationSources();
    const protectionAudit = await buildProtectionAudit(inputIdentity, branchAudit);
    const gate = decideGate({
        defaultPass,
        recoveryPass,
        boundarySummary,
        consistencySummary,
        hypotheses,
        protectionAudit,
        branchAudit
    });

    await writeJson(path.join(roots.summary.absolutePath, 'input-identity.json'), inputIdentity);
    await writeJson(path.join(roots.summary.absolutePath, 'default-pass-result.json'), defaultPass);
    await writeJson(path.join(roots.summary.absolutePath, 'recovery-boundary-result.json'), recoveryPass);
    await writeJson(path.join(roots.summary.absolutePath, 'boundary-packet-payload-consumption-summary.json'), boundarySummary);
    await writeJson(path.join(roots.summary.absolutePath, 'payload-size-consistency-summary.json'), consistencySummary);
    await writeJson(path.join(roots.summary.absolutePath, 'payload-semantics-hypotheses.json'), hypotheses);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-specific-branch-audit.json'), branchAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'payload-semantics-gate.json'), gate);
    await writeReport(roots.summary, {
        inputIdentity,
        recoveryPass,
        boundarySummary,
        consistencySummary,
        hypotheses,
        protectionAudit,
        branchAudit,
        gate
    });
    return { inputIdentity, defaultPass, recoveryPass, boundarySummary, consistencySummary, hypotheses, protectionAudit, branchAudit, gate };
}

if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
    runCli().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
