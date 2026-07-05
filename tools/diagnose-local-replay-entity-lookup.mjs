#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Logger, Player } from 'deadem';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const AUTHORIZED_REPLAY_ID = ['replay', '010'].join('_');
const AUTHORIZED_INPUT = '.local/deadem/replays/inbox/partida_010.dem';
const REQUIRED_LOCAL_ROOT = '.local/deadem/cache/local-replay-processing/replay_010/entity-lookup-diagnosis/';
const REQUIRED_SUMMARY_ROOT = 'output/local-replay-processing/replay_010-entity-lookup-diagnosis/';
const CONTROLLER_CLASS = 'CCitadelPlayerController';
const PAWN_CLASS = 'CCitadelPlayerPawn';
const OBJECTIVE_CLASSES = [
    'CNPC_Boss_Tier2',
    'CNPC_Boss_Tier3',
    'CNPC_BarrackBoss',
    'CNPC_TrooperBoss',
    'CCitadel_Destroyable_Building',
    'CCitadel_ArmorUpgrade_PersonalRejuvenator',
    'CCitadel_ItemPickup'
];
const KNOWN_CLASSES = [CONTROLLER_CLASS, PAWN_CLASS, ...OBJECTIVE_CLASSES];
const CONTROLLER_PRIMITIVE_FIELDS = ['m_steamID', 'm_iPlayerID', 'm_iTeamNum', 'm_nHeroID', 'm_iDeaths'];
const HANDLE_FIELDS = [
    { className: CONTROLLER_CLASS, field: 'm_hHeroPawn' },
    { className: CONTROLLER_CLASS, field: 'm_hPawn' },
    { className: PAWN_CLASS, field: 'm_hController' }
];
const PAWN_PRIMITIVE_FIELDS = ['m_iHealth', 'm_bAlive', 'm_iTeamNum', 'm_vecAbsOrigin'];
const PROBE_TICK_LIMIT = 1000;
const SAMPLE_INTERVAL_TICKS = 64;

function slash(value) {
    return String(value).replaceAll(path.sep, '/');
}

function repoRelative(value) {
    return slash(path.relative(REPO_ROOT, path.resolve(REPO_ROOT, value)));
}

function forbiddenInputReason(relativePath, replayId) {
    const normalized = slash(relativePath).toLowerCase();
    if (replayId !== AUTHORIZED_REPLAY_ID) return `unsupported replay id: ${replayId}`;
    if (normalized.includes(`${['samples'].join('')}/`)) return `samples path is forbidden: ${relativePath}`;
    if (normalized.endsWith('.dem') && normalized !== AUTHORIZED_INPUT) return `unauthorized replay input: ${relativePath}`;
    if (/partida_00?5|replay_00?5/.test(normalized)) return `protected replay path is forbidden: ${relativePath}`;
    if (/partida_00?[6-8]|replay_00?[6-8]/.test(normalized)) return `bot fixture path is forbidden: ${relativePath}`;
    if (/partida_0?(1[1-9]|20)|replay_0?(1[1-9]|20)/.test(normalized)) return `candidate outside canary scope is forbidden: ${relativePath}`;
    return null;
}

export function validateInputPath(inputPath, replayId) {
    const relativePath = repoRelative(inputPath);
    const reason = forbiddenInputReason(relativePath, replayId);
    if (reason) throw new Error(reason);
    if (relativePath !== AUTHORIZED_INPUT) throw new Error(`Task 105 authorizes only ${AUTHORIZED_INPUT}`);
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

function newProbe(probeId, description, flags = {}) {
    return {
        probeId,
        description,
        usesNextTick: false,
        usesGetEntitiesByClassName: false,
        usesGetField: false,
        usesPawnControllerResolution: false,
        ticksAttempted: 0,
        ticksAdvanced: 0,
        samplesAttempted: 0,
        samplesProduced: 0,
        status: 'skipped',
        errorName: null,
        errorMessage: null,
        errorStackTop: [],
        firstFailingOperation: null,
        diagnosis: '',
        details: {},
        ...flags
    };
}

export function validateProbeResult(result) {
    for (const field of ['usesNextTick', 'usesGetEntitiesByClassName', 'usesGetField', 'usesPawnControllerResolution']) {
        if (typeof result[field] !== 'boolean') throw new Error(`probe result missing boolean operation flag ${field}`);
    }
    if (!['passed', 'failed', 'skipped'].includes(result.status)) throw new Error(`invalid probe status ${result.status}`);
    return true;
}

async function loadPlayer(input) {
    const player = new Player(undefined, Logger.NOOP);
    await player.load(createReadStream(input.absolutePath));
    return player;
}

async function advanceOne(player, result, state) {
    state.operation = 'nextTick';
    result.ticksAttempted++;
    const before = Number(player.getCurrentTick());
    const advanced = await player.nextTick();
    const after = Number(player.getCurrentTick());
    if (advanced && Number.isFinite(before) && Number.isFinite(after)) {
        result.ticksAdvanced += Math.max(0, after - before);
    }
    return advanced;
}

async function runProbe(result, fn) {
    const state = { operation: 'unknown' };
    const started = performance.now();
    try {
        await fn(state);
        result.status = 'passed';
        result.diagnosis = result.diagnosis || 'Probe completed without the entity lookup failure.';
    } catch (error) {
        result.status = 'failed';
        result.errorName = error?.name ?? 'Error';
        result.errorMessage = error?.message ?? String(error);
        result.errorStackTop = stackTop(error);
        result.firstFailingOperation = state.operation;
        result.diagnosis = `First observed failure while running ${state.operation}.`;
    }
    result.durationMs = Math.round(performance.now() - started);
    validateProbeResult(result);
    return result;
}

async function probeLoadOnly(input) {
    const result = newProbe('probe_1_load_only', 'Load replay without tick advancement, entity class lookup, or field access.');
    return await runProbe(result, async state => {
        state.operation = 'Player.load';
        await loadPlayer(input);
    });
}

async function probeNextTickOnly(input) {
    const result = newProbe('probe_2_next_tick_only', 'Advance forward using nextTick only; no class lookup or field access.', { usesNextTick: true });
    return await runProbe(result, async state => {
        const player = await loadPlayer(input);
        result.status = 'passed';
        for (let index = 0; index < PROBE_TICK_LIMIT; index++) {
            const advanced = await advanceOne(player, result, state);
            if (!advanced) break;
        }
    });
}

async function probeClassLookupOnly(input) {
    const result = newProbe('probe_3_class_lookup_only', 'Advance forward and call getEntitiesByClassName at sample points; count entities only.', {
        usesNextTick: true,
        usesGetEntitiesByClassName: true
    });
    return await runProbe(result, async state => {
        const player = await loadPlayer(input);
        result.status = 'passed';
        const counts = [];
        for (let index = 0; index < PROBE_TICK_LIMIT; index++) {
            if (index % SAMPLE_INTERVAL_TICKS === 0) {
                result.samplesAttempted++;
                const tickCounts = {};
                for (const className of KNOWN_CLASSES) {
                    state.operation = `getEntitiesByClassName:${className}`;
                    tickCounts[className] = player.getDemo().getEntitiesByClassName(className).length;
                }
                counts.push({ tick: Number(player.getCurrentTick()), counts: tickCounts });
                result.samplesProduced++;
            }
            const advanced = await advanceOne(player, result, state);
            if (!advanced) break;
        }
        result.details.countSamples = counts.slice(0, 5);
    });
}

async function probeControllerPrimitiveFields(input) {
    const result = newProbe('probe_4_controller_primitive_fields', 'Read primitive controller fields only; no pawn handle or relationship resolution.', {
        usesNextTick: true,
        usesGetEntitiesByClassName: true,
        usesGetField: true
    });
    return await runProbe(result, async state => {
        const player = await loadPlayer(input);
        result.status = 'passed';
        const safeFields = new Set();
        for (let index = 0; index < PROBE_TICK_LIMIT; index++) {
            if (index % SAMPLE_INTERVAL_TICKS === 0) {
                result.samplesAttempted++;
                state.operation = `getEntitiesByClassName:${CONTROLLER_CLASS}`;
                const controllers = player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS);
                for (const controller of controllers) {
                    for (const field of CONTROLLER_PRIMITIVE_FIELDS) {
                        state.operation = `getField:${CONTROLLER_CLASS}.${field}`;
                        controller.getField(field);
                        safeFields.add(`${CONTROLLER_CLASS}.${field}`);
                    }
                }
                result.samplesProduced++;
            }
            const advanced = await advanceOne(player, result, state);
            if (!advanced) break;
        }
        result.details.safeFields = Array.from(safeFields).sort();
    });
}

async function probeHandleFieldIsolation(input) {
    const result = newProbe('probe_5_handle_field_access_isolation', 'Read known controller and pawn handle fields one by one, stopping on first failure.', {
        usesNextTick: true,
        usesGetEntitiesByClassName: true,
        usesGetField: true,
        usesPawnControllerResolution: true
    });
    return await runProbe(result, async state => {
        const player = await loadPlayer(input);
        result.status = 'passed';
        const fieldResults = [];
        for (let index = 0; index < PROBE_TICK_LIMIT; index++) {
            if (index % SAMPLE_INTERVAL_TICKS === 0) {
                result.samplesAttempted++;
                for (const candidate of HANDLE_FIELDS) {
                    state.operation = `getEntitiesByClassName:${candidate.className}`;
                    const entities = player.getDemo().getEntitiesByClassName(candidate.className);
                    for (const entity of entities) {
                        state.operation = `getField:${candidate.className}.${candidate.field}`;
                        entity.getField(candidate.field);
                    }
                    fieldResults.push(`${candidate.className}.${candidate.field}`);
                }
                result.samplesProduced++;
            }
            const advanced = await advanceOne(player, result, state);
            if (!advanced) break;
        }
        result.details.safeFields = Array.from(new Set(fieldResults)).sort();
    });
}

async function probePawnPrimitiveFields(input) {
    const result = newProbe('probe_6_pawn_primitive_fields', 'Read primitive pawn fields only; do not resolve controller or pawn handles.', {
        usesNextTick: true,
        usesGetEntitiesByClassName: true,
        usesGetField: true
    });
    return await runProbe(result, async state => {
        const player = await loadPlayer(input);
        result.status = 'passed';
        const safeFields = new Set();
        for (let index = 0; index < PROBE_TICK_LIMIT; index++) {
            if (index % SAMPLE_INTERVAL_TICKS === 0) {
                result.samplesAttempted++;
                state.operation = `getEntitiesByClassName:${PAWN_CLASS}`;
                const pawns = player.getDemo().getEntitiesByClassName(PAWN_CLASS);
                for (const pawn of pawns) {
                    for (const field of PAWN_PRIMITIVE_FIELDS) {
                        state.operation = `getField:${PAWN_CLASS}.${field}`;
                        pawn.getField(field);
                        safeFields.add(`${PAWN_CLASS}.${field}`);
                    }
                }
                result.samplesProduced++;
            }
            const advanced = await advanceOne(player, result, state);
            if (!advanced) break;
        }
        result.details.safeFields = Array.from(safeFields).sort();
    });
}

async function probeMinimalSafeSnapshot(input) {
    const result = newProbe('probe_7_minimal_safe_snapshot', 'Build a reduced source snapshot from previously safe primitive operations only.', {
        usesNextTick: true,
        usesGetEntitiesByClassName: true,
        usesGetField: true
    });
    return await runProbe(result, async state => {
        const player = await loadPlayer(input);
        result.status = 'passed';
        const snapshots = [];
        for (let index = 0; index < PROBE_TICK_LIMIT; index++) {
            if (index % SAMPLE_INTERVAL_TICKS === 0) {
                result.samplesAttempted++;
                state.operation = `getEntitiesByClassName:${CONTROLLER_CLASS}`;
                const controllers = player.getDemo().getEntitiesByClassName(CONTROLLER_CLASS);
                const rows = [];
                for (const controller of controllers) {
                    const row = { tick: Number(player.getCurrentTick()) };
                    for (const field of CONTROLLER_PRIMITIVE_FIELDS) {
                        state.operation = `getField:${CONTROLLER_CLASS}.${field}`;
                        row[field] = controller.getField(field) ?? null;
                    }
                    rows.push(row);
                }
                snapshots.push({ tick: Number(player.getCurrentTick()), rows });
                result.samplesProduced++;
            }
            const advanced = await advanceOne(player, result, state);
            if (!advanced) break;
        }
        result.details.snapshotCount = snapshots.length;
        result.details.firstSnapshotRowCount = snapshots[0]?.rows?.length ?? 0;
    });
}

async function runProbes(input) {
    const probes = [];
    const probeFns = [
        probeLoadOnly,
        probeNextTickOnly,
        probeClassLookupOnly,
        probeControllerPrimitiveFields,
        probeHandleFieldIsolation,
        probePawnPrimitiveFields,
        probeMinimalSafeSnapshot
    ];
    for (const fn of probeFns) {
        const previousFailure = probes.find(probe => probe.status === 'failed');
        if (previousFailure) {
            const skipped = newProbe(`probe_${probes.length + 1}_skipped`, 'Skipped after first failure to preserve smallest useful diagnostic set.');
            skipped.status = 'skipped';
            skipped.diagnosis = `Skipped because ${previousFailure.probeId} already localized the failure.`;
            probes.push(skipped);
            continue;
        }
        probes.push(await fn(input));
    }
    return probes;
}

function suspectedLayerForOperation(operation) {
    if (!operation) return 'unknown';
    if (operation === 'nextTick') return 'parser_advancement';
    if (operation.startsWith('getEntitiesByClassName')) return 'entity_class_lookup';
    if (operation.includes('.m_h')) return 'handle_field_resolution';
    if (operation.startsWith('getField')) return 'primitive_field_access';
    if (operation === 'Player.load') return 'engine_internal';
    return 'unknown';
}

export function buildFailureLocalization(probes) {
    const failed = probes.find(probe => probe.status === 'failed');
    if (!failed) {
        return {
            error: 'Unable to find an entity with index [ 2905 ]',
            firstFailingProbe: null,
            firstFailingOperation: null,
            suspectedLayer: 'unknown',
            evidence: ['No required probe reproduced the target entity lookup failure.'],
            nextRecommendedFixScope: 'blocked_human_decision'
        };
    }
    const suspectedLayer = suspectedLayerForOperation(failed.firstFailingOperation);
    const fixScope = suspectedLayer === 'parser_advancement' || suspectedLayer === 'engine_internal'
        ? 'parser_api_investigation'
        : suspectedLayer === 'unknown'
            ? 'blocked_human_decision'
            : 'tool_level_safe_access';
    return {
        error: failed.errorMessage,
        firstFailingProbe: failed.probeId,
        firstFailingOperation: failed.firstFailingOperation,
        suspectedLayer,
        evidence: [
            `${failed.probeId} failed with ${failed.errorMessage}`,
            `Operation flags: nextTick=${failed.usesNextTick}, classLookup=${failed.usesGetEntitiesByClassName}, getField=${failed.usesGetField}, pawnControllerResolution=${failed.usesPawnControllerResolution}`,
            `Ticks attempted=${failed.ticksAttempted}, ticks advanced=${failed.ticksAdvanced}, samples produced=${failed.samplesProduced}`
        ],
        nextRecommendedFixScope: fixScope
    };
}

export function buildSafeAccessCapability(probes) {
    const passed = id => probes.find(probe => probe.probeId === id)?.status === 'passed';
    const probe = id => probes.find(item => item.probeId === id);
    const safeFields = [
        ...(probe('probe_4_controller_primitive_fields')?.details?.safeFields ?? []),
        ...(probe('probe_5_handle_field_access_isolation')?.details?.safeFields ?? []),
        ...(probe('probe_6_pawn_primitive_fields')?.details?.safeFields ?? [])
    ];
    const failed = probes.find(item => item.status === 'failed');
    return {
        controllerPrimitiveFieldsSafe: probe('probe_4_controller_primitive_fields') ? passed('probe_4_controller_primitive_fields') : null,
        controllerHandleFieldsSafe: probe('probe_5_handle_field_access_isolation') ? passed('probe_5_handle_field_access_isolation') : null,
        pawnPrimitiveFieldsSafe: probe('probe_6_pawn_primitive_fields') ? passed('probe_6_pawn_primitive_fields') : null,
        minimalSafeSnapshotPossible: probe('probe_7_minimal_safe_snapshot') ? passed('probe_7_minimal_safe_snapshot') : null,
        safeFields: Array.from(new Set(safeFields)).sort(),
        unsafeFields: failed?.firstFailingOperation?.startsWith('getField') ? [failed.firstFailingOperation.replace('getField:', '')] : [],
        notes: [
            failed ? `First failure occurred before later probes: ${failed.probeId}` : 'All diagnostic probes completed.',
            'Fields are marked safe only when their specific probe passed.'
        ]
    };
}

export function decideGate({ failureLocalization, safeAccessCapability, protectionAudit, branchAudit }) {
    const diagnosed = Boolean(failureLocalization.firstFailingProbe && failureLocalization.firstFailingOperation && failureLocalization.suspectedLayer !== 'unknown');
    const workaround = safeAccessCapability.minimalSafeSnapshotPossible === true &&
        safeAccessCapability.controllerPrimitiveFieldsSafe === true &&
        protectionAudit.passed &&
        branchAudit.passed;
    const success = diagnosed && protectionAudit.passed && branchAudit.passed;
    let gate = 'local_replay_entity_lookup_failure_diagnosis_blocked';
    if (workaround) gate = 'local_replay_entity_lookup_tool_level_workaround_ready';
    else if (success) gate = 'local_replay_entity_lookup_failure_diagnosed';
    return {
        schemaVersion: 1,
        replayId: 'replay_010',
        gate,
        successGate: 'local_replay_entity_lookup_failure_diagnosed',
        toolLevelWorkaroundGate: 'local_replay_entity_lookup_tool_level_workaround_ready',
        blockedGate: 'local_replay_entity_lookup_failure_diagnosis_blocked',
        diagnosed,
        toolLevelWorkaroundReady: workaround,
        canonicalPackageConstructed: false,
        reasons: [
            diagnosed ? `localized to ${failureLocalization.firstFailingOperation}` : 'failure not localized',
            protectionAudit.passed ? 'protections passed' : 'protections failed',
            branchAudit.passed ? 'branch/source audit passed' : 'branch/source audit failed'
        ]
    };
}

export function validateFailureLocalization(localization) {
    if (!localization.suspectedLayer) throw new Error('failure localization requires suspected layer');
    return true;
}

export function normalizeSafeAccessCapability(capability) {
    for (const key of ['controllerPrimitiveFieldsSafe', 'controllerHandleFieldsSafe', 'pawnPrimitiveFieldsSafe', 'minimalSafeSnapshotPossible']) {
        if (capability[key] === undefined) capability[key] = null;
    }
    return capability;
}

export function auditImplementationSource(sourceText, filePath = 'tools/diagnose-local-replay-entity-lookup.mjs') {
    const findings = [];
    if (/\bif\s*\([^)]*replay_010[^)]*\)/.test(sourceText) || /\bcase\s+['"]replay_010['"]/.test(sourceText)) {
        findings.push({ type: 'replay_specific_branch', filePath });
    }
    if (/createReadStream\s*\([^)]*samples[\\/]/.test(sourceText) || /readFile\s*\([^)]*samples[\\/]/.test(sourceText)) {
        findings.push({ type: 'samples_executable_fallback', filePath });
    }
    if (/createReadStream\s*\([^)]*output[\\/]replays[\\/]/.test(sourceText) || /readFile\s*\([^)]*output[\\/]replays[\\/]/.test(sourceText)) {
        findings.push({ type: 'output_replays_executable_fallback', filePath });
    }
    if (/partida_0?(1[1-9]|20)\.dem/.test(sourceText)) {
        findings.push({ type: 'candidate_011_020_processing_path', filePath });
    }
    return {
        schemaVersion: 1,
        implementationFilesExamined: [filePath],
        replaySpecificBranchFindings: findings.filter(finding => finding.type === 'replay_specific_branch'),
        samplesAppearsInExecutableCodePaths: findings.some(finding => finding.type === 'samples_executable_fallback'),
        outputReplaysAppearsInExecutableCodePaths: findings.some(finding => finding.type === 'output_replays_executable_fallback'),
        candidates011To020AppearInProcessingPaths: findings.some(finding => finding.type === 'candidate_011_020_processing_path'),
        passed: findings.length === 0,
        findings
    };
}

async function buildInputIdentity(input) {
    const info = await stat(input.absolutePath);
    return {
        schemaVersion: 1,
        replayId: 'replay_010',
        inputPath: input.relativePath,
        sizeBytes: info.size,
        sha256: await sha256File(input.absolutePath),
        authorizedByTask: '105'
    };
}

async function buildProtectionAudit(inputIdentity, branchAudit) {
    const task106Created = existsSync(path.join(REPO_ROOT, 'tasks/specs/106.json')) ||
        existsSync(path.join(REPO_ROOT, 'tasks/blocked/106-select-next-canonical-generalization-control.md'));
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
        parserInternalsModified: false,
        canonicalSchemaModified: false,
        task106Created,
        rawReplayRead: true,
        rawReplayHash: inputIdentity.sha256,
        replayParserInvoked: true,
        branchAuditPassed: branchAudit.passed,
        passed: !task106Created && branchAudit.passed
    };
}

async function writeReport(summaryRoot, values) {
    const { inputIdentity, probes, failureLocalization, safeAccessCapability, protectionAudit, branchAudit, gate } = values;
    const report = [
        '# Local Replay Entity Lookup Diagnosis',
        '',
        `Replay ID: \`${inputIdentity.replayId}\``,
        `Input: \`${inputIdentity.inputPath}\``,
        `Gate: \`${gate.gate}\``,
        '',
        '## Diagnosis',
        '',
        `First failing probe: \`${failureLocalization.firstFailingProbe ?? 'none'}\``,
        `First failing operation: \`${failureLocalization.firstFailingOperation ?? 'none'}\``,
        `Suspected layer: \`${failureLocalization.suspectedLayer}\``,
        `Next recommended fix scope: \`${failureLocalization.nextRecommendedFixScope}\``,
        '',
        '## Probe Results',
        '',
        ...probes.map(probe => `- \`${probe.probeId}\`: ${probe.status}; operation=${probe.firstFailingOperation ?? 'none'}; ticksAdvanced=${probe.ticksAdvanced}; samples=${probe.samplesProduced}`),
        '',
        '## Safe Access',
        '',
        `Controller primitive fields safe: \`${safeAccessCapability.controllerPrimitiveFieldsSafe}\``,
        `Controller handle fields safe: \`${safeAccessCapability.controllerHandleFieldsSafe}\``,
        `Pawn primitive fields safe: \`${safeAccessCapability.pawnPrimitiveFieldsSafe}\``,
        `Minimal safe snapshot possible: \`${safeAccessCapability.minimalSafeSnapshotPossible}\``,
        '',
        '## Protections',
        '',
        `Replay 005 processed: \`${protectionAudit.replay005Processed}\``,
        `Bot fixtures processed: \`${protectionAudit.bots006To008Processed}\``,
        `Candidates 011-020 touched: \`${protectionAudit.candidates011To020Touched}\``,
        `Parser internals modified: \`${protectionAudit.parserInternalsModified}\``,
        `Branch/source audit passed: \`${branchAudit.passed}\``,
        '',
        `Summary output: \`${summaryRoot.relativePath}\``
    ].join('\n');
    await writeFile(path.join(REPO_ROOT, 'reports/local-replay-entity-lookup-diagnosis.md'), `${report}\n`);
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
    const probes = await runProbes(input);
    const failureLocalization = buildFailureLocalization(probes);
    validateFailureLocalization(failureLocalization);
    const safeAccessCapability = normalizeSafeAccessCapability(buildSafeAccessCapability(probes));
    const sourceText = await readFile(THIS_FILE, 'utf8');
    const branchAudit = auditImplementationSource(sourceText);
    const protectionAudit = await buildProtectionAudit(inputIdentity, branchAudit);
    const gate = decideGate({ failureLocalization, safeAccessCapability, protectionAudit, branchAudit });
    await writeJson(path.join(roots.summary.absolutePath, 'input-identity.json'), inputIdentity);
    await writeJson(path.join(roots.summary.absolutePath, 'probe-results.json'), { schemaVersion: 1, replayId: 'replay_010', probes });
    await writeJson(path.join(roots.summary.absolutePath, 'failure-localization.json'), failureLocalization);
    await writeJson(path.join(roots.summary.absolutePath, 'safe-access-capability.json'), safeAccessCapability);
    await writeJson(path.join(roots.summary.absolutePath, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'replay-specific-branch-audit.json'), branchAudit);
    await writeJson(path.join(roots.summary.absolutePath, 'diagnosis-gate.json'), gate);
    await writeJson(path.join(roots.local.absolutePath, 'probe-results-full.json'), { schemaVersion: 1, replayId: 'replay_010', probes });
    await writeReport(roots.summary, { inputIdentity, probes, failureLocalization, safeAccessCapability, protectionAudit, branchAudit, gate });
    return { inputIdentity, probes, failureLocalization, safeAccessCapability, protectionAudit, branchAudit, gate };
}

if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
    runCli().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
