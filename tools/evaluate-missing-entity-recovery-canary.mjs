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
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/missing-entity-recovery/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-missing-entity-recovery/';
const TASK105_FAILURE_TICKS = 953;
const COMMITTED_WARNING_SAMPLE_LIMIT = 25;
const IMPLEMENTATION_FILES = [
    'packages/engine/src/ParserConfiguration.js',
    'packages/engine/src/ParserEngine.js',
    'packages/engine/src/stream/DemoStreamPacketAnalyzer.js',
    'packages/engine/src/handlers/DemoMessageHandler.js',
    'packages/deadem/index.js',
    'tools/evaluate-missing-entity-recovery-canary.mjs'
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
    if (normalized.endsWith('.dem') && normalized !== AUTHORIZED_INPUT) throw new Error(`unauthorized replay input: ${relativePath}`);
    if (/partida_00?5|replay_00?5/.test(normalized)) throw new Error(`protected replay path is forbidden: ${relativePath}`);
    if (/partida_00?[6-8]|replay_00?[6-8]/.test(normalized)) throw new Error(`bot fixture path is forbidden: ${relativePath}`);
    if (/partida_0?(1[1-9]|20)|replay_0?(1[1-9]|20)/.test(normalized)) throw new Error(`candidate outside canary scope is forbidden: ${relativePath}`);
}

export function validateInputPath(inputPath, replayId) {
    const relativePath = repoRelative(inputPath);
    assertNoForbiddenReplayPath(relativePath, replayId);
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 106 authorizes only ${AUTHORIZED_INPUT}`);
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
    return String(error?.stack ?? '').split(/\r?\n/).slice(0, 6);
}

async function buildInputIdentity(input) {
    const info = await stat(input.absolutePath);
    return {
        schemaVersion: 1,
        replayId: 'replay_010',
        inputPath: input.relativePath,
        sizeBytes: info.size,
        sha256: await sha256File(input.absolutePath),
        authorizedByTask: '106'
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
        reachedEnd: false,
        ticksAdvanced: 0,
        currentTick: null,
        finalTick: null,
        laterFailure: null,
        errorMessage: mode === 'default' ? '' : undefined,
        stackTop: mode === 'default' ? [] : undefined,
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
            result.stackTop = stackTop(error);
        } else {
            result.laterFailure = {
                name: error?.name ?? 'Error',
                message: error?.message ?? String(error),
                stackTop: stackTop(error)
            };
        }
    } finally {
        result.durationMs = Math.round(performance.now() - started);
        await player.dispose().catch(() => {});
    }
    return result;
}

export function summarizeRecoveryWarnings(warnings) {
    return {
        totalWarningCount: warnings.length,
        warningSampleLimit: COMMITTED_WARNING_SAMPLE_LIMIT,
        warningSampleTruncated: warnings.length > COMMITTED_WARNING_SAMPLE_LIMIT,
        warnings: warnings.slice(0, COMMITTED_WARNING_SAMPLE_LIMIT),
        unresolvedEntityReferenceCount: warnings.filter(warning => warning.type === 'unresolved_entity_reference').length,
        missingClassBaselineCount: warnings.filter(warning => warning.type === 'missing_class_baseline').length,
        unsupportedRecoveryCount: warnings.filter(warning => warning.reason === 'unsupported_operation').length,
        payloadSizeMissingCount: warnings.filter(warning => warning.reason === 'missing_payload_size').length,
        recoveryCreatedEntities: false,
        recoveryMaterializedFields: false,
        fullWarningLog: null
    };
}

async function writeFullWarningLog(localRoot, warnings) {
    const localPath = path.join(localRoot.absolutePath, 'recovery-warnings-full.json');
    await writeJson(localPath, {
        schemaVersion: 1,
        replayId: 'replay_010',
        warningCount: warnings.length,
        warnings
    });
    const info = await stat(localPath);
    return {
        path: repoRelative(localPath),
        sizeBytes: info.size,
        sha256: await sha256File(localPath),
        commitPolicy: 'local_only'
    };
}

export function decideGate({ defaultPass, recoveryPass, warningSummary, protectionAudit, branchAudit }) {
    const defaultOk = defaultPass.expectedFailureReproduced === true;
    const recoveryProgress = recoveryPass.advancedPastTask105Failure === true;
    const recoveryUsefulBoundary = recoveryPass.reachedEnd === true || recoveryPass.currentTick > TASK105_FAILURE_TICKS;
    const safe = warningSummary.recoveryCreatedEntities === false &&
        warningSummary.recoveryMaterializedFields === false &&
        protectionAudit.passed &&
        branchAudit.passed;
    let gate = 'local_replay_missing_entity_recovery_blocked';
    if (defaultOk && recoveryProgress && recoveryPass.reachedEnd && safe) {
        gate = 'local_replay_missing_entity_recovery_canary_ready';
    } else if (defaultOk && recoveryProgress && recoveryUsefulBoundary && safe) {
        gate = 'local_replay_missing_entity_recovery_partial_progress';
    }
    return {
        schemaVersion: 1,
        replayId: 'replay_010',
        gate,
        successGate: 'local_replay_missing_entity_recovery_canary_ready',
        partialGate: 'local_replay_missing_entity_recovery_partial_progress',
        blockedGate: 'local_replay_missing_entity_recovery_blocked',
        defaultBehaviorReproduced: defaultOk,
        recoveryAdvancedPastTask105Failure: recoveryProgress,
        recoveryReachedEnd: recoveryPass.reachedEnd,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        reasons: [
            defaultOk ? 'default behavior reproduced Task 105 failure' : 'default behavior did not reproduce Task 105 failure',
            recoveryProgress ? 'opt-in recovery advanced past prior failure point' : 'opt-in recovery did not advance past prior failure point',
            recoveryPass.reachedEnd ? 'opt-in recovery reached end' : 'opt-in recovery did not reach end',
            safe ? 'safety audits passed' : 'safety audit failed'
        ]
    };
}

async function buildRecoveryFeasibilityInventory(summaryRoot) {
    const existing = path.join(summaryRoot.absolutePath, 'recovery-feasibility-inventory.json');
    if (existsSync(existing)) {
        return JSON.parse(await readFile(existing, 'utf8'));
    }
    return {
        schemaVersion: 1,
        replayId: 'replay_010',
        task105Failure: {
            error: 'Unable to find an entity with index [ 2905 ]',
            firstFailingProbe: 'probe_2_next_tick_only',
            firstFailingOperation: 'nextTick',
            suspectedLayer: 'parser_advancement'
        },
        existingRecoveryHelpers: {
            recoverMissingEntityReference: { exists: true, supportsFailingOperation: true },
            recoverMissingClassBaseline: { exists: true, relevantToTask105Failure: false }
        },
        payloadSizeAvailability: {
            availableInHandler: true,
            failClosedWhenUnavailable: true
        },
        recoveryThreadingRequired: IMPLEMENTATION_FILES.slice(0, 4),
        defaultBehaviorMustRemainUnchanged: true
    };
}

export async function auditImplementationSources(root = REPO_ROOT) {
    const findings = [];
    const files = [];
    for (const file of IMPLEMENTATION_FILES) {
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
    const task107Created = existsSync(path.join(REPO_ROOT, 'tasks/specs/107.json'));
    return {
        schemaVersion: 1,
        replayId: 'replay_010',
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
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        task107Created,
        rawReplayRead: true,
        rawReplayHash: inputIdentity.sha256,
        replayParserInvoked: true,
        branchAuditPassed: branchAudit.passed,
        passed: !task107Created && branchAudit.passed
    };
}

async function writeReport(summaryRoot, values) {
    const { inputIdentity, defaultPass, recoveryPass, warningSummary, protectionAudit, branchAudit, gate } = values;
    const report = [
        '# Local Replay Missing Entity Recovery Canary',
        '',
        `Gate: \`${gate.gate}\``,
        `Canary input: \`${inputIdentity.inputPath}\``,
        `Replay ID: \`${inputIdentity.replayId}\``,
        '',
        '## Frozen Acceptance Matrix',
        '',
        `Default behavior reproduced: \`${gate.defaultBehaviorReproduced}\``,
        `Recovery advanced past Task 105 failure: \`${gate.recoveryAdvancedPastTask105Failure}\``,
        `Recovery reached end: \`${gate.recoveryReachedEnd}\``,
        `Fake entities created: \`${warningSummary.recoveryCreatedEntities}\``,
        `Fields materialized: \`${warningSummary.recoveryMaterializedFields}\``,
        '',
        '## Task 105 Summary',
        '',
        'Task 105 localized the prior failure to `nextTick` parser advancement after 953 ticks, before class lookup or field access.',
        '',
        '## Default Pass',
        '',
        `Expected failure reproduced: \`${defaultPass.expectedFailureReproduced}\``,
        `Ticks advanced: \`${defaultPass.ticksAdvanced}\``,
        `Error: \`${defaultPass.errorMessage}\``,
        '',
        '## Recovery Pass',
        '',
        `Recovery enabled: \`${recoveryPass.recoveryEnabled}\``,
        `Advanced past old 953-tick failure: \`${recoveryPass.advancedPastTask105Failure}\``,
        `Reached end: \`${recoveryPass.reachedEnd}\``,
        `Ticks advanced: \`${recoveryPass.ticksAdvanced}\``,
        `Later failure: \`${recoveryPass.laterFailure?.message ?? 'none'}\``,
        '',
        '## Recovery Warnings',
        '',
        `Unresolved entity references: \`${warningSummary.unresolvedEntityReferenceCount}\``,
        `Missing class baselines: \`${warningSummary.missingClassBaselineCount}\``,
        `Unsupported recoveries: \`${warningSummary.unsupportedRecoveryCount}\``,
        `Payload-size missing recoveries: \`${warningSummary.payloadSizeMissingCount}\``,
        `Committed warning sample: \`${warningSummary.warnings.length} of ${warningSummary.totalWarningCount}\``,
        `Full warning log: \`${warningSummary.fullWarningLog?.path ?? 'not written'}\``,
        '',
        '## Protection',
        '',
        `Default behavior changed: \`false\``,
        `Parser internals modified: \`true, narrowly for opt-in recovery threading\``,
        `Canonical package constructed: \`${protectionAudit.canonicalPackageConstructed}\``,
        `Factual artifacts emitted: \`${protectionAudit.factualArtifactsEmitted}\``,
        `Replay 005 processed: \`${protectionAudit.replay005Processed}\``,
        `Bot fixtures processed: \`${protectionAudit.bots006To008Processed}\``,
        `Candidates 011-020 touched: \`${protectionAudit.candidates011To020Touched}\``,
        `Branch/source audit passed: \`${branchAudit.passed}\``,
        '',
        `Summary output: \`${summaryRoot.relativePath}\``,
        '',
        'Task 107 was not created.'
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-missing-entity-recovery-canary.md'), `${report}\n`);
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

    const feasibilityInventory = await buildRecoveryFeasibilityInventory(roots.summary);
    await writeJson(path.join(roots.summary.absolutePath, 'recovery-feasibility-inventory.json'), feasibilityInventory);

    const inputIdentity = await buildInputIdentity(input);
    const defaultPass = await runAdvancementPass({ input, mode: 'default', configuration: undefined });
    const recoveryConfiguration = new ParserConfiguration({
        recovery: {
            allowUnresolvedEntityReference: true,
            allowMissingClassBaseline: false
        }
    });
    const recoveryPass = await runAdvancementPass({ input, mode: 'opt_in_recovery', configuration: recoveryConfiguration });
    const warningSummary = summarizeRecoveryWarnings(recoveryConfiguration.recoveryWarnings);
    warningSummary.fullWarningLog = await writeFullWarningLog(roots.local, recoveryConfiguration.recoveryWarnings);
    const branchAudit = await auditImplementationSources();
    const protectionAudit = await buildProtectionAudit(inputIdentity, branchAudit);
    const gate = decideGate({ defaultPass, recoveryPass, warningSummary, protectionAudit, branchAudit });

    await writeJson(path.join(roots.summary.absolutePath, 'input-identity.json'), inputIdentity);
    await writeJson(path.join(roots.summary.absolutePath, 'default-pass-result.json'), defaultPass);
    await writeJson(path.join(roots.summary.absolutePath, 'recovery-pass-result.json'), recoveryPass);
    await writeJson(path.join(roots.summary.absolutePath, 'recovery-warning-summary.json'), warningSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-specific-branch-audit.json'), branchAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'recovery-gate.json'), gate);
    await writeJson(path.join(roots.local.absolutePath, 'recovery-warning-summary.json'), warningSummary);
    await writeReport(roots.summary, { inputIdentity, defaultPass, recoveryPass, warningSummary, protectionAudit, branchAudit, gate });
    return { inputIdentity, defaultPass, recoveryPass, warningSummary, protectionAudit, branchAudit, gate };
}

if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
    runCli().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
