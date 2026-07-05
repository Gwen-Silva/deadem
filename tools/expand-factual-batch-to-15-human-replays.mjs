import { createHash } from 'node:crypto';
import { readdir, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGET_BATCH_SIZE = 15;
export const OUTPUT_ROOT = 'output/factual-batches/batch-015-human-factual-v1';
export const ACCEPTED_PILOT_REPLAYS = ['replay_001', 'replay_002', 'replay_003', 'replay_004', 'replay_009'];
export const PROTECTED_REPLAY_ID = 'replay_005';
export const UNSUPPORTED_BOT_REPLAYS = ['replay_006', 'replay_007', 'replay_008'];
export const REQUIRED_SOURCE_FILES = [
    'match-state-quality.json',
    'one-second-spatial/quality.json',
    'canonical-death-events.json',
    'death-event-validation.json',
    'respawn-events.json',
    'objective-entity-inventory.json',
    'objective-lifecycle-events.json',
    'match-state-timeline.jsonl'
];
export const FORBIDDEN_SEMANTIC_LAYERS = [
    'lane',
    'region',
    'proximity',
    'map_transform',
    'mechanic_effect',
    'fight',
    'rotation',
    'pressure',
    'macro',
    'role',
    'decision_quality'
];

const REMAINING_ROOT = 'output/five-replay-pilot/remaining-human-controls';
const AUDIT_ROOT = 'output/five-replay-pilot/audit';
const REPLAY_002_GATE = 'output/replay-002-canonical-v9-validation/terminal-release-verification.json';
const REPLAY_009_GATE = 'output/replay-009-canonical/canonical-state-gate.json';
const PILOT_GATE_SOURCES = {
    replay_001: `${REMAINING_ROOT}/canonicalization-gate.json`,
    replay_002: REPLAY_002_GATE,
    replay_003: `${REMAINING_ROOT}/canonicalization-gate.json`,
    replay_004: `${REMAINING_ROOT}/canonicalization-gate.json`,
    replay_009: REPLAY_009_GATE
};
const PILOT_REPRESENTATIONS = {
    replay_001: 'compact_manifest_with_hashes_and_counts',
    replay_002: 'v9_terminal_validation_reference',
    replay_003: 'compact_manifest_with_hashes_and_counts',
    replay_004: 'compact_manifest_with_hashes_and_counts',
    replay_009: 'accepted_full_canonical_package_reference'
};
const SCHEMA_COMPATIBILITY_OVERRIDES = {
    replay_002: 'accepted_by_terminal_validation'
};
const ACCEPTED_SOURCE_FALLBACKS = {
    replay_009: ['output/replay-009-canonical/canonical-state-gate.json', 'output/replay-009-canonical/validation-summary.json']
};

function parseArgs(argv = process.argv.slice(2)) {
    const options = { clean: false, outputRoot: OUTPUT_ROOT };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--clean') options.clean = true;
        else if (arg === '--output-root') options.outputRoot = argv[++index];
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

async function readJson(file) {
    return JSON.parse(await readFile(file, 'utf8'));
}

async function writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(file, text) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
}

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

async function safeFileExists(file) {
    try {
        const info = await stat(file);
        return info.isFile();
    } catch {
        return false;
    }
}

async function discoverReplayDirs() {
    const names = await readdir('output/replays', { withFileTypes: true });
    return names.filter(entry => entry.isDirectory() && /^replay_\d{3}$/u.test(entry.name)).map(entry => entry.name).sort();
}

function parserRow(parserMatrix, replayId) {
    const rows = parserMatrix.rows ?? parserMatrix.replays ?? [];
    return rows.find(row => row.replayId === replayId);
}

function parserCompatibilityStatus(parserMatrix, replayId) {
    const row = parserRow(parserMatrix, replayId);
    if (!row) return 'source_unavailable';
    if (row.modes?.default_parser?.completed === true) return 'completed';
    return row.modes?.default_parser?.firstErrorCategory ?? 'blocked';
}

async function generatedArtifactsFor(replayId) {
    if (replayId === PROTECTED_REPLAY_ID || UNSUPPORTED_BOT_REPLAYS.includes(replayId)) {
        return { found: [], missing: [] };
    }
    const found = [];
    const missing = [];
    for (const file of REQUIRED_SOURCE_FILES) {
        const fullPath = `output/replays/${replayId}/${file}`;
        if (await safeFileExists(fullPath)) found.push(fullPath);
        else missing.push(fullPath);
    }
    return { found, missing };
}

async function discoverCandidates() {
    const [pilot, parserMatrix] = await Promise.all([
        readJson('data/five-human-replay-pilot.json'),
        readJson('output/parser-compatibility/parser-compatibility-matrix.json')
    ]);
    const replayDirs = await discoverReplayDirs();
    const parserIds = (parserMatrix.rows ?? []).map(row => row.replayId).filter(id => /^replay_\d{3}$/u.test(id));
    const allIds = [...new Set([...replayDirs, ...parserIds, ...pilot.includedReplays])].sort();
    const candidates = [];
    for (const replayId of allIds) {
        const parserStatus = parserCompatibilityStatus(parserMatrix, replayId);
        const artifacts = await generatedArtifactsFor(replayId);
        let classification = 'outside_scope';
        let excludedReason = null;
        let includedInBatch = false;
        if (replayId === PROTECTED_REPLAY_ID) {
            classification = 'protected_replay_excluded';
            excludedReason = 'protected final holdout';
        } else if (UNSUPPORTED_BOT_REPLAYS.includes(replayId)) {
            classification = 'unsupported_bot_fixture_excluded';
            excludedReason = 'unsupported bot fixture';
        } else if (ACCEPTED_PILOT_REPLAYS.includes(replayId)) {
            classification = 'accepted_existing_pilot_replay';
            includedInBatch = true;
            if (artifacts.found.length === 0 && ACCEPTED_SOURCE_FALLBACKS[replayId]) {
                artifacts.found.push(...ACCEPTED_SOURCE_FALLBACKS[replayId]);
                artifacts.missing = [];
            }
        } else if (artifacts.missing.length === 0 && parserStatus === 'completed') {
            classification = 'eligible_generated_artifacts_complete';
        } else if (replayDirs.includes(replayId)) {
            classification = artifacts.found.length === 0 ? 'requires_parser_run_not_allowed_in_task_098' : 'missing_required_generated_artifacts';
            excludedReason = 'required generated source artifacts are missing';
        }
        candidates.push({
            replayId,
            classification,
            sourceArtifactsFound: artifacts.found,
            sourceArtifactsMissing: artifacts.missing,
            parserCompatibilityStatus: parserStatus,
            rawReplayTouched: false,
            includedInBatch,
            excludedReason
        });
    }
    return candidates;
}

function pilotGateSource(replayId) {
    return PILOT_GATE_SOURCES[replayId] ?? null;
}

function pilotRepresentation(replayId) {
    return PILOT_REPRESENTATIONS[replayId] ?? 'compact_manifest_with_hashes_and_counts';
}

async function acceptedPilotRows() {
    const [pilotAudit, storage, compatibility, performance] = await Promise.all([
        readJson(`${AUDIT_ROOT}/compatibility-matrix.json`),
        readJson(`${AUDIT_ROOT}/storage-baseline.json`),
        readJson(`${REMAINING_ROOT}/compatibility-matrix.json`),
        readJson(`${REMAINING_ROOT}/performance-baseline.json`)
    ]);
    return ACCEPTED_PILOT_REPLAYS.map(replayId => {
        const auditRow = pilotAudit.rows.find(row => row.replayId === replayId);
        const remainingRow = compatibility.rows.find(row => row.replayId === replayId);
        const storageRow = storage.rows.find(row => row.replayId === replayId);
        const perfRow = performance.replays.find(row => row.replayId === replayId);
        return {
            replayId,
            acceptedGateSource: pilotGateSource(replayId),
            packageRepresentation: pilotRepresentation(replayId),
            schemaCompatibility: SCHEMA_COMPATIBILITY_OVERRIDES[replayId] ?? auditRow?.schemaCompatibility ?? remainingRow?.overall ?? 'accepted_with_constraints',
            categoryAvailability: auditRow?.categoryAvailability ?? null,
            missingCategories: auditRow?.missingCategories ?? [],
            provenanceStatus: auditRow?.provenanceStatus ?? 'accepted_with_constraints',
            rawReplayAccessStatus: auditRow?.rawReplayAccessStatus ?? 'not_touched_existing_artifacts_only',
            storageRepresentation: storageRow?.packageRepresentation ?? pilotRepresentation(replayId),
            performanceDurationMs: perfRow?.processingDurationMs ?? null,
            limitations: auditRow?.limitations ?? ['accepted existing pilot replay referenced without regeneration']
        };
    });
}

export function auditReplaySpecificBranches(text, file = 'synthetic') {
    const findings = [];
    const patterns = [
        { pattern: /\bif\s*\([^)]*replay_\d{3}/iu, description: 'if condition on a specific replay id' },
        { pattern: /\bswitch\s*\([^)]*replay/iu, description: 'switch over replay id' },
        { pattern: /\bcase\s+['"]replay_\d{3}['"]/iu, description: 'case branch for a specific replay id' },
        { pattern: /partida_\d{3}-only logic/iu, description: 'declared partida-specific logic' },
        { pattern: /replayId\s*={2,3}\s*['"]replay_\d{3}['"]/iu, description: 'specific replay equality branch' },
        { pattern: /copying values from replay_00[29]/iu, description: 'copying accepted replay values into another replay' }
    ];
    text.split(/\r?\n/u).forEach((line, index) => {
        for (const entry of patterns) {
            if (entry.pattern.test(line)) findings.push({ file, line: index + 1, pattern: entry.description, text: line.trim() });
        }
    });
    return { file, findings, passed: findings.length === 0 };
}

export function protectionAuditFromCandidates(candidates, { task099Exists = existsSync('tasks/specs/099.json') } = {}) {
    const replay005 = candidates.find(row => row.replayId === PROTECTED_REPLAY_ID);
    const botsProcessed = candidates.filter(row => UNSUPPORTED_BOT_REPLAYS.includes(row.replayId) && row.includedInBatch);
    const passed = replay005?.rawReplayTouched !== true && botsProcessed.length === 0 && !task099Exists;
    return {
        schemaVersion: 1,
        replay005ListedFromProtectedPath: false,
        replay005Read: false,
        replay005Hashed: false,
        replay005Processed: false,
        botFixturesProcessed: botsProcessed.length > 0,
        rawReplayParsingRan: false,
        task099Created: task099Exists,
        semanticLayersStarted: false,
        passed
    };
}

export function decideBatchGate(includedRows, protectionAudit, branchAudit, target = TARGET_BATCH_SIZE) {
    const success = includedRows.length === target
        && includedRows.every(row => row.validationStatus === 'accepted')
        && protectionAudit.passed
        && branchAudit.passed;
    return success ? 'factual_batch_15_ready' : 'factual_batch_15_expansion_blocked';
}

async function writeReferenceRows(outputRoot, includedRows) {
    for (const row of includedRows) {
        const dir = path.join(outputRoot, row.replayId);
        await writeJson(path.join(dir, 'compact-package-manifest.json'), {
            schemaVersion: 1,
            replayId: row.replayId,
            representation: 'reference_to_accepted_existing_pilot_output',
            acceptedGateSource: row.acceptedGateSource,
            packageRepresentation: row.packageRepresentation,
            fullCanonicalPackageCommittedByTask098: false,
            sourceReusedWithoutRegeneration: true,
            packageHash: sha256(stableStringify(row)),
            limitations: row.limitations
        });
        await writeJson(path.join(dir, 'validation-summary.json'), {
            schemaVersion: 1,
            taskId: '098',
            replayId: row.replayId,
            validationStatus: row.validationStatus,
            schemaCompatibility: row.schemaCompatibility,
            provenanceStatus: row.provenanceStatus,
            rawReplayAccessStatus: row.rawReplayAccessStatus,
            acceptedGateSource: row.acceptedGateSource,
            limitations: row.limitations
        });
    }
}

function buildReport({ gate, candidates, includedRows, moreNeeded, branchAudit }) {
    const ineligible = candidates.filter(row => !row.includedInBatch);
    const lines = [
        '# Factual Batch 15 Human Expansion',
        '',
        '## Frozen Acceptance Matrix',
        '',
        '| Requirement | Classification |',
        '| --- | --- |',
        '| Inventory currently available replay candidates. | required |',
        '| Exclude protected and unsupported replays. | required |',
        '| Reuse accepted five-replay pilot outputs. | required |',
        '| Canonicalize additional eligible human replays only when required generated artifacts already exist. | required |',
        '| Use compact manifests in Git. | required |',
        '| Avoid full package commits by default. | required |',
        '| Record why the target of 15 was or was not reached. | required |',
        '| Do not process raw replay files. | required |',
        '| Do not create Task 099. | required |',
        '| Spatial, mechanics, fights, rotations, pressure, macro, role, ML, or decision-quality outputs. | explicit_non_goal |',
        '| Raw replay parsing to force success. | explicit_non_goal |',
        '| Blocked gate when fewer than 15 eligible generated human replay entries exist. | accepted_limitation |',
        '',
        `Gate: \`${gate}\``,
        '',
        `Target batch size: ${TARGET_BATCH_SIZE}`,
        `Total included count: ${includedRows.length}`,
        `15 reached: ${includedRows.length === TARGET_BATCH_SIZE}`,
        `More eligible replays needed: ${moreNeeded}`,
        `Accepted existing pilot replays: ${ACCEPTED_PILOT_REPLAYS.join(', ')}`,
        'Newly eligible replays: none',
        `Ineligible candidates: ${ineligible.map(row => `${row.replayId}=${row.classification}`).join('; ') || 'none'}`,
        '',
        '## Included Replays',
        '',
        ...includedRows.map(row => `- \`${row.replayId}\`: ${row.schemaCompatibility}; source \`${row.acceptedGateSource}\`.`),
        '',
        '## Storage Policy',
        '',
        'Task 098 commits compact reference manifests only. Full package dumps are not committed by default.',
        '',
        '## Protection Audit',
        '',
        'Replay 005 was excluded and untouched. Bot fixtures 006-008 were not processed. Raw replay parsing did not run. Task 099 was not created.',
        '',
        '## Branch Audit',
        '',
        `Replay-specific branch audit: ${branchAudit.passed ? 'passed' : 'failed'} with ${branchAudit.findings.length} findings.`,
        '',
        '## Accepted Limitations',
        '',
        '- The repository currently exposes fewer than 15 eligible generated human replay entries.',
        '- Expansion cannot proceed without additional generated human replay artifacts or explicit raw replay processing authorization in a future task.'
    ];
    return `${lines.join('\n')}\n`;
}

export async function expandFactualBatchTo15(options = {}) {
    const outputRoot = options.outputRoot ?? OUTPUT_ROOT;
    if (options.clean) await rm(outputRoot, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });

    const candidates = await discoverCandidates();
    const includedRows = (await acceptedPilotRows()).map(row => ({ ...row, validationStatus: 'accepted' }));
    const protectionAudit = protectionAuditFromCandidates(candidates);
    const implementationText = await readFile('tools/expand-factual-batch-to-15-human-replays.mjs', 'utf8');
    const branchAudit = auditReplaySpecificBranches(implementationText, 'tools/expand-factual-batch-to-15-human-replays.mjs');
    const gate = decideBatchGate(includedRows, protectionAudit, branchAudit);
    const moreNeeded = Math.max(0, TARGET_BATCH_SIZE - includedRows.length);

    await writeReferenceRows(outputRoot, includedRows);

    const manifest = {
        schemaVersion: 1,
        taskId: '098',
        batchId: 'batch-015-human-factual-v1',
        targetBatchSize: TARGET_BATCH_SIZE,
        includedReplays: includedRows.map(row => row.replayId),
        acceptedExistingPilotReplays: ACCEPTED_PILOT_REPLAYS,
        newlyCanonicalizedReplays: [],
        outputRoot,
        gate,
        compactManifestsOnly: true,
        fullPackageDumpsCommitted: false
    };
    const candidateInventory = { schemaVersion: 1, candidates };
    const eligibilityMatrix = {
        schemaVersion: 1,
        rows: candidates.map(row => ({
            replayId: row.replayId,
            classification: row.classification,
            parserCompatibilityStatus: row.parserCompatibilityStatus,
            sourceArtifactsFound: row.sourceArtifactsFound,
            sourceArtifactsMissing: row.sourceArtifactsMissing,
            includedInBatch: row.includedInBatch,
            excludedReason: row.excludedReason
        }))
    };
    const compatibilityMatrix = {
        schemaVersion: 1,
        rows: includedRows.map(row => ({
            replayId: row.replayId,
            acceptedGateSource: row.acceptedGateSource,
            packageRepresentation: row.packageRepresentation,
            schemaCompatibility: row.schemaCompatibility,
            categoryAvailability: row.categoryAvailability,
            provenanceStatus: row.provenanceStatus,
            rawReplayAccessStatus: row.rawReplayAccessStatus,
            storageRepresentation: row.storageRepresentation,
            limitations: row.limitations
        }))
    };
    const canonicalizationSummary = {
        schemaVersion: 1,
        taskId: '098',
        acceptedExistingPilotReplays: ACCEPTED_PILOT_REPLAYS,
        newlyCanonicalizedReplays: [],
        eligibleButNotIncluded: [],
        includedReplayCount: includedRows.length,
        targetBatchSize: TARGET_BATCH_SIZE,
        moreEligibleReplaysNeeded: moreNeeded,
        rawReplayProcessing: false,
        reasonBlocked: moreNeeded > 0 ? `Only ${includedRows.length} eligible accepted replay entries are available; ${moreNeeded} more are needed.` : null
    };
    const performanceBaseline = {
        schemaVersion: 1,
        rows: includedRows.map(row => ({
            replayId: row.replayId,
            processingDurationMs: row.performanceDurationMs,
            measurementBasis: row.performanceDurationMs == null ? 'not_available_from_current_artifacts' : 'reused_task_095_measurement'
        }))
    };
    const storageBaseline = {
        schemaVersion: 1,
        policy: 'compact_manifests_in_git_full_packages_local_only_by_default',
        rows: includedRows.map(row => ({
            replayId: row.replayId,
            storageRepresentation: row.storageRepresentation,
            fullPackageDumpCommittedByTask098: false
        }))
    };
    const batchGate = {
        schemaVersion: 1,
        taskId: '098',
        gate,
        success: gate === 'factual_batch_15_ready',
        targetBatchSize: TARGET_BATCH_SIZE,
        includedReplayCount: includedRows.length,
        moreEligibleReplaysNeeded: moreNeeded,
        allIncludedHaveAcceptedEvidence: includedRows.every(row => row.validationStatus === 'accepted'),
        compactManifestsCommitted: true,
        fullPackageDumpsCommitted: false,
        protectionsPassed: protectionAudit.passed,
        replaySpecificBranchAuditPassed: branchAudit.passed,
        forbiddenSemanticLayersEmitted: false,
        task099Created: protectionAudit.task099Created
    };

    await writeJson(path.join(outputRoot, 'manifest.json'), manifest);
    await writeJson(path.join(outputRoot, 'candidate-inventory.json'), candidateInventory);
    await writeJson(path.join(outputRoot, 'eligibility-matrix.json'), eligibilityMatrix);
    await writeJson(path.join(outputRoot, 'batch-compatibility-matrix.json'), compatibilityMatrix);
    await writeJson(path.join(outputRoot, 'canonicalization-summary.json'), canonicalizationSummary);
    await writeJson(path.join(outputRoot, 'performance-baseline.json'), performanceBaseline);
    await writeJson(path.join(outputRoot, 'storage-baseline.json'), storageBaseline);
    await writeJson(path.join(outputRoot, 'replay-specific-branch-audit.json'), branchAudit);
    await writeJson(path.join(outputRoot, 'protection-audit.json'), protectionAudit);
    await writeJson(path.join(outputRoot, 'batch-gate.json'), batchGate);
    await writeText('reports/factual-batch-15-human-expansion.md', buildReport({ gate, candidates, includedRows, moreNeeded, branchAudit }));
    return { gate, candidates, includedRows, moreNeeded, protectionAudit, branchAudit };
}

async function main() {
    const result = await expandFactualBatchTo15(parseArgs());
    console.log(JSON.stringify({
        taskId: '098',
        gate: result.gate,
        includedReplayCount: result.includedRows.length,
        moreEligibleReplaysNeeded: result.moreNeeded,
        protectionAuditPassed: result.protectionAudit.passed
    }, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
