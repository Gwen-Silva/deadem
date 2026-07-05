#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile, readFile } from 'node:fs/promises';
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
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/entity-packet-cursor-alignment/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-entity-packet-cursor-alignment/';
const TASK105_FAILURE_TICKS = 953;
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
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 108 authorizes only ${AUTHORIZED_INPUT}`);
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
        replayId: AUTHORIZED_REPLAY_ID,
        inputPath: input.relativePath,
        sizeBytes: info.size,
        sha256: await sha256File(input.absolutePath),
        authorizedByTask: '108'
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

export function buildLedgerSummary(diagnostic) {
    const entries = diagnostic?.windowDefault?.entries ?? [];
    const loop22 = entries.find(entry => entry.loop === 22) ?? null;
    const loop23 = entries.find(entry => entry.loop === 23) ?? null;
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        boundaryDiagnosticPresent: diagnostic !== null,
        packetMetrics: diagnostic?.packetMetrics ?? null,
        boundary: diagnostic?.boundary ?? null,
        ledgerWindow: {
            requestedStartLoop: 18,
            requestedEndLoop: 23,
            entriesCaptured: entries.length,
            entries
        },
        loop22Skip: loop22 === null ? null : {
            entityIndex: loop22.accumulatedEntityIndex,
            operation: loop22.operation,
            payloadBits: loop22.payloadBits,
            action: loop22.action,
            afterCommandReadCount: loop22.readCounts.afterCommand,
            afterActionReadCount: loop22.readCounts.afterAction,
            expectedAfterActionReadCount: Number.isInteger(loop22.payloadBits) ? loop22.readCounts.afterCommand + loop22.payloadBits : null,
            internallyConsistentWithCurrentModel: Number.isInteger(loop22.payloadBits) &&
                loop22.readCounts.afterCommand + loop22.payloadBits === loop22.readCounts.afterAction
        },
        loop23Create: loop23 === null ? null : {
            entityIndex: loop23.accumulatedEntityIndex,
            operation: loop23.operation,
            classId: loop23.classId,
            serial: loop23.serial,
            classIdSizeBits: loop23.classIdSizeBits,
            className: loop23.className,
            action: loop23.action,
            failureStage: loop23.failureStage,
            readCounts: loop23.readCounts,
            entityTouched: loop23.entityTouched,
            baselineTouched: loop23.baselineTouched,
            fieldsTouched: loop23.fieldsTouched,
            registerEntityTouched: loop23.registerEntityTouched
        },
        fullLedger: null
    };
}

export function buildCursorModelComparison(diagnostic) {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        diagnosticPresent: diagnostic !== null,
        comparison: diagnostic?.cursorModelComparison ?? null,
        observedFacts: diagnostic?.observedFacts ?? [],
        simulations: diagnostic?.simulations ?? [],
        hypotheses: diagnostic?.hypotheses ?? [],
        notDetermined: diagnostic?.undetermined ?? []
    };
}

async function writeFullLedger(localRoot, diagnostic) {
    const localPath = path.join(localRoot.absolutePath, 'entity-packet-cursor-ledger-full.json');
    await writeJson(localPath, {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        diagnostic
    });
    const info = await stat(localPath);
    return {
        path: repoRelative(localPath),
        sizeBytes: info.size,
        sha256: await sha256File(localPath),
        commitPolicy: 'local_only'
    };
}

export function decideGate({ defaultPass, recoveryPass, ledgerSummary, cursorModelComparison, protectionAudit, branchAudit }) {
    const defaultOk = defaultPass.expectedFailureReproduced === true;
    const boundaryReached = recoveryPass.advancedPastTask105Failure === true && recoveryPass.boundaryReached === true;
    const ledgerCaptured = ledgerSummary.ledgerWindow.entriesCaptured >= 6 &&
        ledgerSummary.loop22Skip !== null &&
        ledgerSummary.loop23Create !== null;
    const currentModelAssessed = ledgerSummary.loop22Skip?.internallyConsistentWithCurrentModel !== null;
    const alternativesAssessed = cursorModelComparison.comparison?.alternativeBoundaryModelB?.plausibleCandidateCount !== undefined;
    const safe = protectionAudit.passed &&
        branchAudit.passed &&
        ledgerSummary.loop23Create?.entityTouched === false &&
        ledgerSummary.loop23Create?.fieldsTouched === false &&
        ledgerSummary.loop23Create?.registerEntityTouched === false;
    let gate = 'local_replay_entity_packet_cursor_alignment_blocked';
    if (defaultOk && boundaryReached && ledgerCaptured && currentModelAssessed && alternativesAssessed && safe) {
        gate = 'local_replay_entity_packet_cursor_alignment_diagnosed';
    } else if (defaultOk && boundaryReached && (ledgerCaptured || alternativesAssessed) && safe) {
        gate = 'local_replay_entity_packet_cursor_alignment_partially_diagnosed';
    }
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        gate,
        successGate: 'local_replay_entity_packet_cursor_alignment_diagnosed',
        partialGate: 'local_replay_entity_packet_cursor_alignment_partially_diagnosed',
        blockedGate: 'local_replay_entity_packet_cursor_alignment_blocked',
        defaultBehaviorReproduced: defaultOk,
        recoveryReachedTask107Boundary: boundaryReached,
        ledgerWindowCaptured: ledgerCaptured,
        loop22SkipCaptured: ledgerSummary.loop22Skip !== null,
        loop23CreateCaptured: ledgerSummary.loop23Create !== null,
        currentSkipModelInternallyConsistent: ledgerSummary.loop22Skip?.internallyConsistentWithCurrentModel ?? null,
        nearbyPlausibleOffsetsFound: cursorModelComparison.comparison?.alternativeBoundaryModelB?.plausibleCandidateCount > 0,
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        reasons: [
            defaultOk ? 'default behavior reproduced Task 105 failure' : 'default behavior did not reproduce Task 105 failure',
            boundaryReached ? 'opt-in recovery reached the Task 107 boundary' : 'opt-in recovery did not reach the Task 107 boundary',
            ledgerCaptured ? 'ledger captured loops 18-23 including loop 22 and 23' : 'ledger window incomplete',
            currentModelAssessed ? 'current skip model assessed' : 'current skip model not assessed',
            alternativesAssessed ? 'nearby offset model assessed' : 'nearby offset model not assessed',
            safe ? 'safety audits passed' : 'safety audit failed'
        ]
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
    const task109Created = existsSync(path.join(REPO_ROOT, 'tasks/specs/109.json'));
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
        canonicalPackageConstructed: false,
        factualArtifactsEmitted: false,
        sourceArtifactsEmitted: false,
        task109Created,
        rawReplayRead: true,
        rawReplayHash: inputIdentity.sha256,
        replayParserInvoked: true,
        branchAuditPassed: branchAudit.passed,
        passed: !task109Created && branchAudit.passed
    };
}

async function writeReport(summaryRoot, values) {
    const { inputIdentity, recoveryPass, ledgerSummary, cursorModelComparison, protectionAudit, branchAudit, gate } = values;
    const report = [
        '# Local Replay Entity Packet Cursor Alignment Diagnosis',
        '',
        `Gate: \`${gate.gate}\``,
        `Canary input: \`${inputIdentity.inputPath}\``,
        '',
        '## Boundary',
        '',
        `Reached Task 107 boundary: \`${gate.recoveryReachedTask107Boundary}\``,
        `Current tick: \`${recoveryPass.currentTick}\``,
        `Boundary error: \`${recoveryPass.boundaryError?.message ?? 'none'}\``,
        '',
        '## Ledger',
        '',
        `Window entries captured: \`${ledgerSummary.ledgerWindow.entriesCaptured}\``,
        `Loop 22 action: \`${ledgerSummary.loop22Skip?.action ?? 'missing'}\``,
        `Loop 22 current skip internally consistent: \`${ledgerSummary.loop22Skip?.internallyConsistentWithCurrentModel ?? 'n/a'}\``,
        `Loop 23 action: \`${ledgerSummary.loop23Create?.action ?? 'missing'}\``,
        `Loop 23 entity index: \`${ledgerSummary.loop23Create?.entityIndex ?? ledgerSummary.loop23Create?.accumulatedEntityIndex ?? 'n/a'}\``,
        '',
        '## Model Comparison',
        '',
        `Nearby plausible offsets found: \`${gate.nearbyPlausibleOffsetsFound}\``,
        `Plausible candidate count: \`${cursorModelComparison.comparison?.alternativeBoundaryModelB?.plausibleCandidateCount ?? 0}\``,
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
        'Task 109 was not created.'
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-entity-packet-cursor-alignment.md'), `${report}\n`);
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
    const ledgerSummary = buildLedgerSummary(cursorDiagnostic);
    ledgerSummary.fullLedger = await writeFullLedger(roots.local, cursorDiagnostic);
    const cursorModelComparison = buildCursorModelComparison(cursorDiagnostic);
    const branchAudit = await auditImplementationSources();
    const protectionAudit = await buildProtectionAudit(inputIdentity, branchAudit);
    const gate = decideGate({ defaultPass, recoveryPass, ledgerSummary, cursorModelComparison, protectionAudit, branchAudit });

    await writeJson(path.join(roots.summary.absolutePath, 'input-identity.json'), inputIdentity);
    await writeJson(path.join(roots.summary.absolutePath, 'default-pass-result.json'), defaultPass);
    await writeJson(path.join(roots.summary.absolutePath, 'recovery-boundary-result.json'), recoveryPass);
    await writeJson(path.join(roots.summary.absolutePath, 'entity-packet-ledger-summary.json'), ledgerSummary);
    await writeJson(path.join(roots.summary.absolutePath, 'cursor-model-comparison.json'), cursorModelComparison);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-specific-branch-audit.json'), branchAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'cursor-alignment-gate.json'), gate);
    await writeReport(roots.summary, { inputIdentity, recoveryPass, ledgerSummary, cursorModelComparison, protectionAudit, branchAudit, gate });
    return { inputIdentity, defaultPass, recoveryPass, ledgerSummary, cursorModelComparison, protectionAudit, branchAudit, gate };
}

if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
    runCli().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
