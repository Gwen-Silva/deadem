#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Logger, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_FILENAME = 'partida_010.dem';
const AUTHORIZED_REPLAY_ID = 'replay_010';
const SUCCESS_GATE = 'generic_local_replay_processing_canary_ready';
const PARTIAL_GATE = 'generic_local_replay_source_artifacts_ready_canonicalization_pending';
const BLOCKED_GATE = 'generic_local_replay_processing_canary_blocked';
const DEFAULT_LOCAL_OUTPUT = '.local/deadem/cache/local-replay-processing/replay_010/';
const DEFAULT_SUMMARY_OUTPUT = 'output/local-replay-processing/replay_010-canary/';

function slash(value) {
    return value.replaceAll(path.sep, '/');
}

function repoRelative(absolutePath, root = REPO_ROOT) {
    return slash(path.relative(root, absolutePath));
}

function assertRelativeInput(value, label) {
    if (!value || path.isAbsolute(value)) throw new Error(`${label} must be a relative repository path`);
    const normalized = slash(value);
    if (normalized.split('/').includes('..')) throw new Error(`${label} must not contain traversal`);
    return normalized;
}

function resolveInside(root, relativePath, label) {
    const normalized = assertRelativeInput(relativePath, label);
    const resolved = path.resolve(root, normalized);
    const relative = path.relative(root, resolved);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`${label} must stay inside repository root`);
    }
    return { normalized, resolved };
}

function hasProtectedReplayPattern(value) {
    return /(?:partida|replay|match)[_-]?00?5\.dem?/iu.test(value)
        || /replay[_-]?00?5/iu.test(value)
        || /partida[_-]?00?5/iu.test(value);
}

function hasUnsupportedBotPattern(value) {
    return /(?:replay|partida|match)[_-]?00?(6|7|8)(?:\.dem)?/iu.test(value)
        || /bot[_-]?fixture/iu.test(value);
}

export function replayIdForFilename(filename) {
    return filename === AUTHORIZED_FILENAME ? AUTHORIZED_REPLAY_ID : null;
}

export function selectDefaultCanary(filenames) {
    return filenames.filter(filename => filename === AUTHORIZED_FILENAME);
}

export function validateInputPath(inputPath, options = {}) {
    const root = options.root ?? REPO_ROOT;
    const { normalized, resolved } = resolveInside(root, inputPath, 'input');
    const basename = path.basename(normalized);
    const parent = slash(path.dirname(normalized));
    const errors = [];
    if (parent !== '.local/deadem/replays/inbox') errors.push('input must be directly under .local/deadem/replays/inbox/');
    if (basename !== AUTHORIZED_FILENAME) errors.push(`input filename must be ${AUTHORIZED_FILENAME}`);
    if (hasProtectedReplayPattern(normalized)) errors.push('input matches protected replay pattern');
    if (hasUnsupportedBotPattern(normalized)) errors.push('input matches unsupported bot fixture pattern');
    if (normalized.startsWith('samples/')) errors.push('input must not come from samples/');
    return {
        valid: errors.length === 0,
        errors,
        normalized,
        resolved,
        basename,
        replayId: replayIdForFilename(basename)
    };
}

export function validateOutputRoots(localOutput, summaryOutput, options = {}) {
    const root = options.root ?? REPO_ROOT;
    const local = resolveInside(root, localOutput, 'local output');
    const summary = resolveInside(root, summaryOutput, 'summary output');
    const errors = [];
    if (!slash(local.normalized).startsWith(DEFAULT_LOCAL_OUTPUT)) {
        errors.push(`local output must be under ${DEFAULT_LOCAL_OUTPUT}`);
    }
    if (!slash(summary.normalized).startsWith(DEFAULT_SUMMARY_OUTPUT)) {
        errors.push(`summary output must be under ${DEFAULT_SUMMARY_OUTPUT}`);
    }
    return { valid: errors.length === 0, errors, local, summary };
}

async function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
        const stream = createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', resolve);
    });
    return hash.digest('hex');
}

async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
    const args = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}`);
        args.set(key.slice(2), value);
    }
    return {
        input: args.get('input'),
        replayId: args.get('replay-id'),
        localOutput: args.get('local-output'),
        summaryOutput: args.get('summary-output')
    };
}

function safeNumber(value) {
    return Number.isFinite(value) ? value : null;
}

async function attemptParserLoad(inputPath, localOutputPath, replayId) {
    const started = performance.now();
    const parserSummaryPath = path.join(localOutputPath, 'parser-source-summary.json');
    const parserErrorPath = path.join(localOutputPath, 'parser-error.json');
    const player = new Player(undefined, Logger.NOOP);
    try {
        await player.load(createReadStream(inputPath));
        const firstTick = safeNumber(player.getFirstTick());
        const lastTick = safeNumber(player.getLastTick());
        const tickRate = safeNumber(player.getDemo().server?.tickRate) ?? 64;
        const durationSeconds = firstTick === null || lastTick === null ? null : Math.max(0, Math.floor((lastTick - Math.max(0, firstTick)) / tickRate));
        const stats = player.getDemo().getStats?.() ?? null;
        const summary = {
            artifactType: 'parser_source_summary',
            replayId,
            parserApi: 'deadem.Player.load(createReadStream(input))',
            completed: true,
            firstTick,
            lastTick,
            tickRate,
            durationSeconds,
            stats,
            generatedAtLogical: 'task_102_canary',
            limitations: [
                'This is a compact source-artifact canary, not a canonical factual package.',
                'No lane, region, proximity, mechanic, fight, rotation, pressure, macro, or decision semantics are emitted.'
            ]
        };
        await writeJson(parserSummaryPath, summary);
        return {
            status: 'source_artifacts_ready',
            parserApiAvailable: true,
            parserCompleted: true,
            localArtifacts: [repoRelative(parserSummaryPath)],
            summary,
            durationMs: Math.round(performance.now() - started)
        };
    } catch (error) {
        const parserError = {
            artifactType: 'parser_error',
            replayId,
            parserApi: 'deadem.Player.load(createReadStream(input))',
            completed: false,
            errorName: error.name,
            errorMessage: error.message,
            stackTop: String(error.stack ?? '').split(/\r?\n/).slice(0, 4),
            generatedAtLogical: 'task_102_canary'
        };
        await writeJson(parserErrorPath, parserError);
        return {
            status: 'parser_blocked',
            parserApiAvailable: true,
            parserCompleted: false,
            localArtifacts: [repoRelative(parserErrorPath)],
            error: parserError,
            durationMs: Math.round(performance.now() - started)
        };
    } finally {
        await player.dispose?.();
    }
}

function buildPipelineInventory() {
    return {
        schemaVersion: 1,
        replayId: AUTHORIZED_REPLAY_ID,
        phase: 'pipeline_inventory_before_parse',
        candidateInput: '.local/deadem/replays/inbox/partida_010.dem',
        parserEntrypoints: [
            {
                id: 'deadem_player_load_stream',
                sourcePath: 'packages/deadem/index.js',
                api: 'Player.load(createReadStream(inputPath))',
                genericLocalPathSupport: 'supported_by_api_shape',
                limitations: [
                    'The existing replay-009 telemetry script hardcodes samples paths; this canary uses the Player API directly instead.',
                    'Canonical package construction for arbitrary local input remains separate from source-artifact generation.'
                ]
            }
        ],
        existingHardcodedPathsObserved: [
            'scripts/validate-replay-009-telemetry.js uses samples/replay_009_normal.dem and is not reused for this local canary.'
        ],
        blockedPaths: [
            'samples/**',
            'output/replays/**',
            'output/replay-002-canonical/**',
            'output/replay-009-canonical/**'
        ],
        noReplaySpecificBranchPolicy: 'The canary accepts only the authorized filename but must not add replay_010-only canonical branches.',
        inventoryConclusion: 'generic_player_api_available_for_bounded_canary'
    };
}

function buildProtectionAudit(inputValidation, outputValidation, sourceArtifacts) {
    const artifacts = sourceArtifacts ?? [];
    return {
        schemaVersion: 1,
        passed: inputValidation.valid && outputValidation.valid,
        authorizedInputOnly: inputValidation.normalized === '.local/deadem/replays/inbox/partida_010.dem',
        replay005Accessed: false,
        botFixtures006To008Processed: false,
        candidates011To020Processed: false,
        samplesReadOrWritten: false,
        outputReplaysReadOrWritten: false,
        rawReplayCopied: false,
        localArtifactsCommitted: false,
        rawReplayCommitted: false,
        artifactPaths: artifacts,
        errors: [...inputValidation.errors, ...outputValidation.errors]
    };
}

export function auditReplaySpecificBranches(sourceText) {
    const findings = [];
    const lines = sourceText.split(/\r?\n/);
    lines.forEach((line, index) => {
        if (/\bif\s*\([^)]*replay_010/iu.test(line) || /switch\s*\([^)]*replayId/iu.test(line)) {
            findings.push({
                line: index + 1,
                text: line.trim(),
                severity: 'blocked',
                reason: 'replay-specific branch detected'
            });
        }
    });
    return {
        passed: findings.length === 0,
        filesExamined: ['tools/process-local-replay-input.mjs'],
        findings
    };
}

export function decideGate({ parserCompleted, canonicalReady, protectionsPassed, branchAuditPassed }) {
    if (!protectionsPassed || !branchAuditPassed) return BLOCKED_GATE;
    if (parserCompleted && canonicalReady) return SUCCESS_GATE;
    if (parserCompleted && !canonicalReady) return PARTIAL_GATE;
    return BLOCKED_GATE;
}

async function run() {
    const cli = parseArgs(process.argv.slice(2));
    if (!cli.input || !cli.replayId || !cli.localOutput || !cli.summaryOutput) {
        throw new Error('Required: --input --replay-id --local-output --summary-output');
    }
    if (cli.replayId !== AUTHORIZED_REPLAY_ID) throw new Error(`replay-id must be ${AUTHORIZED_REPLAY_ID}`);

    const started = performance.now();
    const inputValidation = validateInputPath(cli.input);
    const outputValidation = validateOutputRoots(cli.localOutput, cli.summaryOutput);
    const summaryDir = outputValidation.summary.resolved;
    const localDir = outputValidation.local.resolved;
    await mkdir(summaryDir, { recursive: true });
    await mkdir(localDir, { recursive: true });

    await writeJson(path.join(summaryDir, 'pipeline-inventory.json'), buildPipelineInventory());

    const inputExists = existsSync(inputValidation.resolved);
    const inputStat = inputExists ? await stat(inputValidation.resolved) : null;
    const identity = {
        schemaVersion: 1,
        replayId: cli.replayId,
        inputPath: inputValidation.normalized,
        exists: inputExists,
        sizeBytes: inputStat?.size ?? null,
        sha256: inputExists && inputValidation.valid ? await sha256File(inputValidation.resolved) : null,
        hashAuthorizedByTask102: true,
        parserReadAuthorizedByTask102: true,
        rawReplayCommitted: false,
        limitations: [
            'This identity record is for partida_010.dem only.',
            'No other inbox candidates were read, hashed, parsed, or processed.'
        ],
        validation: {
            inputPathValid: inputValidation.valid,
            errors: inputValidation.errors
        }
    };
    await writeJson(path.join(summaryDir, 'input-identity.json'), identity);

    let parserResult = {
        status: 'not_attempted',
        parserApiAvailable: false,
        parserCompleted: false,
        localArtifacts: [],
        durationMs: 0
    };
    if (inputValidation.valid && outputValidation.valid && inputExists) {
        parserResult = await attemptParserLoad(inputValidation.resolved, localDir, cli.replayId);
    }

    const sourceManifest = {
        schemaVersion: 1,
        replayId: cli.replayId,
        status: parserResult.status,
        committedSourceArtifacts: [],
        localOnlySourceArtifacts: parserResult.localArtifacts,
        sourceArtifactGenerationWorked: parserResult.parserCompleted,
        parserApiAvailable: parserResult.parserApiAvailable,
        parserCompleted: parserResult.parserCompleted,
        limitations: parserResult.parserCompleted
            ? ['Source artifact generation worked; canonical package construction for arbitrary local input remains pending.']
            : ['Parser source artifact generation did not complete.']
    };
    await writeJson(path.join(summaryDir, 'source-artifact-manifest.json'), sourceManifest);

    const canonicalManifest = {
        schemaVersion: 1,
        replayId: cli.replayId,
        canonicalPackageConstructed: false,
        canonicalValidationRun: false,
        status: parserResult.parserCompleted ? 'canonicalization_pending' : 'not_available',
        committedCanonicalArtifacts: [],
        localCanonicalArtifacts: [],
        limitations: [
            'Task 102 does not wire replay_010 into the canonical factual package pipeline.',
            'No factual events, snapshots, entity registry, player registry, lanes, regions, proximity, mechanics, fights, rotations, pressure, macro, roles, or decisions are emitted.'
        ]
    };
    await writeJson(path.join(summaryDir, 'canonical-compact-manifest.json'), canonicalManifest);

    const sourceText = await readFile(THIS_FILE, 'utf8');
    const branchAudit = auditReplaySpecificBranches(sourceText);
    await writeJson(path.join(summaryDir, 'replay-specific-branch-audit.json'), branchAudit);

    const protectionAudit = buildProtectionAudit(inputValidation, outputValidation, parserResult.localArtifacts);
    await writeJson(path.join(summaryDir, 'protection-audit.json'), protectionAudit);

    const performanceBaseline = {
        schemaVersion: 1,
        replayId: cli.replayId,
        parserDurationMs: parserResult.durationMs,
        totalDurationMs: Math.round(performance.now() - started),
        measuredOperation: 'single authorized local replay canary',
        limitations: ['One run only; not a scaling benchmark.']
    };
    await writeJson(path.join(summaryDir, 'performance-baseline.json'), performanceBaseline);

    const storageBaseline = {
        schemaVersion: 1,
        replayId: cli.replayId,
        rawReplaySizeBytes: identity.sizeBytes,
        committedSummaryFiles: [
            'pipeline-inventory.json',
            'input-identity.json',
            'source-artifact-manifest.json',
            'canonical-compact-manifest.json',
            'validation-summary.json',
            'performance-baseline.json',
            'storage-baseline.json',
            'protection-audit.json',
            'replay-specific-branch-audit.json',
            'local-processing-gate.json'
        ],
        localOnlyArtifacts: parserResult.localArtifacts,
        localOutputRoot: outputValidation.local.normalized,
        summaryOutputRoot: outputValidation.summary.normalized,
        rawReplayCommitted: false,
        fullParserArtifactsCommitted: false
    };
    await writeJson(path.join(summaryDir, 'storage-baseline.json'), storageBaseline);

    const gate = decideGate({
        parserCompleted: parserResult.parserCompleted,
        canonicalReady: false,
        protectionsPassed: protectionAudit.passed,
        branchAuditPassed: branchAudit.passed
    });
    const validationSummary = {
        schemaVersion: 1,
        replayId: cli.replayId,
        sourceArtifactGenerationWorked: parserResult.parserCompleted,
        canonicalPackageConstructed: false,
        canonicalValidationRun: false,
        protectionsPassed: protectionAudit.passed,
        replaySpecificBranchAuditPassed: branchAudit.passed,
        gate,
        blockers: gate === BLOCKED_GATE
            ? [
                ...(inputExists ? [] : ['authorized input file missing']),
                ...inputValidation.errors,
                ...outputValidation.errors,
                ...(parserResult.error ? [`parser failed: ${parserResult.error.errorMessage}`] : [])
            ]
            : ['canonical package construction is pending for generic local input']
    };
    await writeJson(path.join(summaryDir, 'validation-summary.json'), validationSummary);

    const localProcessingGate = {
        schemaVersion: 1,
        replayId: cli.replayId,
        gate,
        fullSuccessGate: SUCCESS_GATE,
        partialGate: PARTIAL_GATE,
        blockedGate: BLOCKED_GATE,
        status: gate === PARTIAL_GATE ? 'source_artifacts_ready_canonicalization_pending' : (gate === SUCCESS_GATE ? 'ready' : 'blocked'),
        reasons: validationSummary.blockers
    };
    await writeJson(path.join(summaryDir, 'local-processing-gate.json'), localProcessingGate);

    return localProcessingGate;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    run().then(result => {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }).catch(error => {
        process.stderr.write(`${error.stack ?? error.message}\n`);
        process.exitCode = 1;
    });
}
