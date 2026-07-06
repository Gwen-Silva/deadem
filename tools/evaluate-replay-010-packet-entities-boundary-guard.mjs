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
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/packet-entities-boundary-guard/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-packet-entities-boundary-guard/';
const TASK118_ROOT = 'output/local-replay-processing/replay_010-packet-953-buffer-boundary/';
const TASK105_ERROR = 'Unable to find an entity with index [ 2905 ]';
const BOUNDARY_ERROR = 'entity packet boundary crossed';
const EXPECTED_PACKET_ORDINAL = 953;
const EXPECTED_ENTITY_DATA_BITS = 5344;
const EXPECTED_LOOP26_AFTER_ACTION = 5343;
const EXPECTED_LOOP27_AFTER_INDEX = 5349;
const EXPECTED_LOOP27 = 27;
const SAMPLES_TOKEN = ['samples'].join('');
const OUTPUT_REPLAYS_TOKEN = ['output', 'replays'].join('/');
const IMPLEMENTATION_FILES = [
    'packages/engine/src/ParserConfiguration.js',
    'packages/engine/src/handlers/DemoMessageHandler.js',
    'tools/evaluate-replay-010-packet-entities-boundary-guard.mjs'
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
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 119 authorizes only ${AUTHORIZED_INPUT}`);
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
        authorizedByTask: '119',
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
        recoveryActionsEnabled: false,
        expectedFailureReproduced: false,
        boundaryFailureReproduced: false,
        reachedOriginalMissingEntity2905: false,
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
        result.reachedOriginalMissingEntity2905 = error?.message === TASK105_ERROR;
        result.errorMessage = error?.message ?? String(error);
        result.stackTop = sanitizeStack(error);
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        await player.dispose().catch(() => {});
    }

    return result;
}

function findBoundaryDiagnostic(configuration) {
    return configuration.recoveryDiagnostics
        .find(diagnostic => diagnostic.type === 'entity_packet_boundary_crossing') ?? null;
}

export function buildBoundaryGuardDiagnostic({ guardPass, diagnostic }) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        guardEnabled: guardPass.guardEnabled,
        guardTriggered: guardPass.boundaryFailureReproduced && diagnostic !== null,
        errorMessage: guardPass.errorMessage,
        reachedOriginalMissingEntity2905: guardPass.reachedOriginalMissingEntity2905,
        packetOrdinal: diagnostic?.packetOrdinal ?? null,
        loop: diagnostic?.loop ?? null,
        entityDataBitLength: diagnostic?.entityDataBitLength ?? null,
        beforeIndexReadCount: diagnostic?.beforeIndexReadCount ?? null,
        afterIndexReadCount: diagnostic?.afterIndexReadCount ?? null,
        afterCommandReadCount: diagnostic?.afterCommandReadCount ?? null,
        afterActionReadCount: diagnostic?.afterActionReadCount ?? null,
        violationStage: diagnostic?.violationStage ?? null,
        bitsBeyondEntityData: diagnostic?.bitsBeyondEntityData ?? null,
        operation: diagnostic?.operation ?? null,
        entityIndex: diagnostic?.entityIndex ?? null,
        phantomEntriesPrevented: diagnostic?.phantomEntriesPrevented === true,
        fakeEntityCreated: diagnostic?.fakeEntityCreated === true,
        fieldsMaterializedAfterBoundary: diagnostic?.fieldsMaterializedAfterBoundary === true,
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

export function buildTask118Comparison({ boundaryDiagnostic, task118Inventory, task118Classification, task118Gate, bitbufferBehavior }) {
    const loop27 = task118Inventory.loopRows.find(entry => entry.loop === 27);
    const loop28 = task118Classification.classifications.find(entry => entry.loop === 28);
    const loop29 = task118Classification.classifications.find(entry => entry.loop === 29);

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        task118Gate: task118Gate.gate,
        expected: {
            entityDataBitLength: EXPECTED_ENTITY_DATA_BITS,
            loop26AfterActionReadCount: EXPECTED_LOOP26_AFTER_ACTION,
            loop27AfterIndexReadCount: EXPECTED_LOOP27_AFTER_INDEX,
            loop27Classification: 'padding_or_trailing_bit_reads',
            loop28Classification: 'out_of_buffer_reads',
            loop29Classification: 'out_of_buffer_reads'
        },
        observedFromTask118: {
            entityDataBitLength: task118Inventory.entityDataBitLength,
            loop26AfterActionReadCount: task118Inventory.loop26AfterActionReadCount,
            loop27AfterIndexReadCount: loop27?.readCounts?.afterIndex ?? null,
            loop27EndsAtOrBeyondEntityData: loop27?.indexReadBoundary?.endsBeyondEntityDataBitLength ?? null,
            loop28Classification: loop28?.classification ?? null,
            loop29Classification: loop29?.classification ?? null
        },
        observedFromGuard: {
            packetOrdinal: boundaryDiagnostic.packetOrdinal,
            loop: boundaryDiagnostic.loop,
            violationStage: boundaryDiagnostic.violationStage,
            afterIndexReadCount: boundaryDiagnostic.afterIndexReadCount,
            bitsBeyondEntityData: boundaryDiagnostic.bitsBeyondEntityData
        },
        bitbufferSyntheticResultReused: true,
        bitbufferCanAdvanceBeyondEndInSyntheticProbes: bitbufferBehavior.readsBeyondEndCanAdvanceWithoutThrowing === true,
        matchesTask118ExpectedBoundary: boundaryDiagnostic.packetOrdinal === EXPECTED_PACKET_ORDINAL &&
            boundaryDiagnostic.loop === EXPECTED_LOOP27 &&
            boundaryDiagnostic.violationStage === 'after_index' &&
            boundaryDiagnostic.entityDataBitLength === EXPECTED_ENTITY_DATA_BITS &&
            boundaryDiagnostic.afterIndexReadCount === EXPECTED_LOOP27_AFTER_INDEX,
        rawValuesReemitted: false
    };
}

function buildPhantomEntryAudit({ boundaryDiagnostic, task118Classification }) {
    const loop27 = task118Classification.classifications.find(entry => entry.loop === 27);
    const loop28 = task118Classification.classifications.find(entry => entry.loop === 28);
    const loop29 = task118Classification.classifications.find(entry => entry.loop === 29);

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        guardTriggeredBeforeLoop27SemanticCommand: boundaryDiagnostic.guardTriggered === true &&
            boundaryDiagnostic.loop === 27 &&
            boundaryDiagnostic.violationStage === 'after_index',
        expectedPhantomLoops: [27, 28, 29],
        task118Classifications: {
            loop27: loop27?.classification ?? null,
            loop28: loop28?.classification ?? null,
            loop29: loop29?.classification ?? null
        },
        phantomEntriesPrevented: boundaryDiagnostic.phantomEntriesPrevented === true,
        reachedOriginalMissingEntity2905: boundaryDiagnostic.reachedOriginalMissingEntity2905,
        fakeEntityCreated: boundaryDiagnostic.fakeEntityCreated,
        fieldsMaterializedAfterBoundary: boundaryDiagnostic.fieldsMaterializedAfterBoundary,
        placeholderEntityCreated: false,
        recoveryOutputProduced: false,
        canonicalFactsProduced: false,
        sourceArtifactsProduced: false,
        conclusion: boundaryDiagnostic.guardTriggered === true ?
            'opt-in guard interrupts packet 953 at loop 27 boundary before the original packet 954 missing entity' :
            'opt-in guard did not demonstrate early boundary interruption'
    };
}

function buildRiskAssessment({ defaultPass, guardPass, task118Comparison, phantomAudit }) {
    const strengthened = defaultPass.expectedFailureReproduced === true &&
        guardPass.boundaryFailureReproduced === true &&
        guardPass.reachedOriginalMissingEntity2905 === false &&
        task118Comparison.matchesTask118ExpectedBoundary === true &&
        phantomAudit.phantomEntriesPrevented === true;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        boundaryGuardHypothesis: strengthened ? 'boundary_guard_hypothesis_strengthened' : 'guard_hypothesis_blocked_or_incomplete',
        defaultParserFixProposed: false,
        defaultBehaviorChanged: false,
        recoveryAddedOrPromoted: false,
        source2SemanticsClaimed: false,
        replayCorruptionClaimed: false,
        parserBugConcluded: false,
        safestNextStep: 'human_review_before_any_default_parser_change',
        limitations: [
            'guard is diagnostic opt-in only',
            'Task 119 does not prove Source 2 payload semantics',
            'Task 119 does not authorize recovery or canonical facts'
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
        if (/allowUnresolvedEntityReference\s*:\s*true/.test(source) && file !== 'tools/evaluate-replay-010-packet-entities-boundary-guard.mjs') {
            findings.push({ type: 'recovery_enabled_outside_tool', file });
        }
    }

    return {
        schemaVersion: 1,
        filesExamined: IMPLEMENTATION_FILES,
        findings,
        replaySpecificBranchFound: findings.some(finding => finding.type === 'replay_specific_branch'),
        passed: findings.length === 0
    };
}

function buildProtectionAudit({ inputIdentity, branchAudit, guardConfiguration }) {
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
        recoveryActionsEnabled: false,
        diagnosticBoundaryGuardEnabled: guardConfiguration.recovery?.diagnoseEntityPacketBoundaryGuard === true,
        replaySpecificBranchFound: branchAudit.replaySpecificBranchFound,
        passed: branchAudit.passed
    };
}

function decideGate({ defaultPass, guardPass, boundaryDiagnostic, task118Comparison, phantomAudit, protectionAudit, branchAudit }) {
    const diagnosed = defaultPass.expectedFailureReproduced === true &&
        guardPass.boundaryFailureReproduced === true &&
        boundaryDiagnostic.guardTriggered === true &&
        boundaryDiagnostic.reachedOriginalMissingEntity2905 === false &&
        task118Comparison.matchesTask118ExpectedBoundary === true &&
        phantomAudit.phantomEntriesPrevented === true &&
        protectionAudit.passed === true &&
        branchAudit.passed === true;
    const partial = defaultPass.expectedFailureReproduced === true &&
        guardPass.guardEnabled === true &&
        protectionAudit.passed === true &&
        branchAudit.passed === true;

    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate: diagnosed ?
            'local_replay_packet_entities_boundary_guard_diagnosed' :
            (partial ? 'local_replay_packet_entities_boundary_guard_partial' : 'local_replay_packet_entities_boundary_guard_blocked'),
        successGate: 'local_replay_packet_entities_boundary_guard_diagnosed',
        partialGate: 'local_replay_packet_entities_boundary_guard_partial',
        blockedGate: 'local_replay_packet_entities_boundary_guard_blocked',
        defaultFailureReproduced: defaultPass.expectedFailureReproduced,
        guardTriggered: boundaryDiagnostic.guardTriggered,
        reachedOriginalMissingEntity2905: boundaryDiagnostic.reachedOriginalMissingEntity2905,
        matchesTask118ExpectedBoundary: task118Comparison.matchesTask118ExpectedBoundary,
        phantomEntriesPrevented: phantomAudit.phantomEntriesPrevented,
        defaultBehaviorChanged: false,
        recoveryAddedOrPromoted: false,
        canonicalFactsProduced: false,
        task120Created: false,
        passed: diagnosed,
        conclusion: diagnosed ?
            'opt-in fail-closed guard stops packet 953 at loop 27 after-index boundary before the original missing entity' :
            'opt-in boundary guard evaluation is incomplete or blocked'
    };
}

function buildReport({ defaultPass, guardPass, boundaryDiagnostic, task118Comparison, phantomAudit, gate }) {
    return [
        '# Replay 010 PacketEntities Boundary Guard Evaluation',
        '',
        `Gate: \`${gate.gate}\``,
        '',
        '## Result',
        '',
        `- Default pass reproduced Task 105 missing entity 2905: \`${defaultPass.expectedFailureReproduced}\``,
        `- Guard pass triggered before original missing entity: \`${guardPass.boundaryFailureReproduced && !guardPass.reachedOriginalMissingEntity2905}\``,
        `- Boundary packet/loop/stage: \`${boundaryDiagnostic.packetOrdinal}/${boundaryDiagnostic.loop}/${boundaryDiagnostic.violationStage}\``,
        `- Boundary read count: \`${boundaryDiagnostic.afterIndexReadCount}\` of \`${boundaryDiagnostic.entityDataBitLength}\` bits`,
        `- Matches Task 118 expected boundary: \`${task118Comparison.matchesTask118ExpectedBoundary}\``,
        `- Phantom entries prevented: \`${phantomAudit.phantomEntriesPrevented}\``,
        '',
        '## Limits',
        '',
        '- The guard is opt-in diagnostic/fail-closed only.',
        '- No recovery, placeholder entity, fake field, canonical package, source artifact, or match fact was produced.',
        '- No Source 2 semantic conclusion, parser bug conclusion, or replay corruption conclusion is made.'
    ].join('\n');
}

async function run({ inputPath, replayId, localOutput, summaryOutput }) {
    const input = validateInputPath(inputPath, replayId);
    const roots = validateOutputRoots(localOutput, summaryOutput);
    const inputIdentity = await buildInputIdentity(input);
    const defaultPass = await runPlayerPass({
        input,
        mode: 'default_without_boundary_guard',
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
    const guardDiagnostic = findBoundaryDiagnostic(guardConfiguration);
    const boundaryDiagnostic = buildBoundaryGuardDiagnostic({ guardPass, diagnostic: guardDiagnostic });
    const task118Inventory = await readJson(`${TASK118_ROOT}packet-953-boundary-inventory.json`);
    const task118Classification = await readJson(`${TASK118_ROOT}loops-27-29-boundary-classification.json`);
    const task118Gate = await readJson(`${TASK118_ROOT}buffer-boundary-gate.json`);
    const bitbufferBehavior = await readJson(`${TASK118_ROOT}bitbuffer-boundary-behavior.json`);
    const task118Comparison = buildTask118Comparison({
        boundaryDiagnostic,
        task118Inventory,
        task118Classification,
        task118Gate,
        bitbufferBehavior
    });
    const phantomAudit = buildPhantomEntryAudit({ boundaryDiagnostic, task118Classification });
    const branchAudit = await auditImplementationSources();
    const protectionAudit = buildProtectionAudit({ inputIdentity, branchAudit, guardConfiguration });
    const riskAssessment = buildRiskAssessment({ defaultPass, guardPass, task118Comparison, phantomAudit });
    const gate = decideGate({
        defaultPass,
        guardPass,
        boundaryDiagnostic,
        task118Comparison,
        phantomAudit,
        protectionAudit,
        branchAudit
    });

    await writeJson(path.join(roots.local.absolutePath, 'full-boundary-guard-diagnostics.json'), {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        localOnly: true,
        rawEntityDataIncluded: false,
        rawSerializedEntitiesIncluded: false,
        rawPayloadsIncluded: false,
        stringBytesIncluded: false,
        stringValuesIncluded: false,
        fieldValuesIncluded: false,
        recoveryWarnings: guardConfiguration.recoveryWarnings,
        recoveryDiagnostics: guardConfiguration.recoveryDiagnostics
    });

    const outputs = {
        'input-identity.json': inputIdentity,
        'default-pass-result.json': defaultPass,
        'guard-pass-result.json': {
            ...guardPass,
            recoveryWarnings: guardConfiguration.recoveryWarnings,
            boundaryDiagnosticsCount: guardConfiguration.recoveryDiagnostics.filter(diagnostic => diagnostic.type === 'entity_packet_boundary_crossing').length
        },
        'boundary-guard-diagnostic.json': boundaryDiagnostic,
        'task118-comparison.json': task118Comparison,
        'phantom-entry-prevention-audit.json': phantomAudit,
        'risk-assessment.json': riskAssessment,
        'protection-audit.json': protectionAudit,
        'replay-specific-branch-audit.json': branchAudit,
        'boundary-guard-gate.json': gate
    };

    for (const [fileName, value] of Object.entries(outputs)) {
        await writeJson(path.join(roots.summary.absolutePath, fileName), value);
        await writeJson(path.join(roots.local.absolutePath, fileName), value);
    }

    const report = buildReport({
        defaultPass,
        guardPass,
        boundaryDiagnostic,
        task118Comparison,
        phantomAudit,
        gate
    });
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-packet-entities-boundary-guard.md'), `${report}\n`);

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
